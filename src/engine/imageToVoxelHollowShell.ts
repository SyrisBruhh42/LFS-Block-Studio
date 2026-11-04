import {
  BlockMaterialFinish,
  BlockShape,
  BlockTexturePattern,
  CustomBlockDefinition,
  PlacedBlock,
} from './types';

export interface HollowVoxelConversionMetrics {
  gridResolution: number;
  solidVoxelCount: number;
  hollowShellVoxelCount: number;
  interiorCulledCount: number;
  voxelReductionRatio: number;
  fittedBlockCount: number;
  shapeHistogram: Record<string, number>;
}

export interface HollowVoxelConversionResult {
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  metrics: HollowVoxelConversionMetrics;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function classifyTextureAndFinish(
  r: number,
  g: number,
  b: number
): { pattern: BlockTexturePattern; finish: BlockMaterialFinish } {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  const chroma = cmax - cmin;

  if (b > r + 25 && g > 140 && luma > 130) {
    return { pattern: 'glass_grid', finish: 'neon' };
  }
  if (r > 215 && g > 120 && b < 90 && chroma > 110) {
    return { pattern: 'brick_mortar', finish: 'neon' };
  }
  if (g > r + 15 && g > b + 15) {
    return { pattern: 'grass_top', finish: 'matte' };
  }
  if (r > b + 28 && luma >= 75 && luma <= 185) {
    return { pattern: 'wood_grain', finish: 'matte' };
  }
  if (chroma < 22 && luma > 120) {
    return { pattern: 'tech_panel', finish: 'metallic' };
  }
  return { pattern: 'cobble', finish: 'matte' };
}

/**
 * Converts a 2D RGBA image buffer (`width x height x 4` Uint8Array/Uint8ClampedArray)
 * into an LFS Block Studio 3D project using:
 *   1. 2D Silhouette + Chamfer Distance Transform thickness estimation (`Z`-depth profile)
 *   2. 6-Connected Hollow-Shell Surface Culling (removes interior occluded voxels)
 *   3. Multi-Shape Primitive Fitting (`brick`, `cube`, `slope`, `arch`, `cylinder`, `plate`, `tile`)
 */
export function convertRgbaToHollowShellBlocks(params: {
  rgba: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  gridResolution?: number;
  alphaThreshold?: number;
}): HollowVoxelConversionResult {
  const {
    rgba,
    width,
    height,
    gridResolution = 24,
    alphaThreshold = 32,
  } = params;

  const N = Math.max(8, Math.min(64, Math.floor(gridResolution)));
  const mask2d = new Uint8Array(N * N);
  const color2d = new Uint8Array(N * N * 3);

  for (let gy = 0; gy < N; gy++) {
    // gy = 0 is bottom (Y = 0), gy = N - 1 is top
    const srcY = Math.min(
      height - 1,
      Math.max(0, Math.floor(((N - 1 - gy + 0.5) / N) * height))
    );
    for (let gx = 0; gx < N; gx++) {
      const srcX = Math.min(
        width - 1,
        Math.max(0, Math.floor(((gx + 0.5) / N) * width))
      );
      const pIdx = (srcY * width + srcX) * 4;
      const a = rgba[pIdx + 3];
      const cellIdx = gy * N + gx;
      if (a >= alphaThreshold) {
        mask2d[cellIdx] = 1;
        color2d[cellIdx * 3 + 0] = rgba[pIdx + 0];
        color2d[cellIdx * 3 + 1] = rgba[pIdx + 1];
        color2d[cellIdx * 3 + 2] = rgba[pIdx + 2];
      }
    }
  }

  // 2D Manhattan distance transform inside silhouette for organic Z-thickness
  const dist2d = new Int32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    dist2d[i] = mask2d[i] ? 9999 : 0;
  }
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const idx = gy * N + gx;
      if (!mask2d[idx]) continue;
      if (gy === 0 || gy === N - 1 || gx === 0 || gx === N - 1) {
        dist2d[idx] = 1;
      } else {
        dist2d[idx] = Math.min(
          dist2d[idx],
          dist2d[(gy - 1) * N + gx] + 1,
          dist2d[gy * N + (gx - 1)] + 1
        );
      }
    }
  }
  for (let gy = N - 1; gy >= 0; gy--) {
    for (let gx = N - 1; gx >= 0; gx--) {
      const idx = gy * N + gx;
      if (!mask2d[idx]) continue;
      if (gy + 1 < N) dist2d[idx] = Math.min(dist2d[idx], dist2d[(gy + 1) * N + gx] + 1);
      if (gx + 1 < N) dist2d[idx] = Math.min(dist2d[idx], dist2d[gy * N + (gx + 1)] + 1);
    }
  }

  let maxDist = 1;
  for (let i = 0; i < N * N; i++) {
    if (dist2d[i] > maxDist) maxDist = dist2d[i];
  }

  const maxHalfZ = Math.max(1, Math.floor(N * 0.22));
  const midZ = Math.floor(N / 2);
  const solidGrid = new Uint8Array(N * N * N);
  const vIdx = (x: number, y: number, z: number) => (y * N + z) * N + x;

  let solidVoxelCount = 0;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const idx2d = gy * N + gx;
      if (!mask2d[idx2d]) continue;
      const halfSpan = Math.max(
        1,
        Math.round(Math.sqrt(dist2d[idx2d] / maxDist) * maxHalfZ)
      );
      const z0 = Math.max(0, midZ - halfSpan);
      const z1 = Math.min(N - 1, midZ + halfSpan);
      for (let gz = z0; gz <= z1; gz++) {
        solidGrid[vIdx(gx, gy, gz)] = 1;
        solidVoxelCount++;
      }
    }
  }

  // 6-Connected Hollow-Shell Surface Culling: cull voxels whose 6 orthogonal neighbors are all occupied
  const surfaceGrid = new Uint8Array(N * N * N);
  let hollowShellVoxelCount = 0;
  for (let gy = 0; gy < N; gy++) {
    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const cur = vIdx(gx, gy, gz);
        if (!solidGrid[cur]) continue;
        const has6Neighbors =
          gx > 0 &&
          gx + 1 < N &&
          gy > 0 &&
          gy + 1 < N &&
          gz > 0 &&
          gz + 1 < N &&
          solidGrid[vIdx(gx - 1, gy, gz)] === 1 &&
          solidGrid[vIdx(gx + 1, gy, gz)] === 1 &&
          solidGrid[vIdx(gx, gy - 1, gz)] === 1 &&
          solidGrid[vIdx(gx, gy + 1, gz)] === 1 &&
          solidGrid[vIdx(gx, gy, gz - 1)] === 1 &&
          solidGrid[vIdx(gx, gy, gz + 1)] === 1;
        if (!has6Neighbors) {
          surfaceGrid[cur] = 1;
          hollowShellVoxelCount++;
        }
      }
    }
  }

  const blocks: Record<string, PlacedBlock> = {};
  const customBlocks: Record<string, CustomBlockDefinition> = {};
  const shapeHistogram: Record<string, number> = {};

  for (let gy = 0; gy < N; gy++) {
    for (let gz = 0; gz < N; gz++) {
      for (let gx = 0; gx < N; gx++) {
        const cur = vIdx(gx, gy, gz);
        if (!surfaceGrid[cur]) continue;

        const idx2d = gy * N + gx;
        // Quantize color to 24-step buckets so similar blocks share definitions
        const qr = Math.round(color2d[idx2d * 3 + 0] / 24) * 24;
        const qg = Math.round(color2d[idx2d * 3 + 1] / 24) * 24;
        const qb = Math.round(color2d[idx2d * 3 + 2] / 24) * 24;
        const hex = rgbToHex(qr, qg, qb);
        const { pattern, finish } = classifyTextureAndFinish(qr, qg, qb);

        const aboveEmpty = gy + 1 >= N || solidGrid[vIdx(gx, gy + 1, gz)] === 0;
        const belowEmpty = gy === 0 || solidGrid[vIdx(gx, gy - 1, gz)] === 0;
        const leftEmpty = gx === 0 || solidGrid[vIdx(gx - 1, gy, gz)] === 0;
        const rightEmpty = gx + 1 >= N || solidGrid[vIdx(gx + 1, gy, gz)] === 0;

        let shape: BlockShape = 'cube';
        if (aboveEmpty && (leftEmpty || rightEmpty)) {
          shape = 'slope';
        } else if (belowEmpty && gy > 1) {
          shape = 'arch';
        } else if (leftEmpty && rightEmpty) {
          shape = 'cylinder';
        } else if (aboveEmpty && belowEmpty) {
          shape = 'plate';
        }

        shapeHistogram[shape] = (shapeHistogram[shape] || 0) + 1;
        const defId = `hollow_${shape}_${pattern}_${hex.slice(1).toLowerCase()}`;
        if (!customBlocks[defId]) {
          customBlocks[defId] = {
            id: defId,
            name: `Salvaged ${shape} (${hex})`,
            isCustom: true,
            shape,
            width: 1,
            depth: 1,
            heightPlates: shape === 'plate' ? 1 : 3,
            color: hex,
            texturePattern: pattern,
            materialFinish: finish,
            hasStuds: false,
          };
        }

        const worldX = gx - Math.floor(N / 2);
        const worldY = gy;
        const worldZ = gz - midZ;
        const key = `${worldX},${worldY},${worldZ}`;
        blocks[key] = {
          id: `blk_${worldX}_${worldY}_${worldZ}`,
          blockDefId: defId,
          position: { x: worldX, y: worldY, z: worldZ },
          rotation: rightEmpty && !leftEmpty ? 90 : 0,
        };
      }
    }
  }

  const interiorCulledCount = solidVoxelCount - hollowShellVoxelCount;
  const voxelReductionRatio =
    solidVoxelCount > 0 ? interiorCulledCount / solidVoxelCount : 0;

  return {
    blocks,
    customBlocks,
    metrics: {
      gridResolution: N,
      solidVoxelCount,
      hollowShellVoxelCount,
      interiorCulledCount,
      voxelReductionRatio: Number(voxelReductionRatio.toFixed(4)),
      fittedBlockCount: Object.keys(blocks).length,
      shapeHistogram,
    },
  };
}
