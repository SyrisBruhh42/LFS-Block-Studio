import type { BlueprintPrefab, CustomBlockDefinition } from '../engine/types';
import { getDefaultBlockRegistry } from '../engine/worldEditEngine';
import { DEFAULT_CHUNK_CONFIG, DEFAULT_SMART_PATTERN_CONFIG } from '../engine/chunkAndPatternEngine';
import { createStudioId, STUDIO_DOCUMENT_LIMITS, validateStudioDocument, type DocumentResult, type StudioDocument } from './studioDocument';
import type { LegacyDocumentSource } from './studioDocumentStore';

export const STUDIO_RESOURCE_IMPORT_LIMITS = Object.freeze({ maxSourceBytes: 4 * 1024 * 1024 });
type ImportError = Extract<DocumentResult<never>, { ok: false }>['error'];
export type ResourceImportResult<T> = { ok: true; value: T } | {
  ok: false; error: ImportError; legacySources: LegacyDocumentSource[];
};
export interface PreparedResourceDocument { document: StudioDocument; legacySources: LegacyDocumentSource[] }
export interface PreparedBlueprintImport extends PreparedResourceDocument { blueprint: BlueprintPrefab }
export interface BlueprintImportOptions { sourceId?: string; authorId?: string; authorName?: string }
export interface CloudSnapshotImportInput { sourceId: string; name: string; blocksData: string; customBlocksData?: string }

const encoder = new TextEncoder();
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
class ImportFailure extends Error {
  constructor(readonly path: string, message: string, readonly code: ImportError['code'] = 'invalid-document') { super(message); }
}
function fail(path: string, message: string, code?: ImportError['code']): never { throw new ImportFailure(path, message, code); }
function knownObject(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'Expected a plain object.');
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || unsafe.has(key) || !keys.includes(key)) fail(path, 'Unknown or unsafe field; retain the original for an explicit adapter.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail(path, 'Only enumerable data fields are supported.');
    result[key] = descriptor.value;
  }
  return result;
}
function sourceLabel(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.length || value.length > 450 || /[\u0000-\u001f\u007f]/.test(value)) fail('$.sourceId', 'Source label must be nonempty text of at most 450 characters without control characters.');
  return value;
}
function retain(raw: unknown, sourceId: string, sources: LegacyDocumentSource[]): string {
  if (typeof raw !== 'string') fail(sourceId, 'Expected original JSON text.');
  if (raw.length > STUDIO_RESOURCE_IMPORT_LIMITS.maxSourceBytes || encoder.encode(raw).byteLength > STUDIO_RESOURCE_IMPORT_LIMITS.maxSourceBytes) {
    fail(sourceId, 'Import source exceeds 4 MiB. Keep the original file; no candidate was created.', 'size-limit');
  }
  sources.push({ sourceId, raw });
  return raw;
}

/** Scan before JSON.parse: duplicate keys otherwise disappear, including escaped equivalents. */
function parseOriginal(raw: string, path: string): unknown {
  const stack: ({ kind: 'object'; expectingKey: boolean; keys: Set<string> } | { kind: 'array' })[] = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') {
      const start = i;
      for (++i; i < raw.length && raw[i] !== '"'; i++) if (raw[i] === '\\') i++;
      if (i >= raw.length) fail(path, 'Original JSON contains an unterminated string.');
      const frame = stack.at(-1);
      if (frame?.kind === 'object' && frame.expectingKey) {
        let key: string;
        try { key = JSON.parse(raw.slice(start, i + 1)); } catch { fail(path, 'Original JSON contains an invalid key.'); }
        if (unsafe.has(key)) fail(path, 'Unsafe JSON object key.');
        if (frame.keys.has(key)) fail(path, `Duplicate JSON object key: ${key.slice(0, 100)}. No conflicting value was selected.`);
        frame.keys.add(key);
      }
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? { kind: 'object', expectingKey: true, keys: new Set() } : { kind: 'array' });
      if (stack.length > STUDIO_DOCUMENT_LIMITS.maxDepth) fail(path, 'Import nesting limit exceeded.', 'size-limit');
    } else if (char === '}' || char === ']') {
      const frame = stack.pop();
      if (!frame || (char === '}') !== (frame.kind === 'object')) fail(path, 'Original JSON has mismatched containers.');
    } else if (char === ':' || char === ',') {
      const frame = stack.at(-1);
      if (frame?.kind === 'object') frame.expectingKey = char === ',';
    }
  }
  try { return JSON.parse(raw); } catch { fail(path, 'Original source is not complete JSON.'); }
}

