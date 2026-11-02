import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_EDIT_LIMITS, WORLDEDIT_COMMANDS_HELP, createBlueprintFromCustomBlock, createBlueprintFromSelection,
  createInitialEngineState, executeWorldEditCommand, getGridCoordError,
  getSelectionVolumeError, loadBlueprintIntoNewWorld, pushUndoSnapshot,
  stampBlueprintIntoWorld, validateBlueprintLoad, validateBlueprintPlacement,
} from './worldEditEngine';
import type { BlueprintPrefab, PlacedBlock, WorldEditEngineState } from './types';

function emptyState(): WorldEditEngineState {
  return { ...structuredClone(createInitialEngineState()), blocks: {},
    pos1: { x: 0, y: 0, z: 0 }, pos2: { x: 0, y: 0, z: 0 } };
}

function block(): PlacedBlock {
  return { id: 'origin', blockDefId: 'grass_brick', position: { x: 0, y: 0, z: 0 }, rotation: 0,
    customScale: { x: 1, y: 1, z: 1 } };
}

function domain(state: WorldEditEngineState) {
  const { undoStack: _undo, redoStack: _redo, ...authored } = state;
  return authored;
}

function rejected(state: WorldEditEngineState, command: string) {
  const before = structuredClone(state);
  const result = executeWorldEditCommand(state, command);
  assert.equal(result.success, false, command);
  assert.equal(result.affectedCount, 0, command);
  assert.equal(result.nextState, state, command);
  assert.deepEqual(state, before, command);
  assert.ok(result.message.length > 0);
}

test('undo and redo restore the complete authored engine domain, including nullable selection', () => {
  const before = emptyState();
  before.pos1 = null;
  before.blocks['0,0,0'] = block();
  before.clipboard = [block()];
  before.clipboardCustomDefs = [structuredClone(before.customBlocks.voxel_lantern)];
  const after = pushUndoSnapshot(before, 'full domain edit');
  after.blocks = {};
  after.customBlocks = { new_definition: { ...before.customBlocks.grass_brick, id: 'new_definition' } };
  after.pos1 = { x: 4, y: 3, z: 2 };
  after.pos2 = null;
  after.clipboard = [];
  after.clipboardCustomDefs = [];
  const undone = executeWorldEditCommand(after, '//undo');
  assert.equal(undone.success, true);
  assert.deepEqual(domain(undone.nextState), domain(before));
  const redone = executeWorldEditCommand(undone.nextState, '//redo');
  assert.deepEqual(domain(redone.nextState), domain(after));
});

test('history does not alias block scales, definition voxels/scales, clipboard, or restored live data', () => {
  const state = emptyState();
  state.blocks['0,0,0'] = block();
  state.clipboard = [block()];
  state.customBlocks.voxel_lantern.defaultScale = { x: 1, y: 1, z: 1 };
  state.clipboardCustomDefs = [structuredClone(state.customBlocks.voxel_lantern)];
  const expected = structuredClone(domain(state));
  const edited = pushUndoSnapshot(state, 'nested edit');
  edited.blocks['0,0,0'].customScale!.x = 2;
  edited.customBlocks.voxel_lantern.voxels![0].x = 7;
  edited.customBlocks.voxel_lantern.defaultScale!.z = 2;
  edited.clipboard[0].position.y = 3;
  edited.clipboard[0].customScale!.y = 4;
  edited.clipboardCustomDefs[0].voxels![0].color = '#000000';
  const snapshotBeforeRestore = structuredClone(edited.undoStack[0]);
  const undone = executeWorldEditCommand(edited, '//undo').nextState;
  assert.deepEqual(domain(undone), expected);
  undone.blocks['0,0,0'].customScale!.x = 8;
  undone.customBlocks.voxel_lantern.voxels![0].y = 7;
  assert.deepEqual(edited.undoStack[0], snapshotBeforeRestore);
});

test('legacy blocks-only snapshots remain readable and redo captures the full current domain', () => {
  const state = emptyState();
  state.blocks['0,0,0'] = block();
  state.clipboard = [block()];
  state.undoStack = [{ blocks: {}, label: 'legacy' }];
  const undone = executeWorldEditCommand(state, '//undo').nextState;
  assert.deepEqual(undone.customBlocks, state.customBlocks);
  assert.deepEqual(undone.clipboard, state.clipboard);
  assert.deepEqual(undone.pos1, state.pos1);
  assert.deepEqual(undone.blocks, {});
  assert.deepEqual(domain(executeWorldEditCommand(undone, '//redo').nextState), domain(state));
});

