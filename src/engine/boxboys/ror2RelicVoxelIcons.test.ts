import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRelicVoxelIcons } from './ror2RelicVoxelIcons.js';

test('Risk of Rain 2 Relic Voxel Icons', async (t) => {
  await t.test('generates exactly 25 relic icons', () => {
    const icons = generateRelicVoxelIcons();
    assert.equal(icons.length, 25);
  });

  await t.test('each relic has valid custom block definitions and placed blocks', () => {
    const icons = generateRelicVoxelIcons();
    for (const icon of icons) {
      assert.ok(icon.id.startsWith('relic_'));
      assert.ok(icon.relicName.includes('Relic'));
      assert.ok(icon.customBlockDefs.length > 0);
      assert.ok(icon.blocks.length > 0);

      const blockDef = icon.customBlockDefs[0];
      assert.equal(blockDef.shape, 'cube');
      assert.equal(blockDef.texturePattern, 'smooth_abs');

      const placedBlock = icon.blocks[0];
      assert.ok(placedBlock.blockDefId);
      assert.ok(placedBlock.position);
    }
  });
});
