import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportToGltfJson } from './godotExporter';
import type { PlacedBlock, CustomBlockDefinition } from './types';

function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
  };
}

describe('godotExporter', () => {
  it('should export deterministically regardless of object property order', () => {
    const customBlocks: Record<string, CustomBlockDefinition> = {
      testDef: {
        id: 'testDef',
        name: 'Test Block',
        width: 1,
        heightPlates: 1,
        depth: 1,
        shape: 'brick',
        color: '#ff0000',
        materialFinish: 'matte',
        texturePattern: 'solid',
        hasStuds: true,
      },
    };

    const block1: PlacedBlock = {
      id: 'b1',
      blockDefId: 'testDef',
      position: { x: 1, y: 0, z: 0 },
      rotation: 0,
    };
    const block2: PlacedBlock = {
      id: 'b2',
      blockDefId: 'testDef',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    };

    // Insertion order 1
    const blocksOrder1 = { b1: block1, b2: block2 };
    // Insertion order 2
    const blocksOrder2 = { b2: block2, b1: block1 };

    const gltf1 = exportToGltfJson('Test', blocksOrder1, customBlocks);
    const gltf2 = exportToGltfJson('Test', blocksOrder2, customBlocks);

    expect(gltf1).toBe(gltf2);
  });
});
