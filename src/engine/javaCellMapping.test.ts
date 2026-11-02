import assert from 'node:assert/strict';
import test from 'node:test';
import { captureJavaDefinitionBinding, JAVA_CELL_MAPPING_CONTRACT, validateJavaCellMapping, validateJavaDefinitionBindings, type JavaDefinitionBinding, type JavaCellMappingResult } from './javaCellMapping';
import { JAVA_SCHEMATIC_PROFILE, type CandidateJavaBlockState } from './javaProfile';
import { validateJavaSchematicInput } from './javaSchematic';
import { computeWorldCameraBounds } from './viewportNavigation';
import type { CustomBlockDefinition, PlacedBlock } from './types';

function def(id = 'reviewed_cube'): CustomBlockDefinition {
  return { id, name: 'Explicit reviewed material', shape: 'cube', width: 1, depth: 1, heightPlates: 3, color: '#7E8B9B', texturePattern: 'cobblestone', materialFinish: 'matte', hasStuds: false };
}
function binding(definition = def(), state: CandidateJavaBlockState = 'minecraft:stone'): JavaDefinitionBinding {
  const result = captureJavaDefinitionBinding(definition, state); assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Fixture capture failed'); return result.binding;
}
function placed(x = 0, y = 0, z = 0, definitionId = 'reviewed_cube'): PlacedBlock {
  return { id: `block:${x}:${y}:${z}`, blockDefId: definitionId, position: { x, y, z }, rotation: 0 };
}
function fixture(blocks: PlacedBlock[] = [placed()], definition = def()) {
  return { blocks: Object.fromEntries(blocks.map(block => [`${block.position.x},${block.position.y},${block.position.z}`, block])), definitions: { [definition.id]: definition }, bindings: [binding(definition)] };
}
function success(result: JavaCellMappingResult) { assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('Mapping failed'); return result; }
function rejected(result: JavaCellMappingResult, code: string) {
  assert.equal(result.ok, false); if (result.ok) throw new Error('Unexpected success');
  assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify(result));
  assert.equal('cells' in result, false, 'Rejection must not expose a partial conversion');
  return result;
}

test('explicit binding is required; names and colors never infer a Java state', () => {
  const input = fixture(); input.definitions.reviewed_cube.name = 'minecraft:stone'; input.bindings = [];
  rejected(validateJavaCellMapping(input), 'missing-binding');
  const output = success(validateJavaCellMapping(fixture()));
  assert.deepEqual(output.cells, [{ x: 0, y: 0, z: 0, blockState: 'minecraft:stone' }]);
  assert.equal(output.report.contract.nativeQualification, 'not-run');
  assert.equal(output.report.materialSubstitutions[0].instances, 1);
});

test('asymmetric negative anchors keep XYZ signs and explicitly reconcile half-cell render corners', () => {
  const input = fixture([placed(-4, 2, 1), placed(-2, 4, 3), placed(-3, 2, 4)]);
  const output = success(validateJavaCellMapping({ ...input, anchor: { x: -8, y: 0, z: 2 } }));
  assert.deepEqual(output.cells.map(({ x, y, z }) => [x, y, z]), [[-4, 2, 1], [-3, 2, 4], [-2, 4, 3]]);
  assert.deepEqual(output.bounds, { min: { x: -4, y: 2, z: 1 }, max: { x: -2, y: 4, z: 4 } });
  assert.equal(output.report.volume, 36); assert.equal(output.report.implicitAirCells, 33);
  // Independent existing renderer-navigation bounds are nominal occupancy, not mesh pixels.
  const render = computeWorldCameraBounds(input.blocks, input.definitions);
  assert.deepEqual(render.min.toArray(), [-4.5, 2, 0.5]);
  assert.deepEqual(render.max.toArray(), [-1.5, 5, 4.5]);
  assert.deepEqual([render.min.x + 0.5, render.min.y, render.min.z + 0.5], [-4, 2, 1]);
  const encodedInput = validateJavaSchematicInput({ cells: output.cells, bounds: output.bounds, anchor: output.report.anchor, name: 'Asymmetric fixture', source: { documentId: 'fixture', revision: 7, historyEpoch: 'epoch-1' } });
  assert.equal(encodedInput.ok, true);
  if (encodedInput.ok) assert.deepEqual(encodedInput.report.offset, { x: 4, y: 2, z: -1 });
});

