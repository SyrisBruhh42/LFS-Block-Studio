import {
  BlockScale3D,
  BlockTexturePattern,
  ChunkCoord,
  ChunkExpansionStyle,
  CustomBlockDefinition,
  GridCoord,
  PlacedBlock,
  ScrollResizeAxis,
  ScrollResizeMode,
  SmartPatternVariationConfig,
  VolumeBrushConfig,
  WorldChunkConfig,
  WorldEditEngineState,
} from './types';
import { coordKey, pushUndoSnapshot } from './worldEditEngine';

export const DEFAULT_CHUNK_CONFIG: WorldChunkConfig = {
  chunkSize: 16,
  chunkHeight: 16,
  cellSubdivision: 1,
  activeChunks: {
    '0,0': true,
  },
  unlockedChunks: ['0,0'],
  showChunkBorders: true,
  autoCullDistanceChunks: 0,
};

export const DEFAULT_VOLUME_BRUSH_CONFIG: VolumeBrushConfig = {
  shape: 'sphere',
  radius: 2,
  height: 3,
  hollow: false,
  airOnly: false,
};

export const DEFAULT_SMART_PATTERN_CONFIG: SmartPatternVariationConfig = {
  enabled: true,
  pixelsPerBlock: 64,
  artStyle: 'pixel_art_hd',
  megaSpritemapMode: true,
  smartPlacementPrediction: true,
  colorSimilarityThreshold: 45,
  seed: 42,
  evolutionPhase: 0,
  autoEvolveLoop: false,
  evolveSpeed: 1.0,
  hueShiftSpread: 2,
  luminanceJitter: 0.03,
  roughnessVariance: 0.06,
  spatialScale: 0.75,
  seamBlendStrength: 0.9,
  weatheringMossIntensity: 0.25,
  uvAutoRotate: true,
};

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): ChunkCoord {
  const [cxStr, czStr] = key.split(',');
  return {
    cx: parseInt(cxStr || '0', 10) || 0,
    cz: parseInt(czStr || '0', 10) || 0,
  };
}

/**
 * Maps any world (x, z) coordinate to its 16x16 chunk coordinate (cx, cz).
 * Chunk (0, 0) is centered on [-8 .. +7] so the starter island sits cleanly inside (0, 0).
 */
export function getChunkCoordForBlock(
  x: number,
  z: number,
  chunkSize = 16
): ChunkCoord {
  const half = Math.floor(chunkSize / 2);
  const cx = Math.floor((x + half) / chunkSize);
  const cz = Math.floor((z + half) / chunkSize);
  return { cx, cz };
}

export function getChunkWorldBounds(cx: number, cz: number, chunkSize = 16) {
  const half = Math.floor(chunkSize / 2);
  const minX = cx * chunkSize - half;
  const maxX = minX + chunkSize - 1;
  const minZ = cz * chunkSize - half;
  const maxZ = minZ + chunkSize - 1;
  const centerX = cx * chunkSize - 0.5;
  const centerZ = cz * chunkSize - 0.5;
  return { minX, maxX, minZ, maxZ, centerX, centerZ };
}

export function isBlockInActiveChunk(
  pos: GridCoord,
  chunkConfig?: WorldChunkConfig,
  cursorCoord?: GridCoord
): boolean {
  if (!chunkConfig) return true;
  const { cx, cz } = getChunkCoordForBlock(pos.x, pos.z, chunkConfig.chunkSize);
  const key = chunkKey(cx, cz);

  // If explicitly toggled off in activeChunks, hibernate/cull it
  if (chunkConfig.activeChunks[key] === false) {
    return false;
  }

  // If auto distance culling is enabled, cull chunks outside radius from cursor
  if (chunkConfig.autoCullDistanceChunks > 0 && cursorCoord) {
    const curChunk = getChunkCoordForBlock(
      cursorCoord.x,
      cursorCoord.z,
      chunkConfig.chunkSize
    );
    const chebyshevDist = Math.max(
      Math.abs(cx - curChunk.cx),
      Math.abs(cz - curChunk.cz)
    );
    if (chebyshevDist > chunkConfig.autoCullDistanceChunks) {
      return false;
    }
  }

  return true;
}

export interface ChunkPerformanceStats {
  totalBlocks: number;
  renderedBlocks: number;
  hibernatedBlocks: number;
  savingsPercent: number;
  countsByChunk: Record<string, number>;
  discoveredChunks: string[];
}

