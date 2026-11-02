import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOLUME_BRUSH_CONFIG, applyVolumeBrushToWorld, computeVolumeBrushOffsets,
  expandWorldIntoChunk, getChunkExpansionError, getSelectionTransformError,
  getVolumeBrushApplicationError, getVolumeBrushError, transformSelectionBox,
} from './chunkAndPatternEngine';
import type { VolumeBrushApplicationParams } from './chunkAndPatternEngine';
import { createInitialEngineState, executeWorldEditCommand } from './worldEditEngine';
import type { ChunkExpansionStyle, VolumeBrushConfig } from './types';

const emptyState = () => ({ ...createInitialEngineState(), blocks: {} });
const cube: VolumeBrushConfig = { ...DEFAULT_VOLUME_BRUSH_CONFIG, shape: 'cube', radius: 1, height: 2 };
const brushParams = (): VolumeBrushApplicationParams => ({
  state: emptyState(), center: { x: 0, y: 4, z: 0 }, mode: 'brush_place',
  brush: cube, activeBlockId: 'cobble_brick', rotation: 0,
});

test('valid brush fixtures retain exact shapes, hollow shells, and radius-zero behavior', () => {
  assert.equal(computeVolumeBrushOffsets(cube).length, 27);
  assert.equal(computeVolumeBrushOffsets({ ...cube, hollow: true }).length, 26);
  assert.equal(computeVolumeBrushOffsets({ ...cube, shape: 'sphere' }).length, 7);
  assert.equal(computeVolumeBrushOffsets({ ...cube, shape: 'cylinder' }).length, 10);
  assert.equal(computeVolumeBrushOffsets({ ...cube, shape: 'diamond' }).length, 19);
  assert.deepEqual(computeVolumeBrushOffsets({ ...cube, radius: 0 }), [{ x: 0, y: 0, z: 0 }]);
});

test('brush config rejects negative, fractional, nonfinite, extreme, and unknown settings without clamping', () => {
  const configs: VolumeBrushConfig[] = [
    ...[-1, 0.5, 9, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER].map(radius => ({ ...cube, radius })),
    ...[-1, 0, 1.5, 13, NaN, Infinity].map(height => ({ ...cube, height })),
    { ...cube, shape: 'invalid' as VolumeBrushConfig['shape'] },
  ];
  for (const brush of configs) {
    assert.ok(getVolumeBrushError(brush));
    assert.deepEqual(computeVolumeBrushOffsets(brush), []);
    const params = { ...brushParams(), brush };
    const result = applyVolumeBrushToWorld(params);
    assert.equal(result.nextState, params.state);
    assert.equal(result.affectedCount, 0);
    assert.ok(result.error);
    assert.equal(params.state.undoStack.length, 0);
  }
});

test('brush placement validates its entire destination and scale before mutating or creating history', () => {
  const cases: Partial<VolumeBrushApplicationParams>[] = [
    { center: { x: Infinity, y: 0, z: 0 } }, { center: { x: NaN, y: 0, z: 0 } },
    { center: { x: 1_000_000, y: 0, z: 0 } }, { center: { x: 0.5, y: 0, z: 0 } },
    { customScale: { x: NaN, y: 1, z: 1 } }, { customScale: { x: 9, y: 1, z: 1 } },
    { activeBlockId: 'missing' }, { rotation: 45 as 0 },
  ];
  for (const invalid of cases) {
    const params = { ...brushParams(), ...invalid };
    const before = structuredClone(params.state);
    assert.ok(getVolumeBrushApplicationError(params));
    const result = applyVolumeBrushToWorld(params);
    assert.equal(result.nextState, params.state);
    assert.equal(result.affectedCount, 0);
    assert.deepEqual(params.state, before);
  }
});

test('valid brushes retain one undo, exact negative coordinates, erase behavior, and air-only no-op history', () => {
  const params = { ...brushParams(), center: { x: -4, y: -16, z: -4 } };
  const placed = applyVolumeBrushToWorld(params);
  assert.equal(placed.affectedCount, 27);
  assert.equal(placed.nextState.undoStack.length, 1);
  assert.deepEqual([...new Set(Object.values(placed.nextState.blocks).map(block => block.position.y))].sort((a, b) => a - b), [-17, -16, -15]);
  const noOp = applyVolumeBrushToWorld({ ...params, state: placed.nextState, brush: { ...cube, airOnly: true } });
  assert.equal(noOp.nextState, placed.nextState);
  assert.equal(noOp.affectedCount, 0);
  const erased = applyVolumeBrushToWorld({ ...params, state: placed.nextState, mode: 'erase', activeBlockId: 'unused' });
  assert.equal(erased.affectedCount, 27);
  assert.deepEqual(erased.nextState.blocks, {});
  assert.deepEqual(executeWorldEditCommand(erased.nextState, '//undo').nextState.blocks, placed.nextState.blocks);
});