test('three admitted solids map by captured assignment and explicit empty cells stay air', () => {
  const definitions = Object.fromEntries(['a', 'b', 'c'].map(id => [id, def(id)]));
  const states = ['minecraft:stone', 'minecraft:cobblestone', 'minecraft:oak_planks'] as const;
  const bindings = ['a', 'b', 'c'].map((id, i) => binding(definitions[id], states[i]));
  const blocks = Object.fromEntries(['a', 'b', 'c'].map((id, i) => [`${i},0,0`, placed(i, 0, 0, id)]));
  const output = success(validateJavaCellMapping({ definitions, blocks, bindings, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } } }));
  assert.deepEqual(output.cells.map(cell => cell.blockState), states); assert.equal(output.report.implicitAirCells, 1);
  assert.equal(captureJavaDefinitionBinding(def(), 'minecraft:air').ok, false, 'Occupied solid cannot silently become air');
});

test('definition signatures and mapping identity are deterministic across object and binding order', () => {
  const a = def('a'), b = def('b'), reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.deepEqual(captureJavaDefinitionBinding(reordered, 'minecraft:stone'), captureJavaDefinitionBinding(a, 'minecraft:stone'));
  const first = validateJavaDefinitionBindings([binding(b), binding(a)]), second = validateJavaDefinitionBindings([binding(a), binding(b)]);
  assert.deepEqual(first, second); assert.equal(first.ok, true);
  if (first.ok) assert.ok(first.identity.includes(JAVA_CELL_MAPPING_CONTRACT.subsetIdentity.replaceAll('"', '\\"')));
  assert.equal(JAVA_CELL_MAPPING_CONTRACT.profileId, JAVA_SCHEMATIC_PROFILE.id);
});

test('edited definitions invalidate a captured assignment even when ID and geometry stay the same', () => {
  for (const patch of [{ name: 'Changed' }, { color: '#ffffff' }, { texturePattern: 'oak_planks' }, { materialFinish: 'plastic' }, { isCustom: true }, { defaultScale: { x: 1, y: 1, z: 1 } }]) {
    const input = fixture(); Object.assign(input.definitions.reviewed_cube, patch);
    rejected(validateJavaCellMapping(input), 'definition-changed');
  }
});

test('all standard box branches require unit dimensions and no extra geometry', () => {
  for (const shape of ['brick', 'cube', 'plate', 'tile'] as const) {
    const definition = { ...def(), shape, defaultScale: { x: 1, y: 1, z: 1 } };
    success(validateJavaCellMapping(fixture([placed()], definition)));
  }
  for (const patch of [{ shape: 'slope' }, { shape: 'arch' }, { shape: 'cylinder' }, { shape: 'micro_voxel' }, { width: 2 }, { depth: 0.5 }, { heightPlates: 1 }, { hasStuds: true }, { voxels: [] }, { width: NaN }]) {
    assert.equal(captureJavaDefinitionBinding({ ...def(), ...patch }, 'minecraft:stone').ok, false, JSON.stringify(patch));
  }
});

test('scaled compensation, mirrors, rotation and per-instance appearances reject instead of flattening', () => {
  assert.equal(captureJavaDefinitionBinding({ ...def(), width: 2, defaultScale: { x: 0.5, y: 1, z: 1 } }, 'minecraft:stone').ok, false);
  for (const patch of [{ rotation: 90 }, { rotation: 360 }, { rotation: NaN }, { customScale: { x: -1, y: 1, z: 1 } }, { customScale: { x: 1, y: 0.999999, z: 1 } }, { colorOverride: '#7E8B9B' }, { textureOverride: 'cobblestone' }, { materialOverride: 'matte' }]) {
    const input = fixture(); Object.assign(input.blocks['0,0,0'], patch);
    rejected(validateJavaCellMapping(input), 'unsupported-transform');
  }
  const input = fixture(); input.blocks['0,0,0'].customScale = { x: 1, y: 1, z: 1 }; success(validateJavaCellMapping(input));
});

