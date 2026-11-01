import {
  CustomBlockDefinition,
  DynamicLightingConfig,
  GridCoord,
  PlacedBlock,
  WorldEditEngineState,
} from './types';
import { coordKey, pushUndoSnapshot } from './worldEditEngine';
import { detectWorldSymmetry } from './spatialCopilotEngine';

export type AtmospherePresetId =
  | 'dawn_mist'
  | 'studio_noon'
  | 'golden_hour'
  | 'starlight_midnight'
  | 'overcast_blueprint';

export interface AtmospherePreset {
  id: AtmospherePresetId;
  name: string;
  tagline: string;
  badgeColor: string;
  daylightMode: boolean;
  lighting: DynamicLightingConfig;
}

export const ATMOSPHERE_PRESETS: AtmospherePreset[] = [
  {
    id: 'dawn_mist',
    name: 'Dawn Mist',
    tagline: 'Soft rose-gold horizon with cool morning fog',
    badgeColor: '#FDBA74',
    daylightMode: false,
    lighting: {
      timeOfDay: 6.5,
      sunAzimuth: 105,
      sunIntensity: 1.35,
      ambientIntensity: 0.75,
      shadowsEnabled: true,
      pointLightsEnabled: true,
      fogDensity: 0.32,
    },
  },
  {
    id: 'studio_noon',
    name: 'Studio Noon',
    tagline: 'High-contrast architectural sun & crisp shadows',
    badgeColor: '#38BDF8',
    daylightMode: true,
    lighting: {
      timeOfDay: 13.25,
      sunAzimuth: 135,
      sunIntensity: 1.65,
      ambientIntensity: 0.85,
      shadowsEnabled: true,
      pointLightsEnabled: true,
      fogDensity: 0.14,
    },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    tagline: 'Warm dramatic low-angle amber sunbeams',
    badgeColor: '#F59E0B',
    daylightMode: false,
    lighting: {
      timeOfDay: 18.0,
      sunAzimuth: 225,
      sunIntensity: 1.55,
      ambientIntensity: 0.65,
      shadowsEnabled: true,
      pointLightsEnabled: true,
      fogDensity: 0.26,
    },
  },
  {
    id: 'starlight_midnight',
    name: 'Starlight Midnight',
    tagline: 'Deep obsidian night showcasing glowing lanterns & neon',
    badgeColor: '#818CF8',
    daylightMode: false,
    lighting: {
      timeOfDay: 22.75,
      sunAzimuth: 300,
      sunIntensity: 0.85,
      ambientIntensity: 0.45,
      shadowsEnabled: true,
      pointLightsEnabled: true,
      fogDensity: 0.22,
    },
  },
  {
    id: 'overcast_blueprint',
    name: 'CAD Overcast',
    tagline: 'Even shadowless studio illumination for precision modeling',
    badgeColor: '#94A3B8',
    daylightMode: false,
    lighting: {
      timeOfDay: 11.0,
      sunAzimuth: 160,
      sunIntensity: 1.15,
      ambientIntensity: 1.1,
      shadowsEnabled: false,
      pointLightsEnabled: true,
      fogDensity: 0.08,
    },
  },
];

export function getAtmospherePresetById(
  id: AtmospherePresetId
): AtmospherePreset {
  return (
    ATMOSPHERE_PRESETS.find((p) => p.id === id) || ATMOSPHERE_PRESETS[1]
  );
}

// ============================================================================
// ARCHITECTURAL CONTRACTS & MASTERY RANKS
// ============================================================================

export interface ArchitecturalContractRequirements {
  minBlocks: number;
  minHeight: number;
  minFootprintSpan: number;
  minDistinctBlockTypes: number;
  requireSymmetry?: boolean;
  requireEmissiveLighting?: boolean;
  requireRoofOrSlope?: boolean;
}

export interface ArchitecturalContract {
  id: string;
  title: string;
  category: 'Foundation' | 'Verticality' | 'Symmetry' | 'Illumination' | 'Masterwork';
  difficulty: 'Apprentice' | 'Journeyman' | 'Architect' | 'Grand Master';
  description: string;
  architecturalTip: string;
  xpReward: number;
  recommendedBlocks: string[];
  requirements: ArchitecturalContractRequirements;
}

