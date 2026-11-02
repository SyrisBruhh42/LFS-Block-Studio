import { CustomBlockDefinition, PlacedBlock } from './types';
import { LEGACY_EXPORT_LIMITS, preflightLegacyExport, exportCommentName } from './exportPreflight';

export const MAX_SAFE_SCHEMATIC_VOLUME = LEGACY_EXPORT_LIMITS.volume;

export interface TargetBlockOption {
  id: string;
  label: string;
  category:
    | 'Stone & Masonry'
    | 'Wood & Timber'
    | 'Bricks & Terracotta'
    | 'Stairs & Slabs'
    | 'Metals & Tech'
    | 'Glass & Lighting'
    | 'Nature & Terrain';
  hex: string;
  shapeHint?: 'cube' | 'slab' | 'stairs' | 'pillar' | 'glass' | 'light';
}

export const MINECRAFT_BLOCK_CATALOG: TargetBlockOption[] = [
  // Stone & Masonry
  { id: 'minecraft:cobblestone', label: 'Cobblestone', category: 'Stone & Masonry', hex: '#7E8B9B', shapeHint: 'cube' },
  { id: 'minecraft:mossy_cobblestone', label: 'Mossy Cobblestone', category: 'Stone & Masonry', hex: '#5E7C62', shapeHint: 'cube' },
  { id: 'minecraft:stone_bricks', label: 'Stone Bricks', category: 'Stone & Masonry', hex: '#7A7F85', shapeHint: 'cube' },
  { id: 'minecraft:mossy_stone_bricks', label: 'Mossy Stone Bricks', category: 'Stone & Masonry', hex: '#687967', shapeHint: 'cube' },
  { id: 'minecraft:deepslate_bricks', label: 'Deepslate Bricks', category: 'Stone & Masonry', hex: '#474A4F', shapeHint: 'cube' },
  { id: 'minecraft:polished_andesite', label: 'Polished Andesite', category: 'Stone & Masonry', hex: '#848786', shapeHint: 'cube' },
  { id: 'minecraft:polished_granite', label: 'Polished Granite', category: 'Stone & Masonry', hex: '#9A6B59', shapeHint: 'cube' },
  { id: 'minecraft:polished_diorite', label: 'Polished Diorite', category: 'Stone & Masonry', hex: '#C3C4C8', shapeHint: 'cube' },
  { id: 'minecraft:cut_sandstone', label: 'Cut Sandstone', category: 'Stone & Masonry', hex: '#D9A760', shapeHint: 'cube' },
  { id: 'minecraft:quartz_block', label: 'Block of Quartz', category: 'Stone & Masonry', hex: '#EBE6DE', shapeHint: 'cube' },
  { id: 'minecraft:quartz_pillar', label: 'Quartz Pillar', category: 'Stone & Masonry', hex: '#E6E2DA', shapeHint: 'pillar' },
  { id: 'minecraft:stone_brick_wall', label: 'Stone Brick Wall / Arch', category: 'Stone & Masonry', hex: '#64748B', shapeHint: 'pillar' },

  // Wood & Timber
  { id: 'minecraft:oak_planks', label: 'Oak Planks', category: 'Wood & Timber', hex: '#B87A3D', shapeHint: 'cube' },
  { id: 'minecraft:spruce_planks', label: 'Spruce Planks', category: 'Wood & Timber', hex: '#735531', shapeHint: 'cube' },
  { id: 'minecraft:birch_planks', label: 'Birch Planks', category: 'Wood & Timber', hex: '#C4B37B', shapeHint: 'cube' },
  { id: 'minecraft:dark_oak_planks', label: 'Dark Oak Planks', category: 'Wood & Timber', hex: '#432B14', shapeHint: 'cube' },
  { id: 'minecraft:crimson_planks', label: 'Crimson Planks', category: 'Wood & Timber', hex: '#683147', shapeHint: 'cube' },
  { id: 'minecraft:warped_planks', label: 'Warped Planks', category: 'Wood & Timber', hex: '#2B6963', shapeHint: 'cube' },
  { id: 'minecraft:stripped_oak_log', label: 'Stripped Oak Log Pillar', category: 'Wood & Timber', hex: '#B19056', shapeHint: 'pillar' },

  // Bricks & Terracotta
  { id: 'minecraft:bricks', label: 'Clay Bricks', category: 'Bricks & Terracotta', hex: '#B94A3E', shapeHint: 'cube' },
  { id: 'minecraft:mud_bricks', label: 'Mud Bricks', category: 'Bricks & Terracotta', hex: '#8A674F', shapeHint: 'cube' },
  { id: 'minecraft:prismarine_bricks', label: 'Prismarine Bricks', category: 'Bricks & Terracotta', hex: '#5B9E8F', shapeHint: 'cube' },
  { id: 'minecraft:nether_bricks', label: 'Nether Bricks', category: 'Bricks & Terracotta', hex: '#2D171C', shapeHint: 'cube' },
  { id: 'minecraft:red_terracotta', label: 'Red Terracotta', category: 'Bricks & Terracotta', hex: '#8F3D2E', shapeHint: 'cube' },
  { id: 'minecraft:yellow_terracotta', label: 'Yellow Terracotta', category: 'Bricks & Terracotta', hex: '#BA8523', shapeHint: 'cube' },
  { id: 'minecraft:cyan_terracotta', label: 'Cyan Terracotta', category: 'Bricks & Terracotta', hex: '#565B5B', shapeHint: 'cube' },

  // Stairs & Slabs
  { id: 'minecraft:stone_brick_stairs', label: 'Stone Brick Stairs', category: 'Stairs & Slabs', hex: '#7A7F85', shapeHint: 'stairs' },
  { id: 'minecraft:deepslate_tile_stairs', label: 'Deepslate Tile Stairs', category: 'Stairs & Slabs', hex: '#3B5978', shapeHint: 'stairs' },
  { id: 'minecraft:oak_stairs', label: 'Oak Wood Stairs', category: 'Stairs & Slabs', hex: '#B87A3D', shapeHint: 'stairs' },
  { id: 'minecraft:brick_stairs', label: 'Clay Brick Stairs', category: 'Stairs & Slabs', hex: '#B94A3E', shapeHint: 'stairs' },
  { id: 'minecraft:sandstone_stairs', label: 'Sandstone Stairs', category: 'Stairs & Slabs', hex: '#D9A760', shapeHint: 'stairs' },
  { id: 'minecraft:prismarine_brick_stairs', label: 'Prismarine Brick Stairs', category: 'Stairs & Slabs', hex: '#3B82F6', shapeHint: 'stairs' },
  { id: 'minecraft:stone_brick_slab', label: 'Stone Brick Slab', category: 'Stairs & Slabs', hex: '#7A7F85', shapeHint: 'slab' },
  { id: 'minecraft:oak_slab', label: 'Oak Wood Slab', category: 'Stairs & Slabs', hex: '#B87A3D', shapeHint: 'slab' },
  { id: 'minecraft:smooth_stone_slab', label: 'Smooth Stone Slab', category: 'Stairs & Slabs', hex: '#9E9E9E', shapeHint: 'slab' },

  // Metals & Tech
  { id: 'minecraft:iron_block', label: 'Block of Iron', category: 'Metals & Tech', hex: '#CBD5E1', shapeHint: 'cube' },
  { id: 'minecraft:gold_block', label: 'Block of Gold', category: 'Metals & Tech', hex: '#F59E0B', shapeHint: 'cube' },
  { id: 'minecraft:copper_block', label: 'Block of Copper', category: 'Metals & Tech', hex: '#C06C4E', shapeHint: 'cube' },
  { id: 'minecraft:oxidized_copper', label: 'Oxidized Copper', category: 'Metals & Tech', hex: '#52A285', shapeHint: 'cube' },
  { id: 'minecraft:netherite_block', label: 'Block of Netherite', category: 'Metals & Tech', hex: '#433F41', shapeHint: 'cube' },
  { id: 'minecraft:emerald_block', label: 'Block of Emerald', category: 'Metals & Tech', hex: '#10B981', shapeHint: 'cube' },
  { id: 'minecraft:diamond_block', label: 'Block of Diamond', category: 'Metals & Tech', hex: '#38BDF8', shapeHint: 'cube' },

  // Glass & Lighting
  { id: 'minecraft:glass', label: 'Clear Glass', category: 'Glass & Lighting', hex: '#7DD3FC', shapeHint: 'glass' },
  { id: 'minecraft:tinted_glass', label: 'Tinted Dark Glass', category: 'Glass & Lighting', hex: '#334155', shapeHint: 'glass' },
  { id: 'minecraft:cyan_stained_glass', label: 'Cyan Stained Glass', category: 'Glass & Lighting', hex: '#06B6D4', shapeHint: 'glass' },
  { id: 'minecraft:sea_lantern', label: 'Sea Lantern (Emissive)', category: 'Glass & Lighting', hex: '#22D3EE', shapeHint: 'light' },
  { id: 'minecraft:glowstone', label: 'Glowstone Block (Emissive)', category: 'Glass & Lighting', hex: '#F59E0B', shapeHint: 'light' },
  { id: 'minecraft:lantern', label: 'Forged Iron Lantern', category: 'Glass & Lighting', hex: '#F59E0B', shapeHint: 'light' },
  { id: 'minecraft:shroomlight', label: 'Shroomlight (Warm Glow)', category: 'Glass & Lighting', hex: '#F97316', shapeHint: 'light' },

  // Nature & Terrain
  { id: 'minecraft:grass_block', label: 'Grass Block', category: 'Nature & Terrain', hex: '#3F8E4D', shapeHint: 'cube' },
  { id: 'minecraft:moss_block', label: 'Lush Moss Block', category: 'Nature & Terrain', hex: '#4D7C2B', shapeHint: 'cube' },
  { id: 'minecraft:dirt', label: 'Coarse Dirt', category: 'Nature & Terrain', hex: '#6E4720', shapeHint: 'cube' },
  { id: 'minecraft:oak_leaves', label: 'Oak Leaves Canopy', category: 'Nature & Terrain', hex: '#10B981', shapeHint: 'cube' },
];

