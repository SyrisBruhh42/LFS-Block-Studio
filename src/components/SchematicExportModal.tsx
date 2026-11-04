import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  exportToBlockbenchModelJson,
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
import { preflightLegacyExport, boundLegacyExportText } from '../engine/exportPreflight';
import { DraggableWindow } from './DraggableWindow';
import { StudioJavaExportModal } from './StudioJavaExportModal';
import type { StudioDocument } from '../lib/studioDocument';
import type { GridCoord } from '../engine/types';

interface SchematicExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  worldName: string;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  studioDocument?: StudioDocument;
  sourceToken?: string;
  selection?: { pos1: GridCoord; pos2: GridCoord } | null;
  isCurrentSource?: (token: string) => boolean;
  onOpenCompatibility?: () => void;
}

type ExportFormatTab =
  | 'schem'
  | 'mcfunction'
  | 'ldraw'
  | 'godot_tscn'
  | 'godot_gd'
  | 'gltf'
  | 'bbmodel';

/** A locked Java project never mounts the independent heuristic/AI draft mapper. */
export const SchematicExportModal: React.FC<SchematicExportModalProps> = props => {
  const [otherDrafts, setOtherDrafts] = useState(false);
  const target = props.studioDocument?.targetPolicy?.target;
  const java = target?.kind === 'minecraft-java' ? target : null;
  useEffect(() => { setOtherDrafts(false); }, [props.studioDocument?.documentId, target?.kind, java?.locked]);
  if (props.studioDocument?.schemaVersion === 2 && target?.kind !== 'freeform' && target?.kind !== 'minecraft-java') {
    return props.isOpen ? <DraggableWindow windowId="export_unavailable" title="Export unavailable" onClose={props.onClose}><p role="alert">The target policy is unknown. Preserve the original project; export cannot assume Freeform.</p></DraggableWindow> : null;
  }
  if (java && (!otherDrafts || java.locked)) {
    if (!props.sourceToken || !props.isCurrentSource) return props.isOpen ? <DraggableWindow windowId="export_unavailable" title="Export unavailable" onClose={props.onClose}><p role="alert">Java export requires a current editor-session capture.</p></DraggableWindow> : null;
    return <StudioJavaExportModal key={props.studioDocument!.documentId} isOpen={props.isOpen} onClose={props.onClose} document={props.studioDocument!} sourceToken={props.sourceToken} selection={props.selection ?? null} isCurrentSource={props.isCurrentSource} onOpenCompatibility={props.onOpenCompatibility} onShowDrafts={!java.locked ? () => setOtherDrafts(true) : undefined} />;
  }
  const exportContext = java ? <section className="rounded-lg border border-amber-500/50 p-3 text-sm text-amber-100"><p>The Java profile is unlocked. These approximate drafts do not use its reviewed mappings.</p><button type="button" onClick={() => setOtherDrafts(false)} className="mt-2 rounded border px-3 py-2">Return to reviewed Java export</button></section>
    : props.onOpenCompatibility ? <section className="rounded-lg border border-emerald-500/50 p-3 text-sm"><p>Native Java schematic export uses a reviewed game target and explicit block mappings.</p><button type="button" onClick={props.onOpenCompatibility} className="mt-2 rounded border px-3 py-2">Choose Java target and mappings</button></section> : undefined;
  return <LegacySchematicExportModal {...props} exportContext={exportContext} />;
};

