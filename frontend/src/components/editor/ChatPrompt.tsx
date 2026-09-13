'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Loader2, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    videoUrl?: string;
    status?: 'pending' | 'generating' | 'complete' | 'error';
    progress?: number;
    progressMessage?: string;
}

interface ChatPromptProps {
    onGenerateVideo: (prompt: string) => void;
    isGenerating: boolean;
    generationProgress?: number;
    generationMessage?: string;
    generationError?: string | null;
}

const SUGGESTION_CHIPS = [
    'Create a circle animation',
    'Show the Pythagorean theorem',
    'Animate a sine wave',
    'Sort algorithm visualization',
    'Draw a fractal tree',
    'Matrix transformation demo',
];

export default function ChatPrompt({
    onGenerateVideo,
    isGenerating,
    generationProgress = 0,
    generationMessage = '',
    generationError = null,
}: ChatPromptProps) {
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Update generating message status
    useEffect(() => {
        if (!isGenerating) return;

        setMessages(prev => {
            if (prev.length === 0) return prev;
            const lastIndex = prev.length - 1;
            const lastMessage = prev[lastIndex];
            if (lastMessage.role !== 'assistant' || lastMessage.status !== 'generating') return prev;

            // Prevent infinite loops: if nothing changed, keep the same array reference.
            if (
                lastMessage.progress === generationProgress &&
                lastMessage.progressMessage === generationMessage
            ) {
                return prev;
            }

            const next = [...prev];
            next[lastIndex] = {
                ...lastMessage,
                progress: generationProgress,
                progressMessage: generationMessage,
            };
            return next;
        });
    }, [generationProgress, generationMessage, isGenerating]);

    const handleSubmit = () => {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || isGenerating) return;

        // Add user message
        const userMsg: ChatMessage = {
            id: Date.now().toString() + '-user',
            role: 'user',
            content: trimmedPrompt,
            timestamp: new Date(),
        };

        // Add assistant generating message
        const assistantMsg: ChatMessage = {
            id: Date.now().toString() + '-assistant',
            role: 'assistant',
            content: 'Generating your animation...',
            timestamp: new Date(),
            status: 'generating',
            progress: 0,
            progressMessage: 'Starting...',
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        onGenerateVideo(trimmedPrompt);
        setPrompt('');
    };

    // Update on completion
    useEffect(() => {
        if (isGenerating) return;

        setMessages(prev => {
            if (prev.length === 0) return prev;
            const lastIndex = prev.length - 1;
            const lastMsg = prev[lastIndex];
            if (lastMsg.role !== 'assistant' || lastMsg.status !== 'generating') return prev;

            const next = [...prev];
            next[lastIndex] = generationError
                ? {
                    ...lastMsg,
                    status: 'error',
                    content: `Failed to generate animation: ${generationError}`,
                    progress: lastMsg.progress ?? 0,
                    progressMessage: 'Error',
                }
                : {
                    ...lastMsg,
                    status: 'complete',
                    content: 'Animation generated successfully! ✓',
                    progress: 100,
                    progressMessage: 'Done!',
                };
            return next;
        });
        // NOTE: `generationError` is set before `isGenerating` flips to false in the parent.
        // This effect only needs to run on the generating→done transition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGenerating]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setPrompt(suggestion);
        inputRef.current?.focus();
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900/70 border-r border-white/10 backdrop-blur-sm">
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-pointer hover:bg-white/5 studio-interactive"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-white/70" />
                    <h3 className="studio-heading">AI Prompt</h3>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-white/40" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-white/40" />
                )}
            </div>

            {isExpanded && (
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
                        {messages.length === 0 && (
                            <div className="text-center py-6">
                                <Wand2 className="w-8 h-8 text-white/15 mx-auto mb-3" />
                                <p className="text-xs text-white/30 mb-4">
                                    Describe the animation you want to create
                                </p>
                                <div className="flex flex-wrap gap-1.5 justify-center">
                                    {SUGGESTION_CHIPS.map(chip => (
                                        <button
                                            key={chip}
                                            onClick={() => handleSuggestionClick(chip)}
                                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/55 hover:text-white hover:bg-white/[0.1] studio-interactive"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${msg.role === 'user'
                                            ? 'bg-white text-black border border-white/80'
                                            : 'bg-white/[0.04] border border-white/10 text-white/80'
                                        } studio-interactive`}
                                >
                                    <p>{msg.content}</p>
                                    {msg.role === 'assistant' && msg.status === 'generating' && (
                                        <div className="mt-2">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Loader2 className="w-3 h-3 animate-spin text-white/70" />
                                                <span className="text-[10px] text-white/50">{msg.progressMessage}</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white/75 rounded-full transition-all duration-300"
                                                    style={{ width: `${msg.progress || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/10 bg-zinc-900/60">
                        <div className="flex gap-2 items-end">
                            <textarea
                                ref={inputRef}
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe your animation..."
                                rows={2}
                                className="input flex-1 resize-none text-xs !py-2"
                                disabled={isGenerating}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={!prompt.trim() || isGenerating}
                                className="btn studio-btn-solid studio-interactive !p-2.5 rounded-xl shrink-0"
                                title="Generate (Enter)"
                            >
                                {isGenerating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
