import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYMMETRY_CONFIG, analyzeSelectionMorphology, auditWorldWalkability,
  computeCommandPreviewCoords, computeSymmetryTargets, createInitialAdaptivePatternArchive,
  getCommandPreviewError, getCopilotPredictionError, getSymmetryTargetsError,
  getWalkabilityAuditError, predictNextBlocksCopilot,
} from './spatialCopilotEngine';
import type { CopilotPredictionParams } from './spatialCopilotEngine';
import { createInitialEngineState, getGridCoordError } from './worldEditEngine';
import type { GridCoord, PlacedBlock } from './types';

const origin = { x: 0, y: 0, z: 0 };
const block = (position: GridCoord, blockDefId = 'cobble_brick'): PlacedBlock => ({
  id: `${position.x},${position.y},${position.z}`, position, blockDefId, rotation: 0,
});
const predictionParams = (): CopilotPredictionParams => ({
  hoveredCoord: { x: -3, y: 4, z: 0 }, activeBlockId: 'cobble_brick', placementRotation: 0,
  blocks: {}, customBlocks: createInitialEngineState().customBlocks, maxPredictions: 4,
  recentPlacements: [
    { coord: { x: -5, y: 4, z: 0 }, blockDefId: 'cobble_brick', rotation: 0, timestamp: 1 },
    { coord: { x: -4, y: 4, z: 0 }, blockDefId: 'cobble_brick', rotation: 0, timestamp: 2 },
  ],
});

test('command previews reject nonfinite, fractional, and excessive sparse bounds regardless of output cap', () => {
  for (const corner of [
    { x: NaN, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 },
    { x: -Infinity, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 },
    { x: 100_000, y: 100_000, z: 100_000 },
  ]) {
    for (const mode of ['set', 'walls', 'hollow', 'clear', 'stack_up'] as const) {
      assert.ok(getCommandPreviewError(origin, corner, mode, 1));
      assert.deepEqual(computeCommandPreviewCoords(origin, corner, mode, {}, 1), []);
    }
    assert.equal(analyzeSelectionMorphology(origin, corner, {}, 'cobble_brick'), null);
  }
});

test('preview counts are strictly bounded and zero disables output', () => {
  for (const count of [-1, 0.5, NaN, Infinity, 100_001]) {
    assert.ok(getCommandPreviewError(origin, origin, 'set', count));
    assert.deepEqual(computeCommandPreviewCoords(origin, origin, 'set', {}, count), []);
  }
  assert.equal(getCommandPreviewError(origin, origin, 'set', 0), null);
  assert.deepEqual(computeCommandPreviewCoords(origin, origin, 'set', {}, 0), []);
});

test('known valid previews preserve exact walls, interior, clear, stack, and capped output', () => {
  const end = { x: 2, y: 0, z: 2 };
  assert.equal(computeCommandPreviewCoords(origin, end, 'walls', {}).length, 8);
  assert.equal(computeCommandPreviewCoords(origin, end, 'set', {}).length, 9);
  assert.equal(computeCommandPreviewCoords(origin, end, 'set', {}, 3).length, 3);
  assert.deepEqual(computeCommandPreviewCoords(origin, { x: 2, y: 2, z: 2 }, 'hollow', {
    '1,1,1': block({ x: 1, y: 1, z: 1 }),
  }), [{ x: 1, y: 1, z: 1 }]);
  assert.deepEqual(computeCommandPreviewCoords(origin, origin, 'clear', { '0,0,0': block(origin) }), [origin]);
  assert.deepEqual(computeCommandPreviewCoords(origin, origin, 'stack_up', { '0,0,0': block(origin) }), [{ x: 0, y: 1, z: 0 }]);
  assert.equal(analyzeSelectionMorphology(origin, end, {}, 'cobble_brick')?.recommendations[0].previewMode, 'set');
});

test('stack previews and morphology recommendations obey the same destination and repeated-work bounds as commands', () => {
  const high = { x: 0, y: 1_000_000, z: 0 };
  assert.ok(getCommandPreviewError(high, high, 'stack_up'));
  assert.deepEqual(computeCommandPreviewCoords(high, high, 'stack_up', {}), []);
  const wide = { x: 299, y: 199, z: 0 }; // 60,000 source cells; repeating doubles the work.
  assert.equal(getCommandPreviewError(origin, wide, 'set'), null);
  assert.ok(getCommandPreviewError(origin, wide, 'stack_up'));
  assert.ok(analyzeSelectionMorphology(origin, wide, {}, 'cobble_brick')?.recommendations.every(item => item.previewMode !== 'stack_up'));
});

