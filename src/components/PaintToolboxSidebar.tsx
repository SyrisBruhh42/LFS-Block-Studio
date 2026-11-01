import React, { useRef } from 'react';
import {
  BlueprintPrefab,
  CustomBlockDefinition,
  ToolMode,
} from '../engine/types';
import {
  STUDIO_DRAG_MIME,
  serializeStudioDragPayload,
} from '../engine/windowLayoutEngine';
import { DraggableWindow } from './DraggableWindow';
import {
  Box,
  Eraser,
  ExternalLink,
  GripVertical,
  Hammer,
  Paintbrush,
  Palette,
  PanelLeft,
  Pipette,
  Plus,
  RotateCw,
  Stamp,
  Store,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

interface PaintToolboxSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  dockedWidth?: number;
  onResizeDockedWidth?: (nextWidth: number) => void;
  toolMode: ToolMode;
  onSelectToolMode: (mode: ToolMode) => void;
  activeBlockId: string;
  onSelectBlockId: (id: string) => void;
  customBlocks: Record<string, CustomBlockDefinition>;
  onUpdateActiveBlockColor: (newHexColor: string) => void;
  activeBlueprint: BlueprintPrefab | null;
  placementRotation: 0 | 90 | 180 | 270;
  onRotatePlacement: () => void;
  onOpenWorkshop: () => void;
  onOpenBlockMarket?: () => void;
}

const MS_PAINT_SWATCHES = [
  '#7E8B9B', // Cobblestone Grey
  '#474A4F', // Deepslate Charcoal
  '#B87A3D', // Hewn Oak
  '#735531', // Spruce Timber
  '#B94A3E', // Fired Clay Brick
  '#D9A760', // Cut Sandstone
  '#3F8E4D', // Mossy Turf
  '#6E4720', // Coarse Soil
  '#CBD5E1', // Iron Alloy
  '#F59E0B', // Gold / Lantern Amber
  '#3B5978', // Slate Roof Blue
  '#22D3EE', // Sea Lantern Cyan
  '#7DD3FC', // Tempered Glass
  '#10B981', // Emerald Foliage
  '#E11D48', // Crimson Terracotta
  '#F8FAFC', // Polished Quartz White
];

