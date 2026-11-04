import test from 'node:test';
import assert from 'node:assert/strict';
import { exportVoxelToBoxBoysJson } from './voxelToBoxBoysJsonBridge.js';
import { PlacedBlock, CustomBlockDefinition } from '../types.js';

test('exportVoxelToBoxBoysJson', async (t) => {
  await t.test('exports empty catalog correctly', () => {
    const result = exportVoxelToBoxBoysJson([], []);
    assert.deepEqual(result.metadata.formatVersion, '1.0.0');
    assert.deepEqual(result.metadata.targetTrack, 'Unified BoxBoys Track 9');
    assert.deepEqual(result.metadata.quadCount, 0);
    assert.deepEqual(result.quads, []);
  });

  await t.test('exports single basic block correctly', () => {
    const blocks: PlacedBlock[] = [
      {
        id: 'block1',
        blockDefId: 'stone',
        position: { x: 1, y: 2, z: 3 },
        rotation: 0,
      }
    ];

    const result = exportVoxelToBoxBoysJson(blocks, []);
    assert.deepEqual(result.metadata.quadCount, 1);
    assert.deepEqual(result.quads.length, 1);
    
    const quad = result.quads[0];
    assert.deepEqual(quad.id, 'block1');
    assert.deepEqual(quad.x, 1);
    assert.deepEqual(quad.y, 2);
    assert.deepEqual(quad.z, 3);
    assert.deepEqual(quad.hexColor, '#ffffff'); // default
    assert.deepEqual(quad.textureId, 'stone');
    assert.deepEqual(quad.isCustom, false);
  });

  await t.test('handles color overrides and custom blocks correctly', () => {
    const customBlocks: CustomBlockDefinition[] = [
      {
        id: 'custom_brick',
        name: 'Custom Brick',
        color: '#ff0000',
        shape: 'cube',
        width: 1,
        depth: 1,
        heightPlates: 1,
        texturePattern: 'smooth_abs',
        hasStuds: true,
        materialFinish: 'matte'
      }
    ];

    const blocks: PlacedBlock[] = [
      {
        id: 'b1',
        blockDefId: 'custom_brick',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      },
      {
        id: 'b2',
        blockDefId: 'custom_brick',
        position: { x: 1, y: 0, z: 0 },
        rotation: 0,
        colorOverride: '#00ff00'
      }
    ];

    const result = exportVoxelToBoxBoysJson(blocks, customBlocks);
    assert.deepEqual(result.metadata.quadCount, 2);
    
    // Test custom block default color fallback
    assert.deepEqual(result.quads[0].hexColor, '#ff0000');
    assert.deepEqual(result.quads[0].isCustom, true);
    
    // Test color override taking precedence
    assert.deepEqual(result.quads[1].hexColor, '#00ff00');
    assert.deepEqual(result.quads[1].isCustom, true);
  });
});
