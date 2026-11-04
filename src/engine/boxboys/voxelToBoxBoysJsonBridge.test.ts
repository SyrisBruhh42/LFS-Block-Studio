import test from 'node:test';
import assert from 'node:assert/strict';
import { convertVoxelRigToBoxBoys } from './voxelToBoxBoysJsonBridge.js';
import { PlacedBlock, CustomBlockDefinition } from '../types.js';

test('convertVoxelRigToBoxBoys successfully maps blocks to quads', () => {
  const blocks: Record<string, PlacedBlock> = {
    'b1': {
      id: 'b1',
      blockDefId: 'def1',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0
    },
    'b2': {
      id: 'b2',
      blockDefId: 'def2',
      position: { x: 2, y: 1, z: 2 },
      rotation: 90,
      colorOverride: '#ffffff',
      materialOverride: 'metallic',
      customScale: { x: 2, y: 1, z: 2 }
    }
  };

  const customBlocks: Record<string, CustomBlockDefinition> = {
    'def1': {
      id: 'def1',
      name: 'Brick',
      shape: 'brick',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#ff0000',
      texturePattern: 'smooth_abs',
      materialFinish: 'plastic',
      hasStuds: true
    },
    'def2': {
      id: 'def2',
      name: 'Plate',
      shape: 'plate',
      width: 2,
      depth: 2,
      heightPlates: 1,
      color: '#00ff00',
      texturePattern: 'smooth_abs',
      materialFinish: 'matte',
      hasStuds: true
    }
  };

  const catalog = convertVoxelRigToBoxBoys('Test Rig', blocks, customBlocks);

  assert.equal(catalog.version, '1.0');
  assert.equal(catalog.title, 'Test Rig');
  assert.equal(catalog.quads.length, 2);

  const q1 = catalog.quads.find(q => q.id === 'b1');
  assert.ok(q1);
  assert.deepEqual(q1!.position, [0, 0, 0]);
  assert.deepEqual(q1!.dimensions, [1, 1, 1]); // heightPlates 3 / 3 = 1
  assert.equal(q1!.color, '#ff0000');
  assert.equal(q1!.material, 'plastic');

  const q2 = catalog.quads.find(q => q.id === 'b2');
  assert.ok(q2);
  assert.deepEqual(q2!.position, [2, 1, 2]);
  assert.deepEqual(q2!.dimensions, [4, 1/3, 4]); // width 2*2=4, depth 2*2=4, heightPlates 1/3 * 1 = 1/3
  assert.equal(q2!.color, '#ffffff');
  assert.equal(q2!.material, 'metallic');
});

test('convertVoxelRigToBoxBoys ignores missing definitions', () => {
  const blocks: Record<string, PlacedBlock> = {
    'b1': {
      id: 'b1',
      blockDefId: 'missing_def',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0
    }
  };
  const customBlocks: Record<string, CustomBlockDefinition> = {};
  const catalog = convertVoxelRigToBoxBoys('Empty Rig', blocks, customBlocks);
  assert.equal(catalog.quads.length, 0);
});
