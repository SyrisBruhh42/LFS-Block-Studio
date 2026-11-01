import React from 'react';
import {
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
} from '../engine/studioEngagementEngine';
import { DraggableWindow } from './DraggableWindow';
import {
  Camera,
  Film,
  Grid,
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  Sun,
} from 'lucide-react';

interface CinematicTimelapseDockProps {
  isOpen: boolean;
  onClose: () => void;
  totalBlocksCount: number;
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: 1 | 2 | 5 | 10 | 20;
  turntableEnabled: boolean;
  showFramingGrid: boolean;
  activeAtmosphereId: AtmospherePresetId;
  onTogglePlay: () => void;
  onScrubStep: (step: number) => void;
  onChangeSpeed: (speed: 1 | 2 | 5 | 10 | 20) => void;
  onToggleTurntable: () => void;
  onToggleFramingGrid: () => void;
  onSelectAtmosphere: (id: AtmospherePresetId) => void;
  onCaptureSnapshotPng: () => void;
}

export const CinematicTimelapseDock: React.FC<CinematicTimelapseDockProps> = ({
  isOpen,
  onClose,
  totalBlocksCount,
  currentStep,
  isPlaying,
  playbackSpeed,
  turntableEnabled,
  showFramingGrid,
  activeAtmosphereId,
  onTogglePlay,
  onScrubStep,
  onChangeSpeed,
  onToggleTurntable,
  onToggleFramingGrid,
  onSelectAtmosphere,
  onCaptureSnapshotPng,
}) => {
  if (!isOpen) return null;

  const progressPct =
    totalBlocksCount > 0
      ? Math.round((currentStep / totalBlocksCount) * 100)
      : 100;

  return (
    <>
      {/* Optional Rule-of-Thirds Architectural Framing Guide Overlay */}
      {showFramingGrid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 grid grid-cols-3 grid-rows-3"
        >
          <div className="border-r border-b border-amber-400/20" />
          <div className="border-r border-b border-amber-400/20" />
          <div className="border-b border-amber-400/20" />
          <div className="border-r border-b border-amber-400/20" />
          <div className="border-r border-b border-amber-400/20 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-amber-400/40" />
          </div>
          <div className="border-b border-amber-400/20" />
          <div className="border-r border-amber-400/20" />
          <div className="border-r border-amber-400/20" />
          <div />
        </div>
      )}

      {/* Draggable & Resizable Cinema & Timelapse Control Deck Window */}
      <DraggableWindow
        windowId="cinema_timelapse_window"
        title="Cinema Photo Mode & Build Timelapse Replay"
        subtitle={`Block ${currentStep}/${totalBlocksCount} (${progressPct}%)`}
        defaultWidth={760}
        defaultHeight={188}
        minWidth={330}
        minHeight={165}
        defaultY={
          typeof window !== 'undefined'
            ? Math.max(80, window.innerHeight - 250)
            : 540
        }
        defaultPinnedFloating={true}
        onClose={onClose}
        testId="cinematic-timelapse-dock"
      >
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs bg-slate-950/95">
          {/* Row 1: Speed Controls & Block Counter */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Film className="w-3 h-3" />
                <span>Timelapse</span>
              </span>
              <span className="text-xs font-mono text-slate-300">
                Block <strong className="text-amber-400">{currentStep}</strong>{' '}
                / {totalBlocksCount} ({progressPct}%)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {([1, 2, 5, 10, 20] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onChangeSpeed(spd)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors ${
                    playbackSpeed === spd
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Transport Buttons + Timeline Slider */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-testid="timelapse-play-pause-btn"
              onClick={onTogglePlay}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5 shrink-0"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {currentStep < totalBlocksCount ? 'Play' : 'Replay Build'}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onScrubStep(0)}
              title="Rewind to Foundation (0 blocks)"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(1, totalBlocksCount)}
              value={currentStep}
              aria-label="Timelapse Block Scrubber"
              onChange={(e) => onScrubStep(parseInt(e.target.value, 10))}
              className="flex-1 accent-amber-500 cursor-pointer"
            />

            <button
              type="button"
              onClick={() => onScrubStep(totalBlocksCount)}
              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-mono text-emerald-300 shrink-0"
            >
              Full Build
            </button>
          </div>

          {/* Row 3: Atmosphere Quick-Switcher, Camera Turntable, Rule-of-Thirds & PNG Export */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
            <div className="flex items-center gap-1 overflow-x-auto">
              <Sun className="w-3.5 h-3.5 text-amber-400 mr-0.5 shrink-0" />
              {ATMOSPHERE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectAtmosphere(preset.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap border transition-colors ${
                    activeAtmosphereId === preset.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: preset.badgeColor }}
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="cinema-turntable-toggle"
                onClick={onToggleTurntable}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${
                  turntableEnabled
                    ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3 h-3" />
                <span>Turntable</span>
              </button>

              <button
                type="button"
                onClick={onToggleFramingGrid}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${
                  showFramingGrid
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                title="Toggle Rule-of-Thirds Composition Grid"
              >
                <Grid className="w-3 h-3" />
                <span className="hidden sm:inline">Thirds</span>
              </button>

              <button
                type="button"
                data-testid="cinema-capture-png-btn"
                onClick={onCaptureSnapshotPng}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Save PNG Photo</span>
              </button>
            </div>
          </div>
        </div>
      </DraggableWindow>
    </>
  );
};