export interface SchematicBlockMapping {
  sourceBlockId: string;
  sourceBlockName: string;
  sourceHex: string;
  sourceShape: string;
  sourceTexture: string;
  sourceFinish: string;
  countInBuild: number;
  recommendedTargetId: string;
  selectedTargetId: string;
  confidence: number;
  reasoning: string;
  alternatives: string[];
  evaluatedByAi: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function colorDistance(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

export function computeInitialBlockMappings(
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): SchematicBlockMapping[] {
  const counts: Record<string, number> = {};
  for (const b of Object.values(blocks)) {
    counts[b.blockDefId] = (counts[b.blockDefId] || 0) + 1;
  }

  const usedBlockIds = Object.keys(counts);
  // If world is empty, include starter palette so user can still inspect mappings
  const idsToEvaluate =
    usedBlockIds.length > 0 ? usedBlockIds : Object.keys(customBlocks).slice(0, 8);

  return idsToEvaluate.map((blockId) => {
    const def = customBlocks[blockId] || {
      id: blockId,
      name: blockId,
      shape: 'brick',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#94A3B8',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
    };

    // Direct semantic rules for built-in archetypes + perceptual RGB/Shape scoring for custom blocks
    const scored = MINECRAFT_BLOCK_CATALOG.map((opt) => {
      let score = 100 - colorDistance(def.color, opt.hex) * 0.45;

      if (def.materialFinish === 'glass' && opt.shapeHint === 'glass') score += 35;
      if (def.materialFinish === 'neon' && opt.shapeHint === 'light') score += 38;
      if (def.materialFinish === 'metallic' && opt.category === 'Metals & Tech') score += 25;
      if (def.shape === 'slope' && opt.shapeHint === 'stairs') score += 32;
      if (def.shape === 'plate' && opt.shapeHint === 'slab') score += 28;
      if (def.shape === 'cylinder' && opt.shapeHint === 'pillar') score += 26;
      if (def.shape === 'arch' && opt.id === 'minecraft:stone_brick_wall') score += 34;
      if (def.texturePattern === 'oak_planks' && opt.category === 'Wood & Timber') score += 24;
      if (def.texturePattern === 'cobblestone' && opt.id.includes('cobble')) score += 22;
      if (def.texturePattern === 'brick_masonry' && opt.id.includes('brick')) score += 20;
      if (def.id === 'grass_brick' && opt.id === 'minecraft:grass_block') score += 45;
      if (def.id === 'dirt_brick' && opt.id === 'minecraft:dirt') score += 45;
      if (def.id === 'voxel_lantern' && opt.id === 'minecraft:lantern') score += 50;
      if (def.id === 'voxel_bonsai' && opt.id === 'minecraft:oak_leaves') score += 45;

      return { opt, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0].opt;
    const confidence = Math.max(72, Math.min(99, Math.round(scored[0].score)));
    const alternatives = scored.slice(1, 5).map((s) => s.opt.id);

    return {
      sourceBlockId: def.id,
      sourceBlockName: def.name,
      sourceHex: def.color,
      sourceShape: def.shape,
      sourceTexture: def.texturePattern,
      sourceFinish: def.materialFinish,
      countInBuild: counts[def.id] || 0,
      recommendedTargetId: best.id,
      selectedTargetId: best.id,
      confidence,
      reasoning: `Matched ${def.name} (${def.shape}, ${def.texturePattern}, ${def.materialFinish}) to ${best.label} (${best.id}) by surface material, geometry profile, and RGB tone.`,
      alternatives,
      evaluatedByAi: false,
    };
  });
}

/** Suggestions are not compatibility evidence. Reject the entire response on an unknown row/state. */
export function validateMappingSuggestions(currentMappings: SchematicBlockMapping[], value: unknown): SchematicBlockMapping[] {
  const allowedTargets = new Set(MINECRAFT_BLOCK_CATALOG.map(item => item.id));
  const known = new Set(currentMappings.map(item => item.sourceBlockId));
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as any).mappings)) throw new Error('The mapping response is not a mapping list.');
  const suggestions = (value as { mappings: unknown[] }).mappings;
  if (suggestions.length > currentMappings.length || suggestions.length > 4096) throw new Error('The mapping response exceeds the requested block set.');
  const byId = new Map<string, { recommendedTargetId: string; confidence: number; reasoning: string; alternatives: string[] }>();
  for (const item of suggestions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('An AI mapping is invalid.');
    const row = item as Record<string, any>;
    if (!known.has(row.sourceBlockId) || byId.has(row.sourceBlockId) || !allowedTargets.has(row.recommendedTargetId) ||
      !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 100 ||
      typeof row.reasoning !== 'string' || row.reasoning.length > 2000 ||
      !Array.isArray(row.alternatives) || row.alternatives.length > 4 || row.alternatives.some((id: unknown) => typeof id !== 'string' || !allowedTargets.has(id))) {
      throw new Error('An AI suggestion has an unknown block, invalid score, duplicate row or unsupported alternative. Existing mappings were retained.');
    }
    byId.set(row.sourceBlockId, { recommendedTargetId: row.recommendedTargetId, confidence: row.confidence, reasoning: row.reasoning, alternatives: [...row.alternatives] });
  }
  return currentMappings.map(mapping => {
    const result = byId.get(mapping.sourceBlockId);
    return result ? { ...mapping, ...result, selectedTargetId: result.recommendedTargetId, evaluatedByAi: true } : { ...mapping, alternatives: [...mapping.alternatives] };
  });
}

export async function evaluateBlockMappingsWithAI(
  currentMappings: SchematicBlockMapping[],
  targetPlatform = 'minecraft_1_20',
  signal?: AbortSignal
): Promise<SchematicBlockMapping[]> {
  if (!currentMappings.length || currentMappings.length > 4096) throw new Error('Choose between 1 and 4096 block types for suggestions.');
  const snapshot = structuredClone(currentMappings);
  const body = JSON.stringify({ blocks: snapshot.map(m => ({ id: m.sourceBlockId, name: m.sourceBlockName, color: m.sourceHex, shape: m.sourceShape, texturePattern: m.sourceTexture, materialFinish: m.sourceFinish })), targetPlatform });
  const maxBytes = 2 * 1024 * 1024;
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error('The mapping request exceeds the size budget.');
  const res = await fetch('/api/ai/block-mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  if (!res.ok) throw new Error(`AI mapping request failed (${res.status}). Existing mappings were retained.`);
  if (!res.body) throw new Error('The mapping response is empty.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let raw = '', bytes = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('The mapping response exceeds the size budget.');
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  signal?.throwIfAborted();
  return validateMappingSuggestions(snapshot, JSON.parse(raw));
}

function checkedMapping(mapping: Record<string, string>, sourceId: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(mapping, sourceId);
  const target = descriptor && 'value' in descriptor ? descriptor.value : undefined;
  if (typeof target !== 'string' || !MINECRAFT_BLOCK_CATALOG.some(option => option.id === target)) throw new Error(`Choose a known target for ${sourceId}. No fallback block was substituted.`);
  return target;
}

/** Diagnostic JSON only: this is not gzip/NBT and cannot be advertised as a WorldEdit .schem. */
export function exportSpongeSchematicJson(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  mappingByBlockId: Record<string, string>
): string {
  const { placedList, min, width, height, length } = preflightLegacyExport(blocks, { integerGrid: true, dense: true });
  worldName = exportCommentName(worldName);
  const { x: minX, y: minY, z: minZ } = min;
  if (placedList.length === 0) {
    return JSON.stringify({ Format: 'Diagnostic JSON only; not a native schematic', Version: 2, Width: 1, Height: 1, Length: 1, Palette: { 'minecraft:air': 0 }, BlockData: [0] }, null, 2);
  }
  // Validate every mapping before allocating the dense buffer.
  for (const block of placedList) checkedMapping(mappingByBlockId, block.blockDefId);

  const palette: Record<string, number> = {
    'minecraft:air': 0,
  };
  let nextPaletteIdx = 1;

  const blockData = new Array<number>(width * height * length).fill(0);

  for (const blk of placedList) {
    const targetId = checkedMapping(mappingByBlockId, blk.blockDefId);
    if (palette[targetId] === undefined) {
      palette[targetId] = nextPaletteIdx++;
    }
    const rx = blk.position.x - minX;
    const ry = blk.position.y - minY;
    const rz = blk.position.z - minZ;
    // Sponge Schematic index order: (y * length + z) * width + x
    const index = (ry * length + rz) * width + rx;
    blockData[index] = palette[targetId];
  }

  return JSON.stringify(
    {
      Format: 'Diagnostic JSON only; not a native schematic',
      Disclaimer:
        'Not an official Minecraft, LEGO, or Godot product. Not approved by or associated with Mojang, Microsoft, or The LEGO Group.',
      Limitations: 'Approximate material mapping; shape, scale, overrides and full block state are not preserved. Use a project backup for lossless recovery.',
      Metadata: {
        Name: worldName,
        Author: 'LFS Block Studio',
        Disclaimer:
          'Not an official Minecraft, LEGO, or Godot product. Not approved by or associated with Mojang, Microsoft, or The LEGO Group.',
        CreatedAt: new Date().toISOString(),
        TotalBlocks: placedList.length,
      },
      Version: 2,
      DataVersion: 3465, // Minecraft 1.20.1
      Width: width,
      Height: height,
      Length: length,
      Offset: [0, 0, 0],
      PaletteMax: nextPaletteIdx,
      Palette: palette,
      BlockData: blockData,
    },
    null,
    2
  );
}

/**
 * Generates an approximate command draft. Native behaviour and complete block states are unqualified.
 */
export function exportMinecraftFunction(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  mappingByBlockId: Record<string, string>
): string {
  const { placedList, min } = preflightLegacyExport(blocks, { integerGrid: true });
  worldName = exportCommentName(worldName);
  const { x: minX, y: minY, z: minZ } = min;
  if (!placedList.length) return '# Empty build draft';
  for (const block of placedList) checkedMapping(mappingByBlockId, block.blockDefId);

  const lines: string[] = [
    `# ====================================================================`,
    `# BrickForge Studio — Minecraft Schematic Function (.mcfunction)`,
    `# Structure: ${worldName} (${placedList.length} blocks)`,
    `# Approximate draft: geometry, scale, overrides and complete states are not preserved; native import is unqualified.`,
    `# Usage: Place in datapack functions/ folder and run /function`,
    `# ====================================================================`,
    ``,
  ];

  for (const blk of placedList) {
    const targetId = checkedMapping(mappingByBlockId, blk.blockDefId);
    const rx = blk.position.x - minX;
    const ry = blk.position.y - minY;
    const rz = blk.position.z - minZ;

    // Add facing property if block is a stair
    let blockStateStr = targetId;
    if (targetId.endsWith('_stairs')) {
      const facing =
        blk.rotation === 90
          ? 'east'
          : blk.rotation === 180
            ? 'south'
            : blk.rotation === 270
              ? 'west'
              : 'north';
      blockStateStr = `${targetId}[facing=${facing},half=bottom]`;
    }

    lines.push(`setblock ~${rx} ~${ry} ~${rz} ${blockStateStr} replace`);
  }

  return lines.join('\n');
}

/**
 * Generates a two-part LDraw approximation. Native geometry/material fidelity is unqualified.
 */
export function exportBrickLDraw(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>,
  mappingByBlockId: Record<string, string> = {}
): string {
  const { placedList } = preflightLegacyExport(blocks, { definitions: customBlocks });
  worldName = exportCommentName(worldName);
  const lines: string[] = [
    `0 BrickForge Studio Universal Brick Schematic`,
    `0 ${worldName}`,
    `0 Name: ${worldName.replace(/\s+/g, '_')}.ldr`,
    `0 Author: BrickForge Studio`,
    `0 !LDRAW_ORG Unofficial_Model`,
    ``,
  ];

  for (const blk of placedList) {
    const def = customBlocks[blk.blockDefId];
    const mappedId = mappingByBlockId[blk.blockDefId] || 'minecraft:stone_bricks';
    // Convert grid coords to LDraw LDU units (1 block = 20 LDU width, 24 LDU height)
    const lx = blk.position.x * 20;
    const ly = -blk.position.y * 24;
    const lz = blk.position.z * 20;
    // Part 3005.dat = 1x1 Brick, 3040.dat = Slope
    const partDat = def?.shape === 'slope' ? '3040.dat' : '3005.dat';
    lines.push(
      `0 // Block ${blk.id} -> ${mappedId}`,
      `1 16 ${lx} ${ly} ${lz} 1 0 0 0 1 0 0 0 1 ${partDat}`
    );
  }

  lines.push(`0 STEP`, ``);
  return lines.join('\n');
}
