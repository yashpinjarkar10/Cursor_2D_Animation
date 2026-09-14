'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Toast from '@/components/editor/Toast';
import Toolbar from '@/components/editor/Toolbar';
import VideoPlayer from '@/components/editor/VideoPlayer';
import CodeEditor from '@/components/editor/CodeEditor';
import AssetPanel from '@/components/editor/AssetPanel';
import PropertiesPanel from '@/components/editor/PropertiesPanel';
import Timeline from '@/components/editor/Timeline';
import ChatPrompt from '@/components/editor/ChatPrompt';
import { getBlob } from '@/lib/blobStore';
import { buildVideoTimelineModel } from '@/lib/editor/videoTimelineModel';
import { useEditorProjectPersistence } from '@/lib/editor/useEditorProjectPersistence';
import { useAudioSpeechPlayback } from '@/lib/editor/useAudioSpeechPlayback';
import { useGenerationController } from '@/lib/editor/useGenerationController';
import { useClipActions } from '@/lib/editor/useClipActions';
import { useTextOverlayActions } from '@/lib/editor/useTextOverlayActions';
import { useTimelineNavigation } from '@/lib/editor/useTimelineNavigation';
import {
  downloadVideo,
  getOrCreateSessionId,
  type Clip,
  type TextOverlay,
  type ExportSettings,
} from '@/lib/api';

const COMPACT_BREAKPOINT = 1280;

