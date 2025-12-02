import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Layers, Trash2, GripVertical, Video, Music, Type, Scissors, X } from 'lucide-react';

const Timeline = ({ 
    clips, 
    audioClips = [],
    textOverlays = [],
    selectedClip, 
    onSelectClip, 
    onRemoveClip,
    onRemoveAudio,
    onRemoveText,
    onReorderClips,
    onTrimClip,
    onTrimAudio,
    onSplitClip,
    onSplitAudio,
    onSelectText,
    currentTime = 0,
    totalDuration = 0,
    onSeek
}) => {
    const [draggedClip, setDraggedClip] = useState(null);
    const [trimMode, setTrimMode] = useState(null); // { clipId, handle: 'start' | 'end' }
    const [trimPreview, setTrimPreview] = useState(null);
    const [audioTrimMode, setAudioTrimMode] = useState(null);
    const [audioTrimPreview, setAudioTrimPreview] = useState(null);
    const [splitMode, setSplitMode] = useState(null); // { clipId, type: 'video' | 'audio' }
    const [splitPosition, setSplitPosition] = useState(null); // Percentage position for the split line
    const [splitTimePreview, setSplitTimePreview] = useState(null); // { time, clipId } for showing split time
    const [splitFramePreview, setSplitFramePreview] = useState(null); // { dataUrl, time } for frame preview
    const timelineRef = useRef(null);
    const timelineContentRef = useRef(null);
    const previewVideoRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const [pixelsPerSecond, setPixelsPerSecond] = useState(50); // Scale factor - now stateful for zoom

    const videoClips = clips.filter(c => c.type === 'video');
    
    // Calculate consecutive positions for video clips (no gaps)
    const clipPositions = useMemo(() => {
        const positions = {};
        let currentPosition = 0;
        videoClips.forEach(clip => {
            const trimStart = trimPreview?.clipId === clip.id ? trimPreview.trimStart : (clip.trimStart || 0);
            const trimEnd = trimPreview?.clipId === clip.id ? trimPreview.trimEnd : (clip.trimEnd || clip.duration || 5);
            const clipDuration = trimEnd - trimStart;
            positions[clip.id] = { left: currentPosition, width: clipDuration };
            currentPosition += clipDuration;
        });
        return positions;
    }, [videoClips, trimPreview]);
    
    // Calculate consecutive positions for audio clips (no gaps)
    const audioPositions = useMemo(() => {
        const positions = {};
        let currentPosition = 0;
        audioClips.forEach(audio => {
            const trimStart = audioTrimPreview?.audioId === (audio.timelineId || audio.id) 
                ? audioTrimPreview.trimStart 
                : (audio.trimStart || 0);
            const trimEnd = audioTrimPreview?.audioId === (audio.timelineId || audio.id) 
                ? audioTrimPreview.trimEnd 
                : (audio.trimEnd || audio.duration || 5);
            const audioDuration = trimEnd - trimStart;
            positions[audio.timelineId || audio.id] = { left: currentPosition, width: audioDuration };
            currentPosition += audioDuration;
        });
        return positions;
    }, [audioClips, audioTrimPreview]);
    
    // Calculate total timeline duration based on consecutive clips
    const totalVideoLength = Object.values(clipPositions).reduce((sum, pos) => sum + pos.width, 0);
    const totalAudioLength = Object.values(audioPositions).reduce((sum, pos) => sum + pos.width, 0);
    const calculatedDuration = Math.max(totalDuration, totalVideoLength, totalAudioLength, 10);

    const handleDragStart = (e, clip) => {
        setDraggedClip(clip);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetClip) => {
        e.preventDefault();
        if (!draggedClip || draggedClip.id === targetClip.id) return;

        const draggedIndex = clips.findIndex(c => c.id === draggedClip.id);
        const targetIndex = clips.findIndex(c => c.id === targetClip.id);

        const newClips = [...clips];
        newClips.splice(draggedIndex, 1);
        newClips.splice(targetIndex, 0, draggedClip);

        onReorderClips(newClips);
        setDraggedClip(null);
    };

    const formatDuration = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Trim handle mouse down
    const handleTrimStart = (e, clip, handle) => {
        e.stopPropagation();
        setTrimMode({ clipId: clip.id, handle, initialX: e.clientX, clip });
    };

    // Global mouse move for trim
    useEffect(() => {
        if (!trimMode) return;

        const handleMouseMove = (e) => {
            const deltaX = e.clientX - trimMode.initialX;
            const deltaTime = deltaX / pixelsPerSecond;
            
            const clip = trimMode.clip;
            let newTrimStart = clip.trimStart || 0;
            let newTrimEnd = clip.trimEnd || clip.duration || 0;

            if (trimMode.handle === 'start') {
                newTrimStart = Math.max(0, (clip.trimStart || 0) + deltaTime);
                newTrimStart = Math.min(newTrimStart, newTrimEnd - 0.1);
            } else {
                newTrimEnd = Math.min(clip.duration || 10, (clip.trimEnd || clip.duration || 0) + deltaTime);
                newTrimEnd = Math.max(newTrimEnd, newTrimStart + 0.1);
            }

            setTrimPreview({ clipId: clip.id, trimStart: newTrimStart, trimEnd: newTrimEnd });
        };

        const handleMouseUp = () => {
            if (trimPreview && onTrimClip) {
                onTrimClip(trimPreview.clipId, trimPreview.trimStart, trimPreview.trimEnd);
            }
            setTrimMode(null);
            setTrimPreview(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [trimMode, trimPreview, onTrimClip, pixelsPerSecond]);

    // Audio trim drag handling
    useEffect(() => {
        if (!audioTrimMode) return;

        const handleMouseMove = (e) => {
            const deltaX = e.clientX - audioTrimMode.initialX;
            const deltaTime = deltaX / pixelsPerSecond;
            
            const audio = audioTrimMode.audio;
            let newTrimStart = audio.trimStart || 0;
            let newTrimEnd = audio.trimEnd || audio.duration || 0;

            if (audioTrimMode.handle === 'start') {
                newTrimStart = Math.max(0, (audio.trimStart || 0) + deltaTime);
                newTrimStart = Math.min(newTrimStart, newTrimEnd - 0.1);
            } else {
                newTrimEnd = Math.min(audio.duration || 30, (audio.trimEnd || audio.duration || 0) + deltaTime);
                newTrimEnd = Math.max(newTrimEnd, newTrimStart + 0.1);
            }

            setAudioTrimPreview({ audioId: audio.timelineId || audio.id, trimStart: newTrimStart, trimEnd: newTrimEnd });
        };

        const handleMouseUp = () => {
            if (audioTrimPreview && onTrimAudio) {
                onTrimAudio(audioTrimPreview.audioId, audioTrimPreview.trimStart, audioTrimPreview.trimEnd);
            }
            setAudioTrimMode(null);
            setAudioTrimPreview(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [audioTrimMode, audioTrimPreview, onTrimAudio, pixelsPerSecond]);

    // Handle audio trim start
    const handleAudioTrimStart = (e, audio, handle) => {
        e.stopPropagation();
        setAudioTrimMode({ audioId: audio.timelineId || audio.id, handle, initialX: e.clientX, audio });
    };

    // Helper: Convert local path to file URL
    const getVideoSrc = useCallback((src) => {
        if (!src) return null;
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://')) {
            return src;
        }
        let normalizedPath = src.replace(/\\/g, '/');
        if (!normalizedPath.includes('%')) {
            normalizedPath = normalizedPath.split('/').map(part => encodeURIComponent(part)).join('/');
        }
        return `file:///${normalizedPath}`;
    }, []);

    // Capture frame from video at specific time
    const captureFrameAtTime = useCallback((time) => {
        if (!previewVideoRef.current || !previewCanvasRef.current) return;
        
        const video = previewVideoRef.current;
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size (small thumbnail)
        canvas.width = 160;
        canvas.height = 90;
        
        // Seek to time and capture when ready
        video.currentTime = time;
    }, []);

    // Handle video seeked event to capture frame
    useEffect(() => {
        const video = previewVideoRef.current;
        if (!video) return;
        
        const handleSeeked = () => {
            const canvas = previewCanvasRef.current;
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            canvas.width = 160;
            canvas.height = 90;
            ctx.drawImage(video, 0, 0, 160, 90);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            setSplitFramePreview(prev => prev ? { ...prev, dataUrl } : null);
        };
        
        video.addEventListener('seeked', handleSeeked);
        return () => video.removeEventListener('seeked', handleSeeked);
    }, []);

    // Enter split mode for a clip
    const enterSplitMode = (e, clipId, type) => {
        e.stopPropagation();
        setSplitMode({ clipId, type });
        setSplitPosition(null);
        setSplitFramePreview(null);
        
        // Load video for frame preview (only for video clips)
        if (type === 'video') {
            const clip = videoClips.find(c => c.id === clipId);
            if (clip && previewVideoRef.current) {
                const videoSrc = clip.videoPath || clip.videoUrl;
                if (videoSrc) {
                    previewVideoRef.current.src = getVideoSrc(videoSrc);
                    previewVideoRef.current.load();
                }
            }
        }
    };

    // Cancel split mode
    const cancelSplitMode = (e) => {
        e?.stopPropagation();
        setSplitMode(null);
        setSplitPosition(null);
        setSplitFramePreview(null);
    };

    // Handle split position selection
    const handleSplitClick = (e, clip, type) => {
        if (!splitMode || splitMode.clipId !== clip.id) return;
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clipDuration = (clip.trimEnd || clip.duration) - (clip.trimStart || 0);
        const splitTime = (clickX / rect.width) * clipDuration + (clip.trimStart || 0);
        
        // Ensure split is not at the very edge
        if (splitTime < 0.5 || splitTime > clipDuration - 0.5) {
            return;
        }

        if (type === 'video' && onSplitClip) {
            onSplitClip(clip.id, splitTime);
        } else if (type === 'audio' && onSplitAudio) {
            onSplitAudio(clip.timelineId || clip.id, splitTime);
        }
        
        setSplitMode(null);
        setSplitPosition(null);
        setSplitFramePreview(null);
    };

    // Handle mouse move in split mode to show preview with time and frame
    const handleSplitMouseMove = (e, clip) => {
        if (!splitMode || splitMode.clipId !== clip.id) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = (clickX / rect.width) * 100;
        setSplitPosition(percentage);
        
        // Calculate the actual split time for preview
        const clipDuration = (clip.trimEnd || clip.duration) - (clip.trimStart || 0);
        const splitTime = (clickX / rect.width) * clipDuration + (clip.trimStart || 0);
        setSplitTimePreview({ time: splitTime, clipId: clip.id });
        
        // Capture frame for video clips
        if (splitMode.type === 'video' && previewVideoRef.current) {
            setSplitFramePreview({ time: splitTime, clipId: clip.id, dataUrl: null });
            previewVideoRef.current.currentTime = splitTime;
        }
    };
    
    // Clear split preview when leaving
    const handleSplitMouseLeave = () => {
        setSplitPosition(null);
        setSplitTimePreview(null);
        setSplitFramePreview(null);
    };

    // Get audio clip style using consecutive positions (no gaps)
    const getAudioClipStyle = (audio) => {
        const pos = audioPositions[audio.timelineId || audio.id];
        if (!pos) return { width: '60px', left: '0px' };
        
        return {
            width: `${Math.max(pos.width * pixelsPerSecond, 60)}px`,
            left: `${pos.left * pixelsPerSecond}px`,
        };
    };

    // Timeline click to seek (account for track label offset and scroll position)
    const handleTimelineClick = (e) => {
        if (!timelineRef.current || !onSeek) return;
        // Don't seek if clicking on a clip (clips stopPropagation)
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const x = e.clientX - rect.left + scrollLeft - 64; // Subtract track label width, add scroll offset
        const time = x / pixelsPerSecond;
        if (time >= 0) {
            onSeek(Math.max(0, Math.min(time, calculatedDuration)));
        }
    };

    // Render time markers (offset by track label width)
    const renderTimeMarkers = () => {
        const markers = [];
        // Adjust interval based on zoom level
        const baseInterval = calculatedDuration > 60 ? 10 : calculatedDuration > 30 ? 5 : 1;
        const interval = pixelsPerSecond < 30 ? baseInterval * 2 : pixelsPerSecond > 80 ? baseInterval / 2 : baseInterval;
        const step = Math.max(interval, 0.5);
        for (let i = 0; i <= calculatedDuration; i += step) {
            markers.push(
                <div
                    key={i}
                    className="absolute top-0 text-xs text-gray-500"
                    style={{ left: `${64 + i * pixelsPerSecond}px` }}
                >
                    <div className="h-2 w-px bg-gray-600"></div>
                    <span className="ml-1">{formatDuration(i)}</span>
                </div>
            );
        }
        return markers;
    };

    // Handle mouse wheel for horizontal scroll and Ctrl+scroll for zoom
    const handleWheel = useCallback((e) => {
        if (!timelineRef.current) return;
        
        if (e.ctrlKey || e.metaKey) {
            // Ctrl + scroll = zoom in/out
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            setPixelsPerSecond(prev => Math.max(20, Math.min(150, prev * zoomFactor)));
        } else {
            // Regular scroll = horizontal scroll
            // Convert vertical scroll to horizontal
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                timelineRef.current.scrollLeft += e.deltaY;
            }
        }
    }, []);

    // Attach wheel event listener with passive: false to allow preventDefault
    useEffect(() => {
        const timeline = timelineRef.current;
        if (!timeline) return;
        
        timeline.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            timeline.removeEventListener('wheel', handleWheel);
        };
    }, [handleWheel]);

    // Calculate clip style using consecutive positions (no gaps)
    const getClipStyle = (clip) => {
        const pos = clipPositions[clip.id];
        if (!pos) return { width: '80px', left: '0px' };
        
        return {
            width: `${Math.max(pos.width * pixelsPerSecond, 80)}px`,
            left: `${pos.left * pixelsPerSecond}px`,
        };
    };
    
    // Format time as MM:SS.ms
    const formatTimeDetailed = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00.0';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    };

    return (
        <div className="h-64 bg-dark-800 border-t border-dark-700 flex flex-col">
            {/* Hidden video and canvas for frame capture */}
            <video 
                ref={previewVideoRef} 
                className="hidden" 
                muted 
                playsInline
                crossOrigin="anonymous"
            />
            <canvas ref={previewCanvasRef} className="hidden" />
            
            {/* Split Frame Preview Window */}
            {splitMode && splitMode.type === 'video' && splitFramePreview && (
                <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 bg-dark-900 border border-orange-500 rounded-lg shadow-2xl p-3">
                    <div className="text-xs text-orange-400 mb-2 text-center font-medium">
                        ✂️ Split Preview at {formatTimeDetailed(splitFramePreview.time)}
                    </div>
                    <div className="w-40 h-24 bg-dark-700 rounded overflow-hidden flex items-center justify-center">
                        {splitFramePreview.dataUrl ? (
                            <img 
                                src={splitFramePreview.dataUrl} 
                                alt="Split frame preview" 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="text-gray-500 text-xs">Loading frame...</div>
                        )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 text-center">
                        Click to split here
                    </div>
                </div>
            )}
            
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-700 flex-shrink-0">
                <Layers className="w-4 h-4 text-primary-500" />
                <h3 className="font-semibold">Timeline</h3>
                <span className="text-sm text-gray-400">
                    ({videoClips.length} video, {audioClips.length} audio, {textOverlays.length} text)
                </span>
                <div className="flex-1" />
                <span className="text-xs text-gray-500 mr-2" title="Ctrl + Scroll to zoom">
                    Zoom: {Math.round(pixelsPerSecond / 50 * 100)}%
                </span>
                <span className="text-xs text-gray-500">
                    Duration: {formatDuration(calculatedDuration)}
                </span>
            </div>

            {/* Timeline Content */}
            <div className="flex-1 overflow-auto" ref={timelineRef}>
                <div 
                    className="relative min-h-full"
                    style={{ width: `${Math.max(calculatedDuration * pixelsPerSecond + 100, 800)}px` }}
                    onClick={handleTimelineClick}
                >
                    {/* Time markers */}
                    <div className="h-6 relative border-b border-dark-600">
                        {renderTimeMarkers()}
                    </div>

                    {/* Playhead */}
                    <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{ left: `${64 + currentTime * pixelsPerSecond}px` }}
                    >
                        <div className="w-3 h-3 bg-red-500 rounded-full -ml-1 -mt-1"></div>
                    </div>

                    {/* Video Track */}
                    <div className="h-20 relative border-b border-dark-600 bg-dark-900/50">
                        <div className="absolute left-0 top-0 bottom-0 w-16 bg-dark-800 flex items-center justify-center border-r border-dark-600 z-10">
                            <Video className="w-4 h-4 text-blue-400" />
                            <span className="text-xs ml-1 text-gray-400">Video</span>
                        </div>
                        <div className="ml-16 h-full relative">
                            {videoClips.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                                    No video clips
                                </div>
                            ) : (
                                videoClips.map((clip) => {
                                    const style = getClipStyle(clip);
                                    const isSelected = selectedClip?.id === clip.id;
                                    const isInSplitMode = splitMode?.clipId === clip.id && splitMode?.type === 'video';
                                    return (
                                        <div
                                            key={clip.id}
                                            draggable={!isInSplitMode}
                                            onDragStart={(e) => !isInSplitMode && handleDragStart(e, clip)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, clip)}
                                            onClick={(e) => {
                                                if (isInSplitMode) {
                                                    handleSplitClick(e, clip, 'video');
                                                } else {
                                                    e.stopPropagation();
                                                    onSelectClip(clip);
                                                }
                                            }}
                                            onMouseMove={(e) => isInSplitMode && handleSplitMouseMove(e, clip)}
                                            onMouseLeave={() => isInSplitMode && handleSplitMouseLeave()}
                                            className={`absolute top-1 bottom-1 rounded transition-all
                                                ${isInSplitMode ? 'cursor-crosshair ring-2 ring-orange-500' : 'cursor-pointer'}
                                                ${isSelected && !isInSplitMode ? 'ring-2 ring-primary-500 bg-blue-600' : 'bg-blue-500 hover:bg-blue-400'}
                                            `}
                                            style={style}
                                        >
                                            {/* Split preview line with time indicator */}
                                            {isInSplitMode && splitPosition !== null && (
                                                <>
                                                    <div 
                                                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none"
                                                        style={{ left: `${splitPosition}%` }}
                                                    >
                                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                                                            <Scissors className="w-3 h-3 text-orange-500" />
                                                        </div>
                                                    </div>
                                                    {/* Frame time preview tooltip */}
                                                    {splitTimePreview && splitTimePreview.clipId === clip.id && (
                                                        <div 
                                                            className="absolute -top-8 bg-orange-600 text-white text-xs px-2 py-1 rounded shadow-lg z-40 pointer-events-none whitespace-nowrap"
                                                            style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            ✂️ Split at {formatTimeDetailed(splitTimePreview.time)}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Left trim handle */}
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-500 cursor-ew-resize rounded-l opacity-0 hover:opacity-100 transition-opacity z-10"
                                                onMouseDown={(e) => handleTrimStart(e, clip, 'start')}
                                            />
                                            
                                            {/* Clip content */}
                                            <div className="px-2 py-1 h-full flex flex-col justify-between overflow-hidden">
                                                <div className="flex items-center gap-1">
                                                    <GripVertical className="w-3 h-3 text-white/50 flex-shrink-0 cursor-grab" />
                                                    <span className="text-xs font-medium text-white truncate">
                                                        {clip.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="text-xs text-white/70">
                                                        {formatDuration((clip.trimEnd || clip.duration) - (clip.trimStart || 0))}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {isInSplitMode ? (
                                                            <button
                                                                onClick={cancelSplitMode}
                                                                className="text-orange-400 hover:text-orange-300 p-1 rounded hover:bg-dark-700"
                                                                title="Cancel split"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => enterSplitMode(e, clip.id, 'video')}
                                                                className="text-white/70 hover:text-orange-400 p-1 rounded hover:bg-dark-700"
                                                                title="Split clip (✂️)"
                                                            >
                                                                <Scissors className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onRemoveClip(clip.id);
                                                            }}
                                                            className="text-white/70 hover:text-red-400 p-1 rounded hover:bg-dark-700"
                                                            title="Delete clip"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right trim handle */}
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-2 bg-yellow-500 cursor-ew-resize rounded-r opacity-0 hover:opacity-100 transition-opacity z-10"
                                                onMouseDown={(e) => handleTrimStart(e, clip, 'end')}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Audio Track */}
                    <div className="h-16 relative border-b border-dark-600 bg-dark-900/30">
                        <div className="absolute left-0 top-0 bottom-0 w-16 bg-dark-800 flex items-center justify-center border-r border-dark-600 z-10">
                            <Music className="w-4 h-4 text-green-400" />
                            <span className="text-xs ml-1 text-gray-400">Audio</span>
                        </div>
                        <div className="ml-16 h-full relative">
                            {audioClips.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                                    No audio clips - Add audio from Assets panel
                                </div>
                            ) : (
                                audioClips.map((audio) => {
                                    const audioStyle = getAudioClipStyle(audio);
                                    const isSelected = selectedClip?.id === audio.id || selectedClip?.timelineId === audio.timelineId;
                                    const isInSplitMode = splitMode?.clipId === (audio.timelineId || audio.id) && splitMode?.type === 'audio';
                                    return (
                                        <div
                                            key={audio.timelineId || audio.id}
                                            onClick={(e) => {
                                                if (isInSplitMode) {
                                                    handleSplitClick(e, audio, 'audio');
                                                } else {
                                                    e.stopPropagation();
                                                    onSelectClip && onSelectClip(audio);
                                                }
                                            }}
                                            onMouseMove={(e) => isInSplitMode && handleSplitMouseMove(e, audio)}
                                            onMouseLeave={() => isInSplitMode && handleSplitMouseLeave()}
                                            className={`absolute top-1 bottom-1 rounded transition-all
                                                ${isInSplitMode ? 'cursor-crosshair ring-2 ring-orange-500' : 'cursor-pointer'}
                                                ${isSelected && !isInSplitMode ? 'ring-2 ring-primary-500 bg-green-600' : 'bg-green-600 hover:bg-green-500'}
                                            `}
                                            style={audioStyle}
                                        >
                                            {/* Split preview line with time indicator */}
                                            {isInSplitMode && splitPosition !== null && (
                                                <>
                                                    <div 
                                                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none"
                                                        style={{ left: `${splitPosition}%` }}
                                                    >
                                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                                                            <Scissors className="w-3 h-3 text-orange-500" />
                                                        </div>
                                                    </div>
                                                    {/* Frame time preview tooltip */}
                                                    {splitTimePreview && splitTimePreview.clipId === (audio.timelineId || audio.id) && (
                                                        <div 
                                                            className="absolute -top-8 bg-orange-600 text-white text-xs px-2 py-1 rounded shadow-lg z-40 pointer-events-none whitespace-nowrap"
                                                            style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            ✂️ Split at {formatTimeDetailed(splitTimePreview.time)}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Left trim handle */}
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-500 cursor-ew-resize rounded-l opacity-0 hover:opacity-100 transition-opacity z-10"
                                                onMouseDown={(e) => handleAudioTrimStart(e, audio, 'start')}
                                            />

                                            <div className="px-2 py-1 h-full flex flex-col justify-between overflow-hidden">
                                                <span className="text-xs font-medium text-white truncate">
                                                    🎵 {audio.name}
                                                </span>
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="text-xs text-white/70">
                                                        {formatDuration((audio.trimEnd || audio.duration) - (audio.trimStart || 0))}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {isInSplitMode ? (
                                                            <button
                                                                onClick={cancelSplitMode}
                                                                className="text-orange-400 hover:text-orange-300 p-1 rounded hover:bg-dark-700"
                                                                title="Cancel split"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => enterSplitMode(e, audio.timelineId || audio.id, 'audio')}
                                                                className="text-white/70 hover:text-orange-400 p-1 rounded hover:bg-dark-700"
                                                                title="Split audio (✂️)"
                                                            >
                                                                <Scissors className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onRemoveAudio && onRemoveAudio(audio.timelineId || audio.id);
                                                            }}
                                                            className="text-white/70 hover:text-red-400 p-1 rounded hover:bg-dark-700"
                                                            title="Delete audio"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right trim handle */}
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-2 bg-yellow-500 cursor-ew-resize rounded-r opacity-0 hover:opacity-100 transition-opacity z-10"
                                                onMouseDown={(e) => handleAudioTrimStart(e, audio, 'end')}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Text Track */}
                    <div className="h-14 relative bg-dark-900/20">
                        <div className="absolute left-0 top-0 bottom-0 w-16 bg-dark-800 flex items-center justify-center border-r border-dark-600 z-10">
                            <Type className="w-4 h-4 text-purple-400" />
                            <span className="text-xs ml-1 text-gray-400">Text</span>
                        </div>
                        <div className="ml-16 h-full relative">
                            {textOverlays.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                                    No text overlays - Add from Properties panel
                                </div>
                            ) : (
                                textOverlays.map((text) => (
                                    <div
                                        key={text.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectText && onSelectText(text.id);
                                        }}
                                        className={`absolute top-1 bottom-1 rounded cursor-pointer bg-purple-600 hover:bg-purple-500
                                            ${selectedClip?.id === text.id ? 'ring-2 ring-primary-500' : ''}
                                        `}
                                        style={{
                                            left: `${(text.startTime || 0) * pixelsPerSecond}px`,
                                            width: `${Math.max((text.duration || 3) * pixelsPerSecond, 50)}px`,
                                        }}
                                    >
                                        <div className="px-2 py-1 h-full flex items-center justify-between overflow-hidden">
                                            <span className="text-xs font-medium text-white truncate">
                                                {text.text || 'Text'}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveText && onRemoveText(text.id);
                                                }}
                                                className="text-white/50 hover:text-red-400"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;
