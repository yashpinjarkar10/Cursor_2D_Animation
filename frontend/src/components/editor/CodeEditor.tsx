'use client';

import { useState, useCallback } from 'react';
import { Play, Maximize2, Minimize2, Copy, Check } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  onChange?: (code: string) => void;
  onRender: (code: string, sceneName?: string) => void;
  isRendering: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  readOnly?: boolean;
  placeholder?: string;
}

export default function CodeEditor({
  code,
  onChange,
  onRender,
  isRendering,
  isFullscreen = false,
  onToggleFullscreen,
  readOnly = false,
  placeholder,
}: CodeEditorProps) {
  const [sceneName, setSceneName] = useState('Scene1');
  const [copied, setCopied] = useState(false);

  const handleRender = useCallback(() => {
    if (code.trim()) {
      onRender(code, sceneName);
    }
  }, [code, sceneName, onRender]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Parse scene names from code
  const detectSceneNames = useCallback((): string[] => {
    const matches = code.match(/class\s+(\w+)\s*\(\s*Scene\s*\)/g);
    if (!matches) return ['Scene1'];
    return matches.map(m => {
      const match = m.match(/class\s+(\w+)/);
      return match ? match[1] : 'Scene1';
    });
  }, [code]);

  const sceneNames = detectSceneNames();

  return (
    <div className="flex flex-col h-full bg-zinc-900/70 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="studio-kicker">Manim Code</span>
          {readOnly && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/55 border border-white/10">
              Read Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Scene Name Selector */}
          <select
            className="text-xs bg-white/[0.05] border border-white/12 rounded px-2 py-1 text-white/75 studio-interactive"
            value={sceneName}
            onChange={e => setSceneName(e.target.value)}
          >
            {sceneNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Copy Button */}
          <button onClick={handleCopy} className="btn-ghost studio-interactive p-1.5 rounded" title="Copy Code">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Render Button */}
          <button
            onClick={handleRender}
            disabled={isRendering || !code.trim()}
            className="btn studio-btn-solid studio-interactive !text-xs !px-3 !py-1.5"
            title="Render Code"
          >
            <Play className="w-3 h-3" />
            Render
          </button>

          {/* Fullscreen Toggle */}
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} className="btn-ghost studio-interactive p-1.5 rounded" title="Toggle Fullscreen">
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 overflow-auto relative">
        {code || !placeholder ? (
          <textarea
            value={code}
            onChange={e => onChange?.(e.target.value)}
            readOnly={readOnly}
            className="w-full h-full bg-transparent text-white/88 font-mono text-xs leading-relaxed p-4 resize-none outline-none"
            style={{
              tabSize: 4,
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
            }}
            spellCheck={false}
            placeholder="# Manim code will appear here when you generate or write code..."
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-xs">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
