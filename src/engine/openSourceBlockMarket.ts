import {
  CommandMacroLoop,
  CustomBlockDefinition,
  MarketBlockCategory,
  ModularHudConfig,
  OpenSourceCreatorPackId,
  OpenSourceMarketBlock,
  PlacedBlock,
  WorldEditEngineState,
  WorldResetTemplateId,
} from './types';
import {
  expandWorldIntoChunk,
  getChunkCoordForBlock,
} from './chunkAndPatternEngine';
import {
  coordKey,
  createInitialEngineState,
  pushUndoSnapshot,
} from './worldEditEngine';

export interface CreatorPackMeta {
  id: OpenSourceCreatorPackId;
  name: string;
  author: string;
  license: 'CC0 1.0 Public Domain' | 'CC-BY 4.0 Open Source';
  badgeColor: string;
  description: string;
  sourceUrlLabel: string;
}

export const OPEN_SOURCE_CREATOR_PACKS: CreatorPackMeta[] = [
  {
    id: 'polyhaven_cc0',
    name: 'Built-in Procedural Studio Pack: Masonry & Ashlar',
    author: 'LFS Procedural Surface Lab (CC0 Inspired)',
    license: 'CC0 1.0 Public Domain',
    badgeColor: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    description:
      'Built-in procedural studio masonry, basalt ashlar, weathered castle limestone, and Roman travertine.',
    sourceUrlLabel: 'Built-in Procedural Studio Pack (CC0)',
  },
  {
    id: 'kenney_voxel_cc0',
    name: 'Built-in Procedural Studio Pack: Nordic Timber & Terrain',
    author: 'LFS Procedural Surface Lab (CC0 Inspired)',
    license: 'CC0 1.0 Public Domain',
    badgeColor: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
    description:
      'Built-in procedural studio timber, desert adobe, glacial ice, and modular terrain.',
    sourceUrlLabel: 'Built-in Procedural Studio Pack (CC0)',
  },
  {
    id: 'ambientcg_pbr',
    name: 'Built-in Procedural Studio Pack: Architectural Metals & Marble',
    author: 'LFS Procedural Surface Lab (CC0 Inspired)',
    license: 'CC0 1.0 Public Domain',
    badgeColor: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
    description:
      'Built-in procedural brushed metals, oxidized copper, Nero marble, and industrial riveted steel.',
    sourceUrlLabel: 'Built-in Procedural Studio Pack (CC0)',
  },
  {
    id: 'opengameart_pixel',
    name: 'Built-in Procedural Studio Pack: Emissive Runes & Prismarine',
    author: 'LFS Procedural Surface Lab (CC0 Inspired)',
    license: 'CC0 1.0 Public Domain',
    badgeColor: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
    description:
      'Built-in procedural runestones, prismarine, magma conduits, and emissive synth crystals.',
    sourceUrlLabel: 'Built-in Procedural Studio Pack (CC0)',
  },
  {
    id: 'lfs_architectural',
    name: 'Built-in Procedural Studio Pack: Master Trim & Vaults',
    author: 'LFS Block Studio Core',
    license: 'CC0 1.0 Public Domain',
    badgeColor: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
    description:
      'Built-in procedural vaulted arches, mansard roof slopes, Tudor half-timber framing, and warm shoji lanterns.',
    sourceUrlLabel: 'Built-in Procedural Studio Pack (CC0)',
  },
];

