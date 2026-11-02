import React, { useId, useRef, useState } from 'react';
import {
  AdaptivePatternArchiveState,
  ArchitecturalObjectClassId,
  ChunkExpansionStyle,
  DetectedArchitecturalObjectClass,
  DetectedSymmetryCandidate,
  DynamicLightingConfig,
  GitCommitNode,
  GridCoord,
  PlacedBlock,
  SmartPatternVariationConfig,
  SpatialCopilotConfig,
  SymmetryAxisMode,
  SymmetryConfig,
  WalkabilityAuditReport,
  WorldChunkConfig,
} from '../engine/types';
import {
  chunkKey,
  computeChunkPerformanceStats,
} from '../engine/chunkAndPatternEngine';
import {
  STUDIO_DRAG_MIME,
  serializeStudioDragPayload,
} from '../engine/windowLayoutEngine';
import { DraggableWindow } from './DraggableWindow';
import { RightInspectorTab } from './StudioRibbonHeader';
import {
  BookOpen,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  GitCommit,
  GripVertical,
  Keyboard,
  Layers,
  Lightbulb,
  Moon,
  MousePointer,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Terminal,
  X,
} from 'lucide-react';

interface CommandLegendSidebarProps {
  activeTab: RightInspectorTab;
  onSelectTab: (tab: RightInspectorTab) => void;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  dockedWidth?: number;
  onResizeDockedWidth?: (nextWidth: number) => void;
  activeBlockId: string;
  blocks: Record<string, PlacedBlock>;
  hoveredCoord: GridCoord;
  onRunCommand: (cmd: string) => void;
  lightingConfig: DynamicLightingConfig;
  onChangeLightingConfig: (next: DynamicLightingConfig) => void;
  chunkConfig: WorldChunkConfig;
  onChangeChunkConfig: (next: WorldChunkConfig) => void;
  onExpandChunk: (cx: number, cz: number, style: ChunkExpansionStyle) => void;
  patternConfig: SmartPatternVariationConfig;
  onChangePatternConfig: (next: SmartPatternVariationConfig) => void;
  gitCommits: GitCommitNode[];
  activeCommitId: string;
  onCreateGitCommit: (customMessage?: string) => void;
  onCheckoutGitCommit: (commit: GitCommitNode) => void;
  onOpenHotkeysModal: () => void;
  symmetryConfig?: SymmetryConfig;
  onChangeSymmetryConfig?: (next: SymmetryConfig) => void;
  detectedSymmetry?: DetectedSymmetryCandidate | null;
  copilotConfig?: SpatialCopilotConfig;
  onChangeCopilotConfig?: (next: SpatialCopilotConfig) => void;
  walkabilityReport?: WalkabilityAuditReport | null;
  onAutoLightDarkSpots?: () => void;
  autoLightUnavailableReason?: string;
  patternArchive?: AdaptivePatternArchiveState;
  detectedObjectClass?: DetectedArchitecturalObjectClass | null;
  onResetPatternArchive?: () => void;
}

interface CommandLegendItem {
  cmd: string;
  syntax: string;
  category:
    | 'Region Selection'
    | 'Block Operations'
    | 'Geometry Generators'
    | 'Clipboard & Transform'
    | 'History';
  summary: string;
  buildRunCmd: (activeBlockId: string) => string;
}

