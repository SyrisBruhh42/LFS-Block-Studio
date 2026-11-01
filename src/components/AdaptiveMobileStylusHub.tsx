import React, { useState } from 'react';
import {
  AdaptiveUiConfig,
  BlockScale3D,
  CustomBlockDefinition,
  GridCoord,
  MobileHubDockPosition,
  ScrollResizeMode,
  StylusBarrelAction,
  StylusModeConfig,
  ToolMode,
  UiDensityPreset,
} from '../engine/types';
import { RightInspectorTab } from './StudioRibbonHeader';
import {
  BookOpen,
  Cloud,
  Eraser,
  Eye,
  FolderKanban,
  GitBranch,
  Hammer,
  HardDrive,
  Keyboard,
  Layers,
  Maximize2,
  Minimize2,
  Paintbrush,
  Palette,
  PenTool,
  Pipette,
  Plus,
  Redo2,
  RotateCw,
  Settings2,
  Sliders,
  Sparkles,
  Sun,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { DraggableHudOverlay, DraggableWindow } from './DraggableWindow';

export const DEFAULT_STYLUS_MODE_CONFIG: StylusModeConfig = {
  enabled: false,
  autoDetectPen: true,
  continuousStroke: true,
  palmRejection: true,
  touchOrbitsInStylusMode: true,
  barrelButtonAction: 'erase',
  eraserTailAction: 'erase',
  pressureControlsScale: false,
  pressureSensitivity: 1.0,
  hoverReticle: true,
};

export const DEFAULT_ADAPTIVE_UI_CONFIG: AdaptiveUiConfig = {
  uiScale: 1.0,
  densityPreset: 'auto',
  autoCollapseRibbonOnCompact: true,
  ribbonCollapsed: false,
  autoFadeHudOnPan: true,
  highContrastAccessible: false,
  mobileDockPosition: 'bottom',
  pinnedQuickTools: ['place', 'erase', 'paint', 'pick', 'wand_select'],
  showMobileCommandChips: true,
};

export interface EffectiveViewportMetrics {
  isCompactPhone: boolean;
  isTabletOrFoldable: boolean;
  isShortLandscape: boolean;
  effectiveScale: number;
  touchTargetMinPx: number;
  shouldCollapseSidebars: boolean;
  shouldCollapseRibbonSecondary: boolean;
}

export function computeEffectiveUiMetrics(
  width: number,
  height: number,
  config: AdaptiveUiConfig
): EffectiveViewportMetrics {
  const isCompactPhone = width < 768;
  const isTabletOrFoldable = width >= 768 && width < 1180;
  const isShortLandscape = height < 560;

  let presetMultiplier = 1.0;
  let touchTargetMinPx = 36;

  if (config.densityPreset === 'compact') {
    presetMultiplier = 0.9;
    touchTargetMinPx = 32;
  } else if (config.densityPreset === 'balanced') {
    presetMultiplier = 1.0;
    touchTargetMinPx = 36;
  } else if (config.densityPreset === 'touch_comfortable') {
    presetMultiplier = 1.08;
    touchTargetMinPx = 44;
  } else if (config.densityPreset === 'accessible_large') {
    presetMultiplier = 1.2;
    touchTargetMinPx = 48;
  } else {
    // 'auto' responsive scaling based on window dimensions
    if (isCompactPhone) {
      presetMultiplier = 0.96;
      touchTargetMinPx = 44;
    } else if (isTabletOrFoldable) {
      presetMultiplier = 1.02;
      touchTargetMinPx = 42;
    } else if (width >= 1680) {
      presetMultiplier = 1.06;
      touchTargetMinPx = 38;
    }
  }

  const effectiveScale = Math.min(
    1.35,
    Math.max(0.82, Number((config.uiScale * presetMultiplier).toFixed(2)))
  );

  const shouldCollapseSidebars = isCompactPhone || isShortLandscape;
  const shouldCollapseRibbonSecondary =
    config.ribbonCollapsed ||
    (config.autoCollapseRibbonOnCompact && (isCompactPhone || isShortLandscape));

  return {
    isCompactPhone,
    isTabletOrFoldable,
    isShortLandscape,
    effectiveScale,
    touchTargetMinPx,
    shouldCollapseSidebars,
    shouldCollapseRibbonSecondary,
  };
}

export function computePressureBlockScale(
  pressure: number,
  sensitivity: number,
  mode: ScrollResizeMode
): BlockScale3D {
  const clamped = Math.max(0.1, Math.min(1.0, pressure || 0.5));
  // Normalize 0.5 neutral pressure -> 1.0x scale; lighter -> smaller (down to 0.5x); heavier -> larger (up to 3.0x)
  const rawFactor = 0.5 + Math.pow(clamped, 1.15) * 2.0 * sensitivity;
  if (mode === 'snap') {
    const snaps = [0.25, 0.5, 1, 1.5, 2, 3, 4];
    let best = 1;
    let bestDist = Infinity;
    for (const s of snaps) {
      const d = Math.abs(s - rawFactor);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return { x: best, y: best, z: best };
  }
  const rounded = Math.max(0.25, Math.min(4.0, Math.round(rawFactor * 10) / 10));
  return { x: rounded, y: rounded, z: rounded };
}

interface AdaptiveMobileStylusHubProps {
  uiConfig: AdaptiveUiConfig;
  onChangeUiConfig: (next: AdaptiveUiConfig) => void;
  stylusConfig: StylusModeConfig;
  onChangeStylusConfig: (next: StylusModeConfig) => void;
  lastPointerType: 'mouse' | 'pen' | 'touch';
  lastStylusPressure: number;
  isViewportPanningOrDrawing: boolean;
  toolMode: ToolMode;
  onSelectToolMode: (mode: ToolMode) => void;
  activeBlockId: string;
  customBlocks: Record<string, CustomBlockDefinition>;
  placementRotation: 0 | 90 | 180 | 270;
  onRotatePlacement: () => void;
  activeBlockScale: BlockScale3D;
  scrollResizeMode: ScrollResizeMode;
  onScrollResizeBlock: (dir: 1 | -1) => void;
  onChangeScrollResizeMode: (mode: ScrollResizeMode) => void;
  onResetBlockScale: () => void;
  hoveredCoord: GridCoord;
  onSetPos1: (c: GridCoord) => void;
  onSetPos2: (c: GridCoord) => void;
  onRunCommand: (cmd: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  isLeftToolboxOpen: boolean;
  onToggleLeftToolbox: () => void;
  rightSidebarTab: RightInspectorTab;
  onSelectRightSidebarTab: (tab: RightInspectorTab) => void;
  onOpenModal: (
    modal:
      | 'none'
      | 'workshop'
      | 'blueprints'
      | 'cloud'
      | 'export'
      | 'hotkeys'
      | 'drive'
      | 'market'
      | 'main_menu'
  ) => void;
  isSettingsModalOpen: boolean;
  onCloseSettingsModal: () => void;
  onOpenSettingsModal: () => void;
}

const TOOL_METADATA: {
  id: ToolMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}[] = [
  {
    id: 'place',
    label: 'Place Block (B)',
    shortLabel: 'Place',
    icon: Hammer,
    activeClass: 'bg-amber-500 text-slate-950 border-amber-300',
  },
  {
    id: 'erase',
    label: 'Erase Block (X)',
    shortLabel: 'Erase',
    icon: Eraser,
    activeClass: 'bg-rose-500 text-white border-rose-300',
  },
  {
    id: 'paint',
    label: 'Paint Material (G)',
    shortLabel: 'Paint',
    icon: Paintbrush,
    activeClass: 'bg-amber-500 text-slate-950 border-amber-300',
  },
  {
    id: 'pick',
    label: 'Eyedropper Picker (I)',
    shortLabel: 'Pick',
    icon: Pipette,
    activeClass: 'bg-emerald-500 text-slate-950 border-emerald-300',
  },
  {
    id: 'wand_select',
    label: 'Region Wand (E)',
    shortLabel: 'Wand',
    icon: Wand2,
    activeClass: 'bg-cyan-500 text-slate-950 border-cyan-300',
  },
  {
    id: 'brush_place',
    label: '3D Volume Brush Place (Y)',
    shortLabel: '3D Brush+',
    icon: Sparkles,
    activeClass: 'bg-emerald-500 text-slate-950 border-emerald-300',
  },
  {
    id: 'brush_erase',
    label: '3D Volume Brush Erase (O)',
    shortLabel: '3D Brush-',
    icon: Eraser,
    activeClass: 'bg-rose-500 text-white border-rose-300',
  },
];

export const AdaptiveMobileStylusHub: React.FC<AdaptiveMobileStylusHubProps> = ({
  uiConfig,
  onChangeUiConfig,
  stylusConfig,
  onChangeStylusConfig,
  lastPointerType,
  lastStylusPressure,
  isViewportPanningOrDrawing,
  toolMode,
  onSelectToolMode,
  activeBlockId,
  customBlocks,
  placementRotation,
  onRotatePlacement,
  activeBlockScale,
  scrollResizeMode,
  onScrollResizeBlock,
  onChangeScrollResizeMode,
  onResetBlockScale,
  hoveredCoord,
  onSetPos1,
  onSetPos2,
  onRunCommand,
  canUndo,
  canRedo,
  onToggleLeftToolbox,
  onSelectRightSidebarTab,
  onOpenModal,
  isSettingsModalOpen,
  onCloseSettingsModal,
  onOpenSettingsModal,
}) => {
  const [isAllToolsSheetOpen, setIsAllToolsSheetOpen] = useState(false);
  const [activeSheetTab, setActiveSheetTab] = useState<
    'tools' | 'stylus' | 'ui_scale'
  >('tools');

  const activeBlockDef = customBlocks[activeBlockId];
  const fadeClass =
    uiConfig.autoFadeHudOnPan && isViewportPanningOrDrawing
      ? 'opacity-35 pointer-events-none transition-opacity duration-200'
      : 'opacity-100 transition-opacity duration-150';

  const highContrastBorder = uiConfig.highContrastAccessible
    ? 'border-2 border-amber-400'
    : 'border border-slate-700/90';

  // Position classes for the Android / Tablet Ergonomic Quick-Hub
  const dockPositionClass =
    uiConfig.mobileDockPosition === 'left_thumb'
      ? 'left-3 bottom-14 flex-col items-start'
      : uiConfig.mobileDockPosition === 'right_thumb'
        ? 'right-3 bottom-14 flex-col items-end'
        : 'bottom-3 left-1/2 -translate-x-1/2 flex-col items-center';

  const togglePinnedTool = (t: ToolMode) => {
    const exists = uiConfig.pinnedQuickTools.includes(t);
    const next = exists
      ? uiConfig.pinnedQuickTools.filter((item) => item !== t)
      : [...uiConfig.pinnedQuickTools, t];
    if (next.length === 0) return; // Keep at least 1 tool pinned
    onChangeUiConfig({
      ...uiConfig,
      pinnedQuickTools: next,
    });
  };

  return (
    <>
      {/* 1. Ergonomic Floating Android / Stylus Quick-Hub (Visible on Mobile/Tablet or whenever Stylus Mode is active, and Draggable!) */}
      <DraggableHudOverlay
        hudId="adaptive_mobile_stylus_hub"
        label="Mobile & Stylus Hub"
        anchorClassName={`${dockPositionClass} ${
          stylusConfig.enabled ? 'flex' : 'lg:hidden flex'
        }`}
        zIndex={22}
      >
        <div
          data-testid="adaptive-mobile-stylus-hub"
          className={`flex flex-col gap-1.5 max-w-[96vw] ${fadeClass}`}
        >
        {/* Secondary Row: Optional One-Tap WorldEdit & Scale Chips (Non-overwhelming, collapsible) */}
        {uiConfig.showMobileCommandChips && (
          <div
            className={`flex flex-wrap items-center justify-center gap-1 px-2 py-1 rounded-xl bg-slate-950/95 ${highContrastBorder} shadow-lg`}
          >
            <button
              type="button"
              onClick={() => onSetPos1(hoveredCoord)}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-semibold text-cyan-300 min-h-[34px]"
              title="Set Selection Corner 1 at Cursor"
            >
              Pos1
            </button>
            <button
              type="button"
              onClick={() => onSetPos2(hoveredCoord)}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-semibold text-rose-300 min-h-[34px]"
              title="Set Selection Corner 2 at Cursor"
            >
              Pos2
            </button>
            <button
              type="button"
              onClick={() => onRunCommand(`//set ${activeBlockId}`)}
              className="px-2 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono font-bold text-amber-300 min-h-[34px]"
              title="Fill Selection with Active Block"
            >
              //set
            </button>
            <button
              type="button"
              onClick={() => onRunCommand(`//walls ${activeBlockId}`)}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-200 min-h-[34px]"
              title="Build Selection Perimeter Walls"
            >
              //walls
            </button>

            <div className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Compact Block Scale Stepper for Touch/Android users without Shift+Scroll wheel */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onScrollResizeBlock(-1)}
                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold flex items-center justify-center"
                title="Shrink Block Scale"
              >
                -
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeScrollResizeMode(
                    scrollResizeMode === 'snap' ? 'free' : 'snap'
                  )
                }
                className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-amber-300"
                title="Tap to toggle Snap vs Free scale stepping"
              >
                {activeBlockScale.x.toFixed(1)}× ({scrollResizeMode})
              </button>
              <button
                type="button"
                onClick={() => onScrollResizeBlock(1)}
                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold flex items-center justify-center"
                title="Grow Block Scale"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Primary Ergonomic Action Bar: Active Swatch + Pinned Tools + Stylus Toggle + All-Tools Drawer Button */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-950/95 ${highContrastBorder} shadow-2xl overflow-x-auto max-w-[95vw]`}
        >
          {/* Active Block Swatch Button -> Opens Block & Paint Palette */}
          <button
            type="button"
            onClick={onToggleLeftToolbox}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 shrink-0 min-h-[42px]"
            title="Open Block Library & Paint Palette"
          >
            <span
              className="w-5 h-5 rounded-md border border-white/20 shrink-0 shadow-inner"
              style={{ backgroundColor: activeBlockDef?.color || '#94a3b8' }}
            />
            <span className="text-xs font-semibold text-slate-100 max-w-[72px] truncate hidden sm:inline">
              {activeBlockDef?.name || activeBlockId}
            </span>
          </button>

          {/* Pinned Tools (User Customizable!) */}
          {TOOL_METADATA.filter((t) =>
            uiConfig.pinnedQuickTools.includes(t.id)
          ).map((tool) => {
            const Icon = tool.icon;
            const isActive = toolMode === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectToolMode(tool.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 min-h-[42px] border ${
                  isActive
                    ? tool.activeClass
                    : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800'
                }`}
                title={tool.label}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{tool.shortLabel}</span>
              </button>
            );
          })}

          {/* Rotate Placement Button */}
          <button
            type="button"
            onClick={onRotatePlacement}
            className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-amber-400 flex items-center gap-1 shrink-0 min-h-[42px]"
            title="Rotate Block Placement (R)"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{placementRotation}°</span>
          </button>

          {/* Undo / Redo Compact Pair */}
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => onRunCommand('//undo')}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 border border-slate-800 text-slate-200 shrink-0 min-h-[42px] min-w-[40px] flex items-center justify-center"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Stylus Mode Quick Pill (Shows live pressure when active) */}
          <button
            type="button"
            data-testid="quick-stylus-mode-toggle"
            onClick={() =>
              onChangeStylusConfig({
                ...stylusConfig,
                enabled: !stylusConfig.enabled,
              })
            }
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 min-h-[42px] border transition-colors ${
              stylusConfig.enabled
                ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
            title="Toggle PC & Android Stylus Mode (Continuous Pen Stroke + Palm Rejection)"
          >
            <PenTool className="w-4 h-4 shrink-0" />
            <span className=" whitespace-nowrap">
              {stylusConfig.enabled
                ? lastPointerType === 'pen'
                  ? `Pen ${Math.round(lastStylusPressure * 100)}%`
                  : 'Stylus ON'
                : 'Stylus'}
            </span>
          </button>

          {/* All Tools & Workspace Customizer Drawer Button */}
          <button
            type="button"
            data-testid="open-all-tools-drawer-btn"
            onClick={() => setIsAllToolsSheetOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 shrink-0 min-h-[42px]"
            title="Open All Studio Tools, Stylus Settings & UI Rescaling"
          >
            <Sliders className="w-4 h-4" />
            <span>More</span>
          </button>
        </div>
        </div>
      </DraggableHudOverlay>

      {/* 2. Expandable All-Tools, Stylus & Adaptive UI Drawer Window (Moveable & Resizable!) */}
      <DraggableWindow
        windowId="adaptive_ui_settings_window"
        isOpen={isAllToolsSheetOpen || isSettingsModalOpen}
        onClose={() => {
          setIsAllToolsSheetOpen(false);
          onCloseSettingsModal();
        }}
        title="Adaptive UI Rescaling, Android Hub & Stylus Studio"
        subtitle="Configure UI density, window scaling, stylus pressure, and thumb dock"
        icon={<PenTool className="w-4 h-4 text-emerald-400" />}
        defaultWidth={700}
        defaultHeight={600}
        minWidth={340}
        minHeight={300}
        zIndex={56}
      >
        <div className="w-full h-full bg-slate-900 flex flex-col overflow-hidden">
          {/* Segmented Navigation Tabs */}
          <div className="px-4 pt-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setActiveSheetTab('stylus')}
                className={`px-3 py-2 rounded-t-lg text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                  activeSheetTab === 'stylus'
                    ? 'bg-slate-900 text-emerald-400 border-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Stylus Mode (PC & Android Pen)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSheetTab('ui_scale')}
                className={`px-3 py-2 rounded-t-lg text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                  activeSheetTab === 'ui_scale'
                    ? 'bg-slate-900 text-amber-400 border-amber-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>UI Scaling & Accessibility</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSheetTab('tools')}
                className={`px-3 py-2 rounded-t-lg text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                  activeSheetTab === 'tools'
                    ? 'bg-slate-900 text-cyan-400 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Android Tool Hub & Quick Launch</span>
              </button>
            </div>

            {/* Body Content */}
            <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-4 text-xs text-slate-200">
              {/* TAB 1: STYLUS MODE (PC WACOM/SURFACE & ANDROID S-PEN/USI) */}
              {activeSheetTab === 'stylus' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                        <span>Active Stylus Mode (PC & Android)</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          · Input: {lastPointerType.toUpperCase()} (
                          {Math.round(lastStylusPressure * 100)}% pressure)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Optimizes viewport for S-Pen, USI Stylus, Surface Pen, and
                        Wacom tablets with continuous stroke building, palm
                        rejection, and barrel button shortcuts.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="modal-stylus-enable-toggle"
                      onClick={() =>
                        onChangeStylusConfig({
                          ...stylusConfig,
                          enabled: !stylusConfig.enabled,
                        })
                      }
                      className={`px-3.5 py-2 rounded-xl font-bold text-xs shrink-0 transition-colors ${
                        stylusConfig.enabled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {stylusConfig.enabled ? 'Stylus Mode ON' : 'Enable Stylus'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Auto-Detect Hardware Pen
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Automatically activates Stylus Mode when a pen hovers or
                          touches the screen.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.autoDetectPen}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            autoDetectPen: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Continuous Pen Stroke Sculpting
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Dragging the stylus across the grid continuously places,
                          paints, or erases blocks along the stroke.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.continuousStroke}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            continuousStroke: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Smart Palm Rejection
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Ignores unintended palm/wrist touch contacts while the
                          stylus is active or hovering.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.palmRejection}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            palmRejection: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Finger Touch Orbits While Pen Builds
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Pen strokes place/paint blocks while finger gestures
                          smoothly orbit and pan the 3D camera.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.touchOrbitsInStylusMode}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            touchOrbitsInStylusMode: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Pen Pressure Controls Block Scale
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Light pen pressure places smaller detail blocks; firm
                          pressure scales blocks up dynamically.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.pressureControlsScale}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            pressureControlsScale: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Precision Pen Hover Reticle
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Displays a live target reticle with coordinate & pressure
                          readout when hovering a stylus.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={stylusConfig.hoverReticle}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            hoverReticle: e.target.checked,
                          })
                        }
                        className="mt-1 accent-emerald-400"
                      />
                    </label>
                  </div>

                  {/* Stylus Barrel Button & Pressure Sensitivity Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Stylus Side Barrel Button Action
                      </label>
                      <select
                        value={stylusConfig.barrelButtonAction}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            barrelButtonAction: e.target
                              .value as StylusBarrelAction,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                      >
                        <option value="erase">Erase Block on Stroke</option>
                        <option value="pick">Eyedropper Pick Block</option>
                        <option value="wand_select">Set Region Pos2</option>
                        <option value="orbit">Orbit Camera</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                        <span>Pen Pressure Sensitivity</span>
                        <span className="font-mono text-emerald-400">
                          {stylusConfig.pressureSensitivity.toFixed(2)}×
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={stylusConfig.pressureSensitivity}
                        onChange={(e) =>
                          onChangeStylusConfig({
                            ...stylusConfig,
                            pressureSensitivity: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-emerald-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ADAPTIVE UI RESCALING & ACCESSIBILITY */}
              {activeSheetTab === 'ui_scale' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-amber-400">
                          Master UI & HUD Scale ({Math.round(uiConfig.uiScale * 100)}
                          %)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Cleanly rescales buttons, toolbars, font legibility, and
                          floating hubs across window sizes.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeUiConfig({ ...uiConfig, uiScale: 1.0 })
                        }
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-200"
                      >
                        Reset 100%
                      </button>
                    </div>

                    <input
                      type="range"
                      min={0.85}
                      max={1.3}
                      step={0.05}
                      aria-label="Master UI Scale"
                      value={uiConfig.uiScale}
                      onChange={(e) =>
                        onChangeUiConfig({
                          ...uiConfig,
                          uiScale: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-amber-400"
                    />

                    {/* Density & Accessibility Presets */}
                    <div>
                      <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                        Responsive Layout & Accessibility Density Preset
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        {(
                          [
                            { id: 'auto', label: 'Auto Smart' },
                            { id: 'compact', label: 'Compact' },
                            { id: 'balanced', label: 'Balanced' },
                            { id: 'touch_comfortable', label: 'Touch 44px+' },
                            { id: 'accessible_large', label: 'Accessible XL' },
                          ] as { id: UiDensityPreset; label: string }[]
                        ).map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              onChangeUiConfig({
                                ...uiConfig,
                                densityPreset: preset.id,
                              })
                            }
                            className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                              uiConfig.densityPreset === preset.id
                                ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Smart Window Panning & Accessibility Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Auto-Fade HUD While Panning/Building
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Gracefully dims floating toolbars during active camera
                          panning or brush strokes for an unobstructed view.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={uiConfig.autoFadeHudOnPan}
                        onChange={(e) =>
                          onChangeUiConfig({
                            ...uiConfig,
                            autoFadeHudOnPan: e.target.checked,
                          })
                        }
                        className="mt-1 accent-amber-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          Auto-Collapse Ribbon on Small Windows
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Automatically condenses the secondary ribbon row when
                          split-screening or rotating Android screens.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={uiConfig.autoCollapseRibbonOnCompact}
                        onChange={(e) =>
                          onChangeUiConfig({
                            ...uiConfig,
                            autoCollapseRibbonOnCompact: e.target.checked,
                          })
                        }
                        className="mt-1 accent-amber-400"
                      />
                    </label>

                    <label className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="font-semibold text-slate-100">
                          High-Contrast Accessible Borders
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Enables crisp high-visibility borders and enhanced focus
                          outlines across all studio panels.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={uiConfig.highContrastAccessible}
                        onChange={(e) =>
                          onChangeUiConfig({
                            ...uiConfig,
                            highContrastAccessible: e.target.checked,
                          })
                        }
                        className="mt-1 accent-amber-400"
                      />
                    </label>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                      <div className="font-semibold text-slate-100 mb-1.5">
                        Android Thumb Dock Position
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'bottom', label: 'Bottom Center' },
                            { id: 'left_thumb', label: 'Left Thumb' },
                            { id: 'right_thumb', label: 'Right Thumb' },
                          ] as { id: MobileHubDockPosition; label: string }[]
                        ).map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() =>
                              onChangeUiConfig({
                                ...uiConfig,
                                mobileDockPosition: pos.id,
                              })
                            }
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
                              uiConfig.mobileDockPosition === pos.id
                                ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold'
                                : 'bg-slate-900 text-slate-300 border-slate-800'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ANDROID TOOL HUB CUSTOMIZER & ALL-TOOLS LAUNCHER */}
              {activeSheetTab === 'tools' && (
                <div className="space-y-4">
                  {/* Customize Pinned Quick Bar Tools */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-cyan-400">
                          Customize Pinned Quick-Hub Tools
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Choose which tools stay on your primary thumb bar so the
                          viewport stays clean and uncluttered.
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={uiConfig.showMobileCommandChips}
                          onChange={(e) =>
                            onChangeUiConfig({
                              ...uiConfig,
                              showMobileCommandChips: e.target.checked,
                            })
                          }
                          className="accent-cyan-400"
                        />
                        <span>Show WorldEdit Chips</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {TOOL_METADATA.map((t) => {
                        const Icon = t.icon;
                        const pinned = uiConfig.pinnedQuickTools.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => togglePinnedTool(t.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                              pinned
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{t.label}</span>
                            <span className="text-[10px] font-mono ml-1">
                              {pinned ? '★ Pinned' : '+ Pin'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Direct All-Tools & Studio Panels Grid (Everything accessible in 1 tap on Android) */}
                  <div>
                    <div className="text-xs font-bold text-slate-200 mb-2">
                      All Studio Workspaces & Panels (1-Tap Access)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onToggleLeftToolbox();
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Palette className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Paint & Blocks
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Swatches & Library
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenModal('workshop');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Block Workshop
                          </div>
                          <div className="text-[10px] text-slate-400">
                            2×2 CTM & Voxel Editor
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenModal('blueprints');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <FolderKanban className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Blueprints
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Stamp & Save Prefabs
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectRightSidebarTab('chunks_art');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Chunks & Smart CTM
                          </div>
                          <div className="text-[10px] text-slate-400">
                            4×4 Spritemap & Grid
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectRightSidebarTab('lighting');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Dynamic Lighting
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Solar Time & Shadows
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectRightSidebarTab('git');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Git Commits
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Snapshots & Rollback
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenModal('export');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Schematics & Godot
                          </div>
                          <div className="text-[10px] text-slate-400">
                            AI Block Matcher & Export
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenModal('drive');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Drive Backup
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Autosave & Cloud Sync
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenModal('cloud');
                          setIsAllToolsSheetOpen(false);
                          onCloseSettingsModal();
                        }}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left"
                      >
                        <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Multiplayer Room
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Live Co-Op Building
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </DraggableWindow>
    </>
  );
};
