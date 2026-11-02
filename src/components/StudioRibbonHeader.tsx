import React from 'react';
import {
  BlueprintPrefab,
  ChunkExpansionStyle,
  CustomBlockDefinition,
  DynamicLightingConfig,
  GitCommitNode,
  SmartPatternVariationConfig,
  ToolMode,
  WorldChunkConfig,
} from '../engine/types';
import { CameraViewPreset } from './SkyblockViewport';
import {
  BookOpen,
  BookmarkPlus,
  Box,
  Clock,
  Cloud,
  Compass,
  Copy,
  Eraser,
  FolderKanban,
  GitBranch,
  GitCommit,
  Grid,
  Hammer,
  HardDrive,
  HelpCircle,
  Keyboard,
  Layers,
  Lightbulb,
  Moon,
  Paintbrush,
  Pipette,
  Plane,
  Plus,
  Redo2,
  RefreshCw,
  RotateCw,
  Save,
  Scissors,
  Sparkles,
  Stamp,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Undo2,
  Wand2,
  ChevronUp,
  ChevronDown,
  PenTool,
  Sliders,
  Store,
  LayoutGrid,
  FolderOpen,
  Trophy,
  Film,
  Magnet,
  Volume2,
  VolumeX,
  ShieldCheck,
  Bug,
} from 'lucide-react';
import {
  triggerResetAllStudioWindows,
  useStudioSnapMode,
} from './DraggableWindow';

export type RibbonTabId =
  | 'home'
  | 'insert'
  | 'chunks_art'
  | 'lighting'
  | 'git'
  | 'schematics'
  | 'legend';

export type RightInspectorTab =
  | 'legend'
  | 'chunks_art'
  | 'git'
  | 'lighting'
  | 'closed';

interface StudioRibbonHeaderProps {
  activeRibbonTab: RibbonTabId;
  onSelectRibbonTab: (tab: RibbonTabId) => void;
  onOpenStudioMenu?: () => void;
  worldName: string;
  totalBlockCount: number;
  roomCode: string;
  isSignedIn: boolean;
  autosaveEnabled: boolean;
  lastAutosaveTime: string | null;
  toolMode: ToolMode;
  onSelectToolMode: (mode: ToolMode) => void;
  activeBlockId: string;
  customBlocks: Record<string, CustomBlockDefinition>;
  activeBlueprint: BlueprintPrefab | null;
  blueprintsCount: number;
  placementRotation: 0 | 90 | 180 | 270;
  onRotatePlacement: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onRunCommand: (cmd: string) => void;
  onTriggerManualSaveNow: () => void;
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
      | 'contracts_biomes'
  ) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  daylightMode: boolean;
  onToggleDaylight: () => void;
  lightingConfig: DynamicLightingConfig;
  onChangeLightingConfig: (next: DynamicLightingConfig) => void;
  chunkConfig: WorldChunkConfig;
  onChangeChunkConfig: (next: WorldChunkConfig) => void;
  onExpandChunk: (cx: number, cz: number, style: ChunkExpansionStyle) => void;
  patternConfig: SmartPatternVariationConfig;
  onChangePatternConfig: (next: SmartPatternVariationConfig) => void;
  onSelectCameraPreset: (preset: CameraViewPreset) => void;
  flyMode: boolean;
  onToggleFlyMode: () => void;
  freeLookActive?: boolean;
  onToggleMouseLookMode?: () => void;
  rightSidebarTab: RightInspectorTab;
  onSelectRightSidebarTab: (tab: RightInspectorTab) => void;
  gitCommits: GitCommitNode[];
  onCreateGitCommit: () => void;
  ribbonCollapsed?: boolean;
  onToggleRibbonCollapsed?: () => void;
  stylusEnabled?: boolean;
  onToggleStylusMode?: () => void;
  uiScalePercent?: number;
  onOpenAdaptiveSettings?: () => void;
  hudEditMode?: boolean;
  onToggleHudEditMode?: () => void;
  masteryRankTitle?: string;
  userXp?: number;
  isCinemaOpen?: boolean;
  onToggleCinemaDock?: () => void;
  soundEnabled?: boolean;
  onToggleSoundEnabled?: () => void;
  onOpenAuditorModal?: (tab: 'self_tests' | 'visual_bug_reporter') => void;
}