export interface ContractCriterionCheck {
  label: string;
  current: number;
  target: number;
  met: boolean;
  unit?: string;
}

export interface ContractEvaluationResult {
  contractId: string;
  isCompleted: boolean;
  overallProgressPercent: number;
  checks: ContractCriterionCheck[];
}

export interface MasteryRankDefinition {
  level: number;
  title: string;
  minXp: number;
  badgeHex: string;
  perkDescription: string;
}

export const MASTERY_RANKS: MasteryRankDefinition[] = [
  {
    level: 1,
    title: 'Apprentice Mason',
    minXp: 0,
    badgeHex: '#94A3B8',
    perkDescription: 'Core Skyblock workbench, 47-tile CTM & 3D Volume Brushes',
  },
  {
    level: 2,
    title: 'Journeyman Builder',
    minXp: 150,
    badgeHex: '#38BDF8',
    perkDescription: 'Unlocks Multi-Chunk Biome Stamping & Timelapse Studio',
  },
  {
    level: 3,
    title: 'Senior Voxel Architect',
    minXp: 350,
    badgeHex: '#10B981',
    perkDescription: 'Unlocks Symmetry CAD Laser Mastery & Golden Hour Presets',
  },
  {
    level: 4,
    title: 'Citadel Master',
    minXp: 650,
    badgeHex: '#F59E0B',
    perkDescription: 'Mastery of vertical spires, vaulted arches & light orchestration',
  },
  {
    level: 5,
    title: 'Grand Studio Laureate',
    minXp: 1000,
    badgeHex: '#A855F7',
    perkDescription: 'Supreme architectural distinction across all structural classes',
  },
];

export const ARCHITECTURAL_CONTRACTS: ArchitecturalContract[] = [
  {
    id: 'contract_homestead_foundation',
    title: '01. Timber & Stone Homestead',
    category: 'Foundation',
    difficulty: 'Apprentice',
    description:
      'Construct a grounded multi-material shelter or plaza spanning at least 8 studs wide with 3 distinct block materials.',
    architecturalTip:
      'Use //pos1 and //pos2 with //walls cobble_brick to raise perimeter walls in seconds.',
    xpReward: 150,
    recommendedBlocks: ['cobble_brick', 'oak_plank', 'roof_slope_blue'],
    requirements: {
      minBlocks: 60,
      minHeight: 4,
      minFootprintSpan: 8,
      minDistinctBlockTypes: 3,
    },
  },
  {
    id: 'contract_cantilever_watchtower',
    title: '02. Beacon Watchtower Spire',
    category: 'Verticality',
    difficulty: 'Journeyman',
    description:
      'Erect a vertical watchtower reaching at least 9 blocks in elevation with emissive lantern or neon beacon illumination.',
    architecturalTip:
      'Stack stories rapidly using //stack 2 up or accept the Copilot vertical ghost runs with Tab.',
    xpReward: 220,
    recommendedBlocks: ['cobble_brick', 'voxel_lantern', 'titanium_panel'],
    requirements: {
      minBlocks: 85,
      minHeight: 9,
      minFootprintSpan: 6,
      minDistinctBlockTypes: 3,
      requireEmissiveLighting: true,
    },
  },
  {
    id: 'contract_symmetrical_pavilion',
    title: '03. Symmetrical Courtyard Pavilion',
    category: 'Symmetry',
    difficulty: 'Architect',
    description:
      'Design a balanced courtyard or temple exhibiting bilateral X or Z symmetry and pitched roof slopes.',
    architecturalTip:
      'Press V to activate Live Mirror X or Quad 4x Symmetry so every block places its mirror twin automatically.',
    xpReward: 300,
    recommendedBlocks: ['cobble_brick', 'roof_slope_blue', 'crystal_glass'],
    requirements: {
      minBlocks: 110,
      minHeight: 6,
      minFootprintSpan: 10,
      minDistinctBlockTypes: 4,
      requireSymmetry: true,
      requireRoofOrSlope: true,
    },
  },
  {
    id: 'contract_luminous_sanctuary',
    title: '04. Glazed Atrium & Night Sanctuary',
    category: 'Illumination',
    difficulty: 'Architect',
    description:
      'Build an illuminated glass-and-masonry conservatory or citadel with at least 4 material families and active light sources.',
    architecturalTip:
      'Switch Atmosphere to Starlight Midnight to inspect how Voxel Lanterns warm your interior volumes.',
    xpReward: 350,
    recommendedBlocks: ['crystal_glass', 'voxel_lantern', 'oak_plank'],
    requirements: {
      minBlocks: 140,
      minHeight: 7,
      minFootprintSpan: 11,
      minDistinctBlockTypes: 4,
      requireEmissiveLighting: true,
      requireRoofOrSlope: true,
    },
  },
  {
    id: 'contract_grand_sky_citadel',
    title: '05. Grand Skyblock Citadel',
    category: 'Masterwork',
    difficulty: 'Grand Master',
    description:
      'Create an expansive multi-tiered citadel combining high elevation, wide span, bilateral symmetry, roof slopes, and lighting.',
    architecturalTip:
      'Combine Procedural Biome templates with 3D Volume Brushes and Command Macro Loops for monumental scale.',
    xpReward: 500,
    recommendedBlocks: [
      'cobble_brick',
      'titanium_panel',
      'roof_slope_blue',
      'voxel_lantern',
    ],
    requirements: {
      minBlocks: 220,
      minHeight: 11,
      minFootprintSpan: 14,
      minDistinctBlockTypes: 5,
      requireSymmetry: true,
      requireEmissiveLighting: true,
      requireRoofOrSlope: true,
    },
  },
];

