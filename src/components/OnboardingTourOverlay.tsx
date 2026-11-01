import React, { useState } from 'react';
import { DraggableWindow } from './DraggableWindow';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

interface OnboardingTourOverlayProps {
  isOpen: boolean;
  onCompleteOrDismiss: () => void;
  onOpenContractsModal: () => void;
}

const TOUR_STEPS = [
  {
    step: 1,
    badge: 'Step 1 of 4 · 3D Viewport & Touch/Mouse Controls',
    title: 'Snap-Build on the 3D Studio Plot',
    body: 'Click or tap any block face to place a block. Right-click (or switch to Erase) to break blocks with voxel debris particles. On mobile/tablet, use two fingers to pinch-to-zoom and pan smoothly.',
    highlightHint: 'Try clicking a block in the 3D viewport right now!',
  },
  {
    step: 2,
    badge: 'Step 2 of 4 · Shift+Scroll Scaling & 3D Volume Brushes',
    title: 'Resize Blocks & Sculpt with 3D Spheres/Cubes',
    body: 'Hold Shift + Scroll the mouse wheel (or use the top HUD +/- buttons) to scale blocks from 0.25× micro-studs up to 8× beams. Press Y or O to switch to 3D Volume Place/Erase Brushes.',
    highlightHint: 'Top-Center HUD shows your active scale and brush radius.',
  },
  {
    step: 3,
    badge: 'Step 3 of 4 · Self-Learning Spatial Copilot & Symmetry',
    title: 'Accept Ghost Runs with [Tab] & Mirror with [V]',
    body: 'As you place blocks, the Local Spatial Copilot predicts your next wall, roof slope, or pillar run in emerald wireframe. Press Tab to accept the entire ghost run at once, or press V to enable Live Bilateral/4-Way Symmetry!',
    highlightHint: 'Copilot learns from your habits and adapts if you remove a block.',
  },
  {
    step: 4,
    badge: 'Step 4 of 4 · Architectural Contracts, Biomes & Cinema',
    title: 'Earn Mastery Ranks, Generate Biomes & Replay Timelapses',
    body: 'Open "Contracts & Biomes" in the top bar to generate 6 procedural island biomes, complete live architectural contracts for XP, or launch "Cinema" to replay your build from the ground up.',
    highlightHint: 'All projects save automatically to your high-capacity IndexedDB.',
  },
];

export const OnboardingTourOverlay: React.FC<OnboardingTourOverlayProps> = ({
  isOpen,
  onCompleteOrDismiss,
  onOpenContractsModal,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  if (!isOpen) return null;

  const current = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <DraggableWindow
      windowId="onboarding_tour_window"
      title="Interactive Studio Tour"
      subtitle={current.badge}
      defaultWidth={520}
      defaultHeight={255}
      minWidth={320}
      minHeight={220}
      defaultPinnedFloating={true}
      onClose={onCompleteOrDismiss}
      testId="onboarding-tour-overlay"
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs bg-slate-950/95">
        <div className="flex items-center justify-between gap-2">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono font-bold text-[10px] flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>{current.badge}</span>
          </span>

          <button
            type="button"
            data-testid="onboarding-skip-btn"
            onClick={onCompleteOrDismiss}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px]"
          >
            Skip Tour
          </button>
        </div>

        <h3 className="text-sm font-bold text-slate-100">{current.title}</h3>
        <p className="text-xs text-slate-300 leading-relaxed">{current.body}</p>

        <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300">
          {current.highlightHint}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                aria-label={`Tour Step ${s.step}`}
                onClick={() => setStepIdx(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIdx
                    ? 'w-6 bg-amber-400'
                    : 'w-2 bg-slate-700 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
              >
                Back
              </button>
            )}

            {isLast ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onCompleteOrDismiss();
                    onOpenContractsModal();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1"
                >
                  <span>Explore Biomes & Contracts</span>
                </button>
                <button
                  type="button"
                  data-testid="onboarding-finish-btn"
                  onClick={onCompleteOrDismiss}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Start Building</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="onboarding-next-btn"
                onClick={() => setStepIdx((i) => i + 1)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