test('fractional, nonfinite and extreme cell addresses reject without rounding or source mutation', () => {
  for (const value of [0.5, -0.5, 1.00000001, NaN, Infinity, -Infinity, 1_000_001, Number.MAX_SAFE_INTEGER]) {
    const input = fixture(); input.blocks['0,0,0'].position.x = value;
    rejected(validateJavaCellMapping(input), 'off-grid'); assert.ok(Object.is(input.blocks['0,0,0'].position.x, value));
  }
  success(validateJavaCellMapping(fixture([placed(-1_000_000, 1_000_000, 1_000_000)])));
});

test('missing definitions, changed keys, missing or unsupported assignments reject atomically', () => {
  const missing = fixture(); delete missing.definitions.reviewed_cube; rejected(validateJavaCellMapping(missing), 'missing-definition');
  const badKey = fixture(); badKey.blocks.bad = badKey.blocks['0,0,0']; delete badKey.blocks['0,0,0']; rejected(validateJavaCellMapping(badKey), 'invalid-block-key');
  const idMismatch = fixture(); idMismatch.definitions.reviewed_cube.id = 'other'; rejected(validateJavaCellMapping(idMismatch), 'invalid-input');
  for (const state of ['minecraft:dirt', 'stone', 'minecraft:stone[unknown=x]', '', undefined]) {
    const input = fixture(); (input.bindings[0] as any) = { ...input.bindings[0], blockState: state };
    rejected(validateJavaCellMapping(input), state === undefined ? 'unsupported-block-state' : 'unsupported-block-state');
  }
});

test('duplicate occupancy and duplicate placement IDs reject; no partial cell result escapes', () => {
  const input = fixture(); input.blocks.alias = { ...placed(), id: 'different' };
  rejected(validateJavaCellMapping(input), 'overlapping-occupancy');
  const duplicateId = fixture([placed(), { ...placed(1), id: placed().id }]); rejected(validateJavaCellMapping(duplicateId), 'duplicate-block-id');
});

test('unused captured definitions may be absent while malformed unused bindings still reject', () => {
  const input = fixture(); input.bindings.push(binding(def('not_in_world')));
  const output = success(validateJavaCellMapping(input)); assert.equal(output.report.materialSubstitutions.length, 1);
  const broken = { ...input, bindings: [...input.bindings, { ...binding(def('unused')), definitionSignature: 'bad' }] };
  rejected(validateJavaCellMapping(broken), 'invalid-binding');
  rejected(validateJavaCellMapping({ ...input, bindings: [input.bindings[0], input.bindings[0]] }), 'invalid-binding');
});

test('captured identity rejects mismatched IDs, noncanonical JSON and modified geometry payload', () => {
  const good = binding();
  for (const patch of [{ definitionId: 'other' }, { definitionSignature: good.definitionSignature + ' ' }, { definitionSignature: good.definitionSignature.replace('"width":1', '"width":2') }, { definitionSignature: 'lfs-java-definition-v1:{"__proto__":{}}' }, { definitionSignature: 'x'.repeat(4097) }]) {
    assert.equal(validateJavaDefinitionBindings([{ ...good, ...patch }]).ok, false);
  }
});