export function evaluateContractProgress(
  contract: ArchitecturalContract,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): ContractEvaluationResult {
  const blockList = Object.values(blocks);
  const totalBlocks = blockList.length;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const distinctDefs = new Set<string>();
  let emissiveCount = 0;
  let slopeOrArchCount = 0;

  for (const blk of blockList) {
    const { x, y, z } = blk.position;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;

    distinctDefs.add(blk.blockDefId);
    const def = customBlocks[blk.blockDefId];
    const finish = blk.materialOverride || def?.materialFinish;
    if (
      finish === 'neon' ||
      blk.blockDefId === 'voxel_lantern' ||
      blk.blockDefId === 'neon_beacon' ||
      blk.blockDefId.includes('lantern') ||
      blk.blockDefId.includes('neon')
    ) {
      emissiveCount++;
    }
    if (
      def?.shape === 'slope' ||
      def?.shape === 'arch' ||
      blk.blockDefId.includes('slope') ||
      blk.blockDefId.includes('roof')
    ) {
      slopeOrArchCount++;
    }
  }

  const heightSpan = totalBlocks > 0 ? maxY - minY + 1 : 0;
  const footprintSpan =
    totalBlocks > 0 ? Math.max(maxX - minX + 1, maxZ - minZ + 1) : 0;
  const distinctCount = distinctDefs.size;

  const checks: ContractCriterionCheck[] = [
    {
      label: 'Placed Blocks',
      current: totalBlocks,
      target: contract.requirements.minBlocks,
      met: totalBlocks >= contract.requirements.minBlocks,
      unit: 'blk',
    },
    {
      label: 'Vertical Height',
      current: heightSpan,
      target: contract.requirements.minHeight,
      met: heightSpan >= contract.requirements.minHeight,
      unit: 'studs',
    },
    {
      label: 'Footprint Span',
      current: footprintSpan,
      target: contract.requirements.minFootprintSpan,
      met: footprintSpan >= contract.requirements.minFootprintSpan,
      unit: 'studs',
    },
    {
      label: 'Material Variety',
      current: distinctCount,
      target: contract.requirements.minDistinctBlockTypes,
      met: distinctCount >= contract.requirements.minDistinctBlockTypes,
      unit: 'types',
    },
  ];

  if (contract.requirements.requireEmissiveLighting) {
    checks.push({
      label: 'Luminous Lanterns / Neon',
      current: emissiveCount,
      target: 2,
      met: emissiveCount >= 2,
      unit: 'lights',
    });
  }

  if (contract.requirements.requireRoofOrSlope) {
    checks.push({
      label: 'Roof Slopes / Arches',
      current: slopeOrArchCount,
      target: 4,
      met: slopeOrArchCount >= 4,
      unit: 'slopes',
    });
  }

  if (contract.requirements.requireSymmetry) {
    const sym = detectWorldSymmetry(blocks, []);
    const symConfidence = sym ? Math.round(sym.confidence * 100) : 0;
    checks.push({
      label: 'Bilateral Symmetry',
      current: symConfidence,
      target: 35,
      met: symConfidence >= 35,
      unit: '%',
    });
  }

  let sumRatios = 0;
  for (const c of checks) {
    const ratio = c.target > 0 ? Math.min(1, c.current / c.target) : 1;
    sumRatios += ratio;
  }
  const overallProgressPercent = Math.round((sumRatios / checks.length) * 100);
  const isCompleted = checks.every((c) => c.met);

  return {
    contractId: contract.id,
    isCompleted,
    overallProgressPercent,
    checks,
  };
}