export const PaintToolboxSidebar: React.FC<PaintToolboxSidebarProps> = ({
  isOpen = true,
  onClose,
  isFloating = false,
  onToggleFloating,
  dockedWidth = 240,
  onResizeDockedWidth,
  toolMode,
  onSelectToolMode,
  activeBlockId,
  onSelectBlockId,
  customBlocks,
  onUpdateActiveBlockColor,
  activeBlueprint,
  placementRotation,
  onRotatePlacement,
  onOpenWorkshop,
  onOpenBlockMarket,
}) => {
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  if (!isOpen) return null;

  const activeDef = customBlocks[activeBlockId];
  const allBlocks = Object.values(customBlocks);

  const handleToolDragStart = (
    e: React.DragEvent,
    tMode: ToolMode,
    shortLabel: string
  ) => {
    const raw = serializeStudioDragPayload({
      type: 'tool',
      targetId: tMode,
      label: shortLabel,
    });
    e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
    e.dataTransfer.setData('text/plain', raw);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleBlockDragStart = (
    e: React.DragEvent,
    def: CustomBlockDefinition
  ) => {
    const raw = serializeStudioDragPayload({
      type: 'block',
      targetId: def.id,
      label: def.name,
    });
    e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
    e.dataTransfer.setData('text/plain', raw);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const innerContent = (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto select-none">
      {/* Section 1: MS Paint Iconic 2-Column Tool Box */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2 gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
            Paint & Build Tools
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRotatePlacement}
              title="Rotate Block 90° (Key R)"
              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-amber-400 text-[11px] font-mono text-amber-400 flex items-center gap-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>{placementRotation}°</span>
            </button>
            {onToggleFloating && !isFloating && (
              <button
                type="button"
                data-testid="float-left-toolbox-btn"
                onClick={onToggleFloating}
                title="Undock into a Moveable & Resizable Floating Window"
                className="p-1 rounded bg-slate-950 border border-slate-800 hover:border-cyan-400 text-slate-400 hover:text-cyan-300"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {onClose && !isFloating && (
              <button
                type="button"
                onClick={onClose}
                title="Collapse Paint Toolbox"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'place', 'Place')}
            onClick={() => onSelectToolMode('place')}
            title="Place Block (B) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'place'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Hammer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Place (B)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'erase', 'Erase')}
            onClick={() => onSelectToolMode('erase')}
            title="Erase Block (X) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'erase'
                ? 'bg-rose-500 text-white border-rose-400 shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Eraser className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Erase (X)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'brush_place', '3D+')}
            data-testid="toolbox-3d-brush-place"
            onClick={() => onSelectToolMode('brush_place')}
            title="Scrollable 3D Volume Place Brush (Key Y) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'brush_place'
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow font-bold'
                : 'bg-slate-950 border-slate-800 text-cyan-300 hover:border-slate-700'
            }`}
          >
            <Box className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">3D Place (Y)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'brush_erase', '3D-')}
            data-testid="toolbox-3d-brush-erase"
            onClick={() => onSelectToolMode('brush_erase')}
            title="Scrollable 3D Volume Erase Brush (Key O) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'brush_erase'
                ? 'bg-rose-500 text-white border-rose-300 shadow font-bold'
                : 'bg-slate-950 border-slate-800 text-rose-300 hover:border-slate-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">3D Erase (O)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'paint', 'Paint')}
            onClick={() => onSelectToolMode('paint')}
            title="Paint Material (G) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'paint'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Paint (G)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'pick', 'Pick')}
            onClick={() => onSelectToolMode('pick')}
            title="Eyedropper Picker (I) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'pick'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Pipette className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Picker (I)</span>
          </button>

          <button
            type="button"
            draggable
            onDragStart={(e) => handleToolDragStart(e, 'wand_select', 'Wand')}
            onClick={() => onSelectToolMode('wand_select')}
            title="Region Wand (E) — Drag to any Hotbar slot"
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              toolMode === 'wand_select'
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Wand (E)</span>
          </button>

          <button
            type="button"
            disabled={!activeBlueprint}
            draggable={Boolean(activeBlueprint)}
            onDragStart={(e) =>
              handleToolDragStart(e, 'stamp_blueprint', 'Stamp')
            }
            onClick={() => onSelectToolMode('stamp_blueprint')}
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
              toolMode === 'stamp_blueprint'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                : 'bg-slate-950 border-slate-800 text-emerald-300 hover:border-slate-700'
            }`}
          >
            <Stamp className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Stamp</span>
          </button>
        </div>
      </div>

      {/* Section 2: MS Paint Active Foreground Swatch & 16-Color Palette */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Palette className="w-3 h-3 text-amber-400" />
            <span>Color Swatches</span>
          </span>
          <input
            type="color"
            aria-label="Custom Block Tint Color"
            value={activeDef?.color || '#94A3B8'}
            onChange={(e) => onUpdateActiveBlockColor(e.target.value)}
            className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
          />
        </div>

        {/* Active Foreground Block Preview Card */}
        {activeDef && (
          <div
            draggable
            onDragStart={(e) => handleBlockDragStart(e, activeDef)}
            title="Drag active block to any Hotbar slot"
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2.5 cursor-grab active:cursor-grabbing"
          >
            <span
              style={{ backgroundColor: activeDef.color }}
              className="w-7 h-7 rounded border border-white/25 shrink-0 shadow-inner"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-100 truncate">
                {activeDef.name}
              </div>
              <div className="text-[10px] font-mono text-slate-400 capitalize">
                {activeDef.shape} · {activeDef.texturePattern.replace('_', ' ')}
              </div>
            </div>
          </div>
        )}

        {/* 16-Color MS Paint Grid */}
        <div className="grid grid-cols-8 gap-1">
          {MS_PAINT_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              title={`Tint active block ${hex}`}
              onClick={() => onUpdateActiveBlockColor(hex)}
              style={{ backgroundColor: hex }}
              className={`w-full aspect-square rounded border transition-transform hover:scale-110 ${
                activeDef?.color.toLowerCase() === hex.toLowerCase()
                  ? 'border-white ring-1 ring-amber-400'
                  : 'border-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Section 3: Realistic Block Palette, CC0 Double Market & Custom Block Workshop */}
      <div className="p-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Studio Library ({allBlocks.length})
          </span>
          <button
            type="button"
            onClick={onOpenWorkshop}
            aria-label="Create Custom Block in Workshop"
            className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-300 flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            <span>New Block</span>
          </button>
        </div>

        <div className="text-[10px] font-mono text-slate-500 mb-1.5">
          Tip: Drag any block or tool onto any Hotbar slot
        </div>

        {onOpenBlockMarket && (
          <button
            type="button"
            data-testid="toolbox-open-block-market-btn"
            onClick={onOpenBlockMarket}
            className="w-full mb-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Browse CC0 Block Market (+21)</span>
          </button>
        )}

        <div className="space-y-1 overflow-y-auto pr-0.5 flex-1">
          {allBlocks.map((def, idx) => {
            const isSelected =
              activeBlockId === def.id && toolMode !== 'stamp_blueprint';
            return (
              <button
                key={def.id}
                type="button"
                draggable
                onDragStart={(e) => handleBlockDragStart(e, def)}
                aria-label={`Select block ${def.name}`}
                title={`${def.name} — Click to equip, or drag onto any Hotbar slot`}
                onClick={() => {
                  onSelectBlockId(def.id);
                  if (toolMode === 'stamp_blueprint' || toolMode === 'erase') {
                    onSelectToolMode('place');
                  }
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? 'bg-slate-800 border-amber-400 text-white'
                    : 'bg-slate-950/80 border-slate-800/80 text-slate-300 hover:bg-slate-950 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-3 h-3 text-slate-600 shrink-0" />
                  <span
                    style={{ backgroundColor: def.color }}
                    className="w-4 h-4 rounded-sm border border-white/25 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {def.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 capitalize">
                      {def.shape} · {def.materialFinish}
                    </div>
                  </div>
                </div>
                {idx < 9 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 shrink-0">
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (isFloating) {
    return (
      <DraggableWindow
        windowId="paint_toolbox_window"
        title="Paint & Blocks Toolbox"
        subtitle={`${allBlocks.length} blocks`}
        defaultWidth={270}
        defaultHeight={620}
        minWidth={220}
        minHeight={280}
        defaultX={16}
        defaultY={96}
        defaultPinnedFloating={true}
        onClose={onClose}
        onDockSidebar={onToggleFloating}
        dockButtonLabel="Dock Left"
        testId="floating-paint-toolbox-window"
      >
        {innerContent}
      </DraggableWindow>
    );
  }

  return (
    <aside
      aria-label="Windows Paint Style Tool and Block Palette Dock"
      style={{ width: `${dockedWidth}px` }}
      className="relative bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20 select-none overflow-hidden absolute md:relative inset-y-0 left-0 shadow-2xl md:shadow-none"
    >
      {innerContent}

      {/* Drag-Resize Right Splitter Handle when Docked */}
      {onResizeDockedWidth && (
        <div
          data-testid="left-sidebar-resize-splitter"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            resizeDragRef.current = {
              startX: e.clientX,
              startW: dockedWidth,
            };
          }}
          onPointerMove={(e) => {
            if (!resizeDragRef.current) return;
            const nextW = Math.max(
              190,
              Math.min(
                380,
                resizeDragRef.current.startW +
                  (e.clientX - resizeDragRef.current.startX)
              )
            );
            onResizeDockedWidth(nextW);
          }}
          onPointerUp={() => {
            resizeDragRef.current = null;
          }}
          title="Drag edge to resize Paint Toolbox width"
          className="hidden md:block absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-amber-400/50 transition-colors z-30"
        />
      )}
    </aside>
  );
};
