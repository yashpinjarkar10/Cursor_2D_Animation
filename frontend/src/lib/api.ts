/**
 * Web-compatible API abstraction layer
 * Replaces Electron IPC calls with direct HTTP calls to the FastAPI backend
 */
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Use a same-origin proxy to avoid browser CORS issues in production.
// The proxy routes forward requests to the actual backend.
const BACKEND_URL = '/api/backend';

async function extractFastApiErrorMessage(data: unknown): Promise<string | undefined> {
  if (!data) return undefined;

  // Axios with responseType: 'blob' returns Blob on errors too.
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed?.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    } catch {
      // Not JSON
    }
    return text.trim() || undefined;
  }

  if (typeof data === 'string') return data.trim() || undefined;

  if (typeof data === 'object') {
    const maybeDetail = (data as { detail?: unknown }).detail;
    if (typeof maybeDetail === 'string' && maybeDetail.trim()) return maybeDetail;
  }

  return undefined;
}

// Types
export interface Clip {
  id: string;
  type: 'video' | 'audio';
  source: 'backend' | 'local' | 'upload';
  videoUrl?: string;
  videoPath?: string;
  audioPath?: string;
  // Optional IndexedDB persistence keys for blob media.
  // When present, the app can restore media after refresh.
  persistedVideoKey?: string;
  persistedAudioKey?: string;
  // Web Speech API (free) text-to-speech support for audio clips.
  ttsText?: string;
  // BCP-47 language tag (e.g. "en-US", "hi-IN") used to improve pronunciation and
  // provide a best-effort fallback when the exact voice name isn't available.
  ttsLang?: string;
  ttsVoice?: string;
  // Camb.ai voice ID (integer). Used by the /api/tts proxy.
  ttsVoiceId?: number;
  ttsRate?: number;
  ttsPitch?: number;
  ttsVolume?: number;
  code?: string;
  codeFilename?: string;
  name: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  path?: string;
  timelineId?: string;
  startTime?: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface GeneratingTask {
  taskId: string;
  prompt: string;
  status: string;
  message: string;
  progress: number;
  isRender?: boolean;
  isExport?: boolean;
}

export interface ExportSettings {
  quality: string;
  aspectRatio: string;
  resolution: string;
}

// Session management (browser-only)
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return uuidv4();
  
  const savedSessionId = sessionStorage.getItem('video-editor-session-id');
  if (savedSessionId) {
    return savedSessionId;
  }
  const newId = uuidv4();
  sessionStorage.setItem('video-editor-session-id', newId);
  return newId;
}

export function resetSession(): string {
  const newId = uuidv4();
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('video-editor-session-id', newId);
  }
  return newId;
}

// API calls
export async function generateVideo(
  prompt: string,
  sessionId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  videoUrl?: string;
  codeFilename?: string;
  error?: string;
  prompt?: string;
}> {
  try {
    onProgress?.(10, 'Sending prompt to AI...');
    
    const response = await axios.post(
      `${BACKEND_URL}/generate`,
      { query: prompt },
      {
        responseType: 'blob',
        timeout: 180000, // 3 minute timeout
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            onProgress?.(Math.max(50, pct), 'Downloading video...');
          }
        },
      }
    );

    onProgress?.(90, 'Processing video...');

    // Get code file path from headers
    const codeFilePath = response.headers['x-code-file-path'] || '';
    const codeFilename = codeFilePath.split(/[/\\]/).pop() || '';

    // Create blob URL for the video
    const blob = new Blob([response.data], { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(blob);

    onProgress?.(100, 'Complete!');

    return {
      success: true,
      videoUrl,
      codeFilename,
      prompt,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    const errorMessage =
      (await extractFastApiErrorMessage(err.response?.data)) ||
      err.message ||
      'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function getCodeFile(filename: string): Promise<{
  success: boolean;
  code?: string;
  error?: string;
}> {
  try {
    const response = await axios.get(`${BACKEND_URL}/get_code/${encodeURIComponent(filename)}`);
    return {
      success: true,
      code: response.data.code,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { detail?: string } }; message?: string };
    return {
      success: false,
      error: err.response?.data?.detail || err.message,
    };
  }
}

export async function renderManim(
  code: string,
  sceneName: string = 'Scene1',
  onProgress?: (progress: number, message: string) => void
): Promise<{
  success: boolean;
  videoUrl?: string;
  sceneName?: string;
  error?: string;
}> {
  try {
    onProgress?.(10, 'Sending code to renderer...');

    const response = await axios.post(
      `${BACKEND_URL}/render`,
      {
        filename: `render_${Date.now()}`,
        code,
        SceneName: sceneName,
      },
      {
        responseType: 'blob',
        timeout: 180000,
      }
    );

    onProgress?.(90, 'Processing rendered video...');

    const blob = new Blob([response.data], { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(blob);

    onProgress?.(100, 'Render complete!');

    return {
      success: true,
      videoUrl,
      sceneName,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    const errorMessage =
      (await extractFastApiErrorMessage(err.response?.data)) ||
      err.message ||
      'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${BACKEND_URL}/health`, { timeout: 5000 });
    return response.data?.ok === true;
  } catch {
    return false;
  }
}

// Utility: download a blob URL as a file
export function downloadVideo(blobUrl: string, filename: string = 'video.mp4') {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Utility: upload a local file and return a blob URL
export function createBlobFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    resolve(url);
  });
}
