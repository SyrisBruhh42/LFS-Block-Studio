import React, { useState } from 'react';
import {
  BlueprintPrefab,
  CustomBlockDefinition,
  GridCoord,
  ToolMode,
} from '../engine/types';
import {
  WORLDEDIT_COMMANDS_HELP,
  getSelectionDimensions,
} from '../engine/worldEditEngine';
import { CameraViewPreset } from './SkyblockViewport';
import {
  BookmarkPlus,
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Eraser,
  Grid,
  Hammer,
  Keyboard,
  Paintbrush,
  Pipette,
  Plane,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Sparkles,
  Stamp,
  Sun,
  Terminal,
  Undo2,
  Wand2,
} from 'lucide-react';

interface BottomStudioDockProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  toolMode: ToolMode;
  onSelectToolMode: (mode: ToolMode) => void;
  hotbarBlockIds: string[];
  activeBlockId: string;
  onSelectBlockId: (id: string) => void;
  customBlocks: Record<string, CustomBlockDefinition>;
  activeBlueprint: BlueprintPrefab | null;
  placementRotation: 0 | 90 | 180 | 270;
  onRotatePlacement: () => void;
  pos1: GridCoord | null;
  pos2: GridCoord | null;
  hoveredCoord: GridCoord;
  canUndo: boolean;
  canRedo: boolean;
  commandLog: { id: string; cmd: string; message: string; success: boolean }[];
  onRunCommand: (cmd: string) => void;
  onOpenWorkshop: () => void;
  onOpenSaveSelectionBlueprint: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  daylightMode: boolean;
  onToggleDaylight: () => void;
  onSelectCameraPreset: (preset: CameraViewPreset) => void;
  flyMode: boolean;
  onToggleFlyMode: () => void;
  onOpenHotkeys: () => void;
}