export function computeChunkPerformanceStats(
  blocks: Record<string, PlacedBlock>,
  chunkConfig: WorldChunkConfig,
  cursorCoord?: GridCoord
): ChunkPerformanceStats {
  const countsByChunk: Record<string, number> = {};
  const chunkSet = new Set<string>(chunkConfig.unlockedChunks);
  let totalBlocks = 0;
  let renderedBlocks = 0;

  for (const blk of Object.values(blocks)) {
    totalBlocks++;
    const { cx, cz } = getChunkCoordForBlock(
      blk.position.x,
      blk.position.z,
      chunkConfig.chunkSize
    );
    const k = chunkKey(cx, cz);
    chunkSet.add(k);
    countsByChunk[k] = (countsByChunk[k] || 0) + 1;

    if (isBlockInActiveChunk(blk.position, chunkConfig, cursorCoord)) {
      renderedBlocks++;
    }
  }

  const hibernatedBlocks = Math.max(0, totalBlocks - renderedBlocks);
  const savingsPercent =
    totalBlocks > 0 ? Math.round((hibernatedBlocks / totalBlocks) * 100) : 0;

  return {
    totalBlocks,
    renderedBlocks,
    hibernatedBlocks,
    savingsPercent,
    countsByChunk,
    discoveredChunks: Array.from(chunkSet),
  };
}

/**
 * Expands the world into a target chunk (cx, cz) by generating a starter platform or island pad
 */
export function expandWorldIntoChunk(
  state: WorldEditEngineState,
  cx: number,
  cz: number,
  style: ChunkExpansionStyle,
  chunkSize = 16
): { nextState: WorldEditEngineState; addedCount: number } {
  const withUndo = pushUndoSnapshot(state, `Expand Chunk (${cx}, ${cz})`);
  const nextBlocks = { ...withUndo.blocks };
  const bounds = getChunkWorldBounds(cx, cz, chunkSize);
  const midX = Math.floor((bounds.minX + bounds.maxX) / 2);
  const midZ = Math.floor((bounds.minZ + bounds.maxZ) / 2);
  let addedCount = 0;

  const setBlk = (x: number, y: number, z: number, blockDefId: string) => {
    const k = coordKey(x, y, z);
    if (!nextBlocks[k]) addedCount++;
    nextBlocks[k] = {
      id: `blk_${x}_${y}_${z}`,
      blockDefId,
      position: { x, y, z },
      rotation: 0,
    };
  };

  if (style === 'grass_island') {
    for (let x = midX - 4; x <= midX + 5; x++) {
      for (let z = midZ - 4; z <= midZ + 5; z++) {
        const distFromEdge = Math.min(
          x - (midX - 4),
          midX + 5 - x,
          z - (midZ - 4),
          midZ + 5 - z
        );
        if (distFromEdge === 0 && (x + z) % 2 === 0) continue;
        setBlk(x, 0, z, 'grass_brick');
        if (distFromEdge >= 1) {
          setBlk(x, -1, z, 'dirt_brick');
        }
        if (distFromEdge >= 2) {
          setBlk(x, -2, z, 'cobble_brick');
        }
      }
    }
    setBlk(midX, 1, midZ, 'cobble_brick');
    setBlk(midX, 2, midZ, 'voxel_lantern');
  } else if (style === 'stone_foundation') {
    for (let x = midX - 5; x <= midX + 6; x++) {
      for (let z = midZ - 5; z <= midZ + 6; z++) {
        const isBorder =
          x === midX - 5 || x === midX + 6 || z === midZ - 5 || z === midZ + 6;
        setBlk(x, 0, z, isBorder ? 'obsidian_tile' : 'cobble_brick');
      }
    }
  } else if (style === 'timber_deck') {
    for (let x = midX - 5; x <= midX + 6; x++) {
      for (let z = midZ - 5; z <= midZ + 6; z++) {
        const isCorner =
          (x === midX - 5 || x === midX + 6) &&
          (z === midZ - 5 || z === midZ + 6);
        setBlk(x, 0, z, isCorner ? 'cobble_brick' : 'oak_plank');
        if (isCorner) {
          setBlk(x, 1, z, 'voxel_lantern');
        }
      }
    }
  } else {
    for (let x = midX; x <= midX + 1; x++) {
      for (let z = midZ; z <= midZ + 1; z++) {
        setBlk(x, 0, z, 'cobble_brick');
      }
    }
  }

  return {
    nextState: {
      ...withUndo,
      blocks: nextBlocks,
    },
    addedCount,
  };
}

export type ConnectedArtMode =
  | 'isolated'
  | 'edge_frame'
  | 'horizontal_run'
  | 'vertical_pillar'
  | 'seamless_interior';

export type AtlasCellCoord = [0 | 1 | 2 | 3, 0 | 1 | 2 | 3];

