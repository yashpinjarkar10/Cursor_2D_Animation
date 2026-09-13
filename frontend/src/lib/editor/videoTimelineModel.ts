import type { Clip } from '@/lib/api';

export type VideoTimelineRange = {
  id: string;
  start: number;
  end: number;
  trimStart: number;
};

export type VideoTimelineModel = {
  ordered: Clip[];
  startById: Map<string, number>;
  byId: Map<string, Clip>;
  total: number;
  ranges: VideoTimelineRange[];
  findByGlobalTime: (globalTime: number) => { clip: Clip; localTime: number } | null;
};

export function buildVideoTimelineModel(clips: Clip[]): VideoTimelineModel {
  const ordered = clips.filter(c => c.type === 'video');
  const startById = new Map<string, number>();
  const byId = new Map<string, Clip>();
  const ranges: VideoTimelineRange[] = [];

  let t = 0;
  for (const clip of ordered) {
    const dur = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
    const safeDur = Math.max(0, dur);
    startById.set(clip.id, t);
    byId.set(clip.id, clip);
    ranges.push({ id: clip.id, start: t, end: t + safeDur, trimStart: clip.trimStart || 0 });
    t += safeDur;
  }

  const total = t;

  const findByGlobalTime = (globalTime: number) => {
    if (!ranges.length) return null;
    const g = Math.max(0, Math.min(globalTime, Math.max(0, total)));

    // Binary search for range containing g.
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ranges[mid];
      if (g < r.start) {
        hi = mid - 1;
      } else if (g >= r.end) {
        lo = mid + 1;
      } else {
        const clip = byId.get(r.id);
        if (!clip) return null;
        const localTime = r.trimStart + (g - r.start);
        return { clip, localTime };
      }
    }

    // If g is exactly at the end, treat it as last frame of last clip.
    const last = ranges[ranges.length - 1];
    const clip = byId.get(last.id);
    if (!clip) return null;
    return { clip, localTime: (clip.trimEnd || clip.duration || 0) };
  };

  return { ordered, startById, byId, total, ranges, findByGlobalTime };
}
