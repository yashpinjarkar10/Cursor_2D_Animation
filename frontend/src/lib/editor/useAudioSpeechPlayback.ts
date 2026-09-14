import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Clip } from '@/lib/api';

export function useAudioSpeechPlayback(args: {
  audioClips: Clip[];
  setAudioClips: Dispatch<SetStateAction<Clip[]>>;
  audioClipsRef: MutableRefObject<Clip[]>;
  currentTime: number;
  isPlaying: boolean;
}): {
  audioPlayersRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  speechStateRef: MutableRefObject<{ clipId: string | null }>;
  estimateTtsDurationSeconds: (text: string, rate?: number) => number;
  stopSpeech: () => void;
  speakClip: (clip: Clip) => void;
} {
  const audioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const speechStateRef = useRef<{ clipId: string | null }>({ clipId: null });
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const { audioClips, setAudioClips, audioClipsRef, currentTime, isPlaying } = args;

  const estimateTtsDurationSeconds = useCallback((text: string, rate?: number): number => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    // Rough baseline: 170 WPM at rate=1.
    const wpm = 170 * (typeof rate === 'number' && rate > 0 ? rate : 1);
    const seconds = words > 0 ? (words / wpm) * 60 : 1;
    return Math.max(1, Math.min(120, Number.isFinite(seconds) ? seconds : 3));
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    speechStateRef.current.clipId = null;
  }, []);

  // Cache voices list for more reliable voice selection (some browsers load voices async).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.speechSynthesis === 'undefined') return;

    const loadVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices();
      } catch {
        voicesRef.current = [];
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const speakClip = useCallback(
    (clip: Clip) => {
      if (typeof window === 'undefined') return;
      if (!clip.ttsText) return;

      const id = clip.timelineId || clip.id;
      stopSpeech();

      const utterance = new SpeechSynthesisUtterance(clip.ttsText);
      if (typeof clip.ttsRate === 'number') utterance.rate = clip.ttsRate;
      if (typeof clip.ttsPitch === 'number') utterance.pitch = clip.ttsPitch;
      if (typeof clip.ttsVolume === 'number') utterance.volume = clip.ttsVolume;

      // Note: voice selection is optional and browser-dependent.
      if (clip.ttsVoice) {
        const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
        const match = voices.find(v => v.name === clip.ttsVoice);
        if (match) {
          utterance.voice = match;
          // Key multilingual improvement: align utterance language with chosen voice.
          if (match.lang) utterance.lang = match.lang;
        }
      }

      // If the saved voice isn't available (common across devices), try selecting
      // any voice matching the stored language.
      if (!utterance.voice && clip.ttsLang) {
        const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
        const byLang = voices.find(v => v.lang === clip.ttsLang);
        if (byLang) utterance.voice = byLang;
      }

      // Ensure language is set even if no voice matched.
      if (!utterance.lang && clip.ttsLang) {
        utterance.lang = clip.ttsLang;
      }

      // Fallback language: helps some engines choose correct pronunciation.
      if (!utterance.lang) {
        try {
          utterance.lang = window.navigator.language || 'en-US';
        } catch {
          // ignore
        }
      }

      utterance.onend = () => {
        if (speechStateRef.current.clipId === id) {
          speechStateRef.current.clipId = null;
        }
      };

      speechStateRef.current.clipId = id;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        speechStateRef.current.clipId = null;
      }
    },
    [stopSpeech]
  );

  // Keep audio elements in sync with audioClips list (create/remove).
  useEffect(() => {
    const players = audioPlayersRef.current;
    const keep = new Set<string>();

    for (const clip of audioClips) {
      const id = clip.timelineId || clip.id;
      if (!clip.audioPath) continue;
      keep.add(id);

      const existing = players.get(id);
      if (existing) {
        if (existing.src !== clip.audioPath) existing.src = clip.audioPath;
        continue;
      }

      const audio = new Audio(clip.audioPath);
      audio.preload = 'auto';
      players.set(id, audio);

      const onLoaded = () => {
        const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (!dur) return;
        setAudioClips(prev =>
          prev.map(c => {
            const cid = c.timelineId || c.id;
            if (cid !== id) return c;
            // Only fill in if missing.
            const nextDuration = c.duration || dur;
            const nextTrimEnd = c.trimEnd || dur;
            return { ...c, duration: nextDuration, trimEnd: nextTrimEnd };
          })
        );
      };

      audio.addEventListener('loadedmetadata', onLoaded);

      // Cleanup listener if this audio element ever gets removed.
      (audio as unknown as { __onLoaded?: () => void }).__onLoaded = onLoaded;
    }

    for (const [id, audio] of players.entries()) {
      if (keep.has(id)) continue;
      try {
        audio.pause();
      } catch {
        // ignore
      }
      const onLoaded = (audio as unknown as { __onLoaded?: () => void }).__onLoaded;
      if (onLoaded) audio.removeEventListener('loadedmetadata', onLoaded);
      players.delete(id);
    }
  }, [audioClips, setAudioClips]);

  const syncAudioToTime = useCallback(
    (globalTime: number, playing: boolean) => {
      const players = audioPlayersRef.current;

      for (const clip of audioClipsRef.current) {
        const id = clip.timelineId || clip.id;
        const audio = players.get(id);
        if (!audio) continue;

        const start = clip.startTime || 0;
        const clipDur = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
        const end = start + Math.max(0, clipDur);

        // If duration unknown, treat as potentially active after start.
        const isActive = clipDur > 0 ? globalTime >= start && globalTime <= end : globalTime >= start;

        if (!isActive) {
          try {
            if (!audio.paused) audio.pause();
            if (audio.currentTime !== 0) audio.currentTime = 0;
          } catch {
            // ignore
          }
          continue;
        }

        const target = Math.max(0, (clip.trimStart || 0) + (globalTime - start));

        // Avoid constant seeking; only correct if drift is meaningful.
        try {
          if (Math.abs(audio.currentTime - target) > 0.25) {
            audio.currentTime = target;
          }
          if (playing) {
            if (audio.paused) {
              void audio.play().catch(() => {});
            }
          } else {
            if (!audio.paused) audio.pause();
          }
        } catch {
          // ignore
        }
      }

      // Web Speech API TTS playback — legacy fallback for clips WITHOUT audioPath.
      // Clips generated via Camb.ai have real audioPath and are played as <audio> elements above.
      if (typeof window === 'undefined') return;

      // Keep pause/resume behavior consistent.
      try {
        if (!playing) {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
          }
        } else {
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        }
      } catch {
        // ignore
      }

      const ttsClips = audioClipsRef.current
        .filter(c => typeof c.ttsText === 'string' && c.ttsText.trim() && !c.audioPath)
        .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

      const active = ttsClips.find(c => {
        const start = c.startTime || 0;
        const dur = (c.trimEnd || c.duration || 0) - (c.trimStart || 0);
        const end = start + Math.max(0, dur);
        return globalTime >= start && (dur > 0 ? globalTime <= end : true);
      });

      const activeId = active ? (active.timelineId || active.id) : null;

      // If we left the active clip window, stop speaking.
      if (!activeId) {
        if (speechStateRef.current.clipId) stopSpeech();
        return;
      }

      // If we are inside a TTS clip and playing, ensure it's started.
      if (playing) {
        if (speechStateRef.current.clipId !== activeId) {
          speakClip(active as Clip);
        } else {
          // If synthesis got cancelled externally, restart once.
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            speakClip(active as Clip);
          }
        }
      }
    },
    [audioClipsRef, speakClip, stopSpeech]
  );

  // Sync audio on seek/time updates and play/pause.
  useEffect(() => {
    syncAudioToTime(currentTime, isPlaying);
  }, [currentTime, isPlaying, syncAudioToTime]);

  return { audioPlayersRef, speechStateRef, estimateTtsDurationSeconds, stopSpeech, speakClip };
}