test('explicit bounds never clip; empty selection and unresolved empty world remain distinguishable', () => {
  const region = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  const empty = success(validateJavaCellMapping({ blocks: {}, definitions: {}, bindings: [] })); assert.equal(empty.bounds, null); assert.equal(empty.report.anchor, null); assert.equal(empty.report.volume, 0);
  const air = success(validateJavaCellMapping({ blocks: {}, definitions: {}, bindings: [], bounds: region })); assert.equal(air.report.implicitAirCells, 27);
  rejected(validateJavaCellMapping({ ...fixture([placed(2)]), bounds: region }), 'out-of-bounds');
  rejected(validateJavaCellMapping({ ...fixture(), bounds: { min: region.max, max: region.min } }), 'invalid-input');
});

test('dense volume and dimensions are checked for selected and sparse-derived bounds', () => {
  const exact = { min: { x: 0, y: 0, z: 0 }, max: { x: 99, y: 99, z: 9 } };
  assert.equal(success(validateJavaCellMapping({ ...fixture(), bounds: exact })).report.volume, 100_000);
  rejected(validateJavaCellMapping({ ...fixture(), bounds: { ...exact, max: { x: 100, y: 99, z: 9 } } }), 'work-limit');
  rejected(validateJavaCellMapping(fixture([placed(), placed(1000, 1000, 1000)])), 'work-limit');
  rejected(validateJavaCellMapping(fixture([placed(), placed(65_535)])), 'work-limit');
  assert.equal(success(validateJavaCellMapping(fixture([placed(), placed(65_534)]))).report.volume, 65_535);
});

test('collection capacities reject before reading child payloads and issue reporting is capped', () => {
  let reads = 0;
  const oversized = Object.create(null);
  for (let i = 0; i <= JAVA_CELL_MAPPING_CONTRACT.limits.maxBlocks; i++) Object.defineProperty(oversized, String(i), { enumerable: true, get() { reads++; throw new Error('Unexpected read'); } });
  rejected(validateJavaCellMapping({ ...fixture(), blocks: oversized }), 'work-limit'); assert.equal(reads, 0);
  const tooManyBindings = Array(4097); assert.equal(validateJavaDefinitionBindings(tooManyBindings).ok, false);
  const input = fixture(Array.from({ length: 101 }, (_, i) => placed(i))); input.bindings = [];
  const errors = rejected(validateJavaCellMapping(input), 'missing-binding'); assert.equal(errors.issues.length, 100); assert.equal(errors.issuesTruncated, true);
});

test('getters, unknown fields, unsafe keys and sparse/decorated arrays fail without execution', () => {
  let reads = 0; const input = fixture();
  Object.defineProperty(input.blocks['0,0,0'], 'rotation', { enumerable: true, get() { reads++; return 0; } });
  rejected(validateJavaCellMapping(input), 'invalid-input'); assert.equal(reads, 0);
  const definition = def(); Object.defineProperty(definition, 'name', { enumerable: true, get() { reads++; return 'bad'; } });
  assert.equal(captureJavaDefinitionBinding(definition, 'minecraft:stone').ok, false); assert.equal(reads, 0);
  assert.equal(validateJavaCellMapping({ ...fixture(), entities: [] }).ok, false);
  assert.equal(validateJavaDefinitionBindings(Array(1)).ok, false);
  const decorated: any = [binding()]; decorated.extra = true; assert.equal(validateJavaDefinitionBindings(decorated).ok, false);
  assert.equal(validateJavaCellMapping({ ...fixture(), definitions: JSON.parse('{"__proto__":{}}') }).ok, false);
});

test('mapping is independent of insertion order, preserves caller data and returns immutable copies', () => {
  const input = fixture([placed(2), placed(-1), placed(0, 1)]), before = structuredClone(input);
  const output = success(validateJavaCellMapping(input));
  const shuffled = { ...input, blocks: Object.fromEntries(Object.entries(input.blocks).reverse()) };
  assert.deepEqual(validateJavaCellMapping(shuffled), output); assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input.blocks), false); assert.equal(Object.isFrozen(output.cells), true); assert.equal(Object.isFrozen(output.cells[0]), true);
  input.blocks['2,0,0'].position.x = 88; input.definitions.reviewed_cube.color = '#123456';
  assert.equal(output.cells.some(cell => cell.x === 88), false);
});
