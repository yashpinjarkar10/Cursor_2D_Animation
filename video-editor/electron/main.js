const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const axios = require('axios');

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let config;

// Track active generation tasks
const activeGenerations = new Map();

// Load configuration
async function loadConfig() {
    try {
        const configPath = path.join(__dirname, '..', 'config.json');
        const configData = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(configData);
    } catch (error) {
        console.error('Failed to load config:', error);
        config = { VIDEO_GENERATION_URL: 'http://localhost:8000' };
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false, // Allow loading local file:// URLs for video playback
        },
        backgroundColor: '#1a1a1a',
        show: false,
    });

    // Create application menu
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'Session',
            submenu: [
                {
                    label: 'Refresh (Keep Session)',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.webContents.send('session-refresh', { keepSession: true });
                    }
                },
                {
                    label: 'Hard Refresh (New Session)',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => {
                        mainWindow.webContents.send('session-refresh', { keepSession: false });
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    // Load the app
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

app.whenReady().then(async () => {
    await loadConfig();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers

// Get configuration
ipcMain.handle('get-config', async () => {
    return config;
});

// Generate video from backend - Non-blocking with progress updates
// Backend returns FileResponse (binary video file), not JSON
ipcMain.handle('generate-video', async (event, prompt, generationId, sessionId) => {
    // Start generation in background and return immediately
    const taskId = generationId || `gen_${Date.now()}`;
    
    // Mark as in progress
    activeGenerations.set(taskId, { status: 'generating', prompt, sessionId, cancelled: false });
    
    // Send initial progress
    mainWindow.webContents.send('generation-progress', {
        taskId,
        status: 'generating',
        message: 'Connecting to backend...',
        progress: 0
    });
    
    // Run generation in background
    (async () => {
        try {
            // Check if cancelled
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled before start:', taskId);
                return;
            }
            
            // Send progress update
            mainWindow.webContents.send('generation-progress', {
                taskId,
                status: 'generating',
                message: 'Generating video from AI...',
                progress: 20
            });
            
            // Create directories in session folder (inside video-editor/temp_folder)
            const tempFolder = path.join(__dirname, '..', 'temp_folder');
            const sessionPath = path.join(tempFolder, sessionId || 'default');
            const videosDir = path.join(sessionPath, 'videos');
            const codeDir = path.join(sessionPath, 'code');
            await fs.mkdir(videosDir, { recursive: true });
            await fs.mkdir(codeDir, { recursive: true });
            
            // Generate unique filename
            const timestamp = Date.now();
            const safePrompt = prompt.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
            const videoFilename = `video_${safePrompt}_${timestamp}.mp4`;
            const videoPath = path.join(videosDir, videoFilename);
            
            // Check if cancelled before making request
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled before backend request:', taskId);
                return;
            }
            
            mainWindow.webContents.send('generation-progress', {
                taskId,
                status: 'generating',
                message: 'Waiting for backend response...',
                progress: 40
            });
            
            // Make request with responseType: 'arraybuffer' to get binary data
            const response = await axios.post(
                `${config.VIDEO_GENERATION_URL}/generate`,
                { query: prompt },
                { 
                    responseType: 'arraybuffer',
                    timeout: 300000, // 5 minutes timeout for video generation
                }
            );
            
            // Check if cancelled after backend response - DO NOT save if cancelled
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled after backend response, not saving:', taskId);
                return;
            }
            
            mainWindow.webContents.send('generation-progress', {
                taskId,
                status: 'generating',
                message: 'Saving video file...',
                progress: 80
            });
            
            // Save the video file
            await fs.writeFile(videoPath, Buffer.from(response.data));
            
            // Extract code file path from headers
            const codeFilePath = response.headers['x-code-file-path'] || '';
            // Extract just the filename from the path
            const codeFilename = codeFilePath ? path.basename(codeFilePath) : null;
            
            console.log('Video saved to:', videoPath);
            console.log('Code file path from headers:', codeFilePath);
            
            // Check if cancelled before fetching code
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled after video save, cleaning up:', taskId);
                // Clean up the saved video file
                try {
                    await fs.unlink(videoPath);
                } catch (e) {}
                return;
            }
            
            // Fetch and save the code file to session directory
            let localCodePath = null;
            if (codeFilename) {
                try {
                    const codeResponse = await axios.get(
                        `${config.VIDEO_GENERATION_URL}/get_code/${encodeURIComponent(codeFilename)}`
                    );
                    if (codeResponse.data && codeResponse.data.code) {
                        const codeFilenameLocal = `code_${safePrompt}_${timestamp}.py`;
                        localCodePath = path.join(codeDir, codeFilenameLocal);
                        await fs.writeFile(localCodePath, codeResponse.data.code);
                        console.log('Code saved to:', localCodePath);
                    }
                } catch (codeError) {
                    console.warn('Could not fetch/save code file:', codeError.message);
                }
            }
            
            // Final check if cancelled before sending completion
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled before completion, cleaning up:', taskId);
                // Clean up saved files
                try {
                    await fs.unlink(videoPath);
                    if (localCodePath) await fs.unlink(localCodePath);
                } catch (e) {}
                return;
            }
            
            // Mark as complete
            activeGenerations.delete(taskId);
            
            // Send completion event
            mainWindow.webContents.send('generation-complete', {
                taskId,
                success: true,
                videoPath: videoPath,
                codeFilename: codeFilename,
                localCodePath: localCodePath,
                prompt: prompt
            });
            
        } catch (error) {
            // Check if cancelled - don't send error if cancelled
            if (!activeGenerations.has(taskId)) {
                console.log('Generation cancelled during error handling:', taskId);
                return;
            }
            
            console.error('Generate video error:', error.message);
            
            // Try to extract error message from response if available
            let errorMessage = error.message;
            if (error.response && error.response.data) {
                try {
                    const errorData = JSON.parse(Buffer.from(error.response.data).toString());
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    // Response wasn't JSON, use original error
                }
            }
            
            // Mark as failed
            activeGenerations.delete(taskId);
            
            // Send error event
            mainWindow.webContents.send('generation-complete', {
                taskId,
                success: false,
                error: errorMessage,
                prompt: prompt
            });
        }
    })();
    
    // Return immediately with task ID
    return {
        taskId,
        status: 'started',
        message: 'Video generation started'
    };
});