test('history depth remains bounded and a new edit invalidates redo', () => {
  let state = emptyState();
  for (let i = 0; i < 35; i++) state = pushUndoSnapshot(state, `edit ${i}`);
  assert.equal(state.undoStack.length, ENGINE_EDIT_LIMITS.historyDepth);
  assert.equal(state.undoStack[0].label, 'edit 5');
  state = executeWorldEditCommand(state, '//undo').nextState;
  assert.equal(state.redoStack.length, 1);
  assert.equal(pushUndoSnapshot(state, 'new edit').redoStack.length, 0);
});

test('blueprint stamp undo removes added definitions without replacing shared definitions', () => {
  const state = emptyState();
  const custom = { ...state.customBlocks.grass_brick, id: 'new_block', name: 'New Block' };
  const blueprint = createBlueprintFromCustomBlock(custom);
  blueprint.customBlockDefs.push(structuredClone(state.customBlocks.grass_brick));
  const stamped = stampBlueprintIntoWorld(state, blueprint, { x: 2, y: 3, z: 4 }, 90);
  assert.equal(stamped.blocks['2,3,4'].rotation, 90);
  assert.deepEqual(stamped.customBlocks.grass_brick, state.customBlocks.grass_brick);
  const undone = executeWorldEditCommand(stamped, '//undo').nextState;
  assert.deepEqual(domain(undone), domain(state));
  assert.equal(undone.customBlocks.new_block, undefined);
  assert.deepEqual(domain(executeWorldEditCommand(undone, '//redo').nextState), domain(stamped));
});

test('move undo restores selection and cut undo restores the prior clipboard', () => {
  const state = emptyState();
  state.blocks['0,0,0'] = block();
  state.clipboard = [{ ...block(), id: 'old_clipboard' }];
  const moved = executeWorldEditCommand(state, '//move 2 east').nextState;
  assert.deepEqual(moved.pos1, { x: 2, y: 0, z: 0 });
  assert.deepEqual(domain(executeWorldEditCommand(moved, '//undo').nextState), domain(state));
  const cut = executeWorldEditCommand(state, '//cut').nextState;
  assert.equal(cut.clipboard[0].id, 'origin');
  assert.deepEqual(domain(executeWorldEditCommand(cut, '//undo').nextState), domain(state));
});

test('position commands reject nonfinite, partial, and out-of-range inputs while retaining finite rounding', () => {
  const state = emptyState();
  for (const command of ['//pos1 Infinity 0 0', '//pos2 NaN 0 0', '//pos1 0 0',
    '//pos2 bad 0 0', '//pos1 1000001 0 0', '//pos1 0 0 0 4']) rejected(state, command);
  const rounded = executeWorldEditCommand(state, '//pos1 1.4 -2.6 0.1');
  assert.equal(rounded.success, true);
  assert.deepEqual(rounded.nextState.pos1, { x: 1, y: -3, z: 0 });
  const invalidCursor = executeWorldEditCommand(state, '//pos1', { x: NaN, y: 0, z: 0 });
  assert.equal(invalidCursor.success, false);
  assert.equal(invalidCursor.nextState, state);
});

test('shift translates reversed selection anchors through every move direction alias without moving blocks or creating history', () => {
  const state = emptyState();
  state.pos1 = { x: 2, y: 3, z: 4 }; state.pos2 = { x: -1, y: 1, z: 0 };
  state.blocks['0,0,0'] = block(); state.clipboard = [block()];
  state.undoStack = [{ blocks: {}, label: 'prior' }]; state.redoStack = [{ blocks: {}, label: 'prior redo' }];
  const before = structuredClone(state);
  const groups: [string[], { x: number; y: number; z: number }][] = [
    [['up', 'u', '+y'], { x: 0, y: 1, z: 0 }], [['down', 'd', '-y'], { x: 0, y: -1, z: 0 }],
    [['north', 'n', '-z'], { x: 0, y: 0, z: -1 }], [['south', 's', '+z'], { x: 0, y: 0, z: 1 }],
    [['east', 'e', '+x'], { x: 1, y: 0, z: 0 }], [['west', 'w', '-x'], { x: -1, y: 0, z: 0 }],
  ];
  for (const [aliases, direction] of groups) for (const alias of aliases) {
    const result = executeWorldEditCommand(state, `//shift 24 ${alias.toUpperCase()}`);
    assert.equal(result.success, true, result.message); assert.equal(result.affectedCount, 0);
    for (const key of ['pos1', 'pos2'] as const) assert.deepEqual(result.nextState[key], {
      x: state[key]!.x + direction.x * 24, y: state[key]!.y + direction.y * 24, z: state[key]!.z + direction.z * 24,
    });
    for (const key of ['blocks', 'customBlocks', 'clipboard', 'clipboardCustomDefs', 'undoStack', 'redoStack'] as const) assert.equal(result.nextState[key], state[key]);
    assert.deepEqual(state, before);
  }
  assert.deepEqual(executeWorldEditCommand(state, '//shift').nextState.pos1, { x: 2, y: 4, z: 4 });
  assert.ok(WORLDEDIT_COMMANDS_HELP.some(item => item.cmd.startsWith('//shift ') && item.desc.includes('selection only')));
  assert.match(executeWorldEditCommand(state, '//help').message, /\/\/shift/);
});