export function evaluateAllContracts(
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): Record<string, ContractEvaluationResult> {
  const out: Record<string, ContractEvaluationResult> = {};
  for (const c of ARCHITECTURAL_CONTRACTS) {
    out[c.id] = evaluateContractProgress(c, blocks, customBlocks);
  }
  return out;
}

export function computeMasteryRank(totalXp: number): {
  currentRank: MasteryRankDefinition;
  nextRank: MasteryRankDefinition | null;
  progressToNextPercent: number;
} {
  let currentRank = MASTERY_RANKS[0];
  let nextRank: MasteryRankDefinition | null = null;

  for (let i = 0; i < MASTERY_RANKS.length; i++) {
    if (totalXp >= MASTERY_RANKS[i].minXp) {
      currentRank = MASTERY_RANKS[i];
      nextRank = MASTERY_RANKS[i + 1] || null;
    }
  }

  if (!nextRank) {
    return { currentRank, nextRank: null, progressToNextPercent: 100 };
  }

  const span = Math.max(1, nextRank.minXp - currentRank.minXp);
  const gained = Math.max(0, totalXp - currentRank.minXp);
  const progressToNextPercent = Math.min(
    100,
    Math.round((gained / span) * 100)
  );

  return { currentRank, nextRank, progressToNextPercent };
}

// ============================================================================
// DAILY BUILD PROMPTS & STREAK ENGINE
// ============================================================================

export interface DailyBuildPrompt {
  id: string;
  title: string;
  themeBadge: string;
  brief: string;
  suggestedBiomeId: ProceduralBiomeId;
  suggestedBlocks: string[];
  bonusXp: number;
}

export const DAILY_BUILD_PROMPTS: DailyBuildPrompt[] = [
  {
    id: 'daily_hanging_observatory',
    title: 'Cliffside Astral Observatory',
    themeBadge: 'Vertical & Glass',
    brief:
      'Construct an elevated glass-domed stargazing observatory overhanging the edge of a floating island with lantern walkways.',
    suggestedBiomeId: 'alpine_snow_peak',
    suggestedBlocks: ['crystal_glass', 'cobble_brick', 'voxel_lantern'],
    bonusXp: 120,
  },
  {
    id: 'daily_zen_teahouse',
    title: 'Terraced Lantern Teahouse',
    themeBadge: 'Harmony & Timber',
    brief:
      'Build a tranquil two-story timber pavilion overlooking a stepped stone courtyard with warm perimeter lanterns.',
    suggestedBiomeId: 'terraced_zen_garden',
    suggestedBlocks: ['oak_plank', 'cobble_brick', 'voxel_lantern'],
    bonusXp: 120,
  },
  {
    id: 'daily_mesa_gatehouse',
    title: 'Sun-Baked Canyon Gatehouse',
    themeBadge: 'Fortress & Arches',
    brief:
      'Create a twin-tower desert gatehouse with a central bridge span and crenellated battlements.',
    suggestedBiomeId: 'desert_mesa_citadel',
    suggestedBlocks: ['lego_amber_2x4', 'cobble_brick', 'oak_plank'],
    bonusXp: 120,
  },
  {
    id: 'daily_forge_foundry',
    title: 'Caldera Magma Foundry',
    themeBadge: 'Industrial & Glow',
    brief:
      'Span the volcanic caldera with a metallic truss bridge and a central glowing core chamber.',
    suggestedBiomeId: 'volcanic_caldera',
    suggestedBlocks: ['titanium_panel', 'lego_red_2x2', 'voxel_lantern'],
    bonusXp: 120,
  },
];