test('repeating an identical brush preserves cell identities, state and pending Redo', () => {
  const params = { ...brushParams(), patternConfig: undefined };
  const clock = Date.now; let tick = 1000;
  Date.now = () => ++tick;
  try {
    const first = applyVolumeBrushToWorld(params);
    const source = { ...first.nextState, redoStack: [{ blocks: {}, label: 'Pending Redo' }] };
    const before = structuredClone(source);
    const repeated = applyVolumeBrushToWorld({ ...params, state: source });
    assert.equal(repeated.nextState, source);
    assert.equal(repeated.affectedCount, 0);
    assert.deepEqual(source, before);
  } finally { Date.now = clock; }
});

test('chunk expansion rejects unsafe indices, dimensions, and styles before snapshot or generation', () => {
  const state = emptyState();
  const cases: [number, number, ChunkExpansionStyle, number][] = [
    [Infinity, 0, 'grass_island', 16], [NaN, 0, 'grass_island', 16],
    [0.5, 0, 'grass_island', 16], [Number.MAX_SAFE_INTEGER, 0, 'grass_island', 16],
    [1_000_000, 0, 'grass_island', 16], [-1_000_000, 0, 'grass_island', 16],
    ...[0, -1, 1.5, NaN, Infinity, 100_000].map(size => [0, 0, 'grass_island', size] as [number, number, ChunkExpansionStyle, number]),
    [0, 0, 'invalid' as ChunkExpansionStyle, 16],
  ];
  for (const args of cases) {
    assert.ok(getChunkExpansionError(...args));
    const result = expandWorldIntoChunk(state, ...args);
    assert.equal(result.nextState, state);
    assert.equal(result.addedCount, 0);
    assert.ok(result.error);
  }
  assert.equal(state.undoStack.length, 0);
  assert.deepEqual(state.blocks, {});
});

test('negative chunk indices remain valid and fixed templates retain their original cells', () => {
  const state = emptyState();
  const expanded = expandWorldIntoChunk(state, -1, 0, 'stone_foundation', 16);
  assert.equal(expanded.error, undefined);
  assert.equal(expanded.addedCount, 144);
  assert.ok(expanded.nextState.blocks['-22,0,-6']);
  assert.equal(expanded.nextState.undoStack.length, 1);
  assert.deepEqual(executeWorldEditCommand(expanded.nextState, '//undo').nextState.blocks, {});
  assert.equal(expandWorldIntoChunk(state, 0, 0, 'empty_grid').addedCount, 4);
});

test('selection transforms retain valid shifts, contractions, ordering, and null-corner fallback', () => {
  const pos1 = { x: 2, y: 4, z: 2 };
  const pos2 = { x: -2, y: 0, z: -2 };
  assert.deepEqual(transformSelectionBox(pos1, pos2, 'contract_all', 1), {
    pos1: { x: -1, y: 1, z: -1 }, pos2: { x: 1, y: 3, z: 1 },
  });
  assert.deepEqual(transformSelectionBox(pos1, pos2, 'shift_west', 2), {
    pos1: { x: -4, y: 0, z: -2 }, pos2: { x: 0, y: 4, z: 2 },
  });
  assert.deepEqual(transformSelectionBox(null, null, 'raise_up'), {
    pos1: { x: 0, y: 2, z: 0 }, pos2: { x: 0, y: 2, z: 0 },
  });
});

test('selection transform rejection preserves supplied corners for invalid steps, bounds, or destinations', () => {
  const pos1 = { x: 2, y: 2, z: 2 };
  const pos2 = { x: 0, y: 0, z: 0 };
  for (const step of [-1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1_000_001]) {
    assert.ok(getSelectionTransformError(pos1, pos2, 'shift_up', step));
    const result = transformSelectionBox(pos1, pos2, 'shift_up', step);
    assert.equal(result.pos1, pos1);
    assert.equal(result.pos2, pos2);
    assert.ok(result.error);
  }
  const edge = { x: 1_000_000, y: 0, z: 0 };
  assert.ok(transformSelectionBox(edge, edge, 'shift_east').error);
  assert.ok(transformSelectionBox(pos1, pos2, 'expand_all', 100_000).error);
  assert.ok(transformSelectionBox({ x: Infinity, y: 0, z: 0 }, pos2, 'raise_up').error);
});
