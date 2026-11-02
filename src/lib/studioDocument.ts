import { validateStudioTargetPolicy, type StudioTargetPolicy } from './studioTargetPolicy';
import type {
  BlueprintPrefab, CustomBlockDefinition, DynamicLightingConfig, PlacedBlock,
  SmartPatternVariationConfig, WorldChunkConfig,
} from '../engine/types';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface StudioDocument {
  format: 'lfs-studio-project';
  schemaVersion: 1 | 2;
  /** Schema 2 only. Policy is immutable within an ordinary editing/history epoch. */
  targetPolicy?: StudioTargetPolicy;
  documentId: string;
  revision: number;
  historyEpoch: string;
  savedAt: string;
  world: { worldId: string; worldName: string; roomCode: string; isPublicWorld: boolean; description?: string };
  blocks: Record<string, PlacedBlock>;
  /** Includes built-ins, including user-edited built-ins; never filter by isCustom. */
  customBlocks: Record<string, CustomBlockDefinition>;
  blueprints: BlueprintPrefab[];
  chunkConfig: WorldChunkConfig;
  patternConfig: SmartPatternVariationConfig;
  lightingConfig?: DynamicLightingConfig;
  /** Opaque, bounded JSON. Preserve separately; never spread into executable/domain state. */
  extensions?: Record<string, JsonValue>;
}

export interface DocumentIssue { path: string; message: string }
export type DocumentResult<T> = { ok: true; value: T } | {
  ok: false; error: { code: 'invalid-document' | 'unsupported-schema' | 'size-limit'; message: string; issues: DocumentIssue[] };
};
export const STUDIO_DOCUMENT_LIMITS = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxBlocks: 100_000,
  maxDefinitions: 4_096,
  maxBlueprints: 512,
  maxBlueprintBlocks: 100_000,
  maxChunks: 16_384,
  maxCoordinate: 1_000_000,
  maxDepth: 24,
  maxNodes: 2_000_000,
});

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const shapes = ['brick', 'cube', 'plate', 'tile', 'slope', 'arch', 'cylinder', 'micro_voxel'];
const textures = ['smooth_abs', 'cobblestone', 'cobble', 'oak_planks', 'wood_grain', 'wood_plank', 'tech_panel', 'metallic_brushed', 'checker_tile', 'brick_masonry', 'brick_mortar', 'brick', 'roof_tiles', 'glass_grid', 'grass_top'];
const finishes = ['plastic', 'matte', 'satin', 'pearl', 'metallic', 'glass', 'translucent', 'neon'];
const encoder = new TextEncoder();

