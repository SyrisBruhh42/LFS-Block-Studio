import React, { useState } from 'react';
import {
  BlueprintPrefab,
  GridCoord,
  PlacedBlock,
} from '../engine/types';
import { getSelectionBounds, getSelectionDimensions } from '../engine/worldEditEngine';
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  FolderOpen,
  Globe,
  Layers,
  Stamp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface BlueprintsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blueprints: BlueprintPrefab[];
  pos1: GridCoord | null;
  pos2: GridCoord | null;
  blocks: Record<string, PlacedBlock>;
  onSaveSelectionBlueprint: (
    name: string,
    description: string,
    isPublic: boolean,
    captureWholeWorld: boolean
  ) => boolean;
  onEquipBlueprintStamp: (blueprint: BlueprintPrefab) => void;
  onPlaceBlueprintAtPos1: (blueprint: BlueprintPrefab) => void;
  onLoadBlueprintIntoNewWorld: (blueprint: BlueprintPrefab) => void;
  onDeleteBlueprint: (blueprintId: string) => void;
  onImportBlueprintJson: (rawJson: string) => boolean;
  onRefreshCloudBlueprints: () => void;
  isLoadingCloud: boolean;
}

export const BlueprintsModal: React.FC<BlueprintsModalProps> = ({
  isOpen,
  onClose,
  blueprints,
  pos1,
  pos2,
  blocks,
  onSaveSelectionBlueprint,
  onEquipBlueprintStamp,
  onPlaceBlueprintAtPos1,
  onLoadBlueprintIntoNewWorld,
  onDeleteBlueprint,
  onImportBlueprintJson,
  onRefreshCloudBlueprints,
  isLoadingCloud,
}) => {
  const [activeTab, setActiveTab] = useState<
    'all' | 'structures' | 'custom_blocks' | 'save_new' | 'import_json'
  >('all');
  const [bpName, setBpName] = useState('');
  const [bpDesc, setBpDesc] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [captureWholeWorld, setCaptureWholeWorld] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [importText, setImportText] = useState('');

  if (!isOpen) return null;

  // Count solid blocks inside Pos1..Pos2 selection
  let selectedBlockCount = 0;
  let selectionSizeLabel = 'No region selected';
  if (pos1 && pos2) {
    const b = getSelectionBounds(pos1, pos2);
    const dims = getSelectionDimensions(pos1, pos2);
    selectionSizeLabel = `${dims.lx}×${dims.ly}×${dims.lz} studs`;
    for (const blk of Object.values(blocks)) {
      const { x, y, z } = blk.position;
      if (
        x >= b.minX &&
        x <= b.maxX &&
        y >= b.minY &&
        y <= b.maxY &&
        z >= b.minZ &&
        z <= b.maxZ
      ) {
        selectedBlockCount++;
      }
    }
  }

  const totalWorldBlocks = Object.keys(blocks).length;

  const filteredBlueprints = blueprints.filter((bp) => {
    if (activeTab === 'structures') return bp.blueprintType === 'structure_blueprint';
    if (activeTab === 'custom_blocks') return bp.blueprintType === 'custom_block';
    return true;
  });

  const handleSaveStructureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bpName.trim()) {
      setFormFeedback({
        type: 'error',
        text: 'Please enter a name for the blueprint.',
      });
      return;
    }
    const ok = onSaveSelectionBlueprint(
      bpName.trim(),
      bpDesc.trim() || 'Saved structure blueprint',
      isPublic,
      captureWholeWorld
    );
    if (!ok) {
      setFormFeedback({
        type: 'error',
        text: 'No blocks found in the selected region. Adjust Pos1/Pos2 or choose "Capture Entire World Build".',
      });
      return;
    }
    setFormFeedback({
      type: 'success',
      text: `Saved blueprint "${bpName.trim()}" to your library!`,
    });
    setBpName('');
    setBpDesc('');
    setActiveTab('structures');
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      setFormFeedback({
        type: 'error',
        text: 'Paste a valid BrickForge Blueprint JSON string first.',
      });
      return;
    }
    const ok = onImportBlueprintJson(importText);
    if (ok) {
      setImportText('');
      setFormFeedback({
        type: 'success',
        text: 'Imported blueprint into your library!',
      });
      setActiveTab('all');
    } else {
      setFormFeedback({
        type: 'error',
        text: 'Invalid Blueprint JSON format.',
      });
    }
  };

  return (
    <DraggableWindow
      windowId="blueprints_window"
      isOpen={isOpen}
      onClose={onClose}
      title="Blueprints Library & Structure Prefabs"
      subtitle="Save selected 3D buildings as reusable blueprints, stamp structures, or load into a new world"
      icon={<Layers className="w-4 h-4 text-amber-400" />}
      defaultWidth={980}
      defaultHeight={660}
      minWidth={400}
      minHeight={340}
      zIndex={55}
      headerActions={
        <button
          type="button"
          onClick={onRefreshCloudBlueprints}
          className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          {isLoadingCloud ? 'Syncing Cloud...' : 'Sync Cloud Gallery'}
        </button>
      }
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        {/* Filter & Action Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-950/60 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'all'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              All Blueprints ({blueprints.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('structures');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'structures'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Structures (
              {blueprints.filter((b) => b.blueprintType === 'structure_blueprint').length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('custom_blocks');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'custom_blocks'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Custom Blocks (
              {blueprints.filter((b) => b.blueprintType === 'custom_block').length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('save_new');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'save_new'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              + Save Selection as Blueprint
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('import_json');
                setFormFeedback(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'import_json'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Import JSON
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Active Selection: {selectionSizeLabel} · {selectedBlockCount} solid blocks
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 flex-1 min-h-0 overflow-y-auto">
          {formFeedback && (
            <div
              role="status"
              className={`mb-4 px-4 py-2.5 rounded-lg text-xs font-medium border ${
                formFeedback.type === 'error'
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              }`}
            >
              {formFeedback.text}
            </div>
          )}

          {activeTab === 'save_new' ? (
            <form
              onSubmit={handleSaveStructureSubmit}
              className="max-w-xl mx-auto space-y-4 bg-slate-950 p-6 rounded-xl border border-slate-800"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Save Constructed Building or Region as Blueprint
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Capture either your active Pos1–Pos2 WorldEdit bounding box or your entire Skyblock build into a portable blueprint.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCaptureWholeWorld(false)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    !captureWholeWorld
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold">Pos1–Pos2 Selection Box</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {selectionSizeLabel} · {selectedBlockCount} blocks
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCaptureWholeWorld(true)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    captureWholeWorld
                      ? 'bg-amber-500/15 border-amber-400 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold">Entire World Build</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    All {totalWorldBlocks} placed blocks in scene
                  </div>
                </button>
              </div>

              <div>
                <label
                  htmlFor="new-blueprint-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Blueprint Name
                </label>
                <input
                  id="new-blueprint-name"
                  type="text"
                  value={bpName}
                  onChange={(e) => setBpName(e.target.value)}
                  placeholder="e.g., Skyblock Castle Gatehouse"
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-blueprint-desc"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Description
                </label>
                <input
                  id="new-blueprint-desc"
                  type="text"
                  value={bpDesc}
                  onChange={(e) => setBpDesc(e.target.value)}
                  placeholder="Optional notes on dimensions or materials..."
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span>Publish to Firebase Community Gallery when signed in</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>Save Blueprint</span>
                </button>
              </div>
            </form>
          ) : activeTab === 'import_json' ? (
            <form
              onSubmit={handleImportSubmit}
              className="max-w-xl mx-auto space-y-4 bg-slate-950 p-6 rounded-xl border border-slate-800"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Import Portable Blueprint JSON
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Paste a BrickForge blueprint JSON payload below to add it to your library.
                </p>
              </div>
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"name":"My Tower","blueprintType":"structure_blueprint","size":{"lx":3,"ly":4,"lz":3},"blocks":[...]}'
                className="w-full p-3 text-xs font-mono rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Blueprint</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBlueprints.map((bp) => (
                <div
                  key={bp.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-4 hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{bp.name}</h3>
                      {bp.authorId !== 'system' && (
                        <button
                          type="button"
                          onClick={() => onDeleteBlueprint(bp.id)}
                          aria-label={`Delete ${bp.name}`}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Clean unboxed metadata per Zero-Pill rule */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono mt-1">
                      <span>
                        {bp.blueprintType === 'custom_block' ? 'Custom Block' : 'Structure'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {bp.size.lx}×{bp.size.ly}×{bp.size.lz} studs
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{bp.blocks.length} blocks</span>
                      <span aria-hidden="true">·</span>
                      <span>by {bp.authorName}</span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">
                      {bp.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        onEquipBlueprintStamp(bp);
                        onClose();
                      }}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Stamp className="w-3.5 h-3.5" />
                      <span>Stamp in World</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onPlaceBlueprintAtPos1(bp);
                        onClose();
                      }}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      Place at Pos1
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onLoadBlueprintIntoNewWorld(bp);
                        onClose();
                      }}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Load in New World
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};
