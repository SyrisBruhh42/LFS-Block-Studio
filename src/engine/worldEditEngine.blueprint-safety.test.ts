import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprintFromCustomBlock, createBlueprintFromSelection, createInitialEngineState,
  executeWorldEditCommand, loadBlueprintIntoNewWorld, stampBlueprintIntoWorld,
  validateBlueprintDefinitionMerge, validateBlueprintLoad, validateBlueprintPlacement,
} from './worldEditEngine';
import type { BlueprintPrefab, CustomBlockDefinition, PlacedBlock, WorldEditEngineState } from './types';
import { prepareBlueprintImport } from '../lib/studioResourceImport';
import { makeStudioDocument } from '../lib/studioDocument.test-fixtures';
import { StudioEditorSession } from '../lib/studioEditorSession';
import { candidateJavaTarget } from '../lib/studioTargetPolicy';
import { captureJavaDefinitionBinding } from './javaCellMapping';

function state(): WorldEditEngineState {
  return { ...structuredClone(createInitialEngineState()), blocks: {}, pos1: { x: 0, y: 0, z: 0 }, pos2: { x: 0, y: 0, z: 0 } };
}
function placed(blockDefId: string, x = 0, y = 0, z = 0, id = 'source-block'): PlacedBlock {
  return { id, blockDefId, position: { x, y, z }, rotation: 0 };
}
function domain(value: WorldEditEngineState) {
  const { undoStack: _undo, redoStack: _redo, ...rest } = value; return rest;
}
function rejectEveryPlacement(original: WorldEditEngineState, blueprint: BlueprintPrefab, reason?: RegExp) {
  const before = structuredClone(original);
  const error = validateBlueprintPlacement(original, blueprint, { x: -4, y: 2, z: 7 }, 90);
  assert.ok(error);
  if (reason) assert.match(error, reason);
  assert.ok(validateBlueprintLoad(original, blueprint, false));
  assert.equal(stampBlueprintIntoWorld(original, blueprint, { x: -4, y: 2, z: 7 }, 90) === original, true);
  assert.equal(loadBlueprintIntoNewWorld(original, blueprint, false) === original, true);
  assert.deepEqual(original, before);
}

test('unequal shared definitions reject stamp/load atomically, including appearance and nested data', () => {
  const original = state();
  original.blocks['19,0,0'] = placed('voxel_lantern', 19, 0, 0, 'unrelated');
  original.customBlocks.voxel_lantern.defaultScale = { x: 1, y: 1, z: 1 };
  original.redoStack = [{ blocks: {}, label: 'preserved redo' }];
  const edits: ((definition: CustomBlockDefinition) => void)[] = [
    d => { d.color = '#123456'; }, d => { d.texturePattern = 'checker_tile'; },
    d => { d.materialFinish = 'glass'; }, d => { d.width += 1; },
    d => { d.defaultScale!.y = 2; }, d => { d.voxels![0].color = '#abcdef'; },
    d => { d.name = 'A different authored definition'; },
  ];
  for (const edit of edits) {
    const definition = structuredClone(original.customBlocks.voxel_lantern); edit(definition);
    rejectEveryPlacement(original, createBlueprintFromCustomBlock(definition), /conflicts/);
  }
  assert.equal(original.blocks['19,0,0'].blockDefId, 'voxel_lantern');
});

test('unused conflicting embedded definitions also reject; equal definitions reuse the original', () => {
  const original = state();
  const blueprint = createBlueprintFromCustomBlock({ ...original.customBlocks.grass_brick, id: 'new-definition' });
  blueprint.customBlockDefs.push({ ...original.customBlocks.voxel_lantern, color: '#123456' });
  rejectEveryPlacement(original, blueprint, /conflicts/);
  blueprint.customBlockDefs[1] = Object.fromEntries(Object.entries(original.customBlocks.voxel_lantern).reverse()) as unknown as CustomBlockDefinition;
  assert.equal(validateBlueprintDefinitionMerge(original.customBlocks, blueprint.customBlockDefs), null);
  const next = stampBlueprintIntoWorld(original, blueprint, { x: 0, y: 0, z: 0 });
  assert.notEqual(next, original);
  assert.equal(next.customBlocks.voxel_lantern, original.customBlocks.voxel_lantern);
  assert.notEqual(next.customBlocks['new-definition'], blueprint.customBlockDefs[0]);
  assert.equal(next.undoStack.length, 1);
  assert.deepEqual(domain(executeWorldEditCommand(next, '//undo').nextState), domain(original));
});

