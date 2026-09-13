import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { putBlob } from '@/lib/blobStore';
import { blobFromObjectUrl } from '@/lib/editor/objectUrl';
import { videoBlobKeyForClipId } from '@/lib/editor/blobStoreKeys';
import {
  generateVideo,
  getCodeFile,
  renderManim,
  type Clip,
  type GeneratingTask,
} from '@/lib/api';

export function useGenerationController(args: {
  sessionId: string;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  hasShownStorageWarningRef: MutableRefObject<boolean>;
  setClips: Dispatch<SetStateAction<Clip[]>>;
  setSelectedClip: Dispatch<SetStateAction<Clip | null>>;
  setCurrentVideo: Dispatch<SetStateAction<string | null>>;
  setCurrentCode: Dispatch<SetStateAction<string>>;
}): {
  generatingTasks: GeneratingTask[];
  isGenerating: boolean;
  generationProgress: number;
  generationMessage: string;
  generationError: string | null;
  isRendering: boolean;
  handleGenerateVideo: (prompt: string) => Promise<void>;
  handleCancelGeneration: (taskId: string) => void;
  handleRenderCode: (code: string, sceneName?: string) => Promise<void>;
} {
  const [generatingTasks, setGeneratingTasks] = useState<GeneratingTask[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessage, setGenerationMessage] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const { showToast, hasShownStorageWarningRef, setClips, setSelectedClip, setCurrentVideo, setCurrentCode } = args;

  const sessionIdRef = useRef(args.sessionId);
  sessionIdRef.current = args.sessionId;

  const handleGenerateVideo = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationMessage('Starting...');
    setGenerationError(null);

    const taskId = uuidv4();
    setGeneratingTasks(prev => [
      ...prev,
      {
        taskId,
        prompt,
        status: 'generating',
        message: 'Sending to AI...',
        progress: 0,
      },
    ]);

    try {
      const result = await generateVideo(prompt, sessionIdRef.current, (progress, message) => {
        setGenerationProgress(progress);
        setGenerationMessage(message);
        setGeneratingTasks(prev =>
          prev.map(t =>
            t.taskId === taskId ? { ...t, progress, message, status: 'generating' } : t
          )
        );
      });

      setGeneratingTasks(prev => prev.filter(t => t.taskId !== taskId));

      if (result.success && result.videoUrl) {
        const videoUrl = result.videoUrl;
        let clipCode = '';
        const codeFilename = result.codeFilename || '';

        if (codeFilename) {
          try {
            const codeResult = await getCodeFile(codeFilename);
            if (codeResult.success && codeResult.code) {
              clipCode = codeResult.code;
            }
          } catch {
            // Code fetch is optional
          }
        }

        const clipId = uuidv4();
        const newClip: Clip = {
          id: clipId,
          type: 'video',
          source: 'backend',
          videoUrl,
          code: clipCode || undefined,
          codeFilename: codeFilename || undefined,
          name: `Generated: ${prompt.substring(0, 30)}...`,
          duration: 0,
          trimStart: 0,
          trimEnd: 0,
          persistedVideoKey: videoBlobKeyForClipId(clipId),
        };

        void (async () => {
          try {
            const blob = await blobFromObjectUrl(videoUrl);
            await putBlob(videoBlobKeyForClipId(clipId), blob);
          } catch {
            if (!hasShownStorageWarningRef.current) {
              hasShownStorageWarningRef.current = true;
              showToast('Storage is full/blocked; videos may not survive refresh', 'warning');
            }
          }
        })();

        setClips(prev => [...prev, newClip]);
        setSelectedClip(newClip);
        setCurrentVideo(videoUrl);
        setCurrentCode(clipCode);
        setGenerationError(null);
        showToast('Video generated successfully!', 'success');
      } else {
        const errorMessage = result.error || 'Unknown error';
        setGenerationError(errorMessage);
        showToast(`Failed to generate video: ${errorMessage}`, 'error');
      }
    } catch (error: unknown) {
      setGeneratingTasks(prev => prev.filter(t => t.taskId !== taskId));
      const errorMessage = (error as Error).message || 'Unknown error';
      setGenerationError(errorMessage);
      showToast(`Error: ${errorMessage}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [hasShownStorageWarningRef, setClips, setCurrentCode, setCurrentVideo, setSelectedClip, showToast]);

  const handleCancelGeneration = useCallback((taskId: string) => {
    setGeneratingTasks(prev => prev.filter(t => t.taskId !== taskId));
    showToast('Generation cancelled', 'info');
  }, [showToast]);

  const handleRenderCode = useCallback(async (code: string, sceneName: string = 'Scene1') => {
    setIsRendering(true);
    const taskId = uuidv4();
    setGeneratingTasks(prev => [
      ...prev,
      {
        taskId,
        prompt: `Render: ${sceneName}`,
        status: 'rendering',
        message: 'Starting render...',
        progress: 0,
        isRender: true,
      },
    ]);

    try {
      const result = await renderManim(code, sceneName, (progress, message) => {
        setGeneratingTasks(prev =>
          prev.map(t =>
            t.taskId === taskId ? { ...t, progress, message } : t
          )
        );
      });

      setGeneratingTasks(prev => prev.filter(t => t.taskId !== taskId));

      if (result.success && result.videoUrl) {
        const videoUrl = result.videoUrl;
        const clipId = uuidv4();
        const newClip: Clip = {
          id: clipId,
          type: 'video',
          source: 'backend',
          videoUrl,
          code,
          name: `Rendered: ${sceneName}`,
          duration: 0,
          trimStart: 0,
          trimEnd: 0,
          persistedVideoKey: videoBlobKeyForClipId(clipId),
        };

        void (async () => {
          try {
            const blob = await blobFromObjectUrl(videoUrl);
            await putBlob(videoBlobKeyForClipId(clipId), blob);
          } catch {
            if (!hasShownStorageWarningRef.current) {
              hasShownStorageWarningRef.current = true;
              showToast('Storage is full/blocked; videos may not survive refresh', 'warning');
            }
          }
        })();

        setClips(prev => [...prev, newClip]);
        setSelectedClip(newClip);
        setCurrentVideo(videoUrl);
        setCurrentCode(code);
        showToast(`Rendered scene: ${sceneName}`, 'success');
      } else {
        showToast(`Render failed: ${result.error}`, 'error');
      }
    } catch (error: unknown) {
      setGeneratingTasks(prev => prev.filter(t => t.taskId !== taskId));
      showToast(`Render error: ${(error as Error).message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  }, [hasShownStorageWarningRef, setClips, setCurrentCode, setCurrentVideo, setSelectedClip, showToast]);

  return {
    generatingTasks,
    isGenerating,
    generationProgress,
    generationMessage,
    generationError,
    isRendering,
    handleGenerateVideo,
    handleCancelGeneration,
    handleRenderCode,
  };
}
