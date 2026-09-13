'use client';

import { useMemo, useState, useCallback } from 'react';
import { Type, Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { Clip, TextOverlay } from '@/lib/api';

/**
 * Curated language list — Indian + English languages.
 * Codes come from the Camb.ai /tts-stream API spec (BCP-47 locale enum).
 * https://docs.camb.ai/api-reference/endpoint/create-tts-stream
 */
const CAMB_LANGUAGES = [
    { code: 'en-us', label: 'English (US)' },
    { code: 'en-uk', label: 'English (UK)' },
    { code: 'en-in', label: 'English (India)' },
    { code: 'en-au', label: 'English (Australia)' },
    { code: 'hi-in', label: 'Hindi' },
    { code: 'ta-in', label: 'Tamil' },
    { code: 'te-in', label: 'Telugu' },
    { code: 'bn-in', label: 'Bengali (India)' },
    { code: 'mr-in', label: 'Marathi' },
    { code: 'kn-in', label: 'Kannada' },
    { code: 'ml-in', label: 'Malayalam' },
    { code: 'pa-in', label: 'Punjabi' },
    { code: 'as-in', label: 'Assamese' },
] as const;

/**
 * Curated voice options.
 * IDs from the Camb.ai /list-voices response (documented examples).
 * https://docs.camb.ai/api-reference/endpoint/list-voices
 */
const CAMB_VOICES = [
    { id: 147320, name: 'Gary', gender: 'Male', description: 'Rich, warm voice with dynamic expression' },
    { id: 20305, name: 'Alice', gender: 'Female', description: 'Warm, steady voice with calm tone' },
] as const;

interface PropertiesPanelProps {
    selectedClip: Clip | null;
    onUpdateClip: (clip: Clip) => void;
    onAddText: (textData: Partial<TextOverlay>) => void;
    onAddTtsAudio: (data: {
        text: string;
        lang?: string;
        voice?: string;
        voiceId?: number;
        rate?: number;
        pitch?: number;
        volume?: number;
    }) => void;
    currentTime: number;
    selectedTextOverlay: TextOverlay | null;
    onUpdateText: (text: TextOverlay) => void;
    onSelectText: (textId: string) => void;
    onRemoveText: (textId: string) => void;
    textOverlays: TextOverlay[];
}

export default function PropertiesPanel({
    selectedClip,
    onUpdateClip,
    onAddText,
    onAddTtsAudio,
    currentTime,
    selectedTextOverlay,
    onUpdateText,
    onSelectText,
    onRemoveText,
    textOverlays,
}: PropertiesPanelProps) {
    const [showClipProps, setShowClipProps] = useState(true);
    const [showTextOverlays, setShowTextOverlays] = useState(true);
    const [showTts, setShowTts] = useState(true);
    const [newText, setNewText] = useState('');
    const [ttsText, setTtsText] = useState('');
    const [ttsLang, setTtsLang] = useState<string>('en-us');
    const [ttsVoiceId, setTtsVoiceId] = useState<number>(CAMB_VOICES[0].id);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    const selectedIsSpeechClip = useMemo(() => {
        return Boolean(selectedClip && selectedClip.type === 'audio' && selectedClip.ttsText && selectedClip.ttsText.trim());
    }, [selectedClip]);

    const handleAddText = () => {
        if (!newText.trim()) return;
        onAddText({
            text: newText,
            startTime: currentTime,
            duration: 3,
            x: 50,
            y: 50,
            fontSize: 32,
            color: '#ffffff',
        });
        setNewText('');
    };

    const handleAddTts = () => {
        const text = ttsText.trim();
        if (!text || text.length < 3) return;
        const voice = CAMB_VOICES.find(v => v.id === ttsVoiceId);
        onAddTtsAudio({
            text,
            lang: ttsLang || undefined,
            voice: voice ? voice.name : undefined,
            voiceId: ttsVoiceId,
        });
        setTtsText('');
    };

    /**
     * Preview TTS by calling /api/tts and playing the returned audio.
     */
    const handlePreviewTts = useCallback(async () => {
        const text = ttsText.trim();
        if (!text || text.length < 3) return;

        // Stop any existing preview
        if (previewAudio) {
            try { previewAudio.pause(); } catch { /* ignore */ }
            if (previewAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(previewAudio.src);
            }
        }

        setIsPreviewing(true);
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    language: ttsLang,
                    voice_id: ttsVoiceId,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('TTS preview error:', err);
                return;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
                URL.revokeObjectURL(url);
                setPreviewAudio(null);
            };
            setPreviewAudio(audio);
            await audio.play();
        } catch (err) {
            console.error('TTS preview failed:', err);
        } finally {
            setIsPreviewing(false);
        }
    }, [ttsText, ttsLang, ttsVoiceId, previewAudio]);

    /**
     * Preview a selected speech clip using Camb.ai.
     */
    const handlePreviewClipTts = useCallback(async () => {
        if (!selectedClip?.ttsText?.trim()) return;
        const text = selectedClip.ttsText.trim();
        if (text.length < 3) return;

        if (previewAudio) {
            try { previewAudio.pause(); } catch { /* ignore */ }
            if (previewAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(previewAudio.src);
            }
        }

        setIsPreviewing(true);
        try {
            const voiceId = selectedClip.ttsVoiceId || CAMB_VOICES[0].id;
            const lang = selectedClip.ttsLang || 'en-us';

            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    language: lang,
                    voice_id: voiceId,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('TTS preview error:', err);
                return;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
                URL.revokeObjectURL(url);
                setPreviewAudio(null);
            };
            setPreviewAudio(audio);
            await audio.play();
        } catch (err) {
            console.error('TTS clip preview failed:', err);
        } finally {
            setIsPreviewing(false);
        }
    }, [selectedClip, previewAudio]);

    return (
        <div className="w-56 lg:w-[15.5rem] xl:w-64 bg-zinc-900/70 border-l border-white/10 flex flex-col overflow-hidden shrink-0 backdrop-blur-sm">
            {/* Header */}
            <div className="px-3 py-3 border-b border-white/10">
                <h3 className="studio-kicker">Properties</h3>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Clip Properties */}
                <div>
                    <button
                        onClick={() => setShowClipProps(!showClipProps)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 studio-interactive"
                    >
                        <span className="text-xs font-medium text-white/70">Clip Properties</span>
                        {showClipProps ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
                    </button>

                    {showClipProps && (
                        <div className="px-3 pb-3 space-y-3">
                            {selectedClip ? (
                                <>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-wider">Name</label>
                                        <input
                                            type="text"
                                            className="input !text-xs mt-1"
                                            value={selectedClip.name}
                                            onChange={e => onUpdateClip({ ...selectedClip, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Trim Start</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                className="input !text-xs mt-1"
                                                value={selectedClip.trimStart || 0}
                                                onChange={e => onUpdateClip({ ...selectedClip, trimStart: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Trim End</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                className="input !text-xs mt-1"
                                                value={selectedClip.trimEnd || selectedClip.duration || 0}
                                                onChange={e => onUpdateClip({ ...selectedClip, trimEnd: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-wider">Duration</label>
                                        <p className="text-xs text-white/60 mt-1">
                                            {((selectedClip.trimEnd || selectedClip.duration || 0) - (selectedClip.trimStart || 0)).toFixed(1)}s
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase tracking-wider">Source</label>
                                        <p className="text-xs text-white/60 mt-1 capitalize">{selectedClip.source}</p>
                                    </div>
                                </>
                            ) : (
                                <p className="text-[10px] text-white/20 py-2 text-center">
                                    Select a clip to edit properties
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Text Overlays */}
                <div className="border-t border-white/10">
                    <button
                        onClick={() => setShowTextOverlays(!showTextOverlays)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 studio-interactive"
                    >
                        <div className="flex items-center gap-1.5">
                            <Type className="w-3 h-3 text-amber-400" />
                            <span className="text-xs font-medium text-white/70">Text Overlays ({textOverlays.length})</span>
                        </div>
                        {showTextOverlays ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
                    </button>

                    {showTextOverlays && (
                        <div className="px-3 pb-3 space-y-3">
                            {/* Add new text */}
                            <div className="flex gap-1.5">
                                <input
                                    type="text"
                                    className="input !text-xs flex-1"
                                    placeholder="Add text overlay..."
                                    value={newText}
                                    onChange={e => setNewText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddText()}
                                />
                                <button onClick={handleAddText} className="btn btn-primary !p-1.5" title="Add Text">
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Text overlay list */}
                            {textOverlays.map(overlay => (
                                <div
                                    key={overlay.id}
                                    onClick={() => onSelectText(overlay.id)}
                                    className={`p-2.5 rounded-lg cursor-pointer studio-interactive ${selectedTextOverlay?.id === overlay.id
                                            ? 'bg-white/[0.14] border border-white/22'
                                            : 'bg-white/[0.04] border border-transparent hover:border-white/15'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs text-white/70 truncate flex-1">&quot;{overlay.text}&quot;</p>
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                onRemoveText(overlay.id);
                                            }}
                                            className="text-white/30 hover:text-red-400 transition-colors ml-2"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>

                                    {selectedTextOverlay?.id === overlay.id && (
                                        <div className="space-y-2 mt-2">
                                            <input
                                                type="text"
                                                className="input !text-xs"
                                                value={overlay.text}
                                                onChange={e => onUpdateText({ ...overlay, text: e.target.value })}
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[9px] text-white/30">Font Size</label>
                                                    <input
                                                        type="number"
                                                        min="8"
                                                        max="120"
                                                        className="input !text-xs mt-0.5"
                                                        value={overlay.fontSize}
                                                        onChange={e => onUpdateText({ ...overlay, fontSize: parseInt(e.target.value) || 32 })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-white/30">Color</label>
                                                    <input
                                                        type="color"
                                                        className="w-full h-8 mt-0.5 rounded cursor-pointer bg-transparent border-0"
                                                        value={overlay.color}
                                                        onChange={e => onUpdateText({ ...overlay, color: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-white/35">
                                                Drag text in preview to position. Drag the text bar in Timeline to set start and duration.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Text to Speech (Camb.ai) */}
                <div className="border-t border-white/10">
                    <button
                        onClick={() => setShowTts(!showTts)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 studio-interactive"
                    >
                        <span className="text-xs font-medium text-white/70">Text to Speech</span>
                        {showTts ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
                    </button>

                    {showTts && (
                        <div className="px-3 pb-3 space-y-2">
                            <textarea
                                className="input !text-xs min-h-[70px] resize-none"
                                placeholder="Type text to speak (min 3 chars)..."
                                value={ttsText}
                                onChange={e => setTtsText(e.target.value)}
                            />

                            {/* Language */}
                            <div>
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Language</label>
                                <select
                                    className="input !text-xs mt-1"
                                    value={ttsLang}
                                    onChange={e => setTtsLang(e.target.value)}
                                >
                                    {CAMB_LANGUAGES.map(l => (
                                        <option key={l.code} value={l.code}>
                                            {l.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Voice */}
                            <div>
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Voice</label>
                                <select
                                    className="input !text-xs mt-1"
                                    value={ttsVoiceId}
                                    onChange={e => setTtsVoiceId(parseInt(e.target.value))}
                                >
                                    {CAMB_VOICES.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} ({v.gender}) — {v.description}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1"
                                    onClick={handlePreviewTts}
                                    disabled={isPreviewing || ttsText.trim().length < 3}
                                    title="Preview speech"
                                >
                                    {isPreviewing && <Loader2 className="w-3 h-3 animate-spin" />}
                                    Preview
                                </button>
                                <button
                                    className="btn btn-primary flex-1 flex items-center justify-center gap-1"
                                    onClick={handleAddTts}
                                    disabled={ttsText.trim().length < 3}
                                    title="Add speech clip to timeline"
                                >
                                    Add
                                </button>
                            </div>
                            <p className="text-[10px] text-white/30">
                                Powered by Camb.ai — adds a speech clip at the current playhead time.
                            </p>
                        </div>
                    )}
                </div>

                {/* Speech Clip Editor */}
                {selectedIsSpeechClip && selectedClip && (
                    <div className="border-t border-white/10">
                        <div className="px-3 py-2 text-xs font-medium text-white/70">Speech Clip</div>
                        <div className="px-3 pb-3 space-y-2">
                            <textarea
                                className="input !text-xs min-h-[70px] resize-none"
                                value={selectedClip.ttsText || ''}
                                onChange={e => onUpdateClip({ ...selectedClip, ttsText: e.target.value })}
                            />

                            {/* Language */}
                            <div>
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Language</label>
                                <select
                                    className="input !text-xs mt-1"
                                    value={selectedClip.ttsLang || 'en-us'}
                                    onChange={e => onUpdateClip({ ...selectedClip, ttsLang: e.target.value })}
                                >
                                    {CAMB_LANGUAGES.map(l => (
                                        <option key={l.code} value={l.code}>
                                            {l.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Voice */}
                            <div>
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Voice</label>
                                <select
                                    className="input !text-xs mt-1"
                                    value={selectedClip.ttsVoiceId || CAMB_VOICES[0].id}
                                    onChange={e => onUpdateClip({
                                        ...selectedClip,
                                        ttsVoiceId: parseInt(e.target.value),
                                        ttsVoice: CAMB_VOICES.find(v => v.id === parseInt(e.target.value))?.name,
                                    })}
                                >
                                    {CAMB_VOICES.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} ({v.gender})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                className="btn btn-secondary w-full flex items-center justify-center gap-1"
                                onClick={handlePreviewClipTts}
                                disabled={isPreviewing || !(selectedClip.ttsText || '').trim() || (selectedClip.ttsText || '').trim().length < 3}
                            >
                                {isPreviewing && <Loader2 className="w-3 h-3 animate-spin" />}
                                Preview Clip
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
