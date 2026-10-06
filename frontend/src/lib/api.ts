import axios, { AxiosError } from 'axios';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export function formatApiError(err: unknown, fallbackMessage = 'An unexpected error occurred'): string {
  if (!err) return fallbackMessage;
  const axiosErr = err as { response?: { data?: { detail?: unknown } }; message?: string; code?: string };
  const detail = axiosErr.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string })?.msg || JSON.stringify(d)))
      .join(', ');
  }
  if (typeof detail === 'object' && detail !== null) {
    return JSON.stringify(detail);
  }
  if (axiosErr.message === 'Network Error' || axiosErr.code === 'ERR_NETWORK') {
    return 'Cannot connect to backend server. Please verify backend is running on http://localhost:8000.';
  }
  if (axiosErr.message) return axiosErr.message;
  return fallbackMessage;
}

export interface User {
  id: string;
  email: string;
  display_name?: string | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number | null;
  user?: User;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  project_id: string;
  user_id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
}

export type GenerationMode = 'create' | 'modify' | 'extend' | 'remove' | 'restructure';
export type GenerationQuality = 'low' | 'medium' | 'high';
export type GenerationStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Generation {
  id: string;
  chat_id: string;
  user_id: string;
  query: string;
  mode: GenerationMode;
  status: GenerationStatus;
  video_url?: string | null;
  generated_code?: string | null;
  scene_class?: string | null;
  duration?: number | null;
  attempt_count: number;
  error_message?: string | null;
  failure_type?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface GeneratePayload {
  query: string;
  mode?: GenerationMode;
  duration?: number;
  aspect_ratio?: string;
  quality?: GenerationQuality;
  voiceover_enabled?: boolean;
  project_context?: Record<string, unknown>;
}

export interface SSEProgressEvent {
  event: string;
  data: Record<string, unknown>;
}

// Token storage helpers
const TOKEN_KEY = 'manim_auth_access_token';
const REFRESH_KEY = 'manim_auth_refresh_token';

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setStoredTokens(tokens: { access_token: string; refresh_token: string }): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// Axios instance with auth interceptor
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean });
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getStoredRefreshToken();
      if (refreshToken) {
        try {
          const res = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          setStoredTokens({
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token,
          });
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`;
          }
          return apiClient(originalRequest);
        } catch {
          clearStoredTokens();
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
            window.location.href = '/auth/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
export async function signupUser(email: string, password: string, displayName?: string): Promise<AuthTokens> {
  const res = await apiClient.post<AuthTokens>('/auth/signup', {
    email,
    password,
    display_name: displayName,
  });
  setStoredTokens(res.data);
  return res.data;
}

export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  const res = await apiClient.post<AuthTokens>('/auth/login', { email, password });
  setStoredTokens(res.data);
  return res.data;
}

export async function getCurrentUser(): Promise<User> {
  const res = await apiClient.get<User>('/auth/me');
  return res.data;
}

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------
export async function listProjects(): Promise<Project[]> {
  const res = await apiClient.get<{ projects: Project[]; total: number }>('/projects');
  return res.data.projects;
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const res = await apiClient.post<Project>('/projects', { name, description });
  return res.data;
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await apiClient.get<Project>(`/projects/${projectId}`);
  return res.data;
}

export async function updateProject(
  projectId: string,
  data: { name?: string; description?: string }
): Promise<Project> {
  const res = await apiClient.patch<Project>(`/projects/${projectId}`, data);
  return res.data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Chats API
// ---------------------------------------------------------------------------
export async function listChats(projectId: string): Promise<Chat[]> {
  const res = await apiClient.get<{ chats: Chat[]; project_id: string; total: number }>(
    `/projects/${projectId}/chats`
  );
  return res.data.chats;
}

export async function createChat(projectId: string, title?: string): Promise<Chat> {
  const res = await apiClient.post<Chat>(`/projects/${projectId}/chats`, { title });
  return res.data;
}

export async function getChat(projectId: string, chatId: string): Promise<Chat> {
  const res = await apiClient.get<Chat>(`/projects/${projectId}/chats/${chatId}`);
  return res.data;
}

export async function deleteChat(projectId: string, chatId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/chats/${chatId}`);
}

// ---------------------------------------------------------------------------
// Generations API
// ---------------------------------------------------------------------------
export async function listGenerations(projectId: string, chatId: string): Promise<Generation[]> {
  const res = await apiClient.get<{ generations: Generation[]; chat_id: string; total: number }>(
    `/projects/${projectId}/chats/${chatId}/generations`
  );
  return res.data.generations;
}

export async function getGeneration(generationId: string): Promise<Generation> {
  const res = await apiClient.get<Generation>(`/generations/${generationId}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// SSE Animation Generation Stream
// ---------------------------------------------------------------------------
export async function streamAnimationGeneration({
  projectId,
  chatId,
  payload,
  onEvent,
  onError,
  onComplete,
}: {
  projectId: string;
  chatId: string;
  payload: GeneratePayload;
  onEvent: (event: string, data: Record<string, unknown>) => void;
  onError: (errorMsg: string) => void;
  onComplete: (data: Record<string, unknown>) => void;
}): Promise<void> {
  const token = getStoredAccessToken();
  const url = `${API_BASE_URL}/projects/${projectId}/chats/${chatId}/generate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query: payload.query,
      mode: payload.mode || 'create',
      duration: payload.duration || 30.0,
      aspect_ratio: payload.aspect_ratio || '16:9',
      quality: payload.quality || 'low',
      voiceover_enabled: payload.voiceover_enabled || false,
      project_context: payload.project_context || null,
    }),
  });

  if (!response.ok) {
    let errorDetail = `Failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch {
      // not JSON
    }
    onError(errorDetail);
    return;
  }

  if (!response.body) {
    onError('No response body returned from server');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (!block.trim()) continue;

        let currentEvent = 'message';
        let currentData = '';

        const eventLines = block.split('\n');
        for (const line of eventLines) {
          if (line.startsWith('event:')) {
            currentEvent = line.replace('event:', '').trim();
          } else if (line.startsWith('data:')) {
            currentData = line.replace('data:', '').trim();
          }
        }

        if (currentData) {
          try {
            const parsedData = JSON.parse(currentData);
            if (currentEvent === 'complete') {
              onComplete(parsedData);
            } else if (currentEvent === 'error') {
              onError(parsedData.error || 'Animation generation encountered an error');
            } else {
              onEvent(currentEvent, parsedData);
            }
          } catch {
            onEvent(currentEvent, { raw: currentData });
          }
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stream interrupted';
    onError(message);
  }
}
