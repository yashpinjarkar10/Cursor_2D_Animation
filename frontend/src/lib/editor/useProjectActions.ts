import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Clip, TextOverlay } from '@/lib/api';
import { clearAllBlobs } from '@/lib/blobStore';
import {
  EDITOR_PROJECT_STORAGE_KEY,
  type EditorProjectSnapshotV1,
  buildSnapshotV1,
  isBlobUrl,
  normalizeClipFromStorage,
  safeParseSnapshot,
} from '@/lib/editor/projectSnapshot';

export function useProjectActions(args: {
  clips: Clip[];
  audioClips: Clip[];
  textOverlays: TextOverlay[];
  currentCode: string;
  currentVideo: string | null;
  currentTime: number;
  selectedClip: Clip | null;
  selectedTextOverlay: TextOverlay | null;
  ui: {
    playerHeight: number;
    showCodeEditor: boolean;
    showRightPanel: boolean;
    leftPanelSplit: number;
  };

  clipsRef: MutableRefObject<Clip[]>;
  audioClipsRef: MutableRefObject<Clip[]>;
  audioPlayersRef: MutableRefObject<Map<string, HTMLAudioElement>>;

  setClips: Dispatch<SetStateAction<Clip[]>>;
  setAudioClips: Dispatch<SetStateAction<Clip[]>>;
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
  setSelectedClip: Dispatch<SetStateAction<Clip | null>>;
  setSelectedTextOverlay: Dispatch<SetStateAction<TextOverlay | null>>;
  setCurrentVideo: Dispatch<SetStateAction<string | null>>;
  setCurrentCode: Dispatch<SetStateAction<string>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setSeekToTime: Dispatch<SetStateAction<number | null>>;

  setPlayerHeight: Dispatch<SetStateAction<number>>;
  setShowCodeEditor: Dispatch<SetStateAction<boolean>>;
  setShowRightPanel: Dispatch<SetStateAction<boolean>>;
  setLeftPanelSplit: Dispatch<SetStateAction<number>>;

  revokeBlobUrl: (url?: string) => void;
  stopSpeech: () => void;
  restorePersistedMedia: (restoredClips: Clip[], restoredAudio: Clip[]) => Promise<void>;
  skipNextAutosave: () => void;
  setPlayheadForSave: (time: number) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}): {
  handleExportProject: () => void;
  handleImportProject: (jsonText: string) => void;
  handleClearProject: () => void;
} {
  const {
    clips,
    audioClips,
    textOverlays,
    currentCode,
    currentVideo,
    currentTime,
    selectedClip,
    selectedTextOverlay,
    ui,
    clipsRef,
    audioClipsRef,
    audioPlayersRef,
    setClips,
    setAudioClips,
    setTextOverlays,
    setSelectedClip,
    setSelectedTextOverlay,
    setCurrentVideo,
    setCurrentCode,
    setCurrentTime,
    setIsPlaying,
    setSeekToTime,
    setPlayerHeight,
    setShowCodeEditor,
    setShowRightPanel,
    setLeftPanelSplit,
    revokeBlobUrl,
    stopSpeech,
    restorePersistedMedia,
    skipNextAutosave,
    setPlayheadForSave,
    showToast,
  } = args;

  const handleExportProject = useCallback(() => {
    if (typeof window === 'undefined') return;

    const snapshot: EditorProjectSnapshotV1 = buildSnapshotV1({
      clips,
      audioClips,
      textOverlays,
      currentCode,
      currentVideo,
      currentTime,
      selectedClipId: selectedClip?.id || null,
      selectedTextId: selectedTextOverlay?.id || null,
      ui,
    });

    try {
      const json = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manim_project_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Project exported (JSON)', 'success');
    } catch {
      showToast('Failed to export project', 'error');
    }
  }, [audioClips, clips, currentCode, currentTime, currentVideo, selectedClip?.id, selectedTextOverlay?.id, showToast, textOverlays, ui]);

  const applyImportedSnapshot = useCallback(async (snapshot: EditorProjectSnapshotV1) => {
    const restoredClips = snapshot.clips
      .map(c => normalizeClipFromStorage(c))
      .filter(Boolean) as Clip[];
    const restoredAudio = snapshot.audioClips
      .map(c => normalizeClipFromStorage(c))
      .filter(Boolean) as Clip[];

    setClips(restoredClips);
    setAudioClips(restoredAudio);
    setTextOverlays(Array.isArray(snapshot.textOverlays) ? snapshot.textOverlays : []);

    setCurrentCode(typeof snapshot.currentCode === 'string' ? snapshot.currentCode : '');
    setCurrentVideo(typeof snapshot.currentVideo === 'string' && !isBlobUrl(snapshot.currentVideo) ? snapshot.currentVideo : null);
    const importedTime = typeof snapshot.currentTime === 'number' && Number.isFinite(snapshot.currentTime) ? snapshot.currentTime : 0;
    setCurrentTime(importedTime);
    setPlayheadForSave(importedTime);

    if (snapshot.ui) {
      if (typeof snapshot.ui.playerHeight === 'number' && Number.isFinite(snapshot.ui.playerHeight)) {
        setPlayerHeight(snapshot.ui.playerHeight);
      }
      if (typeof snapshot.ui.showCodeEditor === 'boolean') setShowCodeEditor(snapshot.ui.showCodeEditor);
      if (typeof snapshot.ui.showRightPanel === 'boolean') setShowRightPanel(snapshot.ui.showRightPanel);
      if (typeof snapshot.ui.leftPanelSplit === 'number' && Number.isFinite(snapshot.ui.leftPanelSplit)) {
        setLeftPanelSplit(snapshot.ui.leftPanelSplit);
      }
    }

    const selId = typeof snapshot.selectedClipId === 'string' ? snapshot.selectedClipId : null;
    if (selId) {
      const found = restoredClips.find(c => c.id === selId) || restoredAudio.find(c => (c.timelineId || c.id) === selId);
      setSelectedClip(found || null);
    } else {
      setSelectedClip(null);
    }

    const selTextId = typeof snapshot.selectedTextId === 'string' ? snapshot.selectedTextId : null;
    if (selTextId) {
      const foundText = (snapshot.textOverlays || []).find(t => t.id === selTextId) || null;
      setSelectedTextOverlay(foundText);
    } else {
      setSelectedTextOverlay(null);
    }

    await restorePersistedMedia(restoredClips, restoredAudio);
  }, [restorePersistedMedia, setAudioClips, setClips, setCurrentCode, setCurrentTime, setCurrentVideo, setLeftPanelSplit, setPlayheadForSave, setPlayerHeight, setSelectedClip, setSelectedTextOverlay, setShowCodeEditor, setShowRightPanel, setTextOverlays]);

  const handleImportProject = useCallback((jsonText: string) => {
    if (typeof window === 'undefined') return;
    const snapshot = safeParseSnapshot(jsonText);
    if (!snapshot) {
      showToast('Invalid project JSON', 'error');
      return;
    }

    void (async () => {
      try {
        await applyImportedSnapshot(snapshot);
        try {
          window.localStorage.setItem(EDITOR_PROJECT_STORAGE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
        } catch {
          // ignore
        }
        showToast('Project imported', 'success');
      } catch {
        showToast('Failed to import project', 'error');
      }
    })();
  }, [applyImportedSnapshot, showToast]);

  const handleClearProject = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Clear the saved project and all stored media? This cannot be undone.');
    if (!ok) return;

    skipNextAutosave();
    setPlayheadForSave(0);

    // Stop playback
    setIsPlaying(false);
    setSeekToTime(null);
    stopSpeech();

    // Best-effort pause any audio elements.
    for (const audio of audioPlayersRef.current.values()) {
      try { audio.pause(); } catch { /* ignore */ }
    }
    audioPlayersRef.current.clear();

    // Revoke blob URLs
    const urlsToRevoke = new Set<string>();
    for (const clip of [...clipsRef.current, ...audioClipsRef.current]) {
      if (clip.videoUrl?.startsWith('blob:')) urlsToRevoke.add(clip.videoUrl);
      if (clip.audioPath?.startsWith('blob:')) urlsToRevoke.add(clip.audioPath);
    }
    urlsToRevoke.forEach(url => revokeBlobUrl(url));

    // Clear state
    setClips([]);
    setAudioClips([]);
    setTextOverlays([]);
    setSelectedClip(null);
    setSelectedTextOverlay(null);
    setCurrentVideo(null);
    setCurrentCode('');
    setCurrentTime(0);

    // Clear persistence
    try {
      window.localStorage.removeItem(EDITOR_PROJECT_STORAGE_KEY);
    } catch {
      // ignore
    }
    void clearAllBlobs().catch(() => {});

    showToast('Project cleared', 'info');
  }, [audioClipsRef, audioPlayersRef, clipsRef, revokeBlobUrl, setAudioClips, setClips, setCurrentCode, setCurrentTime, setCurrentVideo, setIsPlaying, setPlayheadForSave, setSeekToTime, setSelectedClip, setSelectedTextOverlay, setTextOverlays, showToast, skipNextAutosave, stopSpeech]);

  return { handleExportProject, handleImportProject, handleClearProject };
}