const WORLDEDIT_LEGEND_ITEMS: CommandLegendItem[] = [
  {
    cmd: '//wand',
    syntax: '//wand',
    category: 'Region Selection',
    summary:
      'Equips the Region Wand tool. Left-click any block to set Pos1; Right-click to set Pos2.',
    buildRunCmd: () => '//wand',
  },
  {
    cmd: '//pos1',
    syntax: '//pos1 [x y z]',
    category: 'Region Selection',
    summary:
      'Sets selection corner 1 (Pos1) to your current cursor coordinate or explicit X Y Z.',
    buildRunCmd: () => '//pos1',
  },
  {
    cmd: '//pos2',
    syntax: '//pos2 [x y z]',
    category: 'Region Selection',
    summary:
      'Sets selection corner 2 (Pos2) to your current cursor coordinate or explicit X Y Z.',
    buildRunCmd: () => '//pos2',
  },
  {
    cmd: '//expand',
    syntax: '//expand <amount> [up|down|north|south|east|west]',
    category: 'Region Selection',
    summary:
      'Expands the active Pos1–Pos2 bounding box outward in the specified direction.',
    buildRunCmd: () => '//expand 2 up',
  },
  {
    cmd: '//set',
    syntax: '//set <block_id>',
    category: 'Block Operations',
    summary:
      'Fills every voxel inside the Pos1–Pos2 selection region with the specified block.',
    buildRunCmd: (blk) => `//set ${blk}`,
  },
  {
    cmd: '//replace',
    syntax: '//replace [from_block] <to_block>',
    category: 'Block Operations',
    summary:
      'Replaces all non-air blocks (or a specific block type) inside the selection with the active block.',
    buildRunCmd: (blk) => `//replace ${blk}`,
  },
  {
    cmd: '//walls',
    syntax: '//walls <block_id>',
    category: 'Block Operations',
    summary:
      'Builds 4 vertical perimeter walls around the Pos1–Pos2 region (leaves roof and floor open).',
    buildRunCmd: (blk) => `//walls ${blk}`,
  },
  {
    cmd: '//box',
    syntax: '//box <block_id>',
    category: 'Block Operations',
    summary:
      'Constructs a hollow 6-sided architectural room shell around the Pos1–Pos2 selection.',
    buildRunCmd: (blk) => `//box ${blk}`,
  },
  {
    cmd: '//hollow',
    syntax: '//hollow',
    category: 'Block Operations',
    summary:
      'Hollows out the interior of a solid structure inside Pos1–Pos2, keeping a 1-block outer shell.',
    buildRunCmd: () => '//hollow',
  },
  {
    cmd: '//clear',
    syntax: '//clear',
    category: 'Block Operations',
    summary:
      'Deletes all blocks within the selected Pos1–Pos2 region (same as //set air).',
    buildRunCmd: () => '//set air',
  },
  {
    cmd: '//sphere',
    syntax: '//sphere <block_id> <radius>',
    category: 'Geometry Generators',
    summary:
      'Generates a solid 3D voxel sphere centered at Pos1 with the given radius.',
    buildRunCmd: (blk) => `//sphere ${blk} 3`,
  },
  {
    cmd: '//hsphere',
    syntax: '//hsphere <block_id> <radius>',
    category: 'Geometry Generators',
    summary:
      'Generates a hollow geodesic dome / sphere shell centered at Pos1.',
    buildRunCmd: (blk) => `//hsphere ${blk} 4`,
  },
  {
    cmd: '//cyl',
    syntax: '//cyl <block_id> <radius> [height]',
    category: 'Geometry Generators',
    summary:
      'Generates a vertical cylindrical tower or circular floor pad centered at Pos1.',
    buildRunCmd: (blk) => `//cyl ${blk} 3 4`,
  },
  {
    cmd: '//copy',
    syntax: '//copy',
    category: 'Clipboard & Transform',
    summary:
      'Copies all blocks within the Pos1–Pos2 selection into your WorldEdit clipboard.',
    buildRunCmd: () => '//copy',
  },
  {
    cmd: '//cut',
    syntax: '//cut',
    category: 'Clipboard & Transform',
    summary:
      'Copies the Pos1–Pos2 selection to the clipboard and clears the original region.',
    buildRunCmd: () => '//cut',
  },
  {
    cmd: '//paste',
    syntax: '//paste',
    category: 'Clipboard & Transform',
    summary: 'Pastes the copied structure from the clipboard anchored at Pos1.',
    buildRunCmd: () => '//paste',
  },
  {
    cmd: '//stack',
    syntax: '//stack <count> [up|down|north|south|east|west]',
    category: 'Clipboard & Transform',
    summary:
      'Repeats and stacks the selected structure N times along an axis (ideal for multi-story buildings or bridges).',
    buildRunCmd: () => '//stack 2 up',
  },
  {
    cmd: '//move',
    syntax: '//move <distance> [up|down|north|south|east|west]',
    category: 'Clipboard & Transform',
    summary:
      'Shifts all blocks inside the selection by N units in the given direction.',
    buildRunCmd: () => '//move 2 up',
  },
  {
    cmd: '//undo',
    syntax: '//undo',
    category: 'History',
    summary:
      'Reverts the last block placement, paint action, or WorldEdit operation (Ctrl+Z).',
    buildRunCmd: () => '//undo',
  },
  {
    cmd: '//redo',
    syntax: '//redo',
    category: 'History',
    summary: 'Re-applies a previously undone operation (Ctrl+Shift+Z).',
    buildRunCmd: () => '//redo',
  },
];

