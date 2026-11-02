import React, { useMemo, useState } from 'react';
import {
  CustomBlockDefinition,
  MarketBlockCategory,
  ModularHudConfig,
  OpenSourceCreatorPackId,
  OpenSourceMarketBlock,
} from '../engine/types';
import {
  OPEN_SOURCE_CREATOR_PACKS,
  OPEN_SOURCE_MARKET_CATALOG,
} from '../engine/openSourceBlockMarket';
import {
  STUDIO_DRAG_MIME,
  serializeStudioDragPayload,
} from '../engine/windowLayoutEngine';
import { DraggableWindow } from './DraggableWindow';
import { sameBlueprintData } from '../engine/blueprintDefinitionSafety';
import type { StudioEditorResult } from '../lib/studioEditorSession';
import {
  Check,
  Download,
  Flame,
  GripVertical,
  Layers,
  PackagePlus,
  Search,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react';

interface BlockMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  customBlocks: Record<string, CustomBlockDefinition>;
  activeBlockId: string;
  onSelectBlockId: (id: string) => void;
  onInstallMarketBlocks: (defs: CustomBlockDefinition[]) => StudioEditorResult;
  onRemoveLibraryBlock?: (blockId: string) => void;
  hudConfig?: ModularHudConfig;
  usageCounts?: Record<string, number>;
  onAssignBlockToPrimarySlot: (blockId: string, slotIndex: number) => void;
  onOpenWorkshop: () => void;
}

const CATEGORY_LABELS: { id: 'all' | MarketBlockCategory; label: string }[] = [
  { id: 'all', label: 'All Materials' },
  { id: 'masonry', label: 'Masonry & Stone' },
  { id: 'timber', label: 'Timber & Wood' },
  { id: 'metals', label: 'Brushed Metals' },
  { id: 'glass_neon', label: 'Glass & Neon' },
  { id: 'nature_terrain', label: 'Nature & Turf' },
  { id: 'roofing_trim', label: 'Roofing & Arches' },
];

