/**
 * Pure candidate Freeform -> Java cell adapter. Not a lock, conversion approval,
 * native registry validator, or renderer/material fidelity guarantee. Callers own
 * review, immutable source/session identity, activation and durable history.
 */
import { JAVA_SCHEMATIC_PROFILE, type CandidateJavaBlockState } from './javaProfile';
import type { JavaCellPosition, JavaSchematicCell, JavaSchematicInput } from './javaSchematic';
import type { CustomBlockDefinition, PlacedBlock } from './types';

const PROFILE = JAVA_SCHEMATIC_PROFILE;
const SIGNATURE_PREFIX = 'lfs-java-definition-v1:';
const LIMITS = Object.freeze({ maxBlocks: 100_000, maxDefinitions: 4_096, maxBindings: 4_096, maxIssues: 100, maxCoordinate: 1_000_000, maxSignatureCharacters: 4_096 });
/** Exact serialized identities, not hashes and not proof of a native registry. */
export const JAVA_CELL_MAPPING_CONTRACT = Object.freeze({
  revision: 'lfs-java-unit-cell-mapping-v1',
  validatorRevision: 'lfs-java-unit-cell-validator-v1',
  definitionSignatureVersion: 'lfs-java-definition-v1',
  profileId: PROFILE.id,
  subsetIdentity: JSON.stringify({ profileId: PROFILE.id, gameVersion: PROFILE.gameVersion, dataVersion: PROFILE.dataVersion, schematicVersion: PROFILE.schematicVersion, blockStates: PROFILE.blockStates }),
  coordinatePolicy: 'identity-cell-address;studio-point-to-java-point=(x+0.5,y,z+0.5)',
  geometryPolicy: 'nominal-unit-box;presentation-inset-not-exported',
  appearancePolicy: 'explicit-reviewed-definition-substitution;no-instance-overrides',
  rotationPolicy: 'zero-only',
  airPolicy: 'empty-cells-only;solid-to-air-forbidden',
  nativeQualification: 'not-run',
  limits: LIMITS,
} as const);

export interface JavaDefinitionBinding {
  readonly definitionId: string;
  /** Exact canonical bounded definition data, including appearance and name. */
  readonly definitionSignature: string;
  readonly blockState: CandidateJavaBlockState;
}
export type JavaCellMappingIssueCode = 'invalid-input' | 'work-limit' | 'unsupported-geometry' | 'unsupported-transform' | 'unsupported-block-state' | 'invalid-binding' | 'missing-definition' | 'missing-binding' | 'definition-changed' | 'off-grid' | 'overlapping-occupancy' | 'duplicate-block-id' | 'invalid-block-key' | 'out-of-bounds';
export interface JavaCellMappingIssue { readonly code: JavaCellMappingIssueCode; readonly path: string; readonly message: string }
export interface JavaCellMappingFailure { readonly ok: false; readonly issues: readonly JavaCellMappingIssue[]; readonly issuesTruncated: boolean }
export type JavaDefinitionBindingCapture = { readonly ok: true; readonly binding: JavaDefinitionBinding } | JavaCellMappingFailure;
export type JavaDefinitionBindingsValidation = { readonly ok: true; readonly bindings: readonly JavaDefinitionBinding[]; readonly identity: string } | JavaCellMappingFailure;
export interface JavaCellMappingInput {
  readonly blocks: Readonly<Record<string, PlacedBlock>>;
  readonly definitions: Readonly<Record<string, CustomBlockDefinition>>;
  readonly bindings: readonly JavaDefinitionBinding[];
  /** Canonical cell addresses, inclusive. Omission derives occupied bounds. No clipping. */
  readonly bounds?: JavaSchematicInput['bounds'];
  /** Canonical paste anchor. Omission leaves it unresolved, never guessed. */
  readonly anchor?: JavaCellPosition;
}
export interface JavaCellMappingReport {
  readonly contract: typeof JAVA_CELL_MAPPING_CONTRACT;
  readonly bindingIdentity: string;
  readonly inputBlocks: number;
  readonly mappedCells: number;
  readonly bounds: JavaSchematicInput['bounds'] | null;
  readonly anchor: JavaCellPosition | null;
  readonly volume: number;
  readonly implicitAirCells: number;
  readonly sourceIdentityKind: 'caller-must-bind-to-document-session-revision';
  readonly materialSubstitutions: readonly { readonly definitionId: string; readonly blockState: CandidateJavaBlockState; readonly instances: number }[];
}
export type JavaCellMappingResult = { readonly ok: true; readonly cells: readonly JavaSchematicCell[]; readonly bounds: JavaSchematicInput['bounds'] | null; readonly report: JavaCellMappingReport } | JavaCellMappingFailure;