export interface ComputedBlockVariation {
  effectiveHex: string;
  roughnessDelta: number;
  connectedMask: number;
  connectedMode: ConnectedArtMode;
  uvRotationQuarterTurns: 0 | 1 | 2 | 3;
  variantIndex: 0 | 1 | 2 | 3;
  atlasTopCell: AtlasCellCoord;
  atlasSideCell: AtlasCellCoord;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').padEnd(6, '0');
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [126, 139, 155];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Computes perceptual color distance (0..100) using weighted Redmean RGB distance.
 */
export function computeColorDistanceDeltaE(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const rMean = (r1 + r2) * 0.5;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const weighted = Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db
  );
  // Normalize maximum possible distance (~765) to 0..100 scale
  return (weighted / 764.83) * 100;
}

/**
 * Evaluates whether two blocks belong to compatible texture/material families or share similar colors
 * so the Connected Mega-Spritemap and Placement Predictor can link them seamlessly.
 */
export function areBlocksColorAndPatternCompatible(params: {
  blockAId: string;
  patternA: BlockTexturePattern;
  colorA: string;
  blockBId: string;
  patternB: BlockTexturePattern;
  colorB: string;
  colorThreshold?: number;
}): { compatible: boolean; affinityScore: number; colorDistance: number } {
  const {
    blockAId,
    patternA,
    colorA,
    blockBId,
    patternB,
    colorB,
    colorThreshold = 45,
  } = params;

  const colorDistance = computeColorDistanceDeltaE(colorA, colorB);

  if (blockAId === blockBId) {
    return { compatible: true, affinityScore: 1.0, colorDistance };
  }

  const samePattern = patternA === patternB;
  const bothMasonry =
    (patternA === 'cobblestone' || patternA === 'brick_masonry') &&
    (patternB === 'cobblestone' || patternB === 'brick_masonry');

  if (samePattern && colorDistance <= colorThreshold) {
    return {
      compatible: true,
      affinityScore: Math.max(0.65, 1 - colorDistance / 100),
      colorDistance,
    };
  }

  if (bothMasonry && colorDistance <= colorThreshold * 0.85) {
    return {
      compatible: true,
      affinityScore: Math.max(0.55, 0.9 - colorDistance / 100),
      colorDistance,
    };
  }

  if (colorDistance <= colorThreshold * 0.65) {
    return {
      compatible: true,
      affinityScore: Math.max(0.5, 0.85 - colorDistance / 100),
      colorDistance,
    };
  }

  return {
    compatible: false,
    affinityScore: Math.max(0, 0.4 - colorDistance / 100),
    colorDistance,
  };
}

export interface PlacementPredictionResult {
  colorOverride?: string;
  textureOverride?: BlockTexturePattern;
  matchedNeighborsCount: number;
  avgAffinity: number;
  summary: string;
}

/**
 * Lightweight Placement Prediction Algorithm:
 * Runs when a block is placed at `coord`. Inspects surrounding neighbors (6 face + 12 edge),
 * seeks similar colors and compatible texture patterns, and predicts harmonized block attributes
 * so the placed block locks seamlessly into the local build's palette and spritemap.
 */
