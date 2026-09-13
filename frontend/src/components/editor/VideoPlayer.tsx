'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  Maximize2, Minimize2, Code
} from 'lucide-react';
import type { Clip, TextOverlay } from '@/lib/api';

interface VideoPlayerProps {
  videoUrl: string | null;
  selectedClip: Clip | null;
  onDurationChange: (clipId: string, duration: number) => void;
  onTimeUpdate: (localTime: number, clipId?: string) => void;
  onPlayStateChange: (playing: boolean) => void;
  currentTime: number;
  textOverlays?: TextOverlay[];
  isPlaying: boolean;
  clips: Clip[];
  onClipEnded?: (nextClip: Clip) => void;
  seekToTime: number | null;
  onSeekComplete: () => void;
  playerHeight: number;
  onResize: (deltaY: number) => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  showCodeEditor: boolean;
  onToggleCodeEditor: () => void;
  selectedTextId?: string;
  onSelectTextOverlay?: (textId: string) => void;
  onUpdateTextOverlay?: (textId: string, updates: Partial<TextOverlay>) => void;
}

export default function VideoPlayer({
  videoUrl,
  selectedClip,
  onDurationChange,
  onTimeUpdate,
  onPlayStateChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentTime,
  textOverlays = [],
  isPlaying,
  clips,
  onClipEnded,
  seekToTime,
  onSeekComplete,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  playerHeight,
  onResize,
  onToggleFullscreen,
  isFullscreen,
  showCodeEditor,
  onToggleCodeEditor,
  selectedTextId,
  onSelectTextOverlay,
  onUpdateTextOverlay,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<NodeJS.Timeout | null>(null);

  // Resize drag state
  const isDragging = useRef(false);
  const lastY = useRef(0);

  // Text overlay drag state
  const draggingTextRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const textDragRafRef = useRef<number | null>(null);
  const textDragPendingRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // Get video source (blob URL or HTTP URL)
  const getVideoSrc = useCallback((src: string | null) => {
    if (!src) return '';
    // Blob URLs work directly
    if (src.startsWith('blob:')) return src;
    // HTTP URLs work directly
    if (src.startsWith('http')) return src;
    return src;
  }, []);

  // Handle seek from timeline
  useEffect(() => {
    if (seekToTime !== null && videoRef.current) {
      const trimStart = selectedClip?.trimStart || 0;
      const seekTarget = Math.max(trimStart, seekToTime);
      videoRef.current.currentTime = seekTarget;
      onSeekComplete();
    }
  }, [seekToTime, selectedClip, onSeekComplete]);

  // Play/pause sync
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, videoUrl]);

  // Update video source when URL changes
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const src = getVideoSrc(videoUrl);
      if (videoRef.current.src !== src) {
        videoRef.current.src = src;
        setIsLoading(true);
        setError(null);
      }
    }
  }, [videoUrl, getVideoSrc]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      onPlayStateChange(true);
    } else {
      videoRef.current.pause();
      onPlayStateChange(false);
    }
  }, [onPlayStateChange]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setLocalCurrentTime(time);
    onTimeUpdate(time, selectedClip?.id);
  }, [onTimeUpdate, selectedClip]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setDuration(dur);
    setIsLoading(false);
    if (selectedClip) {
      onDurationChange(selectedClip.id, dur);
    }
    // Auto-play if needed
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    }
  }, [selectedClip, onDurationChange, isPlaying]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setError('Failed to load video');
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / rect.width;
    const trimStart = selectedClip?.trimStart || 0;
    const trimEnd = selectedClip?.trimEnd || duration;
    const seekTime = trimStart + fraction * (trimEnd - trimStart);
    videoRef.current.currentTime = seekTime;
  }, [duration, selectedClip]);

  const skipToStart = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = selectedClip?.trimStart || 0;
  }, [selectedClip]);

  const skipToEnd = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = selectedClip?.trimEnd || duration;
  }, [selectedClip, duration]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setVolume(val);
      if (val === 0) setIsMuted(true);
      else setIsMuted(false);
    }
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const getProgress = useCallback((): number => {
    const trimStart = selectedClip?.trimStart || 0;
    const trimEnd = selectedClip?.trimEnd || duration;
    const trimDuration = trimEnd - trimStart;
    if (trimDuration <= 0) return 0;
    return ((localCurrentTime - trimStart) / trimDuration) * 100;
  }, [localCurrentTime, duration, selectedClip]);

  const getDisplayTime = useCallback((): string => {
    const trimStart = selectedClip?.trimStart || 0;
    return formatTime(Math.max(0, localCurrentTime - trimStart));
  }, [localCurrentTime, selectedClip, formatTime]);

  const getDisplayDuration = useCallback((): string => {
    const trimStart = selectedClip?.trimStart || 0;
    const trimEnd = selectedClip?.trimEnd || duration;
    return formatTime(trimEnd - trimStart);
  }, [duration, selectedClip, formatTime]);

  // Handle video ended
  const handleEnded = useCallback(() => {
    if (!clips || clips.length === 0) return;
    const videoClips = clips.filter(c => c.type === 'video');
    const currentIndex = videoClips.findIndex(c => c.id === selectedClip?.id);
    if (currentIndex >= 0 && currentIndex < videoClips.length - 1) {
      const nextClip = videoClips[currentIndex + 1];
      onClipEnded?.(nextClip);
    } else {
      onPlayStateChange(false);
    }
  }, [clips, selectedClip, onClipEnded, onPlayStateChange]);

  // Resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastY.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaY = e.clientY - lastY.current;
      lastY.current = e.clientY;
      onResize(deltaY);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingTextRef.current || !stageRef.current || !onUpdateTextOverlay) return;

      const drag = draggingTextRef.current;
      const rect = stageRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const nextX = Math.max(0, Math.min(100, drag.initialX + (dx / rect.width) * 100));
      const nextY = Math.max(0, Math.min(100, drag.initialY + (dy / rect.height) * 100));

      textDragPendingRef.current = {
        id: drag.id,
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
      };

      if (textDragRafRef.current == null) {
        textDragRafRef.current = window.requestAnimationFrame(() => {
          textDragRafRef.current = null;
          const pending = textDragPendingRef.current;
          textDragPendingRef.current = null;
          if (!pending) return;
          onUpdateTextOverlay(pending.id, { x: pending.x, y: pending.y });
        });
      }
    };

    const handleMouseUp = () => {
      if (!draggingTextRef.current) return;
      draggingTextRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (textDragRafRef.current != null) {
        window.cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = null;
      }
      textDragPendingRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onUpdateTextOverlay]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  // Active text overlays for current time
  const activeTextOverlays = textOverlays.filter(t => {
    const start = t.startTime || 0;
    const end = start + (t.duration || 3);
    return localCurrentTime >= start && localCurrentTime <= end;
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-zinc-950 flex flex-col"
      onMouseMove={resetControlsTimer}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* Video Element */}
      <div ref={stageRef} className="flex-1 relative overflow-hidden flex items-center justify-center">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-10 h-10 border-4 border-white/70 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-white/60">
              <div className="text-2xl mb-2">⚠</div>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {!videoUrl && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-white/30">
              <Play className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No video selected</p>
              <p className="text-xs mt-1">Generate a video using the AI prompt above</p>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          onEnded={handleEnded}
          onCanPlay={() => setIsLoading(false)}
          onLoadStart={() => setIsLoading(true)}
          onClick={togglePlay}
          playsInline
        />

        {/* Text Overlays */}
        {activeTextOverlays.map(overlay => (
          <div
            key={overlay.id}
            className={`absolute transition-opacity duration-150 select-none ${
              overlay.id === selectedTextId ? 'ring-2 ring-white/75 ring-offset-2 ring-offset-black/50 cursor-move' : 'cursor-pointer'
            }`}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${overlay.fontSize}px`,
              color: overlay.color,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
              fontWeight: 600,
            }}
            onClick={e => {
              e.stopPropagation();
              onSelectTextOverlay?.(overlay.id);
            }}
            onMouseDown={e => {
              e.stopPropagation();
              onSelectTextOverlay?.(overlay.id);
              if (!onUpdateTextOverlay || !stageRef.current) return;

              draggingTextRef.current = {
                id: overlay.id,
                startClientX: e.clientX,
                startClientY: e.clientY,
                initialX: overlay.x ?? 50,
                initialY: overlay.y ?? 50,
              };
              document.body.style.cursor = 'move';
              document.body.style.userSelect = 'none';
            }}
          >
            {overlay.text}
          </div>
        ))}
      </div>

      {/* Controls Bar */}
      <div
        className={`relative bg-gradient-to-t from-zinc-950/90 via-zinc-900/70 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress Bar */}
        <div
          className="w-full h-1.5 bg-white/10 rounded-full mb-3 cursor-pointer group relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white/75 rounded-full relative transition-all duration-100"
            style={{ width: `${getProgress()}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={skipToStart} className="btn-ghost p-1.5 rounded-lg" title="Skip to start">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={togglePlay} className="btn-ghost p-2 rounded-lg hover:bg-white/10" title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={skipToEnd} className="btn-ghost p-1.5 rounded-lg" title="Skip to end">
              <SkipForward className="w-4 h-4" />
            </button>

            <span className="text-xs text-white/60 ml-2 font-mono tabular-nums">
              {getDisplayTime()} / {getDisplayDuration()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Volume */}
            <div className="flex items-center gap-1.5 group">
              <button onClick={toggleMute} className="btn-ghost p-1.5 rounded-lg">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>

            {/* Toggle Buttons */}
            <button onClick={onToggleCodeEditor} className={`btn-ghost p-1.5 rounded-lg ${!showCodeEditor ? 'text-white/30' : ''}`} title="Toggle Code Editor">
              <Code className="w-4 h-4" />
            </button>
            <button onClick={onToggleFullscreen} className="btn-ghost p-1.5 rounded-lg" title="Toggle Fullscreen">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Resize Handle */}
      {!isFullscreen && showCodeEditor && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize bg-transparent hover:bg-white/20 transition-colors z-20"
          onMouseDown={handleMouseDown}
        />
      )}
    </div>
  );
}
