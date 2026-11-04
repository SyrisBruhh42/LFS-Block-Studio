import React, { useEffect, useRef, useState } from 'react';
import {
  ActionBarLayoutStyle,
  ActionBarSlotItem,
  CommandMacroLoop,
  CustomBlockDefinition,
  ModularActionBar,
  ModularHudConfig,
  ToolMode,
} from '../engine/types';
import {
  STUDIO_DRAG_MIME,
  applyHudPercentSnapSystem,
  computeResponsiveBarLayout,
  dragPayloadToSlotItem,
  parseStudioDragPayload,
  serializeStudioDragPayload,
} from '../engine/windowLayoutEngine';
import {
  DraggableHudOverlay,
  DraggableWindow,
  triggerResetAllStudioWindows,
  useStudioSnapMode,
} from './DraggableWindow';
import {
  Eraser,
  Eye,
  EyeOff,
  Flame,
  GripVertical,
  Hammer,
  Layers,
  Lock,
  Magnet,
  Move,
  Paintbrush,
  Pipette,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Settings2,
  Sliders,
  Sparkles,
  Store,
  Terminal,
  Trash2,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';

interface ModularActionBarsHudProps {
  hudConfig: ModularHudConfig;
  onChangeHudConfig: (next: ModularHudConfig) => void;
  activeBlockId: string;
  onSelectBlockId: (id: string) => void;
  toolMode: ToolMode;
  onSelectToolMode: (mode: ToolMode) => void;
  customBlocks: Record<string, CustomBlockDefinition>;
  onRunCommand: (cmd: string) => void;
  onTriggerMacroLoop: (macro: CommandMacroLoop) => void;
  runningMacroId: string | null;
  onOpenBlockMarket: () => void;
  onOpenMainMenu: () => void;
  isPanningOrDrawing?: boolean;
  autoFadeOnPan?: boolean;
  centerViewportWidth?: number;
  centerViewportHeight?: number;
  hudBarAutoScale?: number;
  shouldStackBottomBars?: boolean;
}

const TOOL_LABELS: Record<
  ToolMode,
  { label: string; short: string; color: string }
> = {
  place: { label: 'Place Block (B)', short: 'Place', color: '#F59E0B' },
  erase: { label: 'Erase Block (X)', short: 'Erase', color: '#F43F5E' },
  brush_place: { label: '3D Volume Place (Y)', short: '3D+', color: '#10B981' },
  brush_erase: { label: '3D Volume Erase (O)', short: '3D-', color: '#FB7185' },
  paint: { label: 'Paint Material (G)', short: 'Paint', color: '#38BDF8' },
  pick: { label: 'Eyedropper Pick (I)', short: 'Pick', color: '#34D399' },
  wand_select: { label: 'Region Wand (E)', short: 'Wand', color: '#06B6D4' },
  stamp_blueprint: { label: 'Stamp Blueprint', short: 'Stamp', color: '#A855F7' },
};

export const ModularActionBarsHud: React.FC<ModularActionBarsHudProps> = ({
  hudConfig,
  onChangeHudConfig,
  activeBlockId,
  onSelectBlockId,
  toolMode,
  onSelectToolMode,
  customBlocks,
  onRunCommand,
  onTriggerMacroLoop,
  runningMacroId,
  onOpenBlockMarket,
  onOpenMainMenu,
  isPanningOrDrawing = false,
  autoFadeOnPan = false,
  centerViewportWidth = 1000,
  centerViewportHeight = 720,
  hudBarAutoScale = 1,
  shouldStackBottomBars = false,
}) => {
  const [snapMode, toggleSnapMode] = useStudioSnapMode();
  const [isHudManagerOpen, setIsHudManagerOpen] = useState(false);
  const [activeManagerTab, setActiveManagerTab] = useState<
    'bars' | 'macros' | 'assign'
  >('bars');
  const [selectedSlotTarget, setSelectedSlotTarget] = useState<{
    barId: string;
    slotIdx: number;
  } | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [activeBarSnapGuide, setActiveBarSnapGuide] = useState<{
    barId: string;
    verticalPercent: number | null;
    horizontalPercent: number | null;
    badge: string | null;
  } | null>(null);

  // Dragging state for moving bars around the viewport
  const draggingBarRef = useRef<{
    barId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origXPercent: number;
    origYPercent: number;
  } | null>(null);

  const cancelBarGesture = (event?: { pointerId: number }) => {
    if (!event || draggingBarRef.current?.pointerId === event.pointerId) {
      draggingBarRef.current = null; setActiveBarSnapGuide(null);
    }
  };
  useEffect(() => {
    const cancel = () => { draggingBarRef.current = null; setActiveBarSnapGuide(null); };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); draggingBarRef.current = null; };
  }, []);

  // Drag-and-drop state for swapping slots between or within bars
  const [draggedSlotSource, setDraggedSlotSource] = useState<{
    barId: string;
    slotIdx: number;
  } | null>(null);

  // New Macro Loop form state
  const [newMacroName, setNewMacroName] = useState('');
  const [newMacroCmds, setNewMacroCmds] = useState(
    '//walls cobble_brick\n//shift 1 up'
  );
  const [newMacroIterations, setNewMacroIterations] = useState(2);
  const [newMacroIntervalMs, setNewMacroIntervalMs] = useState(200);

  // Compute dynamic slots for any bar with isMostUsedAutoBar === true
  const getEffectiveSlotsForBar = (
    bar: ModularActionBar
  ): (ActionBarSlotItem | null)[] => {
    if (!bar.isMostUsedAutoBar) return bar.slots;
    const sortedBlockIds = Object.entries(hudConfig.usageCounts || {})
      .filter(([id]) => Boolean(customBlocks[id]))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id], idx) => ({
        id: `auto_most_${id}`,
        type: 'block' as const,
        targetId: id,
        hotkeyHint: `\u{2605}${idx + 1}`,
      }));
    return sortedBlockIds;
  };

  const handleToggleMasterEditMode = () => {
    onChangeHudConfig({
      ...hudConfig,
      masterHudEditMode: !hudConfig.masterHudEditMode,
    });
  };

  const updateBar = (
    barId: string,
    updater: (bar: ModularActionBar) => ModularActionBar
  ) => {
    onChangeHudConfig({
      ...hudConfig,
      bars: hudConfig.bars.map((b) => (b.id === barId ? updater(b) : b)),
    });
  };

  const handleBarPointerDown = (
    e: React.PointerEvent,
    bar: ModularActionBar,
    forceAllowDrag = false
  ) => {
    if (e.button !== 0 || !e.isPrimary || draggingBarRef.current || (!forceAllowDrag && bar.locked && !hudConfig.masterHudEditMode)) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or already-released pointer IDs
    }
    draggingBarRef.current = {
      barId: bar.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXPercent: bar.position.xPercent,
      origYPercent: bar.position.yPercent,
    };
  };

  const handleBarPointerMove = (e: React.PointerEvent) => {
    const drag = draggingBarRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const vw = Math.max(320, centerViewportWidth || window.innerWidth);
    const vh = Math.max(240, centerViewportHeight || window.innerHeight);
    const dxPct = ((e.clientX - drag.startClientX) / vw) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / vh) * 100;

    const rawX = drag.origXPercent + dxPct;
    const rawY = drag.origYPercent + dyPct;

    // Hold Shift while dragging to temporarily invert Free vs Magnetic Snap
    const effectiveMode = e.shiftKey
      ? snapMode === 'snap'
        ? 'free'
        : 'snap'
      : snapMode;

    const snapped = applyHudPercentSnapSystem(rawX, rawY, effectiveMode);

    setActiveBarSnapGuide({
      barId: drag.barId,
      verticalPercent: snapped.verticalGuidePercent,
      horizontalPercent: snapped.horizontalGuidePercent,
      badge: snapped.snapBadge,
    });

    updateBar(drag.barId, (b) => ({
      ...b,
      locked: false,
      position: {
        xPercent: snapped.xPercent,
        yPercent: snapped.yPercent,
      },
    }));
  };

  const handleBarPointerUp = (e: React.PointerEvent) => {
    if (draggingBarRef.current) {
      e.stopPropagation();
      draggingBarRef.current = null;
      setActiveBarSnapGuide(null);
    }
  };

  const handleSwapOrDropSlot = (
    e: React.DragEvent,
    targetBarId: string,
    targetSlotIdx: number
  ) => {
    e.preventDefault();
    setDragOverSlotKey(null);

    // 1. Check if dragged from another window (Paint Toolbox, Block Market, Command Legend)
    const externalRaw =
      e.dataTransfer.getData(STUDIO_DRAG_MIME) ||
      e.dataTransfer.getData('text/plain');
    const externalPayload = parseStudioDragPayload(externalRaw);

    if (
      externalPayload &&
      (!externalPayload.sourceBarId ||
        typeof externalPayload.sourceSlotIdx !== 'number')
    ) {
      const dstBar = hudConfig.bars.find((b) => b.id === targetBarId);
      if (!dstBar || dstBar.isMostUsedAutoBar) return;
      const newSlotItem = dragPayloadToSlotItem(externalPayload);
      updateBar(targetBarId, (b) => {
        const nextSlots = [...b.slots];
        nextSlots[targetSlotIdx] = newSlotItem;
        return { ...b, slots: nextSlots };
      });
      setDraggedSlotSource(null);
      return;
    }

    // 2. Otherwise swap slots between/within hotbars
    const srcInfo =
      draggedSlotSource ||
      (externalPayload?.sourceBarId &&
      typeof externalPayload.sourceSlotIdx === 'number'
        ? {
            barId: externalPayload.sourceBarId,
            slotIdx: externalPayload.sourceSlotIdx,
          }
        : null);

    if (!srcInfo) return;
    const { barId: srcBarId, slotIdx: srcIdx } = srcInfo;
    setDraggedSlotSource(null);
    if (srcBarId === targetBarId && srcIdx === targetSlotIdx) return;

    const nextBars = hudConfig.bars.map((b) => ({
      ...b,
      slots: [...b.slots],
    }));
    const srcBar = nextBars.find((b) => b.id === srcBarId);
    const dstBar = nextBars.find((b) => b.id === targetBarId);
    if (
      !srcBar ||
      !dstBar ||
      srcBar.isMostUsedAutoBar ||
      dstBar.isMostUsedAutoBar
    ) {
      return;
    }

    const temp = srcBar.slots[srcIdx] || null;
    srcBar.slots[srcIdx] = dstBar.slots[targetSlotIdx] || null;
    dstBar.slots[targetSlotIdx] = temp;

    onChangeHudConfig({ ...hudConfig, bars: nextBars });
  };

  const handleActivateSlot = (slot: ActionBarSlotItem | null) => {
    if (!slot) return;
    if (slot.type === 'block') {
      onSelectBlockId(slot.targetId);
    } else if (slot.type === 'tool') {
      onSelectToolMode(slot.targetId as ToolMode);
    } else if (slot.type === 'command') {
      onRunCommand(slot.targetId);
    } else if (slot.type === 'macro_loop') {
      const macro = hudConfig.macros.find((m) => m.id === slot.targetId);
      if (macro) onTriggerMacroLoop(macro);
    }
  };

  const handleAssignItemToSelectedSlot = (newItem: ActionBarSlotItem) => {
    if (!selectedSlotTarget) return;
    updateBar(selectedSlotTarget.barId, (b) => {
      const nextSlots = [...b.slots];
      nextSlots[selectedSlotTarget.slotIdx] = newItem;
      return { ...b, slots: nextSlots };
    });
  };

  const handleCreateNewBar = () => {
    const idx = hudConfig.bars.length + 1;
    const newBar: ModularActionBar = {
      id: `bar_custom_${Date.now()}`,
      name: `Bar ${idx}: Custom Hotbar`,
      enabled: true,
      locked: false,
      layout: 'row',
      scale: 1.0,
      opacity: 0.95,
      position: { xPercent: 50, yPercent: 74 },
      slots: [
        {
          id: `slot_${Date.now()}_1`,
          type: 'block',
          targetId: activeBlockId,
        },
        {
          id: `slot_${Date.now()}_2`,
          type: 'tool',
          targetId: 'brush_place',
          label: '3D+',
        },
        {
          id: `slot_${Date.now()}_3`,
          type: 'command',
          targetId: `//walls ${activeBlockId}`,
          label: '//walls',
        },
        null,
      ],
    };
    onChangeHudConfig({
      ...hudConfig,
      masterHudEditMode: true,
      bars: [...hudConfig.bars, newBar],
    });
  };

  const handleCreateCustomMacro = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = newMacroCmds
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!newMacroName.trim() || lines.length === 0) return;

    const macro: CommandMacroLoop = {
      id: `macro_${Date.now()}`,
      name: newMacroName.trim(),
      description: `${lines.length} command${lines.length === 1 ? '' : 's'} × ${newMacroIterations} loop${newMacroIterations === 1 ? '' : 's'}`,
      commands: lines,
      iterations: Math.max(1, Math.min(16, newMacroIterations)),
      intervalMs: Math.max(0, Math.min(2000, newMacroIntervalMs)),
      iconColor: '#10B981',
    };

    onChangeHudConfig({
      ...hudConfig,
      macros: [macro, ...hudConfig.macros],
    });
    setNewMacroName('');
  };

  return (
    <>
      {/* Live Magnetic Alignment Guides while dragging any Modular Action Bar */}
      {activeBarSnapGuide && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        >
          {activeBarSnapGuide.verticalPercent !== null && (
            <div
              style={{ left: `${activeBarSnapGuide.verticalPercent}%` }}
              className="absolute top-0 bottom-0 w-px bg-cyan-400/90 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
            />
          )}
          {activeBarSnapGuide.horizontalPercent !== null && (
            <div
              style={{ top: `${activeBarSnapGuide.horizontalPercent}%` }}
              className="absolute left-0 right-0 h-px bg-cyan-400/90 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
            />
          )}
        </div>
      )}

      {/* WoW / ElvUI Master Edit Mode Snap Grid Overlay */}
      {hudConfig.masterHudEditMode && (
        <div
          data-testid="hud-edit-mode-banner"
          className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-amber-400/50 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:24px_24px] opacity-80"
        >
          <div className="pointer-events-auto absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-xl flex flex-wrap items-center justify-center gap-2 max-w-[94vw]">
            <Move className="w-4 h-4 shrink-0" />
            <span>
              HUD Edit Mode — Drag bars freely or on magnetic snap, drag slots to
              swap, or click a slot to assign
            </span>
            <button
              type="button"
              onClick={() =>
                toggleSnapMode(snapMode === 'snap' ? 'free' : 'snap')
              }
              className="px-2 py-0.5 rounded bg-slate-950 text-cyan-300 font-mono text-[11px] flex items-center gap-1"
            >
              <Magnet className="w-3 h-3" />
              <span>{snapMode === 'snap' ? 'Snap 2%' : 'Free Drag'}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleMasterEditMode}
              className="px-2.5 py-0.5 rounded bg-slate-950 text-amber-300 font-semibold text-[11px]"
            >
              Lock All Bars
            </button>
          </div>
        </div>
      )}

      {/* Draggable Floating Quick-Access Pill for Main Menu, Block Market, HUD Bar Manager & Reset Layout */}
      <DraggableHudOverlay
        hudId="quick_access_dock"
        defaultXPercent={16}
        defaultYPercent={94}
        label="Drag Quick-Access Bar"
        className={`hidden md:flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 shadow-lg text-xs z-30 transition-opacity duration-200 ${
          autoFadeOnPan && isPanningOrDrawing
            ? 'opacity-30 pointer-events-none'
            : 'opacity-100'
        }`}
      >
        <button
          type="button"
          data-testid="floating-main-menu-btn"
          onClick={onOpenMainMenu}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold flex items-center gap-1.5 border border-slate-700 whitespace-nowrap"
          title="Open Main Menu: Save/Load Projects & Reset Entire World or Specific Chunks"
        >
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>Projects</span>
        </button>

        <button
          type="button"
          data-testid="floating-block-market-btn"
          onClick={onOpenBlockMarket}
          className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold flex items-center gap-1.5 border border-amber-500/40 whitespace-nowrap"
          title="Browse local block presets and manage the active block library"
        >
          <Store className="w-3.5 h-3.5 text-amber-400" />
          <span>Market</span>
        </button>

        <button
          type="button"
          data-testid="floating-hud-bars-config-btn"
          onClick={() => setIsHudManagerOpen((prev) => !prev)}
          className={`px-2 py-1 rounded-lg font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
            hudConfig.masterHudEditMode || isHudManagerOpen
              ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
          title="Customize Moveable, Resizable & Lockable Action Bars and Command Loops"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>HUD Bars</span>
        </button>

        <button
          type="button"
          data-testid="floating-snap-mode-toggle"
          onClick={() => toggleSnapMode(snapMode === 'snap' ? 'free' : 'snap')}
          className={`px-2 py-1 rounded-lg border font-mono text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap ${
            snapMode === 'snap'
              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
          }`}
          title="Toggle between Magnetic Grid/Edge Snap and Free 1px Dragging (or hold Shift while dragging)"
        >
          <Magnet className="w-3 h-3" />
          <span>{snapMode === 'snap' ? 'Snap' : 'Free'}</span>
        </button>

        <button
          type="button"
          data-testid="floating-hud-lock-toggle"
          onClick={handleToggleMasterEditMode}
          className={`p-1.5 rounded-lg border transition-colors ${
            hudConfig.masterHudEditMode
              ? 'bg-amber-500 text-slate-950 border-amber-300'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
          }`}
          title={
            hudConfig.masterHudEditMode
              ? 'Lock all HUD Action Bars'
              : 'Unlock all HUD Action Bars to drag & reposition'
          }
        >
          {hudConfig.masterHudEditMode ? (
            <Unlock className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          type="button"
          data-testid="reset-all-windows-btn"
          onClick={() => {
            triggerResetAllStudioWindows();
            onChangeHudConfig({
              ...hudConfig,
              bars: hudConfig.bars.map((b) => {
                if (b.id === 'bar_primary_blocks') {
                  return {
                    ...b,
                    locked: true,
                    position: { xPercent: 50, yPercent: 91 },
                  };
                }
                if (b.id === 'bar_tools_macros' || b.id === 'bar_quick_tools') {
                  return {
                    ...b,
                    locked: true,
                    position: { xPercent: 50, yPercent: 83 },
                  };
                }
                if (b.id === 'bar_most_used') {
                  return {
                    ...b,
                    locked: true,
                    position: { xPercent: 18, yPercent: 88 },
                  };
                }
                if (b.id === 'bar_command_loops') {
                  return {
                    ...b,
                    locked: true,
                    position: { xPercent: 82, yPercent: 88 },
                  };
                }
                return b;
              }),
            });
          }}
          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800"
          title="Reset All Floating Windows & HUD Bars to Default Layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </DraggableHudOverlay>

      {/* Render All Enabled Moveable, Resizable & Lockable Action Bars (Visible across all viewport widths!) */}
      {hudConfig.bars
        .filter((bar) => bar.enabled)
        .map((bar) => {
          const isUnlocked = !bar.locked || hudConfig.masterHudEditMode;
          const slots = getEffectiveSlotsForBar(bar);

          const responsivePos = computeResponsiveBarLayout(
            bar,
            centerViewportWidth,
            centerViewportHeight,
            hudBarAutoScale,
            shouldStackBottomBars
          );

          const layoutGridClass =
            bar.layout === 'column'
              ? 'flex flex-col gap-1'
              : bar.layout === 'grid_2x'
                ? 'grid grid-cols-4 gap-1'
                : bar.layout === 'grid_3x'
                  ? 'grid grid-cols-3 gap-1'
                  : 'flex flex-row items-center gap-1';

          const slotPx = Math.round(40 * responsivePos.effectiveScale);
          const isDraggingThisBar = activeBarSnapGuide?.barId === bar.id;

          return (
            <div
              key={bar.id}
              data-testid={`modular-action-bar-${bar.id}`}
              style={{
                left: `${responsivePos.leftPx}px`,
                top: `${responsivePos.topPx}px`,
                transform: 'translate(-50%, -50%)',
                opacity:
                  autoFadeOnPan && isPanningOrDrawing
                    ? 0.25
                    : bar.opacity || 0.95,
              }}
              className={`absolute flex flex-col z-20 rounded-xl bg-slate-950/95 ${
                isDraggingThisBar
                  ? 'border-2 border-cyan-400 shadow-cyan-500/20'
                  : isUnlocked
                    ? 'border-2 border-amber-400 shadow-amber-500/10'
                    : 'border border-slate-800/90 hover:border-slate-700'
              } shadow-xl p-1.5 select-none transition-opacity duration-150`}
            >
              {/* Always-Accessible Compact Bar Header / Drag Handle */}
              <div
                onPointerDown={(e) => handleBarPointerDown(e, bar, true)}
                onPointerMove={handleBarPointerMove}
                onPointerUp={handleBarPointerUp}
                onPointerCancel={cancelBarGesture}
                onLostPointerCapture={cancelBarGesture}
                title={`Drag ${bar.name} to reposition (${snapMode === 'snap' ? 'Snap 2% · Hold Shift for Free' : 'Free Drag · Hold Shift for Snap'})`}
                className={`flex items-center justify-between gap-2 px-1.5 py-0.5 mb-1 rounded cursor-grab active:cursor-grabbing text-[10px] ${
                  isUnlocked
                    ? 'bg-slate-900 border border-slate-800'
                    : 'bg-slate-900/60 hover:bg-slate-900 border border-transparent hover:border-slate-800'
                }`}
              >
                <span className="font-mono font-bold text-slate-300 hover:text-amber-300 flex items-center gap-1 truncate max-w-[160px]">
                  <GripVertical className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {isDraggingThisBar && activeBarSnapGuide?.badge
                      ? activeBarSnapGuide.badge
                      : bar.name.split(':')[0]}
                  </span>
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const order: ActionBarLayoutStyle[] = [
                        'row',
                        'column',
                        'grid_2x',
                        'grid_3x',
                      ];
                      const nextLayout =
                        order[(order.indexOf(bar.layout) + 1) % order.length];
                      updateBar(bar.id, (b) => ({ ...b, layout: nextLayout }));
                    }}
                    className="px-1 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px]"
                    title="Cycle Bar Layout (Row / Column / 2-Row Grid / 3-Row Grid)"
                  >
                    {bar.layout === 'row'
                      ? '1×N'
                      : bar.layout === 'column'
                        ? 'N×1'
                        : bar.layout === 'grid_2x'
                          ? '2×4'
                          : '3×3'}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateBar(bar.id, (b) => ({
                        ...b,
                        scale:
                          b.scale >= 1.25
                            ? 0.85
                            : Number((b.scale + 0.15).toFixed(2)),
                      }));
                    }}
                    className="px-1 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[9px]"
                    title="Cycle Bar Scale (85% / 100% / 115% / 130%)"
                  >
                    {Math.round(bar.scale * 100)}%
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateBar(bar.id, (b) => ({ ...b, locked: !b.locked }));
                    }}
                    className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400"
                    title={bar.locked ? 'Unlock Bar' : 'Lock Bar Position'}
                  >
                    {bar.locked ? (
                      <Lock className="w-2.5 h-2.5" />
                    ) : (
                      <Unlock className="w-2.5 h-2.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Action Bar Slots */}
              <div className={layoutGridClass}>
                {slots.map((slot, sIdx) => {
                  const slotKey = `${bar.id}_${sIdx}`;
                  const isSelectedForAssign =
                    selectedSlotTarget?.barId === bar.id &&
                    selectedSlotTarget?.slotIdx === sIdx;
                  const isDragOver = dragOverSlotKey === slotKey;

                  let isActive = false;
                  let swatchColor = '#334155';
                  let titleText =
                    'Empty Slot (Drag any Block, Tool, or Command here, or Right-Click to assign)';
                  let shortLabel = '+';

                  if (slot) {
                    if (slot.type === 'block') {
                      const def = customBlocks[slot.targetId];
                      isActive =
                        toolMode === 'place' && activeBlockId === slot.targetId;
                      swatchColor = def?.color || '#64748B';
                      titleText = def
                        ? `${def.name} (${def.shape})`
                        : slot.targetId;
                      shortLabel = def
                        ? def.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 3)
                        : 'BLK';
                    } else if (slot.type === 'tool') {
                      const tMeta =
                        TOOL_LABELS[slot.targetId as ToolMode] ||
                        TOOL_LABELS.place;
                      isActive = toolMode === slot.targetId;
                      swatchColor = tMeta.color;
                      titleText = tMeta.label;
                      shortLabel = slot.label || tMeta.short;
                    } else if (slot.type === 'command') {
                      swatchColor = '#38BDF8';
                      titleText = `Run Command: ${slot.targetId}`;
                      shortLabel = slot.label || slot.targetId.replace('//', '');
                    } else if (slot.type === 'macro_loop') {
                      const macro = hudConfig.macros.find(
                        (m) => m.id === slot.targetId
                      );
                      isActive = runningMacroId === slot.targetId;
                      swatchColor = macro?.iconColor || '#10B981';
                      titleText = macro
                        ? `Review command recipe: ${macro.name} — ${macro.description}`
                        : 'Command Macro';
                      shortLabel =
                        slot.label ||
                        (macro ? macro.name.slice(0, 6) : 'Loop');
                    }
                  }

                  return (
                    <button
                      key={slot?.id || `empty_${sIdx}`}
                      type="button"
                      data-testid={`hotbar-slot-${bar.id}-${sIdx}`}
                      draggable={!bar.isMostUsedAutoBar && Boolean(slot)}
                      onDragStart={(e) => {
                        setDraggedSlotSource({ barId: bar.id, slotIdx: sIdx });
                        if (slot) {
                          const raw = serializeStudioDragPayload({
                            type: slot.type,
                            targetId: slot.targetId,
                            label: slot.label,
                            sourceBarId: bar.id,
                            sourceSlotIdx: sIdx,
                          });
                          e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
                          e.dataTransfer.setData('text/plain', raw);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!bar.isMostUsedAutoBar) {
                          setDragOverSlotKey(slotKey);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverSlotKey === slotKey) {
                          setDragOverSlotKey(null);
                        }
                      }}
                      onDrop={(e) => handleSwapOrDropSlot(e, bar.id, sIdx)}
                      onClick={() => {
                        if (
                          !bar.isMostUsedAutoBar &&
                          (!slot || isHudManagerOpen)
                        ) {
                          setSelectedSlotTarget({ barId: bar.id, slotIdx: sIdx });
                          setIsHudManagerOpen(true);
                          setActiveManagerTab('assign');
                          return;
                        }
                        handleActivateSlot(slot);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!bar.isMostUsedAutoBar) {
                          setSelectedSlotTarget({ barId: bar.id, slotIdx: sIdx });
                          setIsHudManagerOpen(true);
                          setActiveManagerTab('assign');
                        }
                      }}
                      style={{
                        width: `${slotPx}px`,
                        height: `${slotPx}px`,
                      }}
                      title={`${titleText}${!bar.isMostUsedAutoBar ? ' • Drag any block/tool/command here or Right-Click to reassign' : ''}`}
                      className={`relative rounded-lg flex flex-col items-center justify-center transition-all ${
                        isDragOver
                          ? 'ring-2 ring-emerald-400 bg-emerald-500/25 border border-emerald-300 scale-105'
                          : isSelectedForAssign
                            ? 'ring-2 ring-cyan-400 bg-cyan-500/20 border border-cyan-300'
                            : isActive
                              ? 'ring-2 ring-amber-400 bg-slate-800 border border-amber-300 scale-105'
                              : 'bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {/* Keybind Hint Badge */}
                      {hudConfig.showKeybindLabels &&
                        (slot?.hotkeyHint ||
                          (bar.id === 'bar_primary_blocks' && sIdx < 9)) && (
                          <span className="absolute top-0.5 left-1 text-[9px] font-mono font-bold text-slate-400 leading-none">
                            {slot?.hotkeyHint || sIdx + 1}
                          </span>
                        )}

                      {/* Slot Visual Swatch or Icon */}
                      {slot ? (
                        slot.type === 'block' ? (
                          <>
                            <span
                              className="w-4 h-4 rounded border border-white/25 shadow-inner mb-0.5"
                              style={{ backgroundColor: swatchColor }}
                            />
                            <span className="text-[9px] font-mono font-semibold text-slate-200 leading-none truncate max-w-[90%]">
                              {shortLabel}
                            </span>
                          </>
                        ) : slot.type === 'macro_loop' ? (
                          <>
                            <Repeat
                              className="w-3.5 h-3.5 mb-0.5"
                              style={{ color: swatchColor }}
                            />
                            <span className="text-[9px] font-mono font-bold text-emerald-300 leading-none truncate max-w-[90%]">
                              {shortLabel}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="w-2 h-2 rounded-full mb-0.5"
                              style={{ backgroundColor: swatchColor }}
                            />
                            <span className="text-[9px] font-mono font-bold text-slate-100 leading-none truncate max-w-[92%]">
                              {shortLabel}
                            </span>
                          </>
                        )
                      ) : (
                        <span className="text-xs font-mono text-slate-600">
                          +
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

      {/* HUD Action Bars, Slot Remapper & Command Loop Manager Window */}
      {isHudManagerOpen && (
        <DraggableWindow
          windowId="hud_manager_window"
          title="Modular HUD Action Bars, Slot Remapper & Command Loops"
          subtitle="Move, Resize, Lock & Drag-and-Drop Slots"
          defaultWidth={780}
          defaultHeight={620}
          minWidth={360}
          minHeight={300}
          defaultPinnedFloating={true}
          onClose={() => setIsHudManagerOpen(false)}
          testId="hud-manager-modal"
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header Toolbar */}
            <div className="px-5 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                Drag any bar header in the 3D view to move it, or drag any block,
                tool, or command onto any slot.
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleMasterEditMode}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                    hudConfig.masterHudEditMode
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                >
                  {hudConfig.masterHudEditMode ? (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Bars Unlocked (Snap Grid Active)</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Unlock Snap Grid</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="px-5 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveManagerTab('bars')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeManagerTab === 'bars'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                1. Action Bars ({hudConfig.bars.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveManagerTab('assign')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeManagerTab === 'assign'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                2. Assign Block / Tool / Macro to Slot
              </button>
              <button
                type="button"
                onClick={() => setActiveManagerTab('macros')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeManagerTab === 'macros'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                3. Command Loops & Macros ({hudConfig.macros.length})
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {activeManagerTab === 'bars' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">
                      Toggle, resize, or change orientation of each hotbar.
                      Right-click any slot on a bar to reassign its contents.
                    </span>
                    <button
                      type="button"
                      onClick={handleCreateNewBar}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Hotbar</span>
                    </button>
                  </div>

                  {hudConfig.bars.map((bar) => (
                    <div
                      key={bar.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateBar(bar.id, (b) => ({
                                ...b,
                                enabled: !b.enabled,
                              }))
                            }
                            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                              bar.enabled
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {bar.enabled ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                            <span>{bar.enabled ? 'Visible' : 'Hidden'}</span>
                          </button>

                          <span className="text-xs font-bold text-slate-100">
                            {bar.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`${bar.name} Layout`}
                            value={bar.layout}
                            onChange={(e) =>
                              updateBar(bar.id, (b) => ({
                                ...b,
                                layout: e.target.value as ActionBarLayoutStyle,
                              }))
                            }
                            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
                          >
                            <option value="row">Horizontal Row</option>
                            <option value="column">Vertical Column</option>
                            <option value="grid_2x">2-Row Grid</option>
                            <option value="grid_3x">3-Column Grid</option>
                          </select>

                          <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                            <span>Scale:</span>
                            <input
                              type="range"
                              min={0.75}
                              max={1.35}
                              step={0.05}
                              value={bar.scale}
                              onChange={(e) =>
                                updateBar(bar.id, (b) => ({
                                  ...b,
                                  scale: parseFloat(e.target.value) || 1,
                                }))
                              }
                              className="w-20 accent-cyan-400"
                            />
                            <span className="font-mono text-cyan-300">
                              {Math.round(bar.scale * 100)}%
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              updateBar(bar.id, (b) => ({
                                ...b,
                                locked: !b.locked,
                              }))
                            }
                            className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                              bar.locked
                                ? 'bg-slate-900 text-slate-300 border-slate-700'
                                : 'bg-amber-500/20 text-amber-300 border-amber-400'
                            }`}
                          >
                            {bar.locked ? 'Locked' : 'Unlocked'}
                          </button>

                          {!bar.isMostUsedAutoBar && (
                            <button
                              type="button"
                              onClick={() =>
                                updateBar(bar.id, (b) => ({
                                  ...b,
                                  slots: [...b.slots, null],
                                }))
                              }
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                              title="Add empty slot to this bar"
                            >
                              + Slot
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeManagerTab === 'assign' && (
                <div className="space-y-4">
                  {/* Target Bar & Slot Selector */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-200">
                      1. Choose Target Hotbar Slot to Assign:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {hudConfig.bars
                        .filter((b) => !b.isMostUsedAutoBar)
                        .map((b) => (
                          <div key={b.id} className="flex items-center gap-1">
                            <span className="text-[11px] font-mono text-slate-400 mr-1">
                              {b.name.split(':')[0]}:
                            </span>
                            {b.slots.map((_, idx) => {
                              const isSel =
                                selectedSlotTarget?.barId === b.id &&
                                selectedSlotTarget?.slotIdx === idx;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    setSelectedSlotTarget({
                                      barId: b.id,
                                      slotIdx: idx,
                                    })
                                  }
                                  className={`w-6 h-6 rounded font-mono text-xs font-bold border ${
                                    isSel
                                      ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                                      : 'bg-slate-900 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {idx + 1}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Assignable Blocks, Tools & Macro Loops */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Assign Block from Library
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {Object.values(customBlocks).map((def) => (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() =>
                            handleAssignItemToSelectedSlot({
                              id: `slot_${Date.now()}`,
                              type: 'block',
                              targetId: def.id,
                            })
                          }
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2 text-left"
                        >
                          <span
                            className="w-4 h-4 rounded shrink-0 border border-white/20"
                            style={{ backgroundColor: def.color }}
                          />
                          <span className="text-xs text-slate-200 truncate">
                            {def.name}
                          </span>
                        </button>
                      ))}
                    </div>

                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 pt-2">
                      Assign Tool or Command Loop
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(TOOL_LABELS) as ToolMode[]).map((tMode) => (
                        <button
                          key={tMode}
                          type="button"
                          onClick={() =>
                            handleAssignItemToSelectedSlot({
                              id: `slot_${Date.now()}`,
                              type: 'tool',
                              targetId: tMode,
                              label: TOOL_LABELS[tMode].short,
                            })
                          }
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 text-left"
                        >
                          Tool: {TOOL_LABELS[tMode].label}
                        </button>
                      ))}

                      {hudConfig.macros.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            handleAssignItemToSelectedSlot({
                              id: `slot_${Date.now()}`,
                              type: 'macro_loop',
                              targetId: m.id,
                              label: m.name.slice(0, 8),
                            })
                          }
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-300 text-left"
                        >
                          Loop: {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeManagerTab === 'macros' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Existing Command Loops */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Saved Command Loops & Macros
                    </h3>
                    {hudConfig.macros.map((macro) => (
                      <div
                        key={macro.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                            <Repeat className="w-3.5 h-3.5 text-emerald-400" />
                            {macro.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => onTriggerMacroLoop(macro)}
                            className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>
                              Review ({macro.iterations}×)
                            </span>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {macro.description}
                        </p>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-amber-300 space-y-0.5">
                          {macro.commands.map((c, idx) => (
                            <div key={idx}>{c}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Create New Command Loop Form */}
                  <form
                    onSubmit={handleCreateCustomMacro}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 h-fit"
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Create Repeatable Command Loop
                    </h3>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        Macro Loop Name
                      </label>
                      <input
                        type="text"
                        value={newMacroName}
                        onChange={(e) => setNewMacroName(e.target.value)}
                        placeholder="e.g., Castle Battlement Extruder"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        WorldEdit Commands (one per line)
                      </label>
                      <textarea
                        rows={4}
                        value={newMacroCmds}
                        onChange={(e) => setNewMacroCmds(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-amber-300"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Repeat Iterations (1–16)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={newMacroIterations}
                          onChange={(e) =>
                            setNewMacroIterations(
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          className="w-full px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Step Delay (ms)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={50}
                          value={newMacroIntervalMs}
                          onChange={(e) =>
                            setNewMacroIntervalMs(
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                    >
                      Save Command Loop Macro
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </DraggableWindow>
      )}
    </>
  );
};
