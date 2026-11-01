import React, { useEffect, useMemo, useState } from 'react';
import {
  CustomBlockDefinition,
  PlacedBlock,
  SavedStudioProject,
  WorldChunkConfig,
  WorldResetTemplateId,
} from '../engine/types';
import { countBlocksPerChunk } from '../engine/openSourceBlockMarket';
import {
  StorageQuotaEstimate,
  estimateStudioStorageQuota,
} from '../lib/indexedDbStorage';
import { useOnlineStatus, usePWAInstall } from '../lib/pwaInstallAndOffline';
import { DraggableWindow } from './DraggableWindow';
import {
  CheckCircle2,
  Database,
  Download,
  Flag,
  FolderKanban,
  Grid,
  HardDrive,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

interface MainMenuProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  worldName: string;
  onChangeWorldName: (name: string) => void;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  chunkConfig: WorldChunkConfig;
  savedProjects: SavedStudioProject[];
  onSaveProjectSlot: (name: string, description: string, overwriteId?: string) => void;
  onLoadProjectSlot: (project: SavedStudioProject) => void;
  onDeleteProjectSlot: (projectId: string) => void;
  onImportProjectJson: (rawJson: string) => boolean;
  onResetEntireWorld: (templateId: WorldResetTemplateId) => void;
  onResetSpecificChunk: (
    cx: number,
    cz: number,
    action:
      | 'clear_air'
      | 'grass_island'
      | 'stone_foundation'
      | 'timber_deck'
      | 'sandstone_plaza'
  ) => void;
  onOpenDriveBackupModal: () => void;
  onOpenBlockMarketModal: () => void;
  isSignedIn?: boolean;
  userEmail?: string | null;
  reportedWorldIds?: string[];
  onReportOrBlockWorld?: (worldIdOrRoomCode: string) => void;
  onClearReportedWorlds?: () => void;
  onPurgeLocalAndCloudAccountData?: () => Promise<string>;
}

const WORLD_TEMPLATES: {
  id: WorldResetTemplateId;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    id: 'starter_skyblock',
    name: 'Starter Skyblock Island',
    badge: 'Classic',
    description:
      'Multi-layered turf and cobblestone floating island with starter tree, beacon, and terrain.',
  },
  {
    id: 'citadel_plaza',
    name: 'Citadel Stone Foundation',
    badge: 'Architectural',
    description:
      'Flat 12×12 cut-stone masonry plaza at Y=0 ready for castle walls, arches, and towers.',
  },
  {
    id: 'timber_homestead',
    name: 'Nordic Timber Deck',
    badge: 'Woodcraft',
    description:
      'Warm 12×12 oak plank deck ideal for lodges, Tudor cottages, and workshops.',
  },
  {
    id: 'cyber_grid',
    name: 'Cyber Titanium & Neon Grid',
    badge: 'Sci-Fi',
    description:
      'Brushed titanium platform with glowing neon corner beacons for futuristic builds.',
  },
  {
    id: 'empty_void',
    name: 'Clean Void (Single Origin Stone)',
    badge: 'Minimal',
    description:
      'Clears the entire world except for a single origin anchor block at (0, 0, 0).',
  },
];