export function predictBlockAttributesOnPlacement(params: {
  coord: GridCoord;
  def: CustomBlockDefinition;
  allBlocks: Record<string, PlacedBlock>;
  allDefs: Record<string, CustomBlockDefinition>;
  config?: SmartPatternVariationConfig;
}): PlacementPredictionResult {
  const { coord, def, allBlocks, allDefs, config } = params;
  if (
    !config ||
    !config.enabled ||
    config.smartPlacementPrediction === false
  ) {
    return {
      matchedNeighborsCount: 0,
      avgAffinity: 0,
      summary: 'Standard placement (prediction disabled)',
    };
  }

  const threshold = config.colorSimilarityThreshold ?? 45;
  const baseColor = def.color || '#7E8B9B';
  const basePattern = def.texturePattern;

  // Scan 6 face neighbors (weight 1.0) and 12 edge neighbors (weight 0.45)
  const offsets: [number, number, number, number][] = [
    [1, 0, 0, 1.0],
    [-1, 0, 0, 1.0],
    [0, 1, 0, 1.0],
    [0, -1, 0, 1.0],
    [0, 0, 1, 1.0],
    [0, 0, -1, 1.0],
    [1, 0, 1, 0.45],
    [1, 0, -1, 0.45],
    [-1, 0, 1, 0.45],
    [-1, 0, -1, 0.45],
    [1, 1, 0, 0.45],
    [-1, 1, 0, 0.45],
    [0, 1, 1, 0.45],
    [0, 1, -1, 0.45],
  ];

  let totalWeight = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let matchedCount = 0;
  let affinitySum = 0;
  let touchesGrass = false;
  const patternVotes: Partial<Record<BlockTexturePattern, number>> = {};

  for (const [dx, dy, dz, weight] of offsets) {
    const nb = allBlocks[coordKey(coord.x + dx, coord.y + dy, coord.z + dz)];
    if (!nb) continue;
    const nbDef = allDefs[nb.blockDefId];
    if (!nbDef) continue;

    if (
      nb.blockDefId === 'grass_brick' ||
      nb.blockDefId === 'emerald_foliage'
    ) {
      touchesGrass = true;
    }

    const nbColor = nb.colorOverride || nbDef.color;
    const nbPattern = nb.textureOverride || nbDef.texturePattern;

    const compat = areBlocksColorAndPatternCompatible({
      blockAId: def.id,
      patternA: basePattern,
      colorA: baseColor,
      blockBId: nb.blockDefId,
      patternB: nbPattern,
      colorB: nbColor,
      colorThreshold: threshold,
    });

    if (compat.compatible) {
      matchedCount++;
      affinitySum += compat.affinityScore;
      const effWeight = weight * compat.affinityScore;
      const [nr, ng, nbRgb] = hexToRgb(nbColor);
      sumR += nr * effWeight;
      sumG += ng * effWeight;
      sumB += nbRgb * effWeight;
      totalWeight += effWeight;

      patternVotes[nbPattern] = (patternVotes[nbPattern] || 0) + effWeight;
    }
  }

  if (matchedCount === 0 || totalWeight <= 0) {
    return {
      matchedNeighborsCount: 0,
      avgAffinity: 0,
      summary: 'Isolated placement',
    };
  }

  const avgR = sumR / totalWeight;
  const avgG = sumG / totalWeight;
  const avgB = sumB / totalWeight;
  const [bR, bG, bB] = hexToRgb(baseColor);

  // Pull placed block color smoothly toward compatible neighbor cluster (up to 32% pull)
  const pullStrength = Math.min(
    0.32,
    (config.seamBlendStrength || 0.85) * 0.34
  );
  let outR = bR * (1 - pullStrength) + avgR * pullStrength;
  let outG = bG * (1 - pullStrength) + avgG * pullStrength;
  let outB = bB * (1 - pullStrength) + avgB * pullStrength;

  // If masonry/stone is placed directly next to grass turf, infuse subtle mossy olive warmth
  if (
    touchesGrass &&
    def.id !== 'grass_brick' &&
    def.id !== 'dirt_brick' &&
    (basePattern === 'cobblestone' || basePattern === 'brick_masonry') &&
    (config.weatheringMossIntensity || 0) > 0
  ) {
    const mossPull = (config.weatheringMossIntensity || 0.25) * 0.18;
    outR = outR * (1 - mossPull) + 84 * mossPull;
    outG = outG * (1 - mossPull) + 124 * mossPull;
    outB = outB * (1 - mossPull) + 68 * mossPull;
  }

  const predictedHex = rgbToHex(outR, outG, outB);

  // If a generic smooth_abs block is placed inside a strong textured cluster of similar color, adopt the cluster's pattern
  let predictedPattern: BlockTexturePattern | undefined = undefined;
  if (basePattern === 'smooth_abs') {
    let bestPat: BlockTexturePattern | undefined;
    let bestScore = 0;
    for (const [pat, sc] of Object.entries(patternVotes)) {
      if ((sc || 0) > bestScore && pat !== 'smooth_abs') {
        bestScore = sc || 0;
        bestPat = pat as BlockTexturePattern;
      }
    }
    if (bestPat && bestScore >= 1.2) {
      predictedPattern = bestPat;
    }
  }

  const avgAffinity = Math.round((affinitySum / matchedCount) * 100) / 100;

  return {
    colorOverride: predictedHex !== baseColor ? predictedHex : undefined,
    textureOverride: predictedPattern,
    matchedNeighborsCount: matchedCount,
    avgAffinity,
    summary: `Linked with ${matchedCount} similar neighbor${matchedCount === 1 ? '' : 's'} (${Math.round(avgAffinity * 100)}% affinity)`,
  };
}

/**
 * Steps a 3D block scale up or down via Shift + Mouse Wheel Scroll
 * supporting both 'snap' (modular architectural steps) and 'free' (fine 0.10 continuous scale).
 */
