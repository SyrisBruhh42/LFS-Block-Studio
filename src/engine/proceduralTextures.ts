import * as THREE from 'three';
import {
  BlockMaterialFinish,
  BlockTexturePattern,
  PixelsPerBlock,
  ProceduralArtStyle,
} from './types';
import { AtlasCellCoord, ConnectedArtMode } from './chunkAndPatternEngine';

interface CachedTexturePair {
  map: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture;
}

const masterSpritemapCanvasCache = new Map<
  string,
  { albedo: HTMLCanvasElement; bump: HTMLCanvasElement }
>();
const textureCache = new Map<string, CachedTexturePair>();
const materialCache = new Map<
  string,
  THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
>();
const sixFaceMaterialCache = new Map<
  string,
  (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[]
>();

function hash2D(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function fillTexel(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  r: number,
  g: number,
  b: number
) {
  ctx.fillStyle = `rgb(${clampByte(r)},${clampByte(g)},${clampByte(b)})`;
  ctx.fillRect(gx * scale, gy * scale, scale, scale);
}

function fillGrayTexel(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  val: number,
  warmTint = 0
) {
  const r = clampByte(val + warmTint);
  const g = clampByte(val + warmTint * 0.3);
  const b = clampByte(val - warmTint * 0.7);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(gx * scale, gy * scale, scale, scale);
}

export type FaceTextureRole =
  | 'standard'
  | 'grass_top'
  | 'grass_side'
  | 'dirt_soil'
  | 'foliage_leaf';

function resolveFaceRole(
  pattern: BlockTexturePattern,
  blockId?: string,
  explicitRole?: FaceTextureRole
): FaceTextureRole {
  if (explicitRole && explicitRole !== 'standard') return explicitRole;
  if (blockId === 'dirt_brick') return 'dirt_soil';
  if (blockId === 'emerald_foliage') return 'foliage_leaf';
  if (blockId === 'grass_brick') return 'grass_top';
  return 'standard';
}

/**
 * Generates a continuous 4x4 Multi-Block Mega-Spritemap Canvas (1024x1024 px).
 * Because patterns (Voronoi boulders, masonry courses, long timber planks, grass waves,
 * and soil strata) are synthesized across a 4x4 block macro-domain that wraps toroidally
 * at the 4-block boundary, adjacent world blocks sampling neighboring (atlasU, atlasV)
 * sub-tiles connect with 100% pixel-perfect continuity across seams!
 */
function createMegaSpritemapCanvas(params: {
  pattern: BlockTexturePattern;
  isBump: boolean;
  connectedMode: ConnectedArtMode;
  variantIndex: 0 | 1 | 2 | 3;
  pixelsPerBlock: PixelsPerBlock;
  artStyle: ProceduralArtStyle;
  faceRole: FaceTextureRole;
}): HTMLCanvasElement {
  const {
    pattern,
    isBump,
    connectedMode,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    faceRole,
  } = params;

  const canvas = document.createElement('canvas');
  // 1024x1024 Mega-Spritemap covering 4x4 world blocks (256x256 px per block tile)
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = artStyle === 'hand_painted';

  const blockN = pixelsPerBlock || 64;
  // Total texels across the 4x4 multi-block spritemap (capped at 128x128 logical texels for instant synthesis)
  const M = blockN >= 64 ? 128 : blockN === 32 ? 96 : 64;
  const texelsPerBlock = M / 4;
  const scale = 1024 / M;
  const seed = (variantIndex + 1) * 37;

  const isSeamless = connectedMode !== 'isolated';
  const hasIsolatedBorder = connectedMode === 'isolated';

  const contrastMul =
    artStyle === 'chiseled_pbr'
      ? 1.25
      : artStyle === 'hand_painted'
        ? 0.85
        : 1.05;

  // ---------------------------------------------------------------------------
  // 1. 4x4 MEGA-SPRITEMAP: LUSH MEADOW GRASS TURF TOP ('grass_top')
  // ---------------------------------------------------------------------------
  if (faceRole === 'grass_top') {
    for (let gy = 0; gy < M; gy++) {
      for (let gx = 0; gx < M; gx++) {
        const n1 = hash2D(gx, gy, seed);
        const n2 = hash2D(
          Math.floor(gx / 2),
          Math.floor(gy / 2),
          seed + 11
        );
        // Large organic meadow waves spanning continuously across the 4x4 block spritemap!
        const macroWave =
          Math.sin((gx / M) * Math.PI * 4 + variantIndex) *
            Math.cos((gy / M) * Math.PI * 4 - variantIndex) *
            16 +
          Math.sin(((gx + gy) / M) * Math.PI * 6) * 9;

        const isBladeTip =
          hash2D(gx, (gy + 1) % M, seed + 5) > 0.72 && n1 > 0.45;
        const isBladeShadow =
          hash2D(gx, (gy + M - 1) % M, seed + 5) > 0.74 && n1 < 0.45;
        const isCloverFlower =
          hash2D(gx, gy, seed + 89) > 0.985 && !isBump;

        if (isBump) {
          const bVal =
            128 +
            (isBladeTip ? 42 : isBladeShadow ? -36 : (n1 - 0.5) * 38) *
              contrastMul;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val = 216 + macroWave + (n2 - 0.5) * 20 + (n1 - 0.5) * 14;
          let warm = macroWave * 0.35;
          if (isCloverFlower) {
            val = 250;
            warm = 22; // Tiny sunlit wildflower / clover fleck
          } else if (isBladeTip) {
            val += 24 * contrastMul;
            warm += 10;
          } else if (isBladeShadow) {
            val -= 24 * contrastMul;
            warm -= 8;
          }
          fillGrayTexel(ctx, gx, gy, scale, val, warm);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 2. 4x4 MEGA-SPRITEMAP: CONTINUOUS GRASS-OVER-LOAM SIDE SKIRT ('grass_side')
  // ---------------------------------------------------------------------------
  if (faceRole === 'grass_side') {
    for (let gy = 0; gy < M; gy++) {
      const localBlockY = gy % texelsPerBlock;
      const normY = localBlockY / texelsPerBlock; // 0..1 within each block's height

      for (let gx = 0; gx < M; gx++) {
        // Continuous horizontal wave across all 4 blocks of the spritemap width!
        const horizWave =
          Math.sin((gx / M) * Math.PI * 6 + variantIndex * 1.3) * 0.065 +
          Math.cos((gx / M) * Math.PI * 14 - variantIndex * 0.7) * 0.04;
        const colJitter = (hash2D(gx, 0, seed + 19) - 0.5) * 0.04;
        const fringeRatio = 0.29 + horizWave + colJitter;

        const n1 = hash2D(gx, gy, seed + 23);
        const n2 = hash2D(Math.floor(gx / 2), Math.floor(gy / 2), seed + 29);

        if (normY <= fringeRatio) {
          const isBottomLip =
            Math.abs(normY - fringeRatio) < 1.3 / texelsPerBlock;
          const isTopRim = localBlockY === 0;
          if (isBump) {
            const bVal = isBottomLip ? 185 : 152 + (n1 - 0.5) * 34;
            fillGrayTexel(ctx, gx, gy, scale, bVal);
          } else {
            let r = 82 + (n2 - 0.5) * 20 + (n1 - 0.5) * 14;
            let g = 166 + (n2 - 0.5) * 28 + (n1 - 0.5) * 20;
            let b = 64 + (n2 - 0.5) * 16 + (n1 - 0.5) * 12;
            if (isTopRim) {
              r += 16;
              g += 22;
              b += 10;
            } else if (isBottomLip) {
              r -= 16;
              g -= 22;
              b -= 12;
            }
            fillTexel(ctx, gx, gy, scale, r, g, b);
          }
        } else {
          const isUnderLipShadow =
            normY > fringeRatio &&
            normY <= fringeRatio + 2.1 / texelsPerBlock;
          const pebbleCell = hash2D(
            Math.floor(gx / 2),
            Math.floor(gy / 2),
            seed + 41
          );
          const isPebble = pebbleCell > 0.85 && n1 > 0.38;
          // Continuous soil strata wave across all 4 blocks
          const soilStrata = Math.sin(
            (gx / M) * Math.PI * 4 + (gy / M) * Math.PI * 2
          );

          if (isBump) {
            const bVal = isUnderLipShadow
              ? 68
              : isPebble
                ? 172
                : 118 + soilStrata * 10 + (n1 - 0.5) * 40;
            fillGrayTexel(ctx, gx, gy, scale, bVal);
          } else {
            let r =
              136 + soilStrata * 8 + (n2 - 0.5) * 20 + (n1 - 0.5) * 16;
            let g =
              96 + soilStrata * 6 + (n2 - 0.5) * 16 + (n1 - 0.5) * 12;
            let b =
              62 + soilStrata * 4 + (n2 - 0.5) * 12 + (n1 - 0.5) * 10;

            if (isPebble) {
              r = 148 + (n1 - 0.5) * 18;
              g = 142 + (n1 - 0.5) * 18;
              b = 134 + (n1 - 0.5) * 18;
            }
            if (isUnderLipShadow) {
              r *= 0.68;
              g *= 0.68;
              b *= 0.68;
            }
            fillTexel(ctx, gx, gy, scale, r, g, b);
          }
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 3. 4x4 MEGA-SPRITEMAP: RICH LOAM & PEBBLE SOIL ('dirt_soil')
  // ---------------------------------------------------------------------------
  if (faceRole === 'dirt_soil') {
    for (let gy = 0; gy < M; gy++) {
      for (let gx = 0; gx < M; gx++) {
        const n1 = hash2D(gx, gy, seed + 53);
        const n2 = hash2D(Math.floor(gx / 2), Math.floor(gy / 2), seed + 59);
        const strata = Math.sin(
          (gy / M) * Math.PI * 4 + Math.sin((gx / M) * Math.PI * 4) * 1.5
        );
        const pebbleHash = hash2D(
          Math.floor(gx / 3),
          Math.floor(gy / 3),
          seed + 67
        );
        const isPebble = pebbleHash > 0.84 && n1 > 0.35;

        if (isBump) {
          const bVal = isPebble
            ? 178
            : 124 + strata * 16 + (n1 - 0.5) * 44 * contrastMul;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val =
            212 +
            strata * 14 +
            (n2 - 0.5) * 24 * contrastMul +
            (n1 - 0.5) * 18 * contrastMul;
          let warm = 6;
          if (isPebble) {
            val += 26;
            warm = -10;
          }
          fillGrayTexel(ctx, gx, gy, scale, val, warm);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 4. 4x4 MEGA-SPRITEMAP: LUSH CANOPY LEAF CLUSTERS ('foliage_leaf')
  // ---------------------------------------------------------------------------
  if (faceRole === 'foliage_leaf') {
    const clusterSize = Math.max(3, Math.floor(texelsPerBlock / 6));
    for (let gy = 0; gy < M; gy++) {
      for (let gx = 0; gx < M; gx++) {
        const cx = Math.floor(gx / clusterSize);
        const cy = Math.floor(gy / clusterSize);
        const lx = gx % clusterSize;
        const ly = gy % clusterSize;
        const cHash = hash2D(cx, cy, seed + 71);
        const n1 = hash2D(gx, gy, seed + 79);

        const isLeafHighlight = lx <= 1 && ly <= 1;
        const isCanopyGap =
          lx === clusterSize - 1 && ly === clusterSize - 1 && cHash > 0.42;

        if (isBump) {
          const bVal = isCanopyGap
            ? 55
            : isLeafHighlight
              ? 182
              : 132 + (n1 - 0.5) * 40;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val = 212 + (cHash - 0.5) * 30 + (n1 - 0.5) * 16;
          if (isLeafHighlight) val += 26;
          if (isCanopyGap) val -= 48;
          fillGrayTexel(ctx, gx, gy, scale, val, isLeafHighlight ? 8 : -4);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 5. 4x4 MEGA-SPRITEMAP: INTERLOCKING VORONOI / ASHLAR COBBLESTONE ('cobblestone')
  // ---------------------------------------------------------------------------
  if (pattern === 'cobblestone') {
    // 10x10 Voronoi stone cells spanning the entire 4x4 block Mega-Spritemap!
    // Stones naturally cross the 0.25, 0.50, and 0.75 block seams!
    const cellsX = 10;
    const cellsY = 10;
    const pts: { x: number; y: number; tone: number; warm: number }[] = [];
    for (let cy = 0; cy < cellsY; cy++) {
      for (let cx = 0; cx < cellsX; cx++) {
        const jx = 0.16 + hash2D(cx, cy, seed + 101) * 0.68;
        const jy = 0.16 + hash2D(cx, cy, seed + 107) * 0.68;
        const tone = (hash2D(cx, cy, seed + 113) - 0.5) * 32;
        const warm = (hash2D(cx, cy, seed + 127) - 0.5) * 14;
        pts.push({
          x: (cx + jx) / cellsX,
          y: (cy + jy) / cellsY,
          tone,
          warm,
        });
      }
    }

    for (let gy = 0; gy < M; gy++) {
      for (let gx = 0; gx < M; gx++) {
        const u = gx / M;
        const v = gy / M;

        let d1 = 999;
        let d2 = 999;
        let closestIdx = 0;
        let dxClosest = 0;
        let dyClosest = 0;

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          let dx = u - p.x;
          let dy = v - p.y;
          if (dx > 0.5) dx -= 1;
          if (dx < -0.5) dx += 1;
          if (dy > 0.5) dy -= 1;
          if (dy < -0.5) dy += 1;

          const dist = Math.hypot(dx * 0.9, dy * 1.1);
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
            closestIdx = i;
            dxClosest = dx;
            dyClosest = dy;
          } else if (dist < d2) {
            d2 = dist;
          }
        }

        const edgeDelta = d2 - d1;
        const mortarThreshold = 0.011;
        const bevelThreshold = 0.025;

        const localX = gx % texelsPerBlock;
        const localY = gy % texelsPerBlock;
        const isIsolatedFrame =
          hasIsolatedBorder &&
          (localX === 0 ||
            localY === 0 ||
            localX === texelsPerBlock - 1 ||
            localY === texelsPerBlock - 1);

        const isMortar = edgeDelta < mortarThreshold || isIsolatedFrame;
        const isStoneBevel = !isMortar && edgeDelta < bevelThreshold;

        const stone = pts[closestIdx];
        const grain = (hash2D(gx, gy, seed + 131) - 0.5) * 14;
        const lightDir = (-dxClosest * 0.7 - dyClosest * 0.7) / (d1 + 0.001);

        if (isBump) {
          let bVal = 148 + stone.tone * 0.5 + grain;
          if (isMortar) bVal = 40;
          else if (isStoneBevel) bVal = 114 + lightDir * 28;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val = 218 + stone.tone * contrastMul + grain;
          if (isMortar) {
            val = 128 + grain * 0.5;
          } else if (isStoneBevel) {
            val += lightDir * 25 * contrastMul;
          } else {
            val += lightDir * 8 * contrastMul;
          }
          fillGrayTexel(ctx, gx, gy, scale, val, isMortar ? -4 : stone.warm);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 6. 4x4 MEGA-SPRITEMAP: CONTINUOUS RUNNING-BOND BRICK MASONRY ('brick_masonry')
  // ---------------------------------------------------------------------------
  if (pattern === 'brick_masonry') {
    // 16 courses across 4 vertical blocks (4 courses per block), 8 bricks per row across 4 horizontal blocks
    const coursesTotal = 16;
    const bricksTotalX = 8;
    const courseH = M / coursesTotal;
    const brickW = M / bricksTotalX;

    for (let gy = 0; gy < M; gy++) {
      const courseIdx = Math.floor(gy / courseH);
      const localY = gy % courseH;
      // Stagger odd courses by half a brick so bricks bridge right across block boundaries!
      const stagger = (courseIdx % 2) * (brickW * 0.5);

      for (let gx = 0; gx < M; gx++) {
        const shiftedX = (gx + stagger) % M;
        const brickIdx = Math.floor(shiftedX / brickW);
        const localX = shiftedX % brickW;

        const bHash = hash2D(brickIdx, courseIdx, seed + 151);
        const grain = (hash2D(gx, gy, seed + 157) - 0.5) * 14;
        const clayPore = hash2D(gx, gy, seed + 163) > 0.9 ? -15 : 0;

        const isHorizMortar = localY < 1;
        const isVertMortar = localX < 1;
        const isMortar = isHorizMortar || isVertMortar;

        const isTopHighlight =
          !isMortar && (localY < 2 || (localX >= 1 && localX < 2));
        const isBottomShadow =
          !isMortar &&
          (localY >= courseH - 1.2 || localX >= brickW - 1.2);

        if (isBump) {
          const bVal = isMortar
            ? 45
            : isTopHighlight
              ? 178
              : isBottomShadow
                ? 115
                : 150 + (bHash - 0.5) * 24 + grain + clayPore;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          if (isMortar) {
            fillGrayTexel(ctx, gx, gy, scale, 152 + grain * 0.5, -4);
          } else {
            let val = 216 + (bHash - 0.5) * 30 * contrastMul + grain + clayPore;
            const warm = (bHash - 0.5) * 18;
            if (isTopHighlight) val += 20 * contrastMul;
            else if (isBottomShadow) val -= 18 * contrastMul;
            fillGrayTexel(ctx, gx, gy, scale, val, warm);
          }
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 7. 4x4 MEGA-SPRITEMAP: CONTINUOUS MULTI-BLOCK TIMBER PLANKS ('oak_planks')
  // ---------------------------------------------------------------------------
  if (pattern === 'oak_planks') {
    // 16 plank rows across 4 vertical blocks (4 planks per block).
    // Each plank spans 2 to 3 blocks horizontally across the Mega-Spritemap before a staggered butt joint!
    const planksTotal = 16;
    const plankH = M / planksTotal;

    for (let gy = 0; gy < M; gy++) {
      const plankIdx = Math.floor(gy / plankH);
      const localY = gy % plankH;
      const pHash = hash2D(plankIdx, variantIndex, seed + 181);

      // Only 1 butt joint across the entire 4-block width so planks run continuously across block seams!
      const jointX = Math.floor(
        ((plankIdx * 0.41 + variantIndex * 0.19 + 0.12) % 0.82 + 0.09) * M
      );
      const knotX = Math.floor(
        ((plankIdx * 0.63 + variantIndex * 0.29 + 0.22) % 0.78 + 0.11) * M
      );
      const knotY = Math.floor(plankH * 0.5);

      for (let gx = 0; gx < M; gx++) {
        const isPlankSeam = localY < 1;
        const isButtJoint = Math.abs(gx - jointX) === 0;
        const isDowelPin =
          Math.abs(gx - jointX) === 2 &&
          (Math.floor(localY) === 2 ||
            Math.floor(localY) === Math.floor(plankH) - 2);

        const distToKnot = Math.hypot(
          (gx - knotX) * 0.55,
          (localY - knotY) * 1.35
        );
        const knotWarp =
          distToKnot < 4.5
            ? Math.cos((distToKnot / 4.5) * Math.PI) * 2.4
            : 0;
        const grainWave = Math.sin(
          (localY + knotWarp) * 1.45 +
            Math.sin((gx / M) * Math.PI * 4 + plankIdx) * 1.8
        );
        const fineFiber = (hash2D(gx, gy, seed + 193) - 0.5) * 10;

        const isTopBevel = localY >= 1 && localY < 2;
        const isBottomBevel = localY >= plankH - 1.2;

        if (isBump) {
          let bVal = 142 + grainWave * 16 + fineFiber;
          if (isPlankSeam || isButtJoint) bVal = 48;
          else if (isDowelPin) bVal = 185;
          else if (distToKnot < 2.2) bVal = 95;
          else if (isTopBevel) bVal += 18;
          else if (isBottomBevel) bVal -= 16;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val =
            218 +
            (pHash - 0.5) * 20 * contrastMul +
            grainWave * 13 * contrastMul +
            fineFiber;
          if (isPlankSeam || isButtJoint) {
            val = 134;
          } else if (isDowelPin) {
            val = 172;
          } else if (distToKnot < 2.0) {
            val -= 32;
          } else if (isTopBevel) {
            val += 15 * contrastMul;
          } else if (isBottomBevel) {
            val -= 14 * contrastMul;
          }
          fillGrayTexel(ctx, gx, gy, scale, val, 5);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 8. 4x4 MEGA-SPRITEMAP: CONNECTED INDUSTRIAL TECH PANEL ('tech_panel')
  // ---------------------------------------------------------------------------
  if (pattern === 'tech_panel') {
    for (let gy = 0; gy < M; gy++) {
      const localY = gy % texelsPerBlock;
      for (let gx = 0; gx < M; gx++) {
        const localX = gx % texelsPerBlock;
        const brushed =
          (hash2D(Math.floor(gx / 4), gy, seed + 211) - 0.5) * 10 +
          Math.sin((gx / M) * Math.PI * 4) * 5;

        // In seamless CTM mode, frame only around the outer 4x4 mega-hull or subtle conduit tracks
        const isMacroBorder =
          !isSeamless &&
          (localX === 0 ||
            localY === 0 ||
            localX === texelsPerBlock - 1 ||
            localY === texelsPerBlock - 1);
        const isConduitSeam =
          gx === 0 || gy === 0 || gx === Math.floor(M / 2) || gy === Math.floor(M / 2);

        const isRivet =
          (localX === 3 || localX === texelsPerBlock - 4) &&
          (localY === 3 || localY === texelsPerBlock - 4);

        if (isBump) {
          let bVal = 145 + brushed;
          if (isMacroBorder || isConduitSeam) bVal = 60;
          else if (isRivet) bVal = 220;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val = 226 + brushed;
          if (isMacroBorder || isConduitSeam) val = 148;
          else if (isRivet) val = 248;
          fillGrayTexel(ctx, gx, gy, scale, val, -3);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 9. 4x4 MEGA-SPRITEMAP: INLAID MARBLE & COFFERED TILE ('checker_tile')
  // ---------------------------------------------------------------------------
  if (pattern === 'checker_tile') {
    const tileS = texelsPerBlock / 2;
    for (let gy = 0; gy < M; gy++) {
      for (let gx = 0; gx < M; gx++) {
        const tx = Math.floor(gx / tileS);
        const ty = Math.floor(gy / tileS);
        const lx = gx % tileS;
        const ly = gy % tileS;
        const isEven = (tx + ty) % 2 === 0;

        // Continuous marble vein crossing multiple blocks across the 4x4 spritemap!
        const vein =
          Math.pow(
            Math.abs(
              Math.sin(((gx + gy * 0.75) / M) * Math.PI * 6 + variantIndex)
            ),
            12
          ) * 24;
        const isGrout = lx < 1 || ly < 1;
        const isBevelLight = !isGrout && (lx < 2 || ly < 2);
        const isBevelDark =
          !isGrout && (lx >= tileS - 1.2 || ly >= tileS - 1.2);

        if (isBump) {
          const bVal = isGrout
            ? 58
            : isBevelLight
              ? 176
              : isBevelDark
                ? 116
                : isEven
                  ? 156
                  : 138;
          fillGrayTexel(ctx, gx, gy, scale, bVal);
        } else {
          let val = (isEven ? 238 : 196) + vein * (isEven ? -1 : 1);
          if (isGrout) val = 142;
          else if (isBevelLight) val += 15;
          else if (isBevelDark) val -= 15;
          fillGrayTexel(ctx, gx, gy, scale, val);
        }
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // 10. 4x4 MEGA-SPRITEMAP: HONED ARCHITECTURAL STONE ('smooth_abs')
  // ---------------------------------------------------------------------------
  for (let gy = 0; gy < M; gy++) {
    for (let gx = 0; gx < M; gx++) {
      const micro = (hash2D(gx, gy, seed + 241) - 0.5) * 7;
      const vein =
        Math.sin((gx / M) * Math.PI * 4 + (gy / M) * Math.PI * 2) * 5;
      if (isBump) {
        fillGrayTexel(ctx, gx, gy, scale, 136 + micro + vein);
      } else {
        fillGrayTexel(ctx, gx, gy, scale, 238 + micro + vein);
      }
    }
  }
  return canvas;
}

function getMasterSpritemapCanvases(params: {
  pattern: BlockTexturePattern;
  connectedMode: ConnectedArtMode;
  variantIndex: 0 | 1 | 2 | 3;
  pixelsPerBlock: PixelsPerBlock;
  artStyle: ProceduralArtStyle;
  faceRole: FaceTextureRole;
}): { albedo: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const key = `master4x4_${params.pattern}_${params.faceRole}_${params.connectedMode}_v${params.variantIndex}_px${params.pixelsPerBlock}_${params.artStyle}`;
  const cached = masterSpritemapCanvasCache.get(key);
  if (cached) return cached;

  const albedo = createMegaSpritemapCanvas({ ...params, isBump: false });
  const bump = createMegaSpritemapCanvas({ ...params, isBump: true });
  const entry = { albedo, bump };
  masterSpritemapCanvasCache.set(key, entry);
  return entry;
}

export function getProceduralTextures(
  pattern: BlockTexturePattern,
  maxAnisotropy = 4,
  connectedMode: ConnectedArtMode = 'isolated',
  uvRotationQuarterTurns: 0 | 1 | 2 | 3 = 0,
  variantIndex: 0 | 1 | 2 | 3 = 0,
  pixelsPerBlock: PixelsPerBlock = 64,
  artStyle: ProceduralArtStyle = 'pixel_art_hd',
  faceRole: FaceTextureRole = 'standard',
  atlasCell: AtlasCellCoord = [0, 0],
  uvScaleRepeat: [number, number] = [1, 1]
): CachedTexturePair {
  const [au, av] = atlasCell;
  const rx = Math.round(uvScaleRepeat[0] * 4) / 4;
  const ry = Math.round(uvScaleRepeat[1] * 4) / 4;

  const cacheKey = `${pattern}_${faceRole}_${connectedMode}_v${variantIndex}_px${pixelsPerBlock}_${artStyle}_rot${uvRotationQuarterTurns}_a${au}_${av}_s${rx}_${ry}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  if (typeof document === 'undefined') {
    return {
      map: null as unknown as THREE.CanvasTexture,
      bumpMap: null as unknown as THREE.CanvasTexture,
    };
  }

  const { albedo, bump } = getMasterSpritemapCanvases({
    pattern,
    connectedMode,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    faceRole,
  });

  const useCrispNearest = artStyle === 'pixel_art_hd';

  // Each 1x1 block samples a 0.25 x 0.25 sub-window at (au * 0.25, av * 0.25) of the 4x4 Mega-Spritemap!
  const repeatU = 0.25 * rx;
  const repeatV = 0.25 * ry;
  const offsetU = au * 0.25;
  const offsetV = av * 0.25;

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatU, repeatV);
  map.offset.set(offsetU, offsetV);
  map.magFilter = useCrispNearest ? THREE.NearestFilter : THREE.LinearFilter;
  map.minFilter = useCrispNearest
    ? THREE.NearestMipmapLinearFilter
    : THREE.LinearMipmapLinearFilter;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatU, repeatV);
  bumpMap.offset.set(offsetU, offsetV);
  bumpMap.magFilter = useCrispNearest ? THREE.NearestFilter : THREE.LinearFilter;
  bumpMap.anisotropy = maxAnisotropy;

  const pair: CachedTexturePair = {
    map,
    bumpMap,
  };
  textureCache.set(cacheKey, pair);
  return pair;
}

export function getBlockMaterial(params: {
  color: string;
  texturePattern: BlockTexturePattern;
  materialFinish: BlockMaterialFinish;
  isSoftwareGl: boolean;
  maxAnisotropy?: number;
  ghostOpacity?: number;
  connectedMode?: ConnectedArtMode;
  uvRotationQuarterTurns?: 0 | 1 | 2 | 3;
  roughnessDelta?: number;
  variantIndex?: 0 | 1 | 2 | 3;
  pixelsPerBlock?: PixelsPerBlock;
  artStyle?: ProceduralArtStyle;
  blockId?: string;
  faceRole?: FaceTextureRole;
  atlasCell?: AtlasCellCoord;
  uvScaleRepeat?: [number, number];
}): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const {
    color,
    texturePattern,
    materialFinish,
    isSoftwareGl,
    maxAnisotropy = 4,
    ghostOpacity,
    connectedMode = 'isolated',
    uvRotationQuarterTurns = 0,
    roughnessDelta = 0,
    variantIndex = 0,
    pixelsPerBlock = 64,
    artStyle = 'pixel_art_hd',
    blockId,
    faceRole: explicitRole,
    atlasCell = [0, 0],
    uvScaleRepeat = [1, 1],
  } = params;

  const faceRole = resolveFaceRole(texturePattern, blockId, explicitRole);
  const [au, av] = atlasCell;
  const rx = Math.round(uvScaleRepeat[0] * 4) / 4;
  const ry = Math.round(uvScaleRepeat[1] * 4) / 4;

  const key = `${color}_${texturePattern}_${faceRole}_${materialFinish}_${connectedMode}_v${variantIndex}_px${pixelsPerBlock}_${artStyle}_a${au}_${av}_s${rx}_${ry}_r${uvRotationQuarterTurns}_rd${roughnessDelta}_${isSoftwareGl ? 'sw' : 'hw'}_${ghostOpacity ?? 'solid'}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const { map, bumpMap } = getProceduralTextures(
    texturePattern,
    maxAnisotropy,
    connectedMode,
    uvRotationQuarterTurns,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    faceRole,
    atlasCell,
    [rx, ry]
  );

  const baseColor =
    faceRole === 'grass_side'
      ? new THREE.Color('#ffffff')
      : new THREE.Color(color);
  const clampRough = (r: number) =>
    Math.max(0.06, Math.min(0.98, r + roughnessDelta));

  const bumpScaleMul = artStyle === 'chiseled_pbr' ? 1.4 : 1.0;

  let mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

  if (materialFinish === 'glass') {
    mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      map: map || null,
      roughness: clampRough(0.12),
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.82,
      transparent: true,
      opacity: ghostOpacity ?? (isSoftwareGl ? 0.48 : 0.88),
      ior: 1.48,
      thickness: 0.8,
      clearcoat: isSoftwareGl ? 0 : 0.9,
      depthWrite: ghostOpacity ? false : !isSoftwareGl,
    });
  } else if (materialFinish === 'neon') {
    mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: map || null,
      emissive: baseColor,
      emissiveIntensity: 0.65,
      roughness: clampRough(0.2),
      metalness: 0.1,
      transparent: Boolean(ghostOpacity),
      opacity: ghostOpacity ?? 1,
    });
  } else if (materialFinish === 'metallic') {
    mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      map: map || null,
      bumpMap,
      bumpScale: 0.028 * bumpScaleMul,
      roughness: clampRough(0.24),
      metalness: 0.82,
      clearcoat: isSoftwareGl ? 0 : 0.35,
      transparent: Boolean(ghostOpacity),
      opacity: ghostOpacity ?? 1,
    });
  } else if (materialFinish === 'matte') {
    mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: map || null,
      bumpMap,
      bumpScale: 0.038 * bumpScaleMul,
      roughness: clampRough(0.82),
      metalness: 0.04,
      transparent: Boolean(ghostOpacity),
      opacity: ghostOpacity ?? 1,
    });
  } else {
    mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      map: map || null,
      bumpMap,
      bumpScale: 0.022 * bumpScaleMul,
      roughness: clampRough(0.32),
      metalness: 0.04,
      clearcoat: isSoftwareGl ? 0 : 0.45,
      clearcoatRoughness: 0.2,
      transparent: Boolean(ghostOpacity),
      opacity: ghostOpacity ?? 1,
    });
  }

  if (ghostOpacity !== undefined) {
    mat.depthWrite = false;
  }

  mat.userData = { ...mat.userData, isCachedStudioMaterial: true };
  materialCache.set(key, mat);
  return mat;
}

/**
 * Returns a 6-face material array [+X, -X, +Y (Top), -Y (Bottom), +Z, -Z]
 * mapped into the continuous 4x4 World-Space Mega-Spritemap so both top/bottom
 * horizontal faces and all 4 vertical side faces connect seamlessly across neighbors!
 */
export function getSixFaceSpritemapMaterials(params: {
  color: string;
  texturePattern: BlockTexturePattern;
  materialFinish: BlockMaterialFinish;
  blockId: string;
  isSoftwareGl: boolean;
  maxAnisotropy?: number;
  ghostOpacity?: number;
  connectedMode?: ConnectedArtMode;
  connectedMask?: number;
  roughnessDelta?: number;
  variantIndex?: 0 | 1 | 2 | 3;
  pixelsPerBlock?: PixelsPerBlock;
  artStyle?: ProceduralArtStyle;
  atlasTopCell?: AtlasCellCoord;
  atlasSideCell?: AtlasCellCoord;
  effectiveDims?: { w: number; h: number; d: number };
}): (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] {
  const {
    color,
    texturePattern,
    materialFinish,
    blockId,
    isSoftwareGl,
    maxAnisotropy = 4,
    ghostOpacity,
    connectedMode = 'isolated',
    connectedMask = 0,
    roughnessDelta = 0,
    variantIndex = 0,
    pixelsPerBlock = 64,
    artStyle = 'pixel_art_hd',
    atlasTopCell = [0, 0],
    atlasSideCell = [0, 0],
    effectiveDims = { w: 1, h: 1, d: 1 },
  } = params;

  const isGrass = blockId === 'grass_brick';
  const hasBelow = Boolean(connectedMask & 8);
  const [tu, tv] = atlasTopCell;
  const [su, sv] = atlasSideCell;
  const rw = Math.round(effectiveDims.w * 4) / 4;
  const rh = Math.round(effectiveDims.h * 4) / 4;
  const rd = Math.round(effectiveDims.d * 4) / 4;

  const key = `six6_${blockId}_${color}_${texturePattern}_${materialFinish}_${connectedMode}_b${hasBelow ? 1 : 0}_v${variantIndex}_px${pixelsPerBlock}_${artStyle}_t${tu}_${tv}_s${su}_${sv}_d${rw}_${rh}_${rd}_rd${roughnessDelta}_${isSoftwareGl ? 'sw' : 'hw'}_${ghostOpacity ?? 'solid'}`;
  const cached = sixFaceMaterialCache.get(key);
  if (cached) return cached;

  const topMat = getBlockMaterial({
    color,
    texturePattern,
    materialFinish,
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    roughnessDelta,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId,
    faceRole: isGrass ? 'grass_top' : undefined,
    atlasCell: [tu, (((4 - tv) % 4) as 0 | 1 | 2 | 3)],
    uvScaleRepeat: [rw, rd],
  });

  const sideMatX = getBlockMaterial({
    color,
    texturePattern,
    materialFinish,
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    roughnessDelta,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId,
    faceRole: isGrass ? (hasBelow ? 'grass_top' : 'grass_side') : undefined,
    atlasCell: [su, sv],
    uvScaleRepeat: [rd, rh],
  });

  const sideMatZ = getBlockMaterial({
    color,
    texturePattern,
    materialFinish,
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    roughnessDelta,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId,
    faceRole: isGrass ? (hasBelow ? 'grass_top' : 'grass_side') : undefined,
    atlasCell: [su, sv],
    uvScaleRepeat: [rw, rh],
  });

  const bottomMat = getBlockMaterial({
    color: isGrass ? '#8B5A2B' : color,
    texturePattern,
    materialFinish,
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    roughnessDelta,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId: isGrass ? 'dirt_brick' : blockId,
    faceRole: isGrass ? 'dirt_soil' : undefined,
    atlasCell: [tu, tv],
    uvScaleRepeat: [rw, rd],
  });

  const mats = [sideMatX, sideMatX, topMat, bottomMat, sideMatZ, sideMatZ];
  sixFaceMaterialCache.set(key, mats);
  return mats;
}