export function getDailyBuildPromptForDate(dateStr?: string): DailyBuildPrompt {
  const key = dateStr || new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return DAILY_BUILD_PROMPTS[hash % DAILY_BUILD_PROMPTS.length];
}

// ============================================================================
// PROCEDURAL STARTER ISLAND BIOME & TERRAIN TEMPLATES
// ============================================================================

export type ProceduralBiomeId =
  | 'floating_skyblock'
  | 'terraced_zen_garden'
  | 'desert_mesa_citadel'
  | 'volcanic_caldera'
  | 'alpine_snow_peak'
  | 'cyber_grid_plate';

export interface ProceduralBiomeTemplate {
  id: ProceduralBiomeId;
  name: string;
  subtitle: string;
  badge: string;
  accentHex: string;
  description: string;
  recommendedAtmosphere: AtmospherePresetId;
}

export const PROCEDURAL_BIOME_TEMPLATES: ProceduralBiomeTemplate[] = [
  {
    id: 'floating_skyblock',
    name: 'Classic Floating Skyblock',
    subtitle: 'Layered turf, tapered stone underside, oak tree & lantern',
    badge: 'Skyblock',
    accentHex: '#10B981',
    description:
      'Organic floating island with a tapered cobblestone under-cliff, lush turf meadow, timber oak tree, and starter beacon.',
    recommendedAtmosphere: 'studio_noon',
  },
  {
    id: 'terraced_zen_garden',
    name: 'Terraced Zen Sanctuary',
    subtitle: 'Three-tier stone & timber terraces with crystal water pool',
    badge: 'Terraced',
    accentHex: '#38BDF8',
    description:
      'Stepped architectural stone and oak terraces framing a translucent crystal reflection basin and corner lanterns.',
    recommendedAtmosphere: 'dawn_mist',
  },
  {
    id: 'desert_mesa_citadel',
    name: 'Desert Mesa Citadel',
    subtitle: 'Stratified canyon plateau, warm sandstone & twin obelisks',
    badge: 'Canyon',
    accentHex: '#F59E0B',
    description:
      'Sun-drenched terraced mesa bluff with stratified amber/red terracotta bands and ceremonial gateway pillars.',
    recommendedAtmosphere: 'golden_hour',
  },
  {
    id: 'volcanic_caldera',
    name: 'Volcanic Caldera Forge',
    subtitle: 'Basalt crater rim, glowing magma core & titanium bridge',
    badge: 'Volcanic',
    accentHex: '#F43F5E',
    description:
      'Rugged volcanic island ring surrounding a glowing magma fissure with a titanium work platform.',
    recommendedAtmosphere: 'starlight_midnight',
  },
  {
    id: 'alpine_snow_peak',
    name: 'Alpine Frost Peak',
    subtitle: 'Craggy stone mountain spire, snow cap & timber overlook',
    badge: 'Alpine',
    accentHex: '#E0F2FE',
    description:
      'High-altitude rocky crag rising to a snow-capped summit with a cantilevered timber lodge deck.',
    recommendedAtmosphere: 'studio_noon',
  },
  {
    id: 'cyber_grid_plate',
    name: 'Cyber-Grid CAD Plate',
    subtitle: 'Precision 14×14 titanium & luminous neon studio calibration deck',
    badge: 'CAD Studio',
    accentHex: '#A855F7',
    description:
      'Flat engineered titanium deck with coordinate axis markers and corner neon beacons for pure CAD prototyping.',
    recommendedAtmosphere: 'overcast_blueprint',
  },
];

function placeHelper(
  map: Record<string, PlacedBlock>,
  x: number,
  y: number,
  z: number,
  blockDefId: string,
  colorOverride?: string
) {
  const k = coordKey(x, y, z);
  map[k] = {
    id: `blk_${x}_${y}_${z}`,
    blockDefId,
    position: { x, y, z },
    rotation: 0,
    ...(colorOverride ? { colorOverride } : {}),
  };
}

