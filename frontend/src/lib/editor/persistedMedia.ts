import type { Clip } from '@/lib/api';

export type MediaFix = { id: string; url: string };

export async function restorePersistedMediaUrls(
  restoredClips: Clip[],
  restoredAudio: Clip[],
  getBlob: (key: string) => Promise<Blob | null>
): Promise<{ videoFixes: MediaFix[]; audioFixes: MediaFix[] }> {
  const restoredVideoPromises = restoredClips.map(async (c) => {
    if (c.type !== 'video') return null;
    if (c.videoUrl || c.videoPath) return null;
    if (!c.persistedVideoKey) return null;
    const blob = await getBlob(c.persistedVideoKey);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    return { id: c.id, url };
  });

  const restoredAudioPromises = restoredAudio.map(async (c) => {
    if (c.type !== 'audio') return null;
    if (c.audioPath) return null;
    if (!c.persistedAudioKey) return null;
    const blob = await getBlob(c.persistedAudioKey);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    return { id: c.timelineId || c.id, url };
  });

  const videoFixes = (await Promise.all(restoredVideoPromises)).filter(Boolean) as MediaFix[];
  const audioFixes = (await Promise.all(restoredAudioPromises)).filter(Boolean) as MediaFix[];

  return { videoFixes, audioFixes };
}
