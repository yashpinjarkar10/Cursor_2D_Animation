import type { Clip, TextOverlay } from '@/lib/api';

export const EDITOR_PROJECT_STORAGE_KEY = 'video-editor-project-v1';

export type EditorProjectSnapshotV1 = {
  v: 1;
  savedAt: number;
  clips: Clip[];
  audioClips: Clip[];
  textOverlays: TextOverlay[];
  currentCode: string;
  currentVideo: string | null;
  currentTime: number;
  selectedClipId: string | null;
  selectedTextId: string | null;
  ui: {
    playerHeight: number;
    showCodeEditor: boolean;
    showRightPanel: boolean;
    leftPanelSplit: number;
  };
};

export function isBlobUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

export function sanitizeClipForStorage(clip: Clip): Clip {
  const sanitized: Clip = { ...clip };
  if (isBlobUrl(sanitized.videoUrl)) delete sanitized.videoUrl;
  if (isBlobUrl(sanitized.videoPath)) delete sanitized.videoPath;
  if (isBlobUrl(sanitized.audioPath)) delete sanitized.audioPath;
  return sanitized;
}

export function normalizeClipFromStorage(maybe: Partial<Clip> | null | undefined): Clip | null {
  if (!maybe || typeof maybe !== 'object') return null;
  if (maybe.type !== 'video' && maybe.type !== 'audio') return null;
  if (maybe.source !== 'backend' && maybe.source !== 'local' && maybe.source !== 'upload') return null;
  if (typeof maybe.id !== 'string' || !maybe.id) return null;
  if (typeof maybe.name !== 'string' || !maybe.name) return null;

  const duration = typeof maybe.duration === 'number' && Number.isFinite(maybe.duration) ? maybe.duration : 0;
  const trimStart = typeof maybe.trimStart === 'number' && Number.isFinite(maybe.trimStart) ? maybe.trimStart : 0;
  const trimEnd = typeof maybe.trimEnd === 'number' && Number.isFinite(maybe.trimEnd) ? maybe.trimEnd : 0;

  const clip: Clip = {
    id: maybe.id,
    type: maybe.type,
    source: maybe.source,
    name: maybe.name,
    duration,
    trimStart,
    trimEnd,
    timelineId: typeof maybe.timelineId === 'string' ? maybe.timelineId : undefined,
    startTime: typeof maybe.startTime === 'number' && Number.isFinite(maybe.startTime) ? maybe.startTime : undefined,
    videoUrl: typeof maybe.videoUrl === 'string' && !isBlobUrl(maybe.videoUrl) ? maybe.videoUrl : undefined,
    videoPath: typeof maybe.videoPath === 'string' && !isBlobUrl(maybe.videoPath) ? maybe.videoPath : undefined,
    audioPath: typeof maybe.audioPath === 'string' && !isBlobUrl(maybe.audioPath) ? maybe.audioPath : undefined,
    persistedVideoKey: typeof maybe.persistedVideoKey === 'string' ? maybe.persistedVideoKey : undefined,
    persistedAudioKey: typeof maybe.persistedAudioKey === 'string' ? maybe.persistedAudioKey : undefined,
    code: typeof maybe.code === 'string' ? maybe.code : undefined,
    codeFilename: typeof maybe.codeFilename === 'string' ? maybe.codeFilename : undefined,
    path: typeof maybe.path === 'string' ? maybe.path : undefined,
    ttsText: typeof maybe.ttsText === 'string' ? maybe.ttsText : undefined,
    ttsLang: typeof maybe.ttsLang === 'string' ? maybe.ttsLang : undefined,
    ttsVoice: typeof maybe.ttsVoice === 'string' ? maybe.ttsVoice : undefined,
    ttsRate: typeof maybe.ttsRate === 'number' && Number.isFinite(maybe.ttsRate) ? maybe.ttsRate : undefined,
    ttsPitch: typeof maybe.ttsPitch === 'number' && Number.isFinite(maybe.ttsPitch) ? maybe.ttsPitch : undefined,
    ttsVolume: typeof maybe.ttsVolume === 'number' && Number.isFinite(maybe.ttsVolume) ? maybe.ttsVolume : undefined,
  };
  return clip;
}

export function safeParseSnapshot(raw: string): EditorProjectSnapshotV1 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EditorProjectSnapshotV1>;
    if (!parsed || parsed.v !== 1) return null;
    if (!Array.isArray(parsed.clips) || !Array.isArray(parsed.audioClips) || !Array.isArray(parsed.textOverlays)) return null;
    return parsed as EditorProjectSnapshotV1;
  } catch {
    return null;
  }
}

export function buildSnapshotV1(args: {
  clips: Clip[];
  audioClips: Clip[];
  textOverlays: TextOverlay[];
  currentCode: string;
  currentVideo: string | null;
  currentTime: number;
  selectedClipId: string | null;
  selectedTextId: string | null;
  ui: EditorProjectSnapshotV1['ui'];
  savedAt?: number;
}): EditorProjectSnapshotV1 {
  return {
    v: 1,
    savedAt: typeof args.savedAt === 'number' && Number.isFinite(args.savedAt) ? args.savedAt : Date.now(),
    clips: args.clips.map(sanitizeClipForStorage),
    audioClips: args.audioClips.map(sanitizeClipForStorage),
    textOverlays: args.textOverlays,
    currentCode: args.currentCode,
    currentVideo: args.currentVideo && !isBlobUrl(args.currentVideo) ? args.currentVideo : null,
    currentTime: args.currentTime,
    selectedClipId: args.selectedClipId,
    selectedTextId: args.selectedTextId,
    ui: args.ui,
  };
}
