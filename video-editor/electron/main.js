const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const axios = require('axios');

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let config;

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

// Generate video from backend
// Backend returns FileResponse (binary video file), not JSON
ipcMain.handle('generate-video', async (event, prompt) => {
    try {
        // Create a directory to save downloaded videos
        const videosDir = path.join(app.getPath('userData'), 'backend_videos');
        await fs.mkdir(videosDir, { recursive: true });
        
        // Generate unique filename
        const timestamp = Date.now();
        const safePrompt = prompt.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        const videoFilename = `video_${safePrompt}_${timestamp}.mp4`;
        const videoPath = path.join(videosDir, videoFilename);
        
        // Make request with responseType: 'arraybuffer' to get binary data
        const response = await axios.post(
            `${config.VIDEO_GENERATION_URL}/generate`,
            { query: prompt },
            { 
                responseType: 'arraybuffer',
                timeout: 300000, // 5 minutes timeout for video generation
            }
        );
        
        // Save the video file
        await fs.writeFile(videoPath, Buffer.from(response.data));
        
        // Extract code file path from headers
        const codeFilePath = response.headers['x-code-file-path'] || '';
        // Extract just the filename from the path
        const codeFilename = codeFilePath ? path.basename(codeFilePath) : null;
        
        console.log('Video saved to:', videoPath);
        console.log('Code file path from headers:', codeFilePath);
        
        return {
            success: true,
            videoPath: videoPath,
            codeFilename: codeFilename,
        };
    } catch (error) {
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
        return {
            success: false,
            error: errorMessage,
        };
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

// Create session directory
ipcMain.handle('create-session', async (event, sessionId) => {
    try {
        const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
        await fs.mkdir(sessionPath, { recursive: true });
        await fs.mkdir(path.join(sessionPath, 'videos'), { recursive: true });
        await fs.mkdir(path.join(sessionPath, 'renders'), { recursive: true });

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

// Save file to session
ipcMain.handle('save-to-session', async (event, sessionId, filename, content) => {
    try {
        const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
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

// Render Manim code locally
ipcMain.handle('render-manim', async (event, sessionId, code, sceneName = 'CreateCircle') => {
    try {
        const sessionPath = path.join(app.getPath('userData'), 'sessions', sessionId);
        const venvPath = path.join(sessionPath, 'venv');
        const codePath = path.join(sessionPath, 'manim_code.py');

        // Save the code to a file
        await fs.writeFile(codePath, code);

        // Check if venv exists, if not create one
        const venvExists = await fs.access(venvPath).then(() => true).catch(() => false);

        if (!venvExists) {
            // Create venv
            await new Promise((resolve, reject) => {
                const createVenv = spawn('python', ['-m', 'venv', venvPath]);
                createVenv.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Failed to create venv'));
                });
            });

            // Install manim
            const pipPath = process.platform === 'win32'
                ? path.join(venvPath, 'Scripts', 'pip.exe')
                : path.join(venvPath, 'bin', 'pip');

            await new Promise((resolve, reject) => {
                const installManim = spawn(pipPath, ['install', 'manim']);
                installManim.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Failed to install manim'));
                });
            });
        }

        // Run manim
        const pythonPath = process.platform === 'win32'
            ? path.join(venvPath, 'Scripts', 'python.exe')
            : path.join(venvPath, 'bin', 'python');

        const outputPath = path.join(sessionPath, 'renders');

        return new Promise((resolve, reject) => {
            const manimProcess = spawn(pythonPath, [
                '-m', 'manim',
                '-pql',
                '--output_file', 'output',
                '--media_dir', outputPath,
                codePath,
                sceneName
            ]);

            let output = '';
            let errorOutput = '';

            manimProcess.stdout.on('data', (data) => {
                output += data.toString();
                mainWindow.webContents.send('manim-progress', data.toString());
            });

            manimProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            manimProcess.on('close', async (code) => {
                if (code === 0) {
                    // Find the generated video file - Manim creates nested folder structure
                    // videos/<quality>/<scene_name>.mp4
                    try {
                        const videosPath = path.join(outputPath, 'videos');
                        const qualityDirs = await fs.readdir(videosPath);
                        let videoFile = null;
                        
                        for (const dir of qualityDirs) {
                            const dirPath = path.join(videosPath, dir);
                            const stat = await fs.stat(dirPath);
                            if (stat.isDirectory()) {
                                const files = await fs.readdir(dirPath);
                                const mp4File = files.find(f => f.endsWith('.mp4'));
                                if (mp4File) {
                                    videoFile = path.join(dirPath, mp4File);
                                    break;
                                }
                            }
                        }
                        
                        if (videoFile) {
                            resolve({
                                success: true,
                                videoPath: videoFile,
                                output,
                            });
                        } else {
                            reject({
                                success: false,
                                error: 'Video file not found after rendering',
                            });
                        }
                    } catch (err) {
                        reject({
                            success: false,
                            error: `Failed to find video file: ${err.message}`,
                        });
                    }
                } else {
                    reject({
                        success: false,
                        error: errorOutput || output,
                    });
                }
            });
        });
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
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
                reject({ success: false, error: err.message });
            })
            .run();
    });
});

// Join videos
ipcMain.handle('join-videos', async (event, videoPaths, outputPath) => {
    return new Promise((resolve, reject) => {
        const command = ffmpeg();

        videoPaths.forEach(path => {
            command.input(path);
        });

        command
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject({ success: false, error: err.message });
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
                reject({ success: false, error: err.message });
            })
            .run();
    });
});

// Export video with quality settings
ipcMain.handle('export-video', async (event, inputPath, outputPath, options = {}) => {
    const {
        quality = 'high',
        aspectRatio = '16:9',
        resolution,
    } = options;

    return new Promise((resolve, reject) => {
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
                mainWindow.webContents.send('export-progress', progress);
            })
            .on('end', () => {
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                reject({ success: false, error: err.message });
            })
            .run();
    });
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