test('shift rejects missing/invalid selection, malformed distance, unknown direction and destination overflow unchanged', () => {
  for (const state of [{ ...emptyState(), pos1: null }, { ...emptyState(), pos2: null }]) rejected(state, '//shift 1 up');
  const state = emptyState(); state.undoStack = [{ blocks: {}, label: 'preserve' }];
  for (const command of ['//shift NaN', '//shift Infinity', '//shift -Infinity', '//shift 0', '//shift -1', '//shift 1.5',
    '//shift 25', '//shift 9007199254740992', '//shift 1junk', '//shift 1 diagonal', '//shift 1 all', '//shift 1 up extra']) rejected(state, command);
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const sign of [-1, 1]) {
      const edge = emptyState(); edge.pos1 = { x: 0, y: 0, z: 0 }; edge.pos2 = { x: 0, y: 0, z: 0 };
      edge.pos1[axis] = sign * ENGINE_EDIT_LIMITS.maxAbsCoordinate; edge.pos2[axis] = sign * ENGINE_EDIT_LIMITS.maxAbsCoordinate;
      rejected(edge, `//shift 1 ${sign > 0 ? '+' : '-'}${axis}`);
      const inward = executeWorldEditCommand(edge, `//shift 1 ${sign > 0 ? '-' : '+'}${axis}`);
      assert.equal(inward.success, true);
    }
  }
});

test('region commands and selection blueprint creation reject unsafe bounds before enumeration', () => {
  const commands = ['//size', '//count', '//copy', '//cut', '//clear', '//set stone',
    '//fill stone', '//replace stone dirt', '//walls stone', '//box stone', '//hollow',
    '//stack 1', '//move 1', '//shift 1', '//expand 1'];
  for (const badCorner of [
    { x: Infinity, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 },
    { x: 0.5, y: 0, z: 0 }, { x: 100_000, y: 100_000, z: 100_000 },
  ]) {
    const state = { ...emptyState(), pos2: badCorner };
    for (const command of commands) rejected(state, command);
    assert.equal(createBlueprintFromSelection(state, 'Invalid', 'Invalid'), null);
  }
});

test('checked work budget accepts the exact boundary and rejects products and coordinates beyond it', () => {
  assert.equal(getSelectionVolumeError({ x: 0, y: 0, z: 0 }, { x: 99, y: 99, z: 9 }), null);
  assert.ok(getSelectionVolumeError({ x: 0, y: 0, z: 0 }, { x: 99, y: 99, z: 10 }));
  assert.ok(getSelectionVolumeError({ x: -1_000_000, y: -1_000_000, z: -1_000_000 }, { x: 1_000_000, y: 1_000_000, z: 1_000_000 }));
  assert.ok(getGridCoordError({ x: Number.MAX_SAFE_INTEGER, y: 0, z: 0 }));
});

test('procedural parameters and transform counts reject malformed tokens rather than clamp or default', () => {
  const state = emptyState();
  for (const command of [
    '//sphere stone NaN', '//sphere stone Infinity', '//sphere stone 3junk', '//sphere stone 13', '//sphere stone 0',
    '//cyl stone 2 NaN', '//cyl stone 2 Infinity', '//cyl stone 2 21', '//cyl stone 1.5 2',
    '//stack NaN', '//stack Infinity', '//stack 13', '//stack 2 upjunk',
    '//move 25', '//move NaN', '//move 2 sideways', '//expand Infinity', '//expand 2 junk',
    '//expand 1000000 all',
  ]) rejected(state, command);
});

