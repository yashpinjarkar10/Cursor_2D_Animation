'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Scissors, Trash2, ChevronDown, ChevronUp, GripVertical, Film } from 'lucide-react';
import type { Clip, TextOverlay } from '@/lib/api';

interface TimelineProps {
  clips: Clip[];
  selectedClip: Clip | null;
  onSelectClip: (clip: Clip | null) => void;
  onRemoveClip: (clipId: string) => void;
  onReorderClips: (clips: Clip[]) => void;
  audioClips?: Clip[];
  textOverlays?: TextOverlay[];
  onTrimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  onSplitClip: (clipId: string, splitTime: number) => void;
  onRemoveAudio?: (audioId: string) => void;
  onMoveAudio?: (audioId: string, startTime: number) => void;
  onRemoveText?: (textId: string) => void;
  onSelectText?: (textId: string) => void;
  onUpdateTextOverlay?: (textId: string, updates: Partial<TextOverlay>) => void;
  currentTime: number;
  onSeek: (globalTime: number) => void;
}

const TRACK_HEIGHT = 48;
const LABEL_WIDTH = 48; // px for track labels

export default function Timeline({
  clips,
  selectedClip,
  onSelectClip,
  onRemoveClip,
  onReorderClips,
  audioClips = [],
  textOverlays = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrimClip,
  onSplitClip,
  onRemoveAudio,
  onMoveAudio,
  onRemoveText,
  onSelectText,
  onUpdateTextOverlay,
  currentTime,
  onSeek,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf: number | null = null;
    const update = () => {
      raf = null;
      setScrollLeft(el.scrollLeft);
      setViewportWidth(el.clientWidth);
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

  const draggingAudioRef = useRef<{
    id: string;
    startClientX: number;
    initialStartTime: number;
  } | null>(null);
  const [draggingAudioId, setDraggingAudioId] = useState<string | null>(null);

  const audioDragRafRef = useRef<number | null>(null);
  const audioDragPendingStartRef = useRef<number | null>(null);

  const draggingTextRef = useRef<{
    id: string;
    mode: 'move' | 'resize-start' | 'resize-end';
    startClientX: number;
    initialStart: number;
    initialDuration: number;
  } | null>(null);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const textDragRafRef = useRef<number | null>(null);
  const textDragPendingRef = useRef<{ id: string; startTime: number; duration: number } | null>(null);

  const draggingVideoRef = useRef<{
    clipId: string;
    sourceIndex: number;
    insertionIndex: number;
    videoClipIds: string[];
    durations: number[];
  } | null>(null);
  const [draggingVideoId, setDraggingVideoId] = useState<string | null>(null);
  const [videoInsertionIndex, setVideoInsertionIndex] = useState<number | null>(null);

  const videoDragRafRef = useRef<number | null>(null);
  const videoDragPendingInsertionRef = useRef<number | null>(null);

  const videoClips = useMemo(() => clips.filter(c => c.type === 'video'), [clips]);

  const audioLanes = useMemo(() => {
    if (!audioClips.length) return [] as Clip[][];

    const sorted = [...audioClips].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const lanes: { end: number; clips: Clip[] }[] = [];

    for (const clip of sorted) {
      const start = clip.startTime || 0;
      const dur = (clip.trimEnd || clip.duration || 10) - (clip.trimStart || 0);
      const safeDur = Math.max(0.1, dur || 0);
      const end = start + safeDur;

      let placed = false;
      for (const lane of lanes) {
        if (lane.end <= start) {
          lane.clips.push(clip);
          lane.end = end;
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push({ end, clips: [clip] });
    }

    return lanes.map(l => l.clips);
  }, [audioClips]);

  // Total timeline duration
  const totalDuration = useMemo(() => {
    const videoTotal = videoClips.reduce((sum, clip) => {
      const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      return sum + Math.max(0, clipDuration);
    }, 0);

    const audioEnd = audioClips.reduce((max, clip) => {
      const start = clip.startTime || 0;
      const dur = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      const end = start + Math.max(0, dur);
      return Math.max(max, end);
    }, 0);

    const textEnd = textOverlays.reduce((max, t) => {
      const start = t.startTime || 0;
      const end = start + Math.max(0, t.duration || 0);
      return Math.max(max, end);
    }, 0);

    return Math.max(videoTotal, audioEnd, textEnd);
  }, [videoClips, audioClips, textOverlays]);

  const timelineWidth = Math.max(totalDuration * pixelsPerSecond, 600);

  const VIDEO_GAP_PX = 4;
  const OVERSCAN_PX = 400;
  const visibleStartX = Math.max(0, scrollLeft - LABEL_WIDTH - OVERSCAN_PX);
  const visibleEndX = Math.max(0, scrollLeft - LABEL_WIDTH + viewportWidth + OVERSCAN_PX);

  const videoClipWidths = useMemo(() => {
    return videoClips.map(clip => {
      const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      const width = Math.max(clipDuration * pixelsPerSecond, 40);
      return width;
    });
  }, [videoClips, pixelsPerSecond]);

  const videoClipOffsets = useMemo(() => {
    const offsets = new Array(videoClipWidths.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < videoClipWidths.length; i++) {
      offsets[i + 1] = offsets[i] + videoClipWidths[i] + VIDEO_GAP_PX;
    }
    return offsets;
  }, [videoClipWidths, VIDEO_GAP_PX]);

  const videoWindow = useMemo(() => {
    const n = videoClips.length;
    if (n === 0) return { startIndex: 0, endIndex: 0, padLeft: 0, padRight: 0 };

    const lowerBound = (arr: number[], x: number) => {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const start = Math.max(0, lowerBound(videoClipOffsets, visibleStartX) - 1);
    const end = Math.min(n, lowerBound(videoClipOffsets, visibleEndX) + 1);
    const padLeft = videoClipOffsets[start] || 0;
    const totalWithTrailingGap = videoClipOffsets[n] || 0;
    const total = n > 0 ? Math.max(0, totalWithTrailingGap - VIDEO_GAP_PX) : 0;
    const padRight = Math.max(0, (total - (videoClipOffsets[end] || 0)) + (end < n ? VIDEO_GAP_PX : 0));

    return { startIndex: start, endIndex: end, padLeft, padRight };
  }, [videoClips.length, videoClipOffsets, visibleStartX, visibleEndX, VIDEO_GAP_PX]);

  // Handle seek click on timeline
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const scrollLeft = scrollRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - LABEL_WIDTH;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(time, totalDuration)));
  }, [onSeek, totalDuration, pixelsPerSecond]);

  const handleTimelineWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;

    // Trackpad pinch typically arrives as ctrl+wheel.
    const isZoomGesture = e.ctrlKey || e.metaKey || e.altKey;
    if (!isZoomGesture) return;

    e.preventDefault();

    const el = scrollRef.current;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const timelineX = Math.max(0, el.scrollLeft + cursorX - LABEL_WIDTH);
    const timeUnderCursor = timelineX / pixelsPerSecond;

    const zoomFactor = Math.exp((-e.deltaY * 2) / 1000);
    const rawNext = pixelsPerSecond * zoomFactor;
    const nextPixelsPerSecond = Math.max(20, Math.min(260, Math.round(rawNext)));
    if (nextPixelsPerSecond === pixelsPerSecond) return;

    setPixelsPerSecond(nextPixelsPerSecond);

    window.requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const nextTimelineX = timeUnderCursor * nextPixelsPerSecond;
      scrollRef.current.scrollLeft = Math.max(0, nextTimelineX - cursorX + LABEL_WIDTH);
    });
  }, [pixelsPerSecond]);

  // Video dragging (ripple reorder)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingVideoRef.current) return;
      if (!scrollRef.current) return;

      const rect = scrollRef.current.getBoundingClientRect();
      const scrollLeft = scrollRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft - LABEL_WIDTH;
      const time = x / pixelsPerSecond;

      const { durations } = draggingVideoRef.current;
      const n = durations.length;
      if (n === 0) return;

      const t = Math.max(0, time);
      let accumulated = 0;
      let insertionIndex = n;
      for (let i = 0; i < n; i++) {
        const dur = Math.max(0.001, durations[i]);
        const mid = accumulated + dur / 2;
        if (t < mid) {
          insertionIndex = i;
          break;
        }
        accumulated += dur;
      }

      videoDragPendingInsertionRef.current = insertionIndex;
      if (videoDragRafRef.current == null) {
        videoDragRafRef.current = window.requestAnimationFrame(() => {
          videoDragRafRef.current = null;
          const pending = videoDragPendingInsertionRef.current;
          videoDragPendingInsertionRef.current = null;
          if (pending == null) return;
          if (!draggingVideoRef.current) return;
          draggingVideoRef.current.insertionIndex = pending;
          setVideoInsertionIndex(pending);
        });
      }
    };

    const onUp = () => {
      if (!draggingVideoRef.current) return;

      const { clipId, sourceIndex, insertionIndex, videoClipIds } = draggingVideoRef.current;
      draggingVideoRef.current = null;
      setDraggingVideoId(null);
      setVideoInsertionIndex(null);

      if (videoDragRafRef.current != null) {
        window.cancelAnimationFrame(videoDragRafRef.current);
        videoDragRafRef.current = null;
      }
      videoDragPendingInsertionRef.current = null;

      const n = videoClipIds.length;
      if (n <= 1) return;
      if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return;

      const sourceId = clipId;
      const nextOrder = [...videoClipIds];
      const from = nextOrder.indexOf(sourceId);
      if (from === -1) return;
      nextOrder.splice(from, 1);

      const insertAt = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex;
      const clamped = Math.max(0, Math.min(insertAt, nextOrder.length));
      nextOrder.splice(clamped, 0, sourceId);

      const byId = new Map(videoClips.map(v => [v.id, v] as const));
      const reorderedVideos = nextOrder.map(id => byId.get(id)).filter(Boolean) as Clip[];
      if (reorderedVideos.length !== videoClips.length) return;

      const nextClips = [...clips];
      const videoIndexes: number[] = [];
      for (let i = 0; i < nextClips.length; i++) {
        if (nextClips[i].type === 'video') videoIndexes.push(i);
      }
      for (let i = 0; i < videoIndexes.length; i++) {
        nextClips[videoIndexes[i]] = reorderedVideos[i];
      }
      onReorderClips(nextClips);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [clips, onReorderClips, pixelsPerSecond, videoClips]);

  // Audio dragging
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingAudioRef.current) return;
      if (!onMoveAudio) return;
      const { id, startClientX, initialStartTime } = draggingAudioRef.current;

      const deltaX = e.clientX - startClientX;
      const deltaT = deltaX / pixelsPerSecond;
      const nextStart = Math.max(0, initialStartTime + deltaT);
      const snapped = Math.round(nextStart * 10) / 10; // 0.1s snapping

      audioDragPendingStartRef.current = snapped;
      if (audioDragRafRef.current == null) {
        audioDragRafRef.current = window.requestAnimationFrame(() => {
          audioDragRafRef.current = null;
          const pending = audioDragPendingStartRef.current;
          audioDragPendingStartRef.current = null;
          if (pending == null) return;
          onMoveAudio(id, pending);
        });
      }
    };

    const onUp = () => {
      if (draggingAudioRef.current) {
        draggingAudioRef.current = null;
        setDraggingAudioId(null);

        if (audioDragRafRef.current != null) {
          window.cancelAnimationFrame(audioDragRafRef.current);
          audioDragRafRef.current = null;
        }
        audioDragPendingStartRef.current = null;
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onMoveAudio, pixelsPerSecond]);

  // Text overlay dragging / resizing
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingTextRef.current || !onUpdateTextOverlay) return;

      const { id, mode, startClientX, initialStart, initialDuration } = draggingTextRef.current;
      const deltaSeconds = (e.clientX - startClientX) / pixelsPerSecond;
      const minDuration = 0.2;

      let startTime = initialStart;
      let duration = Math.max(minDuration, initialDuration);

      if (mode === 'move') {
        startTime = Math.max(0, initialStart + deltaSeconds);
      }

      if (mode === 'resize-start') {
        const maxStart = initialStart + initialDuration - minDuration;
        startTime = Math.max(0, Math.min(maxStart, initialStart + deltaSeconds));
        duration = Math.max(minDuration, initialDuration + (initialStart - startTime));
      }

      if (mode === 'resize-end') {
        duration = Math.max(minDuration, initialDuration + deltaSeconds);
      }

      const snappedStart = Math.round(startTime * 10) / 10;
      const snappedDuration = Math.max(minDuration, Math.round(duration * 10) / 10);

      textDragPendingRef.current = {
        id,
        startTime: snappedStart,
        duration: snappedDuration,
      };

      if (textDragRafRef.current == null) {
        textDragRafRef.current = window.requestAnimationFrame(() => {
          textDragRafRef.current = null;
          const pending = textDragPendingRef.current;
          textDragPendingRef.current = null;
          if (!pending) return;
          onUpdateTextOverlay(pending.id, { startTime: pending.startTime, duration: pending.duration });
        });
      }
    };

    const onUp = () => {
      if (!draggingTextRef.current) return;
      draggingTextRef.current = null;
      setDraggingTextId(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (textDragRafRef.current != null) {
        window.cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = null;
      }
      textDragPendingRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onUpdateTextOverlay, pixelsPerSecond]);

  // Playhead position
  const playheadPosition = currentTime * pixelsPerSecond;

  // Time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    const interval = totalDuration > 60 ? 10 : totalDuration > 20 ? 5 : 1;
    for (let t = 0; t <= totalDuration + interval; t += interval) {
      markers.push(t);
    }
    return markers;
  }, [totalDuration]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  }, []);

  // Close context menu
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleSplitAtPlayhead = useCallback((clipId: string) => {
    let accumulatedTime = 0;
    for (const clip of videoClips) {
      const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      if (clip.id === clipId) {
        const localSplitTime = (clip.trimStart || 0) + (currentTime - accumulatedTime);
        if (localSplitTime > (clip.trimStart || 0) && localSplitTime < (clip.trimEnd || clip.duration || 0)) {
          onSplitClip(clipId, localSplitTime);
        }
        break;
      }
      accumulatedTime += clipDuration;
    }
  }, [videoClips, currentTime, onSplitClip]);

  // Total tracks height for dynamic sizing
  const audioTrackHeight = audioLanes.length > 0 ? audioLanes.length * (TRACK_HEIGHT - 10) : 0;
  const totalTracksHeight = TRACK_HEIGHT + audioTrackHeight + (textOverlays.length > 0 ? 32 : 0);

  return (
    <div className={`bg-zinc-900/70 border-t border-white/10 flex flex-col shrink-0 backdrop-blur-sm ${isCollapsed ? 'h-10' : ''}`}>
      {/* Timeline Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-1.5 py-0.5 studio-interactive"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <span className="studio-kicker">Timeline</span>
          <span className="text-[10px] text-white/30">
            {videoClips.length} clip{videoClips.length !== 1 ? 's' : ''} · {formatTime(totalDuration)}
          </span>
          {isCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
        </div>

        {/* Zoom Hint */}
        {!isCollapsed && (
          <div className="text-[10px] text-white/35">Pinch or Ctrl+Wheel to zoom</div>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Empty State */}
          {videoClips.length === 0 && audioClips.length === 0 && textOverlays.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-center" style={{ minHeight: '120px' }}>
              <div>
                <Film className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-xs text-white/25">Generate or upload a video to get started</p>
                <p className="text-[10px] text-white/15 mt-1">Clips will appear here on the timeline</p>
              </div>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="flex-1 overflow-x-auto overflow-y-hidden relative"
              style={{ minHeight: `${Math.max(totalTracksHeight + 48, 210)}px` }}
              onClick={handleTimelineClick}
              onWheel={handleTimelineWheel}
            >
              <div className="relative" style={{ width: `${timelineWidth + LABEL_WIDTH}px`, minWidth: '100%' }}>
                {/* Time Ruler */}
                <div className="h-6 border-b border-white/10 relative" style={{ marginLeft: `${LABEL_WIDTH}px` }}>
                  {timeMarkers.map(t => (
                    <div
                      key={t}
                      className="absolute top-0 h-full flex flex-col items-center"
                      style={{ left: `${t * pixelsPerSecond}px` }}
                    >
                      <div className="w-px h-2 bg-white/20" />
                      <span className="text-[10px] text-white/30 mt-0.5">{formatTime(t)}</span>
                    </div>
                  ))}
                </div>

                {/* Video Track */}
                <div className="relative flex" style={{ height: `${TRACK_HEIGHT}px` }}>
                  {/* Track Label */}
                  <div
                    className="shrink-0 flex items-center justify-center border-r border-white/10 text-[10px] text-white/35 font-medium"
                    style={{ width: `${LABEL_WIDTH}px` }}
                  >
                    🎬
                  </div>
                  {/* Track Content */}
                  <div className="flex-1 relative">
                    {/* Insertion marker while dragging */}
                    {draggingVideoId && videoInsertionIndex !== null && (
                      <div
                        className="absolute top-1 bottom-1 w-px bg-white/70 z-30 pointer-events-none"
                        style={{
                          left: `${(() => {
                            const n = videoClips.length;
                            const totalWithTrailingGap = videoClipOffsets[n] || 0;
                            const total = n > 0 ? Math.max(0, totalWithTrailingGap - VIDEO_GAP_PX) : 0;
                            if (videoInsertionIndex >= n) return total;
                            return videoClipOffsets[Math.min(videoInsertionIndex, videoClipOffsets.length - 1)] || 0;
                          })()}px`,
                        }}
                      />
                    )}
                    <div
                      className="absolute left-0 top-0 bottom-0 flex gap-1"
                      style={{ paddingLeft: `${videoWindow.padLeft}px`, paddingRight: `${videoWindow.padRight}px` }}
                    >
                      {videoClips.slice(videoWindow.startIndex, videoWindow.endIndex).map((clip, i) => {
                        const index = videoWindow.startIndex + i;
                        const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
                        const width = videoClipWidths[index] || 40;
                        const isSelected = selectedClip?.id === clip.id;
                        const isDragging = draggingVideoId === clip.id;

                        return (
                          <div
                            key={clip.id}
                            className={`relative h-full flex items-center cursor-pointer group transition-all duration-150
                              ${isSelected
                                ? 'bg-white/14 border border-white/30 z-10'
                                : 'bg-white/[0.05] border border-white/10 hover:bg-white/[0.1]'
                              }
                              ${isDragging ? 'opacity-80 z-20' : ''}
                              rounded-md studio-interactive
                            `}
                            style={{ width: `${width}px` }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectClip(clip);
                            }}
                            onContextMenu={e => handleContextMenu(e, clip.id)}
                          >
                            {/* Drag Handle */}
                            <button
                              type="button"
                              className="mx-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                              title="Drag to move"
                              onMouseDown={e => {
                                e.stopPropagation();

                                const ids = videoClips.map(v => v.id);
                                const durations = videoClips.map(v => {
                                  const d = (v.trimEnd || v.duration || 0) - (v.trimStart || 0);
                                  return Math.max(0.001, d);
                                });

                                draggingVideoRef.current = {
                                  clipId: clip.id,
                                  sourceIndex: index,
                                  insertionIndex: index,
                                  videoClipIds: ids,
                                  durations,
                                };
                                setDraggingVideoId(clip.id);
                                setVideoInsertionIndex(index);
                              }}
                            >
                              <GripVertical className="w-3 h-3 text-white/20" />
                            </button>

                            {/* Clip Label */}
                            <div className="flex-1 min-w-0 px-1">
                              <p className="text-[10px] text-white/70 truncate">{clip.name}</p>
                              <p className="text-[10px] text-white/30">{formatTime(clipDuration)}</p>
                            </div>

                            {/* Delete */}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onRemoveClip(clip.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-red-400 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Audio Track */}
                {audioLanes.length > 0 && (
                  <div className="relative flex border-t border-white/10" style={{ height: `${audioTrackHeight}px` }}>
                    {/* Track Label Column */}
                    <div
                      className="shrink-0 border-r border-white/10"
                      style={{ width: `${LABEL_WIDTH}px` }}
                    >
                      {audioLanes.map((_, laneIndex) => (
                        <div
                          key={laneIndex}
                          className="flex items-center justify-center text-[10px] text-white/30 font-medium"
                          style={{ height: `${TRACK_HEIGHT - 10}px` }}
                        >
                          {laneIndex === 0 ? '🎵' : ''}
                        </div>
                      ))}
                    </div>
                    {/* Track Content */}
                    <div className="flex-1 relative">
                      {audioLanes.map((lane, laneIndex) => (
                        <div
                          key={laneIndex}
                          className="relative border-b border-white/10"
                          style={{ height: `${TRACK_HEIGHT - 10}px` }}
                        >
                          {lane
                            .filter(clip => {
                              const startX = (clip.startTime || 0) * pixelsPerSecond;
                              const clipDuration = (clip.trimEnd || clip.duration || 10) - (clip.trimStart || 0);
                              const width = Math.max(clipDuration * pixelsPerSecond, 30);
                              const endX = startX + width;
                              return endX >= visibleStartX && startX <= visibleEndX;
                            })
                            .map(clip => {
                            const id = clip.timelineId || clip.id;
                            const startX = (clip.startTime || 0) * pixelsPerSecond;
                            const clipDuration = (clip.trimEnd || clip.duration || 10) - (clip.trimStart || 0);
                            const width = Math.max(clipDuration * pixelsPerSecond, 30);
                            const isSelected = selectedClip?.id === clip.id;
                            const isDragging = draggingAudioId === id;

                            return (
                              <div
                                key={id}
                                className={`absolute h-full rounded-md flex items-center px-2 group cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-300/15 border border-emerald-200/35'
                                    : 'bg-emerald-300/8 border border-emerald-200/20 hover:bg-emerald-300/12'
                                } ${isDragging ? 'opacity-80' : ''}`}
                                style={{ left: `${startX}px`, width: `${width}px`, top: 0 }}
                                onClick={e => {
                                  e.stopPropagation();
                                  const asset = clips.find(c => c.id === clip.id);
                                  onSelectClip(asset || clip);
                                }}
                                onMouseDown={e => {
                                  if (!onMoveAudio) return;
                                  e.stopPropagation();
                                  draggingAudioRef.current = {
                                    id,
                                    startClientX: e.clientX,
                                    initialStartTime: clip.startTime || 0,
                                  };
                                  setDraggingAudioId(id);
                                }}
                                title="Drag to move in time"
                              >
                                <p className="text-[10px] text-emerald-100/75 truncate">{clip.name}</p>
                                {onRemoveAudio && (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      onRemoveAudio(id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 ml-auto text-white/30 hover:text-red-400"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text Overlay Track */}
                {textOverlays.length > 0 && (
                  <div className="relative flex border-t border-white/10" style={{ height: '36px' }}>
                    {/* Track Label */}
                    <div
                      className="shrink-0 flex items-center justify-center border-r border-white/10 text-[10px] text-white/35 font-medium"
                      style={{ width: `${LABEL_WIDTH}px` }}
                    >
                      📝
                    </div>
                    {/* Track Content */}
                    <div className="flex-1 relative">
                      {textOverlays
                        .filter(overlay => {
                          const startX = (overlay.startTime || 0) * pixelsPerSecond;
                          const width = Math.max((overlay.duration || 3) * pixelsPerSecond, 30);
                          const endX = startX + width;
                          return endX >= visibleStartX && startX <= visibleEndX;
                        })
                        .map(overlay => {
                        const startX = (overlay.startTime || 0) * pixelsPerSecond;
                        const duration = Math.max(0.2, overlay.duration || 3);
                        const width = Math.max(duration * pixelsPerSecond, 30);
                        const isDraggingText = draggingTextId === overlay.id;

                        return (
                          <div
                            key={overlay.id}
                            className={`absolute h-full bg-amber-300/10 border border-amber-200/25 rounded-md group ${isDraggingText ? 'opacity-90' : ''}`}
                            style={{ left: `${startX}px`, width: `${width}px`, top: 0 }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectText?.(overlay.id);
                            }}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-amber-100/30"
                              onMouseDown={e => {
                                if (!onUpdateTextOverlay) return;
                                e.stopPropagation();
                                onSelectText?.(overlay.id);
                                draggingTextRef.current = {
                                  id: overlay.id,
                                  mode: 'resize-start',
                                  startClientX: e.clientX,
                                  initialStart: overlay.startTime || 0,
                                  initialDuration: duration,
                                };
                                setDraggingTextId(overlay.id);
                                document.body.style.cursor = 'ew-resize';
                                document.body.style.userSelect = 'none';
                              }}
                              title="Drag to adjust start"
                            />

                            <div className="flex h-full items-center px-2 gap-1.5">
                              <p
                                className="text-[10px] text-amber-100/75 truncate flex-1 min-w-0 cursor-grab active:cursor-grabbing"
                                onMouseDown={e => {
                                  if (!onUpdateTextOverlay) return;
                                  e.stopPropagation();
                                  onSelectText?.(overlay.id);
                                  draggingTextRef.current = {
                                    id: overlay.id,
                                    mode: 'move',
                                    startClientX: e.clientX,
                                    initialStart: overlay.startTime || 0,
                                    initialDuration: duration,
                                  };
                                  setDraggingTextId(overlay.id);
                                  document.body.style.cursor = 'grabbing';
                                  document.body.style.userSelect = 'none';
                                }}
                                title="Drag to move overlay in time"
                              >
                                {overlay.text}
                              </p>

                              {onRemoveText && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    onRemoveText(overlay.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>

                            <div
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-amber-100/30"
                              onMouseDown={e => {
                                if (!onUpdateTextOverlay) return;
                                e.stopPropagation();
                                onSelectText?.(overlay.id);
                                draggingTextRef.current = {
                                  id: overlay.id,
                                  mode: 'resize-end',
                                  startClientX: e.clientX,
                                  initialStart: overlay.startTime || 0,
                                  initialDuration: duration,
                                };
                                setDraggingTextId(overlay.id);
                                document.body.style.cursor = 'ew-resize';
                                document.body.style.userSelect = 'none';
                              }}
                              title="Drag to adjust duration"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ left: `${playheadPosition + LABEL_WIDTH}px` }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full shadow-lg" />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-zinc-900/95 border border-white/15 rounded-lg shadow-xl z-50 py-1 min-w-[140px] animate-fade-in backdrop-blur-sm"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          <button
            onClick={() => {
              handleSplitAtPlayhead(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Scissors className="w-3 h-3" />
            Split at Playhead
          </button>
          <button
            onClick={() => {
              onRemoveClip(contextMenu.clipId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-300/80 hover:bg-white/10 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