// Cancel a generation task
ipcMain.handle('cancel-generation', async (event, taskId) => {
    if (activeGenerations.has(taskId)) {
        activeGenerations.delete(taskId);
        console.log('Generation task cancelled:', taskId);
        return { success: true };
    }
    return { success: false, error: 'Task not found' };
});

// Read a local file
ipcMain.handle('read-local-file', async (event, filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Load session files (videos and code) from session directory
ipcMain.handle('load-session-files', async (event, sessionId) => {
    try {
        const tempFolder = path.join(__dirname, '..', 'temp_folder');
        const sessionPath = path.join(tempFolder, sessionId);
        const videosDir = path.join(sessionPath, 'videos');
        const codeDir = path.join(sessionPath, 'code');
        const rendersDir = path.join(sessionPath, 'renders');
        
        const result = {
            videos: [],
            code: [],
            renders: []
        };
        
        // Load videos
        try {
            const videoFiles = await fs.readdir(videosDir);
            for (const file of videoFiles) {
                if (file.endsWith('.mp4')) {
                    const videoPath = path.join(videosDir, file);
                    result.videos.push({
                        name: file,
                        path: videoPath,
                        type: 'video'
                    });
                }
            }
        } catch (e) {
            // Videos directory doesn't exist or is empty
        }
        
        // Load code files
        try {
            const codeFiles = await fs.readdir(codeDir);
            for (const file of codeFiles) {
                if (file.endsWith('.py')) {
                    const codePath = path.join(codeDir, file);
                    const content = await fs.readFile(codePath, 'utf-8');
                    result.code.push({
                        name: file,
                        path: codePath,
                        content: content
                    });
                }
            }
        } catch (e) {
            // Code directory doesn't exist or is empty
        }
        
        // Load rendered videos
        try {
            const renderFiles = await fs.readdir(rendersDir);
            for (const file of renderFiles) {
                if (file.endsWith('.mp4')) {
                    const renderPath = path.join(rendersDir, file);
                    result.renders.push({
                        name: file,
                        path: renderPath,
                        type: 'video'
                    });
                }
            }
        } catch (e) {
            // Renders directory doesn't exist or is empty
        }
        
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Get code file from backend
ipcMain.handle('get-code-file', async (event, filename) => {
    try {
        // Backend endpoint is GET /get_code/{filename}
        const response = await axios.get(`${config.VIDEO_GENERATION_URL}/get_code/${encodeURIComponent(filename)}`);

        return {
            success: true,
            code: response.data.code,
            filename: response.data.filename,
            path: response.data.path,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
});

// Create session directory in temp_folder (inside video-editor)
ipcMain.handle('create-session', async (event, sessionId) => {
    try {
        const tempFolder = path.join(__dirname, '..', 'temp_folder');
        
        // Clean up old sessions before creating new one
        try {
            const exists = await fs.access(tempFolder).then(() => true).catch(() => false);
            if (exists) {
                const entries = await fs.readdir(tempFolder, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name !== sessionId) {
                        const oldSessionPath = path.join(tempFolder, entry.name);
                        console.log('Cleaning up old session:', oldSessionPath);
                        await fs.rm(oldSessionPath, { recursive: true, force: true });
                    }
                }
            }
        } catch (cleanupError) {
            console.warn('Error cleaning up old sessions:', cleanupError.message);
        }
        
        const sessionPath = path.join(tempFolder, sessionId);
        await fs.mkdir(sessionPath, { recursive: true });
        await fs.mkdir(path.join(sessionPath, 'videos'), { recursive: true });
        await fs.mkdir(path.join(sessionPath, 'renders'), { recursive: true });
        await fs.mkdir(path.join(sessionPath, 'code'), { recursive: true });

        return {
            success: true,
            sessionPath,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
});

// Clear all session data
ipcMain.handle('clear-session', async (event, sessionId) => {
    try {
        const tempFolder = path.join(__dirname, '..', 'temp_folder');
        const sessionPath = path.join(tempFolder, sessionId);
        await fs.rm(sessionPath, { recursive: true, force: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Clear all generated videos
ipcMain.handle('clear-generated-videos', async () => {
    try {
        const tempFolder = path.join(__dirname, '..', 'temp_folder');
        // Clear all session folders
        const exists = await fs.access(tempFolder).then(() => true).catch(() => false);
        if (exists) {
            await fs.rm(tempFolder, { recursive: true, force: true });
        }
        await fs.mkdir(tempFolder, { recursive: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Save file to session
ipcMain.handle('save-to-session', async (event, sessionId, filename, content) => {
    try {
        const tempFolder = path.join(__dirname, '..', 'temp_folder');
        const sessionPath = path.join(tempFolder, sessionId);
        const filePath = path.join(sessionPath, filename);
        await fs.writeFile(filePath, content);

        return {
            success: true,
            filePath,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
});

// Render Manim code via backend API - Non-blocking with progress updates
ipcMain.handle('render-manim', async (event, sessionId, code, sceneName = 'Scene1') => {
    // Start render in background and return immediately
    const taskId = `render_${Date.now()}`;
    
    // Mark as in progress
    activeGenerations.set(taskId, { status: 'rendering', code, sceneName, sessionId, cancelled: false });
    
    // Send initial progress
    mainWindow.webContents.send('render-progress', {
        taskId,
        status: 'rendering',
        message: 'Preparing to render...',
        progress: 0,
        sceneName
    });
    
    // Return taskId immediately so UI can track progress
    // Run rendering in background
    (async () => {
        try {
            const tempFolder = path.join(__dirname, '..', 'temp_folder');
            const sessionPath = path.join(tempFolder, sessionId);
            const rendersPath = path.join(sessionPath, 'renders');
            const codePath = path.join(sessionPath, 'code');

            // Ensure directories exist
            await fs.mkdir(rendersPath, { recursive: true });
            await fs.mkdir(codePath, { recursive: true });

            // Generate filename based on timestamp
            const timestamp = Date.now();
            const filename = `render_${timestamp}`;

            // Check if cancelled before making request
            if (!activeGenerations.has(taskId)) {
                console.log('Render cancelled before backend request:', taskId);
                return;
            }

            // Send progress update
            mainWindow.webContents.send('render-progress', {
                taskId,
                status: 'rendering',
                message: 'Sending code to backend for rendering...',
                progress: 20,
                sceneName
            });

            // Call the backend /render endpoint
            const response = await axios.post(
                `${config.VIDEO_GENERATION_URL}/render`,
                {
                    filename: filename,
                    code: code,
                    SceneName: sceneName
                },
                {
                    responseType: 'arraybuffer',
                    timeout: 300000 // 5 minute timeout
                }
            );

            // Check if cancelled after backend response
            if (!activeGenerations.has(taskId)) {
                console.log('Render cancelled after backend response:', taskId);
                return;
            }

            mainWindow.webContents.send('render-progress', {
                taskId,
                status: 'rendering',
                message: 'Video received, saving...',
                progress: 80,
                sceneName
            });

            // Save the video file
            const videoPath = path.join(rendersPath, `${filename}.mp4`);
            await fs.writeFile(videoPath, Buffer.from(response.data));

            // Save the code file
            const codeFilePath = path.join(codePath, `${filename}.py`);
            await fs.writeFile(codeFilePath, code);

            // Check for code file path in headers
            const codeFilePathHeader = response.headers['x-code-file-path'];
            
            // Final check if cancelled before sending completion
            if (!activeGenerations.has(taskId)) {
                console.log('Render cancelled before completion, cleaning up:', taskId);
                try {
                    await fs.unlink(videoPath);
                    await fs.unlink(codeFilePath);
                } catch (e) {}
                return;
            }

            // Mark as complete
            activeGenerations.delete(taskId);

            // Send completion event
            mainWindow.webContents.send('render-complete', {
                taskId,
                success: true,
                videoPath: videoPath,
                codeFilePath: codeFilePathHeader || codeFilePath,
                sceneName: sceneName
            });

        } catch (error) {
            // Check if cancelled - don't send error if cancelled
            if (!activeGenerations.has(taskId)) {
                console.log('Render cancelled during error handling:', taskId);
                return;
            }

            console.error('Render error:', error.message);
            
            const errorMessage = error.response?.data 
                ? Buffer.from(error.response.data).toString('utf-8')
                : error.message;
            
            activeGenerations.delete(taskId);
            
            mainWindow.webContents.send('render-complete', {
                taskId,
                success: false,
                error: errorMessage,
                sceneName: sceneName
            });
        }
    })();
    
    // Return taskId immediately
    return { taskId, status: 'started' };
});

// Trim video
ipcMain.handle('trim-video', async (event, inputPath, outputPath, startTime, duration) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .outputOptions('-c:v libx264')
            .outputOptions('-preset fast')
            .outputOptions('-crf 23')
            .outputOptions('-c:a aac')
            .output(outputPath)
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject(new Error(err.message || 'Failed to trim video'));
            })
            .run();
    });
});

// Join videos - using concat demuxer for reliable joining
ipcMain.handle('join-videos', async (event, videoPaths, outputPath) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // First, normalize all videos to the same format
    const normalizedPaths = [];
    const tempDir = path.join(outputDir, 'temp_concat');
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
        // Step 1: Re-encode each video to ensure compatibility
        for (let i = 0; i < videoPaths.length; i++) {
            const inputPath = videoPaths[i];
            const normalizedPath = path.join(tempDir, `normalized_${i}.mp4`);
            
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .outputOptions('-c:v libx264')
                    .outputOptions('-preset fast')
                    .outputOptions('-crf 23')
                    .outputOptions('-c:a aac')
                    .outputOptions('-ar 44100')
                    .outputOptions('-ac 2')
                    .outputOptions('-r 30') // Normalize frame rate
                    .outputOptions('-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2')
                    .output(normalizedPath)
                    .on('end', () => {
                        normalizedPaths.push(normalizedPath);
                        resolve();
                    })
                    .on('error', (err) => {
                        reject(new Error(`Failed to normalize video ${i}: ${err.message}`));
                    })
                    .run();
            });
        }
        
        // Step 2: Create concat list file
        const concatListPath = path.join(tempDir, 'concat_list.txt');
        const concatContent = normalizedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        await fs.writeFile(concatListPath, concatContent);
        
        // Step 3: Concatenate using concat demuxer
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions('-f', 'concat')
                .inputOptions('-safe', '0')
                .outputOptions('-c', 'copy')
                .output(outputPath)
                .on('end', async () => {
                    // Cleanup temp files
                    try {
                        await fs.rm(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                    resolve({ success: true, outputPath });
                })
                .on('error', async (err) => {
                    try {
                        await fs.rm(tempDir, { recursive: true, force: true });
                    } catch (e) {}
                    reject(new Error(err.message || 'Failed to join videos'));
                })
                .run();
        });
    } catch (error) {
        // Cleanup on error
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (e) {}
        throw error;
    }
});

// Add audio to video
ipcMain.handle('add-audio', async (event, videoPath, audioPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .input(audioPath)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .output(outputPath)
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject(new Error(err.message || 'Failed to add audio'));
            })
            .run();
    });
});

// Export video with quality settings - Non-blocking with progress updates
ipcMain.handle('export-video', async (event, inputPath, outputPath, options = {}, sessionId = null) => {
    const taskId = `export_${Date.now()}`;
    
    const {
        quality = 'high',
        aspectRatio = '16:9',
        resolution,
    } = options;

    // Mark as in progress
    activeGenerations.set(taskId, { status: 'exporting', inputPath, outputPath, sessionId });
    
    // Send initial progress
    mainWindow.webContents.send('export-progress', {
        taskId,
        status: 'exporting',
        message: 'Starting export...',
        progress: 0
    });

    // Run export in background
    (async () => {
        try {
            // Check if cancelled
            if (!activeGenerations.has(taskId)) {
                console.log('Export cancelled before start:', taskId);
                return;
            }

            await new Promise((resolve, reject) => {
                const command = ffmpeg(inputPath);

                // Set quality
                if (quality === 'high') {
                    command.videoBitrate('5000k');
                } else if (quality === 'medium') {
                    command.videoBitrate('2500k');
                } else {
                    command.videoBitrate('1000k');
                }

                // Set resolution if specified
                if (resolution) {
                    command.size(resolution);
                }

                // Set aspect ratio
                command.aspect(aspectRatio);

                command
                    .output(outputPath)
                    .on('progress', (progress) => {
                        if (!activeGenerations.has(taskId)) {
                            command.kill('SIGKILL');
                            return;
                        }
                        mainWindow.webContents.send('export-progress', {
                            taskId,
                            status: 'exporting',
                            message: `Exporting: ${Math.round(progress.percent || 0)}%`,
                            progress: progress.percent || 0
                        });
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .run();
            });

            // Check if cancelled after export
            if (!activeGenerations.has(taskId)) {
                console.log('Export cancelled after completion:', taskId);
                try { await fs.unlink(outputPath); } catch (e) {}
                return;
            }

            // Save a copy to session folder if sessionId provided
            let sessionCopyPath = null;
            if (sessionId) {
                const tempFolder = path.join(__dirname, '..', 'temp_folder');
                const sessionPath = path.join(tempFolder, sessionId);
                const exportsDir = path.join(sessionPath, 'exports');
                await fs.mkdir(exportsDir, { recursive: true });
                
                const exportFilename = `export_${Date.now()}.mp4`;
                sessionCopyPath = path.join(exportsDir, exportFilename);
                await fs.copyFile(outputPath, sessionCopyPath);
                console.log('Export copy saved to session:', sessionCopyPath);
            }

            // Mark as complete
            activeGenerations.delete(taskId);

            // Send completion event
            mainWindow.webContents.send('export-complete', {
                taskId,
                success: true,
                outputPath: outputPath,
                sessionCopyPath: sessionCopyPath
            });

        } catch (error) {
            if (!activeGenerations.has(taskId)) {
                console.log('Export cancelled during error handling:', taskId);
                return;
            }

            console.error('Export error:', error.message);
            activeGenerations.delete(taskId);

            mainWindow.webContents.send('export-complete', {
                taskId,
                success: false,
                error: error.message
            });
        }
    })();

    // Return taskId immediately
    return { taskId, status: 'started' };
});

// Select file dialog
ipcMain.handle('select-file', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});

// Save file dialog
ipcMain.handle('save-file', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});

// Advanced export with text overlays and audio - comprehensive export function
ipcMain.handle('export-with-overlays', async (event, exportData) => {
    const taskId = `export_${Date.now()}`;
    const {
        clips = [],
        textOverlays = [],
        audioClips = [],
        outputPath,
        options = {},
        sessionId
    } = exportData;
    
    const { quality = 'high' } = options;
    
    // Mark as in progress
    activeGenerations.set(taskId, { status: 'exporting', sessionId });
    
    // Send initial progress
    mainWindow.webContents.send('export-progress', {
        taskId,
        status: 'exporting',
        message: 'Starting export...',
        progress: 0
    });
    
    // Run export in background
    (async () => {
        const tempDir = path.join(path.dirname(outputPath), `temp_export_${taskId}`);
        
        try {
            await fs.mkdir(tempDir, { recursive: true });
            
            if (!activeGenerations.has(taskId)) {
                console.log('Export cancelled before start:', taskId);
                return;
            }
            
            // Calculate total duration based on clips
            let totalDuration = 0;
            const clipTimings = [];
            for (const clip of clips) {
                const trimStart = clip.trimStart || 0;
                const trimEnd = clip.trimEnd || clip.duration || 0;
                const clipDuration = trimEnd - trimStart;
                clipTimings.push({
                    ...clip,
                    startOnTimeline: totalDuration,
                    trimStart,
                    trimEnd,
                    clipDuration
                });
                totalDuration += clipDuration;
            }
            
            mainWindow.webContents.send('export-progress', {
                taskId,
                status: 'exporting',
                message: 'Processing video clips...',
                progress: 10
            });
            
            // Step 1: Trim and normalize each clip
            const normalizedClips = [];
            for (let i = 0; i < clipTimings.length; i++) {
                const clip = clipTimings[i];
                const videoPath = clip.videoPath || clip.videoUrl;
                if (!videoPath) continue;
                
                const normalizedPath = path.join(tempDir, `clip_${i}.mp4`);
                
                await new Promise((resolve, reject) => {
                    let command = ffmpeg(videoPath);
                    
                    // Apply trim if needed
                    if (clip.trimStart > 0) {
                        command = command.setStartTime(clip.trimStart);
                    }
                    if (clip.clipDuration > 0) {
                        command = command.setDuration(clip.clipDuration);
                    }
                    
                    command
                        .outputOptions('-c:v libx264')
                        .outputOptions('-preset fast')
                        .outputOptions('-crf', quality === 'high' ? '18' : quality === 'medium' ? '23' : '28')
                        .outputOptions('-c:a aac')
                        .outputOptions('-ar 44100')
                        .outputOptions('-ac 2')
                        .outputOptions('-r 30')
                        .outputOptions('-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2')
                        .output(normalizedPath)
                        .on('end', () => {
                            normalizedClips.push(normalizedPath);
                            resolve();
                        })
                        .on('error', (err) => {
                            reject(new Error(`Failed to process clip ${i}: ${err.message}`));
                        })
                        .run();
                });
                
                mainWindow.webContents.send('export-progress', {
                    taskId,
                    status: 'exporting',
                    message: `Processing clip ${i + 1}/${clipTimings.length}...`,
                    progress: 10 + (30 * (i + 1) / clipTimings.length)
                });
            }
            
            if (!activeGenerations.has(taskId)) {
                await fs.rm(tempDir, { recursive: true, force: true });
                return;
            }
            
            // Step 2: Concatenate clips
            let concatenatedPath = path.join(tempDir, 'concatenated.mp4');
            
            if (normalizedClips.length > 1) {
                mainWindow.webContents.send('export-progress', {
                    taskId,
                    status: 'exporting',
                    message: 'Joining video clips...',
                    progress: 45
                });
                
                const concatListPath = path.join(tempDir, 'concat_list.txt');
                const concatContent = normalizedClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
                await fs.writeFile(concatListPath, concatContent);
                
                await new Promise((resolve, reject) => {
                    ffmpeg()
                        .input(concatListPath)
                        .inputOptions('-f', 'concat')
                        .inputOptions('-safe', '0')
                        .outputOptions('-c', 'copy')
                        .output(concatenatedPath)
                        .on('end', resolve)
                        .on('error', (err) => reject(new Error(`Failed to concatenate: ${err.message}`)))
                        .run();
                });
            } else if (normalizedClips.length === 1) {
                concatenatedPath = normalizedClips[0];
            } else {
                throw new Error('No valid video clips to export');
            }
            
            if (!activeGenerations.has(taskId)) {
                await fs.rm(tempDir, { recursive: true, force: true });
                return;
            }
            
            // Step 3: Add text overlays if any
            let videoWithText = concatenatedPath;
            if (textOverlays.length > 0) {
                mainWindow.webContents.send('export-progress', {
                    taskId,
                    status: 'exporting',
                    message: 'Adding text overlays...',
                    progress: 55
                });
                
                videoWithText = path.join(tempDir, 'with_text.mp4');
                
                // Build drawtext filter for each text overlay
                const drawtextFilters = textOverlays.map((text, index) => {
                    const startTime = text.startTime || 0;
                    const endTime = startTime + (text.duration || 3);
                    const x = text.x || 50;
                    const y = text.y || 50;
                    const fontSize = text.fontSize || 32;
                    const color = (text.color || '#ffffff').replace('#', '');
                    const textContent = (text.text || '').replace(/'/g, "\\'").replace(/:/g, "\\:");
                    
                    // Convert percentage to pixel position (for 1920x1080)
                    const xPos = `(w*${x/100})-(tw/2)`;
                    const yPos = `(h*${y/100})-(th/2)`;
                    
                    return `drawtext=text='${textContent}':fontsize=${fontSize}:fontcolor=0x${color}:x=${xPos}:y=${yPos}:enable='between(t,${startTime},${endTime})'`;
                }).join(',');
                
                await new Promise((resolve, reject) => {
                    ffmpeg(concatenatedPath)
                        .outputOptions('-vf', drawtextFilters)
                        .outputOptions('-c:v libx264')
                        .outputOptions('-preset fast')
                        .outputOptions('-crf', quality === 'high' ? '18' : quality === 'medium' ? '23' : '28')
                        .outputOptions('-c:a copy')
                        .output(videoWithText)
                        .on('end', resolve)
                        .on('error', (err) => reject(new Error(`Failed to add text: ${err.message}`)))
                        .run();
                });
            }
            
            if (!activeGenerations.has(taskId)) {
                await fs.rm(tempDir, { recursive: true, force: true });
                return;
            }
            
            // Step 4: Mix audio if any audio clips exist
            let finalOutput = videoWithText;
            if (audioClips.length > 0) {
                mainWindow.webContents.send('export-progress', {
                    taskId,
                    status: 'exporting',
                    message: 'Mixing audio...',
                    progress: 70
                });
                
                finalOutput = path.join(tempDir, 'with_audio.mp4');
                
                // First, check if video has audio track using ffprobe
                const hasVideoAudio = await new Promise((resolve) => {
                    ffmpeg.ffprobe(videoWithText, (err, metadata) => {
                        if (err) {
                            resolve(false);
                            return;
                        }
                        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
                        resolve(audioStreams.length > 0);
                    });
                });
                
                // Build complex audio filter for mixing multiple audio tracks
                let command = ffmpeg(videoWithText);
                
                // Add all audio inputs, trimming to video duration
                const audioInputs = [];
                for (let i = 0; i < audioClips.length; i++) {
                    const audio = audioClips[i];
                    const audioPath = audio.audioPath || audio.path;
                    if (audioPath) {
                        command = command.input(audioPath);
                        
                        const audioStartTime = audio.startTime || 0;
                        const trimStart = audio.trimStart || 0;
                        let trimEnd = audio.trimEnd || audio.duration || 10;
                        
                        // Calculate effective audio end time on timeline
                        const audioEndOnTimeline = audioStartTime + (trimEnd - trimStart);
                        
                        // Trim audio if it extends beyond video duration
                        if (audioEndOnTimeline > totalDuration) {
                            const excessTime = audioEndOnTimeline - totalDuration;
                            trimEnd = trimEnd - excessTime;
                        }
                        
                        // Only add audio if it has valid duration after trimming
                        if (trimEnd > trimStart && audioStartTime < totalDuration) {
                            audioInputs.push({
                                index: i + 1, // 0 is the video
                                audio,
                                startTime: audioStartTime,
                                trimStart: trimStart,
                                trimEnd: trimEnd
                            });
                        }
                    }
                }
                
                if (audioInputs.length > 0) {
                    // Build filter complex for audio mixing with delays and trimming
                    const filterParts = [];
                    const mixInputs = [];
                    
                    // If video has audio, include it in the mix
                    if (hasVideoAudio) {
                        mixInputs.push('[0:a]');
                    }
                    
                    audioInputs.forEach((audioInput, idx) => {
                        const inputLabel = `[${audioInput.index}:a]`;
                        const outputLabel = `[a${idx}]`;
                        const delayMs = Math.round(audioInput.startTime * 1000);
                        const trimStart = audioInput.trimStart;
                        const trimEnd = audioInput.trimEnd;
                        
                        // Trim and delay the audio
                        filterParts.push(`${inputLabel}atrim=${trimStart}:${trimEnd},adelay=${delayMs}|${delayMs},asetpts=PTS-STARTPTS${outputLabel}`);
                        mixInputs.push(outputLabel);
                    });
                    
                    // Build the final filter based on number of audio sources
                    if (mixInputs.length === 1) {
                        // Only one audio source, no mixing needed
                        const singleInput = mixInputs[0];
                        if (singleInput === '[0:a]') {
                            // Just video audio, copy it
                            filterParts.push(`[0:a]acopy[aout]`);
                        } else {
                            // Just the added audio clip
                            filterParts.push(`${singleInput}acopy[aout]`);
                        }
                    } else {
                        // Mix all audio tracks
                        const amixInput = mixInputs.join('');
                        filterParts.push(`${amixInput}amix=inputs=${mixInputs.length}:duration=longest[aout]`);
                    }
                    
                    await new Promise((resolve, reject) => {
                        command
                            .complexFilter(filterParts)
                            .outputOptions('-map', '0:v')
                            .outputOptions('-map', '[aout]')
                            .outputOptions('-c:v copy')
                            .outputOptions('-c:a aac')
                            .output(finalOutput)
                            .on('end', resolve)
                            .on('error', (err) => reject(new Error(`Failed to mix audio: ${err.message}`)))
                            .run();
                    });
                } else {
                    finalOutput = videoWithText;
                }
            }
            
            if (!activeGenerations.has(taskId)) {
                await fs.rm(tempDir, { recursive: true, force: true });
                return;
            }
            
            // Step 5: Copy to final output
            mainWindow.webContents.send('export-progress', {
                taskId,
                status: 'exporting',
                message: 'Finalizing export...',
                progress: 90
            });
            
            await fs.copyFile(finalOutput, outputPath);
            
            // Cleanup temp directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (e) {}
            
            // Mark as complete
            activeGenerations.delete(taskId);
            
            mainWindow.webContents.send('export-complete', {
                taskId,
                success: true,
                outputPath: outputPath
            });
            
        } catch (error) {
            // Cleanup on error
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (e) {}
            
            if (!activeGenerations.has(taskId)) {
                console.log('Export cancelled during error handling:', taskId);
                return;
            }
            
            console.error('Export error:', error.message);
            activeGenerations.delete(taskId);
            
            mainWindow.webContents.send('export-complete', {
                taskId,
                success: false,
                error: error.message
            });
        }
    })();
    
    return { taskId, status: 'started' };
});
