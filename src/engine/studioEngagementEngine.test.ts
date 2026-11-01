import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHITECTURAL_CONTRACTS,
  ATMOSPHERE_PRESETS,
  PROCEDURAL_BIOME_TEMPLATES,
  applyProceduralBiomeToWorld,
  buildOrderedTimelapseList,
  computeMasteryRank,
  evaluateAllContracts,
  evaluateContractProgress,
  generateProceduralBiomeBlocks,
  getAtmospherePresetById,
  getDailyBuildPromptForDate,
  sliceBlocksAtTimelapseStep,
} from './studioEngagementEngine';
import { createInitialEngineState, coordKey } from './worldEditEngine';
import { PlacedBlock } from './types';

test('Atmosphere presets resolve deterministically', () => {
  assert.equal(ATMOSPHERE_PRESETS.length, 5);
  const golden = getAtmospherePresetById('golden_hour');
  assert.equal(golden.id, 'golden_hour');
  assert.equal(golden.lighting.timeOfDay, 18.0);
});

test('Mastery rank progresses across XP thresholds', () => {
  const r0 = computeMasteryRank(0);
  assert.equal(r0.currentRank.level, 1);
  assert.equal(r0.nextRank?.level, 2);
  assert.equal(r0.progressToNextPercent, 0);

  const rMid = computeMasteryRank(250);
  assert.equal(rMid.currentRank.level, 2);
  assert.equal(rMid.nextRank?.level, 3);
  assert.equal(rMid.progressToNextPercent, 50);

  const rMax = computeMasteryRank(1500);
  assert.equal(rMax.currentRank.level, 5);
  assert.equal(rMax.nextRank, null);
  assert.equal(rMax.progressToNextPercent, 100);
});

test('Procedural biome generator produces valid worlds for all 6 templates', () => {
  const init = createInitialEngineState();
  for (const tpl of PROCEDURAL_BIOME_TEMPLATES) {
    const blocks = generateProceduralBiomeBlocks(tpl.id);
    const count = Object.keys(blocks).length;
    assert.ok(count > 40, `Expected biome ${tpl.id} to have >40 blocks, got ${count}`);

    const applied = applyProceduralBiomeToWorld(init, tpl.id);
    assert.equal(applied.blockCount, count);
    assert.equal(applied.nextState.undoStack.length, init.undoStack.length + 1);
  }
});

test('Architectural contract evaluator accurately scores progress and completion', () => {
  const init = createInitialEngineState();
  const c1 = ARCHITECTURAL_CONTRACTS[0]; // minBlocks: 60, minHeight: 4, minFootprintSpan: 8, minDistinctBlockTypes: 3

  // Starter skyblock already has >60 blocks, height >=4, span >=8, and 4 block types
  const res = evaluateContractProgress(c1, init.blocks, init.customBlocks);
  assert.equal(res.isCompleted, true);
  assert.equal(res.overallProgressPercent, 100);

  // All contracts evaluation returns all 5 contract entries
  const all = evaluateAllContracts(init.blocks, init.customBlocks);
  assert.equal(Object.keys(all).length, ARCHITECTURAL_CONTRACTS.length);
});

test('Daily build prompt is deterministic per date string', () => {
  const p1 = getDailyBuildPromptForDate('2026-11-01');
  const p2 = getDailyBuildPromptForDate('2026-11-01');
  assert.equal(p1.id, p2.id);
  assert.ok(p1.bonusXp > 0);
});

test('Timelapse ordering sorts bottom-up and slices steps cleanly', () => {
  const sampleBlocks: Record<string, PlacedBlock> = {
    [coordKey(0, 5, 0)]: {
      id: 'b_top',
      blockDefId: 'voxel_lantern',
      position: { x: 0, y: 5, z: 0 },
      rotation: 0,
    },
    [coordKey(2, 0, 2)]: {
      id: 'b_edge',
      blockDefId: 'cobble_brick',
      position: { x: 2, y: 0, z: 2 },
      rotation: 0,
    },
    [coordKey(0, 0, 0)]: {
      id: 'b_origin',
      blockDefId: 'cobble_brick',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    },
  };

  const ordered = buildOrderedTimelapseList(sampleBlocks);
  assert.equal(ordered.length, 3);
  assert.equal(ordered[0].id, 'b_origin');
  assert.equal(ordered[1].id, 'b_edge');
  assert.equal(ordered[2].id, 'b_top');

  const slice1 = sliceBlocksAtTimelapseStep(ordered, 1);
  assert.equal(Object.keys(slice1).length, 1);
  assert.ok(slice1[coordKey(0, 0, 0)]);

  const sliceAll = sliceBlocksAtTimelapseStep(ordered, 3);
  assert.equal(Object.keys(sliceAll).length, 3);
});