export const MainMenuProjectModal: React.FC<MainMenuProjectModalProps> = ({
  isOpen,
  onClose,
  worldName,
  onChangeWorldName,
  blocks,
  chunkConfig,
  savedProjects,
  onSaveProjectSlot,
  onLoadProjectSlot,
  onDeleteProjectSlot,
  onImportProjectJson,
  onResetEntireWorld,
  onResetSpecificChunk,
  onOpenDriveBackupModal,
  onOpenBlockMarketModal,
  isSignedIn = false,
  userEmail = null,
  reportedWorldIds = [],
  onReportOrBlockWorld,
  onClearReportedWorlds,
  onPurgeLocalAndCloudAccountData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'projects' | 'reset' | 'compliance'
  >('projects');
  const [projectTitleInput, setProjectTitleInput] = useState(worldName);
  const [projectDescInput, setProjectDescInput] = useState(
    'Architectural build in LFS Block Studio'
  );
  const [importJsonText, setImportJsonText] = useState('');
  const [selectedChunk, setSelectedChunk] = useState<{ cx: number; cz: number }>({
    cx: 0,
    cz: 0,
  });
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] =
    useState<StorageQuotaEstimate | null>(null);
  const [reportRoomInput, setReportRoomInput] = useState('');
  const [confirmPurgeArmed, setConfirmPurgeArmed] = useState(false);
  const [isPurgingData, setIsPurgingData] = useState(false);

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();

  useEffect(() => {
    if (!isOpen) return;
    estimateStudioStorageQuota().then(setStorageEstimate);
  }, [isOpen, savedProjects.length]);

  const chunkCounts = useMemo(
    () => countBlocksPerChunk(blocks, chunkConfig.chunkSize),
    [blocks, chunkConfig.chunkSize]
  );

  if (!isOpen) return null;

  const totalBlocks = Object.keys(blocks).length;
  const selectedChunkKey = `${selectedChunk.cx},${selectedChunk.cz}`;
  const selectedChunkBlockCount = chunkCounts[selectedChunkKey] || 0;

  const handleSaveNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = projectTitleInput.trim() || worldName || 'Untitled Project';
    onChangeWorldName(cleanName);
    onSaveProjectSlot(cleanName, projectDescInput.trim());
    setStatusBanner(`Saved project "${cleanName}" (${totalBlocks} blocks).`);
  };

  const handleExportProjectFile = (proj: SavedStudioProject) => {
    const json = JSON.stringify(proj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.lfsproj.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DraggableWindow
      windowId="main_menu_project_window"
      title="LFS Block Studio — Main Menu, Project Manager & App Store Center"
      subtitle={`${totalBlocks} blocks · IndexedDB High-Capacity Storage`}
      defaultWidth={980}
      defaultHeight={680}
      minWidth={350}
      minHeight={300}
      onClose={onClose}
      testId="main-menu-project-modal"
      headerActions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenBlockMarketModal();
            }}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold whitespace-nowrap hidden sm:inline-flex"
          >
            CC0 Block Market
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDriveBackupModal();
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold hidden md:flex items-center gap-1 whitespace-nowrap"
          >
            <HardDrive className="w-3 h-3 text-emerald-400" />
            <span>Drive Backup</span>
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Navigation Tabs */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="main-menu-tab-projects"
              onClick={() => setActiveTab('projects')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'projects'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Save / Load Projects ({savedProjects.length})</span>
            </button>

            <button
              type="button"
              data-testid="main-menu-tab-reset"
              onClick={() => setActiveTab('reset')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'reset'
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Center (World or Specific Chunk)</span>
            </button>

            <button
              type="button"
              data-testid="main-menu-tab-compliance"
              onClick={() => setActiveTab('compliance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'compliance'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Storage, Offline PWA & App Store Compliance</span>
            </button>
          </div>

          {statusBanner && (
            <span className="text-xs font-mono text-emerald-400">
              {statusBanner}
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'projects' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 5 cols: Save Current Project & Import JSON */}
              <div className="lg:col-span-5 space-y-4">
                <form
                  onSubmit={handleSaveNewProject}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5" />
                      Save Current Build to Project Slot
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {totalBlocks} blocks
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={projectTitleInput}
                      onChange={(e) => setProjectTitleInput(e.target.value)}
                      placeholder="e.g., Highland Castle Citadel"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Notes / Description
                    </label>
                    <input
                      type="text"
                      value={projectDescInput}
                      onChange={(e) => setProjectDescInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <button
                    type="submit"
                    data-testid="save-new-project-slot-btn"
                    className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save as New Project Slot</span>
                  </button>
                </form>

                {/* Import Portable Project JSON */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Import Project JSON (.lfsproj.json)
                  </h3>
                  <textarea
                    rows={3}
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder="Paste exported .lfsproj.json content here..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!importJsonText.trim()) return;
                      const ok = onImportProjectJson(importJsonText.trim());
                      setStatusBanner(
                        ok
                          ? 'Imported project slot successfully!'
                          : 'Invalid project JSON format.'
                      );
                      if (ok) setImportJsonText('');
                    }}
                    className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300"
                  >
                    Import into Project Slots
                  </button>
                </div>
              </div>

              {/* Right 7 cols: Saved Project Slots List */}
              <div className="lg:col-span-7 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Saved Studio Projects ({savedProjects.length})
                </h3>

                {savedProjects.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                    No saved project slots yet. Click{' '}
                    <strong className="text-amber-300">
                      Save as New Project Slot
                    </strong>{' '}
                    on the left to store your first named build!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {savedProjects.map((proj) => (
                      <div
                        key={proj.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-100 truncate">
                              {proj.name}
                            </h4>
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300">
                              {proj.blockCount} blocks
                            </span>
                            <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                              {proj.unlockedChunksCount} chunks
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {proj.description}
                          </p>
                          <span className="text-[10px] font-mono text-slate-500">
                            Saved {new Date(proj.updatedAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onLoadProjectSlot(proj);
                              setStatusBanner(`Loaded project "${proj.name}".`);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>Load</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSaveProjectSlot(
                                proj.name,
                                proj.description,
                                proj.id
                              );
                              setStatusBanner(
                                `Updated project "${proj.name}" with current build.`
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                            title="Overwrite this project slot with current world"
                          >
                            Overwrite
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportProjectFile(proj)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300"
                            title="Download .lfsproj.json file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteProjectSlot(proj.id)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                            title="Delete project slot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reset' && (
            /* TAB 2: RESET CENTER (ENTIRE WORLD OR CHUNK-SPECIFIC RESET) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 6 cols: Reset Entire World to Template */}
              <div className="lg:col-span-6 space-y-3">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4" />
                      1. Reset Entire World (Undo-Safe)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Replaces the entire world with a clean architectural
                      starter template. Automatically creates an Undo snapshot
                      so you can press{' '}
                      <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px]">
                        Ctrl+Z
                      </kbd>{' '}
                      if needed.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {WORLD_TEMPLATES.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-100">
                              {tpl.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-amber-300">
                              {tpl.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {tpl.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          data-testid={`reset-world-template-${tpl.id}`}
                          onClick={() => {
                            onResetEntireWorld(tpl.id);
                            setStatusBanner(`Reset world to ${tpl.name}.`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 hover:text-white border border-rose-500/40 text-rose-300 font-bold text-xs shrink-0 transition-colors"
                        >
                          Reset World
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right 6 cols: Chunk-Specific Reset Map (5×5 Interactive Grid) */}
              <div className="lg:col-span-6 space-y-3">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Grid className="w-4 h-4" />
                        2. Chunk-Specific Reset Map (5×5 Grid)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Select any single chunk ({chunkConfig.chunkSize}×
                        {chunkConfig.chunkSize}) to clear or rebuild its
                        foundation without touching neighboring chunks.
                      </p>
                    </div>
                  </div>

                  {/* 5x5 Interactive Chunk Selector */}
                  <div className="grid grid-cols-5 gap-1.5 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    {[-2, -1, 0, 1, 2].map((cz) =>
                      [-2, -1, 0, 1, 2].map((cx) => {
                        const k = `${cx},${cz}`;
                        const cnt = chunkCounts[k] || 0;
                        const isSel =
                          selectedChunk.cx === cx && selectedChunk.cz === cz;
                        const isUnlocked =
                          chunkConfig.unlockedChunks.includes(k);

                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setSelectedChunk({ cx, cz })}
                            className={`p-2 rounded-lg border text-center transition-all ${
                              isSel
                                ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-bold ring-2 ring-cyan-400/50'
                                : cnt > 0
                                  ? 'bg-slate-950 text-slate-100 border-emerald-500/40 hover:border-cyan-400'
                                  : isUnlocked
                                    ? 'bg-slate-950/80 text-slate-300 border-slate-700'
                                    : 'bg-slate-950/40 text-slate-500 border-slate-800/70'
                            }`}
                          >
                            <div className="text-[10px] font-mono">
                              ({cx},{cz})
                            </div>
                            <div
                              className={`text-[10px] font-mono font-bold ${
                                isSel
                                  ? 'text-slate-950'
                                  : cnt > 0
                                    ? 'text-emerald-400'
                                    : 'text-slate-500'
                              }`}
                            >
                              {cnt} blk
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Actions for Selected Chunk */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-100">
                        Target Chunk ({selectedChunk.cx}, {selectedChunk.cz})
                      </span>
                      <span className="text-xs font-mono text-cyan-300">
                        {selectedChunkBlockCount} blocks inside chunk
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid="reset-chunk-clear-air-btn"
                        onClick={() => {
                          onResetSpecificChunk(
                            selectedChunk.cx,
                            selectedChunk.cz,
                            'clear_air'
                          );
                          setStatusBanner(
                            `Cleared Chunk (${selectedChunk.cx}, ${selectedChunk.cz}) to open air.`
                          );
                        }}
                        className="py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500 hover:text-white border border-rose-500/40 text-rose-300 font-bold text-xs"
                      >
                        Clear Chunk to Open Air
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onResetSpecificChunk(
                            selectedChunk.cx,
                            selectedChunk.cz,
                            'grass_island'
                          );
                          setStatusBanner(
                            `Reset Chunk (${selectedChunk.cx}, ${selectedChunk.cz}) to Grass Island Pad.`
                          );
                        }}
                        className="py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/40 text-emerald-300 font-bold text-xs"
                      >
                        Reset to Grass Island Pad
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onResetSpecificChunk(
                            selectedChunk.cx,
                            selectedChunk.cz,
                            'stone_foundation'
                          );
                          setStatusBanner(
                            `Reset Chunk (${selectedChunk.cx}, ${selectedChunk.cz}) to Stone Foundation.`
                          );
                        }}
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
                      >
                        Reset to Stone Foundation
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onResetSpecificChunk(
                            selectedChunk.cx,
                            selectedChunk.cz,
                            'timber_deck'
                          );
                          setStatusBanner(
                            `Reset Chunk (${selectedChunk.cx}, ${selectedChunk.cz}) to Timber Deck.`
                          );
                        }}
                        className="py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-300 font-semibold text-xs"
                      >
                        Reset to Timber Deck
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            /* TAB 3: BOUNDLESS INDEXEDDB STORAGE, OFFLINE PWA & APP STORE COMPLIANCE */
            <div
              data-testid="compliance-tab-panel"
              className="grid grid-cols-1 lg:grid-cols-12 gap-5"
            >
              {/* Left 6 cols: IndexedDB Storage Telemetry & Offline-First PWA */}
              <div className="lg:col-span-6 space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Database className="w-4 h-4" />
                      <span>IndexedDB High-Capacity Storage Engine</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                      Active · Auto-Migrated
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    All multi-chunk worlds, custom 8×8×8 chiseled blocks, Git
                    commits, and Copilot habit archives are persisted in
                    asynchronous IndexedDB storage without the 5 MB
                    localStorage ceiling.
                  </p>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Current Usage / Quota:</span>
                    <span className="text-amber-400 font-bold">
                      {storageEstimate
                        ? `${storageEstimate.usageFormatted} / ${storageEstimate.quotaFormatted}`
                        : '0.4 MB / 1.00 GB'}
                    </span>
                  </div>
                </div>

                {/* Offline-First PWA & Standalone App Installation */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4" />
                      <span>Standalone PWA & Offline Readiness</span>
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${
                        isOnline
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {isOnline ? (
                        <>
                          <Wifi className="w-3 h-3" />
                          <span>Online · SW Cached</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3 h-3" />
                          <span>Offline Mode Ready</span>
                        </>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    LFS Block Studio runs 100% offline with cached WebGL shaders,
                    procedural 47-tile CTM textures, and local Spatial Copilot
                    inference.
                  </p>

                  {isInstalled ? (
                    <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Installed as Standalone App on your device.
                      </span>
                    </div>
                  ) : isInstallable ? (
                    <button
                      type="button"
                      onClick={() => promptInstall()}
                      className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Install Standalone LFS Studio App</span>
                    </button>
                  ) : isIOS ? (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                      On iOS/iPadOS Safari: tap <strong>Share</strong> →{' '}
                      <strong>Add to Home Screen</strong> for full-screen native
                      touch studio mode.
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
                      Service Worker shell & Web App Manifest registered for
                      instant offline launch.
                    </div>
                  )}
                </div>

                {/* CC0 Open-Source Texture & License Attribution */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    CC0 1.0 Public Domain Texture & Engine Attributions
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All procedural 47-tile Connected Texture (CTM) atlases and
                    curated block market definitions are inspired by CC0 1.0
                    Universal Public Domain works from{' '}
                    <strong className="text-slate-200">
                      Kenney.nl Voxel Pack
                    </strong>
                    ,{' '}
                    <strong className="text-slate-200">
                      OpenGameArt CC0 Voxel Library
                    </strong>
                    ,{' '}
                    <strong className="text-slate-200">PolyHaven CC0</strong>,
                    and{' '}
                    <strong className="text-slate-200">
                      AmbientCG PBR Materials
                    </strong>
                    .
                  </p>
                </div>
              </div>

              {/* Right 6 cols: UGC Moderation & App Store Guideline 5.1.1(v) Account/Cloud Deletion */}
              <div className="lg:col-span-6 space-y-4">
                {/* Public Cloud World UGC Reporting & Blocking */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Flag className="w-4 h-4" />
                    <span>Public Cloud World UGC Safety & Moderation</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Hide or report any public multiplayer room code or blueprint
                    to filter it out of your cloud browser immediately.
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = reportRoomInput.trim();
                      if (!clean || !onReportOrBlockWorld) return;
                      onReportOrBlockWorld(clean);
                      setReportRoomInput('');
                      setStatusBanner(
                        `Reported & hidden room/world "${clean}" from public list.`
                      );
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={reportRoomInput}
                      onChange={(e) => setReportRoomInput(e.target.value)}
                      placeholder="Enter Room Code or World ID to block..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    />
                    <button
                      type="submit"
                      data-testid="report-ugc-world-btn"
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-300 font-bold text-xs shrink-0"
                    >
                      Report & Hide
                    </button>
                  </form>

                  {reportedWorldIds.length > 0 && (
                    <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-slate-400">
                      <span>
                        Hidden / Reported IDs: {reportedWorldIds.join(', ')}
                      </span>
                      {onClearReportedWorlds && (
                        <button
                          type="button"
                          onClick={onClearReportedWorlds}
                          className="text-cyan-400 hover:underline"
                        >
                          Clear Filter
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Apple Guideline 5.1.1(v) & Google Play Data Safety Account & Cloud Data Deletion */}
                <div className="p-4 rounded-xl bg-slate-950 border border-rose-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      <span>
                        Account & Cloud Data Deletion (App Store 5.1.1(v))
                      </span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {isSignedIn ? userEmail || 'Signed In' : 'Local Guest'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Permanently delete all of your published cloud worlds,
                    cloud blueprints, IndexedDB project slots, and local studio
                    archives, and revoke your active session.
                  </p>

                  {!confirmPurgeArmed ? (
                    <button
                      type="button"
                      data-testid="arm-delete-account-data-btn"
                      onClick={() => setConfirmPurgeArmed(true)}
                      className="w-full py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        Delete Account & Purge All Cloud / Local Studio Data...
                      </span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-2.5">
                      <p className="text-xs text-rose-200 font-semibold">
                        Confirm permanent deletion of all cloud worlds,
                        blueprints, and local IndexedDB studio data?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid="confirm-delete-account-data-btn"
                          disabled={isPurgingData}
                          onClick={async () => {
                            if (!onPurgeLocalAndCloudAccountData) return;
                            setIsPurgingData(true);
                            try {
                              const msg =
                                await onPurgeLocalAndCloudAccountData();
                              setStatusBanner(msg);
                            } finally {
                              setIsPurgingData(false);
                              setConfirmPurgeArmed(false);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs"
                        >
                          {isPurgingData
                            ? 'Purging Data...'
                            : 'Yes, Permanently Delete Everything'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPurgeArmed(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

