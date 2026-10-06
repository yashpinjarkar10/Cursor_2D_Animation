'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FolderPlus,
  Folder,
  Trash2,
  Calendar,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listProjects, createProject, deleteProject, Project, formatApiError } from '@/lib/api';
import Navbar from '@/components/Navbar';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listProjects();
      setProjects(data);
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to fetch projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (user) {
      fetchProjects();
    }
  }, [user, authLoading, router, fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createProject(newProjectName.trim(), newProjectDesc.trim() || undefined);
      setProjects((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
      router.push(`/projects/${created.id}`);
    } catch (err: unknown) {
      setCreateError(formatApiError(err, 'Could not create project'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm('Are you sure you want to delete this project and all its animations?')) {
      return;
    }

    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: unknown) {
      alert('Failed to delete project. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  if (authLoading || (loading && projects.length === 0)) {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0d11] text-white flex flex-col selection:bg-cyan-500/20">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-white/[0.08]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white flex items-center gap-3">
              Projects
              <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-white/[0.06] text-white/60 border border-white/[0.08]">
                {projects.length}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-white/50 mt-1">
              Organize your Manim animation threads and mathematical visualizations
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-semibold text-xs sm:text-sm hover:opacity-95 transition-all shadow-lg shadow-cyan-500/20 w-fit"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mt-6 flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Project Grid / Empty State */}
        {projects.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center p-12 rounded-3xl border border-dashed border-white/10 bg-white/[0.01]">
            <div className="h-16 w-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-5 text-cyan-400">
              <FolderPlus className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-serif font-bold text-white">No Projects Yet</h2>
            <p className="text-xs text-white/50 max-w-sm mt-1 mb-6">
              Create your first project container to start generating math animations with our AI graph.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-gray-200 transition-colors shadow-lg"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Project</span>
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => (
              <Link
                key={proj.id}
                href={`/projects/${proj.id}`}
                className="group relative flex flex-col justify-between p-6 rounded-2xl border border-white/[0.08] bg-[#11141a]/60 hover:bg-[#141820]/90 hover:border-cyan-500/30 transition-all hover:shadow-xl hover:shadow-cyan-500/5 hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                      <Folder className="h-5 w-5" />
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteProject(proj.id, e)}
                      disabled={deletingId === proj.id}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Delete project"
                    >
                      {deletingId === proj.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <h3 className="text-base font-semibold text-white tracking-tight group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {proj.name}
                  </h3>
                  <p className="text-xs text-white/50 mt-1.5 line-clamp-2 min-h-[32px]">
                    {proj.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.05] flex items-center justify-between text-xs text-white/40">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(proj.created_at)}</span>
                  </div>

                  <span className="flex items-center gap-1 text-cyan-400 font-medium group-hover:translate-x-1 transition-transform">
                    <span>Open</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#12151c] p-7 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-serif font-bold text-white">Create New Project</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/40 hover:text-white text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Project Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Fourier Transform Series"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.09] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Description (optional)
                </label>
                <textarea
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="What math concepts or scenes will this project explore?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.09] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newProjectName.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
