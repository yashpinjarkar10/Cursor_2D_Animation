'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  Trash2,
  Code2,
  Film,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sliders,
  ChevronDown,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  getProject,
  listChats,
  createChat,
  deleteChat,
  listGenerations,
  streamAnimationGeneration,
  Project,
  Chat,
  Generation,
  GenerationMode,
  GenerationQuality,
  formatApiError,
} from '@/lib/api';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import GenerationProgress from '@/components/GenerationProgress';
import CodeViewer from '@/components/CodeViewer';

export default function ProjectStudioPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();

  // Project & Chats State
  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chat Generations State
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [activeGeneration, setActiveGeneration] = useState<Generation | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'code'>('video');

  // Input & Generation Configuration State
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<GenerationMode>('create');
  const [duration, setDuration] = useState<number>(30);
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [quality, setQuality] = useState<GenerationQuality>('low');
  const [showConfig, setShowConfig] = useState(false);

  // Live SSE Generation Streaming State
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamEvent, setStreamEvent] = useState('');
  const [streamDetails, setStreamDetails] = useState<Record<string, unknown> | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll messages to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch project details and chats
  const fetchProjectData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [projData, chatList] = await Promise.all([
        getProject(projectId),
        listChats(projectId),
      ]);
      setProject(projData);
      setChats(chatList);

      if (chatList.length > 0 && !selectedChatId) {
        setSelectedChatId(chatList[0].id);
      }
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to load project'));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedChatId]);

  // Fetch generations for selected chat
  const fetchChatGenerations = useCallback(async (chatId: string) => {
    try {
      const gens = await listGenerations(projectId, chatId);
      setGenerations(gens);
      if (gens.length > 0) {
        // Set most recent successful or active generation as default
        const latestWithVideo = gens.find((g) => g.video_url);
        setActiveGeneration(latestWithVideo || gens[0]);
        // Switch to iteration mode automatically if generations exist
        setMode('modify');
      } else {
        setActiveGeneration(null);
        setMode('create');
      }
    } catch {
      // Ignored non-critical load
    }
  }, [projectId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (user && projectId) {
      fetchProjectData();
    }
  }, [user, authLoading, projectId, router, fetchProjectData]);

  useEffect(() => {
    if (selectedChatId) {
      fetchChatGenerations(selectedChatId);
    }
  }, [selectedChatId, fetchChatGenerations]);

  useEffect(() => {
    scrollToBottom();
  }, [generations, isGenerating]);

  // Create new chat thread
  const handleCreateChat = async () => {
    try {
      const newTitle = `Thread ${chats.length + 1}`;
      const newChat = await createChat(projectId, newTitle);
      setChats((prev) => [newChat, ...prev]);
      setSelectedChatId(newChat.id);
      setGenerations([]);
      setActiveGeneration(null);
      setMode('create');
    } catch {
      alert('Failed to create new chat thread');
    }
  };

  // Delete chat
  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat thread?')) return;

    try {
      await deleteChat(projectId, chatId);
      const remaining = chats.filter((c) => c.id !== chatId);
      setChats(remaining);
      if (selectedChatId === chatId) {
        setSelectedChatId(remaining[0]?.id || null);
      }
    } catch {
      alert('Failed to delete chat thread');
    }
  };

  // Submit Prompt to Start SSE Animation Generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    let targetChatId = selectedChatId;
    if (!targetChatId) {
      // Auto-create chat if none exists
      try {
        const newChat = await createChat(projectId, prompt.slice(0, 40));
        setChats((prev) => [newChat, ...prev]);
        setSelectedChatId(newChat.id);
        targetChatId = newChat.id;
      } catch {
        alert('Could not start a chat thread');
        return;
      }
    }

    const currentPrompt = prompt.trim();
    setPrompt('');
    setIsGenerating(true);
    setStreamError(null);
    setStreamProgress(5);
    setStreamEvent('started');
    setStreamDetails(null);

    await streamAnimationGeneration({
      projectId,
      chatId: targetChatId,
      payload: {
        query: currentPrompt,
        mode,
        duration,
        aspect_ratio: aspectRatio,
        quality,
      },
      onEvent: (event, data) => {
        setStreamEvent(event);
        setStreamDetails(data);
        if (typeof data.progress === 'number') {
          setStreamProgress(data.progress * 100);
        }
      },
      onError: (errorMsg) => {
        setStreamError(errorMsg);
        setIsGenerating(false);
        if (targetChatId) fetchChatGenerations(targetChatId);
      },
      onComplete: (completedData) => {
        setStreamProgress(100);
        setStreamEvent('complete');
        setIsGenerating(false);

        // Instantly activate output
        if (completedData.video_url) {
          const newGen: Generation = {
            id: String(completedData.generation_id || Date.now()),
            chat_id: targetChatId!,
            user_id: user?.id || '',
            query: currentPrompt,
            mode,
            status: 'success',
            video_url: String(completedData.video_url),
            generated_code: completedData.generated_code ? String(completedData.generated_code) : null,
            scene_class: completedData.scene_class ? String(completedData.scene_class) : null,
            duration: typeof completedData.duration === 'number' ? completedData.duration : duration,
            attempt_count: Number(completedData.attempt_count || 1),
            created_at: new Date().toISOString(),
          };
          setActiveGeneration(newGen);
          setGenerations((prev) => [...prev, newGen]);
          setActiveTab('video');
          setMode('modify'); // set mode to iterate
        }

        if (targetChatId) fetchChatGenerations(targetChatId);
      },
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="h-screen w-screen max-w-full bg-[#0b0d11] text-white flex flex-col overflow-hidden">
      <div className="shrink-0">
        <Navbar />
      </div>

      <main className="flex-1 min-h-0 w-full flex flex-col lg:flex-row overflow-hidden">
        {/* ================================================================= */}
        {/* Left Sidebar: Project Info & Chat Threads */}
        {/* ================================================================= */}
        <aside
          className={`${
            isSidebarOpen
              ? 'w-full lg:w-72'
              : 'hidden lg:flex lg:w-0 border-r-0 p-0 overflow-hidden opacity-0 pointer-events-none'
          } transition-all duration-300 border-r border-white/[0.08] bg-[#0e1117] flex flex-col shrink-0 h-full overflow-hidden`}
        >
          {/* Project Back & Info */}
          <div className="p-4 border-b border-white/[0.06] flex flex-col gap-2 shrink-0">
            <Link
              href="/projects"
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors w-fit"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Projects</span>
            </Link>
            <div className="mt-1">
              <h2 className="text-sm font-semibold text-white tracking-tight truncate">
                {project?.name}
              </h2>
              {project?.description && (
                <p className="text-[11px] text-white/40 line-clamp-1 mt-0.5">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {/* New Chat Button */}
          <div className="p-3 border-b border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={handleCreateChat}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-medium border border-white/[0.08] transition-all hover:border-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5 text-cyan-400" />
              <span>New Animation Thread</span>
            </button>
          </div>

          {/* Chat List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-white/30 px-3 py-1">
              Threads ({chats.length})
            </span>
            {chats.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-6 px-3">
                No threads yet. Create one or send a prompt!
              </p>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedChatId(c.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                    selectedChatId === c.id
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{c.title || 'Untitled Animation'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteChat(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 rounded transition-opacity"
                    title="Delete thread"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ================================================================= */}
        {/* Middle / Left Pane: Conversation & Prompt Area */}
        {/* ================================================================= */}
        <section className="flex-1 min-h-0 flex flex-col border-r border-white/[0.08] bg-[#0b0d11] min-w-0 h-full overflow-hidden">
          {/* Thread Header */}
          <div className="h-12 border-b border-white/[0.06] px-4 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
                title={isSidebarOpen ? 'Hide thread history' : 'Show thread history'}
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-white/90 truncate">
                {selectedChat?.title || 'Animation Thread'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-white/40 shrink-0">
                {generations.length} {generations.length === 1 ? 'scene' : 'scenes'}
              </span>
            </div>

            {generations.length > 0 && (
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>AI Iteration Ready</span>
              </span>
            )}
          </div>

          {/* Conversation History */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
            {generations.length === 0 && !isGenerating && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
                <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-white">Describe Your Animation</h3>
                <p className="text-xs text-white/50 max-w-sm mt-1">
                  Type any mathematical concept, geometric proof, or animated formula below to run our Manim engine.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                  {[
                    'Explain Pythagorean theorem visually',
                    'Animate 3Blue1Brown style Fourier series',
                    'Visualize Binary Search Tree rotations',
                  ].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-white/70 hover:text-white transition-colors text-left"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Past Generations */}
            {generations.map((gen, idx) => (
              <div key={gen.id} className="space-y-3">
                {/* User Prompt Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-xs leading-relaxed text-white">
                    <div className="flex items-center gap-2 mb-1 text-[10px] text-cyan-400 font-mono uppercase">
                      <span>#{idx + 1} Prompt</span>
                      <span>•</span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/20">
                        {gen.mode}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{gen.query}</p>
                  </div>
                </div>

                {/* AI Generation Card */}
                <div className="flex justify-start">
                  <div className="max-w-[85%] w-full rounded-2xl bg-[#11141a] border border-white/[0.08] p-4 text-xs space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            gen.status === 'success'
                              ? 'bg-emerald-400'
                              : gen.status === 'failed'
                              ? 'bg-red-400'
                              : 'bg-yellow-400 animate-pulse'
                          }`}
                        />
                        <span className="font-semibold text-white/90">
                          {gen.status === 'success'
                            ? 'Rendered Video'
                            : gen.status === 'failed'
                            ? 'Generation Failed'
                            : 'Processing'}
                        </span>
                      </div>

                      {gen.duration && (
                        <span className="text-[10px] font-mono text-white/40 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {gen.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {gen.error_message && (
                      <p className="text-red-400/90 text-[11px] bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                        {gen.error_message}
                      </p>
                    )}

                    {gen.video_url && (
                      <div className="pt-2 border-t border-white/[0.05] flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveGeneration(gen);
                            setActiveTab('video');
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            activeGeneration?.id === gen.id && activeTab === 'video'
                              ? 'bg-cyan-500 text-black font-semibold shadow-md shadow-cyan-500/20'
                              : 'bg-white/[0.04] text-white/80 hover:text-white hover:bg-white/[0.08]'
                          }`}
                        >
                          <Film className="h-3.5 w-3.5" />
                          <span>View Video</span>
                        </button>

                        {gen.generated_code && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGeneration(gen);
                              setActiveTab('code');
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              activeGeneration?.id === gen.id && activeTab === 'code'
                                ? 'bg-cyan-500 text-black font-semibold'
                                : 'bg-white/[0.04] text-white/80 hover:text-white hover:bg-white/[0.08]'
                            }`}
                          >
                            <Code2 className="h-3.5 w-3.5" />
                            <span>View Code</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Live SSE Stream Progress Card */}
            {isGenerating && (
              <GenerationProgress
                currentEvent={streamEvent}
                progressPercent={streamProgress}
                eventDetails={streamDetails}
              />
            )}

            {streamError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{streamError}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Input Form & Config Bar */}
          <div className="shrink-0 p-3.5 sm:p-4 border-t border-white/[0.08] bg-[#0c0e14]">
            {/* Iteration & Config Toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-white/50">Mode:</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as GenerationMode)}
                  className="bg-white/[0.04] text-cyan-300 text-xs rounded-lg px-2 py-1 border border-white/[0.08] focus:outline-none focus:border-cyan-500/40"
                >
                  <option value="create">Create New Scene</option>
                  <option value="modify">Modify Scene (AI Iteration)</option>
                  <option value="extend">Extend Scene</option>
                  <option value="restructure">Restructure Layout</option>
                  <option value="remove">Remove Elements</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                <Sliders className="h-3 w-3" />
                <span>Settings</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showConfig ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Expanded Config Settings */}
            {showConfig && (
              <div className="mb-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] grid grid-cols-3 gap-3 text-xs animate-fade-in">
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full bg-[#11141a] text-white rounded-lg p-1.5 border border-white/10 text-xs"
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full bg-[#11141a] text-white rounded-lg p-1.5 border border-white/10 text-xs"
                  >
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="9:16">9:16 (Shorts/TikTok)</option>
                    <option value="1:1">1:1 (Square)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as GenerationQuality)}
                    className="w-full bg-[#11141a] text-white rounded-lg p-1.5 border border-white/10 text-xs"
                  >
                    <option value="low">Low (Fast 480p)</option>
                    <option value="medium">Medium (720p)</option>
                    <option value="high">High (1080p)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Input Bar */}
            <form onSubmit={handleGenerate} className="flex gap-2.5 items-end">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate(e);
                  }
                }}
                placeholder={
                  mode === 'create'
                    ? 'Prompt (e.g. Draw a circle that transforms into a sine wave)...'
                    : 'Iteration (e.g. Change color to neon cyan and slow down rotation)...'
                }
                className="flex-1 px-3.5 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none transition-all"
              />
              <button
                type="submit"
                disabled={isGenerating || !prompt.trim()}
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Generate</span>
                    <Send className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* ================================================================= */}
        {/* Right Pane: Video Canvas & Code Inspector */}
        {/* ================================================================= */}
        <section className="flex-1 min-h-0 flex flex-col bg-[#0b0e14] h-full overflow-hidden">
          {/* Canvas Mode Header Tabs */}
          <div className="h-12 border-b border-white/[0.06] px-5 flex items-center justify-between bg-black/30 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('video')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'video'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Film className="h-3.5 w-3.5" />
                <span>Animation Player</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'code'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Manim Code</span>
              </button>
            </div>

            {activeGeneration?.scene_class && (
              <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Class: {activeGeneration.scene_class}
              </span>
            )}
          </div>

          {/* Canvas Body */}
          <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center">
            {activeGeneration ? (
              <div className="w-full max-w-2xl">
                {activeTab === 'video' && activeGeneration.video_url ? (
                  <VideoPlayer
                    videoUrl={activeGeneration.video_url}
                    title={activeGeneration.query.slice(0, 50)}
                  />
                ) : activeTab === 'code' && activeGeneration.generated_code ? (
                  <CodeViewer
                    code={activeGeneration.generated_code}
                    sceneClass={activeGeneration.scene_class}
                  />
                ) : (
                  <div className="text-center p-10 text-white/40 border border-dashed border-white/10 rounded-2xl">
                    <p className="text-xs">No media preview available for this scene.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-10 max-w-sm text-white/40">
                <div className="h-16 w-16 rounded-3xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-white/30 mb-4">
                  <Film className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-semibold text-white/80">No Animation Rendered</h3>
                <p className="text-xs text-white/40 mt-1">
                  Submit a prompt in the chat panel to generate a new animation. The rendered video from Supabase Storage will appear here immediately.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