test('copilot prediction counts and used coordinates reject invalid input before extrapolation', () => {
  for (const maxPredictions of [-1, 0.5, NaN, Infinity, 100_001]) {
    const params = { ...predictionParams(), maxPredictions };
    assert.ok(getCopilotPredictionError(params));
    assert.deepEqual(predictNextBlocksCopilot(params), []);
  }
  assert.deepEqual(predictNextBlocksCopilot({ ...predictionParams(), maxPredictions: 0 }), []);
  const badHistory = predictionParams();
  badHistory.recentPlacements[1].coord.x = Infinity;
  assert.ok(getCopilotPredictionError(badHistory));
  assert.deepEqual(predictNextBlocksCopilot(badHistory), []);
  const badHover = { ...predictionParams(), hoveredCoord: { x: NaN, y: 4, z: 0 } };
  assert.deepEqual(predictNextBlocksCopilot(badHover), []);
});

test('valid copilot momentum remains deterministic and emitted predictions stay inside coordinate bounds', () => {
  const params = predictionParams();
  assert.equal(getCopilotPredictionError(params), null);
  assert.deepEqual(predictNextBlocksCopilot(params).map(item => item.position), [
    { x: -3, y: 4, z: 0 }, { x: -2, y: 4, z: 0 }, { x: -1, y: 4, z: 0 }, { x: 0, y: 4, z: 0 },
  ]);
  params.hoveredCoord.x = 1_000_000;
  params.recentPlacements[0].coord.x = 999_998;
  params.recentPlacements[1].coord.x = 999_999;
  const clipped = predictNextBlocksCopilot(params);
  assert.equal(clipped.length, 1);
  assert.ok(clipped.every(item => getGridCoordError(item.position) === null));
});

test('malformed learned offsets are rejected while valid seeded patterns remain usable', () => {
  const params = { ...predictionParams(), archive: createInitialAdaptivePatternArchive() };
  assert.equal(getCopilotPredictionError(params), null);
  assert.equal(predictNextBlocksCopilot(params).length, 4);
  Object.values(params.archive.patterns)[0].offset.x = Infinity;
  assert.ok(getCopilotPredictionError(params));
  assert.deepEqual(predictNextBlocksCopilot(params), []);
});

test('symmetry rejects invalid coordinates/pivots and retains finite fractional pivots', () => {
  const symmetry = { ...DEFAULT_SYMMETRY_CONFIG, mode: 'quad_xz' as const };
  assert.equal(computeSymmetryTargets({ x: -2, y: 1, z: 3 }, 90, symmetry).length, 4);
  const fractionalPivot = { ...symmetry, mode: 'mirror_x' as const, pivotX: 0.5 };
  assert.deepEqual(computeSymmetryTargets(origin, 0, fractionalPivot).map(item => item.coord), [origin, { x: 1, y: 0, z: 0 }]);
  for (const pivotX of [NaN, Infinity, -Infinity, 1_000_001]) {
    assert.ok(getSymmetryTargetsError(origin, 0, { ...symmetry, pivotX }));
    assert.deepEqual(computeSymmetryTargets(origin, 0, { ...symmetry, pivotX }), []);
  }
  assert.deepEqual(computeSymmetryTargets({ x: Infinity, y: 0, z: 0 }, 0, symmetry), []);
  assert.deepEqual(computeSymmetryTargets({ x: -1_000_000, y: 0, z: 0 }, 0, { ...symmetry, pivotX: 1 }), []);
});

test('walkability audit rejects nonfinite coordinates and excessive lighting work instead of looping or reporting readiness', () => {
  const defs = createInitialEngineState().customBlocks;
  for (const y of [NaN, Infinity, -Infinity, 1_000_001, 0.5]) {
    const blocks = { invalid: block({ x: 0, y, z: 0 }) };
    assert.ok(getWalkabilityAuditError(blocks, defs));
    const report = auditWorldWalkability(blocks, defs);
    assert.equal(report.accessibilityScore, 0);
    assert.match(report.summary, /^Audit unavailable:/);
    assert.deepEqual(report.headroomConflictCoords, []);
  }
  const lightHeavy = Object.fromEntries(Array.from({ length: 400 }, (_, x) => [
    `${x},0,0`, block({ x, y: 0, z: 0 }, 'voxel_lantern'),
  ]));
  assert.match(getWalkabilityAuditError(lightHeavy, defs)!, /lighting comparisons/);
  assert.match(auditWorldWalkability(lightHeavy, defs).summary, /^Audit unavailable:/);
  const starter = createInitialEngineState();
  assert.equal(getWalkabilityAuditError(starter.blocks, starter.customBlocks), null);
  assert.ok(auditWorldWalkability(starter.blocks, starter.customBlocks).walkableCount > 10);
});
