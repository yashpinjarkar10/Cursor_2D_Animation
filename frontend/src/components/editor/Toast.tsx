'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ToastProps {
    message: string;
    type: 'info' | 'success' | 'error' | 'warning';
    onClose: () => void;
    durationMs?: number | null;
    actions?: ReactNode;
}

export default function Toast({ message, type, onClose, durationMs = 5000, actions }: ToastProps) {
    useEffect(() => {
        if (durationMs == null || durationMs <= 0) return;
        const timer = setTimeout(onClose, durationMs);
        return () => clearTimeout(timer);
    }, [onClose, durationMs]);

    const colors = {
        error: 'bg-red-700/90 border-red-500/45',
        success: 'bg-emerald-700/88 border-emerald-400/40',
        warning: 'bg-amber-700/88 border-amber-400/40',
        info: 'bg-black/85 border-white/20',
    };

    const icons = {
        error: '✗',
        success: '✓',
        warning: '⚠',
        info: 'ℹ',
    };

    return (
        <div
            className={`fixed bottom-4 right-4 ${colors[type]} text-white px-5 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-slide-up backdrop-blur-md border`}
        >
            <span className="text-lg">{icons[type]}</span>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-sm font-medium truncate">{message}</span>
                {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
            </div>
            <button
                onClick={onClose}
                className="ml-2 text-white/60 hover:text-white transition-colors text-lg leading-none"
            >
                ×
            </button>
        </div>
    );
}