export const BlockMarketModal: React.FC<BlockMarketModalProps> = ({
  isOpen,
  onClose,
  customBlocks,
  activeBlockId,
  onSelectBlockId,
  onInstallMarketBlocks,
  onRemoveLibraryBlock,
  hudConfig,
  usageCounts,
  onAssignBlockToPrimarySlot,
  onOpenWorkshop,
}) => {
  const [selectedPack, setSelectedPack] = useState<
    'all' | OpenSourceCreatorPackId
  >('all');
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | MarketBlockCategory
  >('all');
  const [marketSearch, setMarketSearch] = useState('');
  const [librarySort, setLibrarySort] = useState<
    'most_used' | 'custom_first' | 'name'
  >('most_used');
  const [assigningBlockId, setAssigningBlockId] = useState<string | null>(null);
  const [installFeedback, setInstallFeedback] = useState<{ error: boolean; message: string } | null>(null);

  const effectiveUsageCounts = useMemo(
    () => hudConfig?.usageCounts || usageCounts || {},
    [hudConfig?.usageCounts, usageCounts]
  );

  const filteredMarketItems = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    return OPEN_SOURCE_MARKET_CATALOG.filter((item) => {
      if (selectedPack !== 'all' && item.creatorPackId !== selectedPack) {
        return false;
      }
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (q) {
        const hay = `${item.blockDef.name} ${item.creatorName} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selectedPack, selectedCategory, marketSearch]);

  const sortedLibraryBlocks = useMemo(() => {
    const list = Object.values(customBlocks);
    return [...list].sort((a, b) => {
      if (librarySort === 'most_used') {
        const diff =
          (effectiveUsageCounts[b.id] || 0) - (effectiveUsageCounts[a.id] || 0);
        if (diff !== 0) return diff;
      } else if (librarySort === 'custom_first') {
        if (Boolean(b.isCustom) !== Boolean(a.isCustom)) {
          return b.isCustom ? 1 : -1;
        }
      }
      return a.name.localeCompare(b.name);
    });
  }, [customBlocks, effectiveUsageCounts, librarySort]);

  if (!isOpen) return null;

  const install = (definitions: CustomBlockDefinition[]) => {
    const result = onInstallMarketBlocks(definitions);
    setInstallFeedback({ error: result.status === 'rejected', message: result.message ?? (result.status === 'applied' ? 'Added to your library. Undo restores the previous library.' : 'These definitions are already in your library.') });
    return result.status !== 'rejected';
  };
  const handleInstallAllFiltered = () => {
    const toInstall = filteredMarketItems
      .map((m) => m.blockDef)
      .filter((d) => !sameBlueprintData(customBlocks[d.id], d));
    install(toInstall);
  };

  return (
    <DraggableWindow
      windowId="block_market_window"
      title="Block catalogue & Studio Library"
      subtitle="Drag any block onto a Hotbar slot or click to equip"
      icon={<Store className="w-4 h-4 text-amber-400" />}
      defaultWidth={1080}
      defaultHeight={680}
      minWidth={360}
      minHeight={320}
      defaultPinnedFloating={true}
      onClose={onClose}
      testId="block-market-modal"
      headerActions={
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenWorkshop();
          }}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Custom Block Workshop</span>
        </button>
      }
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {installFeedback && <p role={installFeedback.error ? 'alert' : 'status'} className="px-4 py-2 text-sm">{installFeedback.message}</p>}
        {/* Double-Market Two-Pane Split View */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT PANE (7 cols): OPEN-SOURCE TEXTURE CREATOR MARKET */}
          <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/50">
            {/* Market Filters Bar */}
            <div className="p-3.5 border-b border-slate-800 space-y-2.5 shrink-0">
              <p className="text-xs text-slate-300">Built-in procedural presets with unverified provenance. These entries do not include downloaded provider texture packs.</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <PackagePlus className="w-4 h-4" />
                  1. Local preset collections ({filteredMarketItems.length}{' '}
                  blocks)
                </span>

                <button
                  type="button"
                  data-testid="market-install-all-btn"
                  onClick={handleInstallAllFiltered}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install Shown Pack to My Library</span>
                </button>
              </div>

              {/* Creator Pack Chips */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedPack('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    selectedPack === 'all'
                      ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  All collections
                </button>
                {OPEN_SOURCE_CREATOR_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setSelectedPack(pack.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      selectedPack === pack.id
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                    title={pack.description}
                  >
                    {pack.name}
                  </button>
                ))}
              </div>

              {/* Search & Material Category Row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Search basalt, marble, timber, copper, shoji, arch..."
                    className="w-full pl-8 pr-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <select
                  aria-label="Market Material Category"
                  value={selectedCategory}
                  onChange={(e) =>
                    setSelectedCategory(
                      e.target.value as 'all' | MarketBlockCategory
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
                >
                  {CATEGORY_LABELS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Market Block Cards Grid */}
            <div className="flex-1 overflow-y-auto p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-start">
              {filteredMarketItems.map((item: OpenSourceMarketBlock) => {
                const isInstalled = sameBlueprintData(customBlocks[item.blockDef.id], item.blockDef);
                const hasCollision = Object.hasOwn(customBlocks, item.blockDef.id) && !isInstalled;
                const isEquipped = activeBlockId === item.blockDef.id;

                return (
                  <div
                    key={item.blockDef.id}
                    draggable
                    onDragStart={(e) => {
                      if (!isInstalled) {
                        if (!install([item.blockDef])) { e.preventDefault(); return; }
                      }
                      const raw = serializeStudioDragPayload({
                        type: 'block',
                        targetId: item.blockDef.id,
                        label: item.blockDef.name,
                      });
                      e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
                      e.dataTransfer.setData('text/plain', raw);
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    title="Drag onto any Hotbar slot or click Add to Library"
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 cursor-grab active:cursor-grabbing ${
                      isInstalled
                        ? 'bg-slate-900/90 border-emerald-500/40'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* 3D Material Swatch */}
                      <div
                        className="w-10 h-10 rounded-xl border border-white/20 shadow-inner shrink-0 flex items-center justify-center font-mono text-[10px] font-bold text-white/90"
                        style={{ backgroundColor: item.blockDef.color }}
                      >
                        {item.blockDef.shape.slice(0, 3).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-xs font-bold text-slate-100 truncate">
                            {item.blockDef.name}
                          </h3>
                        </div>
                        <p className="text-[10px] text-cyan-300 font-medium truncate">
                          {item.creatorName} • {item.blockDef.texturePattern}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                      <span className="text-[10px] font-mono text-slate-400">
                        {hasCollision ? 'Definition ID conflict: existing blocks are preserved.' : item.license}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {!isInstalled ? (
                          <button
                            type="button"
                            onClick={() =>
                              install([item.blockDef])
                            }
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Add to Library</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBlockId(item.blockDef.id);
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 ${
                              isEquipped
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>
                              {isEquipped ? 'Equipped' : 'In Library (Use)'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANE (5 cols): MY ACTIVE STUDIO LIBRARY, MOST-USED & HOTBAR ASSIGNER */}
          <div className="lg:col-span-5 flex flex-col overflow-hidden bg-slate-900">
            <div className="p-3.5 border-b border-slate-800 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  2. My Studio Library ({sortedLibraryBlocks.length} blocks)
                </span>

                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'most_used', label: 'Most Used' },
                      { id: 'custom_first', label: 'Market/Custom' },
                      { id: 'name', label: 'A–Z' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLibrarySort(tab.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        librarySort === tab.id
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Click any block in your library to build with it immediately, or
                click <strong className="text-cyan-300">Hotbar 1–9</strong> to
                assign it to a shortcut key.
              </p>
            </div>

            {/* Active Library List */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
              {sortedLibraryBlocks.map((def) => {
                const useCount = effectiveUsageCounts[def.id] || 0;
                const isEquipped = activeBlockId === def.id;
                const isPickingSlot = assigningBlockId === def.id;

                return (
                  <div
                    key={def.id}
                    draggable
                    onDragStart={(e) => {
                      const raw = serializeStudioDragPayload({
                        type: 'block',
                        targetId: def.id,
                        label: def.name,
                      });
                      e.dataTransfer.setData(STUDIO_DRAG_MIME, raw);
                      e.dataTransfer.setData('text/plain', raw);
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    title="Drag onto any Hotbar slot or click to equip"
                    className={`p-2.5 rounded-xl border transition-all space-y-2 cursor-grab active:cursor-grabbing ${
                      isEquipped
                        ? 'bg-amber-500/15 border-amber-400'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBlockId(def.id)}
                        className="flex items-center gap-2 text-left min-w-0 flex-1"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span
                          className="w-8 h-8 rounded-lg border border-white/20 shrink-0 shadow-inner"
                          style={{ backgroundColor: def.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
                            <span>{def.name}</span>
                            {useCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-amber-300 flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5 text-amber-400" />
                                {useCount}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {def.shape} • {def.texturePattern || 'smooth_abs'} •{' '}
                            {def.materialFinish || 'matte'}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setAssigningBlockId(isPickingSlot ? null : def.id)
                          }
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${
                            isPickingSlot
                              ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                              : 'bg-slate-900 text-cyan-300 border-slate-700 hover:border-cyan-400'
                          }`}
                          title="Assign this block to Primary Hotbar slot 1–9"
                        >
                          Hotbar 1–9
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectBlockId(def.id);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
                        >
                          Use
                        </button>

                        {def.isCustom && onRemoveLibraryBlock && (
                          <button
                            type="button"
                            onClick={() => onRemoveLibraryBlock(def.id)}
                            className="p-1 rounded bg-slate-900 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"
                            title="Remove custom/market block from active library"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick 1..9 Slot Picker Row */}
                    {isPickingSlot && (
                      <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-cyan-300">
                          Pick Hotbar Slot:
                        </span>
                        <div className="flex items-center gap-1">
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((slotIdx) => (
                            <button
                              key={slotIdx}
                              type="button"
                              onClick={() => {
                                onAssignBlockToPrimarySlot(def.id, slotIdx);
                                setAssigningBlockId(null);
                              }}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 font-mono text-xs font-bold border border-slate-700"
                            >
                              {slotIdx + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
