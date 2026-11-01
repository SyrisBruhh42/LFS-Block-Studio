import React, { useEffect, useState } from 'react';
import {
  HOTKEY_ACTIONS_META,
  HotkeyActionId,
  HotkeyCategory,
  HotkeyConfig,
  createDefaultHotkeyConfig,
  formatKeyCode,
} from '../engine/hotkeys';
import {
  AlertTriangle,
  Crosshair,
  Keyboard,
  MousePointer,
  Plane,
  RotateCcw,
  X,
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotkeyConfig: HotkeyConfig;
  onChangeHotkeyConfig: (next: HotkeyConfig) => void;
  flyMode: boolean;
  onToggleFlyMode: () => void;
  mouseLookToggled?: boolean;
  onToggleMouseLookMode?: () => void;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({
  isOpen,
  onClose,
  hotkeyConfig,
  onChangeHotkeyConfig,
  flyMode,
  onToggleFlyMode,
  mouseLookToggled = false,
  onToggleMouseLookMode,
}) => {
  const [listeningActionId, setListeningActionId] =
    useState<HotkeyActionId | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | HotkeyCategory>(
    'all'
  );

  useEffect(() => {
    if (!listeningActionId) return;

    const handleKeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setListeningActionId(null);
        return;
      }

      const nextCode = e.code || e.key;
      onChangeHotkeyConfig({
        ...hotkeyConfig,
        bindings: {
          ...hotkeyConfig.bindings,
          [listeningActionId]: nextCode,
        },
      });
      setListeningActionId(null);
    };

    window.addEventListener('keydown', handleKeyCapture, true);
    return () => window.removeEventListener('keydown', handleKeyCapture, true);
  }, [listeningActionId, hotkeyConfig, onChangeHotkeyConfig]);

  if (!isOpen) return null;

  // Detect duplicate key bindings
  const codeCounts: Record<string, number> = {};
  for (const code of Object.values(hotkeyConfig.bindings) as string[]) {
    if (!code) continue;
    codeCounts[code] = (codeCounts[code] || 0) + 1;
  }

  const visibleActions = HOTKEY_ACTIONS_META.filter((item) =>
    activeCategory === 'all' ? true : item.category === activeCategory
  );

  const handleResetDefaults = () => {
    setListeningActionId(null);
    onChangeHotkeyConfig(createDefaultHotkeyConfig());
  };

  return (
    <DraggableWindow
      windowId="hotkeys_window"
      isOpen={isOpen}
      onClose={onClose}
      title="Controls, Mouse Free-Look & Hotkey Mapping"
      subtitle="Customize Minecraft-style Free-Look Fly Building vs. Studio Pan/Zoom, WASD flight, and shortcuts"
      icon={<Keyboard className="w-4 h-4 text-amber-400" />}
      defaultWidth={780}
      defaultHeight={640}
      minWidth={380}
      minHeight={320}
      zIndex={55}
      headerActions={
        <button
          type="button"
          onClick={handleResetDefaults}
          className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Defaults</span>
        </button>
      }
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Mouse Free-Look Fly Builder vs Studio Pan & Zoom Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Mouse Mode: 3D Free-Look Fly Builder vs. Studio Pan/Zoom
                  </h3>
                  <p className="text-xs text-slate-400">
                    Switch between looking around as a flying 3D invisible character (Minecraft fly building) and large-scale orbital pan/zoom
                  </p>
                </div>
              </div>

              {onToggleMouseLookMode && (
                <button
                  type="button"
                  onClick={onToggleMouseLookMode}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    mouseLookToggled
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {mouseLookToggled ? (
                    <>
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Active: Free-Look Fly Builder</span>
                    </>
                  ) : (
                    <>
                      <MousePointer className="w-3.5 h-3.5" />
                      <span>Active: Studio Pan & Zoom</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-900">
              {/* Toggle Key Quick Rebind */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-100 block">
                    Toggle Mouse Look Mode Key
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Press once to switch Free-Look ↔ Pan/Zoom
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setListeningActionId(
                      listeningActionId === 'toggleMouseLookMode'
                        ? null
                        : 'toggleMouseLookMode'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border whitespace-nowrap shrink-0 ${
                    listeningActionId === 'toggleMouseLookMode'
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-950 text-amber-300 border-slate-700 hover:border-amber-400'
                  }`}
                >
                  {listeningActionId === 'toggleMouseLookMode'
                    ? 'Press key... (Esc)'
                    : formatKeyCode(hotkeyConfig.bindings.toggleMouseLookMode)}
                </button>
              </div>

              {/* Hold Key Quick Rebind */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-100 block">
                    Hold for Mouse Free-Look Key
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Hold key to momentarily switch mouse mode
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setListeningActionId(
                      listeningActionId === 'holdMouseLookMode'
                        ? null
                        : 'holdMouseLookMode'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border whitespace-nowrap shrink-0 ${
                    listeningActionId === 'holdMouseLookMode'
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-950 text-cyan-300 border-slate-700 hover:border-cyan-400'
                  }`}
                >
                  {listeningActionId === 'holdMouseLookMode'
                    ? 'Press key... (Esc)'
                    : formatKeyCode(hotkeyConfig.bindings.holdMouseLookMode)}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">
                    Mouse Look Sensitivity
                  </span>
                  <span className="font-mono text-emerald-400">
                    {(hotkeyConfig.flight.mouseLookSensitivity || 1.0).toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.1}
                  aria-label="Mouse Look Sensitivity"
                  value={hotkeyConfig.flight.mouseLookSensitivity || 1.0}
                  onChange={(e) =>
                    onChangeHotkeyConfig({
                      ...hotkeyConfig,
                      flight: {
                        ...hotkeyConfig.flight,
                        mouseLookSensitivity: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={hotkeyConfig.flight.crosshairCenterAim !== false}
                  onChange={(e) =>
                    onChangeHotkeyConfig({
                      ...hotkeyConfig,
                      flight: {
                        ...hotkeyConfig.flight,
                        crosshairCenterAim: e.target.checked,
                      },
                    })
                  }
                />
                <span>
                  Aim & build from Center Crosshair (+) in Free-Look Mode
                </span>
              </label>
            </div>
          </div>

          {/* Minecraft WASD Flight Settings Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Plane className="w-4 h-4 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Minecraft Creative WASD Flight Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fly with W/A/S/D, ascend with Space, descend with Shift, and hold Ctrl to sprint-fly
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleFlyMode}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  flyMode
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>{flyMode ? 'Fly Mode: ACTIVE' : 'Enable Fly Mode'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-900">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">Flight Speed</span>
                  <span className="font-mono text-amber-400">
                    {hotkeyConfig.flight.flySpeed.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={3.0}
                  step={0.1}
                  aria-label="Flight Speed Multiplier"
                  value={hotkeyConfig.flight.flySpeed}
                  onChange={(e) =>
                    onChangeHotkeyConfig({
                      ...hotkeyConfig,
                      flight: {
                        ...hotkeyConfig.flight,
                        flySpeed: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={hotkeyConfig.flight.doubleSpaceToToggleFly}
                  onChange={(e) =>
                    onChangeHotkeyConfig({
                      ...hotkeyConfig,
                      flight: {
                        ...hotkeyConfig.flight,
                        doubleSpaceToToggleFly: e.target.checked,
                      },
                    })
                  }
                />
                <span>Double-tap Space to toggle Fly Mode</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={hotkeyConfig.flight.invertFlightLookY}
                  onChange={(e) =>
                    onChangeHotkeyConfig({
                      ...hotkeyConfig,
                      flight: {
                        ...hotkeyConfig.flight,
                        invertFlightLookY: e.target.checked,
                      },
                    })
                  }
                />
                <span>Invert Y-Axis Free-Look in Fly Mode</span>
              </label>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
              {(
                [
                  { id: 'all', label: `All Shortcuts (${HOTKEY_ACTIONS_META.length})` },
                  { id: 'flight', label: 'Flight & Camera' },
                  { id: 'tools', label: 'Building & 3D Brushes' },
                  { id: 'selection', label: 'Selection & Gizmos' },
                  { id: 'worldedit', label: 'WorldEdit & CLI' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeCategory === tab.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-400">
              Click any key badge below, then press a new key to rebind
            </span>
          </div>

          {/* Keybinding List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleActions.map((action) => {
              const boundCode = hotkeyConfig.bindings[action.id];
              const isListening = listeningActionId === action.id;
              const hasConflict =
                Boolean(boundCode) && (codeCounts[boundCode] || 0) > 1;

              return (
                <div
                  key={action.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isListening
                      ? 'bg-amber-500/10 border-amber-400'
                      : hasConflict
                        ? 'bg-rose-950/30 border-rose-500/50'
                        : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-100">
                        {action.label}
                      </span>
                      {hasConflict && (
                        <span
                          title="Duplicate keybinding detected"
                          className="inline-flex items-center gap-0.5 text-[10px] font-mono text-rose-400"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Conflict
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {action.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid={`hotkey-bind-${action.id}`}
                    onClick={() =>
                      setListeningActionId(isListening ? null : action.id)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border whitespace-nowrap shrink-0 transition-all ${
                      isListening
                        ? 'bg-amber-500 text-slate-950 border-amber-300'
                        : hasConflict
                          ? 'bg-rose-500/20 text-rose-200 border-rose-500/50 hover:bg-rose-500/30'
                          : 'bg-slate-900 text-amber-300 border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    {isListening
                      ? 'Press key... (Esc)'
                      : formatKeyCode(boundCode)}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
            <span>
              Number keys <strong className="text-slate-200 font-mono">1–9</strong>{' '}
              select Hotbar slots ·{' '}
              <strong className="text-slate-200 font-mono">Ctrl+Z / Ctrl+Shift+Z</strong>{' '}
              Undo & Redo
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