export function generateProceduralBiomeBlocks(
  biomeId: ProceduralBiomeId,
  centerOffset: { x: number; z: number } = { x: 0, z: 0 }
): Record<string, PlacedBlock> {
  const blocks: Record<string, PlacedBlock> = {};
  const ox = centerOffset.x;
  const oz = centerOffset.z;

  if (biomeId === 'floating_skyblock') {
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        const dist = Math.hypot(x, z);
        if (dist <= 5.4) {
          placeHelper(blocks, ox + x, 0, oz + z, 'grass_brick');
        }
        if (dist <= 4.2) {
          placeHelper(blocks, ox + x, -1, oz + z, 'cobble_brick');
        }
        if (dist <= 2.6) {
          placeHelper(blocks, ox + x, -2, oz + z, 'cobble_brick');
        }
      }
    }
    // Starter oak tree + lantern
    for (let y = 1; y <= 3; y++) {
      placeHelper(blocks, ox - 2, y, oz - 2, 'oak_plank');
    }
    for (let lx = -3; lx <= -1; lx++) {
      for (let lz = -3; lz <= -1; lz++) {
        placeHelper(blocks, ox + lx, 4, oz + lz, 'grass_brick');
      }
    }
    placeHelper(blocks, ox - 2, 5, oz - 2, 'grass_brick');
    placeHelper(blocks, ox + 2, 1, oz + 2, 'cobble_brick');
    placeHelper(blocks, ox + 2, 2, oz + 2, 'voxel_lantern');
  } else if (biomeId === 'terraced_zen_garden') {
    // Lower stone terrace (-6..6)
    for (let x = -6; x <= 6; x++) {
      for (let z = -6; z <= 6; z++) {
        placeHelper(blocks, ox + x, 0, oz + z, 'cobble_brick');
      }
    }
    // Crystal reflection pool (-2..2, -2..2)
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        placeHelper(blocks, ox + x, 1, oz + z, 'crystal_glass', '#38BDF8');
      }
    }
    // Elevated timber deck on North & West
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= -3; z++) {
        placeHelper(blocks, ox + x, 1, oz + z, 'oak_plank');
      }
    }
    // Corner lanterns
    placeHelper(blocks, ox - 5, 1, oz + 5, 'cobble_brick');
    placeHelper(blocks, ox - 5, 2, oz + 5, 'voxel_lantern');
    placeHelper(blocks, ox + 5, 1, oz + 5, 'cobble_brick');
    placeHelper(blocks, ox + 5, 2, oz + 5, 'voxel_lantern');
    placeHelper(blocks, ox - 5, 2, oz - 5, 'voxel_lantern');
    placeHelper(blocks, ox + 5, 2, oz - 5, 'voxel_lantern');
  } else if (biomeId === 'desert_mesa_citadel') {
    for (let x = -6; x <= 6; x++) {
      for (let z = -6; z <= 6; z++) {
        const dist = Math.max(Math.abs(x), Math.abs(z));
        if (dist <= 6) {
          placeHelper(blocks, ox + x, 0, oz + z, 'lego_amber_2x4', '#D97706');
        }
        if (dist <= 4) {
          placeHelper(blocks, ox + x, 1, oz + z, 'lego_red_2x2', '#B45309');
        }
        if (dist <= 3) {
          placeHelper(blocks, ox + x, 2, oz + z, 'lego_amber_2x4', '#F59E0B');
        }
      }
    }
    // Twin canyon obelisks
    for (let y = 3; y <= 6; y++) {
      placeHelper(blocks, ox - 2, y, oz + 2, 'cobble_brick', '#D97706');
      placeHelper(blocks, ox + 2, y, oz + 2, 'cobble_brick', '#D97706');
    }
    placeHelper(blocks, ox - 2, 7, oz + 2, 'voxel_lantern');
    placeHelper(blocks, ox + 2, 7, oz + 2, 'voxel_lantern');
  } else if (biomeId === 'volcanic_caldera') {
    for (let x = -6; x <= 6; x++) {
      for (let z = -6; z <= 6; z++) {
        const r = Math.hypot(x, z);
        if (r <= 6.2) {
          placeHelper(blocks, ox + x, 0, oz + z, 'cobble_brick', '#1E293B');
        }
        if (r >= 3.2 && r <= 5.4) {
          placeHelper(blocks, ox + x, 1, oz + z, 'cobble_brick', '#334155');
        }
        if (r >= 3.8 && r <= 4.8 && (x + z) % 2 === 0) {
          placeHelper(blocks, ox + x, 2, oz + z, 'cobble_brick', '#0F172A');
        }
        if (r < 2.5) {
          placeHelper(blocks, ox + x, 0, oz + z, 'voxel_lantern', '#F97316');
        }
      }
    }
    // Titanium bridge across the caldera
    for (let x = -5; x <= 5; x++) {
      placeHelper(blocks, ox + x, 2, oz, 'titanium_panel');
    }
  } else if (biomeId === 'alpine_snow_peak') {
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        const r = Math.hypot(x, z);
        if (r <= 5.5) {
          placeHelper(blocks, ox + x, 0, oz + z, 'cobble_brick');
        }
        if (r <= 4.2) {
          placeHelper(blocks, ox + x, 1, oz + z, 'cobble_brick');
        }
        if (r <= 3.0) {
          placeHelper(blocks, ox + x, 2, oz + z, 'titanium_panel', '#F8FAFC');
        }
        if (r <= 1.8) {
          placeHelper(blocks, ox + x, 3, oz + z, 'titanium_panel', '#FFFFFF');
        }
      }
    }
    // Timber lodge deck on South face
    for (let x = -2; x <= 2; x++) {
      for (let z = 2; z <= 4; z++) {
        placeHelper(blocks, ox + x, 2, oz + z, 'oak_plank');
      }
    }
    placeHelper(blocks, ox, 4, oz, 'voxel_lantern');
  } else {
    // cyber_grid_plate
    for (let x = -6; x <= 6; x++) {
      for (let z = -6; z <= 6; z++) {
        const isAxis = x === 0 || z === 0;
        const isBorder = Math.abs(x) === 6 || Math.abs(z) === 6;
        placeHelper(
          blocks,
          ox + x,
          0,
          oz + z,
          'titanium_panel',
          isAxis ? '#38BDF8' : isBorder ? '#334155' : '#1E293B'
        );
      }
    }
    placeHelper(blocks, ox - 6, 1, oz - 6, 'voxel_lantern');
    placeHelper(blocks, ox + 6, 1, oz - 6, 'voxel_lantern');
    placeHelper(blocks, ox - 6, 1, oz + 6, 'voxel_lantern');
    placeHelper(blocks, ox + 6, 1, oz + 6, 'voxel_lantern');
  }

  return blocks;
}