test('duplicate definitions, unknown data and missing references reject before history', () => {
  const original = state(), valid = createBlueprintFromCustomBlock(original.customBlocks.voxel_lantern);
  const changes: ((blueprint: BlueprintPrefab) => void)[] = [
    b => { b.customBlockDefs.push(structuredClone(b.customBlockDefs[0])); },
    b => { (b as any).unknown = true; },
    b => { (b.customBlockDefs[0] as any).unknown = true; },
    b => { (b.customBlockDefs[0] as any).shape = 'unsupported'; },
    b => { (b.customBlockDefs[0].voxels![0] as any).unknown = true; },
    b => { b.customBlockDefs[0].voxels![0].x = 8; },
    b => { b.blocks[0].blockDefId = 'missing-definition'; },
    b => { b.blocks.push({ ...b.blocks[0], position: { x: 1, y: 0, z: 0 } }); },
    b => { b.blocks.push({ ...b.blocks[0], id: 'other-id' }); },
    b => { b.blocks[0].position.x = 0.5; },
    b => { (b.blocks[0] as any).unknown = true; },
  ];
  for (const change of changes) { const blueprint = structuredClone(valid); change(blueprint); rejectEveryPlacement(original, blueprint); }
});

test('placement rejects accessors and oversized lists without invoking accessors', () => {
  const original = state(), blueprint = createBlueprintFromCustomBlock(original.customBlocks.voxel_lantern);
  let reads = 0;
  Object.defineProperty(blueprint.customBlockDefs[0], 'name', { enumerable: true, get() { reads++; return 'Do not read'; } });
  assert.ok(validateBlueprintPlacement(original, blueprint, { x: 0, y: 0, z: 0 }));
  assert.equal(stampBlueprintIntoWorld(original, blueprint, { x: 0, y: 0, z: 0 }) === original, true);
  assert.equal(reads, 0);
  const tooMany = new Array<CustomBlockDefinition>(4_097);
  Object.defineProperty(tooMany, '0', { get() { reads++; return original.customBlocks.grass_brick; } });
  assert.ok(validateBlueprintDefinitionMerge(original.customBlocks, tooMany));
  assert.equal(reads, 0);
});

test('combined definition capacity rejects new IDs while allowing an equivalent existing definition', () => {
  const base = state().customBlocks.grass_brick;
  const registry = Object.fromEntries(Array.from({ length: 4_096 }, (_, index) => {
    const id = `definition-${index}`; return [id, { ...base, id }];
  }));
  assert.equal(validateBlueprintDefinitionMerge(registry, [{ ...registry['definition-0'] }]), null);
  assert.match(validateBlueprintDefinitionMerge(registry, [{ ...base, id: 'over-capacity' }])!, /Combined block definitions/);
  assert.equal(Object.keys(registry).length, 4_096);
});

test('negative anchors and all quarter-turns preserve source appearance and one full undo', () => {
  const original = state();
  const definition = { ...structuredClone(original.customBlocks.voxel_lantern), id: 'nested-new', defaultScale: { x: 1, y: 2, z: 1 } };
  const blueprint = createBlueprintFromCustomBlock(definition);
  blueprint.blocks = [{ ...placed(definition.id, -2, -1, 3), rotation: 90, colorOverride: '#123456', textureOverride: 'checker_tile', materialOverride: 'glass', customScale: { x: 2, y: 1, z: 1 } }];
  const targets = [[0, -7, -4, -6, 90], [90, -8, -4, -11, 180], [180, -3, -4, -12, 270], [270, -2, -4, -7, 0]] as const;
  for (const [rotation, x, y, z, combined] of targets) {
    const next = stampBlueprintIntoWorld(original, blueprint, { x: -5, y: -3, z: -9 }, rotation);
    assert.equal(next.undoStack.length, 1);
    const block = next.blocks[`${x},${y},${z}`]; assert.ok(block); assert.equal(block.rotation, combined);
    assert.equal(block.colorOverride, '#123456'); assert.deepEqual(block.customScale, { x: 2, y: 1, z: 1 });
    assert.notEqual(block.customScale, blueprint.blocks[0].customScale);
    assert.notEqual(next.customBlocks[definition.id].voxels![0], blueprint.customBlockDefs[0].voxels![0]);
    const undone = executeWorldEditCommand(next, '//undo').nextState;
    assert.deepEqual(domain(undone), domain(original));
    assert.deepEqual(domain(executeWorldEditCommand(undone, '//redo').nextState), domain(next));
  }
});