export const OPEN_SOURCE_MARKET_CATALOG: OpenSourceMarketBlock[] = [
  // 1. Built-in Procedural Masonry & Ashlar
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['stone', 'basalt', 'dark', 'castle', 'ashlar'],
    downloadsCount: 18420,
    rating: 4.9,
    description: 'Dense volcanic basalt ashlar blocks with fine chiselled mortar seams.',
    blockDef: {
      id: 'ph_basalt_ashlar',
      name: 'Basalt Ashlar Stone',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#3B424C',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['limestone', 'warm', 'citadel', 'wall'],
    downloadsCount: 15310,
    rating: 4.9,
    description: 'Sun-bleached Mediterranean castle limestone with organic warm variation.',
    blockDef: {
      id: 'ph_castle_limestone',
      name: 'Castle Limestone',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#D6C7AE',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['column', 'roman', 'travertine', 'pillar'],
    downloadsCount: 12890,
    rating: 4.8,
    description: 'Fluted classical travertine marble column for porticos and colonnades.',
    blockDef: {
      id: 'ph_travertine_column',
      name: 'Travertine Column',
      shape: 'cylinder',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#E6DEC8',
      texturePattern: 'smooth_abs',
      materialFinish: 'satin',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'roofing_trim',
    tags: ['terracotta', 'roof', 'slope', 'shingle'],
    downloadsCount: 16200,
    rating: 4.9,
    description: 'Kiln-fired Tuscan terracotta clay roof tiles on a 45° architectural pitch.',
    blockDef: {
      id: 'ph_terracotta_slope',
      name: 'Terracotta Roof Slope',
      shape: 'slope',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#C85A32',
      texturePattern: 'brick_mortar',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['brick', 'industrial', 'kiln', 'wall'],
    downloadsCount: 14120,
    rating: 4.8,
    description: 'Reclaimed heritage red clay brickwork with recessed lime mortar.',
    blockDef: {
      id: 'ph_heritage_brick',
      name: 'Heritage Kiln Brick',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#9E3B2B',
      texturePattern: 'brick_mortar',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'polyhaven_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'nature_terrain',
    tags: ['moss', 'cobble', 'ruins', 'dungeon'],
    downloadsCount: 19400,
    rating: 5.0,
    description: 'Ancient fieldstone overgrown with damp highland moss in the crevices.',
    blockDef: {
      id: 'ph_mossy_fieldstone',
      name: 'Mossy Fieldstone',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#5B6E52',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },

  // 2. Built-in Procedural Nordic Timber & Terrain
  {
    creatorPackId: 'kenney_voxel_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'timber',
    tags: ['birch', 'wood', 'plank', 'floor', 'nordic'],
    downloadsCount: 21500,
    rating: 4.9,
    description: 'Light Scandinavian birch floorboards with tongue-and-groove joinery.',
    blockDef: {
      id: 'kn_birch_plank',
      name: 'Nordic Birch Plank',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#D8BA8E',
      texturePattern: 'wood_grain',
      materialFinish: 'satin',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'kenney_voxel_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'timber',
    tags: ['spruce', 'dark', 'timber', 'beam'],
    downloadsCount: 17850,
    rating: 4.9,
    description: 'Heavy Alpine dark spruce structural timber for beams and log cabins.',
    blockDef: {
      id: 'kn_alpine_spruce',
      name: 'Alpine Spruce Timber',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#5C3E26',
      texturePattern: 'wood_grain',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'kenney_voxel_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['adobe', 'sandstone', 'desert', 'mesa'],
    downloadsCount: 13400,
    rating: 4.8,
    description: 'Sun-baked desert adobe plaster with warm ochre mineral pigment.',
    blockDef: {
      id: 'kn_desert_adobe',
      name: 'Sun-Baked Adobe',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#D98A54',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'kenney_voxel_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'glass_neon',
    tags: ['ice', 'glacier', 'translucent', 'frost'],
    downloadsCount: 14900,
    rating: 4.9,
    description: 'Translucent packed glacial ice with internal frost refraction.',
    blockDef: {
      id: 'kn_glacial_ice',
      name: 'Packed Glacial Ice',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#7DD3FC',
      texturePattern: 'glass_grid',
      materialFinish: 'translucent',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'kenney_voxel_cc0',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'nature_terrain',
    tags: ['foliage', 'autumn', 'leaves', 'hedge'],
    downloadsCount: 16100,
    rating: 4.8,
    description: 'Crisp amber-gold autumn maple canopy block for trees and garden hedges.',
    blockDef: {
      id: 'kn_autumn_canopy',
      name: 'Autumn Maple Canopy',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#D97706',
      texturePattern: 'grass_top',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },

  // 3. Built-in Procedural Metals & Marble
  {
    creatorPackId: 'ambientcg_pbr',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'metals',
    tags: ['copper', 'patina', 'verdigris', 'dome'],
    downloadsCount: 20100,
    rating: 5.0,
    description: 'Weathered architectural copper sheet with turquoise verdigris patina.',
    blockDef: {
      id: 'acg_oxidized_copper',
      name: 'Verdigris Copper Plate',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#3B9B86',
      texturePattern: 'metallic_brushed',
      materialFinish: 'metallic',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'ambientcg_pbr',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'metals',
    tags: ['bronze', 'gold', 'trim', 'gilded'],
    downloadsCount: 18750,
    rating: 4.9,
    description: 'Brushed architectural bronze alloy with warm specular highlights.',
    blockDef: {
      id: 'acg_gilded_bronze',
      name: 'Brushed Gilded Bronze',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#C59B27',
      texturePattern: 'metallic_brushed',
      materialFinish: 'metallic',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'ambientcg_pbr',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['marble', 'black', 'luxury', 'polished'],
    downloadsCount: 16800,
    rating: 4.9,
    description: 'Polished Nero Marquina black marble slab with subtle white calcite veining.',
    blockDef: {
      id: 'acg_nero_marble',
      name: 'Nero Marquina Marble',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#1E242B',
      texturePattern: 'cobblestone',
      materialFinish: 'pearl',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'ambientcg_pbr',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'metals',
    tags: ['steel', 'industrial', 'dark', 'factory'],
    downloadsCount: 15200,
    rating: 4.8,
    description: 'Heavy-gauge gunmetal structural steel plate with riveted seams.',
    blockDef: {
      id: 'acg_riveted_steel',
      name: 'Riveted Gunmetal Steel',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#475569',
      texturePattern: 'metallic_brushed',
      materialFinish: 'metallic',
      hasStuds: false,
      isCustom: true,
    },
  },

  // 4. Built-in Procedural Emissive Runes & Prismarine
  {
    creatorPackId: 'opengameart_pixel',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'glass_neon',
    tags: ['runestone', 'magic', 'emissive', 'cyan'],
    downloadsCount: 24300,
    rating: 5.0,
    description: 'Carved obelisk stone inlaid with glowing cyan arcane glyphs.',
    blockDef: {
      id: 'oga_arcane_runestone',
      name: 'Arcane Glyph Runestone',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#06B6D4',
      texturePattern: 'cobblestone',
      materialFinish: 'neon',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'opengameart_pixel',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'masonry',
    tags: ['prismarine', 'ocean', 'temple', 'teal'],
    downloadsCount: 19100,
    rating: 4.9,
    description: 'Deep-sea crystalline prismarine masonry with iridescent seafoam mortar.',
    blockDef: {
      id: 'oga_sea_prismarine',
      name: 'Abyssal Prismarine',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#0D9488',
      texturePattern: 'brick_mortar',
      materialFinish: 'pearl',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'opengameart_pixel',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'glass_neon',
    tags: ['magma', 'lava', 'ember', 'glow'],
    downloadsCount: 22150,
    rating: 4.9,
    description: 'Cracked obsidian crust radiating molten amber-orange geothermal light.',
    blockDef: {
      id: 'oga_magma_conduit',
      name: 'Molten Magma Core',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#F97316',
      texturePattern: 'cobblestone',
      materialFinish: 'neon',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'opengameart_pixel',
    creatorName: 'LFS Procedural Surface Lab',
    license: 'CC0 1.0 Public Domain',
    category: 'glass_neon',
    tags: ['cyberpunk', 'neon', 'magenta', 'synth'],
    downloadsCount: 17600,
    rating: 4.8,
    description: 'High-luminance magenta synthwave light panel for futuristic builds.',
    blockDef: {
      id: 'oga_cyber_magenta',
      name: 'Cyber Neon Magenta',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#EC4899',
      texturePattern: 'glass_grid',
      materialFinish: 'neon',
      hasStuds: false,
      isCustom: true,
    },
  },

  // 5. LFS Studio Master Trim Pack
  {
    creatorPackId: 'lfs_architectural',
    creatorName: 'LFS Block Studio Core',
    license: 'CC0 1.0 Public Domain',
    category: 'roofing_trim',
    tags: ['arch', 'gothic', 'vault', 'window'],
    downloadsCount: 26400,
    rating: 5.0,
    description: 'Carved stone Gothic pointed arch for cathedral windows and vaulted halls.',
    blockDef: {
      id: 'lfs_gothic_arch',
      name: 'Gothic Vault Arch',
      shape: 'arch',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#94A3B8',
      texturePattern: 'cobblestone',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'lfs_architectural',
    creatorName: 'LFS Block Studio Core',
    license: 'CC0 1.0 Public Domain',
    category: 'roofing_trim',
    tags: ['slate', 'mansard', 'roof', 'slope'],
    downloadsCount: 21900,
    rating: 4.9,
    description: 'Chateau dark slate mansard roof slope with overlapping shingle courses.',
    blockDef: {
      id: 'lfs_slate_mansard',
      name: 'Chateau Slate Slope',
      shape: 'slope',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#334155',
      texturePattern: 'brick_mortar',
      materialFinish: 'satin',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'lfs_architectural',
    creatorName: 'LFS Block Studio Core',
    license: 'CC0 1.0 Public Domain',
    category: 'timber',
    tags: ['tudor', 'plaster', 'cottage', 'wall'],
    downloadsCount: 19800,
    rating: 4.9,
    description: 'Cream lime-washed wattle-and-daub plaster framed with dark oak timber.',
    blockDef: {
      id: 'lfs_tudor_plaster',
      name: 'Tudor Cream Plaster',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#F5EFE6',
      texturePattern: 'wood_grain',
      materialFinish: 'matte',
      hasStuds: false,
      isCustom: true,
    },
  },
  {
    creatorPackId: 'lfs_architectural',
    creatorName: 'LFS Block Studio Core',
    license: 'CC0 1.0 Public Domain',
    category: 'glass_neon',
    tags: ['shoji', 'lantern', 'warm', 'japanese'],
    downloadsCount: 23100,
    rating: 5.0,
    description: 'Warm cedar-framed rice paper lantern emitting a soft golden interior glow.',
    blockDef: {
      id: 'lfs_shoji_lantern',
      name: 'Cedar Shoji Lantern',
      shape: 'cube',
      width: 1,
      depth: 1,
      heightPlates: 3,
      color: '#FDE68A',
      texturePattern: 'glass_grid',
      materialFinish: 'neon',
      hasStuds: false,
      isCustom: true,
    },
  },
];

export const DEFAULT_COMMAND_MACRO_LOOPS: CommandMacroLoop[] = [
  {
    id: 'macro_tower_story',
    name: 'Extrude Tower Story',
    description:
      'Builds perimeter walls in active block and stacks selection upward by 3 floors.',
    commands: ['//walls cobble_brick', '//stack 2 up'],
    iterations: 1,
    intervalMs: 0,
    iconColor: '#F59E0B',
  },
  {
    id: 'macro_hollow_room',
    name: 'Fill & Hollow Room Shell',
    description:
      'Fills the Pos1–Pos2 bounding box with the active material, then hollows out the interior.',
    commands: ['//set cobble_brick', '//hollow'],
    iterations: 1,
    intervalMs: 0,
    iconColor: '#06B6D4',
  },
  {
    id: 'macro_step_roof',
    name: 'Step-In Pyramid Layer',
    description:
      'Builds perimeter walls, raises selection +1 up, and contracts inward (repeat for stepped roofs).',
    commands: ['//walls oak_plank', '//shift 1 up'],
    iterations: 2,
    intervalMs: 250,
    iconColor: '#10B981',
  },
  {
    id: 'macro_glass_band',
    name: 'Clerestory Glass Band',
    description:
      'Replaces perimeter walls in selection with Crystal Glass for instant window bands.',
    commands: ['//walls crystal_glass'],
    iterations: 1,
    intervalMs: 0,
    iconColor: '#38BDF8',
  },
];

export const DEFAULT_MODULAR_HUD_CONFIG: ModularHudConfig = {
  masterHudEditMode: false,
  snapToGridPercent: 2,
  showKeybindLabels: true,
  showTooltips: true,
  macros: DEFAULT_COMMAND_MACRO_LOOPS,
  usageCounts: {
    cobble_brick: 18,
    oak_plank: 14,
    grass_brick: 11,
    crystal_glass: 9,
    voxel_lantern: 8,
    roof_slope_blue: 6,
  },
  bars: [
    {
      id: 'bar_primary_blocks',
      name: 'Bar 1: Primary Block Hotbar (1–9)',
      enabled: true,
      locked: true,
      layout: 'row',
      scale: 1.0,
      opacity: 0.96,
      position: { xPercent: 50, yPercent: 91 },
      slots: [
        { id: 's1', type: 'block', targetId: 'cobble_brick', hotkeyHint: '1' },
        { id: 's2', type: 'block', targetId: 'oak_plank', hotkeyHint: '2' },
        { id: 's3', type: 'block', targetId: 'grass_brick', hotkeyHint: '3' },
        { id: 's4', type: 'block', targetId: 'roof_slope_blue', hotkeyHint: '4' },
        { id: 's5', type: 'block', targetId: 'crystal_glass', hotkeyHint: '5' },
        { id: 's6', type: 'block', targetId: 'voxel_lantern', hotkeyHint: '6' },
        { id: 's7', type: 'block', targetId: 'titanium_panel', hotkeyHint: '7' },
        { id: 's8', type: 'block', targetId: 'lego_red_2x2', hotkeyHint: '8' },
        { id: 's9', type: 'block', targetId: 'lego_amber_2x4', hotkeyHint: '9' },
      ],
    },
    {
      id: 'bar_tools_macros',
      name: 'Bar 2: Quick Tools & Command Loops',
      enabled: true,
      locked: true,
      layout: 'row',
      scale: 0.95,
      opacity: 0.94,
      position: { xPercent: 50, yPercent: 83 },
      slots: [
        { id: 't1', type: 'tool', targetId: 'place', label: 'Place', hotkeyHint: 'B' },
        { id: 't2', type: 'tool', targetId: 'erase', label: 'Erase', hotkeyHint: 'X' },
        { id: 't3', type: 'tool', targetId: 'brush_place', label: '3D Brush+', hotkeyHint: 'Y' },
        { id: 't4', type: 'tool', targetId: 'brush_erase', label: '3D Brush-', hotkeyHint: 'O' },
        { id: 't5', type: 'tool', targetId: 'wand_select', label: 'Wand', hotkeyHint: 'E' },
        { id: 't6', type: 'macro_loop', targetId: 'macro_tower_story', label: 'Tower Loop' },
        { id: 't7', type: 'macro_loop', targetId: 'macro_hollow_room', label: 'Room Shell' },
        { id: 't8', type: 'command', targetId: '//undo', label: 'Undo', hotkeyHint: '⌃Z' },
      ],
    },
    {
      id: 'bar_most_used',
      name: 'Bar 3: Auto Most-Used Favorites',
      enabled: false,
      locked: true,
      isMostUsedAutoBar: true,
      layout: 'column',
      scale: 0.95,
      opacity: 0.92,
      position: { xPercent: 94, yPercent: 50 },
      slots: [],
    },
  ],
};

/**
 * Resets the entire world to a clean architectural starter template while preserving a single atomic Undo snapshot.
 */
export function resetEntireWorldToTemplate(
  state: WorldEditEngineState,
  templateId: WorldResetTemplateId,
  chunkSize = 16
): { nextState: WorldEditEngineState; summary: string } {
  const withUndo = pushUndoSnapshot(state, `Reset World (${templateId})`);

  if (templateId === 'starter_skyblock') {
    const fresh = createInitialEngineState();
    return {
      nextState: {
        ...withUndo,
        blocks: fresh.blocks,
        pos1: null,
        pos2: null,
      },
      summary: `Reset entire world to Starter Studio Plot (${Object.keys(fresh.blocks).length} blocks).`,
    };
  }

  if (templateId === 'empty_void') {
    const anchor: Record<string, PlacedBlock> = {
      [coordKey(0, 0, 0)]: {
        id: 'blk_0_0_0',
        blockDefId: 'cobble_brick',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
      },
    };
    return {
      nextState: {
        ...withUndo,
        blocks: anchor,
        pos1: null,
        pos2: null,
      },
      summary: 'Reset world to Empty Void with center origin stone at (0, 0, 0).',
    };
  }

  const styleMap: Record<
    Exclude<WorldResetTemplateId, 'starter_skyblock' | 'empty_void'>,
    'stone_foundation' | 'timber_deck' | 'sandstone_plaza'
  > = {
    citadel_plaza: 'stone_foundation',
    timber_homestead: 'timber_deck',
    cyber_grid: 'sandstone_plaza',
  };

  const clearedState: WorldEditEngineState = {
    ...withUndo,
    blocks: {},
    pos1: null,
    pos2: null,
  };

  // Pass skipUndoSnapshot: true so expandWorldIntoChunk does NOT overwrite the pre-reset undo snapshot!
  const expanded = expandWorldIntoChunk(
    clearedState,
    0,
    0,
    styleMap[templateId],
    chunkSize,
    { skipUndoSnapshot: true }
  );

  // If cyber_grid, style the 12x12 platform with sleek titanium & neon corners
  if (templateId === 'cyber_grid') {
    const cyberBlocks: Record<string, PlacedBlock> = {};
    for (const [k, blk] of Object.entries(expanded.nextState.blocks)) {
      const isRaisedLantern = blk.position.y >= 1;
      const isBorder =
        blk.position.x === -5 ||
        blk.position.x === 6 ||
        blk.position.z === -5 ||
        blk.position.z === 6;
      cyberBlocks[k] = {
        ...blk,
        blockDefId: isRaisedLantern
          ? 'neon_beacon'
          : isBorder
            ? 'cobble_brick'
            : 'titanium_panel',
      };
    }
    return {
      nextState: {
        ...expanded.nextState,
        blocks: cyberBlocks,
      },
      summary: `Reset world to Cyber Grid Platform (${Object.keys(cyberBlocks).length} blocks).`,
    };
  }

  return {
    nextState: expanded.nextState,
    summary: `Reset world to ${templateId.replace('_', ' ')} template (${Object.keys(expanded.nextState.blocks).length} blocks).`,
  };
}

export const resetWorldWithPreset = resetEntireWorldToTemplate;

/**
 * Resets or clears ONLY a single specific chunk (cx, cz), leaving all other chunks untouched, with a single atomic Undo snapshot.
 */
export function resetSpecificChunkInWorld(
  state: WorldEditEngineState,
  cx: number,
  cz: number,
  action:
    | 'clear_air'
    | 'grass_island'
    | 'stone_foundation'
    | 'timber_deck'
    | 'sandstone_plaza',
  chunkSize = 16
): {
  nextState: WorldEditEngineState;
  removedCount: number;
  addedCount: number;
  summary: string;
} {
  const withUndo = pushUndoSnapshot(
    state,
    `Reset Chunk (${cx},${cz}) [${action}]`
  );
  const nextBlocks: Record<string, PlacedBlock> = {};
  let removedCount = 0;

  for (const [k, blk] of Object.entries(withUndo.blocks)) {
    const c = getChunkCoordForBlock(blk.position.x, blk.position.z, chunkSize);
    if (c.cx === cx && c.cz === cz) {
      removedCount++;
    } else {
      nextBlocks[k] = blk;
    }
  }

  const clearedChunkState: WorldEditEngineState = {
    ...withUndo,
    blocks: nextBlocks,
  };

  if (action === 'clear_air') {
    return {
      nextState: clearedChunkState,
      removedCount,
      addedCount: 0,
      summary: `Cleared Chunk (${cx}, ${cz}) to open air (-${removedCount} blocks).`,
    };
  }

  const rebuilt = expandWorldIntoChunk(
    clearedChunkState,
    cx,
    cz,
    action,
    chunkSize,
    { skipUndoSnapshot: true }
  );

  return {
    nextState: rebuilt.nextState,
    removedCount,
    addedCount: rebuilt.addedCount,
    summary: `Reset Chunk (${cx}, ${cz}) to "${action}" (-${removedCount} old, +${rebuilt.addedCount} new blocks).`,
  };
}

export const resetSingleChunk = resetSpecificChunkInWorld;

/**
 * Counts how many blocks currently reside in each chunk key "cx,cz".
 */
export function countBlocksPerChunk(
  blocks: Record<string, PlacedBlock>,
  chunkSize = 16
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const blk of Object.values(blocks)) {
    const { cx, cz } = getChunkCoordForBlock(
      blk.position.x,
      blk.position.z,
      chunkSize
    );
    const key = `${cx},${cz}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