/** Shared data-only parser for resource adapters: size, duplicate keys and depth precede JSON.parse. */
export function parseStudioResourceJson(raw: string, path = '$', maxBytes = STUDIO_RESOURCE_IMPORT_LIMITS.maxSourceBytes): unknown {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 8 * 1024 * 1024) fail(path, 'Invalid resource JSON budget.', 'size-limit');
  if (typeof raw !== 'string' || raw.length > maxBytes || encoder.encode(raw).byteLength > maxBytes) {
    fail(path, 'Resource JSON exceeds its bounded input allowance.', 'size-limit');
  }
  return parseOriginal(raw, path);
}
function checked(document: unknown): StudioDocument {
  const result = validateStudioDocument(document);
  if (!result.ok) fail(result.error.issues[0]?.path ?? '$', result.error.message, result.error.code);
  return result.value;
}
function failure(error: unknown, legacySources: LegacyDocumentSource[]): ResourceImportResult<never> {
  const issue = error instanceof ImportFailure ? error : new ImportFailure('$', 'Import could not be safely prepared. The original was not changed.');
  return { ok: false, error: { code: issue.code, message: issue.message, issues: [{ path: issue.path, message: issue.message }] }, legacySources };
}

/**
 * Schema 1 Freeform only. Bundled built-ins and chunk/pattern defaults are cloned;
 * the imported library starts empty. Lighting is absent (legacy view default).
 * No current project, starter world, sharing, description, extensions or target is inherited.
 */
function freshDocument(name: unknown): StudioDocument {
  return checked({
    format: 'lfs-studio-project', schemaVersion: 1, documentId: createStudioId(), revision: 0,
    historyEpoch: createStudioId('history'), savedAt: new Date().toISOString(),
    world: { worldId: createStudioId('world'), worldName: name, roomCode: '', isPublicWorld: false },
    blocks: {}, customBlocks: getDefaultBlockRegistry(), blueprints: [],
    chunkConfig: DEFAULT_CHUNK_CONFIG, patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
  });
}
function definitions(value: unknown, document: StudioDocument): CustomBlockDefinition[] {
  if (!Array.isArray(value)) fail('$.customBlockDefs', 'Block definitions must be a list.');
  if (value.length > STUDIO_DOCUMENT_LIMITS.maxDefinitions) fail('$.customBlockDefs', 'Too many block definitions.', 'size-limit');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(item.id) || unsafe.has(item.id)) fail('$.customBlockDefs', 'Invalid block definition identifier.');
    if (ids.has(item.id)) fail('$.customBlockDefs', 'Duplicate block definition identifier. No conflicting definition was selected.');
    ids.add(item.id);
  }
  // Validate the list before creating an ID map. The document schema supplies all nested rules.
  return checked({ ...document, blueprints: [{ ...blueprintDefaults(document.savedAt), customBlockDefs: value }] }).blueprints[0].customBlockDefs;
}
function blueprintDefaults(createdAt: string): BlueprintPrefab {
  return { id: createStudioId('blueprint'), name: 'Imported Blueprint', description: 'Imported blueprint',
    authorId: 'local_builder', authorName: 'Local Builder', blueprintType: 'structure_blueprint', isPublic: false,
    size: { lx: 3, ly: 3, lz: 3 }, blocks: [], customBlockDefs: [], createdAt };
}

/**
 * Legacy defaults apply only to omitted fields: name/description above, structure type,
 * 3×3×3 size, empty embedded definitions and current timestamp. Blocks are required.
 * Supplied metadata is validated before a fresh local/private identity is assigned.
 * The returned archival document must be staged/read back with legacySources before
 * the caller commits blueprint to its live library. Preparation performs no writes.
 */
