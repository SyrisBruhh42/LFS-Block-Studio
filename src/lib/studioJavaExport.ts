/** Read-only export preparation. The mounted UI must also check its live session before download. */
import { createStudioId, validateStudioDocument, type StudioDocument } from './studioDocument';
import { validateJavaCellMapping, type JavaCellMappingReport } from '../engine/javaCellMapping';
import { encodeJavaSchematic, validateJavaSchematicInput, type JavaCellPosition, type JavaSchematicInput, type JavaSchematicReport } from '../engine/javaSchematic';
import type { StudioEditorToken } from './studioEditorSession';

export interface StudioJavaExportRequest {
  document: StudioDocument;
  sourceToken: string;
  name: string;
  scope: 'world' | 'selection';
  selection: { pos1: JavaCellPosition; pos2: JavaCellPosition } | null;
  anchor: JavaCellPosition;
}
export interface StudioJavaExportIssue { code: string; path: string; message: string }
export interface StudioJavaExportPlan {
  readonly id: string;
  readonly sourceToken: string;
  readonly source: { readonly documentId: string; readonly historyEpoch: string; readonly sessionId: string; readonly liveEditRevision: number; readonly capturedDurableRevision: number };
  readonly projectName: string;
  readonly scope: StudioJavaExportRequest['scope'];
  readonly totalBlocks: number;
  readonly excludedByScope: number;
  readonly targetLocked: boolean;
  readonly input: JavaSchematicInput;
  readonly mapping: JavaCellMappingReport;
  readonly schematic: JavaSchematicReport;
  readonly materials: readonly { definitionId: string; name: string; blockState: string; instances: number }[];
}
export type StudioJavaExportPreparation = { ok: true; plan: StudioJavaExportPlan } | { ok: false; issues: readonly StudioJavaExportIssue[]; issuesTruncated: boolean };
export interface StudioJavaExportArtifact {
  /** Blob copies the encoder bytes; callers cannot mutate bytes after receipt hashing. */
  readonly blob: Blob;
  readonly filename: string;
  readonly receipt: {
    readonly format: 'lfs-java-export-report'; readonly version: 1; readonly planId: string;
    readonly nativeQualification: 'not-run'; readonly sourceIdentityKind: 'caller-captured-mounted-session';
    readonly source: StudioJavaExportPlan['source']; readonly projectName: string;
    readonly scope: StudioJavaExportPlan['scope']; readonly totalBlocks: number; readonly excludedByScope: number;
    readonly targetLocked: boolean; readonly binarySha256: string; readonly mappingSha256: string; readonly gzipBytes: number;
    readonly schematic: JavaSchematicReport; readonly materials: StudioJavaExportPlan['materials'];
    readonly omitted: readonly string[];
  };
}
const plans = new WeakSet<StudioJavaExportPlan>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fields(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${path}: Expected plain data.`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error(`${path}: Missing or unsupported field.`);
  const result: Record<string, unknown> = {};
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !('value' in d)) throw new Error(`${path}.${key}: Accessors are unsupported.`); result[key] = d.value; }
  return result;
}
function coordinate(value: unknown, path: string): JavaCellPosition {
  const data = fields(value, ['x', 'y', 'z'], path);
  for (const axis of ['x', 'y', 'z']) if (typeof data[axis] !== 'number' || !Number.isSafeInteger(data[axis]) || Math.abs(data[axis]) > 1_000_000) throw new Error(`${path}.${axis}: Enter an integer between -1000000 and 1000000.`);
  return data as unknown as JavaCellPosition;
}
function token(value: unknown, document: StudioDocument): { raw: string; parsed: StudioEditorToken } {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('A bounded current session token is required.');
  const parsed = JSON.parse(value);
  // Session tokens emitted by the editor are canonical JSON. This also rejects duplicate keys.
  if (JSON.stringify(parsed) !== value) throw new Error('The session token is not canonical.');
  const data = fields(parsed, ['documentId', 'historyEpoch', 'sessionId', 'editRevision'], '$.sourceToken');
  for (const key of ['documentId', 'historyEpoch', 'sessionId']) if (typeof data[key] !== 'string' || data[key].length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(data[key]) || ['__proto__', 'constructor', 'prototype'].includes(data[key])) throw new Error('Invalid session identity.');
  if (!Number.isSafeInteger(data.editRevision) || (data.editRevision as number) < 0 || data.documentId !== document.documentId || data.historyEpoch !== document.historyEpoch) throw new Error('The session token does not identify this document and history.');
  return { raw: value, parsed: data as unknown as StudioEditorToken };
}
function failed(message: string, code = 'invalid-input', path = '$'): StudioJavaExportPreparation {
  return { ok: false, issues: [{ code, path, message }], issuesTruncated: false };
}

/** Explicit selection is the only clipping operation; no invalid included cell is skipped. */
export function prepareStudioJavaExport(value: unknown): StudioJavaExportPreparation {
  try {
    const request = fields(value, ['document', 'sourceToken', 'name', 'scope', 'selection', 'anchor'], '$');
    const checked = validateStudioDocument(request.document);
    if (!checked.ok) return { ok: false, issues: checked.error.issues.length ? checked.error.issues.map(issue => ({ ...issue, code: checked.error.code })) : [{ code: checked.error.code, path: '$.document', message: checked.error.message }], issuesTruncated: false };
    const document = checked.value, source = token(request.sourceToken, document);
    const target = document.targetPolicy?.target;
    if (target?.kind !== 'minecraft-java') return failed('Choose and review a Java target in Game compatibility before exporting a native schematic.', 'target-required', '$.document.targetPolicy');
    if (request.scope !== 'world' && request.scope !== 'selection') return failed('Choose the complete build or an explicit selection.');
    if (typeof request.name !== 'string') return failed('Enter a schematic name.');
    const anchor = coordinate(request.anchor, '$.anchor');
    let bounds: JavaSchematicInput['bounds'] | undefined;
    if (request.scope === 'selection') {
      const selection = fields(request.selection, ['pos1', 'pos2'], '$.selection');
      const a = coordinate(selection.pos1, '$.selection.pos1'), b = coordinate(selection.pos2, '$.selection.pos2');
      bounds = { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } };
    }
    const totalBlocks = Object.keys(document.blocks).length;
    const blocks = bounds ? Object.fromEntries(Object.entries(document.blocks).filter(([, block]) => (['x', 'y', 'z'] as const).every(axis => block.position[axis] >= bounds!.min[axis] && block.position[axis] <= bounds!.max[axis]))) : document.blocks;
    const mapped = validateJavaCellMapping({ blocks, definitions: document.customBlocks, bindings: target.bindings, ...(bounds ? { bounds } : {}), anchor });
    if (!mapped.ok) return mapped;
    if (!mapped.bounds) return failed('The complete build is empty. Select explicit bounds if you intend to export an air-only region.', 'empty-scope', '$.bounds');
    const input: JavaSchematicInput = {
      cells: mapped.cells, bounds: mapped.bounds, anchor, name: request.name,
      source: { documentId: document.documentId, revision: document.revision, historyEpoch: document.historyEpoch },
    };
    const schematic = validateJavaSchematicInput(input);
    if (!schematic.ok) return failed(schematic.error.message, schematic.error.code, schematic.error.path);
    const plan: StudioJavaExportPlan = freeze({
      id: createStudioId('export'), sourceToken: source.raw,
      source: { documentId: document.documentId, historyEpoch: document.historyEpoch, sessionId: source.parsed.sessionId, liveEditRevision: source.parsed.editRevision, capturedDurableRevision: document.revision },
      projectName: document.world.worldName, scope: request.scope, totalBlocks, excludedByScope: totalBlocks - mapped.cells.length, targetLocked: target.locked,
      input, mapping: mapped.report, schematic: schematic.report,
      materials: mapped.report.materialSubstitutions.map(row => ({ ...row, name: document.customBlocks[row.definitionId].name })),
    });
    plans.add(plan);
    return { ok: true, plan };
  } catch (error) { return failed(error instanceof Error ? error.message : 'The export source could not be safely read.'); }
}

/** A prepared plan is an immutable source capture, not proof of current session or native acceptance. */
export async function encodeStudioJavaExport(plan: StudioJavaExportPlan, signal?: AbortSignal): Promise<StudioJavaExportArtifact> {
  if (!plans.has(plan)) throw new Error('Review this export through preparation before encoding it.');
  signal?.throwIfAborted();
  const encoded = await encodeJavaSchematic(plan.input, { signal });
  const digest = async (bytes: Uint8Array<ArrayBuffer>) => {
    signal?.throwIfAborted();
    if (!globalThis.crypto?.subtle) throw new Error('This browser cannot produce the export integrity report.');
    const result = await globalThis.crypto.subtle.digest('SHA-256', bytes); signal?.throwIfAborted();
    return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const binarySha256 = await digest(encoded.bytes), mappingSha256 = await digest(new TextEncoder().encode(plan.mapping.bindingIdentity));
  const slug = plan.input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'studio_build';
  const receipt: StudioJavaExportArtifact['receipt'] = freeze({
    format: 'lfs-java-export-report', version: 1, planId: plan.id, nativeQualification: 'not-run', sourceIdentityKind: 'caller-captured-mounted-session',
    source: plan.source, projectName: plan.projectName, scope: plan.scope, totalBlocks: plan.totalBlocks, excludedByScope: plan.excludedByScope, targetLocked: plan.targetLocked,
    binarySha256, mappingSha256, gzipBytes: encoded.bytes.byteLength, schematic: encoded.report, materials: plan.materials,
    omitted: ['Project metadata, lighting and procedural appearance settings', 'Unused definitions and blueprint/resource library', 'Opaque extension data', 'Entities, block entities and biomes (outside this candidate profile)'],
  });
  signal?.throwIfAborted();
  return Object.freeze({ blob: new Blob([encoded.bytes], { type: 'application/octet-stream' }), filename: `${slug}-edit${plan.source.liveEditRevision}.candidate.schem`, receipt });
}
