import React, { useEffect, useMemo, useState } from 'react';
import { CustomBlockDefinition, PlacedBlock } from '../engine/types';
import {
  MINECRAFT_BLOCK_CATALOG,
  SchematicBlockMapping,
  computeInitialBlockMappings,
  evaluateBlockMappingsWithAI,
  exportBrickLDraw,
  exportMinecraftFunction,
  exportSpongeSchematicJson,
} from '../engine/schematicExporter';
import {
  exportToGltfJson,
  exportToGodotScript,
  exportToGodotTscn,
  triggerDownloadFile,
} from '../engine/godotExporter';
import {
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  Layers,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface SchematicExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  worldName: string;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
}

type ExportFormatTab =
  | 'schem'
  | 'mcfunction'
  | 'ldraw'
  | 'godot_tscn'
  | 'godot_gd'
  | 'gltf';

export const SchematicExportModal: React.FC<SchematicExportModalProps> = ({
  isOpen,
  onClose,
  worldName,
  blocks,
  customBlocks,
}) => {
  const [mappings, setMappings] = useState<SchematicBlockMapping[]>([]);
  const [isEvaluatingAi, setIsEvaluatingAi] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [activeFormat, setActiveFormat] = useState<ExportFormatTab>('schem');
  const [copied, setCopied] = useState(false);

  // Compute baseline closest-block mappings whenever modal opens or blocks change
  useEffect(() => {
    if (!isOpen) return;
    const initial = computeInitialBlockMappings(blocks, customBlocks);
    setMappings(initial);
    setAiStatusMessage(null);
  }, [isOpen, blocks, customBlocks]);

  const mappingByBlockId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mappings) {
      map[m.sourceBlockId] = m.selectedTargetId;
    }
    return map;
  }, [mappings]);

  const previewOutput = useMemo(() => {
    if (!isOpen) return '';
    if (activeFormat === 'schem') {
      return exportSpongeSchematicJson(worldName, blocks, mappingByBlockId);
    }
    if (activeFormat === 'mcfunction') {
      return exportMinecraftFunction(worldName, blocks, mappingByBlockId);
    }
    if (activeFormat === 'ldraw') {
      return exportBrickLDraw(worldName, blocks, customBlocks, mappingByBlockId);
    }
    if (activeFormat === 'godot_tscn') {
      return exportToGodotTscn(worldName, blocks, customBlocks);
    }
    if (activeFormat === 'godot_gd') {
      return exportToGodotScript(worldName, blocks, customBlocks);
    }
    return exportToGltfJson(worldName, blocks, customBlocks);
  }, [isOpen, activeFormat, worldName, blocks, customBlocks, mappingByBlockId]);

  if (!isOpen) return null;

  const handleRunAiEvaluation = async () => {
    setIsEvaluatingAi(true);
    setAiStatusMessage({
      text: 'Evaluating block colors, geometry shapes, and surface materials with AI...',
      type: 'info',
    });
    try {
      const updated = await evaluateBlockMappingsWithAI(
        mappings,
        'minecraft_1_20_schematic'
      );
      setMappings(updated);
      setAiStatusMessage({
        text: `AI evaluated ${updated.length} block types and mapped each to its closest schematic equivalent! Use any dropdown below to customize.`,
        type: 'success',
      });
    } catch (err) {
      setAiStatusMessage({
        text:
          err instanceof Error
            ? err.message
            : 'AI evaluation encountered an error; using deterministic RGB + shape matches.',
        type: 'error',
      });
    } finally {
      setIsEvaluatingAi(false);
    }
  };

  const handleChangeTargetId = (sourceBlockId: string, newTargetId: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceBlockId === sourceBlockId
          ? { ...m, selectedTargetId: newTargetId }
          : m
      )
    );
  };

  const handleDownloadSchematic = () => {
    const safeSlug =
      worldName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'skyblock_build';

    if (activeFormat === 'schem') {
      triggerDownloadFile(
        `${safeSlug}.schem.json`,
        previewOutput,
        'application/json'
      );
    } else if (activeFormat === 'mcfunction') {
      triggerDownloadFile(
        `${safeSlug}.mcfunction`,
        previewOutput,
        'text/plain'
      );
    } else if (activeFormat === 'ldraw') {
      triggerDownloadFile(`${safeSlug}.ldr`, previewOutput, 'text/plain');
    } else if (activeFormat === 'godot_tscn') {
      triggerDownloadFile(`${safeSlug}.tscn`, previewOutput, 'text/plain');
    } else if (activeFormat === 'godot_gd') {
      triggerDownloadFile(
        `${safeSlug}_builder.gd`,
        previewOutput,
        'text/plain'
      );
    } else {
      triggerDownloadFile(
        `${safeSlug}.gltf`,
        previewOutput,
        'model/gltf+json'
      );
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Group catalog options by category for clean <optgroup> dropdowns
  const categories = Array.from(
    new Set(MINECRAFT_BLOCK_CATALOG.map((c) => c.category))
  );

  return (
    <DraggableWindow
      windowId="schematic_export_window"
      isOpen={isOpen}
      onClose={onClose}
      title="Universal Schematic Exporter & AI Closest-Block Mapper"
      subtitle="Export to Minecraft Schematics (WorldEdit .schem, Litematica, .mcfunction), Brick Studio (.ldr), Godot 4 (.tscn), and GLTF"
      icon={<Layers className="w-4 h-4 text-amber-400" />}
      defaultWidth={980}
      defaultHeight={680}
      minWidth={420}
      minHeight={360}
      zIndex={55}
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* AI Block Comparison Header Bar */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  AI Closest-Block Comparison & Interactive Value Mapper
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluates your custom and studio blocks by RGB color, shape (Cube, Stair, Slab, Pillar, Arch), and material finish, with click dropdowns to override any target ID.
              </p>
            </div>

            <button
              type="button"
              data-testid="ai-evaluate-blocks-btn"
              disabled={isEvaluatingAi}
              onClick={handleRunAiEvaluation}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg transition-colors shrink-0"
            >
              {isEvaluatingAi ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>
                {isEvaluatingAi
                  ? 'Evaluating Closest Blocks...'
                  : 'Evaluate Closest Blocks with AI'}
              </span>
            </button>
          </div>

          {aiStatusMessage && (
            <div
              className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between ${
                aiStatusMessage.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : aiStatusMessage.type === 'error'
                    ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                    : 'bg-slate-950 border-slate-700 text-amber-300'
              }`}
            >
              <span>{aiStatusMessage.text}</span>
              <button
                type="button"
                onClick={() => setAiStatusMessage(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Block Mapping Table with Click Dropdowns */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <div className="col-span-4">Studio Block (Source)</div>
              <div className="col-span-2">Shape & Finish</div>
              <div className="col-span-1 text-center">Match</div>
              <div className="col-span-5">
                Target Schematic Block ID (Click Dropdown to Map / Change)
              </div>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
              {mappings.map((row) => (
                <div
                  key={row.sourceBlockId}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs hover:bg-slate-900/50 transition-colors"
                >
                  {/* Source Block */}
                  <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                    <span
                      style={{ backgroundColor: row.sourceHex }}
                      className="w-5 h-5 rounded border border-white/20 shrink-0 shadow-inner"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">
                        {row.sourceBlockName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {row.countInBuild} placed · {row.sourceHex}
                      </div>
                    </div>
                  </div>

                  {/* Shape & Finish */}
                  <div className="col-span-2 text-[11px] font-mono text-slate-300">
                    <div className="capitalize">{row.sourceShape}</div>
                    <div className="text-slate-500 capitalize">
                      {row.sourceTexture.replace('_', ' ')} · {row.sourceFinish}
                    </div>
                  </div>

                  {/* Match Confidence */}
                  <div className="col-span-1 text-center">
                    <span
                      title={row.reasoning}
                      className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                        row.confidence >= 88
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {row.confidence}%
                    </span>
                  </div>

                  {/* Click Dropdown for Mapping / Changing Values */}
                  <div className="col-span-5 flex flex-col gap-1">
                    <select
                      aria-label={`Map ${row.sourceBlockName} to target schematic block`}
                      data-testid={`block-map-select-${row.sourceBlockId}`}
                      value={row.selectedTargetId}
                      onChange={(e) =>
                        handleChangeTargetId(row.sourceBlockId, e.target.value)
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <optgroup label="Recommended & Closest Matches">
                        <option value={row.recommendedTargetId}>
                          ★ {row.recommendedTargetId} (Recommended {row.confidence}%)
                        </option>
                        {row.alternatives.map((altId) => (
                          <option key={altId} value={altId}>
                            ↳ {altId} (Closest Alternative)
                          </option>
                        ))}
                      </optgroup>
                      {categories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {MINECRAFT_BLOCK_CATALOG.filter(
                            (c) => c.category === cat
                          ).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} ({opt.id})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <div className="text-[10px] text-slate-400 truncate">
                      {row.evaluatedByAi ? 'AI: ' : ''}
                      {row.reasoning}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Format Tabs & Live Code Preview */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
                {(
                  [
                    {
                      id: 'schem',
                      label: 'Minecraft Sponge Schematic (.schem.json)',
                    },
                    {
                      id: 'mcfunction',
                      label: 'Minecraft Function (.mcfunction)',
                    },
                    {
                      id: 'ldraw',
                      label: 'Brick Studio / LDraw (.ldr)',
                    },
                    {
                      id: 'godot_tscn',
                      label: 'Godot 4 (.tscn)',
                    },
                    {
                      id: 'godot_gd',
                      label: 'GDScript 4 (.gd)',
                    },
                    {
                      id: 'gltf',
                      label: '3D Model (.gltf)',
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFormat(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFormat === tab.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Schematic</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSchematic}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Schematic File</span>
                </button>
              </div>
            </div>

            <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5 pb-1.5 border-b border-slate-900">
                <span className="flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Live Schematic Output Preview ({Object.keys(blocks).length}{' '}
                    blocks mapped)
                  </span>
                </span>
                <span>Compatible with WorldEdit, Litematica, Axiom, Brickadia & Godot 4</span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {previewOutput.slice(0, 3500)}
                {previewOutput.length > 3500
                  ? '\n... [Preview truncated — Click Download Schematic File for full file]'
                  : ''}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
