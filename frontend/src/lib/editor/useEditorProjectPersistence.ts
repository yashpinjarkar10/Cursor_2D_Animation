import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Clip, TextOverlay } from '@/lib/api';
import {
  EDITOR_PROJECT_STORAGE_KEY,
  type EditorProjectSnapshotV1,
  buildSnapshotV1,
  isBlobUrl,
  normalizeClipFromStorage,
  safeParseSnapshot,
} from '@/lib/editor/projectSnapshot';
import { restorePersistedMediaUrls } from '@/lib/editor/persistedMedia';

export type EditorProjectPersistenceArgs = {
  clips: Clip[];
  audioClips: Clip[];
  textOverlays: TextOverlay[];
  currentCode: string;
  currentVideo: string | null;
  currentTime: number;
  selectedClip: Clip | null;
  selectedTextOverlay: TextOverlay | null;
  playerHeight: number;
  showCodeEditor: boolean;
  showRightPanel: boolean;
  leftPanelSplit: number;

  setClips: Dispatch<SetStateAction<Clip[]>>;
  setAudioClips: Dispatch<SetStateAction<Clip[]>>;
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
  setCurrentCode: Dispatch<SetStateAction<string>>;
  setCurrentVideo: Dispatch<SetStateAction<string | null>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setSelectedClip: Dispatch<SetStateAction<Clip | null>>;
  setSelectedTextOverlay: Dispatch<SetStateAction<TextOverlay | null>>;
  setPlayerHeight: Dispatch<SetStateAction<number>>;
  setShowCodeEditor: Dispatch<SetStateAction<boolean>>;
  setShowRightPanel: Dispatch<SetStateAction<boolean>>;
  setLeftPanelSplit: Dispatch<SetStateAction<number>>;

  getBlob: (key: string) => Promise<Blob | null>;
};

export function useEditorProjectPersistence(args: EditorProjectPersistenceArgs): {
  restorePersistedMedia: (restoredClips: Clip[], restoredAudio: Clip[]) => Promise<void>;
  setPlayheadForSave: (time: number) => void;
  skipNextAutosave: () => void;
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
  } = args;

  const hasHydratedProjectRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const playheadForSaveRef = useRef(0);
  const skipNextAutosaveRef = useRef(false);

  const setPlayheadForSave = useCallback((time: number) => {
    playheadForSaveRef.current = time;
  }, []);

  const skipNextAutosave = useCallback(() => {
    skipNextAutosaveRef.current = true;
  }, []);

  const restorePersistedMedia = useCallback(
    async (restoredClips: Clip[], restoredAudio: Clip[]) => {
      if (typeof window === 'undefined') return;

      try {
        const { videoFixes, audioFixes } = await restorePersistedMediaUrls(restoredClips, restoredAudio, getBlob);

        if (videoFixes.length) {
          setClips(prev =>
            prev.map(c => {
              if (c.type !== 'video') return c;
              const fix = videoFixes.find(f => f.id === c.id);
              if (!fix) return c;
              if (c.videoUrl || c.videoPath) return c;
              return { ...c, videoUrl: fix.url };
            })
          );
        }

        if (audioFixes.length) {
          setAudioClips(prev =>
            prev.map(c => {
              const id = c.timelineId || c.id;
              const fix = audioFixes.find(f => f.id === id);
              if (!fix) return c;
              if (c.audioPath) return c;
              return { ...c, audioPath: fix.url };
            })
          );
        }
      } catch {
        // Ignore restore failures (private mode/quota/etc.)
      }
    },
    [getBlob, setAudioClips, setClips]
  );

  // Restore project from localStorage on load (refresh-safe).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(EDITOR_PROJECT_STORAGE_KEY);
    if (!raw) {
      hasHydratedProjectRef.current = true;
      return;
    }

    const snapshot = safeParseSnapshot(raw);
    if (!snapshot) {
      hasHydratedProjectRef.current = true;
      return;
    }

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

    const hydratedTime = typeof snapshot.currentTime === 'number' && Number.isFinite(snapshot.currentTime) ? snapshot.currentTime : 0;
    setCurrentTime(hydratedTime);
    playheadForSaveRef.current = hydratedTime;

    // Restore UI layout.
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

    // Restore selection.
    const selId = typeof snapshot.selectedClipId === 'string' ? snapshot.selectedClipId : null;
    if (selId) {
      const found = restoredClips.find(c => c.id === selId) || restoredAudio.find(c => (c.timelineId || c.id) === selId);
      if (found) setSelectedClip(found);
    }

    const selTextId = typeof snapshot.selectedTextId === 'string' ? snapshot.selectedTextId : null;
    if (selTextId) {
      const foundText = (snapshot.textOverlays || []).find(t => t.id === selTextId) || null;
      setSelectedTextOverlay(foundText);
    }

    hasHydratedProjectRef.current = true;

    void restorePersistedMedia(restoredClips, restoredAudio);
  }, [
    restorePersistedMedia,
    setAudioClips,
    setClips,
    setCurrentCode,
    setCurrentTime,
    setCurrentVideo,
    setLeftPanelSplit,
    setPlayerHeight,
    setSelectedClip,
    setSelectedTextOverlay,
    setShowCodeEditor,
    setShowRightPanel,
    setTextOverlays,
  ]);

  // Best-effort: persist playhead on unload (don’t write on every tick).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeUnload = () => {
      playheadForSaveRef.current = currentTime;
      try {
        const raw = window.localStorage.getItem(EDITOR_PROJECT_STORAGE_KEY);
        if (!raw) return;
        const snap = safeParseSnapshot(raw);
        if (!snap) return;
        const next: EditorProjectSnapshotV1 = { ...snap, savedAt: Date.now(), currentTime: playheadForSaveRef.current };
        window.localStorage.setItem(EDITOR_PROJECT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [currentTime]);

  // Auto-save project to localStorage (debounced).
  // Important: do NOT autosave on every playhead tick (perf). Persist playhead separately.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasHydratedProjectRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const snapshot: EditorProjectSnapshotV1 = buildSnapshotV1({
        clips,
        audioClips,
        textOverlays,
        currentCode,
        currentVideo,
        currentTime: playheadForSaveRef.current,
        selectedClipId: selectedClip?.id || null,
        selectedTextId: selectedTextOverlay?.id || null,
        ui: {
          playerHeight,
          showCodeEditor,
          showRightPanel,
          leftPanelSplit,
        },
      });

      try {
        window.localStorage.setItem(EDITOR_PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Storage can fail (quota/private mode). Don't break the editor.
      }
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    audioClips,
    clips,
    currentCode,
    currentVideo,
    leftPanelSplit,
    playerHeight,
    selectedClip,
    selectedTextOverlay,
    showCodeEditor,
    showRightPanel,
    textOverlays,
  ]);

  return { restorePersistedMedia, setPlayheadForSave, skipNextAutosave };
}