export function stepBlockScaleOnScroll(
  current: BlockScale3D,
  scrollDirection: 1 | -1,
  mode: ScrollResizeMode,
  axis: ScrollResizeAxis
): BlockScale3D {
  const SNAP_STEPS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];

  const stepVal = (v: number): number => {
    if (mode === 'snap') {
      // Find nearest snap index
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < SNAP_STEPS.length; i++) {
        const diff = Math.abs(SNAP_STEPS[i] - v);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      const nextIdx = Math.max(
        0,
        Math.min(SNAP_STEPS.length - 1, bestIdx + scrollDirection)
      );
      return SNAP_STEPS[nextIdx];
    } else {
      // Free scroll mode: fine 0.10 increments clamped between 0.20 and 8.00
      const next = Math.round((v + scrollDirection * 0.1) * 100) / 100;
      return Math.max(0.2, Math.min(8.0, next));
    }
  };

  if (axis === 'uniform') {
    return {
      x: stepVal(current.x),
      y: stepVal(current.y),
      z: stepVal(current.z),
    };
  }
  if (axis === 'footprint') {
    return {
      x: stepVal(current.x),
      y: current.y,
      z: stepVal(current.z),
    };
  }
  if (axis === 'height') {
    return {
      x: current.x,
      y: stepVal(current.y),
      z: current.z,
    };
  }
  if (axis === 'width') {
    return {
      x: stepVal(current.x),
      y: current.y,
      z: current.z,
    };
  }
  return {
    x: current.x,
    y: current.y,
    z: stepVal(current.z),
  };
}

/**
 * Evaluates a block's local 6-face neighborhood, color/pattern similarity, and
 * 4x4 World-Space Mega-Spritemap coordinates for seamless connected textures.
 */
