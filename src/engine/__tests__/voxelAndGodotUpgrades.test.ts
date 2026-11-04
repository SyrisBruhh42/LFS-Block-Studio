import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertRgbaToHollowShellBlocks } from '../imageToVoxelHollowShell';
import {
  convertRgbaToHollowShellBlocks as convertViaGodotExporter,
  generateGodotTscn,
  generateGodotSpriteFramesTres,
} from '../godotExporter';
import {
  buildBlockMeshGroup,
  disposeUnsharedGroupGeometries,
} from '../legoGeometry';
import { createInitialEngineState } from '../worldEditEngine';

describe('CA-11-C01..C03: Hollow-Shell Voxelizer, Compound Arch Colliders & GPU Hygiene', () => {
  it('CA-11-C01: converts RGBA arch silhouette to hollow-shell voxels with interior culling', () => {
    const width = 48;
    const height = 48;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 4; y < 44; y++) {
      for (let x = 4; x < 44; x++) {
        // Leave a walk-through opening at the bottom center (Genus-1 arch)
        const inOpening = y >= 24 && x >= 18 && x <= 29;
        if (inOpening) continue;
        const idx = (y * width + x) * 4;
        rgba[idx] = 186;
        rgba[idx + 1] = 152;
        rgba[idx + 2] = 112;
        rgba[idx + 3] = 255;
      }
    }

    const res = convertRgbaToHollowShellBlocks({
      rgba,
      width,
      height,
      gridResolution: 20,
    });

    assert.equal(convertViaGodotExporter, convertRgbaToHollowShellBlocks);
    assert.ok(res.metrics.solidVoxelCount > res.metrics.hollowShellVoxelCount);
    assert.ok(res.metrics.interiorCulledCount > 0);
    assert.ok(res.metrics.voxelReductionRatio > 0.25);
    assert.equal(
      Object.keys(res.blocks).length,
      res.metrics.hollowShellVoxelCount
    );
    assert.ok(Object.keys(res.customBlocks).length > 0);
  });

  it('CA-11-C02: generateGodotTscn emits 3-part compound walk-through colliders for arch blocks and SpriteFrames .tres', () => {
    const state = createInitialEngineState();
    state.customBlocks['desert_arch_portal'] = {
      id: 'desert_arch_portal',
      name: 'Desert Arch Portal',
      width: 3,
      depth: 1,
      heightPlates: 9,
      color: '#C8A878',
      shape: 'arch',
      materialFinish: 'matte',
      texturePattern: 'cobble',
      hasStuds: false,
    };
    state.blocks = {
      '0,0,0': {
        id: 'arch_1',
        blockDefId: 'desert_arch_portal',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
      },
    };

    const tscn = generateGodotTscn(
      'DesertArchTest',
      state.blocks,
      state.customBlocks
    );
    assert.ok(tscn.includes('LeftPillarCol'));
    assert.ok(tscn.includes('RightPillarCol'));
    assert.ok(tscn.includes('TopLintelCol'));
    assert.ok(tscn.includes('_pillar'));
    assert.ok(tscn.includes('_lintel'));

    const tres = generateGodotSpriteFramesTres(
      'res://assets/inked-4k/wolf_dire_atlas.png',
      [
        {
          name: 'run_SE',
          fps: 12,
          loop: true,
          frames: [
            { name: 'wolf_se_0', x: 4, y: 4, w: 256, h: 256 },
            { name: 'wolf_se_1', x: 268, y: 4, w: 256, h: 256 },
          ],
        },
      ]
    );
    assert.ok(tres.includes('[gd_resource type="SpriteFrames"'));
    assert.ok(tres.includes('"name": &"run_SE"'));
    assert.ok(tres.includes('Rect2(4, 4, 256, 256)'));
  });

  it('CA-11-C03: buildBlockMeshGroup and disposeUnsharedGroupGeometries clean up non-cached materials and geometries', () => {
    const state = createInitialEngineState();
    const def = {
      ...state.customBlocks['cobble_brick'],
      shape: 'arch' as const,
      materialFinish: 'metallic' as const,
    };
    const group = buildBlockMeshGroup({
      def,
      isSoftwareGl: false,
    });
    assert.ok(group.children.length > 0);
    assert.doesNotThrow(() => disposeUnsharedGroupGeometries(group));
  });
});
