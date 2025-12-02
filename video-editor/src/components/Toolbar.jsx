import { useState, useEffect } from 'react';
import { Play, Download, Film, Settings, Keyboard } from 'lucide-react';

const Toolbar = ({ onGenerateVideo, onExport, isRendering }) => {
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [exportSettings, setExportSettings] = useState({
        quality: 'high',
        aspectRatio: '16:9',
        resolution: '1920x1080',
    });

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl/Cmd + G for Generate
            if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !isRendering) {
                e.preventDefault();
                setShowGenerateModal(true);
            }
            // Ctrl/Cmd + E for Export
            if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !isRendering) {
                e.preventDefault();
                setShowExportModal(true);
            }
            // Escape to close modals
            if (e.key === 'Escape') {
                setShowGenerateModal(false);
                setShowExportModal(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRendering]);

    const handleGenerate = () => {
        if (prompt.trim()) {
            onGenerateVideo(prompt);
            setShowGenerateModal(false);
            setPrompt('');
        }
    };

    const handleExport = () => {
        onExport(exportSettings);
        setShowExportModal(false);
    };

    return (
        <>
            <div className="h-16 bg-dark-800 border-b border-dark-700 flex items-center px-4 gap-4">
                <div className="flex items-center gap-2">
                    <Film className="w-6 h-6 text-primary-500" />
                    <h1 className="text-xl font-bold">Video Editor</h1>
                </div>

                <div className="flex-1" />

                <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={() => setShowGenerateModal(true)}
                    disabled={isRendering}
                    title="Generate Video (Ctrl+G)"
                >
                    <Play className="w-4 h-4" />
                    Generate Video
                </button>

                <button
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={() => setShowExportModal(true)}
                    disabled={isRendering}
                    title="Export (Ctrl+E)"
                >
                    <Download className="w-4 h-4" />
                    Export
                </button>
            </div>

            {/* Generate Modal */}
            {showGenerateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="panel p-6 w-[500px]">
                        <h2 className="text-xl font-bold mb-4">Generate Video</h2>
                        <textarea
                            className="input w-full h-32 resize-none"
                            placeholder="Enter your prompt here..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            autoFocus
                        />
                        <div className="flex gap-2 mt-4">
                            <button
                                className="btn btn-primary flex-1"
                                onClick={handleGenerate}
                            >
                                Generate
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowGenerateModal(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="panel p-6 w-[500px]">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Settings className="w-5 h-5" />
                            Export Settings
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Quality (Bitrate)</label>
                                <select
                                    className="input w-full"
                                    value={exportSettings.quality}
                                    onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value })}
                                >
                                    <option value="high">High (5000 kbps)</option>
                                    <option value="medium">Medium (2500 kbps)</option>
                                    <option value="low">Low (1000 kbps)</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Higher bitrate = better quality, larger file size</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Aspect Ratio</label>
                                <select
                                    className="input w-full"
                                    value={exportSettings.aspectRatio}
                                    onChange={(e) => setExportSettings({ ...exportSettings, aspectRatio: e.target.value })}
                                >
                                    <option value="16:9">16:9 (Landscape)</option>
                                    <option value="9:16">9:16 (Portrait)</option>
                                    <option value="1:1">1:1 (Square)</option>
                                    <option value="4:3">4:3 (Standard)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Resolution</label>
                                <select
                                    className="input w-full"
                                    value={exportSettings.resolution}
                                    onChange={(e) => setExportSettings({ ...exportSettings, resolution: e.target.value })}
                                >
                                    <option value="3840x2160">3840×2160 (4K UHD)</option>
                                    <option value="1920x1080">1920×1080 (1080p Full HD)</option>
                                    <option value="1280x720">1280×720 (720p HD)</option>
                                    <option value="854x480">854×480 (480p SD)</option>
                                    <option value="640x360">640×360 (360p)</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Pixel dimensions of the output video</p>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button
                                className="btn btn-primary flex-1"
                                onClick={handleExport}
                            >
                                Export
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowExportModal(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Toolbar;