const LegacySchematicExportModal: React.FC<SchematicExportModalProps & { exportContext?: React.ReactNode }> = ({
  isOpen,
  onClose,
  worldName,
  blocks,
  customBlocks,
  exportContext,
}) => {
  const [mappings, setMappings] = useState<SchematicBlockMapping[]>([]);
  const [isEvaluatingAi, setIsEvaluatingAi] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [activeFormat, setActiveFormat] = useState<ExportFormatTab>('schem');
  const [copied, setCopied] = useState(false);

  const request = useRef<AbortController | null>(null);
  const live = useRef({ isOpen, blocks, customBlocks, mappings });
  live.current = { isOpen, blocks, customBlocks, mappings };
  const sourceError = useMemo(() => {
    if (!isOpen) return null;
    try { preflightLegacyExport(blocks, { definitions: customBlocks }); return null; }
    catch (error) { return error instanceof Error ? error.message : 'The export source is invalid.'; }
  }, [isOpen, blocks, customBlocks]);

  useEffect(() => {
    request.current?.abort(); request.current = null;
    setIsEvaluatingAi(false); setCopied(false);
    if (!isOpen) return;
    try { setMappings(sourceError ? [] : computeInitialBlockMappings(blocks, customBlocks)); }
    catch { setMappings([]); }
    setAiStatusMessage(null);
    return () => { request.current?.abort(); request.current = null; };
  }, [isOpen, blocks, customBlocks, sourceError]);

  const mappingByBlockId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mappings) {
      map[m.sourceBlockId] = m.selectedTargetId;
    }
    return map;
  }, [mappings]);

  const preview = useMemo(() => {
    if (!isOpen) return { output: '', error: null };
    try {
      if (sourceError) throw new Error(sourceError);
      let output: string;
      if (activeFormat === 'schem') output = exportSpongeSchematicJson(worldName, blocks, mappingByBlockId);
      else if (activeFormat === 'mcfunction') output = exportMinecraftFunction(worldName, blocks, mappingByBlockId);
      else if (activeFormat === 'ldraw') output = exportBrickLDraw(worldName, blocks, customBlocks, mappingByBlockId);
      else if (activeFormat === 'godot_tscn') output = exportToGodotTscn(worldName, blocks, customBlocks);
      else if (activeFormat === 'godot_gd') output = exportToGodotScript(worldName, blocks, customBlocks);
      else if (activeFormat === 'bbmodel') output = exportToBlockbenchModelJson(worldName, blocks, customBlocks);
      else output = exportToGltfJson(worldName, blocks, customBlocks);
      return { output: boundLegacyExportText(output), error: null };
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : 'Could not prepare this draft.' };
    }
  }, [isOpen, sourceError, activeFormat, worldName, blocks, customBlocks, mappingByBlockId]);
  const previewOutput = preview.output;
  const formatNote: Record<ExportFormatTab, string> = {
    schem: 'Diagnostic JSON only. WorldEdit needs a binary .schem file; this draft is not importable as one. Native export is awaiting profile integration and game testing.',
    mcfunction: 'Approximate command draft. Shapes, scales, material overrides and complete block states are not preserved. Test in a disposable world before use.',
    ldraw: 'Approximate brick draft using two part shapes. It does not preserve the complete studio geometry or materials.',
    godot_tscn: 'Generated Godot scene draft. Geometry, materials and native loading have not been independently qualified.',
    godot_gd: 'Generated Godot script draft. Review before running; native behaviour has not been independently qualified.',
    gltf: 'Deterministic glTF 2.0 3D mesh & PBR material draft with per-node customScale, bone rig hierarchy, and animation channels.',
    bbmodel: 'Blockbench 3D model (.bbmodel) draft containing cube mesh elements, 6-face UV skins, bone hierarchy rig (outliner), and keyframe animation tracks.',
  };

  if (!isOpen) return null;

  const handleRunAiEvaluation = async () => {
    if (sourceError || isEvaluatingAi) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    const source = { blocks, customBlocks, mappings };
    const current = () => request.current === controller && !controller.signal.aborted && live.current.isOpen && live.current.blocks === source.blocks && live.current.customBlocks === source.customBlocks && live.current.mappings === source.mappings;
    setIsEvaluatingAi(true);
    setAiStatusMessage({ text: 'Requesting approximate mapping suggestions. Similarity does not establish game compatibility.', type: 'info' });
    try {
      const updated = await evaluateBlockMappingsWithAI(mappings, 'minecraft_1_20_schematic', controller.signal);
      if (!current()) return;
      setMappings(updated);
      setAiStatusMessage({ text: 'Suggestions received and checked against the draft catalogue. Review each mapping; native compatibility remains unverified.', type: 'success' });
    } catch (error) {
      if (current()) setAiStatusMessage({ text: error instanceof Error ? error.message : 'The suggestion request failed. Existing mappings were retained.', type: 'error' });
    } finally {
      if (request.current === controller) { request.current = null; setIsEvaluatingAi(false); }
    }
  };

  const handleChangeTargetId = (sourceBlockId: string, newTargetId: string) => {
    request.current?.abort(); request.current = null; setIsEvaluatingAi(false);
    if (!MINECRAFT_BLOCK_CATALOG.some(option => option.id === newTargetId)) return;
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceBlockId === sourceBlockId
          ? { ...m, selectedTargetId: newTargetId }
          : m
      )
    );
  };

  const handleDownloadSchematic = () => {
    if (preview.error || !previewOutput) return;
    const safeSlug =
      worldName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'skyblock_build';

    if (activeFormat === 'schem') {
      triggerDownloadFile(
        `${safeSlug}.schematic-draft.json`,
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
    } else if (activeFormat === 'bbmodel') {
      triggerDownloadFile(
        `${safeSlug}.bbmodel`,
        previewOutput,
        'application/json'
      );
    } else {
      triggerDownloadFile(
        `${safeSlug}.gltf`,
        previewOutput,
        'model/gltf+json'
      );
    }
  };

  const handleCopyPreview = async () => {
    if (preview.error || !previewOutput) return;
    try {
      await navigator.clipboard.writeText(previewOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setAiStatusMessage({ text: 'Copy failed. Use Download draft or select the preview text.', type: 'error' });
    }
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
      title="Export drafts & mapping preview"
      subtitle="Review format limits. Project backup preserves the complete editable project."
      icon={<Layers className="w-4 h-4 text-amber-400" />}
      defaultWidth={980}
      defaultHeight={680}
      minWidth={420}
      minHeight={360}
      zIndex={55}
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {exportContext}
          {/* AI Block Comparison Header Bar */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Approximate block mapping
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Suggestions compare color, shape and finish. Similarity scores are not compatibility probabilities. AI suggestions send these block descriptions to the configured service.
              </p>
            </div>

            <button
              type="button"
              data-testid="ai-evaluate-blocks-btn"
              disabled={isEvaluatingAi || !!sourceError || !mappings.length}
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
                  ? 'Requesting suggestions...'
                  : 'Request AI suggestions'}
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
              <div className="col-span-1 text-center">Similarity</div>
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
                      label: 'Schematic JSON draft',
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
                      label: 'glTF 2.0 Mesh / Rig',
                    },
                    {
                      id: 'bbmodel',
                      label: 'Blockbench Model (.bbmodel)',
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveFormat(tab.id); setCopied(false); }}
                    aria-pressed={activeFormat === tab.id}
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
                  disabled={!!preview.error || !previewOutput}
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
                      <span>Copy draft</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSchematic}
                  disabled={!!preview.error || !previewOutput}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download draft</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-amber-200" role="status">{formatNote[activeFormat]}</p>
            {preview.error && <p className="text-sm text-rose-200" role="alert">{preview.error}</p>}
            <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5 pb-1.5 border-b border-slate-900">
                <span className="flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Draft preview ({Object.keys(blocks).length}{' '}
                    blocks mapped)
                  </span>
                </span>
                <span>Native compatibility unverified</span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {previewOutput.slice(0, 3500)}
                {previewOutput.length > 3500
                  ? '\n... [Preview shortened — Download draft contains the full output]'
                  : ''}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