test('repeated stamp and world load preserve block IDs, history and redo on a true no-op', () => {
  const original = state(), blueprint = createBlueprintFromCustomBlock(original.customBlocks.grass_brick);
  const stamped = stampBlueprintIntoWorld(original, blueprint, { x: -2, y: 4, z: -6 });
  stamped.blocks['-2,4,-6'].id = 'existing-stable-id';
  stamped.redoStack = [{ blocks: {}, label: 'keep redo' }];
  assert.equal(stampBlueprintIntoWorld(stamped, blueprint, { x: -2, y: 4, z: -6 }) === stamped, true);
  for (const platform of [false, true]) {
    const loaded = loadBlueprintIntoNewWorld(original, blueprint, platform);
    const first = Object.values(loaded.blocks)[0]; first.id = 'existing-load-id';
    loaded.redoStack = [{ blocks: {}, label: 'keep redo' }];
    assert.equal(loadBlueprintIntoNewWorld(loaded, blueprint, platform) === loaded, true);
  }
});

test('clipboard paste shares collision protection, reuses equal definitions and has truthful no-op count', () => {
  const original = state(); original.clipboard = [placed('grass_brick')];
  original.clipboardCustomDefs = [{ ...original.customBlocks.grass_brick, color: '#123456' }];
  const before = structuredClone(original), rejected = executeWorldEditCommand(original, '//paste');
  assert.equal(rejected.success, false); assert.match(rejected.message, /conflicts/);
  assert.equal(rejected.nextState === original, true); assert.deepEqual(original, before);
  original.clipboardCustomDefs = [structuredClone(original.customBlocks.grass_brick)];
  const accepted = executeWorldEditCommand(original, '//paste'); assert.equal(accepted.success, true); assert.equal(accepted.affectedCount, 1);
  const next = accepted.nextState; next.redoStack = [{ blocks: {}, label: 'keep redo' }];
  next.blocks['0,0,0'].id = 'retain-destination-id';
  const noop = executeWorldEditCommand(next, '//paste');
  assert.equal(noop.nextState === next, true); assert.equal(noop.affectedCount, 0); assert.match(noop.message, /nothing changed/i);
});