export const StudioRibbonHeader: React.FC<StudioRibbonHeaderProps> = ({
  activeRibbonTab,
  onSelectRibbonTab,
  onOpenStudioMenu,
  worldName,
  totalBlockCount,
  roomCode,
  isSignedIn,
  autosaveEnabled,
  lastAutosaveTime,
  toolMode,
  onSelectToolMode,
  activeBlockId,
  activeBlueprint,
  blueprintsCount,
  placementRotation,
  onRotatePlacement,
  canUndo,
  canRedo,
  onRunCommand,
  onTriggerManualSaveNow,
  onOpenModal,
  showGrid,
  onToggleGrid,
  daylightMode,
  onToggleDaylight,
  lightingConfig,
  onChangeLightingConfig,
  chunkConfig,
  onChangeChunkConfig,
  onExpandChunk,
  patternConfig,
  onChangePatternConfig,
  onSelectCameraPreset,
  flyMode,
  onToggleFlyMode,
  freeLookActive = false,
  onToggleMouseLookMode,
  rightSidebarTab,
  onSelectRightSidebarTab,
  gitCommits,
  onCreateGitCommit,
  ribbonCollapsed = false,
  onToggleRibbonCollapsed,
  stylusEnabled = false,
  onToggleStylusMode,
  uiScalePercent = 100,
  onOpenAdaptiveSettings,
  hudEditMode = false,
  onToggleHudEditMode,
  masteryRankTitle = 'Journeyman Builder',
  userXp = 150,
  isCinemaOpen = false,
  onToggleCinemaDock,
  soundEnabled = true,
  onToggleSoundEnabled,
  onOpenAuditorModal,
}) => {
  const [snapMode, toggleSnapMode] = useStudioSnapMode();

  const formatHour = (val: number) => {
    const hrs = Math.floor(val);
    const mins = Math.round((val - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  return (
    <header className="w-full bg-slate-900 border-b border-slate-700/90 z-30 shrink-0 select-none shadow-md">
      {/* Row 1: Microsoft Word / VS Code Quick-Access Title Bar + Ribbon Tab Strip (Adapts cleanly to narrow/split-screen window resizing) */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-950 border-b border-slate-800">
        {/* Left: App Brand Main Menu Button + Quick Access Toolbar (Projects, Block Market, Biomes/Contracts, Cinema, Save, Undo, Redo) */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            data-testid="open-main-menu-brand-btn"
            onClick={() => onOpenStudioMenu ? onOpenStudioMenu() : onOpenModal('main_menu')}
            aria-label="Open studio menu"
            title="Find actions, inspect scene cells and adjust your studio menu"
            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/60 transition-colors shrink-0"
          >
            <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xs">
              L
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap">
              LFS Block Studio
            </span>
          </button>

          {onOpenStudioMenu && <button type="button" onClick={onOpenStudioMenu} className="px-3 py-2 rounded-lg border border-emerald-600 text-emerald-100 text-xs shrink-0" aria-label="Find studio actions">Find actions</button>}

          {/* Main Menu / Projects & Reset Quick Button */}
          <button
            type="button"
            data-testid="ribbon-main-menu-btn"
            onClick={() => onOpenModal('main_menu')}
            title="Save/Load Projects, Storage & Reset World or Individual Chunks"
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects & Reset</span>
          </button>

          {/* CC0 Double Market Quick Button */}
          <button
            type="button"
            data-testid="ribbon-block-market-btn"
            onClick={() => onOpenModal('market')}
            title="Open local block catalogue and Studio Library"
            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Store className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Block Market</span>
          </button>

          {/* Architectural Contracts, Mastery Ranks & Procedural Biomes Hub */}
          <button
            type="button"
            data-testid="ribbon-contracts-biomes-btn"
            onClick={() => onOpenModal('contracts_biomes')}
            title={`Architectural Contracts, Procedural Island Biomes & Mastery Rank (${masteryRankTitle} · ${userXp} XP)`}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Biomes & Contracts</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-[10px] font-mono text-amber-300">
              {userXp} XP
            </span>
          </button>

          {/* Cinema & Timelapse Replay Studio Dock Toggle */}
          {onToggleCinemaDock && (
            <button
              type="button"
              data-testid="ribbon-cinema-timelapse-btn"
              onClick={onToggleCinemaDock}
              title="Open Cinema Photo Mode & Chronological Build Timelapse Replay"
              className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors ${
                isCinemaOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">Cinema</span>
            </button>
          )}

          {/* Self-Testing Harness & Issue Auditor Modal Button */}
          {onOpenAuditorModal && (
            <>
              <button
                type="button"
                data-testid="ribbon-self-test-audit-btn"
                onClick={() => onOpenAuditorModal('self_tests')}
                title="Open Automated 6-Suite Self-Testing Harness, GPU Memory Auditor & Self-Publishing Issue Tracker"
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Self-Test & Audit</span>
              </button>

              <button
                type="button"
                data-testid="ribbon-circle-bug-btn"
                onClick={() => onOpenAuditorModal('visual_bug_reporter')}
                title="Snap a 3D Viewport Screenshot, Circle a Bug in Red, and Analyze with Sovereign Forge / Gemini Vision"
                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <Bug className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden xl:inline">Circle Bug</span>
              </button>
            </>
          )}

          <div className="h-4 w-px bg-slate-800 shrink-0" />

          {/* Quick Access Toolbar */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onTriggerManualSaveNow}
              title="Quick Save Snapshot (Ctrl+S)"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => onRunCommand('//undo')}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            {onToggleSoundEnabled && (
              <button
                type="button"
                data-testid="ribbon-audio-haptics-toggle"
                onClick={onToggleSoundEnabled}
                title={
                  soundEnabled
                    ? 'Spatial WebAudio & Haptics: ON (Click to mute)'
                    : 'Spatial WebAudio & Haptics: Muted'
                }
                aria-label="Toggle Spatial Audio and Haptics"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 transition-colors"
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
            )}
            <button
              type="button"
              disabled={!canRedo}
              onClick={() => onRunCommand('//redo')}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenModal('main_menu')}
            title="Click to manage project saves or rename world"
            className="hidden 2xl:flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 truncate"
          >
            <span className="truncate max-w-[140px] font-semibold text-slate-100">
              {worldName}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400">
              {autosaveEnabled
                ? lastAutosaveTime
                  ? `Saved ${new Date(lastAutosaveTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Autosave ON'
                : 'Manual Save'}
            </span>
          </button>
        </div>

        {/* Center: Microsoft Word Style Ribbon Tabs */}
        <nav
          aria-label="Studio Ribbon Tabs"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar"
        >
          {(
            [
              { id: 'home', label: 'Home & Paint' },
              { id: 'insert', label: `Blueprints (${blueprintsCount})` },
              { id: 'chunks_art', label: 'Chunks & Smart Art' },
              { id: 'lighting', label: 'Lighting' },
              { id: 'git', label: `Git (${gitCommits.length})` },
              { id: 'schematics', label: 'Export drafts' },
              { id: 'legend', label: 'Legend' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectRibbonTab(tab.id)}
              className={`px-2.5 py-1 rounded-t-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeRibbonTab === tab.id
                  ? 'bg-slate-900 text-amber-400 border-amber-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/50 border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right: Quick Action Buttons (HUD Bars Edit, Snap/Free Toggle, Reset Windows, Stylus, UI Scale, Hotkeys, Drive, Cloud, Ribbon Collapse) */}
        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar max-w-full">
          {onToggleHudEditMode && (
            <button
              type="button"
              data-testid="ribbon-hud-edit-toggle"
              onClick={onToggleHudEditMode}
              title="Toggle WoW-Style Modular Action Bar HUD Layout Editor (Move, Resize, Lock & Configure Hotbars)"
              className={`px-2 py-1 rounded border text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition-colors ${
                hudEditMode
                  ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">
                {hudEditMode ? 'Lock HUD' : 'Edit HUD Bars'}
              </span>
            </button>
          )}

          <button
            type="button"
            data-testid="ribbon-snap-mode-toggle"
            onClick={() =>
              toggleSnapMode(snapMode === 'snap' ? 'free' : 'snap')
            }
            title={
              snapMode === 'snap'
                ? 'Window & HUD Drag Mode: Magnetic Grid/Edge Snap (16px / 2%). Click to switch to Free 1px Dragging, or hold Shift while dragging.'
                : 'Window & HUD Drag Mode: Free 1px Dragging. Click to switch to Magnetic Grid/Edge Snap, or hold Shift while dragging.'
            }
            className={`px-2 py-1 rounded border text-xs font-mono font-semibold flex items-center gap-1 whitespace-nowrap transition-colors ${
              snapMode === 'snap'
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">
              {snapMode === 'snap' ? 'Snap 16px' : 'Free Drag'}
            </span>
          </button>

          <button
            type="button"
            data-testid="ribbon-reset-all-windows-btn"
            onClick={() => triggerResetAllStudioWindows()}
            title="Reset all floating windows, docked panels, and HUD overlays back to default positions and sizes"
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">Reset Windows</span>
          </button>

          {onToggleStylusMode && (
            <button
              type="button"
              data-testid="ribbon-stylus-toggle"
              onClick={onToggleStylusMode}
              title="Toggle Stylus Mode for PC & Android Pen (Continuous Stroke + Palm Rejection)"
              className={`px-2 py-1 rounded border text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition-colors ${
                stylusEnabled
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {stylusEnabled ? 'Stylus ON' : 'Stylus'}
              </span>
            </button>
          )}

          {onOpenAdaptiveSettings && (
            <button
              type="button"
              data-testid="ribbon-ui-scale-settings-btn"
              onClick={onOpenAdaptiveSettings}
              title="Adaptive UI Rescaling, Accessibility & Android Hub Settings"
              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden lg:inline">UI {uiScalePercent}%</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenModal('hotkeys')}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Keyboard className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Hotkeys</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('drive')}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Drive Backup</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('cloud')}
            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>{isSignedIn ? `Cloud · ${roomCode}` : 'Multiplayer'}</span>
          </button>

          {onToggleRibbonCollapsed && (
            <button
              type="button"
              onClick={onToggleRibbonCollapsed}
              title={
                ribbonCollapsed
                  ? 'Expand Contextual Ribbon Toolbar'
                  : 'Collapse Ribbon Toolbar to Maximize 3D Viewport'
              }
              aria-label="Toggle Ribbon Collapse"
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
            >
              {ribbonCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Contextual Office Ribbon Toolbar (Gracefully collapsible on compact/mobile windows) */}
      {!ribbonCollapsed && (
      <div className="px-4 py-2 bg-slate-900 flex items-center justify-between gap-4 overflow-x-auto">
        {activeRibbonTab === 'home' && (
          <div className="flex items-center gap-4">
            {/* Group 1: Clipboard (Word / Paint style) */}
            <div className="flex items-center gap-1 pr-4 border-r border-slate-800">
              <button
                type="button"
                onClick={() => onRunCommand('//copy')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>Copy</span>
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//cut')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Scissors className="w-3.5 h-3.5 text-rose-400" />
                <span>Cut</span>
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//paste')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <FolderKanban className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paste</span>
              </button>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold ml-1 hidden xl:inline">
                Clipboard
              </span>
            </div>

            {/* Group 2: Tools (MS Paint style) */}
            <div className="flex items-center gap-1 pr-4 border-r border-slate-800">
              <button
                type="button"
                onClick={() => onSelectToolMode('place')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'place'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>Place (B)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('erase')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'erase'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase (X)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('brush_place')}
                title="Scrollable 3D Volume Place Brush (Key Y) — Hold Shift+Scroll to resize radius"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'brush_place'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-cyan-300 hover:bg-slate-800'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>3D Brush+ (Y)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('brush_erase')}
                title="Scrollable 3D Volume Erase / Excavate Brush (Key O) — Removes all blocks within 3D brush area"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'brush_erase'
                    ? 'bg-rose-500 text-white font-bold'
                    : 'bg-slate-800/80 text-rose-300 hover:bg-slate-800'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>3D Brush- (O)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('paint')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'paint'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Paint (G)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('pick')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'pick'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Pipette className="w-3.5 h-3.5" />
                <span>Picker (I)</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectToolMode('wand_select')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  toolMode === 'wand_select'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Select Region (E)</span>
              </button>
              <button
                type="button"
                onClick={onRotatePlacement}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs font-mono text-slate-200 flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>{placementRotation}° (R)</span>
              </button>
            </div>

            {/* Group 3: WorldEdit Region Fill & Shapes */}
            <div className="flex items-center gap-1 pr-4 border-r border-slate-800">
              <button
                type="button"
                onClick={() => onRunCommand(`//set ${activeBlockId}`)}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 text-cyan-300 text-xs font-mono font-semibold whitespace-nowrap"
              >
                Fill Region (//set)
              </button>
              <button
                type="button"
                onClick={() => onRunCommand(`//walls ${activeBlockId}`)}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 text-cyan-300 text-xs font-mono font-semibold whitespace-nowrap"
              >
                Build Walls (//walls)
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//hollow')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono whitespace-nowrap"
              >
                Hollow (//hollow)
              </button>
              <button
                type="button"
                onClick={() => onRunCommand('//stack 1 up')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono whitespace-nowrap"
              >
                Stack +1Y (//stack)
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('main_menu')}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold whitespace-nowrap"
                title="Reset Entire World or Clear/Reset Specific Chunks"
              >
                Reset World / Chunk
              </button>
            </div>

            {/* Group 4: Custom Block, CC0 Market & Schematic Quick Launch */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenModal('market')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Block catalogue</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('workshop')}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Block Workshop</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('export')}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Export drafts</span>
              </button>
            </div>
          </div>
        )}

        {activeRibbonTab === 'insert' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-slate-800">
              <button
                type="button"
                onClick={() => onOpenModal('workshop')}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Custom Block / Chisel 8×8×8</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('blueprints')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Blueprints Library ({blueprintsCount})</span>
              </button>
            </div>

            {activeBlueprint && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectToolMode('stamp_blueprint')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                    toolMode === 'stamp_blueprint'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <Stamp className="w-3.5 h-3.5" />
                  <span>Active Stamp: {activeBlueprint.name}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeRibbonTab === 'lighting' && (
          <div className="flex items-center gap-5">
            {/* Time of Day Presets */}
            <div className="flex items-center gap-1 pr-4 border-r border-slate-800">
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    timeOfDay: 6.5,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 flex items-center gap-1 whitespace-nowrap"
              >
                <Sunrise className="w-3.5 h-3.5" />
                <span>Dawn (06:30)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeLightingConfig({
                    ...lightingConfig,
                    timeOfDay: 13.0,
                  });
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 flex items-center gap-1 whitespace-nowrap"
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Noon (13:00)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    timeOfDay: 18.2,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-orange-300 flex items-center gap-1 whitespace-nowrap"
              >
                <Sunset className="w-3.5 h-3.5" />
                <span>Sunset (18:15)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    timeOfDay: 22.5,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 flex items-center gap-1 whitespace-nowrap"
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Night (22:30)</span>
              </button>
            </div>

            {/* Sun Time Slider & Azimuth */}
            <div className="flex items-center gap-4 pr-4 border-r border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 whitespace-nowrap">
                  Time:{' '}
                  <strong className="font-mono text-amber-400">
                    {formatHour(lightingConfig.timeOfDay)}
                  </strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.25}
                  aria-label="Solar Time of Day"
                  value={lightingConfig.timeOfDay}
                  onChange={(e) =>
                    onChangeLightingConfig({
                      ...lightingConfig,
                      timeOfDay: parseFloat(e.target.value),
                    })
                  }
                  className="w-28 accent-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 whitespace-nowrap">
                  Sun Angle:{' '}
                  <strong className="font-mono text-cyan-400">
                    {lightingConfig.sunAzimuth}°
                  </strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  aria-label="Solar Azimuth Angle"
                  value={lightingConfig.sunAzimuth}
                  onChange={(e) =>
                    onChangeLightingConfig({
                      ...lightingConfig,
                      sunAzimuth: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-24 accent-cyan-500"
                />
              </div>
            </div>

            {/* Dynamic Block Lights, Shadows & Sky */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    pointLightsEnabled: !lightingConfig.pointLightsEnabled,
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  lightingConfig.pointLightsEnabled
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>
                  Emissive Block Lights:{' '}
                  {lightingConfig.pointLightsEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleDaylight}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 whitespace-nowrap"
              >
                {daylightMode ? 'Sky: Bright Blue' : 'Sky: Studio Dark'}
              </button>

              <button
                type="button"
                onClick={() => onSelectRightSidebarTab('lighting')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 whitespace-nowrap"
              >
                Full Lighting Inspector →
              </button>
            </div>
          </div>
        )}

        {activeRibbonTab === 'git' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-slate-800 text-xs font-mono">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">branch:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                main
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">
                HEAD:{' '}
                <strong className="text-amber-400">
                  {gitCommits[0]?.hash || 'init001'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCreateGitCommit}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <GitCommit className="w-3.5 h-3.5" />
                <span>Commit Current World State</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectRightSidebarTab('git')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open Git Commit Graph ({gitCommits.length})</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenModal('drive')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span>Push Backup to Google Drive</span>
              </button>
            </div>
          </div>
        )}

        {activeRibbonTab === 'schematics' && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenModal('export')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Open export drafts & approximate block mapping
              </span>
            </button>
          </div>
        )}

        {activeRibbonTab === 'chunks_art' && (
          <div className="flex items-center gap-3">
            {/* Group 1: Expand Build into New Chunks */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-800">
              <button
                type="button"
                onClick={() => onSelectRightSidebarTab('chunks_art')}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>5×5 Chunk Grid & Culling</span>
              </button>

              <button
                type="button"
                onClick={() => onExpandChunk(1, 0, 'grass_island')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 flex items-center gap-1 whitespace-nowrap"
                title="Expand build area with a new Skyblock Island in East Chunk (1, 0)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Expand East Island (1,0)</span>
              </button>

              <button
                type="button"
                onClick={() => onExpandChunk(0, 1, 'stone_foundation')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 flex items-center gap-1 whitespace-nowrap"
                title="Expand build area with a Stone Foundation in South Chunk (0, 1)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Expand South Stone Pad (0,1)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeChunkConfig({
                    ...chunkConfig,
                    showChunkBorders: !chunkConfig.showChunkBorders,
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  chunkConfig.showChunkBorders
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {chunkConfig.showChunkBorders
                  ? 'Chunk Borders: ON'
                  : 'Chunk Borders: OFF'}
              </button>
            </div>

            {/* Group 2: Smart Pattern Variation & Connected-Neighbor Art Matcher */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: !patternConfig.enabled,
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${
                  patternConfig.enabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  Connected CTM Art: {patternConfig.enabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                {([16, 32, 64] as const).map((px) => {
                  const active = (patternConfig.pixelsPerBlock || 64) === px;
                  return (
                    <button
                      key={px}
                      type="button"
                      onClick={() =>
                        onChangePatternConfig({
                          ...patternConfig,
                          pixelsPerBlock: px,
                        })
                      }
                      title={`Set Procedural Texture Density to ${px}×${px} pixels per block`}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {px}×
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    seed: patternConfig.seed + 1,
                    evolutionPhase: (patternConfig.evolutionPhase + 0.65) % (Math.PI * 2),
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 flex items-center gap-1 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Evolve Pattern (Seed #{patternConfig.seed})</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    autoEvolveLoop: !patternConfig.autoEvolveLoop,
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  patternConfig.autoEvolveLoop
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {patternConfig.autoEvolveLoop
                  ? 'Animated preview: ON'
                  : 'Animated preview: OFF'}
              </button>
            </div>
          </div>
        )}

        {activeRibbonTab === 'legend' && (
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <button
              type="button"
              onClick={() =>
                onSelectRightSidebarTab(
                  rightSidebarTab === 'legend' ? 'closed' : 'legend'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {rightSidebarTab === 'legend'
                  ? 'Command Legend Docked on Right →'
                  : 'Show Docked Command & Controls Legend'}
              </span>
            </button>
            <span>
              Includes interactive WorldEdit commands, mouse gestures, and Minecraft WASD flight guide.
            </span>
          </div>
        )}

        {/* Right Side Dock Switcher (Always accessible in Ribbon Row 2) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {onToggleMouseLookMode && (
            <button
              type="button"
              onClick={onToggleMouseLookMode}
              title="Toggle Mouse between 3D Free-Look Fly Builder and Studio Pan/Zoom (Key C or Hold Alt)"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
                freeLookActive
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>
                {freeLookActive ? 'Mouse: Free-Look (C)' : 'Mouse: Pan/Zoom (C)'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFlyMode}
            title="Toggle Minecraft WASD Flight (Key F)"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
              flyMode
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>{flyMode ? 'WASD Fly: ON' : 'WASD Fly: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleGrid}
            title="Toggle 3D Reference Grid"
            className={`p-1.5 rounded-lg border ${
              showGrid
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onSelectCameraPreset('isometric')}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 whitespace-nowrap"
          >
            Iso View
          </button>

          <button
            type="button"
            onClick={() =>
              onSelectRightSidebarTab(
                rightSidebarTab === 'legend' ? 'closed' : 'legend'
              )
            }
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap ${
              rightSidebarTab === 'legend'
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Legend</span>
          </button>
        </div>
      </div>
      )}
    </header>
  );
};
