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

// Join videos
ipcMain.handle('join-videos', async (event, videoPaths, outputPath) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
        const command = ffmpeg();

        videoPaths.forEach(videoPath => {
            command.input(videoPath);
        });

        command
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject(new Error(err.message || 'Failed to join videos'));
            })
            .mergeToFile(outputPath);
    });
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

// Crop video - crops video to specified region
ipcMain.handle('crop-video', async (event, inputPath, outputPath, cropParams) => {
    const { x, y, width, height } = cropParams;
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilter(`crop=${width}:${height}:${x}:${y}`)
            .output(outputPath)
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject(new Error(err.message || 'Failed to crop video'));
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