export function computeSmartBlockVariation(
  blk: PlacedBlock,
  def: CustomBlockDefinition,
  allBlocks: Record<string, PlacedBlock>,
  allDefs: Record<string, CustomBlockDefinition>,
  config?: SmartPatternVariationConfig
): ComputedBlockVariation {
  const baseHex = blk.colorOverride || def.color || '#7E8B9B';
  const basePattern = blk.textureOverride || def.texturePattern;
  const { x, y, z } = blk.position;

  // Deterministic 4x4 World-Space Mega-Spritemap coordinates so adjacent blocks sample
  // adjacent tiles of the continuous 4x4 multi-block spritemap!
  const atlasTopU = (((x % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const atlasTopV = (((z % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const atlasSideU = ((((x + z) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const atlasSideV = (((y % 4) + 4) % 4) as 0 | 1 | 2 | 3;

  if (!config || !config.enabled) {
    return {
      effectiveHex: baseHex,
      roughnessDelta: 0,
      connectedMask: 0,
      connectedMode: 'isolated',
      uvRotationQuarterTurns: 0,
      variantIndex: 0,
      atlasTopCell: [atlasTopU, atlasTopV],
      atlasSideCell: [atlasSideU, atlasSideV],
    };
  }

  const scale = Math.max(0.15, config.spatialScale);
  const phase = config.evolutionPhase || 0;
  const seedOffset = (config.seed || 42) * 0.713;
  const colorThreshold = config.colorSimilarityThreshold ?? 45;

  // 1. Inspect 6 face-adjacent neighbors using Color & Pattern Similarity Matcher
  const neighborOffsets: [number, number, number, number][] = [
    [1, 0, 0, 1], // +X
    [-1, 0, 0, 2], // -X
    [0, 1, 0, 4], // +Y
    [0, -1, 0, 8], // -Y
    [0, 0, 1, 16], // +Z
    [0, 0, -1, 32], // -Z
  ];

  let connectedMask = 0;
  let compatibleHorizCount = 0;
  let compatibleVertCount = 0;
  let touchesGrassOrNature = false;
  const neighborRgbList: [number, number, number][] = [];
  const compatibleNeighborRgbList: [number, number, number][] = [];

  for (const [dx, dy, dz, bit] of neighborOffsets) {
    const nb = allBlocks[coordKey(x + dx, y + dy, z + dz)];
    if (!nb) continue;
    const nbDef = allDefs[nb.blockDefId];
    if (!nbDef) continue;

    const nbHex = nb.colorOverride || nbDef.color;
    const nbPattern = nb.textureOverride || nbDef.texturePattern;

    const compat = areBlocksColorAndPatternCompatible({
      blockAId: blk.blockDefId,
      patternA: basePattern,
      colorA: baseHex,
      blockBId: nb.blockDefId,
      patternB: nbPattern,
      colorB: nbHex,
      colorThreshold,
    });

    if (compat.compatible) {
      connectedMask |= bit;
      if (dy === 0) compatibleHorizCount++;
      else compatibleVertCount++;
      if (nbHex) {
        compatibleNeighborRgbList.push(hexToRgb(nbHex));
      }
    }

    if (
      nb.blockDefId === 'grass_brick' ||
      nb.blockDefId === 'emerald_foliage'
    ) {
      touchesGrassOrNature = true;
    }

    if (nbHex) {
      neighborRgbList.push(hexToRgb(nbHex));
    }
  }

  // Classify connected-art CTM mode: ANY block with >=1 horizontal or vertical compatible neighbor
  // enters seamless_interior / horizontal_run so its spritemap connects without outer box borders!
  let connectedMode: ConnectedArtMode = 'isolated';
  if (
    compatibleHorizCount >= 2 ||
    (compatibleHorizCount >= 1 && compatibleVertCount >= 1)
  ) {
    connectedMode = 'seamless_interior';
  } else if (compatibleVertCount >= 1 && compatibleHorizCount === 0) {
    connectedMode = 'vertical_pillar';
  } else if (compatibleHorizCount === 1) {
    connectedMode = 'horizontal_run';
  } else if (neighborRgbList.length >= 2) {
    connectedMode = 'edge_frame';
  }

  // 2. Smooth Looping 3D Spatial Coherent Wave Field
  const waveX = Math.sin(x * scale + seedOffset + Math.cos(phase));
  const waveZ = Math.cos(z * scale - seedOffset * 0.5 + Math.sin(phase));
  const waveY = Math.sin(y * scale * 1.3 + phase);
  const hashCoord =
    Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + config.seed) * 43758.5453;
  const fracHash = hashCoord - Math.floor(hashCoord);
  const microJitter = fracHash * 2 - 1;

  const combinedWave =
    (waveX * 0.48 + waveZ * 0.44 + waveY * 0.08 + microJitter * 0.08) * 0.65;

  // 3. Apply Cohesive Hue & Luminance Shift (highly cohesive across connected walls/floors)
  const baseRgb = hexToRgb(baseHex);
  const [h, s, l] = rgbToHsl(baseRgb[0], baseRgb[1], baseRgb[2]);

  const connectionCohesion =
    compatibleHorizCount + compatibleVertCount > 0
      ? Math.max(0.18, 1 - config.seamBlendStrength * 0.78)
      : 1.0;

  const hueDelta = combinedWave * config.hueShiftSpread * connectionCohesion;
  const lumDelta = combinedWave * config.luminanceJitter * connectionCohesion;

  const variedH = h + hueDelta;
  const variedS = Math.max(0, Math.min(1, s * (1 + microJitter * 0.02)));
  const variedL = Math.max(0.08, Math.min(0.94, l + lumDelta));

  let [outR, outG, outB] = hslToRgb(variedH, variedS, variedL);

  // 4. Smart Seam Color Blending: strongly harmonize touching compatible blocks so spritemap seams disappear
  const blendSource =
    compatibleNeighborRgbList.length > 0
      ? compatibleNeighborRgbList
      : neighborRgbList;
  if (config.seamBlendStrength > 0 && blendSource.length > 0) {
    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    for (const [nr, ng, nb] of blendSource) {
      avgR += nr;
      avgG += ng;
      avgB += nb;
    }
    avgR /= blendSource.length;
    avgG /= blendSource.length;
    avgB /= blendSource.length;

    const blendFactor =
      compatibleNeighborRgbList.length > 0
        ? config.seamBlendStrength * 0.48
        : config.seamBlendStrength * 0.16;
    outR = outR * (1 - blendFactor) + avgR * blendFactor;
    outG = outG * (1 - blendFactor) + avgG * blendFactor;
    outB = outB * (1 - blendFactor) + avgB * blendFactor;
  }

  // 5. Weathering / Moss Patina on stone or masonry touching grass/nature
  if (
    config.weatheringMossIntensity > 0 &&
    blk.blockDefId !== 'grass_brick' &&
    blk.blockDefId !== 'dirt_brick' &&
    (touchesGrassOrNature || (y <= 0 && combinedWave > 0.32)) &&
    (basePattern === 'cobblestone' || basePattern === 'brick_masonry')
  ) {
    const mossFactor =
      config.weatheringMossIntensity * (touchesGrassOrNature ? 0.22 : 0.1);
    outR = outR * (1 - mossFactor) + 85 * mossFactor;
    outG = outG * (1 - mossFactor) + 122 * mossFactor;
    outB = outB * (1 - mossFactor) + 70 * mossFactor;
  }

  const qR = Math.round(outR / 2) * 2;
  const qG = Math.round(outG / 2) * 2;
  const qB = Math.round(outB / 2) * 2;

  // In Mega-Spritemap mode, variantIndex is unified per 4x4 macro-region so all 16 blocks
  // in a 4x4 spritemap share the exact same continuous Voronoi/brick/plank sheet!
  const phaseStep = Math.floor((phase / (Math.PI * 2)) * 4);
  const macroX = Math.floor(x / 4);
  const macroZ = Math.floor(z / 4);
  const coordHash = Math.abs(
    Math.floor(
      (config.megaSpritemapMode !== false ? macroX * 3 + macroZ * 5 : x * 7 + y * 13 + z * 19) +
        config.seed +
        phaseStep
    )
  );
  const variantIndex: 0 | 1 | 2 | 3 = config.uvAutoRotate
    ? ((coordHash % 4) as 0 | 1 | 2 | 3)
    : 0;

  const uvRotationQuarterTurns: 0 | 1 | 2 | 3 = 0;

  const roughnessDelta =
    Math.round(combinedWave * config.roughnessVariance * 10) / 10;

  return {
    effectiveHex: rgbToHex(qR, qG, qB),
    roughnessDelta,
    connectedMask,
    connectedMode,
    uvRotationQuarterTurns,
    variantIndex,
    atlasTopCell: [atlasTopU, atlasTopV],
    atlasSideCell: [atlasSideU, atlasSideV],
  };
}

/**
 * Computes all relative (dx, dy, dz) grid offsets inside a 3D Volume Brush
 * (sphere, cube, cylinder, or diamond; solid or hollow shell).
 */
export function computeVolumeBrushOffsets(
  brush: VolumeBrushConfig
): GridCoord[] {
  const r = Math.max(0, Math.min(8, Math.round(brush.radius)));
  const h = Math.max(1, Math.min(12, Math.round(brush.height || r * 2 + 1)));
  const offsets: GridCoord[] = [];

  if (r === 0) {
    return [{ x: 0, y: 0, z: 0 }];
  }

  const minY = brush.shape === 'cylinder' ? 0 : -r;
  const maxY = brush.shape === 'cylinder' ? h - 1 : r;
  const rSq = (r + 0.35) * (r + 0.35);
  const innerRSq = Math.max(0, (r - 0.65) * (r - 0.65));

  for (let dy = minY; dy <= maxY; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        let inside = false;
        let onShell = false;

        if (brush.shape === 'cube') {
          inside = true;
          onShell =
            Math.abs(dx) === r || Math.abs(dy) === r || Math.abs(dz) === r;
        } else if (brush.shape === 'sphere') {
          const dSq = dx * dx + dy * dy + dz * dz;
          inside = dSq <= rSq;
          onShell = inside && dSq >= innerRSq;
        } else if (brush.shape === 'cylinder') {
          const d2Sq = dx * dx + dz * dz;
          inside = d2Sq <= rSq;
          onShell =
            inside && (d2Sq >= innerRSq || dy === minY || dy === maxY);
        } else if (brush.shape === 'diamond') {
          const manhattan = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          inside = manhattan <= r + 1;
          onShell = inside && manhattan >= r;
        }

        if (inside && (!brush.hollow || onShell)) {
          offsets.push({ x: dx, y: dy, z: dz });
        }
      }
    }
  }

  return offsets;
}

/**
 * Applies a 3D Volume Brush (large-scale place or large-scale remove/excavate)
 * centered at `center` in a single atomic Undo-able operation.
 */
export function applyVolumeBrushToWorld(params: {
  state: WorldEditEngineState;
  center: GridCoord;
  mode: 'brush_place' | 'brush_erase' | 'place' | 'erase';
  brush: VolumeBrushConfig;
  activeBlockId: string;
  rotation: 0 | 90 | 180 | 270;
  customScale?: BlockScale3D;
  patternConfig?: SmartPatternVariationConfig;
}): {
  nextState: WorldEditEngineState;
  affectedCount: number;
} {
  const {
    state,
    center,
    mode,
    brush,
    activeBlockId,
    rotation,
    customScale,
    patternConfig,
  } = params;

  const isErase = mode === 'brush_erase' || mode === 'erase';
  const isPlace = mode === 'brush_place' || mode === 'place';

  const offsets = computeVolumeBrushOffsets(brush);
  const nextBlocks = { ...state.blocks };
  let affectedCount = 0;
  const def = state.customBlocks[activeBlockId];
  const hasCustomScale =
    customScale &&
    (customScale.x !== 1 || customScale.y !== 1 || customScale.z !== 1);

  for (const off of offsets) {
    const target: GridCoord = {
      x: center.x + off.x,
      y: center.y + off.y,
      z: center.z + off.z,
    };
    if (target.y < -16) continue;
    const key = coordKey(target.x, target.y, target.z);

    if (isErase) {
      if (nextBlocks[key]) {
        delete nextBlocks[key];
        affectedCount++;
      }
    } else if (isPlace && def) {
      if (brush.airOnly && nextBlocks[key]) {
        continue;
      }
      const predicted = patternConfig
        ? predictBlockAttributesOnPlacement({
            coord: target,
            def,
            allBlocks: nextBlocks,
            allDefs: state.customBlocks,
            config: patternConfig,
          })
        : ({} as {
            colorOverride?: string;
            textureOverride?: import('./types').BlockTexturePattern;
          });
      nextBlocks[key] = {
        id: `blk_${target.x}_${target.y}_${target.z}_${Date.now()}`,
        blockDefId: activeBlockId,
        position: target,
        rotation,
        ...(predicted.colorOverride
          ? { colorOverride: predicted.colorOverride }
          : {}),
        ...(predicted.textureOverride
          ? { textureOverride: predicted.textureOverride }
          : {}),
        ...(hasCustomScale ? { customScale: { ...customScale! } } : {}),
      };
      affectedCount++;
    }
  }

  if (affectedCount === 0) {
    return { nextState: state, affectedCount: 0 };
  }

  const label = isErase
    ? `3D Erase Brush (R=${brush.radius}, -${affectedCount})`
    : `3D Place Brush (R=${brush.radius}, +${affectedCount})`;
  const withUndo = pushUndoSnapshot(state, label);
  return {
    nextState: {
      ...withUndo,
      blocks: nextBlocks,
    },
    affectedCount,
  };
}

export type SelectionTransformAction =
  | 'raise_up'
  | 'lower_down'
  | 'shift_up'
  | 'shift_down'
  | 'shift_north'
  | 'shift_south'
  | 'shift_west'
  | 'shift_east'
  | 'expand_up'
  | 'expand_down'
  | 'expand_north'
  | 'expand_south'
  | 'expand_west'
  | 'expand_east'
  | 'expand_all'
  | 'expand_all_xz'
  | 'expand_all_xyz'
  | 'contract_all'
  | 'contract_all_xz'
  | 'contract_all_xyz';

/**
 * Shifts, raises, lowers, expands, or contracts a Pos1–Pos2 selection region cleanly.
 */
export function transformSelectionBox(
  pos1: GridCoord | null,
  pos2: GridCoord | null,
  action: SelectionTransformAction,
  step = 1
): { pos1: GridCoord; pos2: GridCoord } {
  const a = pos1 || pos2 || { x: 0, y: 1, z: 0 };
  const b = pos2 || pos1 || { x: 0, y: 1, z: 0 };

  let minX = Math.min(a.x, b.x);
  let maxX = Math.max(a.x, b.x);
  let minY = Math.min(a.y, b.y);
  let maxY = Math.max(a.y, b.y);
  let minZ = Math.min(a.z, b.z);
  let maxZ = Math.max(a.z, b.z);

  switch (action) {
    case 'raise_up':
    case 'shift_up':
      minY += step;
      maxY += step;
      break;
    case 'lower_down':
    case 'shift_down':
      minY -= step;
      maxY -= step;
      break;
    case 'shift_north':
      minZ -= step;
      maxZ -= step;
      break;
    case 'shift_south':
      minZ += step;
      maxZ += step;
      break;
    case 'shift_west':
      minX -= step;
      maxX -= step;
      break;
    case 'shift_east':
      minX += step;
      maxX += step;
      break;
    case 'expand_up':
      maxY = Math.max(minY, maxY + step);
      break;
    case 'expand_down':
      minY = Math.min(maxY, minY - step);
      break;
    case 'expand_north':
      minZ = Math.min(maxZ, minZ - step);
      break;
    case 'expand_south':
      maxZ = Math.max(minZ, maxZ + step);
      break;
    case 'expand_west':
      minX = Math.min(maxX, minX - step);
      break;
    case 'expand_east':
      maxX = Math.max(minX, maxX + step);
      break;
    case 'expand_all_xz':
      minX -= step;
      maxX += step;
      minZ -= step;
      maxZ += step;
      break;
    case 'expand_all':
    case 'expand_all_xyz':
      minX -= step;
      maxX += step;
      minY -= step;
      maxY += step;
      minZ -= step;
      maxZ += step;
      break;
    case 'contract_all_xz':
      if (maxX - minX >= step * 2) {
        minX += step;
        maxX -= step;
      }
      if (maxZ - minZ >= step * 2) {
        minZ += step;
        maxZ -= step;
      }
      break;
    case 'contract_all':
    case 'contract_all_xyz':
      if (maxX - minX >= step * 2) {
        minX += step;
        maxX -= step;
      }
      if (maxY - minY >= step * 2) {
        minY += step;
        maxY -= step;
      }
      if (maxZ - minZ >= step * 2) {
        minZ += step;
        maxZ -= step;
      }
      break;
  }

  return {
    pos1: { x: minX, y: minY, z: minZ },
    pos2: { x: maxX, y: maxY, z: maxZ },
  };
}