export const CommandLegendSidebar: React.FC<CommandLegendSidebarProps> = ({
  activeTab,
  onSelectTab,
  isFloating = false,
  onToggleFloating,
  dockedWidth = 320,
  onResizeDockedWidth,
  activeBlockId,
  blocks,
  hoveredCoord,
  onRunCommand,
  lightingConfig,
  onChangeLightingConfig,
  chunkConfig,
  onChangeChunkConfig,
  onExpandChunk,
  patternConfig,
  onChangePatternConfig,
  gitCommits,
  activeCommitId,
  onCreateGitCommit,
  onCheckoutGitCommit,
  onOpenHotkeysModal,
  symmetryConfig,
  onChangeSymmetryConfig,
  detectedSymmetry,
  copilotConfig,
  onChangeCopilotConfig,
  walkabilityReport,
  onAutoLightDarkSpots,
  autoLightUnavailableReason,
  patternArchive,
  detectedObjectClass,
  onResetPatternArchive,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const autoLightReasonId = useId();
  const [commitMessageInput, setCommitMessageInput] = useState('');
  const [expansionStyle, setExpansionStyle] =
    useState<ChunkExpansionStyle>('grass_island');
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  if (activeTab === 'closed') {
    return null;
  }

  const formatTimeOfDay = (hours: number) => {
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const filteredCommands = WORLDEDIT_LEGEND_ITEMS.filter(
    (item) =>
      item.cmd.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const chunkStats = computeChunkPerformanceStats(
    blocks,
    chunkConfig,
    hoveredCoord
  );

  const handleToggleChunkCell = (cx: number, cz: number) => {
    const k = chunkKey(cx, cz);
    const isUnlocked =
      chunkConfig.unlockedChunks.includes(k) ||
      (chunkStats.countsByChunk[k] || 0) > 0;

    if (isUnlocked) {
      // Toggle Active (Rendered) vs Hibernated (Culled for FPS)
      const currentlyActive = chunkConfig.activeChunks[k] !== false;
      onChangeChunkConfig({
        ...chunkConfig,
        activeChunks: {
          ...chunkConfig.activeChunks,
          [k]: !currentlyActive,
        },
      });
    } else {
      // Expand world into this new chunk!
      onExpandChunk(cx, cz, expansionStyle);
    }
  };

  const handleActivateAllChunks = () => {
    const nextActive: Record<string, boolean> = {};
    for (const k of chunkStats.discoveredChunks) {
      nextActive[k] = true;
    }
    onChangeChunkConfig({
      ...chunkConfig,
      activeChunks: nextActive,
      autoCullDistanceChunks: 0,
    });
  };

  const handleHibernateOuterChunks = () => {
    const nextActive: Record<string, boolean> = {};
    for (const k of chunkStats.discoveredChunks) {
      nextActive[k] = k === '0,0';
    }
    onChangeChunkConfig({
      ...chunkConfig,
      activeChunks: nextActive,
    });
  };

  const innerInspectorContent = (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden select-none">
      {/* Top Inspector Switcher Header */}
      <div className="flex items-center justify-between px-2 py-2 bg-slate-950 border-b border-slate-800 shrink-0 gap-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectTab('legend')}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
              activeTab === 'legend'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            <span>Legend</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('chunks_art')}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
              activeTab === 'chunks_art'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Chunks & Art</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('git')}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
              activeTab === 'git'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <GitBranch className="w-3 h-3" />
            <span>Git</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('lighting')}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
              activeTab === 'lighting'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sun className="w-3 h-3" />
            <span>Light</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleFloating && !isFloating && (
            <button
              type="button"
              data-testid="float-right-inspector-btn"
              onClick={onToggleFloating}
              title="Undock Inspector into a Moveable & Resizable Floating Window"
              className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-400 hover:text-cyan-300"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {!isFloating && (
            <button
              type="button"
              onClick={() => onSelectTab('closed')}
              title="Collapse Inspector Sidebar"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: BUILT-IN COMMAND & CONTROLS LEGEND */}
      {activeTab === 'legend' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commands (//set, //walls, //stack)..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          {!searchQuery && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5" />
                  3D Mouse & Camera Legend
                </span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-emerald-400 shrink-0">
                    Key C (Toggle)
                  </span>
                  <span className="text-slate-300 text-right">
                    Switch Free-Look Fly Builder ↔ Studio Pan
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-cyan-400 shrink-0">
                    Hold Alt
                  </span>
                  <span className="text-slate-300 text-right">
                    Hold to momentarily look around or pan
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-200 shrink-0">
                    Left Click
                  </span>
                  <span className="text-slate-400 text-right">
                    Place block, Erase, Paint, or set Pos1
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-200 shrink-0">
                    Right Drag
                  </span>
                  <span className="text-slate-400 text-right">
                    Orbit 3D camera (or set Pos2 with Wand)
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-200 shrink-0">
                    Scroll Wheel
                  </span>
                  <span className="text-slate-400 text-right">
                    Zoom camera in / out smoothly
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-200 shrink-0">
                    Key R
                  </span>
                  <span className="text-slate-400 text-right">
                    Rotate block or stair orientation 90°
                  </span>
                </div>
              </div>
            </div>
          )}

          {!searchQuery && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5" />
                  Minecraft WASD Flight Legend
                </span>
                <button
                  type="button"
                  onClick={onOpenHotkeysModal}
                  className="text-[10px] font-semibold text-amber-400 hover:underline"
                >
                  Remap Keys
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="font-mono font-bold text-slate-100 block">
                    W / A / S / D
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Strafe & fly horizontally
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="font-mono font-bold text-slate-100 block">
                    Space / Shift
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Fly Up (+Y) / Down (-Y)
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="font-mono font-bold text-slate-100 block">
                    Hold Ctrl
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Sprint Flight Speed Boost
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="font-mono font-bold text-slate-100 block">
                    1 – 9 Keys
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Select quick block slot
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                WorldEdit Command Legend ({filteredCommands.length})
              </span>
            </div>

            <div className="space-y-2">
              {filteredCommands.map((item) => {
                const runTarget = item.buildRunCmd(activeBlockId);
                return (
                  <div
                    key={item.cmd}
                    draggable
                    onDragStart={(e) => {
                      const raw = serializeStudioDragPayload({
                        type: 'command',
                        targetId: runTarget,
                        label: item.cmd.replace('//', ''),
                      });
                      e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
                      e.dataTransfer.setData('text/plain', raw);
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    title={`Drag ${item.cmd} onto any Hotbar slot, or click Run`}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors space-y-1.5 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-slate-600 shrink-0" />
                        <span>{item.syntax}</span>
                      </code>
                      <button
                        type="button"
                        onClick={() => onRunCommand(runTarget)}
                        title={`Execute ${runTarget}`}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[10px] font-semibold text-slate-200 flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <Play className="w-2.5 h-2.5" />
                        <span>Run</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {item.summary}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{item.category} · Drag to Hotbar</span>
                      <span className="font-mono text-slate-400">{runTarget}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-CHUNK WORLD GRID & SMART PATTERN ART MATCHER */}
      {activeTab === 'chunks_art' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* PART 0: LOCAL SPATIAL COPILOT, SYMMETRY MIRROR & PIXEL 8 PRO GPU GOVERNOR */}
          {copilotConfig && onChangeCopilotConfig && symmetryConfig && onChangeSymmetryConfig && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/35 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Local Spatial Copilot (Zero-API)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      enabled: !copilotConfig.enabled,
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    copilotConfig.enabled
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                >
                  {copilotConfig.enabled ? 'ACTIVE (<1.2ms)' : 'PAUSED'}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                100% client-side procedural algorithms optimized for{' '}
                <span className="text-emerald-300 font-semibold">
                  Google Pixel 8 Pro
                </span>{' '}
                & desktop: auto-detects symmetry, predicts next blocks (<kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px]">Tab</kbd>), and audits walkability.
              </p>

              {/* Live Symmetry Mirror Mode & Pivot Controls */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    Real-Time Symmetry Mirror (Key: V)
                  </span>
                  {detectedSymmetry && symmetryConfig.mode === 'off' && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeSymmetryConfig({
                          ...symmetryConfig,
                          mode: detectedSymmetry.recommendedMode,
                          pivotX: detectedSymmetry.pivotX,
                          pivotZ: detectedSymmetry.pivotZ,
                        })
                      }
                      className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 text-[10px] font-semibold"
                    >
                      Apply Detected ({Math.round(detectedSymmetry.confidence * 100)}%)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'off', label: 'Off' },
                      { id: 'mirror_x', label: 'X-Mirror' },
                      { id: 'mirror_z', label: 'Z-Mirror' },
                      { id: 'quad_xz', label: '4× Quad' },
                    ] as { id: SymmetryAxisMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        onChangeSymmetryConfig({ ...symmetryConfig, mode: m.id })
                      }
                      className={`py-1 rounded text-[10px] font-semibold border transition-colors ${
                        symmetryConfig.mode === m.id
                          ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {symmetryConfig.mode !== 'off' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="text-[10px] text-slate-400 flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      <span>Pivot X:</span>
                      <input
                        type="number"
                        value={symmetryConfig.pivotX}
                        onChange={(e) =>
                          onChangeSymmetryConfig({
                            ...symmetryConfig,
                            pivotX: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-12 bg-transparent text-right font-mono text-slate-100 focus:outline-none"
                      />
                    </label>
                    <label className="text-[10px] text-slate-400 flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      <span>Pivot Z:</span>
                      <input
                        type="number"
                        value={symmetryConfig.pivotZ}
                        onChange={(e) =>
                          onChangeSymmetryConfig({
                            ...symmetryConfig,
                            pivotZ: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-12 bg-transparent text-right font-mono text-slate-100 focus:outline-none"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Copilot Feature Toggles & Pixel 8 Pro GPU Frame-Budget Governor */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      ghostAutoCompleteEnabled:
                        !copilotConfig.ghostAutoCompleteEnabled,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.ghostAutoCompleteEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Ghost Auto-Complete:{' '}
                  <strong>
                    {copilotConfig.ghostAutoCompleteEnabled ? 'ON' : 'OFF'}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      selectionCommandGhostPreview:
                        !copilotConfig.selectionCommandGhostPreview,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.selectionCommandGhostPreview
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Cmd Ghost Preview:{' '}
                  <strong>
                    {copilotConfig.selectionCommandGhostPreview ? 'ON' : 'OFF'}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      pixel8ProGpuGovernor: !copilotConfig.pixel8ProGpuGovernor,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.pixel8ProGpuGovernor
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Caps QHD+ mobile DPR to 1.75x and pools 3D ghost geometries for locked 90-120Hz on Google Pixel 8 Pro"
                >
                  Pixel 8 Pro Governor:{' '}
                  <strong>
                    {copilotConfig.pixel8ProGpuGovernor ? 'ON' : 'OFF'}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      showWalkabilityOverlays:
                        !copilotConfig.showWalkabilityOverlays,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.showWalkabilityOverlays
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  3D Audit Markers:{' '}
                  <strong>
                    {copilotConfig.showWalkabilityOverlays ? 'ON' : 'OFF'}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      adaptiveLearningEnabled:
                        copilotConfig.adaptiveLearningEnabled === false
                          ? true
                          : false,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.adaptiveLearningEnabled !== false
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Saves completed actions into a local Pattern Archive, weighting recency, area, habit, and penalizing predicted blocks removed during the linger window"
                >
                  Adaptive Archive:{' '}
                  <strong>
                    {copilotConfig.adaptiveLearningEnabled !== false
                      ? 'LEARNING'
                      : 'OFF'}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeCopilotConfig({
                      ...copilotConfig,
                      connectedTextureGhostMatch:
                        copilotConfig.connectedTextureGhostMatch === false
                          ? true
                          : false,
                    })
                  }
                  className={`p-1.5 rounded border text-left font-medium ${
                    copilotConfig.connectedTextureGhostMatch !== false
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Links predicted ghost blocks to local neighbors using Connected Texture & Color Harmony prediction"
                >
                  CTM Ghost Link:{' '}
                  <strong>
                    {copilotConfig.connectedTextureGhostMatch !== false
                      ? 'ON'
                      : 'OFF'}
                  </strong>
                </button>
              </div>

              {/* Self-Learning Pattern Archive, Linger Removal Feedback & Architectural Object Class Mapping */}
              <div
                data-testid="copilot-learning-archive-card"
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-emerald-400">
                    Self-Learning Archive & Object Class
                  </span>
                  {onResetPatternArchive && (
                    <button
                      type="button"
                      onClick={onResetPatternArchive}
                      className="text-[10px] font-mono text-slate-400 hover:text-amber-300"
                      title="Reset learned pattern database to default architectural seeds"
                    >
                      Reset Archive
                    </button>
                  )}
                </div>

                {/* Target / Auto-Detected Large-Scale Object Class Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 block">
                    Target Architectural Object Class
                  </label>
                  <select
                    aria-label="Target Architectural Object Class"
                    value={copilotConfig.targetObjectClass || 'auto_detect'}
                    onChange={(e) =>
                      onChangeCopilotConfig({
                        ...copilotConfig,
                        targetObjectClass: e.target
                          .value as ArchitecturalObjectClassId,
                      })
                    }
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] text-slate-100"
                  >
                    <option value="auto_detect">
                      Auto-Detect Object Class (
                      {detectedObjectClass?.label || 'Gabled House'})
                    </option>
                    <option value="house_dwelling">
                      Gabled House / Cottage (Walls + Roof Slopes)
                    </option>
                    <option value="watchtower_spire">
                      Fortified Watchtower / Spire (Shaft + Battlements)
                    </option>
                    <option value="bridge_aqueduct">
                      Arched Bridge / Skywalk (Deck + Side Parapets)
                    </option>
                    <option value="walled_courtyard">
                      Citadel Keep / Courtyard (Curtain Walls + Bastions)
                    </option>
                    <option value="terraced_pavilion">
                      Nordic Deck / Terraced Pavilion (Colonnade + Glass)
                    </option>
                  </select>
                </div>

                {detectedObjectClass && (
                  <div className="p-2 rounded bg-slate-950/90 border border-emerald-500/25 text-[10px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-300">
                        {detectedObjectClass.label}
                      </span>
                      <span className="font-mono text-slate-400">
                        {Math.round(detectedObjectClass.confidence * 100)}% match
                      </span>
                    </div>
                    <p className="text-slate-300 leading-snug">
                      {detectedObjectClass.nextStageHint}
                    </p>
                  </div>
                )}

                {patternArchive && (
                  <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono pt-0.5">
                    <div className="p-1.5 rounded bg-slate-950 border border-slate-800 text-center">
                      <div className="text-emerald-400 font-bold">
                        {Object.keys(patternArchive.patterns).length}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        Saved Motifs
                      </div>
                    </div>
                    <div
                      className="p-1.5 rounded bg-slate-950 border border-slate-800 text-center"
                      title="Predicted blocks that survived the 45s linger window without being erased"
                    >
                      <div className="text-cyan-400 font-bold">
                        +{patternArchive.totalLingerSurvivals}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        Kept / Learned
                      </div>
                    </div>
                    <div
                      className="p-1.5 rounded bg-slate-950 border border-slate-800 text-center"
                      title="Predicted blocks removed by user during linger window (automatically down-weighted)"
                    >
                      <div className="text-amber-400 font-bold">
                        -{patternArchive.totalLingerRemovals} (
                        {patternArchive.lingerWatchList.length} watch)
                      </div>
                      <div className="text-[9px] text-slate-400">
                        Linger Pruned
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Real-Time Walkability, Headroom & Interior Lighting Audit */}
              {walkabilityReport && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold uppercase tracking-wider text-slate-300">
                      Playtest Walkability Audit
                    </span>
                    <span className="font-mono text-emerald-400">
                      Score: {walkabilityReport.accessibilityScore}/100 (
                      {walkabilityReport.executionMs}ms)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {walkabilityReport.summary}
                  </p>
                  {walkabilityReport.darkInteriorCoords.length > 0 &&
                    onAutoLightDarkSpots && (
                      <div>
                      <button
                        type="button"
                        onClick={onAutoLightDarkSpots}
                        disabled={Boolean(autoLightUnavailableReason)}
                        aria-describedby={autoLightUnavailableReason ? autoLightReasonId : undefined}
                        className="w-full py-1 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-[10px] font-semibold flex items-center justify-center gap-1"
                      >
                        <Lightbulb className="w-3 h-3" />
                        <span>
                          Auto-Place Lanterns in{' '}
                          {walkabilityReport.darkInteriorCoords.length} Dark
                          Spot
                          {walkabilityReport.darkInteriorCoords.length === 1
                            ? ''
                            : 's'}
                        </span>
                      </button>
                      {autoLightUnavailableReason && <p id={autoLightReasonId} className="mt-1 text-xs text-slate-300">{autoLightUnavailableReason}</p>}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* PART A: Multi-Chunk World Grid & Active Chunk Culling */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                5×5 Chunk Grid & FPS Culling
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                {chunkConfig.chunkSize}×{chunkConfig.chunkHeight || 16}×
                {chunkConfig.chunkSize}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Click any <span className="text-emerald-400 font-semibold">Unlocked Chunk</span> to toggle rendering ON/OFF for higher FPS, or click any <span className="text-amber-400 font-semibold">+ Empty Slot</span> to expand your world into bigger builds.
            </p>

            {/* Cell / Chunk Size, Height & Grid Subdivision Options Menu */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Cell / Chunk Size & Height Options
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">
                    Chunk W×D
                  </label>
                  <select
                    aria-label="Chunk Footprint Size"
                    value={chunkConfig.chunkSize}
                    onChange={(e) =>
                      onChangeChunkConfig({
                        ...chunkConfig,
                        chunkSize: parseInt(e.target.value, 10) || 16,
                      })
                    }
                    className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-100"
                  >
                    <option value={8}>8×8</option>
                    <option value={12}>12×12</option>
                    <option value={16}>16×16</option>
                    <option value={24}>24×24</option>
                    <option value={32}>32×32</option>
                    <option value={48}>48×48</option>
                    <option value={64}>64×64</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">
                    Chunk Height
                  </label>
                  <select
                    aria-label="Chunk Vertical Height"
                    value={chunkConfig.chunkHeight || 16}
                    onChange={(e) =>
                      onChangeChunkConfig({
                        ...chunkConfig,
                        chunkHeight: parseInt(e.target.value, 10) || 16,
                      })
                    }
                    className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-100"
                  >
                    <option value={6}>6 blk</option>
                    <option value={12}>12 blk</option>
                    <option value={16}>16 blk</option>
                    <option value={32}>32 blk</option>
                    <option value={64}>64 blk</option>
                    <option value={128}>128 blk</option>
                    <option value={256}>256 blk</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">
                    Cell Grid
                  </label>
                  <select
                    aria-label="Grid Cell Step Size"
                    value={chunkConfig.cellSubdivision || 1}
                    onChange={(e) =>
                      onChangeChunkConfig({
                        ...chunkConfig,
                        cellSubdivision: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-100"
                  >
                    <option value={0.25}>0.25×</option>
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1.0×</option>
                    <option value={2}>2.0×</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Live Render & Culling Telemetry */}
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
              <div>
                <span className="text-emerald-400 font-bold">
                  {chunkStats.renderedBlocks}
                </span>
                <span className="text-slate-400"> rendered</span>
                {chunkStats.hibernatedBlocks > 0 && (
                  <span className="text-amber-400 ml-1.5">
                    ({chunkStats.hibernatedBlocks} paused)
                  </span>
                )}
              </div>
              <span className="text-cyan-300 font-semibold">
                {chunkStats.savingsPercent > 0
                  ? `-${chunkStats.savingsPercent}% GPU Load`
                  : '100% Active'}
              </span>
            </div>

            {/* Expansion Pad Preset Selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                New Chunk Expansion Style
              </label>
              <select
                value={expansionStyle}
                onChange={(e) =>
                  setExpansionStyle(e.target.value as ChunkExpansionStyle)
                }
                aria-label="New Chunk Expansion Style"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="grass_island">
                  Skyblock Grass Island Pad (10×10 + Lantern)
                </option>
                <option value="stone_foundation">
                  Architectural Stone Foundation (12×12)
                </option>
                <option value="timber_deck">
                  Hewn Oak Timber Deck + Piers (12×12)
                </option>
                <option value="empty_grid">
                  Open Air Grid + 2×2 Anchor Stone
                </option>
              </select>
            </div>

            {/* Interactive 5x5 Chunk Map (-2..+2) */}
            <div className="grid grid-cols-5 gap-1.5">
              {[-2, -1, 0, 1, 2].map((cz) =>
                [-2, -1, 0, 1, 2].map((cx) => {
                  const k = chunkKey(cx, cz);
                  const count = chunkStats.countsByChunk[k] || 0;
                  const isUnlocked =
                    chunkConfig.unlockedChunks.includes(k) || count > 0;
                  const isActive =
                    isUnlocked && chunkConfig.activeChunks[k] !== false;

                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleToggleChunkCell(cx, cz)}
                      title={
                        isUnlocked
                          ? `Chunk (${cx}, ${cz}) — ${count} blocks. Click to ${
                              isActive
                                ? 'Hibernate (Pause Rendering)'
                                : 'Activate Rendering'
                            }`
                          : `Click to Expand Build into Chunk (${cx}, ${cz})`
                      }
                      className={`h-12 rounded-lg border text-[10px] font-mono flex flex-col items-center justify-center transition-all ${
                        !isUnlocked
                          ? 'bg-slate-900/60 border-slate-800/80 text-slate-500 hover:border-amber-400/60 hover:text-amber-300'
                          : isActive
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm'
                            : 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      }`}
                    >
                      <span className="font-bold">
                        {cx},{cz}
                      </span>
                      {isUnlocked ? (
                        <span className="text-[9px] flex items-center gap-0.5">
                          {isActive ? (
                            <>
                              <Eye className="w-2.5 h-2.5" />
                              <span>{count}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-2.5 h-2.5" />
                              <span>OFF</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[9px] flex items-center gap-0.5">
                          <Plus className="w-2.5 h-2.5" />
                          <span>Add</span>
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Batch Chunk Toggles & Distance Culling */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleActivateAllChunks}
                className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-emerald-300"
              >
                Activate All
              </button>
              <button
                type="button"
                onClick={handleHibernateOuterChunks}
                className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-amber-300"
              >
                Focus Center (0,0)
              </button>
            </div>

            <div className="space-y-1 pt-1 border-t border-slate-800/80">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Auto Render Distance (Chunk Radius)</span>
                <span className="font-mono text-slate-200">
                  {chunkConfig.autoCullDistanceChunks === 0
                    ? 'All Active'
                    : `${chunkConfig.autoCullDistanceChunks} Chunks`}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={chunkConfig.autoCullDistanceChunks}
                onChange={(e) =>
                  onChangeChunkConfig({
                    ...chunkConfig,
                    autoCullDistanceChunks: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                onChangeChunkConfig({
                  ...chunkConfig,
                  showChunkBorders: !chunkConfig.showChunkBorders,
                })
              }
              className={`w-full py-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${
                chunkConfig.showChunkBorders
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <span>Show 3D Chunk Borders & Grids</span>
              <span className="font-mono text-[10px]">
                {chunkConfig.showChunkBorders ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* PART B: Smart Pattern Variation & Connected-Neighbor Art Matcher */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Smart Pattern & Art Matcher
              </span>
              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: !patternConfig.enabled,
                  })
                }
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  patternConfig.enabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {patternConfig.enabled ? 'ENABLED' : 'OFF'}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Synthesizes multi-resolution connected voxel art (Voronoi chiseled stone, kiln bricks, timber grain, and 6-face grass-over-loam skirts) that bridges seamlessly across touching block faces.
            </p>

            {/* Pixels Per Block Resolution Scaling (16x / 32x / 64x HD) */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Pixels Per Block (Texel Density)
                </span>
                <span className="font-mono text-[10px] text-slate-300">
                  {patternConfig.pixelsPerBlock || 64}×
                  {patternConfig.pixelsPerBlock || 64} px
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
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
                      className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold transition-colors ${
                        active
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {px === 64 ? '64×64 HD' : `${px}×${px} px`}
                    </button>
                  );
                })}
              </div>

              {/* Art Style Selector */}
              <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  Connected Art Style Mode
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'pixel_art_hd', label: 'HD Pixel Art' },
                      { id: 'chiseled_pbr', label: 'Chiseled PBR' },
                      { id: 'hand_painted', label: 'Soft Painted' },
                    ] as const
                  ).map((mode) => {
                    const active =
                      (patternConfig.artStyle || 'pixel_art_hd') === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          onChangePatternConfig({
                            ...patternConfig,
                            artStyle: mode.id,
                          })
                        }
                        className={`py-1 px-1.5 rounded border text-[10px] font-semibold transition-colors ${
                          active
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4x4 World-Space Mega-Spritemap & Smart Placement Prediction Toggles */}
              <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChangePatternConfig({
                      ...patternConfig,
                      megaSpritemapMode:
                        patternConfig.megaSpritemapMode === false ? true : false,
                    })
                  }
                  className={`w-full py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between ${
                    patternConfig.megaSpritemapMode !== false
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>4×4 World-Space Mega-Spritemap</span>
                  <span className="font-mono text-[10px]">
                    {patternConfig.megaSpritemapMode !== false ? 'ACTIVE' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangePatternConfig({
                      ...patternConfig,
                      smartPlacementPrediction:
                        patternConfig.smartPlacementPrediction === false
                          ? true
                          : false,
                    })
                  }
                  className={`w-full py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between ${
                    patternConfig.smartPlacementPrediction !== false
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span>Placement Predictor (Seek Color/Pattern)</span>
                  <span className="font-mono text-[10px]">
                    {patternConfig.smartPlacementPrediction !== false
                      ? 'ON'
                      : 'OFF'}
                  </span>
                </button>

                <div className="space-y-1 pt-0.5">
                  <label className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Color Similarity Seek Threshold (ΔE)</span>
                    <span className="font-mono text-cyan-300">
                      ≤{patternConfig.colorSimilarityThreshold ?? 45} ΔE
                    </span>
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={80}
                    step={5}
                    value={patternConfig.colorSimilarityThreshold ?? 45}
                    onChange={(e) =>
                      onChangePatternConfig({
                        ...patternConfig,
                        colorSimilarityThreshold: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: true,
                    pixelsPerBlock: 64,
                    artStyle: 'pixel_art_hd',
                    hueShiftSpread: 3,
                    luminanceJitter: 0.04,
                    roughnessVariance: 0.08,
                    spatialScale: 0.75,
                    seamBlendStrength: 0.85,
                    weatheringMossIntensity: 0.25,
                    uvAutoRotate: true,
                  })
                }
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-200 text-left"
              >
                <span className="text-amber-400 block">HD Voxel Art (64×)</span>
                <span className="text-slate-400 text-[9px]">
                  Crisp CTM stone, wood & turf
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: true,
                    pixelsPerBlock: 32,
                    artStyle: 'chiseled_pbr',
                    hueShiftSpread: 2,
                    luminanceJitter: 0.03,
                    roughnessVariance: 0.06,
                    spatialScale: 0.6,
                    seamBlendStrength: 0.92,
                    weatheringMossIntensity: 0.1,
                    uvAutoRotate: true,
                  })
                }
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-200 text-left"
              >
                <span className="text-cyan-400 block">Chiseled Masonry (32×)</span>
                <span className="text-slate-400 text-[9px]">
                  Deep bevels & seamless joints
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: true,
                    pixelsPerBlock: 64,
                    artStyle: 'pixel_art_hd',
                    hueShiftSpread: 9,
                    luminanceJitter: 0.09,
                    roughnessVariance: 0.18,
                    spatialScale: 1.1,
                    seamBlendStrength: 0.8,
                    weatheringMossIntensity: 0.65,
                    uvAutoRotate: true,
                  })
                }
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-200 text-left"
              >
                <span className="text-emerald-400 block">Ancient Ruins</span>
                <span className="text-slate-400 text-[9px]">
                  Rich moss patina & weathering
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    enabled: false,
                  })
                }
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-200 text-left"
              >
                <span className="text-slate-300 block">Uniform Standard</span>
                <span className="text-slate-400 text-[9px]">
                  Unvaried base block colors
                </span>
              </button>
            </div>

            {/* Evolution Seed & Auto-Looping Controls */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-200">
                  Pattern Seed #{patternConfig.seed}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChangePatternConfig({
                        ...patternConfig,
                        seed: patternConfig.seed + 1,
                        evolutionPhase:
                          (patternConfig.evolutionPhase + 0.65) % (Math.PI * 2),
                      })
                    }
                    className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Evolve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangePatternConfig({
                        ...patternConfig,
                        autoEvolveLoop: !patternConfig.autoEvolveLoop,
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      patternConfig.autoEvolveLoop
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {patternConfig.autoEvolveLoop ? 'Preview ON' : 'Animate preview'}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Saved Pattern Phase (0°–360°)</span>
                  <span className="font-mono text-slate-200">
                    {Math.round(
                      (patternConfig.evolutionPhase / (Math.PI * 2)) * 360
                    )}
                    °
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={6.28}
                  step={0.15}
                  value={patternConfig.evolutionPhase}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      evolutionPhase: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Granular Sliders */}
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Connected-Side Seam Matcher</span>
                  <span className="font-mono text-amber-300">
                    {Math.round(patternConfig.seamBlendStrength * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={patternConfig.seamBlendStrength}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      seamBlendStrength: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Organic Hue Variation Spread</span>
                  <span className="font-mono text-slate-200">
                    ±{patternConfig.hueShiftSpread}°
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={patternConfig.hueShiftSpread}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      hueShiftSpread: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Luminance / Value Contrast</span>
                  <span className="font-mono text-slate-200">
                    {Math.round(patternConfig.luminanceJitter * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={patternConfig.luminanceJitter}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      luminanceJitter: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Surface Roughness Variance</span>
                  <span className="font-mono text-slate-200">
                    {Math.round(patternConfig.roughnessVariance * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.35}
                  step={0.02}
                  value={patternConfig.roughnessVariance}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      roughnessVariance: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>3D Pattern Cluster Wavelength</span>
                  <span className="font-mono text-slate-200">
                    {patternConfig.spatialScale.toFixed(2)}x
                  </span>
                </label>
                <input
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.05}
                  value={patternConfig.spatialScale}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      spatialScale: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Weathering & Crevice Moss</span>
                  <span className="font-mono text-emerald-400">
                    {Math.round(patternConfig.weatheringMossIntensity * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={patternConfig.weatheringMossIntensity}
                  onChange={(e) =>
                    onChangePatternConfig({
                      ...patternConfig,
                      weatheringMossIntensity: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onChangePatternConfig({
                    ...patternConfig,
                    uvAutoRotate: !patternConfig.uvAutoRotate,
                  })
                }
                className={`w-full py-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${
                  patternConfig.uvAutoRotate
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <span>Auto-Rotate UV Orientations</span>
                <span className="font-mono text-[10px]">
                  {patternConfig.uvAutoRotate ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GIT VERSION CONTROL & COMMIT GRAPH */}
      {activeTab === 'git' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-100 font-mono">
                  branch: main
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                HEAD · {gitCommits[0]?.hash || 'init'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Create Git-style snapshots of your world structure. Checkout any commit node below to non-destructively revert or branch your build.
            </p>

            <div className="flex gap-1.5">
              <input
                type="text"
                value={commitMessageInput}
                onChange={(e) => setCommitMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onCreateGitCommit(commitMessageInput.trim() || undefined);
                    setCommitMessageInput('');
                  }
                }}
                placeholder="Commit message (e.g. Added stone arches)..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => {
                  onCreateGitCommit(commitMessageInput.trim() || undefined);
                  setCommitMessageInput('');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0"
              >
                <GitCommit className="w-3.5 h-3.5" />
                <span>Commit</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Commit History Log ({gitCommits.length})
            </span>

            <div className="relative pl-4 border-l-2 border-slate-800 space-y-2.5">
              {gitCommits.map((commit, index) => (
                <div
                  key={commit.id}
                  className={`relative p-2.5 rounded-xl border transition-colors ${
                    commit.id === activeCommitId
                      ? 'bg-slate-950 border-amber-500/60'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full absolute -left-[21px] top-3.5 border-2 ${
                      commit.id === activeCommitId
                        ? 'bg-amber-400 border-slate-950'
                        : 'bg-slate-700 border-slate-950'
                    }`}
                  />

                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-400">
                        {commit.hash}
                      </code>
                      {index === 0 && (
                        <span className="text-[10px] font-mono font-semibold text-emerald-400">
                          HEAD
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(commit.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-100 mb-1.5">
                    {commit.message}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-slate-400">
                        {commit.blockCount} blocks
                      </span>
                      <span className="text-emerald-400">
                        +{commit.addedDelta}
                      </span>
                      <span className="text-rose-400">
                        -{commit.removedDelta}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onCheckoutGitCommit(commit)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[10px] font-semibold text-slate-200 flex items-center gap-1 transition-colors"
                    >
                      {commit.id === activeCommitId ? (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Checkout</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DYNAMIC LIGHTING STUDIO INSPECTOR */}
      {activeTab === 'lighting' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Solar Time & Presets
              </span>
              <span className="font-mono text-xs font-bold text-slate-100">
                {formatTimeOfDay(lightingConfig.timeOfDay)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({ ...lightingConfig, timeOfDay: 6.5 })
                }
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-[10px] font-semibold text-slate-200 flex flex-col items-center gap-1"
              >
                <Sunrise className="w-3.5 h-3.5 text-amber-300" />
                <span>Dawn</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({ ...lightingConfig, timeOfDay: 12.5 })
                }
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-[10px] font-semibold text-slate-200 flex flex-col items-center gap-1"
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Noon</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({ ...lightingConfig, timeOfDay: 18.2 })
                }
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-[10px] font-semibold text-slate-200 flex flex-col items-center gap-1"
              >
                <Sunset className="w-3.5 h-3.5 text-orange-400" />
                <span>Sunset</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeLightingConfig({ ...lightingConfig, timeOfDay: 0.5 })
                }
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-[10px] font-semibold text-slate-200 flex flex-col items-center gap-1"
              >
                <Moon className="w-3.5 h-3.5 text-indigo-300" />
                <span>Night</span>
              </button>
            </div>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Solar Time (24h Cycle)</span>
                <span className="font-mono text-slate-200">
                  {formatTimeOfDay(lightingConfig.timeOfDay)}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={24}
                step={0.25}
                value={lightingConfig.timeOfDay}
                onChange={(e) =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    timeOfDay: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Sun Azimuth Angle
                </span>
                <span className="font-mono text-slate-200">
                  {lightingConfig.sunAzimuth}°
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={lightingConfig.sunAzimuth}
                onChange={(e) =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    sunAzimuth: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
              Intensity & Atmosphere
            </span>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Direct Sun Intensity</span>
                <span className="font-mono text-slate-200">
                  {lightingConfig.sunIntensity.toFixed(1)}x
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={lightingConfig.sunIntensity}
                onChange={(e) =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    sunIntensity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Ambient Sky Fill</span>
                <span className="font-mono text-slate-200">
                  {lightingConfig.ambientIntensity.toFixed(1)}x
                </span>
              </label>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={lightingConfig.ambientIntensity}
                onChange={(e) =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    ambientIntensity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Atmospheric Distance Fog</span>
                <span className="font-mono text-slate-200">
                  {Math.round(lightingConfig.fogDensity * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={lightingConfig.fogDensity}
                onChange={(e) =>
                  onChangeLightingConfig({
                    ...lightingConfig,
                    fogDensity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
              Real-Time Shadows & Point Lights
            </span>

            <button
              type="button"
              onClick={() =>
                onChangeLightingConfig({
                  ...lightingConfig,
                  shadowsEnabled: !lightingConfig.shadowsEnabled,
                })
              }
              className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                lightingConfig.shadowsEnabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <div>
                <div className="text-xs font-semibold">
                  Directional Sun Shadow Map
                </div>
                <div className="text-[10px] text-slate-400">
                  2048×2048 soft PCF shadows cast by blocks
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase">
                {lightingConfig.shadowsEnabled ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onChangeLightingConfig({
                  ...lightingConfig,
                  pointLightsEnabled: !lightingConfig.pointLightsEnabled,
                })
              }
              className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                lightingConfig.pointLightsEnabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <div>
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  Emissive Block Point Lights
                </div>
                <div className="text-[10px] text-slate-400">
                  Sea Lanterns & Glowing Blocks illuminate surroundings
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase">
                {lightingConfig.pointLightsEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (isFloating) {
    return (
      <DraggableWindow
        windowId="inspector_legend_window"
        title="Studio Inspector & Command Legend"
        subtitle={activeTab.toUpperCase()}
        defaultWidth={360}
        defaultHeight={640}
        minWidth={260}
        minHeight={280}
        defaultX={
          typeof window !== 'undefined'
            ? Math.max(20, window.innerWidth - 385)
            : 880
        }
        defaultY={96}
        defaultPinnedFloating={true}
        onClose={() => onSelectTab('closed')}
        onDockSidebar={onToggleFloating}
        dockButtonLabel="Dock Right"
        testId="floating-inspector-window"
      >
        {innerInspectorContent}
      </DraggableWindow>
    );
  }

  return (
    <aside
      aria-label="Studio Inspector and Built-In Command Legend"
      style={{ width: `${dockedWidth}px` }}
      className="relative bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 z-20 select-none overflow-hidden absolute lg:relative inset-y-0 right-0 shadow-2xl lg:shadow-none"
    >
      {/* Drag-Resize Left Splitter Handle when Docked */}
      {onResizeDockedWidth && (
        <div
          data-testid="right-sidebar-resize-splitter"
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
              240,
              Math.min(
                480,
                resizeDragRef.current.startW -
                  (e.clientX - resizeDragRef.current.startX)
              )
            );
            onResizeDockedWidth(nextW);
          }}
          onPointerUp={() => {
            resizeDragRef.current = null;
          }}
          title="Drag edge to resize Inspector Sidebar width"
          className="hidden lg:block absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-amber-400/50 transition-colors z-30"
        />
      )}
      {innerInspectorContent}
    </aside>
  );
};