export function applyProceduralBiomeToWorld(
  state: WorldEditEngineState,
  biomeId: ProceduralBiomeId
): { nextState: WorldEditEngineState; summary: string; blockCount: number } {
  const tpl =
    PROCEDURAL_BIOME_TEMPLATES.find((b) => b.id === biomeId) ||
    PROCEDURAL_BIOME_TEMPLATES[0];
  const withUndo = pushUndoSnapshot(state, `Biome: ${tpl.name}`);
  const nextBlocks = generateProceduralBiomeBlocks(biomeId, { x: 0, z: 0 });
  const count = Object.keys(nextBlocks).length;
  return {
    nextState: {
      ...withUndo,
      blocks: nextBlocks,
      pos1: null,
      pos2: null,
    },
    summary: `Generated "${tpl.name}" starter biome (${count} blocks).`,
    blockCount: count,
  };
}

// ============================================================================
// CHRONOLOGICAL BUILD TIMELAPSE ENGINE
// ============================================================================

export function buildOrderedTimelapseList(
  blocks: Record<string, PlacedBlock>
): PlacedBlock[] {
  const list = Object.values(blocks);
  // Sort bottom-up (Y ascending), then radial distance from origin (0,0) so foundation builds first, then walls, then roof/spires!
  return [...list].sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    const da = Math.hypot(a.position.x, a.position.z);
    const db = Math.hypot(b.position.x, b.position.z);
    if (Math.abs(da - db) > 0.01) {
      return da - db;
    }
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.position.z - b.position.z;
  });
}

export function sliceBlocksAtTimelapseStep(
  orderedBlocks: PlacedBlock[],
  visibleCount: number
): Record<string, PlacedBlock> {
  const clamped = Math.max(0, Math.min(orderedBlocks.length, Math.round(visibleCount)));
  const out: Record<string, PlacedBlock> = {};
  for (let i = 0; i < clamped; i++) {
    const blk = orderedBlocks[i];
    out[coordKey(blk.position.x, blk.position.y, blk.position.z)] = blk;
  }
  return out;
}