test('procedural and transform destination checks reject crossing the coordinate boundary', () => {
  const state = emptyState();
  state.pos1 = state.pos2 = { x: ENGINE_EDIT_LIMITS.maxAbsCoordinate, y: 0, z: 0 };
  for (const command of ['//sphere stone 1', '//cyl stone 1 2', '//stack 1 east', '//move 1 east', '//expand 1 east']) {
    rejected(state, command);
  }
  const badCenter = { ...emptyState(), pos1: { x: NaN, y: 0, z: 0 } };
  rejected(badCenter, '//sphere stone 1');
  rejected(badCenter, '//cyl stone 1');
});

test('stack budgets repeated work and move/stack reject inconsistent source coordinates', () => {
  const wide = { ...emptyState(), pos2: { x: 99, y: 99, z: 9 } };
  rejected(wide, '//stack 1 up');
  for (const position of [{ x: Infinity, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]) {
    const state = emptyState();
    state.blocks['0,0,0'] = { ...block(), position };
    rejected(state, '//move 1 east');
    rejected(state, '//stack 1 east');
  }
});

test('paste rejects invalid clipboard coordinates, excessive counts, sparse volume, and invalid destinations atomically', () => {
  const state = emptyState();
  state.clipboard = [block()];
  for (const command of ['//paste Infinity 0 0', '//paste 0 0', '//paste NaN 0 0']) rejected(state, command);
  state.clipboard[0].position.x = Infinity;
  rejected(state, '//paste');
  state.clipboard = [block(), { ...block(), position: { x: 100_000, y: 0, z: 0 } }];
  rejected(state, '//paste');
  state.clipboard = [block()];
  state.clipboard.length = ENGINE_EDIT_LIMITS.maxOperationCells + 1;
  rejected(state, '//paste');
  state.clipboard = [{ ...block(), position: { x: 1, y: 0, z: 0 } }];
  rejected(state, '//paste 1000000 0 0');
});

test('blueprint placement/load reject malformed sizes and payloads without history or scene changes', () => {
  const state = emptyState();
  const valid = createBlueprintFromCustomBlock(state.customBlocks.grass_brick);
  const invalidBlueprints: BlueprintPrefab[] = [
    { ...valid, size: { lx: Infinity, ly: 1, lz: 1 } },
    { ...valid, size: { lx: 1e100, ly: 1e100, lz: 1e100 } },
    { ...valid, blocks: [{ ...block(), position: { x: NaN, y: 0, z: 0 } }] },
    { ...valid, blocks: [] },
    { ...valid, blocks: [{ ...block(), blockDefId: 'missing' }], customBlockDefs: [] },
  ];
  for (const blueprint of invalidBlueprints) {
    assert.ok(validateBlueprintPlacement(state, blueprint, { x: 0, y: 0, z: 0 }));
    assert.equal(stampBlueprintIntoWorld(state, blueprint, { x: 0, y: 0, z: 0 }), state);
    assert.equal(loadBlueprintIntoNewWorld(state, blueprint), state);
  }
  const platformTooLarge = { ...valid, size: { lx: 100_000, ly: 1, lz: 1 } };
  assert.ok(validateBlueprintLoad(state, platformTooLarge, true));
  assert.equal(loadBlueprintIntoNewWorld(state, platformTooLarge, true), state);
  assert.equal(stampBlueprintIntoWorld(state, valid, { x: Infinity, y: 0, z: 0 }), state);
  assert.equal(state.undoStack.length, 0);
});

test('fractional custom-block dimensions remain loadable with integer selection corners and one undo', () => {
  const state = emptyState();
  const blueprint = createBlueprintFromCustomBlock({ ...state.customBlocks.grass_brick, id: 'fractional_custom', width: 0.5, depth: 1.5 });
  const loaded = loadBlueprintIntoNewWorld(state, blueprint, false);
  assert.notEqual(loaded, state);
  assert.equal(loaded.undoStack.length, 1);
  assert.equal(getSelectionVolumeError(loaded.pos1!, loaded.pos2!), null);
  assert.deepEqual(domain(executeWorldEditCommand(loaded, '//undo').nextState), domain(state));
});

test('normal shape generation and bounded stack remain functional after validation', () => {
  const state = emptyState();
  const sphere = executeWorldEditCommand(state, '//sphere stone 2');
  assert.equal(sphere.success, true);
  assert.ok(sphere.affectedCount > 1);
  const cylinder = executeWorldEditCommand(state, '//cyl stone 2 3');
  assert.equal(cylinder.success, true);
  assert.ok(cylinder.affectedCount > 1);
  state.blocks['0,0,0'] = block();
  const stacked = executeWorldEditCommand(state, '//stack 2 east');
  assert.equal(stacked.success, true);
  assert.equal(stacked.affectedCount, 2);
  assert.ok(stacked.nextState.blocks['2,0,0']);
});
