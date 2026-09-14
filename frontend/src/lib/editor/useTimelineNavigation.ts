import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Clip } from '@/lib/api';
import type { VideoTimelineModel } from '@/lib/editor/videoTimelineModel';

export function useTimelineNavigation(args: {
  videoTimeline: VideoTimelineModel;
  selectedClip: Clip | null;
  currentTime: number;

  setCurrentTime: Dispatch<SetStateAction<number>>;
  setPlayheadForSave: (time: number) => void;
  setSelectedClip: Dispatch<SetStateAction<Clip | null>>;
  setCurrentVideo: Dispatch<SetStateAction<string | null>>;
  setCurrentCode: Dispatch<SetStateAction<string>>;
  setSeekToTime: Dispatch<SetStateAction<number | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
}): {
  handleSeek: (globalTime: number) => void;
  handleTimeUpdate: (localTime: number, clipId?: string) => void;
  handlePlayStateChange: (playing: boolean) => void;
  handleClipEnded: (nextClip: Clip) => void;
} {
  const {
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
  } = args;

  const handleSeek = useCallback(
    (globalTime: number) => {
      setCurrentTime(globalTime);
      setPlayheadForSave(globalTime);

      const found = videoTimeline.findByGlobalTime(globalTime);
      if (!found) return;

      const { clip, localTime } = found;
      if (selectedClip?.id !== clip.id) {
        setSelectedClip(clip);
        setCurrentVideo(clip.videoUrl || clip.videoPath || null);
        setCurrentCode(clip.code || '');
      }
      setSeekToTime(localTime);
    },
    [selectedClip?.id, setCurrentCode, setCurrentTime, setCurrentVideo, setPlayheadForSave, setSeekToTime, setSelectedClip, videoTimeline]
  );

  const handleTimeUpdate = useCallback(
    (localTime: number, clipId?: string) => {
      if (!clipId) {
        setCurrentTime(localTime);
        return;
      }
      const timelineStart = videoTimeline.startById.get(clipId) || 0;
      const clip = videoTimeline.byId.get(clipId);
      if (clip) {
        const relativeTime = localTime - (clip.trimStart || 0);
        setCurrentTime(timelineStart + relativeTime);
      }
    },
    [setCurrentTime, videoTimeline]
  );

  const handlePlayStateChange = useCallback(
    (playing: boolean) => {
      setIsPlaying(playing);
      if (!playing) {
        // Only persist playhead when pausing (not on every tick).
        setPlayheadForSave(currentTime);
      }
    },
    [currentTime, setIsPlaying, setPlayheadForSave]
  );

  const handleClipEnded = useCallback(
    (nextClip: Clip) => {
      setSelectedClip(nextClip);
      setCurrentVideo(nextClip.videoUrl || nextClip.videoPath || null);
      setCurrentCode(nextClip.code || '');
    },
    [setCurrentCode, setCurrentVideo, setSelectedClip]
  );

  return { handleSeek, handleTimeUpdate, handlePlayStateChange, handleClipEnded };
}
