const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),

    // Backend API
    generateVideo: (prompt) => ipcRenderer.invoke('generate-video', prompt),
    getCodeFile: (filename) => ipcRenderer.invoke('get-code-file', filename),

    // Session management
    createSession: (sessionId) => ipcRenderer.invoke('create-session', sessionId),
    saveToSession: (sessionId, filename, content) =>
        ipcRenderer.invoke('save-to-session', sessionId, filename, content),

    // Manim rendering
    renderManim: (sessionId, code, sceneName) =>
        ipcRenderer.invoke('render-manim', sessionId, code, sceneName),
    onManimProgress: (callback) => ipcRenderer.on('manim-progress', callback),

    // Video editing
    trimVideo: (inputPath, outputPath, startTime, duration) =>
        ipcRenderer.invoke('trim-video', inputPath, outputPath, startTime, duration),
    joinVideos: (videoPaths, outputPath) =>
        ipcRenderer.invoke('join-videos', videoPaths, outputPath),
    addAudio: (videoPath, audioPath, outputPath) =>
        ipcRenderer.invoke('add-audio', videoPath, audioPath, outputPath),
    exportVideo: (inputPath, outputPath, options) =>
        ipcRenderer.invoke('export-video', inputPath, outputPath, options),

    // File dialogs
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),

    // Progress listeners
    onExportProgress: (callback) => ipcRenderer.on('export-progress', callback),
});
