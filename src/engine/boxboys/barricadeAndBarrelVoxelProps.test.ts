import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explosiveRedBarrel,
  cryoBarrel,
  debrisDoor,
  tier1Barricade,
  tier2Barricade,
  tier3Barricade,
  tier4Barricade,
  allBoxBoysProps
} from './barricadeAndBarrelVoxelProps';

test('barricadeAndBarrelVoxelProps', async (t) => {
  await t.test('all props have correct IDs and names', () => {
    assert.equal(explosiveRedBarrel.id, 'boxboys_barrel_explosive_red');
    assert.equal(explosiveRedBarrel.name, 'Explosive Red Barrel');

    assert.equal(cryoBarrel.id, 'boxboys_barrel_cryo');
    assert.equal(cryoBarrel.name, 'Cryo Barrel');

    assert.equal(debrisDoor.id, 'boxboys_debris_door');
    assert.equal(debrisDoor.name, 'Debris Door');

    assert.equal(tier1Barricade.id, 'boxboys_barricade_t1');
    assert.equal(tier1Barricade.name, 'Tier 1 Barricade');

    assert.equal(tier2Barricade.id, 'boxboys_barricade_t2');
    assert.equal(tier2Barricade.name, 'Tier 2 Barricade');

    assert.equal(tier3Barricade.id, 'boxboys_barricade_t3');
    assert.equal(tier3Barricade.name, 'Tier 3 Barricade');

    assert.equal(tier4Barricade.id, 'boxboys_barricade_t4');
    assert.equal(tier4Barricade.name, 'Tier 4 Barricade');
  });

  await t.test('all props share base properties', () => {
    for (const prop of allBoxBoysProps) {
      assert.equal(prop.shape, 'cube');
      assert.equal(prop.width, 1);
      assert.equal(prop.depth, 1);
      assert.equal(prop.heightPlates, 3);
      assert.equal(prop.texturePattern, 'smooth_abs');
      assert.equal(prop.materialFinish, 'matte');
      assert.equal(prop.hasStuds, false);
      assert.equal(prop.isCustom, true);
    }
  });

  await t.test('barricades have correct micro-voxel counts', () => {
    // 8x2 = 16 voxels per plank
    assert.equal(tier1Barricade.voxels?.length, 16);
    assert.equal(tier2Barricade.voxels?.length, 32);
    assert.equal(tier3Barricade.voxels?.length, 48);
    assert.equal(tier4Barricade.voxels?.length, 64);
  });

  await t.test('barrels have correct micro-voxel counts', () => {
    assert.equal(explosiveRedBarrel.voxels?.length, 256);
    assert.equal(cryoBarrel.voxels?.length, 256);
  });

  await t.test('debris door has correct micro-voxel counts', () => {
    assert.equal(debrisDoor.voxels?.length, 128);
  });
});