test('selection capture embeds deep, self-contained definitions and changed captures cannot retarget another world', () => {
  const original = state(); original.pos1 = { x: -2, y: -1, z: -3 }; original.pos2 = { x: -1, y: -1, z: -3 };
  original.blocks['-2,-1,-3'] = placed('grass_brick', -2, -1, -3, 'grass-one');
  original.blocks['-1,-1,-3'] = { ...placed('voxel_lantern', -1, -1, -3, 'lantern-one'), customScale: { x: 1, y: 2, z: 1 } };
  const blueprint = createBlueprintFromSelection(original, 'Selection', 'Deep capture'); assert.ok(blueprint);
  assert.equal(blueprint.customBlockDefs.length, 2);
  assert.deepEqual(blueprint.blocks.map(b => b.position), [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
  const previous = structuredClone(blueprint);
  original.customBlocks.voxel_lantern.voxels![0].color = '#123456';
  original.blocks['-1,-1,-3'].customScale!.x = 2;
  assert.deepEqual(blueprint, previous);
  const changed = createBlueprintFromSelection(original, 'Edited', 'Edited capture'); assert.ok(changed);
  rejectEveryPlacement(state(), changed, /conflicts/);
  assert.equal(validateBlueprintPlacement({ ...state(), customBlocks: {} }, blueprint, { x: -8, y: -2, z: -3 }), null);
});

test('capture refuses missing definitions, mismatched IDs, invalid nested fields and inconsistent anchors', () => {
  const changes: ((value: WorldEditEngineState) => void)[] = [
    s => { delete s.customBlocks.voxel_lantern; },
    s => { s.customBlocks.voxel_lantern.id = 'other'; },
    s => { (s.customBlocks.voxel_lantern.voxels![0] as any).unknown = true; },
    s => { s.blocks['0,0,0'].position.x = 1; },
  ];
  for (const change of changes) {
    const original = state(); original.blocks['0,0,0'] = placed('voxel_lantern'); change(original);
    const before = structuredClone(original);
    assert.equal(createBlueprintFromSelection(original, 'Invalid', 'Invalid'), null); assert.deepEqual(original, before);
  }
  assert.throws(() => createBlueprintFromCustomBlock({ ...state().customBlocks.grass_brick, unknown: true } as any));
  const accessorState = state(); accessorState.blocks['0,0,0'] = placed('grass_brick'); let reads = 0;
  Object.defineProperty(accessorState.customBlocks.grass_brick, 'name', { enumerable: true, get() { reads++; return 'Do not read'; } });
  assert.equal(createBlueprintFromSelection(accessorState, 'Invalid', 'Accessor'), null);
  assert.throws(() => createBlueprintFromCustomBlock(accessorState.customBlocks.grass_brick));
  assert.equal(reads, 0);
});

test('scoped import may archive a colliding definition, but placing it cannot overwrite the shared world', () => {
  const original = state(); original.blocks['19,0,0'] = placed('grass_brick', 19, 0, 0, 'unrelated');
  const source = createBlueprintFromCustomBlock({ ...original.customBlocks.grass_brick, color: '#123456' });
  const raw = JSON.stringify(source), imported = prepareBlueprintImport(raw); assert.ok(imported.ok);
  assert.equal(imported.value.legacySources[0].raw, raw);
  assert.equal(imported.value.document.customBlocks.grass_brick.color, original.customBlocks.grass_brick.color);
  assert.equal(imported.value.blueprint.customBlockDefs[0].color, '#123456');
  rejectEveryPlacement(original, imported.value.blueprint, /conflicts/);
});

test('target-locked session validates the complete candidate after collision-safe engine placement', () => {
  const document = makeStudioDocument(); document.blocks = {}; document.blueprints = [];
  const definition: CustomBlockDefinition = { ...document.customBlocks.grass_brick, id: 'mapped-unit', shape: 'cube', width: 1, depth: 1, heightPlates: 3, hasStuds: false };
  const binding = captureJavaDefinitionBinding(definition, 'minecraft:stone'); assert.ok(binding.ok);
  document.customBlocks = { [definition.id]: definition };
  document.schemaVersion = 2; document.targetPolicy = {
    policyVersion: 1, checkpoint: { documentId: document.documentId, revision: document.revision, historyEpoch: document.historyEpoch },
    target: candidateJavaTarget([binding.binding], true),
  };
  const session = new StudioEditorSession(document); session.setWritable(true);
  const unsupported = createBlueprintFromCustomBlock({ ...definition, id: 'unmapped-unit' });
  assert.equal(validateBlueprintPlacement(session.getEngineState(), unsupported, { x: -2, y: 3, z: 4 }), null);
  const before = session.getDocument(); let effects = 0;
  const rejected = session.transaction('Unsupported blueprint', () => {
    session.setEngineState(current => stampBlueprintIntoWorld(current, unsupported, { x: -2, y: 3, z: 4 }));
    session.afterCommit(() => { effects++; });
  });
  assert.equal(rejected.status, 'rejected'); assert.equal(effects, 0); assert.deepEqual(session.getDocument(), before);
  assert.equal(session.getSnapshot().canUndo, false);
  const mapped = createBlueprintFromCustomBlock(definition);
  const accepted = session.setEngineState(current => stampBlueprintIntoWorld(current, mapped, { x: -2, y: 3, z: 4 }));
  assert.equal(accepted.status, 'applied'); assert.equal(session.getDocument().blocks['-2,3,4'].blockDefId, definition.id);
  assert.deepEqual(session.getDocument().targetPolicy, document.targetPolicy);
  assert.equal(session.undo().status, 'applied'); assert.deepEqual(session.getDocument(), before);
});
