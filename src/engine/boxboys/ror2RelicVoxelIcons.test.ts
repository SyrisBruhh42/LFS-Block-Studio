import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoR2Relics } from './ror2RelicVoxelIcons.js';

test('getRoR2Relics', async (t) => {
  const relics = getRoR2Relics();

  await t.test('generates exactly 25 items', () => {
    assert.equal(relics.length, 25);
  });

  await t.test('items have unique IDs and names', () => {
    const ids = new Set();
    const names = new Set();
    for (const relic of relics) {
      assert.ok(relic.id.startsWith('ror2_relic_'), `Invalid ID: ${relic.id}`);
      ids.add(relic.id);
      names.add(relic.name);
    }
    assert.equal(ids.size, 25);
    assert.equal(names.size, 25);
  });

  await t.test('voxels have valid coordinates (0-7)', () => {
    for (const relic of relics) {
      assert.ok(relic.voxels.length > 0, `Relic ${relic.name} has no voxels`);
      for (const voxel of relic.voxels) {
        assert.ok(voxel.x >= 0 && voxel.x <= 7, `Invalid X: ${voxel.x}`);
        assert.ok(voxel.y >= 0 && voxel.y <= 7, `Invalid Y: ${voxel.y}`);
        assert.ok(voxel.z >= 0, `Invalid Z: ${voxel.z}`);
        assert.ok(typeof voxel.color === 'string', `Invalid color: ${voxel.color}`);
        assert.ok(voxel.color.startsWith('#'), `Invalid color format: ${voxel.color}`);
      }
    }
  });

  await t.test('output is deterministic', () => {
    const relics1 = getRoR2Relics();
    const relics2 = getRoR2Relics();

    assert.deepEqual(relics1, relics2);
  });
});