class Invalid extends Error {
  constructor(readonly path: string, message: string, readonly code: 'invalid-document' | 'unsupported-schema' | 'size-limit' = 'invalid-document') { super(message); }
}
function fail(path: string, message: string): never { throw new Invalid(path, message); }
function record(value: unknown, path: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'Expected a plain object.');
  return value as Record<string, any>;
}
function fields(value: unknown, path: string, required: string[], optional: string[] = []): Record<string, any> {
  const object = record(value, path);
  for (const key of required) if (!Object.hasOwn(object, key) || object[key] === undefined) fail(`${path}.${key}`, 'Required field is missing.');
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) if (!allowed.has(key)) fail(`${path}.${key}`, 'Unknown field; preserve the original for a supported adapter.');
  return object;
}
function text(value: unknown, path: string, max = 256, min = 0): asserts value is string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(path, `Expected text of ${min}–${max} characters.`);
}
function identifier(value: unknown, path: string): asserts value is string {
  text(value, path, 200, 1);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(value) || forbidden.has(value)) fail(path, 'Invalid identifier.');
}
function number(value: unknown, path: string, min: number, max: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(path, `Expected ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}.`);
}
function bool(value: unknown, path: string): void { if (typeof value !== 'boolean') fail(path, 'Expected a boolean.'); }
function choice(value: unknown, values: readonly unknown[], path: string): void { if (!values.includes(value)) fail(path, 'Unsupported value.'); }
function date(value: unknown, path: string): void { text(value, path, 40, 1); if (!Number.isFinite(Date.parse(value))) fail(path, 'Invalid timestamp.'); }
function array(value: unknown, path: string, max: number): any[] {
  if (!Array.isArray(value)) fail(path, 'Expected an array.');
  if (value.length > max) throw new Invalid(path, `Limit is ${max} entries.`, 'size-limit');
  return value;
}
function entries(value: unknown, path: string, max: number): [string, any][] {
  const result = Object.entries(record(value, path));
  if (result.length > max) throw new Invalid(path, `Limit is ${max} entries.`, 'size-limit');
  return result;
}
function color(value: unknown, path: string): void {
  text(value, path, 9, 1);
  if (!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) fail(path, 'Expected a hexadecimal color.');
}
function scale(value: unknown, path: string): void {
  const s = fields(value, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z']) number(s[axis], `${path}.${axis}`, 0.01, 64);
}

/** Bound traversal before JSON serialization; reject cycles, accessors and prototype keys. */
function jsonPreflight(value: unknown): void {
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  const visit = (item: unknown, path: string, depth: number, inArray = false) => {
    if (++nodes > STUDIO_DOCUMENT_LIMITS.maxNodes || depth > STUDIO_DOCUMENT_LIMITS.maxDepth) throw new Invalid(path, 'Document nesting or entry limit exceeded.', 'size-limit');
    if (item === undefined && !inArray) return; // Optional object fields are absent in JSON.
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail(path, 'Non-finite numbers cannot be saved.'); return; }
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > STUDIO_DOCUMENT_LIMITS.maxBytes) throw new Invalid(path, 'Document text limit exceeded.', 'size-limit');
      return;
    }
    if (typeof item !== 'object') fail(path, 'Only JSON data can be saved.');
    if (ancestors.has(item)) fail(path, 'Cyclic data cannot be saved.');
    if (!Array.isArray(item)) record(item, path);
    ancestors.add(item);
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      if (typeof key !== 'string') fail(path, 'Symbol properties cannot be saved.');
      if (!Object.getOwnPropertyDescriptor(item, key)?.enumerable) fail(`${path}.${key}`, 'Non-enumerable properties cannot be saved.');
    }
    for (const key of Object.keys(item)) {
      if (forbidden.has(key)) fail(`${path}.${key}`, 'Unsafe object key.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!('value' in descriptor)) fail(`${path}.${key}`, 'Accessors cannot be saved.');
      characters += key.length;
      visit(descriptor.value, `${path}.${key}`, depth + 1, Array.isArray(item));
    }
    // Array holes would become null; never silently change them.
    if (Array.isArray(item) && Object.keys(item).length !== item.length) fail(path, 'Sparse or decorated arrays are unsupported.');
    ancestors.delete(item);
  };
  visit(value, '$', 0);
}
function definition(value: unknown, path: string): CustomBlockDefinition {
  const d = fields(value, path, ['id', 'name', 'shape', 'width', 'depth', 'heightPlates', 'color', 'texturePattern', 'materialFinish', 'hasStuds'], ['voxels', 'isCustom', 'defaultScale']);
  identifier(d.id, `${path}.id`); text(d.name, `${path}.name`, 256, 1);
  choice(d.shape, shapes, `${path}.shape`); choice(d.texturePattern, textures, `${path}.texturePattern`); choice(d.materialFinish, finishes, `${path}.materialFinish`);
  number(d.width, `${path}.width`, 0.01, 64); number(d.depth, `${path}.depth`, 0.01, 64); number(d.heightPlates, `${path}.heightPlates`, 0.01, 768);
  color(d.color, `${path}.color`); bool(d.hasStuds, `${path}.hasStuds`);
  if (d.isCustom !== undefined) bool(d.isCustom, `${path}.isCustom`);
  if (d.defaultScale !== undefined) scale(d.defaultScale, `${path}.defaultScale`);
  if (d.voxels !== undefined) {
    for (const [i, item] of array(d.voxels, `${path}.voxels`, 512).entries()) {
      const p = `${path}.voxels[${i}]`; const v = fields(item, p, ['x', 'y', 'z', 'color']);
      for (const axis of ['x', 'y', 'z']) number(v[axis], `${p}.${axis}`, 0, 7, true);
      color(v.color, `${p}.color`);
    }
  }
  return d as CustomBlockDefinition;
}
function block(value: unknown, path: string, definitions: Set<string>): PlacedBlock {
  const b = fields(value, path, ['id', 'blockDefId', 'position', 'rotation'], ['colorOverride', 'textureOverride', 'materialOverride', 'customScale']);
  identifier(b.id, `${path}.id`); identifier(b.blockDefId, `${path}.blockDefId`);
  if (!definitions.has(b.blockDefId)) fail(`${path}.blockDefId`, 'Missing block definition.');
  const p = fields(b.position, `${path}.position`, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z']) number(p[axis], `${path}.position.${axis}`, -STUDIO_DOCUMENT_LIMITS.maxCoordinate, STUDIO_DOCUMENT_LIMITS.maxCoordinate);
  choice(b.rotation, [0, 90, 180, 270], `${path}.rotation`);
  if (b.colorOverride !== undefined) color(b.colorOverride, `${path}.colorOverride`);
  if (b.textureOverride !== undefined) choice(b.textureOverride, textures, `${path}.textureOverride`);
  if (b.materialOverride !== undefined) choice(b.materialOverride, finishes, `${path}.materialOverride`);
  if (b.customScale !== undefined) scale(b.customScale, `${path}.customScale`);
  return b as PlacedBlock;
}
function validateContents(d: Record<string, any>): void {
  const definitions = new Set<string>();
  for (const [key, value] of entries(d.customBlocks, '$.customBlocks', STUDIO_DOCUMENT_LIMITS.maxDefinitions)) {
    const def = definition(value, `$.customBlocks.${key}`);
    if (def.id !== key) fail(`$.customBlocks.${key}`, 'Definition key must match its ID.'); definitions.add(key);
  }
  const blockIds = new Set<string>();
  for (const [key, value] of entries(d.blocks, '$.blocks', STUDIO_DOCUMENT_LIMITS.maxBlocks)) {
    const b = block(value, `$.blocks.${key}`, definitions);
    const expectedKey = `${Math.round(b.position.x)},${Math.round(b.position.y)},${Math.round(b.position.z)}`;
    if (key !== expectedKey) fail(`$.blocks.${key}`, 'Block key must match the existing rounded anchor convention.');
    if (blockIds.has(b.id)) fail(`$.blocks.${key}.id`, 'Duplicate block ID.'); blockIds.add(b.id);
  }
  const blueprintIds = new Set<string>(); let blueprintBlocks = 0;
  for (const [i, value] of array(d.blueprints, '$.blueprints', STUDIO_DOCUMENT_LIMITS.maxBlueprints).entries()) {
    const path = `$.blueprints[${i}]`;
    const b = fields(value, path, ['id', 'name', 'description', 'authorId', 'authorName', 'blueprintType', 'isPublic', 'size', 'blocks', 'customBlockDefs', 'createdAt']);
    identifier(b.id, `${path}.id`); if (blueprintIds.has(b.id)) fail(path, 'Duplicate blueprint ID.'); blueprintIds.add(b.id);
    text(b.name, `${path}.name`, 256, 1); text(b.description, `${path}.description`, 10_000); text(b.authorId, `${path}.authorId`, 200); text(b.authorName, `${path}.authorName`, 256);
    choice(b.blueprintType, ['custom_block', 'structure_blueprint'], `${path}.blueprintType`); bool(b.isPublic, `${path}.isPublic`); date(b.createdAt, `${path}.createdAt`);
    const size = fields(b.size, `${path}.size`, ['lx', 'ly', 'lz']);
    for (const axis of ['lx', 'ly', 'lz']) number(size[axis], `${path}.size.${axis}`, 0.01, STUDIO_DOCUMENT_LIMITS.maxCoordinate * 2);
    const localDefinitions = new Set(definitions); const ownIds = new Set<string>();
    for (const [j, value] of array(b.customBlockDefs, `${path}.customBlockDefs`, STUDIO_DOCUMENT_LIMITS.maxDefinitions).entries()) {
      const def = definition(value, `${path}.customBlockDefs[${j}]`);
      if (ownIds.has(def.id)) fail(path, 'Duplicate blueprint definition ID.'); ownIds.add(def.id); localDefinitions.add(def.id);
    }
    const blocks = array(b.blocks, `${path}.blocks`, STUDIO_DOCUMENT_LIMITS.maxBlueprintBlocks);
    blueprintBlocks += blocks.length;
    if (blueprintBlocks > STUDIO_DOCUMENT_LIMITS.maxBlueprintBlocks) throw new Invalid(path, 'Aggregate blueprint block limit exceeded.', 'size-limit');
    const ids = new Set<string>();
    for (const [j, value] of blocks.entries()) { const item = block(value, `${path}.blocks[${j}]`, localDefinitions); if (ids.has(item.id)) fail(path, 'Duplicate blueprint block ID.'); ids.add(item.id); }
  }
}
function validateConfiguration(d: Record<string, any>): void {
  const c = fields(d.chunkConfig, '$.chunkConfig', ['chunkSize', 'activeChunks', 'unlockedChunks', 'showChunkBorders', 'autoCullDistanceChunks'], ['chunkHeight', 'cellSubdivision']);
  number(c.chunkSize, '$.chunkConfig.chunkSize', 1, 256, true);
  if (c.chunkHeight !== undefined) number(c.chunkHeight, '$.chunkConfig.chunkHeight', 1, 1024, true);
  if (c.cellSubdivision !== undefined) number(c.cellSubdivision, '$.chunkConfig.cellSubdivision', 0.01, 64);
  bool(c.showChunkBorders, '$.chunkConfig.showChunkBorders'); number(c.autoCullDistanceChunks, '$.chunkConfig.autoCullDistanceChunks', 0, 64, true);
  const validChunk = (key: unknown, path: string) => { text(key, path, 40, 1); if (!/^-?\d+,-?\d+$/.test(key) || key.split(',').some(v => !Number.isSafeInteger(Number(v)) || Math.abs(Number(v)) > STUDIO_DOCUMENT_LIMITS.maxCoordinate)) fail(path, 'Invalid chunk coordinate.'); };
  for (const [key, value] of entries(c.activeChunks, '$.chunkConfig.activeChunks', STUDIO_DOCUMENT_LIMITS.maxChunks)) { validChunk(key, '$.chunkConfig.activeChunks'); bool(value, `$.chunkConfig.activeChunks.${key}`); }
  const unlocked = array(c.unlockedChunks, '$.chunkConfig.unlockedChunks', STUDIO_DOCUMENT_LIMITS.maxChunks);
  for (const key of unlocked) validChunk(key, '$.chunkConfig.unlockedChunks');
  if (new Set(unlocked).size !== unlocked.length) fail('$.chunkConfig.unlockedChunks', 'Duplicate chunk.');
  const p = fields(d.patternConfig, '$.patternConfig', ['enabled', 'pixelsPerBlock', 'artStyle', 'seed', 'evolutionPhase', 'autoEvolveLoop', 'evolveSpeed', 'hueShiftSpread', 'luminanceJitter', 'roughnessVariance', 'spatialScale', 'seamBlendStrength', 'weatheringMossIntensity', 'uvAutoRotate'], ['megaSpritemapMode', 'smartPlacementPrediction', 'colorSimilarityThreshold']);
  for (const key of ['enabled', 'autoEvolveLoop', 'uvAutoRotate']) bool(p[key], `$.patternConfig.${key}`);
  for (const key of ['megaSpritemapMode', 'smartPlacementPrediction']) if (p[key] !== undefined) bool(p[key], `$.patternConfig.${key}`);
  choice(p.pixelsPerBlock, [16, 32, 64], '$.patternConfig.pixelsPerBlock'); choice(p.artStyle, ['pixel_art_hd', 'hand_painted', 'chiseled_pbr'], '$.patternConfig.artStyle');
  number(p.seed, '$.patternConfig.seed', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true);
  for (const [key, min, max] of [['evolutionPhase', 0, 1000], ['evolveSpeed', 0, 10], ['hueShiftSpread', 0, 360], ['luminanceJitter', 0, 1], ['roughnessVariance', 0, 1], ['spatialScale', 0.01, 64], ['seamBlendStrength', 0, 1], ['weatheringMossIntensity', 0, 1]] as const) number(p[key], `$.patternConfig.${key}`, min, max);
  if (p.colorSimilarityThreshold !== undefined) number(p.colorSimilarityThreshold, '$.patternConfig.colorSimilarityThreshold', 0, 512);
  if (d.lightingConfig !== undefined) {
    const l = fields(d.lightingConfig, '$.lightingConfig', ['timeOfDay', 'sunAzimuth', 'sunIntensity', 'ambientIntensity', 'shadowsEnabled', 'pointLightsEnabled', 'fogDensity']);
    for (const [key, min, max] of [['timeOfDay', 0, 24], ['sunAzimuth', 0, 360], ['sunIntensity', 0, 10], ['ambientIntensity', 0, 10], ['fogDensity', 0, 1]] as const) number(l[key], `$.lightingConfig.${key}`, min, max);
    bool(l.shadowsEnabled, '$.lightingConfig.shadowsEnabled'); bool(l.pointLightsEnabled, '$.lightingConfig.pointLightsEnabled');
  }
}

export function validateStudioDocument(value: unknown): DocumentResult<StudioDocument> {
  try {
    jsonPreflight(value);
    const d = fields(value, '$', ['format', 'schemaVersion', 'documentId', 'revision', 'historyEpoch', 'savedAt', 'world', 'blocks', 'customBlocks', 'blueprints', 'chunkConfig', 'patternConfig'], ['lightingConfig', 'extensions', 'targetPolicy']);
    if (d.format !== 'lfs-studio-project' || ![1, 2].includes(d.schemaVersion)) throw new Invalid('$', 'Unsupported project format or schema version; original data was not changed.', 'unsupported-schema');
    identifier(d.documentId, '$.documentId'); identifier(d.historyEpoch, '$.historyEpoch'); number(d.revision, '$.revision', 0, Number.MAX_SAFE_INTEGER, true); date(d.savedAt, '$.savedAt');
    const world = fields(d.world, '$.world', ['worldId', 'worldName', 'roomCode', 'isPublicWorld'], ['description']);
    identifier(world.worldId, '$.world.worldId'); text(world.worldName, '$.world.worldName', 512, 1); text(world.roomCode, '$.world.roomCode', 200); bool(world.isPublicWorld, '$.world.isPublicWorld');
    if (world.description !== undefined) text(world.description, '$.world.description', 10_000);
    if (d.extensions !== undefined) record(d.extensions, '$.extensions');
    validateContents(d); validateConfiguration(d);
    if (d.schemaVersion === 1 && Object.hasOwn(d, 'targetPolicy')) fail('$.targetPolicy', 'Target policy requires schema version 2; it cannot be ignored by a schema-1 project.');
    if (d.schemaVersion === 2) {
      try { validateStudioTargetPolicy(d.targetPolicy, d as StudioDocument); }
      catch (error) { fail('$.targetPolicy', error instanceof Error ? error.message : 'Invalid target policy.'); }
    }
    const json = JSON.stringify(value);
    if (encoder.encode(json).byteLength > STUDIO_DOCUMENT_LIMITS.maxBytes) throw new Invalid('$', 'Document byte limit exceeded.', 'size-limit');
    return { ok: true, value: JSON.parse(json) as StudioDocument };
  } catch (error) {
    const invalid = error instanceof Invalid ? error : new Invalid('$', 'Could not safely read project data.');
    return { ok: false, error: { code: invalid.code, message: invalid.message, issues: [{ path: invalid.path, message: invalid.message }] } };
  }
}

export function parseStudioDocument(raw: string): DocumentResult<StudioDocument> {
  if (typeof raw !== 'string' || raw.length > STUDIO_DOCUMENT_LIMITS.maxBytes || encoder.encode(raw).byteLength > STUDIO_DOCUMENT_LIMITS.maxBytes) return { ok: false, error: { code: 'size-limit', message: 'Project file exceeds the byte limit.', issues: [] } };
  try { return validateStudioDocument(JSON.parse(raw)); }
  catch { return { ok: false, error: { code: 'invalid-document', message: 'Project file is not valid JSON; original data was not changed.', issues: [] } }; }
}

export { createStudioId } from './studioId';
