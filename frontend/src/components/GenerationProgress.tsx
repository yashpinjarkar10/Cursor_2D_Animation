'use client';

import React, { useMemo } from 'react';
import { Loader2, CheckCircle2, Sparkles, Terminal } from 'lucide-react';

interface GenerationProgressProps {
  currentEvent: string;
  progressPercent: number;
  eventDetails?: Record<string, unknown> | null;
}

interface StepConfig {
  key: string;
  activeLabel: string;
  doneLabel: string;
  threshold: number;
}

const ORDERED_STEPS: StepConfig[] = [
  {
    key: 'scene_planned',
    activeLabel: 'Directing storyboard scenes & timing...',
    doneLabel: 'Storyboard directed',
    threshold: 15,
  },
  {
    key: 'capabilities_planned',
    activeLabel: 'Grounding mathematical capabilities & shapes...',
    doneLabel: 'Capabilities verified',
    threshold: 25,
  },
  {
    key: 'knowledge_retrieved',
    activeLabel: 'Retrieving verified Manim v0.19.0 APIs...',
    doneLabel: 'API signatures retrieved',
    threshold: 40,
  },
  {
    key: 'code_generated',
    activeLabel: 'Synthesizing executable Python scene code...',
    doneLabel: 'Python scene code generated',
    threshold: 65,
  },
  {
    key: 'validated',
    activeLabel: 'Validating AST, syntax, and scene structure...',
    doneLabel: 'AST & safety validation passed',
    threshold: 75,
  },
  {
    key: 'rendering',
    activeLabel: 'Rendering video frames with Manim engine...',
    doneLabel: 'Manim rendering finished',
    threshold: 85,
  },
  {
    key: 'complete',
    activeLabel: 'Uploading video to cloud storage...',
    doneLabel: 'Video ready on cloud CDN',
    threshold: 100,
  },
];

export default function GenerationProgress({
  currentEvent,
  progressPercent,
  eventDetails,
}: GenerationProgressProps) {
  // Determine which steps have completed and which step is currently active
  const visibleSteps = useMemo(() => {
    // Find active step index based on currentEvent or progressPercent
    let activeIdx = 0;
    const eventIdx = ORDERED_STEPS.findIndex((s) => s.key === currentEvent);

    if (eventIdx !== -1) {
      activeIdx = eventIdx;
    } else {
      // Fallback to progressPercent threshold
      for (let i = 0; i < ORDERED_STEPS.length; i++) {
        if (progressPercent >= ORDERED_STEPS[i].threshold) {
          activeIdx = i;
        }
      }
    }

    // Only display lines up to the active step (plus 1 if we are actively progressing)
    const currentActiveStep = ORDERED_STEPS[activeIdx] || ORDERED_STEPS[0];
    const stepsToShow = ORDERED_STEPS.slice(0, activeIdx + 1);

    return {
      steps: stepsToShow,
      activeKey: currentActiveStep.key,
      isFinished: progressPercent >= 100 || currentEvent === 'complete',
    };
  }, [currentEvent, progressPercent]);

  return (
    <div className="flex justify-start w-full animate-fade-in">
      <div className="max-w-[92%] sm:max-w-[85%] w-full rounded-2xl bg-[#11141a] border border-cyan-500/25 p-4 shadow-xl shadow-cyan-950/20 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-500 p-0.5">
              <div className="h-full w-full bg-[#11141a] rounded-[6px] flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-cyan-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-tight">Manim Agent</span>
              <span className="text-[10px] text-white/40 font-mono">• streaming</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {eventDetails?.scenes_count ? (
              <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {String(eventDetails.scenes_count)} scene
              </span>
            ) : null}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              {Math.round(Math.max(5, Math.min(100, progressPercent)))}%
            </span>
          </div>
        </div>

        {/* Minimal Progress Bar */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden mb-3.5">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
          />
        </div>

        {/* Sequential Line-by-Line Activity Stream */}
        <div className="space-y-2 py-0.5 font-mono text-[11px]">
          {visibleSteps.steps.map((step, idx) => {
            const isLast = idx === visibleSteps.steps.length - 1;
            const isCurrent = isLast && !visibleSteps.isFinished;

            return (
              <div
                key={step.key}
                className={`flex items-center gap-2.5 transition-all duration-200 ${
                  isCurrent ? 'text-cyan-300 font-medium' : 'text-white/70'
                }`}
              >
                {isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                )}

                <span className="leading-snug truncate">
                  {isCurrent ? step.activeLabel : step.doneLabel}
                </span>

                {isCurrent && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping ml-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Streaming footer indicator */}
        {!visibleSteps.isFinished && (
          <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center gap-2 text-[10px] text-white/40 font-mono">
            <Terminal className="h-3 w-3 text-cyan-400/60" />
            <span className="truncate">Compiling scene via LangGraph workflow...</span>
          </div>
        )}
      </div>
    </div>
  );
}
