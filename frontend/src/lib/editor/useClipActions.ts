import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '@/lib/api';
import { putBlob, deleteBlob } from '@/lib/blobStore';
import { audioBlobKeyForClipId, videoBlobKeyForClipId } from '@/lib/editor/blobStoreKeys';
import { blobFromObjectUrl } from '@/lib/editor/objectUrl';
import { isBlobUrl } from '@/lib/editor/projectSnapshot';

export function useClipActions(args: {
  currentTime: number;
  clips: Clip[];
  audioClips: Clip[];
  selectedClip: Clip | null;

  clipsRef: MutableRefObject<Clip[]>;

  setClips: Dispatch<SetStateAction<Clip[]>>;
  setAudioClips: Dispatch<SetStateAction<Clip[]>>;
  setSelectedClip: Dispatch<SetStateAction<Clip | null>>;
  setCurrentVideo: Dispatch<SetStateAction<string | null>>;
  setCurrentCode: Dispatch<SetStateAction<string>>;

  revokeBlobUrl: (url?: string) => void;
  hasShownStorageWarningRef: MutableRefObject<boolean>;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

  estimateTtsDurationSeconds: (text: string, rate?: number) => number;
  speechStateRef: MutableRefObject<{ clipId: string | null }>;
  stopSpeech: () => void;
}): {
  handleAddClip: (clip: Partial<Clip>) => void;
  handleRemoveClip: (clipId: string) => void;
  handleRemoveAudioFromTimeline: (audioId: string) => void;
  handleMoveAudioOnTimeline: (audioId: string, startTime: number) => void;
  handleAddTtsAudio: (data: {
    text: string;
    lang?: string;
    voice?: string;
    voiceId?: number;
    rate?: number;
    pitch?: number;
    volume?: number;
  }) => Promise<void>;
  handleUpdateClip: (clip: Clip) => void;
  handleSelectClip: (clip: Clip | null) => void;
  handleRemoveAsset: (assetId: string, assetType: string) => void;
  handleDurationChange: (clipId: string, duration: number) => void;
  handleTrimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  handleSplitClip: (clipId: string, splitTime: number) => void;
} {
  const {
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
  } = args;

  const maybeRevokeClipBlobUrls = useCallback(
    (clip: Clip | undefined, remainingClips: Clip[], remainingAudio: Clip[]) => {
      if (!clip) return;

      const videoUrl = clip.videoUrl;
      if (videoUrl && videoUrl.startsWith('blob:')) {
        const stillUsed = remainingClips.some(c => c.videoUrl === videoUrl) || remainingAudio.some(c => c.videoUrl === videoUrl);
        if (!stillUsed) revokeBlobUrl(videoUrl);
      }

      const audioUrl = clip.audioPath;
      if (audioUrl && audioUrl.startsWith('blob:')) {
        const stillUsed = remainingClips.some(c => c.audioPath === audioUrl) || remainingAudio.some(c => c.audioPath === audioUrl);
        if (!stillUsed) revokeBlobUrl(audioUrl);
      }
    },
    [revokeBlobUrl]
  );

  const handleAddClip = useCallback(
    (clip: Partial<Clip>) => {
      const clipId = uuidv4();
      const isVideo = (clip.type || 'video') === 'video';
      const isAudio = (clip.type || 'video') === 'audio';

      const newClip: Clip = {
        id: clipId,
        type: clip.type || 'video',
        source: clip.source || 'upload',
        videoUrl: clip.videoUrl,
        audioPath: clip.audioPath,
        persistedVideoKey: isVideo ? videoBlobKeyForClipId(clipId) : undefined,
        persistedAudioKey: isAudio ? audioBlobKeyForClipId(clipId) : undefined,
        name: clip.name || 'Untitled',
        duration: clip.duration || 0,
        trimStart: clip.trimStart || 0,
        trimEnd: clip.trimEnd || 0,
      };

      // Persist uploaded blob media so it survives refresh.
      void (async () => {
        try {
          if (newClip.type === 'video' && newClip.videoUrl && isBlobUrl(newClip.videoUrl) && newClip.persistedVideoKey) {
            const blob = await blobFromObjectUrl(newClip.videoUrl);
            await putBlob(newClip.persistedVideoKey, blob);
          }
          if (newClip.type === 'audio' && newClip.audioPath && isBlobUrl(newClip.audioPath) && newClip.persistedAudioKey) {
            const blob = await blobFromObjectUrl(newClip.audioPath);
            await putBlob(newClip.persistedAudioKey, blob);
          }
        } catch {
          if (!hasShownStorageWarningRef.current) {
            hasShownStorageWarningRef.current = true;
            showToast('Storage is full/blocked; uploads may not survive refresh', 'warning');
          }
        }
      })();

      setClips(prev => [...prev, newClip]);
      showToast(`Added: ${newClip.name}`, 'success');
    },
    [hasShownStorageWarningRef, setClips, showToast]
  );

  const handleRemoveClip = useCallback(
    (clipId: string) => {
      const removedClip = clips.find(c => c.id === clipId);
      const remainingClips = clips.filter(c => c.id !== clipId);
      setClips(remainingClips);

      const remainingAudio = audioClips.filter(a => a.id !== clipId && a.timelineId !== clipId);
      if (remainingAudio.length !== audioClips.length) {
        setAudioClips(remainingAudio);
      }

      maybeRevokeClipBlobUrls(removedClip, remainingClips, remainingAudio);

      // Remove persisted blobs (best-effort).
      if (removedClip?.persistedVideoKey) {
        void deleteBlob(removedClip.persistedVideoKey).catch(() => {});
      }
      if (removedClip?.persistedAudioKey) {
        void deleteBlob(removedClip.persistedAudioKey).catch(() => {});
      }

      if (selectedClip?.id === clipId) {
        setSelectedClip(null);
        setCurrentVideo(null);
        setCurrentCode('');
      }
      if (removedClip) showToast(`Removed: ${removedClip.name}`, 'info');
    },
    [audioClips, clips, maybeRevokeClipBlobUrls, selectedClip?.id, setAudioClips, setClips, setCurrentCode, setCurrentVideo, setSelectedClip, showToast]
  );

  const handleRemoveAudioFromTimeline = useCallback(
    (audioId: string) => {
      setAudioClips(prev => {
        const removed = prev.find(a => (a.timelineId || a.id) === audioId);
        const remaining = prev.filter(a => (a.timelineId || a.id) !== audioId);
        maybeRevokeClipBlobUrls(removed, clipsRef.current, remaining);
        return remaining;
      });
      if (speechStateRef.current.clipId === audioId) stopSpeech();
      showToast('Audio removed from timeline', 'info');
    },
    [clipsRef, maybeRevokeClipBlobUrls, setAudioClips, showToast, speechStateRef, stopSpeech]
  );

  const handleMoveAudioOnTimeline = useCallback(
    (audioId: string, startTime: number) => {
      setAudioClips(prev => prev.map(a => ((a.timelineId || a.id) === audioId ? { ...a, startTime } : a)));
      setClips(prev => prev.map(c => (c.type === 'audio' && (c.timelineId || c.id) === audioId ? { ...c, startTime } : c)));
    },
    [setAudioClips, setClips]
  );

  /**
   * Add a TTS audio clip. Calls /api/tts (Camb.ai SDK proxy) to generate real audio.
   * Falls back to estimated duration if the API call fails.
   */
  const handleAddTtsAudio = useCallback(
    async (data: {
      text: string;
      lang?: string;
      voice?: string;
      voiceId?: number;
      rate?: number;
      pitch?: number;
      volume?: number;
    }) => {
      const startTime = currentTime;
      const text = data.text;
      const id = uuidv4();
      const clipName = `TTS: ${text.substring(0, 32)}${text.length > 32 ? '…' : ''}`;
      const estimatedDuration = estimateTtsDurationSeconds(text, data.rate);
      const voiceId = data.voiceId || 147320;
      const lang = data.lang || 'en-us';

      // Try generating real audio via Camb.ai
      let audioPath: string | undefined;
      let realDuration = estimatedDuration;

      try {
        showToast('Generating speech…', 'info');
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            language: lang,
            voice_id: voiceId,
          }),
        });

        if (response.ok) {
          const blob = await response.blob();
          audioPath = URL.createObjectURL(blob);

          // Get actual duration from the audio
          realDuration = await new Promise<number>((resolve) => {
            const tempAudio = new Audio(audioPath!);
            tempAudio.addEventListener('loadedmetadata', () => {
              const dur = Number.isFinite(tempAudio.duration) ? tempAudio.duration : estimatedDuration;
              resolve(dur);
            });
            tempAudio.addEventListener('error', () => resolve(estimatedDuration));
            setTimeout(() => resolve(estimatedDuration), 5000);
          });
        } else {
          const errBody = await response.text();
          console.error('Camb.ai TTS failed:', response.status, errBody);
        }
      } catch (err) {
        console.error('Camb.ai TTS error:', err);
      }

      const newAudio: Clip = {
        id,
        timelineId: id,
        type: 'audio',
        source: 'local',
        audioPath,
        ttsText: text,
        ttsLang: lang,
        ttsVoice: data.voice,
        ttsVoiceId: voiceId,
        ttsRate: data.rate,
        ttsPitch: data.pitch,
        ttsVolume: data.volume,
        name: clipName,
        duration: realDuration,
        trimStart: 0,
        trimEnd: realDuration,
        startTime,
      };

      setClips(prev => [...prev, newAudio]);
      setAudioClips(prev => [...prev, newAudio]);
      setSelectedClip(newAudio);
      showToast(audioPath ? 'Speech generated and added to timeline' : 'Speech added (API unavailable)', 'success');
    },
    [currentTime, estimateTtsDurationSeconds, setAudioClips, setClips, setSelectedClip, showToast]
  );

  const handleUpdateClip = useCallback(
    (clip: Clip) => {
      setClips(prev => prev.map(c => (c.id === clip.id ? clip : c)));
      if (clip.type === 'audio') {
        setAudioClips(prev => prev.map(a => ((a.timelineId || a.id) === clip.id ? { ...a, ...clip } : a)));
      }
    },
    [setAudioClips, setClips]
  );

  const handleSelectClip = useCallback(
    (clip: Clip | null) => {
      if (clip) {
        setSelectedClip(clip);
        if (clip.type === 'video') {
          setCurrentVideo(clip.videoUrl || clip.videoPath || null);
        }
        setCurrentCode(clip.code || '');
      } else {
        setSelectedClip(null);
        setCurrentCode('');
      }
    },
    [setCurrentCode, setCurrentVideo, setSelectedClip]
  );

  const handleRemoveAsset = useCallback(
    (assetId: string, assetType: string) => {
      const removedClip = clips.find(c => c.id === assetId);
      const remainingClips = clips.filter(c => c.id !== assetId);
      setClips(remainingClips);

      const remainingAudio = assetType === 'audio'
        ? audioClips.filter(a => a.id !== assetId && a.timelineId !== assetId)
        : audioClips;

      if (assetType === 'audio') setAudioClips(remainingAudio);

      maybeRevokeClipBlobUrls(removedClip, remainingClips, remainingAudio);

      if (removedClip?.persistedVideoKey) {
        void deleteBlob(removedClip.persistedVideoKey).catch(() => {});
      }
      if (removedClip?.persistedAudioKey) {
        void deleteBlob(removedClip.persistedAudioKey).catch(() => {});
      }

      if (selectedClip?.id === assetId) {
        setSelectedClip(null);
        if (assetType === 'video') setCurrentVideo(null);
        setCurrentCode('');
      }
      if (removedClip) showToast(`Removed: ${removedClip.name}`, 'info');
    },
    [audioClips, clips, maybeRevokeClipBlobUrls, selectedClip?.id, setAudioClips, setClips, setCurrentCode, setCurrentVideo, setSelectedClip, showToast]
  );

  const handleDurationChange = useCallback(
    (clipId: string, duration: number) => {
      setClips(prev =>
        prev.map(c => {
          if (c.id === clipId) {
            const newClip = { ...c, duration };
            if (!c.trimEnd || c.trimEnd === 0) newClip.trimEnd = duration;
            if (c.trimStart === undefined) newClip.trimStart = 0;
            return newClip;
          }
          return c;
        })
      );
    },
    [setClips]
  );

  const handleTrimClip = useCallback(
    (clipId: string, trimStart: number, trimEnd: number) => {
      setClips(prev => prev.map(c => (c.id === clipId ? { ...c, trimStart, trimEnd } : c)));
    },
    [setClips]
  );

  const handleSplitClip = useCallback(
    (clipId: string, splitTime: number) => {
      setClips(prev => {
        const clipIndex = prev.findIndex(c => c.id === clipId);
        if (clipIndex === -1) return prev;
        const clip = prev[clipIndex];
        const firstPart: Clip = {
          ...clip,
          id: uuidv4(),
          name: clip.name.replace(/ \(part \d+\)$/, '') + ' (part 1)',
          trimEnd: splitTime,
        };
        const secondPart: Clip = {
          ...clip,
          id: uuidv4(),
          name: clip.name.replace(/ \(part \d+\)$/, '') + ' (part 2)',
          trimStart: splitTime,
        };
        const newClips = [...prev];
        newClips.splice(clipIndex, 1, firstPart, secondPart);
        return newClips;
      });
      showToast('Clip split into two parts', 'success');
    },
    [setClips, showToast]
  );

  return {
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
  };
}