export function prepareBlueprintImport(raw: string, options: BlueprintImportOptions = {}): ResourceImportResult<PreparedBlueprintImport> {
  const legacySources: LegacyDocumentSource[] = [];
  try {
    // Capture under a safe default first, so even malformed options cannot discard bounded raw input.
    retain(raw, 'blueprint-import', legacySources);
    const opts = knownObject(options, ['sourceId', 'authorId', 'authorName'], '$.options');
    legacySources[0].sourceId = sourceLabel(opts.sourceId, 'blueprint-import');
    const data = knownObject(parseOriginal(raw, '$'), ['id', 'name', 'description', 'authorId', 'authorName', 'blueprintType', 'isPublic', 'size', 'blocks', 'customBlockDefs', 'createdAt'], '$');
    if (!Object.hasOwn(data, 'blocks')) fail('$.blocks', 'Blueprint blocks are required.');
    const document = freshDocument('Imported blueprint recovery');
    const supplied = { ...blueprintDefaults(document.savedAt), ...data };
    definitions(supplied.customBlockDefs, document);
    const validated = checked({ ...document, blueprints: [supplied] }).blueprints[0];
    const anchors = new Set<string>();
    for (const block of validated.blocks) {
      const key = `${Math.round(block.position.x)},${Math.round(block.position.y)},${Math.round(block.position.z)}`;
      if (anchors.has(key)) fail('$.blocks', 'Conflicting blueprint anchors would overwrite one another when placed.');
      anchors.add(key);
    }
    const imported = { ...validated, id: createStudioId('blueprint'), isPublic: false,
      authorId: Object.hasOwn(opts, 'authorId') ? opts.authorId : 'local_builder',
      authorName: Object.hasOwn(opts, 'authorName') ? opts.authorName : 'Local Builder' };
    const candidate = checked({ ...document, blueprints: [imported] });
    return { ok: true, value: { document: candidate, blueprint: candidate.blueprints[0], legacySources } };
  } catch (error) { return failure(error, legacySources); }
}

/**
 * Legacy cloud snapshots contain blocks plus optional definitions, not a full project.
 * Preserve each present raw JSON field exactly; omitted definitions mean bundled built-ins.
 * One explicit definition may override its bundled built-in in this NEW candidate only.
 * Duplicate IDs, unknown fields and missing references reject instead of being normalized away.
 * Caller must stage/read back originals and promote a separate copy; no provider is called here.
 */
export function prepareCloudSnapshotImport(input: CloudSnapshotImportInput): ResourceImportResult<PreparedResourceDocument> {
  const legacySources: LegacyDocumentSource[] = [];
  try {
    // Capture safe data descriptors first, even if envelope validation later fails.
    // A malformed field must not hide the other intact source from recovery.
    let sourceError: unknown;
    if (input && typeof input === 'object') {
      for (const field of ['blocksData', 'customBlocksData']) {
        const descriptor = Object.getOwnPropertyDescriptor(input, field);
        if (descriptor && 'value' in descriptor) {
          try { retain(descriptor.value, `cloud-snapshot:${field}`, legacySources); }
          catch (error) { sourceError ??= error; }
        }
      }
    }
    if (sourceError) throw sourceError;
    const data = knownObject(input, ['sourceId', 'name', 'blocksData', 'customBlocksData'], '$');
    for (const field of ['sourceId', 'name', 'blocksData']) if (!Object.hasOwn(data, field)) fail(`$.${field}`, 'Required cloud import field is missing.');
    const label = sourceLabel(data.sourceId, 'cloud-snapshot');
    for (const source of legacySources) source.sourceId = `${label}:${source.sourceId.slice('cloud-snapshot:'.length)}`;
    const blocksRaw = data.blocksData as string;
    const definitionsRaw = Object.hasOwn(data, 'customBlocksData')
      ? data.customBlocksData as string : undefined;
    const blocks = parseOriginal(blocksRaw, '$.blocksData');
    const rawDefinitions = definitionsRaw === undefined ? [] : parseOriginal(definitionsRaw, '$.customBlocksData');
    const document = freshDocument(data.name);
    const admitted = definitions(rawDefinitions, document);
    const registry = { ...document.customBlocks };
    for (const definition of admitted) registry[definition.id] = definition;
    const candidate = checked({ ...document, blocks, customBlocks: registry });
    return { ok: true, value: { document: candidate, legacySources } };
  } catch (error) { return failure(error, legacySources); }
}
