import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportToGltfJson,
  exportToBlockbenchModelJson,
  sortBlocksDeterministically,
} from './godotExporter';
import type { CustomBlockDefinition, PlacedBlock } from './types';

function createTestBlocks(): {
  blocksA: Record<string, PlacedBlock>;
  blocksB: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
} {
  const customBlocks: Record<string, CustomBlockDefinition> = {
    cobble_brick: {
      id: 'cobble_brick',
      name: 'Cobblestone Brick',
      shape: 'brick',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#7E8B9B',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: true,
    },
    oak_planks: {
      id: 'oak_planks',
      name: 'Oak Planks',
      shape: 'brick',
      width: 2,
      depth: 1,
      heightPlates: 3,
      color: '#A07040',
      texturePattern: 'oak_planks',
      materialFinish: 'matte',
      hasStuds: true,
    },
  };

  // Same blocks in different insertion/key orders
  const blocksA: Record<string, PlacedBlock> = {
    '1,0,0': {
      id: 'blk_1',
      blockDefId: 'cobble_brick',
      position: { x: 1, y: 0, z: 0 },
      rotation: 0,
    },
    '0,1,0': {
      id: 'blk_2',
      blockDefId: 'oak_planks',
      position: { x: 0, y: 1, z: 0 },
      rotation: 90,
      customScale: { x: 1.5, y: 1, z: 1.5 },
    },
    '0,0,0': {
      id: 'blk_0',
      blockDefId: 'cobble_brick',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    },
  };

  const blocksB: Record<string, PlacedBlock> = {
    '0,0,0': {
      id: 'blk_0',
      blockDefId: 'cobble_brick',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    },
    '0,1,0': {
      id: 'blk_2',
      blockDefId: 'oak_planks',
      position: { x: 0, y: 1, z: 0 },
      rotation: 90,
      customScale: { x: 1.5, y: 1, z: 1.5 },
    },
    '1,0,0': {
      id: 'blk_1',
      blockDefId: 'cobble_brick',
      position: { x: 1, y: 0, z: 0 },
      rotation: 0,
    },
  };

  return { blocksA, blocksB, customBlocks };
}

test('sortBlocksDeterministically orders blocks by coordinates y, z, x and ID', () => {
  const { blocksA } = createTestBlocks();
  const sorted = sortBlocksDeterministically(blocksA);
  assert.equal(sorted.length, 3);
  assert.equal(sorted[0].id, 'blk_0'); // y=0, z=0, x=0
  assert.equal(sorted[1].id, 'blk_1'); // y=0, z=0, x=1
  assert.equal(sorted[2].id, 'blk_2'); // y=1, z=0, x=0
});

test('exportToGltfJson produces deterministic, bitwise identical output across varied key order', () => {
  const { blocksA, blocksB, customBlocks } = createTestBlocks();
  const gltfA = exportToGltfJson('Studio Island', blocksA, customBlocks);
  const gltfB = exportToGltfJson('Studio Island', blocksB, customBlocks);

  assert.equal(gltfA, gltfB, 'glTF JSON serialization must be bitwise deterministic');

  const doc = JSON.parse(gltfA);
  assert.equal(doc.asset?.version, '2.0');
  assert.equal(doc.nodes.length, 3);
  assert.equal(doc.nodes[0].name, 'Block_0_cobble_brick');
  assert.equal(doc.nodes[1].name, 'Block_1_cobble_brick');
  assert.equal(doc.nodes[2].name, 'Block_2_oak_planks');
});

test('exportToGltfJson supports optional rig and animation tracks', () => {
  const { blocksA, customBlocks } = createTestBlocks();
  const gltfRig = exportToGltfJson('Studio Island', blocksA, customBlocks, {
    includeRig: true,
    includeAnimation: true,
  });

  const doc = JSON.parse(gltfRig);
  assert.ok(Array.isArray(doc.skins), 'Skins array must be present');
  assert.equal(doc.skins.length, 1);
  assert.equal(doc.skins[0].name, 'Armature_Skin');

  assert.ok(Array.isArray(doc.animations), 'Animations array must be present');
  assert.equal(doc.animations.length, 1);
  assert.equal(doc.animations[0].name, 'Studio_Idle');
});

test('exportToBlockbenchModelJson produces deterministic .bbmodel JSON with elements, outliner, skin and animations', () => {
  const { blocksA, blocksB, customBlocks } = createTestBlocks();
  const bbA = exportToBlockbenchModelJson('Studio Character', blocksA, customBlocks);
  const bbB = exportToBlockbenchModelJson('Studio Character', blocksB, customBlocks);

  assert.equal(bbA, bbB, 'Blockbench JSON serialization must be bitwise deterministic');

  const model = JSON.parse(bbA);
  assert.equal(model.meta?.format_version, '4.10');
  assert.equal(model.name, 'Studio Character');
  assert.equal(model.resolution?.width, 64);
  assert.equal(model.resolution?.height, 64);

  // Mesh Elements
  assert.equal(model.elements.length, 3);
  const elem = model.elements[0];
  assert.ok(elem.uuid.startsWith('cube_0_'));
  assert.ok(Array.isArray(elem.from) && elem.from.length === 3);
  assert.ok(Array.isArray(elem.to) && elem.to.length === 3);
  assert.ok(elem.faces?.north && elem.faces?.up);

  // Rig / Outliner
  assert.ok(Array.isArray(model.outliner), 'Outliner bone hierarchy must exist');
  assert.equal(model.outliner[0].name, 'root');
  assert.equal(model.outliner[0].children.length, 3);

  // Textures / Skin
  assert.ok(Array.isArray(model.textures), 'Textures palette must exist');
  assert.equal(model.textures.length, 2);

  // Animations
  assert.ok(Array.isArray(model.animations), 'Animations array must exist');
  assert.equal(model.animations[0].name, 'idle');
  assert.ok(model.animations[0].animators?.bone_root_001);
});