export const BottomStudioDock: React.FC<BottomStudioDockProps> = ({
  isCollapsed,
  onToggleCollapse,
  toolMode,
  onSelectToolMode,
  hotbarBlockIds,
  activeBlockId,
  onSelectBlockId,
  customBlocks,
  activeBlueprint,
  placementRotation,
  onRotatePlacement,
  pos1,
  pos2,
  hoveredCoord,
  canUndo,
  canRedo,
  commandLog,
  onRunCommand,
  onOpenWorkshop,
  onOpenSaveSelectionBlueprint,
  showGrid,
  onToggleGrid,
  daylightMode,
  onToggleDaylight,
  onSelectCameraPreset,
  flyMode,
  onToggleFlyMode,
  onOpenHotkeys,
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [showCommandHelp, setShowCommandHelp] = useState(false);

  const selectionDims =
    pos1 && pos2 ? getSelectionDimensions(pos1, pos2) : null;

  const activeBlockDef = customBlocks[activeBlockId];

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onRunCommand(commandInput);
    setCommandInput('');
  };

  const filteredSuggestions = commandInput.trim()
    ? WORLDEDIT_COMMANDS_HELP.filter((item) =>
        item.cmd.toLowerCase().includes(commandInput.trim().toLowerCase())
      ).slice(0, 5)
    : [];

  return (
    <div
      style={{
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(940px, 95vw)',
      }}
      className="fixed z-30 w-full pointer-events-none flex flex-col items-center"
    >
      {/* Collapse / Expand Handle (Cinema / Zen Mode Drawer) */}
      <div className="pointer-events-auto flex items-center gap-2 mb-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="px-3.5 py-1.5 rounded-t-xl bg-slate-900 border border-b-0 border-slate-700 text-xs font-medium text-slate-200 hover:text-amber-400 flex items-center gap-1.5 shadow-lg whitespace-nowrap shrink-0"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Studio Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/95 border border-slate-800 text-xs font-mono text-slate-300">
          <span>
            Cursor ({hoveredCoord.x}, {hoveredCoord.y}, {hoveredCoord.z})
          </span>
          {selectionDims && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-400">
                Pos1({pos1!.x},{pos1!.y},{pos1!.z}) → Pos2({pos2!.x},{pos2!.y},
                {pos2!.z}) [{selectionDims.lx}×{selectionDims.ly}×
                {selectionDims.lz}]
              </span>
            </>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="pointer-events-auto w-full rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-2xl p-3 space-y-2.5">
          {/* Recent Command Feedback Banner */}
          {commandLog.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
              <div className="truncate">
                <span className="text-amber-400 font-semibold">
                  {commandLog[commandLog.length - 1].cmd}
                </span>
                <span className="text-slate-500 mx-1.5">→</span>
                <span
                  className={
                    commandLog[commandLog.length - 1].success
                      ? 'text-emerald-300'
                      : 'text-rose-400'
                  }
                >
                  {commandLog[commandLog.length - 1].message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCommandHelp((prev) => !prev)}
                className="text-xs text-cyan-400 hover:underline whitespace-nowrap shrink-0"
              >
                {showCommandHelp ? 'Hide //help' : 'Commands //help'}
              </button>
            </div>
          )}

          {/* Expandable WorldEdit Command Reference */}
          {showCommandHelp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 max-h-36 overflow-y-auto text-xs">
              {WORLDEDIT_COMMANDS_HELP.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => {
                    setCommandInput(item.example);
                    setShowCommandHelp(false);
                  }}
                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-left transition-colors"
                >
                  <div className="font-mono font-semibold text-amber-400">
                    {item.cmd}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Row 1: WorldEdit CLI Input + Quick Spatial Action Buttons */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <form
              onSubmit={handleCommandSubmit}
              className="relative flex-1 flex items-center gap-1.5"
            >
              <div className="relative flex-1">
                <Terminal className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="worldedit-cli-input"
                  type="text"
                  aria-label="WorldEdit Command Console"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder={`Type WorldEdit command (e.g. //set ${activeBlockId}, //walls cobble, //copy, //paste, //undo)...`}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
                {filteredSuggestions.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 rounded-lg bg-slate-950 border border-slate-700 shadow-xl p-1 z-40">
                    {filteredSuggestions.map((s) => (
                      <button
                        key={s.cmd}
                        type="button"
                        onClick={() => setCommandInput(s.example)}
                        className="w-full px-2.5 py-1.5 text-left text-xs font-mono hover:bg-slate-800 rounded flex items-center justify-between"
                      >
                        <span className="text-amber-400 font-semibold">{s.cmd}</span>
                        <span className="text-slate-400 text-[11px]">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                id="worldedit-run-btn"
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
              >
                Run //
              </button>
            </form>

            {/* One-Click WorldEdit Operations for Touch & Desktop */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 md:pb-0">
              <button
                type="button"
                onClick={() => onRunCommand(`//set ${activeBlockId}`)}
                title="Fill Pos1–Pos2 selection with active block"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 whitespace-nowrap shrink-0"
              >
                //set
              </button>
              <button
                type="button"
                onClick={() => onRunCommand(`//walls ${activeBlockId}`)}
                title="Build perimeter walls with active block"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 whitespace-nowrap shrink-0"
              >
                //walls
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//hollow')}
                title="Hollow out interior of selection"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                //hollow
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//copy')}
                title="Copy selected region to clipboard"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                //copy
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//paste')}
                title="Paste clipboard at Pos1"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                //paste
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//stack 1 up')}
                title="Stack selection +1 layer upward"
                className="px-2.5 py-2 text-xs font-mono font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                //stack
              </button>
              <button
                type="button"
                onClick={onOpenSaveSelectionBlueprint}
                title="Save Pos1–Pos2 selection as a reusable Blueprint"
                className="px-2.5 py-2 text-xs font-medium rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Blueprint</span>
              </button>
            </div>
          </div>

          {/* Row 2: Tool Modes + 9-Slot Block Hotbar + View & Undo Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800">
            {/* Tool Mode Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
              <button
                type="button"
                onClick={() => onSelectToolMode('place')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  toolMode === 'place'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>Place</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectToolMode('erase')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  toolMode === 'erase'
                    ? 'bg-rose-500 text-white font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectToolMode('paint')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  toolMode === 'paint'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Paint</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectToolMode('wand_select')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  toolMode === 'wand_select'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Wand Pos1/2</span>
              </button>

              {activeBlueprint && (
                <button
                  type="button"
                  onClick={() => onSelectToolMode('stamp_blueprint')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    toolMode === 'stamp_blueprint'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <Stamp className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[110px]">
                    Stamp: {activeBlueprint.name}
                  </span>
                </button>
              )}
            </div>

            {/* 9-Slot Customizable Block Palette Hotbar */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {hotbarBlockIds.map((blockId, idx) => {
                const def = customBlocks[blockId];
                if (!def) return null;
                const isSelected =
                  activeBlockId === blockId && toolMode !== 'stamp_blueprint';
                return (
                  <button
                    key={blockId}
                    type="button"
                    onClick={() => {
                      onSelectBlockId(blockId);
                      if (toolMode === 'stamp_blueprint') {
                        onSelectToolMode('place');
                      }
                    }}
                    title={`${def.name} (${def.width}×${def.depth})`}
                    aria-label={`Select block ${def.name}`}
                    className={`group relative px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-slate-800 border-amber-400 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-slate-500">
                      {idx + 1}
                    </span>
                    <span
                      style={{ backgroundColor: def.color }}
                      className="w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0"
                    />
                    <span className="truncate max-w-[78px]">{def.name}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={onOpenWorkshop}
                aria-label="Create Custom Block in Workshop"
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Block</span>
              </button>
            </div>

            {/* Utility Controls: Rotate, Undo, Redo, Camera, Grid, Sky */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRotatePlacement}
                title="Rotate block or blueprint 90° (Key R)"
                aria-label="Rotate 90 degrees"
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>{placementRotation}°</span>
              </button>

              <button
                type="button"
                disabled={!canUndo}
                onClick={() => onRunCommand('//undo')}
                title="Undo (//undo)"
                aria-label="Undo"
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-35 text-slate-200"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={!canRedo}
                onClick={() => onRunCommand('//redo')}
                title="Redo (//redo)"
                aria-label="Redo"
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-35 text-slate-200"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleGrid}
                title="Toggle 3D Stud Grid"
                aria-label="Toggle 3D Grid"
                className={`p-2 rounded-lg border ${
                  showGrid
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleDaylight}
                title="Toggle Daylight / Dark Sky Studio"
                aria-label="Toggle Sky Lighting"
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleFlyMode}
                title="Toggle Minecraft WASD Fly Mode (Key F or Double-Space)"
                aria-label="Toggle Fly Mode"
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  flyMode
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>{flyMode ? 'Fly ON' : 'WASD Fly'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenHotkeys}
                title="Shortcut & Hotkey Mapping Menu (Key M)"
                aria-label="Open Hotkey Mapping Menu"
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200"
              >
                <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => onSelectCameraPreset('isometric')}
                title="Reset Isometric Camera (Key V)"
                className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] font-medium text-slate-300 whitespace-nowrap shrink-0"
              >
                Iso Cam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
