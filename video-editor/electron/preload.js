const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),

    // Backend API - Non-blocking video generation
    generateVideo: (prompt, generationId, sessionId) => ipcRenderer.invoke('generate-video', prompt, generationId, sessionId),
    cancelGeneration: (taskId) => ipcRenderer.invoke('cancel-generation', taskId),
    getCodeFile: (filename) => ipcRenderer.invoke('get-code-file', filename),
    readLocalFile: (filePath) => ipcRenderer.invoke('read-local-file', filePath),
    
    // Generation progress events
    onGenerationProgress: (callback) => ipcRenderer.on('generation-progress', callback),
    onGenerationComplete: (callback) => ipcRenderer.on('generation-complete', callback),
    removeGenerationListeners: () => {
        ipcRenderer.removeAllListeners('generation-progress');
        ipcRenderer.removeAllListeners('generation-complete');
    },

    // Session management
    createSession: (sessionId) => ipcRenderer.invoke('create-session', sessionId),
    clearSession: (sessionId) => ipcRenderer.invoke('clear-session', sessionId),
    clearGeneratedVideos: () => ipcRenderer.invoke('clear-generated-videos'),
    loadSessionFiles: (sessionId) => ipcRenderer.invoke('load-session-files', sessionId),
    saveToSession: (sessionId, filename, content) =>
        ipcRenderer.invoke('save-to-session', sessionId, filename, content),
    
    // Session refresh events from menu
    onSessionRefresh: (callback) => ipcRenderer.on('session-refresh', callback),
    onClearGeneratedVideos: (callback) => ipcRenderer.on('clear-generated-videos', callback),

    // Manim rendering - Non-blocking with progress updates
    renderManim: (sessionId, code, sceneName) =>
        ipcRenderer.invoke('render-manim', sessionId, code, sceneName),
    onManimProgress: (callback) => ipcRenderer.on('manim-progress', callback),
    onRenderProgress: (callback) => ipcRenderer.on('render-progress', callback),
    onRenderComplete: (callback) => ipcRenderer.on('render-complete', callback),
    removeRenderListeners: () => {
        ipcRenderer.removeAllListeners('render-progress');
        ipcRenderer.removeAllListeners('render-complete');
        ipcRenderer.removeAllListeners('manim-progress');
    },

    // Video editing
    trimVideo: (inputPath, outputPath, startTime, duration) =>
        ipcRenderer.invoke('trim-video', inputPath, outputPath, startTime, duration),
    joinVideos: (videoPaths, outputPath) =>
        ipcRenderer.invoke('join-videos', videoPaths, outputPath),
    addAudio: (videoPath, audioPath, outputPath) =>
        ipcRenderer.invoke('add-audio', videoPath, audioPath, outputPath),
    exportVideo: (inputPath, outputPath, options, sessionId) =>
        ipcRenderer.invoke('export-video', inputPath, outputPath, options, sessionId),
    exportWithOverlays: (exportData) =>
        ipcRenderer.invoke('export-with-overlays', exportData),

    // File dialogs
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),

    // Export progress/completion events
    onExportProgress: (callback) => ipcRenderer.on('export-progress', callback),
    onExportComplete: (callback) => ipcRenderer.on('export-complete', callback),
    removeExportListeners: () => {
        ipcRenderer.removeAllListeners('export-progress');
        ipcRenderer.removeAllListeners('export-complete');
    },
});
