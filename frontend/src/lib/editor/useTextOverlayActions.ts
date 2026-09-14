import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TextOverlay } from '@/lib/api';

export function useTextOverlayActions(args: {
  textOverlays: TextOverlay[];
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
  setSelectedTextOverlay: Dispatch<SetStateAction<TextOverlay | null>>;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}): {
  handleAddText: (textData: Partial<TextOverlay>) => void;
  handleUpdateTextOverlay: (textId: string, updates: Partial<TextOverlay>) => void;
  handleUpdateText: (text: TextOverlay) => void;
  handleRemoveText: (textId: string) => void;
  handleSelectText: (textId: string) => void;
} {
  const {
    textOverlays,
    setTextOverlays,
    setSelectedTextOverlay,
    showToast,
  } = args;

  const handleAddText = useCallback(
    (textData: Partial<TextOverlay>) => {
      const newText: TextOverlay = {
        id: uuidv4(),
        text: textData.text || 'Text',
        startTime: textData.startTime || 0,
        duration: textData.duration || 3,
        x: textData.x ?? 50,
        y: textData.y ?? 50,
        fontSize: textData.fontSize || 32,
        color: textData.color || '#ffffff',
      };
      setTextOverlays(prev => [...prev, newText]);
      showToast(`Added text: "${newText.text.substring(0, 20)}"`, 'success');
    },
    [setTextOverlays, showToast]
  );

  const handleUpdateTextOverlay = useCallback(
    (textId: string, updates: Partial<TextOverlay>) => {
      setTextOverlays(prev => prev.map(t => (t.id === textId ? { ...t, ...updates } : t)));
      setSelectedTextOverlay(prev => (prev?.id === textId ? { ...prev, ...updates } : prev));
    },
    [setSelectedTextOverlay, setTextOverlays]
  );

  const handleUpdateText = useCallback(
    (text: TextOverlay) => {
      setTextOverlays(prev => prev.map(t => (t.id === text.id ? text : t)));
      setSelectedTextOverlay(prev => (prev?.id === text.id ? text : prev));
    },
    [setSelectedTextOverlay, setTextOverlays]
  );

  const handleRemoveText = useCallback(
    (textId: string) => {
      setTextOverlays(prev => prev.filter(t => t.id !== textId));
      setSelectedTextOverlay(prev => (prev?.id === textId ? null : prev));
      showToast('Text overlay removed', 'info');
    },
    [setSelectedTextOverlay, setTextOverlays, showToast]
  );

  const handleSelectText = useCallback(
    (textId: string) => {
      const text = textOverlays.find(t => t.id === textId) || null;
      setSelectedTextOverlay(text);
    },
    [setSelectedTextOverlay, textOverlays]
  );

  return {
    handleAddText,
    handleUpdateTextOverlay,
    handleUpdateText,
    handleRemoveText,
    handleSelectText,
  };
}
