'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Video, Music, Upload, Trash2, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Clip, GeneratingTask } from '@/lib/api';
import { createBlobFromFile } from '@/lib/api';

interface AssetPanelProps {
  clips: Clip[];
  selectedClip: Clip | null;
  onAddClip: (clip: Partial<Clip>) => void;
  onSelectClip: (clip: Clip) => void;
  onRemoveAsset: (assetId: string, assetType: string) => void;
  generatingTasks: GeneratingTask[];
  onCancelGeneration: (taskId: string) => void;
}

export default function AssetPanel({
  clips,
  selectedClip,
  onAddClip,
  onSelectClip,
  onRemoveAsset,
  generatingTasks,
  onCancelGeneration,
}: AssetPanelProps) {
  const [showVideos, setShowVideos] = useState(true);
  const [showAudio, setShowAudio] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const videoListRef = useRef<HTMLDivElement>(null);
  const audioListRef = useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [videoListTop, setVideoListTop] = useState(0);
  const [audioListTop, setAudioListTop] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf: number | null = null;
    const update = () => {
      raf = null;
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);

      const scrollRect = el.getBoundingClientRect();

      const videoEl = videoListRef.current;
      if (videoEl) {
        const listRect = videoEl.getBoundingClientRect();
        setVideoListTop((listRect.top - scrollRect.top) + el.scrollTop);
      }

      const audioEl = audioListRef.current;
      if (audioEl) {
        const listRect = audioEl.getBoundingClientRect();
        setAudioListTop((listRect.top - scrollRect.top) + el.scrollTop);
      }
    };
    update();

    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(update);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, []);

  const videoClips = useMemo(() => clips.filter(c => c.type === 'video'), [clips]);
  const audioClips = useMemo(() => clips.filter(c => c.type === 'audio'), [clips]);

  const ITEM_PITCH = 44; // approx row height + 4px gap
  const OVERSCAN = 10;

  const useVirtualVideos = showVideos && videoClips.length > 80;
  const useVirtualAudio = showAudio && audioClips.length > 80;

  const computeWindow = useCallback((count: number, listTopInScroll: number) => {
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + viewportHeight;
    const start = Math.max(0, Math.floor((visibleTop - listTopInScroll) / ITEM_PITCH) - OVERSCAN);
    const end = Math.min(count, Math.ceil((visibleBottom - listTopInScroll) / ITEM_PITCH) + OVERSCAN);
    return { start, end };
  }, [scrollTop, viewportHeight]);

  const videoWindow = useMemo(() => computeWindow(videoClips.length, videoListTop), [computeWindow, videoClips.length, videoListTop]);
  const audioWindow = useMemo(() => computeWindow(audioClips.length, audioListTop), [computeWindow, audioClips.length, audioListTop]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    for (const file of Array.from(files)) {
      const url = await createBlobFromFile(file);
      const isAudio = file.type.startsWith('audio/');
      
      onAddClip({
        type: isAudio ? 'audio' : 'video',
        source: 'upload',
        videoUrl: isAudio ? undefined : url,
        audioPath: isAudio ? url : undefined,
        name: file.name,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
      });
    }
    // Reset input
    e.target.value = '';
  }, [onAddClip]);

  return (
    <div className="w-full bg-zinc-900/70 flex flex-col overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="studio-kicker">Assets</h3>
          <label className="studio-btn-quiet studio-interactive p-1.5 rounded cursor-pointer" title="Upload Media">
            <Upload className="w-3.5 h-3.5" />
            <input
              type="file"
              accept="video/*,audio/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Generating Tasks */}
      {generatingTasks.length > 0 && (
        <div className="px-3 py-2 border-b border-white/10 space-y-2">
          {generatingTasks.map(task => (
            <div key={task.taskId} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 animate-pulse-glow">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-white/75" />
                  <span className="text-[10px] text-white/70 truncate max-w-[120px]">
                    {task.prompt}
                  </span>
                </div>
                <button
                  onClick={() => onCancelGeneration(task.taskId)}
                  className="text-white/30 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/75 rounded-full transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <p className="text-[9px] text-white/40 mt-1">{task.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Video Clips */}
        <div>
          <button
            onClick={() => setShowVideos(!showVideos)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 studio-interactive"
          >
            <div className="flex items-center gap-1.5">
              <Video className="w-3 h-3 text-white/70" />
              <span className="text-xs font-medium text-white/70">Videos ({videoClips.length})</span>
            </div>
            {showVideos ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
          </button>

          {showVideos && (
            <div ref={videoListRef} className="px-2 pb-2">
              {videoClips.length === 0 && (
                <p className="text-[10px] text-white/20 px-2 py-3 text-center">
                  No videos yet. Generate one using AI!
                </p>
              )}
              {videoClips.length > 0 && !useVirtualVideos && (
                <div className="space-y-1">
                  {videoClips.map(clip => (
                    <div
                      key={clip.id}
                      onClick={() => onSelectClip(clip)}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer studio-interactive ${
                        selectedClip?.id === clip.id
                          ? 'bg-white/[0.13] border border-white/20'
                          : 'hover:bg-white/8'
                      }`}
                    >
                      <div className="w-10 h-7 bg-white/10 rounded flex items-center justify-center shrink-0">
                        <Video className="w-3.5 h-3.5 text-white/55" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/80 truncate">{clip.name}</p>
                        <p className="text-[9px] text-white/30">{clip.source}</p>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveAsset(clip.id, 'video');
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {videoClips.length > 0 && useVirtualVideos && (
                <div className="relative" style={{ height: `${videoClips.length * ITEM_PITCH}px` }}>
                  {videoClips.slice(videoWindow.start, videoWindow.end).map((clip, i) => {
                    const idx = videoWindow.start + i;
                    return (
                      <div
                        key={clip.id}
                        style={{ position: 'absolute', top: `${idx * ITEM_PITCH}px`, left: 0, right: 0, paddingBottom: '4px' }}
                      >
                        <div
                          onClick={() => onSelectClip(clip)}
                          className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer studio-interactive ${
                            selectedClip?.id === clip.id
                              ? 'bg-white/[0.13] border border-white/20'
                              : 'hover:bg-white/8'
                          }`}
                        >
                          <div className="w-10 h-7 bg-white/10 rounded flex items-center justify-center shrink-0">
                            <Video className="w-3.5 h-3.5 text-white/55" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white/80 truncate">{clip.name}</p>
                            <p className="text-[9px] text-white/30">{clip.source}</p>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onRemoveAsset(clip.id, 'video');
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Audio Clips */}
        <div>
          <button
            onClick={() => setShowAudio(!showAudio)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 studio-interactive"
          >
            <div className="flex items-center gap-1.5">
              <Music className="w-3 h-3 text-white/70" />
              <span className="text-xs font-medium text-white/70">Audio ({audioClips.length})</span>
            </div>
            {showAudio ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
          </button>

          {showAudio && (
            <div ref={audioListRef} className="px-2 pb-2">
              {audioClips.length === 0 && (
                <p className="text-[10px] text-white/20 px-2 py-3 text-center">
                  Upload audio files to add to timeline
                </p>
              )}
              {audioClips.length > 0 && !useVirtualAudio && (
                <div className="space-y-1">
                  {audioClips.map(clip => (
                    <div
                      key={clip.id}
                      onClick={() => onSelectClip(clip)}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer studio-interactive ${
                        selectedClip?.id === clip.id
                          ? 'bg-white/[0.13] border border-white/20'
                          : 'hover:bg-white/8'
                      }`}
                    >
                      <div className="w-10 h-7 bg-white/10 rounded flex items-center justify-center shrink-0">
                        <Music className="w-3.5 h-3.5 text-white/55" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/80 truncate">{clip.name}</p>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveAsset(clip.id, 'audio');
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {audioClips.length > 0 && useVirtualAudio && (
                <div className="relative" style={{ height: `${audioClips.length * ITEM_PITCH}px` }}>
                  {audioClips.slice(audioWindow.start, audioWindow.end).map((clip, i) => {
                    const idx = audioWindow.start + i;
                    return (
                      <div
                        key={clip.id}
                        style={{ position: 'absolute', top: `${idx * ITEM_PITCH}px`, left: 0, right: 0, paddingBottom: '4px' }}
                      >
                        <div
                          onClick={() => onSelectClip(clip)}
                          className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer studio-interactive ${
                            selectedClip?.id === clip.id
                              ? 'bg-white/[0.13] border border-white/20'
                              : 'hover:bg-white/8'
                          }`}
                        >
                          <div className="w-10 h-7 bg-white/10 rounded flex items-center justify-center shrink-0">
                            <Music className="w-3.5 h-3.5 text-white/55" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white/80 truncate">{clip.name}</p>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onRemoveAsset(clip.id, 'audio');
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