export default function EditorPage() {
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [audioClips, setAudioClips] = useState<Clip[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [selectedTextOverlay, setSelectedTextOverlay] = useState<TextOverlay | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  // Layout state
  const [playerHeight, setPlayerHeight] = useState(260);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCodeEditorFullscreen, setIsCodeEditorFullscreen] = useState(false);
  const [leftPanelSplit, setLeftPanelSplit] = useState(45); // percentage for ChatPrompt
  const leftPanelDragging = useRef(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const wasCompactRef = useRef<boolean | null>(null);
  const compactHintShownRef = useRef(false);

  const hasShownStorageWarningRef = useRef(false);
  const { setPlayheadForSave } = useEditorProjectPersistence({
    clips,
    audioClips,
    textOverlays,
    currentCode,
    currentVideo,
    currentTime,
    selectedClip,
    selectedTextOverlay,
    playerHeight,
    showCodeEditor,
    showRightPanel,
    leftPanelSplit,
    setClips,
    setAudioClips,
    setTextOverlays,
    setCurrentCode,
    setCurrentVideo,
    setCurrentTime,
    setSelectedClip,
    setSelectedTextOverlay,
    setPlayerHeight,
    setShowCodeEditor,
    setShowRightPanel,
    setLeftPanelSplit,
    getBlob,
  });

  // Memoized video timeline model (fast seek/time updates).
  const videoTimeline = useMemo(() => buildVideoTimelineModel(clips), [clips]);

  // Check if selected clip is trimmed
  const isSelectedClipTrimmed = useMemo(() => {
    if (!selectedClip || selectedClip.type !== 'video') return false;
    const hasTrimStart = selectedClip.trimStart > 0;
    const hasTrimEnd = selectedClip.duration > 0 && selectedClip.trimEnd > 0 && selectedClip.trimEnd < selectedClip.duration;
    return hasTrimStart || hasTrimEnd;
  }, [selectedClip]);

  const displayCode = useMemo(() => {
    if (isSelectedClipTrimmed) return '';
    return currentCode;
  }, [currentCode, isSelectedClipTrimmed]);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const {
    generatingTasks,
    isGenerating,
    generationProgress,
    generationMessage,
    generationError,
    isRendering,
    handleGenerateVideo,
    handleCancelGeneration,
    handleRenderCode,
  } = useGenerationController({
    sessionId,
    showToast,
    hasShownStorageWarningRef,
    setClips,
    setSelectedClip,
    setCurrentVideo,
    setCurrentCode,
  });

  const selectedClipId = selectedClip?.id;

  const handleCodeChange = useCallback((code: string) => {
    setCurrentCode(code);
    if (!selectedClipId) return;
    setClips(prev => prev.map(c => (c.id === selectedClipId ? { ...c, code } : c)));
  }, [selectedClipId]);

  // Keep selectedClip reference up-to-date when clips are updated (trim/duration/name/code, etc.)
  useEffect(() => {
    if (!selectedClip) return;
    const updated = clips.find(c => c.id === selectedClip.id);
    if (!updated) {
      setSelectedClip(null);
      return;
    }
    if (updated !== selectedClip) setSelectedClip(updated);
  }, [clips, selectedClip]);

  const clipsRef = useRef<Clip[]>([]);
  const audioClipsRef = useRef<Clip[]>([]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    audioClipsRef.current = audioClips;
  }, [audioClips]);

  const {
    speechStateRef,
    estimateTtsDurationSeconds,
    stopSpeech,
  } = useAudioSpeechPlayback({
    audioClips,
    setAudioClips,
    audioClipsRef,
    currentTime,
    isPlaying,
  });

  const revokeBlobUrl = useCallback((url?: string) => {
    if (!url || !url.startsWith('blob:')) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

  const {
    handleAddClip,
    handleRemoveClip,
    handleRemoveAudioFromTimeline,
    handleMoveAudioOnTimeline,
    handleAddTtsAudio,
    handleUpdateClip,
    handleSelectClip,
    handleRemoveAsset,
    handleDurationChange,
    handleTrimClip,
    handleSplitClip,
  } = useClipActions({
    currentTime,
    clips,
    audioClips,
    selectedClip,
    clipsRef,
    setClips,
    setAudioClips,
    setSelectedClip,
    setCurrentVideo,
    setCurrentCode,
    revokeBlobUrl,
    hasShownStorageWarningRef,
    showToast,
    estimateTtsDurationSeconds,
    speechStateRef,
    stopSpeech,
  });

  // (Audio + Web Speech sync moved to src/lib/editor/useAudioSpeechPlayback.ts)

  useEffect(() => {
    return () => {
      const urlsToRevoke = new Set<string>();
      for (const clip of [...clipsRef.current, ...audioClipsRef.current]) {
        if (clip.videoUrl?.startsWith('blob:')) urlsToRevoke.add(clip.videoUrl);
        if (clip.audioPath?.startsWith('blob:')) urlsToRevoke.add(clip.audioPath);
      }
      urlsToRevoke.forEach(url => revokeBlobUrl(url));
    };
  }, [revokeBlobUrl]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        if (isCodeEditorFullscreen) setIsCodeEditorFullscreen(false);
      }
      // Space bar → play/pause
      if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || ''))) {
        e.preventDefault();
        if (currentVideo) {
          setIsPlaying(prev => !prev);
        }
      }
      if (e.key === 'Delete' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || ''))) {
        if (selectedClip) {
          handleRemoveClip(selectedClip.id);
          setSelectedClip(null);
          if (selectedClip.type === 'video') setCurrentVideo(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, isCodeEditorFullscreen, selectedClip, currentVideo]);

  // (AI generation + render handlers moved to src/lib/editor/useGenerationController.ts)

  const {
    handleAddText,
    handleUpdateTextOverlay,
    handleUpdateText,
    handleRemoveText,
    handleSelectText,
  } = useTextOverlayActions({
    textOverlays,
    setTextOverlays,
    setSelectedTextOverlay,
    showToast,
  });

  const {
    handleSeek,
    handleTimeUpdate,
    handlePlayStateChange,
    handleClipEnded,
  } = useTimelineNavigation({
    videoTimeline,
    selectedClip,
    currentTime,
    setCurrentTime,
    setPlayheadForSave,
    setSelectedClip,
    setCurrentVideo,
    setCurrentCode,
    setSeekToTime,
    setIsPlaying,
  });

  // Export
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExport = useCallback((_settings: ExportSettings) => {
    if (!currentVideo) {
      showToast('No video to export', 'error');
      return;
    }
    downloadVideo(currentVideo, `manim_export_${Date.now()}.mp4`);
    showToast('Video download started!', 'success');
  }, [currentVideo, showToast]);

  // Code drawer resize (drag handle lives at the bottom edge of the video area)
  const handlePlayerResize = useCallback((deltaY: number) => {
    setPlayerHeight(prev => {
      const minH = 170;
      const maxH = Math.min(460, Math.floor(window.innerHeight * 0.55));
      return Math.max(minH, Math.min(maxH, prev - deltaY));
    });
  }, []);

  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);
  const toggleCodeEditor = useCallback(() => setShowCodeEditor(prev => !prev), []);

  // Responsive hierarchy: under 1280, keep preview + timeline dominant.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyResponsiveHierarchy = () => {
      const compact = window.innerWidth < COMPACT_BREAKPOINT;
      setIsCompactLayout(compact);

      const prevCompact = wasCompactRef.current;
      wasCompactRef.current = compact;

      if (prevCompact === compact) return;
      if (compact) {
        setShowRightPanel(false);
        setShowCodeEditor(false);
        setLeftPanelSplit(prev => Math.max(35, Math.min(60, prev)));
        setPlayerHeight(prev => Math.max(170, Math.min(320, prev)));

        if (!compactHintShownRef.current) {
          showToast('Compact layout enabled: focus on Preview + Timeline.', 'info');
          compactHintShownRef.current = true;
        }
        return;
      }

      // Keep properties visible by default on desktop layout.
      setShowRightPanel(true);
    };

    applyResponsiveHierarchy();
    window.addEventListener('resize', applyResponsiveHierarchy, { passive: true });
    return () => window.removeEventListener('resize', applyResponsiveHierarchy);
  }, [showToast]);

  useEffect(() => {
    const handlePanelShortcuts = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleCodeEditor();
        return;
      }
    };

    window.addEventListener('keydown', handlePanelShortcuts);
    return () => window.removeEventListener('keydown', handlePanelShortcuts);
  }, [toggleCodeEditor]);

  // Left panel split resize
  const handleLeftPanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftPanelDragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!leftPanelDragging.current || !leftPanelRef.current) return;
      const rect = leftPanelRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setLeftPanelSplit(Math.max(35, Math.min(70, pct)));
    };
    const handleMouseUp = () => {
      leftPanelDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen text-white studio-shell-bg">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Fullscreen Video Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col">
          <VideoPlayer
            videoUrl={currentVideo}
            selectedClip={selectedClip}
            onDurationChange={handleDurationChange}
            onTimeUpdate={handleTimeUpdate}
            onPlayStateChange={handlePlayStateChange}
            currentTime={currentTime}
            textOverlays={textOverlays}
            isPlaying={isPlaying}
            clips={clips}
            onClipEnded={handleClipEnded}
            seekToTime={seekToTime}
            onSeekComplete={() => setSeekToTime(null)}
            playerHeight={window.innerHeight}
            onResize={() => {}}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={true}
            showCodeEditor={false}
            onToggleCodeEditor={() => {}}
            onUpdateTextOverlay={handleUpdateTextOverlay}
            selectedTextId={selectedTextOverlay?.id}
            onSelectTextOverlay={handleSelectText}
          />
        </div>
      )}

      {/* Code Editor Fullscreen */}
      {isCodeEditorFullscreen && (
        <div className="fixed inset-0 bg-zinc-900/95 z-50 flex flex-col">
          <CodeEditor
            code={displayCode}
            onChange={isSelectedClipTrimmed ? undefined : handleCodeChange}
            onRender={handleRenderCode}
            isRendering={isRendering}
            isFullscreen={true}
            onToggleFullscreen={() => setIsCodeEditorFullscreen(false)}
            readOnly={isSelectedClipTrimmed}
            placeholder={isSelectedClipTrimmed ? 'Code not available for trimmed clips' : undefined}
          />
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        onExport={handleExport}
        isRendering={isRendering}
      />

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - AI Chat + Assets */}
        <div ref={leftPanelRef} className="w-56 lg:w-[15.5rem] xl:w-64 flex flex-col border-r border-white/10 bg-zinc-900/70 shrink-0">
          {/* Chat Prompt */}
          <div className="overflow-hidden" style={{ height: `${leftPanelSplit}%`, minHeight: '120px' }}>
            <ChatPrompt
              onGenerateVideo={handleGenerateVideo}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              generationMessage={generationMessage}
              generationError={generationError}
            />
          </div>
          {/* Resize Handle */}
          <div
            className="h-1.5 cursor-row-resize bg-white/5 hover:bg-white/20 transition-colors shrink-0 flex items-center justify-center"
            onMouseDown={handleLeftPanelDragStart}
          >
            <div className="w-8 h-0.5 bg-white/10 rounded-full" />
          </div>
          {/* Assets */}
          <div className="flex-1 min-h-[120px] overflow-hidden border-t border-white/10 bg-zinc-900/60">
            <AssetPanel
              clips={clips}
              selectedClip={selectedClip}
              onAddClip={handleAddClip}
              onSelectClip={handleSelectClip}
              onRemoveAsset={handleRemoveAsset}
              generatingTasks={generatingTasks}
              onCancelGeneration={handleCancelGeneration}
            />
          </div>
        </div>

        {/* Center Panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Video Player */}
          <div
            className="relative z-10 overflow-hidden flex-1 min-h-[220px]"
          >
            <VideoPlayer
              videoUrl={currentVideo}
              selectedClip={selectedClip}
              onDurationChange={handleDurationChange}
              onTimeUpdate={handleTimeUpdate}
              onPlayStateChange={handlePlayStateChange}
              currentTime={currentTime}
              textOverlays={textOverlays}
              isPlaying={isPlaying}
              clips={clips}
              onClipEnded={handleClipEnded}
              seekToTime={seekToTime}
              onSeekComplete={() => setSeekToTime(null)}
              playerHeight={playerHeight}
              onResize={handlePlayerResize}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              showCodeEditor={showCodeEditor}
              onToggleCodeEditor={toggleCodeEditor}
              onUpdateTextOverlay={handleUpdateTextOverlay}
              selectedTextId={selectedTextOverlay?.id}
              onSelectTextOverlay={handleSelectText}
            />
          </div>

          {/* Code Editor */}
          {showCodeEditor && (
            <div
              className="shrink-0 min-h-[170px] overflow-hidden border-t border-white/10 bg-zinc-900/60"
              style={{ height: `${Math.max(170, Math.min(460, playerHeight))}px`, maxHeight: '55%' }}
            >
              <CodeEditor
                code={displayCode}
                onChange={isSelectedClipTrimmed ? undefined : handleCodeChange}
                onRender={handleRenderCode}
                isRendering={isRendering}
                isFullscreen={false}
                onToggleFullscreen={() => setIsCodeEditorFullscreen(true)}
                readOnly={isSelectedClipTrimmed}
                placeholder={isSelectedClipTrimmed ? 'Code not available for trimmed clips' : undefined}
              />
            </div>
          )}
        </div>

        {/* Right Panel - Properties */}
        {showRightPanel && !isCompactLayout && (
          <PropertiesPanel
            selectedClip={selectedClip}
            onUpdateClip={handleUpdateClip}
            onAddText={handleAddText}
            onAddTtsAudio={handleAddTtsAudio}
            currentTime={currentTime}
            selectedTextOverlay={selectedTextOverlay}
            onUpdateText={handleUpdateText}
            onSelectText={handleSelectText}
            onRemoveText={handleRemoveText}
            textOverlays={textOverlays}
          />
        )}
      </div>

      {/* Timeline */}
      <Timeline
        clips={clips}
        selectedClip={selectedClip}
        onSelectClip={handleSelectClip}
        onRemoveClip={handleRemoveClip}
        onReorderClips={setClips}
        audioClips={audioClips}
        textOverlays={textOverlays}
        onTrimClip={handleTrimClip}
        onSplitClip={handleSplitClip}
        onRemoveAudio={handleRemoveAudioFromTimeline}
        onMoveAudio={handleMoveAudioOnTimeline}
        onRemoveText={handleRemoveText}
        onSelectText={handleSelectText}
        onUpdateTextOverlay={handleUpdateTextOverlay}
        currentTime={currentTime}
        onSeek={handleSeek}
      />
    </div>
  );
}
