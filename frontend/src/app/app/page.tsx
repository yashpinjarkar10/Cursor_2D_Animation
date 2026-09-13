'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Film, FolderOpen, PlusCircle, Trash2 } from 'lucide-react';
import { clearAllBlobs } from '@/lib/blobStore';
import Toast from '@/components/editor/Toast';
import {
  EDITOR_PROJECT_STORAGE_KEY,
  safeParseSnapshot,
  type EditorProjectSnapshotV1,
} from '@/lib/editor/projectSnapshot';

function formatSavedAt(savedAt: number): string {
  try {
    return new Date(savedAt).toLocaleString();
  } catch {
    return '';
  }
}

export default function AppHubPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<EditorProjectSnapshotV1 | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmToastOpen, setConfirmToastOpen] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(EDITOR_PROJECT_STORAGE_KEY);
    const parsed = raw ? safeParseSnapshot(raw) : null;
    setSnapshot(parsed);
  }, []);

  const summary = useMemo(() => {
    if (!snapshot) return null;

    const videos = (snapshot.clips || []).filter(c => c.type === 'video').length;
    const audio = (snapshot.audioClips || []).length;
    const overlays = (snapshot.textOverlays || []).length;

    return {
      savedAt: snapshot.savedAt,
      videos,
      audio,
      overlays,
    };
  }, [snapshot]);

  const requestNewProject = () => {
    setErrorToast(null);
    setConfirmToastOpen(true);
  };

  const handleConfirmNewProject = async () => {
    setIsClearing(true);
    try {
      window.localStorage.removeItem(EDITOR_PROJECT_STORAGE_KEY);
      await clearAllBlobs();
      setConfirmToastOpen(false);
      router.push('/editor');
    } catch {
      setErrorToast('Failed to clear project storage');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white w-full selection:bg-white/20 selection:text-white">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif tracking-tight">Studio</h1>
            <p className="text-sm text-white/60 mt-2 max-w-xl">
              Create a new project, or continue where you left off.
            </p>
          </div>

          <Link
            href="/"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Back to landing
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-white/40" />
              <h2 className="text-sm font-semibold text-white/70">New Project</h2>
            </div>
            <p className="text-xs text-white/45 mt-2">
              Start fresh with an empty timeline.
            </p>
            <button
              type="button"
              onClick={requestNewProject}
              disabled={isClearing}
              className="mt-4 px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-60"
            >
              {isClearing ? 'Clearing…' : 'Create New'}
            </button>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-white/40" />
              <h2 className="text-sm font-semibold text-white/70">Recent Edits</h2>
            </div>

            {!summary ? (
              <p className="text-xs text-white/35 mt-3">
                No saved project found on this device yet.
              </p>
            ) : (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-white/30" />
                  <p className="text-xs text-white/70 font-medium">Last project</p>
                </div>
                <p className="text-[11px] text-white/45 mt-2">
                  Saved: {formatSavedAt(summary.savedAt)}
                </p>
                <p className="text-[11px] text-white/35 mt-1">
                  {summary.videos} video · {summary.audio} audio · {summary.overlays} overlay
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href="/editor"
                    className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-100 transition-colors"
                  >
                    Continue
                  </Link>
                  <button
                    type="button"
                    onClick={requestNewProject}
                    disabled={isClearing}
                    className="px-3 py-2 rounded-full text-xs text-white/60 hover:text-white/85 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                    title="Start over"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 text-xs text-white/30">
          Tip: Use Export/Import inside the editor to move projects between devices.
        </div>
      </div>

      {confirmToastOpen && (
        <Toast
          message="Start a new project? This clears the saved project and stored media on this device."
          type="warning"
          durationMs={null}
          onClose={() => setConfirmToastOpen(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setConfirmToastOpen(false)}
                disabled={isClearing}
                className="px-3 py-1.5 rounded-full text-xs text-white/80 border border-white/20 hover:border-white/35 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNewProject}
                disabled={isClearing}
                className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-60"
              >
                {isClearing ? 'Clearing…' : 'Clear & Start'}
              </button>
            </>
          }
        />
      )}

      {errorToast && (
        <Toast
          message={errorToast}
          type="error"
          onClose={() => setErrorToast(null)}
        />
      )}
    </main>
  );
}