class Invalid extends Error {
  constructor(readonly code: JavaCellMappingIssueCode, readonly path: string, message: string) { super(message); }
}
function fail(code: JavaCellMappingIssueCode, path: string, message: string): never { throw new Invalid(code, path, message); }
function issue(error: unknown): JavaCellMappingIssue {
  if (error instanceof Invalid) return { code: error.code, path: error.path, message: error.message };
  // Proxies are not a sandbox boundary; ordinary descriptor/access errors fail closed.
  return { code: 'invalid-input', path: '$', message: 'Input could not be safely inspected.' };
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
function failure(error: unknown): JavaCellMappingFailure { return immutable({ ok: false, issues: [issue(error)], issuesTruncated: false }); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid-input', path, 'Expected a plain data object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, path: string, limit: number): string[] {
  const result = Reflect.ownKeys(value);
  if (result.length > limit) fail('work-limit', path, `At most ${limit} entries are supported.`);
  return result.map(key => {
    if (typeof key !== 'string' || key.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('invalid-input', path, 'Unsupported or oversized object key.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail('invalid-input', `${path}.${key}`, 'Expected an enumerable data property; getters are unsupported.');
    return key;
  });
}
function fields(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const result = object(value, path), names = keys(result, path, required.length + optional.length);
  for (const name of names) if (![...required, ...optional].includes(name)) fail('invalid-input', `${path}.${name}`, 'Unsupported field.');
  for (const name of required) if (!Object.hasOwn(result, name)) fail('invalid-input', `${path}.${name}`, 'Required field is missing.');
  return result;
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) fail('invalid-input', path, 'Expected a bounded identifier.');
  return value;
}
function unitScale(value: unknown, path: string): { x: 1; y: 1; z: 1 } {
  const scale = fields(value, path, ['x', 'y', 'z']);
  if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) fail('unsupported-transform', path, 'Only identity scale is admitted; compensating dimensions and scales are unsupported.');
  return { x: 1, y: 1, z: 1 };
}
function coordinate(value: unknown, path: string): JavaCellPosition {
  const point = fields(value, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z']) if (typeof point[axis] !== 'number' || !Number.isSafeInteger(point[axis]) || Math.abs(point[axis] as number) > LIMITS.maxCoordinate) fail('off-grid', `${path}.${axis}`, 'Expected an integer cell address within ±1000000. No rounding is performed.');
  return { x: (point.x as number) || 0, y: (point.y as number) || 0, z: (point.z as number) || 0 };
}
function definition(value: unknown, path: string): Record<string, unknown> {
  const def = fields(value, path, ['id', 'name', 'shape', 'width', 'depth', 'heightPlates', 'color', 'texturePattern', 'materialFinish', 'hasStuds'], ['voxels', 'isCustom', 'defaultScale']);
  const id = identifier(def.id, `${path}.id`);
  if (typeof def.name !== 'string' || !def.name.length || def.name.length > 256 || /[\u0000-\u001f]/.test(def.name)) fail('invalid-input', `${path}.name`, 'Expected a bounded nonempty definition name.');
  if (!['brick', 'cube', 'plate', 'tile'].includes(def.shape as string) || def.width !== 1 || def.depth !== 1 || def.heightPlates !== 3 || def.hasStuds !== false || def.voxels !== undefined) fail('unsupported-geometry', path, 'Only a nominal 1×1×1 standard box (3 plates), without studs or voxel payload, is representable.');
  if (typeof def.color !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(def.color)) fail('invalid-input', `${path}.color`, 'Expected a hexadecimal color.');
  if (!['smooth_abs', 'cobblestone', 'cobble', 'oak_planks', 'wood_grain', 'wood_plank', 'tech_panel', 'metallic_brushed', 'checker_tile', 'brick_masonry', 'brick_mortar', 'brick', 'roof_tiles', 'glass_grid', 'grass_top'].includes(def.texturePattern as string)) fail('invalid-input', `${path}.texturePattern`, 'Unsupported source texture pattern.');
  if (!['plastic', 'matte', 'satin', 'pearl', 'metallic', 'glass', 'translucent', 'neon'].includes(def.materialFinish as string)) fail('invalid-input', `${path}.materialFinish`, 'Unsupported source material finish.');
  if (def.isCustom !== undefined && typeof def.isCustom !== 'boolean') fail('invalid-input', `${path}.isCustom`, 'Expected a boolean.');
  const canonical: Record<string, unknown> = { id, name: def.name, shape: def.shape, width: 1, depth: 1, heightPlates: 3, color: def.color, texturePattern: def.texturePattern, materialFinish: def.materialFinish, hasStuds: false };
  if (def.isCustom !== undefined) canonical.isCustom = def.isCustom;
  if (def.defaultScale !== undefined) canonical.defaultScale = unitScale(def.defaultScale, `${path}.defaultScale`);
  return canonical;
}
function solidState(value: unknown, path: string): CandidateJavaBlockState {
  if (!PROFILE.blockStates.includes(value as CandidateJavaBlockState) || value === 'minecraft:air') fail('unsupported-block-state', path, 'Assign an explicit admitted solid state: stone, cobblestone or oak_planks. Air cannot replace occupied geometry.');
  return value as CandidateJavaBlockState;
}

/** Captures an explicit proposed assignment. This call does not certify human review. */
export function captureJavaDefinitionBinding(value: unknown, blockState: CandidateJavaBlockState): JavaDefinitionBindingCapture {
  try {
    const captured = definition(value, '$.definition');
    return immutable({ ok: true, binding: { definitionId: captured.id as string, definitionSignature: SIGNATURE_PREFIX + JSON.stringify(captured), blockState: solidState(blockState, '$.blockState') } });
  } catch (error) { return failure(error); }
}

/** Validate captured data even when an unused definition is absent from this world. */
export function validateJavaDefinitionBindings(value: unknown): JavaDefinitionBindingsValidation {
  try {
    if (!Array.isArray(value) || value.length > LIMITS.maxBindings) fail('work-limit', '$.bindings', 'Expected at most 4096 definition bindings.');
    const descriptors = Reflect.ownKeys(value);
    if (descriptors.length !== value.length + 1 || descriptors.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) fail('invalid-binding', '$.bindings', 'Sparse or decorated binding arrays are unsupported.');
    const bindings: JavaDefinitionBinding[] = [], seen = new Set<string>();
    for (let index = 0; index < value.length; index++) {
      const path = `$.bindings[${index}]`, descriptor = Object.getOwnPropertyDescriptor(value, String(index))!;
      if (!descriptor.enumerable || !('value' in descriptor)) fail('invalid-binding', path, 'Expected a binding data entry.');
      const binding = fields(descriptor.value, path, ['definitionId', 'definitionSignature', 'blockState']);
      const definitionId = identifier(binding.definitionId, `${path}.definitionId`);
      if (seen.has(definitionId)) fail('invalid-binding', path, 'Each definition has exactly one assignment.');
      seen.add(definitionId);
      if (typeof binding.definitionSignature !== 'string' || binding.definitionSignature.length > LIMITS.maxSignatureCharacters || !binding.definitionSignature.startsWith(SIGNATURE_PREFIX)) fail('invalid-binding', `${path}.definitionSignature`, 'Unsupported or oversized definition signature.');
      let captured: unknown;
      try { captured = JSON.parse(binding.definitionSignature.slice(SIGNATURE_PREFIX.length)); }
      catch { fail('invalid-binding', `${path}.definitionSignature`, 'Definition signature is not valid captured JSON.'); }
      const canonical = definition(captured, `${path}.definitionSignature`);
      if (canonical.id !== definitionId || SIGNATURE_PREFIX + JSON.stringify(canonical) !== binding.definitionSignature) fail('invalid-binding', path, 'Captured definition identity or canonical encoding does not match.');
      bindings.push({ definitionId, definitionSignature: binding.definitionSignature, blockState: solidState(binding.blockState, `${path}.blockState`) });
    }
    bindings.sort((a, b) => a.definitionId < b.definitionId ? -1 : a.definitionId > b.definitionId ? 1 : 0);
    return immutable({ ok: true, bindings, identity: JSON.stringify({ contract: JAVA_CELL_MAPPING_CONTRACT, bindings }) });
  } catch (error) { return failure(error); }
}

function bounds(value: unknown, path: string): { value: JavaSchematicInput['bounds']; volume: number } {
  const selected = fields(value, path, ['min', 'max']), min = coordinate(selected.min, `${path}.min`), max = coordinate(selected.max, `${path}.max`);
  let volume = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const size = max[axis] - min[axis] + 1;
    if (size < 1) fail('invalid-input', path, 'Selected bounds must be ordered and inclusive.');
    if (size > PROFILE.limits.maxDimension || size > Math.floor(PROFILE.limits.maxVolume / volume)) fail('work-limit', path, 'Selected dimensions or dense volume exceed the candidate schematic budget.');
    volume *= size;
  }
  return { value: { min, max }, volume };
}

/**
 * Maps every supplied block, never clips/skips/substitutes a rejected placement.
 * Failed results expose no partial canonical cells. Synchronous work is bounded;
 * this is not a worker, responsiveness promise, or untrusted-code sandbox.
 */
export function validateJavaCellMapping(value: unknown): JavaCellMappingResult {
  try {
    const input = fields(value, '$', ['blocks', 'definitions', 'bindings'], ['bounds', 'anchor']);
    const sourceBlocks = object(input.blocks, '$.blocks'), blockKeys = keys(sourceBlocks, '$.blocks', LIMITS.maxBlocks).sort();
    const definitions = object(input.definitions, '$.definitions'); keys(definitions, '$.definitions', LIMITS.maxDefinitions);
    const checkedBindings = validateJavaDefinitionBindings(input.bindings);
    if (!checkedBindings.ok) return checkedBindings;
    const byDefinition = new Map(checkedBindings.bindings.map(binding => [binding.definitionId, binding]));
    const selected = input.bounds === undefined ? null : bounds(input.bounds, '$.bounds');
    const anchor = input.anchor === undefined ? null : coordinate(input.anchor, '$.anchor');
    const issues: JavaCellMappingIssue[] = [], cells: JavaSchematicCell[] = [];
    const occupied = new Set<string>(), ids = new Set<string>(), checkedDefinitions = new Map<string, string>();
    const counts = new Map<string, number>();
    let min: { x: number; y: number; z: number } | null = null, max: { x: number; y: number; z: number } | null = null, issuesTruncated = false;
    for (const key of blockKeys) {
      try {
        const path = `$.blocks.${key}`;
        const block = fields(sourceBlocks[key], path, ['id', 'blockDefId', 'position', 'rotation'], ['colorOverride', 'textureOverride', 'materialOverride', 'customScale']);
        const id = identifier(block.id, `${path}.id`), definitionId = identifier(block.blockDefId, `${path}.blockDefId`);
        if (ids.has(id)) fail('duplicate-block-id', `${path}.id`, 'Duplicate placement ID.');
        ids.add(id);
        const position = coordinate(block.position, `${path}.position`), cellKey = `${position.x},${position.y},${position.z}`;
        if (occupied.has(cellKey)) fail('overlapping-occupancy', path, 'Multiple placements occupy the same canonical cell.');
        occupied.add(cellKey);
        if (key !== cellKey) fail('invalid-block-key', path, 'Block dictionary key must equal its exact integer cell address.');
        if (block.rotation !== 0) fail('unsupported-transform', `${path}.rotation`, 'Initial mapping requires zero rotation; orientation/texture semantics have no reviewed mapping.');
        if (block.customScale !== undefined) unitScale(block.customScale, `${path}.customScale`);
        if (block.colorOverride !== undefined || block.textureOverride !== undefined || block.materialOverride !== undefined) fail('unsupported-transform', path, 'Per-placement appearance overrides require a separately reviewed definition assignment.');
        if (!Object.hasOwn(definitions, definitionId)) fail('missing-definition', `${path}.blockDefId`, 'Referenced source definition is missing.');
        let actualSignature = checkedDefinitions.get(definitionId);
        if (actualSignature === undefined) {
          const captured = definition(definitions[definitionId], `$.definitions.${definitionId}`);
          if (captured.id !== definitionId) fail('invalid-input', `$.definitions.${definitionId}`, 'Definition key and ID differ.');
          actualSignature = SIGNATURE_PREFIX + JSON.stringify(captured); checkedDefinitions.set(definitionId, actualSignature);
        }
        const binding = byDefinition.get(definitionId);
        if (!binding) fail('missing-binding', `${path}.blockDefId`, 'No explicit reviewed assignment exists for this definition.');
        if (binding.definitionSignature !== actualSignature) fail('definition-changed', `$.definitions.${definitionId}`, 'Definition differs from its captured assignment; review and recapture explicitly.');
        if (selected && (position.x < selected.value.min.x || position.x > selected.value.max.x || position.y < selected.value.min.y || position.y > selected.value.max.y || position.z < selected.value.min.z || position.z > selected.value.max.z)) fail('out-of-bounds', `${path}.position`, 'Placement is outside selected bounds. No implicit clipping is allowed.');
        cells.push({ ...position, blockState: binding.blockState });
        counts.set(definitionId, (counts.get(definitionId) ?? 0) + 1);
        if (!min || !max) { min = { ...position }; max = { ...position }; }
        else for (const axis of ['x', 'y', 'z'] as const) { min[axis] = Math.min(min[axis], position[axis]); max[axis] = Math.max(max[axis], position[axis]); }
      } catch (error) {
        if (issues.length === LIMITS.maxIssues) { issuesTruncated = true; break; }
        issues.push(issue(error));
      }
    }
    if (issues.length) return immutable({ ok: false, issues, issuesTruncated });
    const region = selected ?? (min && max ? bounds({ min, max }, '$.derivedBounds') : null);
    cells.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    const report: JavaCellMappingReport = {
      contract: JAVA_CELL_MAPPING_CONTRACT, bindingIdentity: checkedBindings.identity, inputBlocks: blockKeys.length, mappedCells: cells.length,
      bounds: region?.value ?? null, anchor, volume: region?.volume ?? 0, implicitAirCells: (region?.volume ?? 0) - cells.length,
      sourceIdentityKind: 'caller-must-bind-to-document-session-revision',
      materialSubstitutions: checkedBindings.bindings.filter(binding => counts.has(binding.definitionId)).map(binding => ({ definitionId: binding.definitionId, blockState: binding.blockState, instances: counts.get(binding.definitionId)! })),
    };
    return immutable({ ok: true, cells, bounds: report.bounds, report });
  } catch (error) { return failure(error); }
}
