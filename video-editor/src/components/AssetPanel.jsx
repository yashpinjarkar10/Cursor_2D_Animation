import { useState, useRef } from 'react';
import { FolderOpen, Video, Music, Plus, Loader2, X } from 'lucide-react';

const AssetPanel = ({ clips, onAddClip, onSelectClip, generatingTasks = [], onCancelGeneration }) => {
    const audioPreviewRef = useRef(null);

    const handleAddVideo = async () => {
        const result = await window.electronAPI.selectFile({
            title: 'Select Video',
            filters: [
                { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
            ],
            properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const videoPath = result.filePaths[0];
            const fileName = videoPath.split(/[\\/]/).pop();

            onAddClip({
                type: 'video',
                source: 'imported',
                videoPath,
                name: fileName,
                duration: 0,
            });
        }
    };

    const handleAddAudio = async () => {
        const result = await window.electronAPI.selectFile({
            title: 'Select Audio',
            filters: [
                { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'ogg', 'm4a'] },
            ],
            properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const audioPath = result.filePaths[0];
            const fileName = audioPath.split(/[\\/]/).pop();

            // Get audio duration using an Audio element
            const audio = new Audio();
            audio.src = `file:///${audioPath.replace(/\\/g, '/')}`;
            
            audio.onloadedmetadata = () => {
                onAddClip({
                    type: 'audio',
                    source: 'imported',
                    audioPath,
                    path: audioPath,
                    name: fileName,
                    duration: audio.duration || 0,
                });
            };
            
            audio.onerror = () => {
                // Add with 0 duration if we can't determine it
                onAddClip({
                    type: 'audio',
                    source: 'imported',
                    audioPath,
                    path: audioPath,
                    name: fileName,
                    duration: 30, // Default duration
                });
            };
        }
    };

    return (
        <div className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
                <FolderOpen className="w-4 h-4 text-primary-500" />
                <h3 className="font-semibold">Assets</h3>
            </div>

            {/* Add Buttons */}
            <div className="p-3 border-b border-dark-700 space-y-2">
                <button
                    className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                    onClick={handleAddVideo}
                >
                    <Video className="w-4 h-4" />
                    Add Video
                </button>

                <button
                    className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                    onClick={handleAddAudio}
                >
                    <Music className="w-4 h-4" />
                    Add Audio
                </button>
            </div>

            {/* Asset List - scrollable with mouse/touchpad */}
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800" style={{ scrollBehavior: 'smooth' }}>
                {/* Generating Tasks Progress */}
                {generatingTasks.length > 0 && (
                    <div className="space-y-2 mb-3">
                        {generatingTasks.map((task) => {
                            // Determine colors based on task type
                            const isRender = task.isRender;
                            const isExport = task.isExport;
                            const borderColor = isExport ? 'border-green-500/50' : isRender ? 'border-purple-500/50' : 'border-yellow-500/50';
                            const bgColor = isExport ? 'bg-green-500/10' : isRender ? 'bg-purple-500/10' : 'bg-yellow-500/10';
                            const textColor = isExport ? 'text-green-400' : isRender ? 'text-purple-400' : 'text-yellow-400';
                            const progressColor = isExport ? 'bg-green-500' : isRender ? 'bg-purple-500' : 'bg-yellow-500';
                            const label = isExport ? 'Exporting...' : isRender ? 'Rendering...' : 'Generating...';
                            
                            return (
                                <div
                                    key={task.taskId}
                                    className={`panel p-3 ${borderColor} ${bgColor}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <Loader2 className={`w-4 h-4 flex-shrink-0 animate-spin ${textColor}`} />
                                        <div className="flex-1 overflow-hidden">
                                            <div className={`text-sm font-medium truncate ${textColor}`}>
                                                {label}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 truncate">
                                                {task.prompt?.substring(0, 40)}{task.prompt?.length > 40 ? '...' : ''}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {task.message}
                                            </div>
                                            {/* Progress bar */}
                                            <div className="mt-2 h-1 bg-dark-700 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-300 ${progressColor}`}
                                                    style={{ width: `${task.progress || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        {onCancelGeneration && (
                                            <button
                                                onClick={() => onCancelGeneration(task.taskId)}
                                                className="text-gray-400 hover:text-red-400 transition-colors"
                                                title={isExport ? 'Cancel export' : isRender ? 'Cancel render' : 'Cancel generation'}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {clips.length === 0 && generatingTasks.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                        <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No assets yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {clips.map((clip) => (
                            <div
                                key={clip.id}
                                onClick={() => onSelectClip(clip)}
                                className="panel p-3 cursor-pointer hover:border-primary-500 transition-colors"
                            >
                                <div className="flex items-start gap-2">
                                    {clip.type === 'video' ? (
                                        <Video className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    ) : (
                                        <Music className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    )}

                                    <div className="flex-1 overflow-hidden">
                                        <div className="text-sm font-medium truncate">
                                            {clip.name}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {clip.source}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssetPanel;
