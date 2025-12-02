import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Film, Maximize2, Minimize2, Code, PanelRight } from 'lucide-react';

const VideoPlayer = ({ 
    videoUrl, 
    selectedClip, 
    onDurationChange, 
    onTimeUpdate: onTimeUpdateProp, 
    onPlayStateChange,
    currentTime: externalCurrentTime,
    audioClips = [],
    textOverlays = [],
    isPlaying: externalIsPlaying,
    clips = [],
    onClipEnded,
    seekToTime,
    onSeekComplete,
    playerHeight = 400,
    onResize,
    onToggleFullscreen,
    isFullscreen = false,
    showCodeEditor = true,
    onToggleCodeEditor,
    showRightPanel = true,
    onToggleRightPanel,
    autoPlayOnMount = false
}) => {
    const videoRef = useRef(null);
    const audioRefs = useRef({});
    const containerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isResizing, setIsResizing] = useState(false);

    // Get trim boundaries from selected clip
    const trimStart = selectedClip?.trimStart || 0;
    const trimEnd = selectedClip?.trimEnd || selectedClip?.duration || duration;
    const trimmedDuration = Math.max(0, trimEnd - trimStart);

    // Helper function to convert local path to file:// URL
    const getVideoSrc = (src) => {
        if (!src) return null;
        // Already a URL
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://')) {
            return src;
        }
        // Convert Windows path to file:// URL
        // Replace backslashes with forward slashes
        let normalizedPath = src.replace(/\\/g, '/');
        // Don't double-encode if already encoded
        if (!normalizedPath.includes('%20') && normalizedPath.includes(' ')) {
            // Only encode spaces and special characters, not the path separators
            normalizedPath = normalizedPath.split('/').map(part => encodeURIComponent(part)).join('/');
        }
        return `file:///${normalizedPath}`;
    };

    // Get visible text overlays at current time (relative to trimmed clip)
    const getVisibleTextOverlays = useCallback(() => {
        const relativeTime = Math.max(0, currentTime - trimStart);
        return textOverlays.filter(overlay => {
            const endTime = overlay.startTime + overlay.duration;
            return relativeTime >= overlay.startTime && relativeTime <= endTime;
        });
    }, [textOverlays, currentTime, trimStart]);

    // Sync audio clips with video playback (relative to trimmed region)
    useEffect(() => {
        const relativeTime = Math.max(0, currentTime - trimStart);
        audioClips.forEach(audio => {
            const audioEl = audioRefs.current[audio.timelineId || audio.id];
            if (!audioEl) return;

            const audioStart = audio.trimStart || 0;
            const audioEnd = audio.trimEnd || audio.duration || 0;
            const audioStartTime = audio.startTime || 0;
            const audioEndTime = audioStartTime + (audioEnd - audioStart);
            
            if (isPlaying && relativeTime >= audioStartTime && relativeTime <= audioEndTime) {
                const audioTime = audioStart + (relativeTime - audioStartTime);
                if (Math.abs(audioEl.currentTime - audioTime) > 0.3) {
                    audioEl.currentTime = audioTime;
                }
                if (audioEl.paused) {
                    audioEl.play().catch(console.warn);
                }
            } else {
                if (!audioEl.paused) {
                    audioEl.pause();
                }
            }
        });
    }, [isPlaying, currentTime, audioClips, trimStart]);

    // Handle seekToTime from timeline click (seeks to local time within clip)
    useEffect(() => {
        if (typeof seekToTime === 'number' && videoRef.current && selectedClip) {
            videoRef.current.currentTime = seekToTime;
            setCurrentTime(seekToTime);
            if (onSeekComplete) {
                onSeekComplete();
            }
        }
    }, [seekToTime, selectedClip, onSeekComplete]);

    // Load video when URL changes
    useEffect(() => {
        if (videoUrl && videoRef.current) {
            setError(null);
            videoRef.current.src = getVideoSrc(videoUrl);
            videoRef.current.load();
        }
    }, [videoUrl]);

    // Load video when clip is selected
    useEffect(() => {
        if (selectedClip && videoRef.current) {
            const src = selectedClip.videoUrl || selectedClip.videoPath;
            if (src) {
                setError(null);
                const videoSrc = getVideoSrc(src);
                if (videoRef.current.src !== videoSrc) {
                    videoRef.current.src = videoSrc;
                    videoRef.current.load();
                }
            }
        }
    }, [selectedClip?.id, selectedClip?.videoUrl, selectedClip?.videoPath]);

    // Seek to trim start when trim values change
    useEffect(() => {
        if (videoRef.current && selectedClip && !isLoading && duration > 0) {
            const clipTrimStart = selectedClip.trimStart || 0;
            if (videoRef.current.currentTime < clipTrimStart || 
                videoRef.current.currentTime > (selectedClip.trimEnd || duration)) {
                videoRef.current.currentTime = clipTrimStart;
                setCurrentTime(clipTrimStart);
            }
        }
    }, [selectedClip?.trimStart, selectedClip?.trimEnd, isLoading, duration, selectedClip]);

    // CRITICAL: Monitor playback to enforce trim boundaries and auto-play next clip
    useEffect(() => {
        if (!videoRef.current || !selectedClip) return;

        const checkTrimBoundary = () => {
            const video = videoRef.current;
            if (!video || !isPlaying) return;

            const clipTrimEnd = selectedClip.trimEnd || selectedClip.duration || video.duration;

            // If reached trim end, try to play next clip
            if (video.currentTime >= clipTrimEnd - 0.05) {
                // Find current clip index and next clip
                const videoClips = clips.filter(c => c.type === 'video');
                const currentIndex = videoClips.findIndex(c => c.id === selectedClip.id);
                const nextClip = videoClips[currentIndex + 1];
                
                if (nextClip && onClipEnded) {
                    // Auto-play next clip
                    onClipEnded(nextClip);
                } else {
                    // No next clip - stop playback and reset
                    video.pause();
                    const clipTrimStart = selectedClip.trimStart || 0;
                    video.currentTime = clipTrimStart;
                    setCurrentTime(clipTrimStart);
                    setIsPlaying(false);
                    if (onPlayStateChange) onPlayStateChange(false);
                }
            }
        };

        const interval = setInterval(checkTrimBoundary, 50);
        return () => clearInterval(interval);
    }, [isPlaying, selectedClip, onPlayStateChange, clips, onClipEnded]);

    const togglePlay = () => {
        if (!videoRef.current || !selectedClip) return;
        
        const clipTrimStart = selectedClip.trimStart || 0;
        const clipTrimEnd = selectedClip.trimEnd || selectedClip.duration || duration;

        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
            if (onPlayStateChange) onPlayStateChange(false);
        } else {
            // Reset to trim start if at/past trim end or before trim start
            if (videoRef.current.currentTime >= clipTrimEnd - 0.05 || 
                videoRef.current.currentTime < clipTrimStart) {
                videoRef.current.currentTime = clipTrimStart;
            }
            videoRef.current.play();
            setIsPlaying(true);
            if (onPlayStateChange) onPlayStateChange(true);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const time = videoRef.current.currentTime;
            setCurrentTime(time);
            
            // Report local time with clip ID for global timeline calculation
            if (onTimeUpdateProp && selectedClip) {
                onTimeUpdateProp(time, selectedClip.id);
            }
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const videoDuration = videoRef.current.duration;
            setDuration(videoDuration);
            setIsLoading(false);
            
            // Seek to trim start or seekToTime immediately after loading
            if (selectedClip) {
                const clipTrimStart = selectedClip.trimStart || 0;
                // Use seekToTime if provided (for fullscreen sync), otherwise use trimStart
                const targetTime = (typeof seekToTime === 'number') ? seekToTime : clipTrimStart;
                videoRef.current.currentTime = targetTime;
                setCurrentTime(targetTime);
                
                // If we were playing (auto-transition) or autoPlayOnMount is true, continue playing
                if (isPlaying || autoPlayOnMount) {
                    videoRef.current.play().catch(console.warn);
                    setIsPlaying(true);
                    if (onPlayStateChange) onPlayStateChange(true);
                }
            }
            
            if (onDurationChange && selectedClip) {
                onDurationChange(selectedClip.id, videoDuration);
            }
        }
    };

    const handleError = (e) => {
        setIsLoading(false);
        const videoElement = videoRef.current;
        let errorMessage = 'Failed to load video.';
        
        if (videoElement?.error) {
            switch (videoElement.error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorMessage = 'Video loading was aborted.';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error while loading video.';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorMessage = 'Video format not supported or file is corrupted.';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Video format not supported. Try MP4 with H.264 codec.';
                    break;
                default:
                    errorMessage = 'Unknown error loading video.';
            }
        }
        
        setError(errorMessage);
        console.error('Video load error:', errorMessage, e);
    };

    const handleCanPlay = () => {
        setIsLoading(false);
    };

    const handleLoadStart = () => {
        setIsLoading(true);
        setError(null);
    };

    // Seek within trimmed region only
    const handleSeek = (e) => {
        if (!videoRef.current || !selectedClip) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        
        const clipTrimStart = selectedClip.trimStart || 0;
        const clipTrimEnd = selectedClip.trimEnd || selectedClip.duration || duration;
        const clipDuration = clipTrimEnd - clipTrimStart;
        
        // Calculate new time within trim boundaries
        const newTime = clipTrimStart + (pos * clipDuration);
        videoRef.current.currentTime = Math.max(clipTrimStart, Math.min(newTime, clipTrimEnd));
        setCurrentTime(videoRef.current.currentTime);
    };

    // Skip to start of trimmed region
    const skipToStart = () => {
        if (videoRef.current && selectedClip) {
            const clipTrimStart = selectedClip.trimStart || 0;
            videoRef.current.currentTime = clipTrimStart;
            setCurrentTime(clipTrimStart);
        }
    };

    // Skip to end of trimmed region
    const skipToEnd = () => {
        if (videoRef.current && selectedClip) {
            const clipTrimEnd = selectedClip.trimEnd || selectedClip.duration || duration;
            videoRef.current.currentTime = Math.max(0, clipTrimEnd - 0.1);
            setCurrentTime(clipTrimEnd - 0.1);
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
        }
    };

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate progress within trimmed region
    const getProgress = () => {
        if (!selectedClip || trimmedDuration <= 0) return 0;
        const relativeTime = currentTime - trimStart;
        return Math.max(0, Math.min(100, (relativeTime / trimmedDuration) * 100));
    };

    // Get display time (relative to trim start)
    const getDisplayTime = () => {
        if (!selectedClip) return currentTime;
        return Math.max(0, currentTime - trimStart);
    };

    // Get display duration (trimmed duration)
    const getDisplayDuration = () => {
        return trimmedDuration > 0 ? trimmedDuration : duration;
    };

    // Check if clip is trimmed
    const isTrimmed = selectedClip && (trimStart > 0 || (selectedClip.trimEnd && selectedClip.trimEnd < duration));

    // Handle diagonal resize drag - smooth pixel-based
    const handleResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        let lastY = e.clientY;

        const handleMouseMove = (e) => {
            const deltaY = e.clientY - lastY;
            lastY = e.clientY;
            if (onResize && deltaY !== 0) {
                onResize(deltaY);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [onResize]);

    return (
        <div 
            ref={containerRef}
            className="flex flex-col bg-dark-900 relative overflow-hidden"
            style={{ height: '100%', minHeight: '150px' }}
        >
            {/* Hidden audio elements for audio clips */}
            {audioClips.map(audio => (
                <audio
                    key={audio.timelineId || audio.id}
                    ref={el => { if (el) audioRefs.current[audio.timelineId || audio.id] = el; }}
                    src={getVideoSrc(audio.audioPath || audio.path)}
                    preload="auto"
                    volume={volume}
                    muted={isMuted}
                />
            ))}

            {/* Video Container - can shrink to allow controls to stay visible */}
            <div className="flex-1 min-h-0 flex items-center justify-center bg-black relative overflow-hidden">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
                    </div>
                )}
                {error ? (
                    <div className="text-red-500 text-center">
                        <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>{error}</p>
                    </div>
                ) : videoUrl || selectedClip ? (
                    <div className="relative">
                        <video
                            ref={videoRef}
                            className="max-w-full max-h-full"
                            onTimeUpdate={handleTimeUpdate}
                            onLoadStart={handleLoadStart}
                            onLoadedMetadata={handleLoadedMetadata}
                            onLoadedData={() => setIsLoading(false)}
                            onEnded={() => {
                                setIsPlaying(false);
                                if (onPlayStateChange) onPlayStateChange(false);
                            }}
                            onError={handleError}
                            onCanPlay={handleCanPlay}
                            preload="auto"
                        />
                        {/* Text Overlays */}
                        {getVisibleTextOverlays().map(overlay => (
                            <div
                                key={overlay.id}
                                className="absolute left-0 right-0 text-center pointer-events-none"
                                style={{
                                    top: overlay.position === 'top' ? '10%' : 
                                         overlay.position === 'center' ? '50%' : '80%',
                                    transform: 'translateY(-50%)',
                                    fontSize: `${overlay.fontSize}px`,
                                    color: overlay.color,
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                    fontWeight: 'bold',
                                }}
                            >
                                {overlay.text}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-gray-500 text-center">
                        <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>No video loaded</p>
                        <p className="text-sm mt-2">Generate a video or select a clip from the timeline</p>
                    </div>
                )}
            </div>

            {/* Trim indicator */}
            {isTrimmed && duration > 0 && (
                <div className="flex-shrink-0 bg-dark-700 px-4 py-1 text-xs text-center text-yellow-400 flex items-center justify-center gap-2">
                    <span>✂️ Trimmed:</span>
                    <span className="font-mono">{formatTime(trimStart)} - {formatTime(trimEnd)}</span>
                    <span className="text-gray-500">|</span>
                    <span className="text-gray-400">Original: {formatTime(duration)}</span>
                </div>
            )}

            {/* Controls - flex-shrink-0 ensures they're always visible */}
            <div className="flex-shrink-0 bg-dark-800 border-t border-dark-700 p-3">
                {/* Progress Bar */}
                <div
                    className="w-full h-2 bg-dark-600 rounded-full mb-3 cursor-pointer relative group"
                    onClick={handleSeek}
                >
                    <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${getProgress()}%` }}
                    />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ left: `${getProgress()}%`, transform: 'translate(-50%, -50%)' }}
                    />
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        className="btn btn-secondary p-2"
                        onClick={skipToStart}
                        disabled={!videoUrl && !selectedClip}
                        title="Skip to start"
                    >
                        <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                        className="btn btn-primary p-2"
                        onClick={togglePlay}
                        disabled={!videoUrl && !selectedClip}
                    >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>

                    <button
                        className="btn btn-secondary p-2"
                        onClick={skipToEnd}
                        disabled={!videoUrl && !selectedClip}
                        title="Skip to end"
                    >
                        <SkipForward className="w-4 h-4" />
                    </button>

                    <span className="text-sm font-mono min-w-[100px]">
                        {formatTime(getDisplayTime())} / {formatTime(getDisplayDuration())}
                    </span>

                    <div className="flex-1" />

                    {/* Volume Control */}
                    <div className="flex items-center gap-2">
                        <button
                            className="btn btn-secondary p-2"
                            onClick={toggleMute}
                        >
                            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-24"
                        />
                    </div>

                    {/* Layout buttons */}
                    <div className="flex items-center gap-1 ml-2 border-l border-dark-600 pl-2">
                        {!isFullscreen && (
                            <>
                                <button
                                    className={`btn p-1.5 ${showCodeEditor ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={onToggleCodeEditor}
                                    title={showCodeEditor ? "Hide code editor" : "Show code editor"}
                                >
                                    <Code className="w-4 h-4" />
                                </button>
                                <button
                                    className={`btn p-1.5 ${showRightPanel ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={onToggleRightPanel}
                                    title={showRightPanel ? "Hide properties panel" : "Show properties panel"}
                                >
                                    <PanelRight className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        <button
                            className={`btn p-1.5 ${isFullscreen ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={onToggleFullscreen}
                            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
                        >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Resize handles - hide in fullscreen, position above controls */}
            {!isFullscreen && (
                <>
                    {/* Diagonal resize handle (bottom-right corner) */}
                    <div
                        className={`absolute bottom-[60px] right-0 w-6 h-6 cursor-ns-resize z-20 group ${isResizing ? 'bg-primary-500/30' : ''}`}
                        onMouseDown={handleResizeMouseDown}
                        title="Drag to resize"
                    >
                        {/* Diagonal lines indicator */}
                        <svg className="w-full h-full text-gray-500 group-hover:text-primary-500 transition-colors" viewBox="0 0 24 24">
                            <path d="M22 22L12 22L22 12L22 22Z" fill="currentColor" opacity="0.3" />
                            <path d="M20 20L14 20M20 20L20 14M16 20L20 16" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
                    </div>

                    {/* Bottom resize bar - above controls */}
                    <div
                        className={`absolute bottom-[60px] left-0 right-6 h-2 cursor-ns-resize hover:bg-primary-500/50 transition-colors z-20 ${isResizing ? 'bg-primary-500/50' : 'bg-transparent'}`}
                        onMouseDown={handleResizeMouseDown}
                    />
                </>
            )}
        </div>
    );
};

export default VideoPlayer;
