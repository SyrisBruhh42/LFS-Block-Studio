import test from 'node:test';
import assert from 'node:assert/strict';

import { detectBoneCycles } from '../skeletalAnimationEngine';
import { ZOMBIE_ARCHETYPES, getAllRigs } from './zombieArchetypeVoxelRigs';

test('Zombie Archetype Voxel Rigs', async (t) => {
  await t.test('getAllRigs returns all 6 archetypes', () => {
    const rigs = getAllRigs();
    assert.strictEqual(rigs.length, 6);
  });

  await t.test('All rigs have valid bone hierarchies with no cycles', () => {
    const rigs = getAllRigs();
    for (const rig of rigs) {
      assert.strictEqual(
        detectBoneCycles(rig.bones),
        false,
        `Rig ${rig.archetype} has a bone cycle`
      );
    }
  });

  await t.test('Red Devil Boss has high health and scale', () => {
    const bossRig = ZOMBIE_ARCHETYPES['Red Devil Boss'];
    assert.strictEqual(bossRig.scale, 2.5);
    assert.strictEqual(bossRig.health, 1000);
  });

  await t.test('Crawler uses specialized crawler bones', () => {
    const crawlerRig = ZOMBIE_ARCHETYPES['Crawler'];
    const hasLegs = crawlerRig.bones.some((b) => b.name === 'leg_l' || b.name === 'leg_r');
    assert.strictEqual(hasLegs, false, 'Crawler should not have legs');
  });

  await t.test('Weaver uses specialized multi-arm bones', () => {
    const weaverRig = ZOMBIE_ARCHETYPES['Weaver'];
    const armCount = weaverRig.bones.filter((b) => b.name.startsWith('arm_')).length;
    assert.strictEqual(armCount, 4, 'Weaver should have 4 arms');
  });

  await t.test('Specific attributes per archetype', () => {
    assert.strictEqual(ZOMBIE_ARCHETYPES['Shambler'].health, 100);
    assert.strictEqual(ZOMBIE_ARCHETYPES['Sprinter'].baseSpeed, 4.5);
    assert.strictEqual(ZOMBIE_ARCHETYPES['Stalker'].health, 120);
  });
});
