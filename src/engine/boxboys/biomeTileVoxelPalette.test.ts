import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBiomePalette } from './biomeTileVoxelPalette.js';
import { ProceduralBiomeId } from '../studioEngagementEngine.js';

test('Biome Voxel Palette Generator', async (t) => {
  await t.test('generates valid palette for floating_skyblock', () => {
    const palette = generateBiomePalette('floating_skyblock');
    assert.equal(palette.biomeId, 'floating_skyblock');
    assert.equal(palette.floor.texturePattern, 'grass_top');
    assert.equal(palette.floor.pbrMetalness, 0.0);
    assert.ok(palette.ambientLightHex.startsWith('#'));
  });

  await t.test('generates valid palette for terraced_zen_garden', () => {
    const palette = generateBiomePalette('terraced_zen_garden');
    assert.equal(palette.biomeId, 'terraced_zen_garden');
    assert.equal(palette.walls.texturePattern, 'wood_grain');
    assert.ok(palette.floor.pbrRoughness >= 0 && palette.floor.pbrRoughness <= 1);
  });

  await t.test('generates valid palette for desert_mesa_citadel', () => {
    const palette = generateBiomePalette('desert_mesa_citadel');
    assert.equal(palette.biomeId, 'desert_mesa_citadel');
    assert.equal(palette.accents.materialFinish, 'metallic');
    assert.ok(palette.accents.pbrMetalness > 0.5);
  });

  await t.test('generates valid palette for volcanic_caldera', () => {
    const palette = generateBiomePalette('volcanic_caldera');
    assert.equal(palette.biomeId, 'volcanic_caldera');
    assert.equal(palette.accents.materialFinish, 'neon');
    assert.ok(palette.floor.normalScale > 1.0);
  });

  await t.test('generates valid palette for alpine_snow_peak', () => {
    const palette = generateBiomePalette('alpine_snow_peak');
    assert.equal(palette.biomeId, 'alpine_snow_peak');
    assert.equal(palette.accents.materialFinish, 'glass');
    assert.equal(palette.accents.texturePattern, 'glass_grid');
  });

  await t.test('generates valid palette for cyber_grid_plate', () => {
    const palette = generateBiomePalette('cyber_grid_plate');
    assert.equal(palette.biomeId, 'cyber_grid_plate');
    assert.equal(palette.floor.materialFinish, 'metallic');
    assert.equal(palette.accents.materialFinish, 'neon');
    assert.equal(palette.accents.baseColorHex, '#00ffff');
  });

  await t.test('throws an error for invalid biome IDs', () => {
    assert.throws(
      () => generateBiomePalette('invalid_biome' as ProceduralBiomeId),
      /Unsupported biomeId/
    );
  });
});
