import {
  BlueprintPrefab,
  CommandExecutionResult,
  CustomBlockDefinition,
  GridCoord,
  MicroVoxel,
  PlacedBlock,
  SelectionBounds,
  WorldEditEngineState,
  WorldStateSnapshot,
} from './types';
import { blueprintPayloadError, placementPayloadError, sameBlueprintData, samePlacementContent } from './blueprintDefinitionSafety';
import { createPlacementIdentity } from './placementContent';

// Application work budgets, not Minecraft format/world limits. Validate before
// allocating a history snapshot, enumerating a region, or generating geometry.
export const ENGINE_EDIT_LIMITS = Object.freeze({
  maxAbsCoordinate: 1_000_000,
  maxOperationCells: 100_000,
  maxBlueprintDefinitions: 4_096,
  historyDepth: 30,
});

export const MAX_SAFE_REGION_CELL_BUDGET = ENGINE_EDIT_LIMITS.maxOperationCells;
export const MAX_SAFE_WORLD_COORD = ENGINE_EDIT_LIMITS.maxAbsCoordinate;

export function getGridCoordError(coord: GridCoord): string | null {
  if (!coord || ![coord.x, coord.y, coord.z].every(
    value => Number.isSafeInteger(value) && Math.abs(value) <= ENGINE_EDIT_LIMITS.maxAbsCoordinate
  )) return `Coordinates must be whole finite numbers within ±${ENGINE_EDIT_LIMITS.maxAbsCoordinate}.`;
  return null;
}

function getCellCountError(dimensions: number[], limit: number = ENGINE_EDIT_LIMITS.maxOperationCells): string | null {
  let count = 1;
  for (const dimension of dimensions) {
    if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > Math.floor(limit / count)) {
      return `Operation exceeds the ${limit.toLocaleString('en-US')} cell work budget or has invalid dimensions.`;
    }
    count *= dimension;
  }
  return null;
}

export function getSelectionVolumeError(pos1: GridCoord, pos2: GridCoord): string | null {
  const coordinateError = getGridCoordError(pos1) || getGridCoordError(pos2);
  if (coordinateError) return coordinateError;
  return getCellCountError([
    Math.abs(pos2.x - pos1.x) + 1,
    Math.abs(pos2.y - pos1.y) + 1,
    Math.abs(pos2.z - pos1.z) + 1,
  ]);
}

function rejectCommand(state: WorldEditEngineState, message: string): CommandExecutionResult {
  return { nextState: state, success: false, message, affectedCount: 0 };
}

function parseBoundedInteger(value: string | undefined, fallback: number, max: number): number | null {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
}

function commandCoordinate(args: string[], fallback: GridCoord): GridCoord | null {
  if (args.length === 0) return getGridCoordError(fallback) ? null : { ...fallback };
  if (args.length !== 3) return null;
  const values = args.map(Number);
  // Preserve the command language's rounding of finite decimal coordinates.
  if (!values.every(Number.isFinite)) return null;
  const target = { x: Math.round(values[0]), y: Math.round(values[1]), z: Math.round(values[2]) };
  return getGridCoordError(target) ? null : target;
}

function cloneBlock(block: PlacedBlock): PlacedBlock {
  return { ...block, position: { ...block.position },
    ...(block.customScale ? { customScale: { ...block.customScale } } : {}) };
}

function cloneDefinition(def: CustomBlockDefinition): CustomBlockDefinition {
  return { ...def,
    ...(def.defaultScale ? { defaultScale: { ...def.defaultScale } } : {}),
    ...(def.voxels ? { voxels: def.voxels.map(voxel => ({ ...voxel })) } : {}) };
}

function captureSnapshot(state: WorldEditEngineState, label: string): WorldStateSnapshot {
  return {
    label,
    blocks: Object.fromEntries(Object.entries(state.blocks).map(([key, block]) => [key, cloneBlock(block)])),
    customBlocks: Object.fromEntries(Object.entries(state.customBlocks).map(([key, def]) => [key, cloneDefinition(def)])),
    pos1: state.pos1 ? { ...state.pos1 } : null,
    pos2: state.pos2 ? { ...state.pos2 } : null,
    clipboard: state.clipboard.map(cloneBlock),
    clipboardCustomDefs: state.clipboardCustomDefs.map(cloneDefinition),
  };
}

function restoreSnapshot(state: WorldEditEngineState, snapshot: WorldStateSnapshot): WorldEditEngineState {
  // Old snapshots intentionally fall back to the current non-block domain.
  const restored = captureSnapshot({ ...state,
    blocks: snapshot.blocks,
    customBlocks: snapshot.customBlocks ?? state.customBlocks,
    pos1: snapshot.pos1 === undefined ? state.pos1 : snapshot.pos1,
    pos2: snapshot.pos2 === undefined ? state.pos2 : snapshot.pos2,
    clipboard: snapshot.clipboard ?? state.clipboard,
    clipboardCustomDefs: snapshot.clipboardCustomDefs ?? state.clipboardCustomDefs,
  }, snapshot.label);
  return { ...state, blocks: restored.blocks, customBlocks: restored.customBlocks!,
    pos1: restored.pos1!, pos2: restored.pos2!, clipboard: restored.clipboard!,
    clipboardCustomDefs: restored.clipboardCustomDefs! };
}

function validatePlacementBlocks(
  blocks: PlacedBlock[], definitions: CustomBlockDefinition[], anchor: GridCoord,
  rotation: 0 | 90 | 180 | 270, registry: Record<string, CustomBlockDefinition>, payloadValidated = false
): string | null {
  const anchorError = getGridCoordError(anchor);
  if (anchorError) return anchorError;
  if (![0, 90, 180, 270].includes(rotation)) return 'Rotation must be 0, 90, 180, or 270 degrees.';
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > ENGINE_EDIT_LIMITS.maxOperationCells) {
    return `Placement must contain 1–${ENGINE_EDIT_LIMITS.maxOperationCells} blocks.`;
  }
  if (!Array.isArray(definitions) || definitions.length > ENGINE_EDIT_LIMITS.maxBlueprintDefinitions) {
    return 'Placement contains too many block definitions.';
  }
  const payloadError = payloadValidated ? null : placementPayloadError(blocks, definitions, registry);
  if (payloadError) return payloadError;
  const definitionIds = new Set<string>();
  for (const def of definitions) {
    if (!def || typeof def.id !== 'string' || !def.id ||
        ![def.width, def.depth, def.heightPlates].every(value => Number.isFinite(value) && value > 0 && value <= ENGINE_EDIT_LIMITS.maxAbsCoordinate) ||
        (def.voxels && (!Array.isArray(def.voxels) || def.voxels.length > 512))) {
      return 'Placement contains an invalid block definition.';
    }
    definitionIds.add(def.id);
  }
  let min: GridCoord | null = null;
  let max: GridCoord | null = null;
  const occupied = new Set<string>();
  for (const block of blocks) {
    if (!block || getGridCoordError(block.position) || ![0, 90, 180, 270].includes(block.rotation)) {
      return 'Placement contains invalid block coordinates or rotation.';
    }
    if (!definitionIds.has(block.blockDefId) && !Object.hasOwn(registry, block.blockDefId)) {
      return `Missing block definition "${block.blockDefId}".`;
    }
    const relative = rotateRelativeCoord(block.position, rotation);
    const target = { x: anchor.x + relative.x, y: anchor.y + relative.y, z: anchor.z + relative.z };
    const targetError = getGridCoordError(target);
    if (targetError) return targetError;
    const key = coordKey(target.x, target.y, target.z);
    if (occupied.has(key)) return 'Placement contains duplicate target coordinates; no blocks were placed.';
    occupied.add(key);
    min = min ? { x: Math.min(min.x, target.x), y: Math.min(min.y, target.y), z: Math.min(min.z, target.z) } : target;
    max = max ? { x: Math.max(max.x, target.x), y: Math.max(max.y, target.y), z: Math.max(max.z, target.z) } : target;
  }
  return getSelectionVolumeError(min!, max!);
}

/** Strict merge preflight shared by blueprint and clipboard adapters. No definitions are replaced. */
export function validateBlueprintDefinitionMerge(registry: Record<string, CustomBlockDefinition>, definitions: CustomBlockDefinition[]): string | null {
  if (!Array.isArray(definitions) || definitions.length > ENGINE_EDIT_LIMITS.maxBlueprintDefinitions) return 'Placement contains too many block definitions.';
  return placementPayloadError([], definitions, registry);
}

function mergePlacementDefinitions(registry: Record<string, CustomBlockDefinition>, definitions: CustomBlockDefinition[]): Record<string, CustomBlockDefinition> {
  const merged = { ...registry };
  for (const definition of definitions) if (!Object.hasOwn(registry, definition.id)) merged[definition.id] = cloneDefinition(definition);
  return merged;
}

/** Validation is separate so callers can display a rejection before stamping. */
export function validateBlueprintPlacement(
  state: WorldEditEngineState, blueprint: BlueprintPrefab, anchor: GridCoord,
  rotation: 0 | 90 | 180 | 270 = 0
): string | null {
  const payloadError = blueprintPayloadError(blueprint, state.customBlocks);
  if (payloadError) return payloadError;
  if (!blueprint || !blueprint.size) return 'Blueprint is missing dimensions.';
  const dimensions = [blueprint.size.lx, blueprint.size.ly, blueprint.size.lz];
  if (!dimensions.every(value => Number.isFinite(value) && value > 0)) return 'Blueprint dimensions must be finite and positive.';
  const sizeError = getCellCountError(dimensions.map(Math.ceil));
  return sizeError || validatePlacementBlocks(blueprint.blocks, blueprint.customBlockDefs, anchor, rotation, state.customBlocks, true);
}

export function validateBlueprintLoad(
  state: WorldEditEngineState, blueprint: BlueprintPrefab, includeBasePlatform = true
): string | null {
  const blueprintError = validateBlueprintPlacement(state, blueprint, { x: 0, y: 0, z: 0 });
  if (blueprintError) return blueprintError;
  const anchor = { x: -Math.floor(blueprint.size.lx / 2), y: 1, z: -Math.floor(blueprint.size.lz / 2) };
  const placementError = validateBlueprintPlacement(state, blueprint, anchor);
  if (placementError) return placementError;
  if (includeBasePlatform) {
    const padX = Math.max(4, Math.ceil(blueprint.size.lx / 2) + 2);
    const padZ = Math.max(4, Math.ceil(blueprint.size.lz / 2) + 2);
    const baseError = getCellCountError([padX * 2 + 1, padZ * 2 + 1], ENGINE_EDIT_LIMITS.maxOperationCells - blueprint.blocks.length);
    if (baseError) return baseError;
    if (!state.customBlocks.grass_brick && !blueprint.customBlockDefs.some(def => def.id === 'grass_brick')) {
      return 'Base platform requires the grass_brick block definition.';
    }
  }
  return null;
}

export function coordKey(x: number, y: number, z: number): string {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

export function parseCoordKey(key: string): GridCoord {
  const [x, y, z] = key.split(',').map(Number);
  return { x: x || 0, y: y || 0, z: z || 0 };
}

function createLanternVoxels(): MicroVoxel[] {
  const voxels: MicroVoxel[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 1; x <= 6; x++) {
      for (let z = 1; z <= 6; z++) {
        const isCap = y === 0 || y === 7;
        const isCornerPost = (x === 1 || x === 6) && (z === 1 || z === 6);
        const isCore = x >= 3 && x <= 4 && z >= 3 && z <= 4 && y >= 2 && y <= 5;
        if (isCap || isCornerPost) {
          voxels.push({ x, y, z, color: '#334155' });
        } else if (isCore) {
          voxels.push({ x, y, z, color: '#F59E0B' });
        }
      }
    }
  }
  return voxels;
}

function createBonsaiVoxels(): MicroVoxel[] {
  const voxels: MicroVoxel[] = [];
  // Trunk
  for (let y = 0; y < 5; y++) {
    voxels.push({ x: 3, y, z: 3, color: '#78350F' });
    voxels.push({ x: 4, y, z: 4, color: '#78350F' });
  }
  // Canopy
  for (let y = 4; y <= 7; y++) {
    const r = y === 7 ? 2 : 3;
    for (let x = 4 - r; x <= 3 + r; x++) {
      for (let z = 4 - r; z <= 3 + r; z++) {
        if (x >= 0 && x < 8 && z >= 0 && z < 8) {
          voxels.push({
            x,
            y,
            z,
            color: (x + y + z) % 2 === 0 ? '#10B981' : '#059669',
          });
        }
      }
    }
  }
  return voxels;
}

export const DEFAULT_BLOCK_DEFINITIONS: CustomBlockDefinition[] = [
  {
    id: 'grass_brick',
    name: 'Lush Mossy Turf',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#3F8E4D',
    texturePattern: 'cobblestone',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'dirt_brick',
    name: 'Course Loam Soil',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#6E4720',
    texturePattern: 'cobblestone',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'cobble_brick',
    name: 'Weathered Cobblestone',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#7E8B9B',
    texturePattern: 'cobblestone',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'oak_plank',
    name: 'Hewn Oak Planks',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#B87A3D',
    texturePattern: 'oak_planks',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'lego_red_2x2',
    name: 'Fired Clay Bricks',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#B94A3E',
    texturePattern: 'brick_masonry',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'lego_amber_2x4',
    name: 'Cut Sandstone Block',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#D9A760',
    texturePattern: 'brick_masonry',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'roof_slope_blue',
    name: 'Slate Roof Stair',
    shape: 'slope',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#3B5978',
    texturePattern: 'brick_masonry',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'titanium_panel',
    name: 'Chiseled Iron Block',
    shape: 'brick',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#CBD5E1',
    texturePattern: 'tech_panel',
    materialFinish: 'metallic',
    hasStuds: false,
  },
  {
    id: 'crystal_glass',
    name: 'Tempered Clear Glass',
    shape: 'tile',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#7DD3FC',
    texturePattern: 'smooth_abs',
    materialFinish: 'glass',
    hasStuds: false,
  },
  {
    id: 'neon_beacon',
    name: 'Sea Lantern Core',
    shape: 'cylinder',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#22D3EE',
    texturePattern: 'checker_tile',
    materialFinish: 'neon',
    hasStuds: false,
  },
  {
    id: 'stone_arch',
    name: 'Carved Stone Arch',
    shape: 'arch',
    width: 1,
    depth: 3,
    heightPlates: 3,
    color: '#64748B',
    texturePattern: 'brick_masonry',
    materialFinish: 'matte',
    hasStuds: false,
  },
  {
    id: 'voxel_lantern',
    name: 'Forged Glow Lantern',
    shape: 'micro_voxel',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#F59E0B',
    texturePattern: 'smooth_abs',
    materialFinish: 'neon',
    hasStuds: false,
    voxels: createLanternVoxels(),
    isCustom: true,
  },
  {
    id: 'voxel_bonsai',
    name: 'Chiseled Oak Canopy',
    shape: 'micro_voxel',
    width: 1,
    depth: 1,
    heightPlates: 3,
    color: '#10B981',
    texturePattern: 'cobblestone',
    materialFinish: 'matte',
    hasStuds: false,
    voxels: createBonsaiVoxels(),
    isCustom: true,
  },
];

export function getDefaultBlockRegistry(): Record<string, CustomBlockDefinition> {
  const map: Record<string, CustomBlockDefinition> = {};
  for (const def of DEFAULT_BLOCK_DEFINITIONS) {
    map[def.id] = def;
  }
  return map;
}

export function getSelectionBounds(pos1: GridCoord, pos2: GridCoord): SelectionBounds {
  return {
    minX: Math.min(pos1.x, pos2.x),
    maxX: Math.max(pos1.x, pos2.x),
    minY: Math.min(pos1.y, pos2.y),
    maxY: Math.max(pos1.y, pos2.y),
    minZ: Math.min(pos1.z, pos2.z),
    maxZ: Math.max(pos1.z, pos2.z),
  };
}

export function getSelectionDimensions(pos1: GridCoord, pos2: GridCoord): {
  lx: number;
  ly: number;
  lz: number;
  volume: number;
} {
  const b = getSelectionBounds(pos1, pos2);
  const lx = b.maxX - b.minX + 1;
  const ly = b.maxY - b.minY + 1;
  const lz = b.maxZ - b.minZ + 1;
  return { lx, ly, lz, volume: lx * ly * lz };
}

export function createStarterSkyblockWorld(): Record<string, PlacedBlock> {
  const blocks: Record<string, PlacedBlock> = {};
  const put = (
    x: number,
    y: number,
    z: number,
    blockDefId: string,
    rotation: 0 | 90 | 180 | 270 = 0
  ) => {
    const key = coordKey(x, y, z);
    blocks[key] = {
      id: `blk_${x}_${y}_${z}`,
      blockDefId,
      position: { x, y, z },
      rotation,
    };
  };

  // Layer y = -2: Tapered underside stone core
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) + Math.abs(z) <= 3) {
        put(x, -2, z, 'cobble_brick');
      }
    }
  }

  // Layer y = -1: Earth & Stone mid-layer
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      if (Math.abs(x) === 4 && Math.abs(z) === 4) continue;
      put(x, -1, z, Math.abs(x) >= 3 || Math.abs(z) >= 3 ? 'cobble_brick' : 'dirt_brick');
    }
  }

  // Layer y = 0: Main Skyblock Grass Deck (-5..5)
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      if (Math.abs(x) === 5 && Math.abs(z) === 5) continue;
      put(x, 0, z, 'grass_brick');
    }
  }

  // Cobblestone Watch Shrine on (-3, 1..3, -3)
  put(-3, 1, -3, 'cobble_brick');
  put(-3, 2, -3, 'cobble_brick');
  put(-3, 3, -3, 'voxel_lantern');

  put(3, 1, -3, 'cobble_brick');
  put(3, 2, -3, 'cobble_brick');
  put(3, 3, -3, 'voxel_lantern');

  // Oak Tree on (-3, 1..4, 3)
  put(-3, 1, 3, 'oak_plank');
  put(-3, 2, 3, 'oak_plank');
  put(-3, 3, 3, 'oak_plank');
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      put(-3 + dx, 4, 3 + dz, 'voxel_bonsai');
    }
  }
  put(-3, 5, 3, 'voxel_bonsai');

  // Center Skyblock Beacon Pedestal
  put(0, 1, 0, 'titanium_panel');
  put(0, 2, 0, 'neon_beacon');

  return blocks;
}

export function createInitialEngineState(): WorldEditEngineState {
  return {
    blocks: createStarterSkyblockWorld(),
    customBlocks: getDefaultBlockRegistry(),
    pos1: { x: -2, y: 1, z: -2 },
    pos2: { x: 2, y: 3, z: 2 },
    clipboard: [],
    clipboardCustomDefs: [],
    undoStack: [],
    redoStack: [],
  };
}

export function pushUndoSnapshot(
  state: WorldEditEngineState,
  label: string
): WorldEditEngineState {
  const nextUndo = [...state.undoStack, captureSnapshot(state, label)].slice(-ENGINE_EDIT_LIMITS.historyDepth);
  return {
    ...state,
    undoStack: nextUndo,
    redoStack: [],
  };
}

export function resolveBlockAlias(
  alias: string,
  registry: Record<string, CustomBlockDefinition>
): CustomBlockDefinition | null {
  const literal = alias.trim();
  if (literal.startsWith('@')) return Object.hasOwn(registry, literal.slice(1)) ? registry[literal.slice(1)] : null;
  if (Object.hasOwn(registry, literal)) return registry[literal];
  const clean = alias.trim().toLowerCase();
  if (!clean) return null;
  if (registry[clean]) return registry[clean];

  // Friendly aliases for WorldEdit commands (e.g. //set stone, //set grass, //set oak)
  const shorthandMap: Record<string, string> = {
    grass: 'grass_brick',
    dirt: 'dirt_brick',
    earth: 'dirt_brick',
    stone: 'cobble_brick',
    cobble: 'cobble_brick',
    cobblestone: 'cobble_brick',
    wood: 'oak_plank',
    oak: 'oak_plank',
    plank: 'oak_plank',
    red: 'lego_red_2x2',
    amber: 'lego_amber_2x4',
    gold: 'lego_amber_2x4',
    yellow: 'lego_amber_2x4',
    slope: 'roof_slope_blue',
    blue: 'roof_slope_blue',
    metal: 'titanium_panel',
    tech: 'titanium_panel',
    iron: 'titanium_panel',
    glass: 'crystal_glass',
    neon: 'neon_beacon',
    beacon: 'neon_beacon',
    glow: 'neon_beacon',
    arch: 'stone_arch',
    lantern: 'voxel_lantern',
    leaves: 'voxel_bonsai',
    tree: 'voxel_bonsai',
    foliage: 'voxel_bonsai',
  };
  if (shorthandMap[clean] && registry[shorthandMap[clean]]) {
    return registry[shorthandMap[clean]];
  }

  // Fuzzy match by id or name
  for (const def of Object.values(registry)) {
    if (
      def.id.toLowerCase().includes(clean) ||
      def.name.toLowerCase().replace(/\s+/g, '_').includes(clean)
    ) {
      return def;
    }
  }
  return null;
}

export const WORLDEDIT_COMMANDS_HELP: { cmd: string; desc: string; example: string }[] = [
  { cmd: '//wand', desc: 'Equip the Pos1/Pos2 region selection wand', example: '//wand' },
  { cmd: '//pos1 [x y z]', desc: 'Set Selection Corner 1', example: '//pos1 -3 1 -3' },
  { cmd: '//pos2 [x y z]', desc: 'Set Selection Corner 2', example: '//pos2 3 4 3' },
  { cmd: '//set <block>', desc: 'Fill selected region with block (or air)', example: '//set cobble_brick' },
  { cmd: '//replace [from] <to>', desc: 'Replace blocks inside selection', example: '//replace grass_brick oak_plank' },
  { cmd: '//walls <block>', desc: 'Build 4 vertical perimeter walls around selection', example: '//walls cobble_brick' },
  { cmd: '//box <block>', desc: 'Build hollow 6-sided shell around selection', example: '//box crystal_glass' },
  { cmd: '//hollow', desc: 'Hollow out the interior of the selection volume', example: '//hollow' },
  { cmd: '//sphere <block> <r> [hollow]', desc: 'Generate a 3D sphere centered at Pos1', example: '//sphere crystal_glass 3 hollow' },
  { cmd: '//cyl <block> <r> [height]', desc: 'Generate a 3D cylinder at Pos1', example: '//cyl cobble_brick 3 4' },
  { cmd: '//copy', desc: 'Copy blocks in selection to clipboard relative to Pos1', example: '//copy' },
  { cmd: '//cut', desc: 'Copy selection to clipboard and clear region', example: '//cut' },
  { cmd: '//paste [x y z]', desc: 'Paste clipboard at Pos1 or target coordinates', example: '//paste 0 1 0' },
  { cmd: '//stack <count> [dir]', desc: 'Repeat selection in a direction (up/down/north/south/east/west)', example: '//stack 3 up' },
  { cmd: '//move <dist> [dir]', desc: 'Shift selected blocks by distance in a direction', example: '//move 2 up' },
  { cmd: '//shift <dist> [dir]', desc: 'Translate selection only by 1–24 cells; placed blocks stay fixed (default: 1 up)', example: '//shift 1 up' },
  { cmd: '//expand <amt> [dir]', desc: 'Expand selection bounds along direction or all', example: '//expand 2 up' },
  { cmd: '//size', desc: 'Inspect selection dimensions and block count', example: '//size' },
  { cmd: '//undo', desc: 'Undo the previous WorldEdit or build operation', example: '//undo' },
  { cmd: '//redo', desc: 'Redo the last undone operation', example: '//redo' },
  { cmd: '//clear', desc: 'Clear all blocks inside selection', example: '//clear' },
  { cmd: '//island', desc: 'Reset world to the starter Skyblock island', example: '//island' },
];

function parseDirectionVector(dirStr?: string): GridCoord | null {
  const d = (dirStr || 'up').toLowerCase();
  switch (d) {
    case 'u':
    case 'up':
    case '+y':
      return { x: 0, y: 1, z: 0 };
    case 'd':
    case 'down':
    case '-y':
      return { x: 0, y: -1, z: 0 };
    case 'n':
    case 'north':
    case '-z':
      return { x: 0, y: 0, z: -1 };
    case 's':
    case 'south':
    case '+z':
      return { x: 0, y: 0, z: 1 };
    case 'e':
    case 'east':
    case '+x':
      return { x: 1, y: 0, z: 0 };
    case 'w':
    case 'west':
    case '-x':
      return { x: -1, y: 0, z: 0 };
    default:
      return null;
  }
}

export function executeWorldEditCommand(
  state: WorldEditEngineState,
  rawCommand: string,
  cursorFallback?: GridCoord
): CommandExecutionResult {
  const placementIdentity = createPlacementIdentity(state.blocks);
  const trimmed = rawCommand.trim();
  if (!trimmed) {
    return {
      nextState: state,
      success: false,
      message: 'Enter a WorldEdit command (try //help).',
      affectedCount: 0,
    };
  }

  const normalized = trimmed.startsWith('//')
    ? trimmed.slice(2)
    : trimmed.startsWith('/')
      ? trimmed.slice(1)
      : trimmed;

  const parts = normalized.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  if (cmd === 'help' || cmd === '?') {
    return {
      nextState: state,
      success: true,
      message:
        'Commands: //wand, //pos1, //pos2, //desel, //set <block>, //replace <from> <to>, //walls <block>, //box <block>, //hollow, //sphere <block> <r>, //cyl <block> <r> [h], //copy, //cut, //paste, //stack <n> [dir], //move <n> [dir], //shift <n> [dir] (selection only, 1–24), //undo, //redo, //size',
      affectedCount: 0,
    };
  }

  if (cmd === 'desel' || cmd === 'deselect' || cmd === 'sel') {
    if (args.length) return rejectCommand(state, 'Clear selection takes no arguments (//desel).');
    return {
      nextState: state.pos1 || state.pos2 ? { ...state, pos1: null, pos2: null } : state,
      success: true,
      message: state.pos1 || state.pos2 ? 'Selection cleared. Build and clipboard are unchanged.' : 'Selection is already clear.',
      affectedCount: 0,
    };
  }

  if (cmd === 'wand') {
    return {
      nextState: state,
      success: true,
      message: 'Selection Wand equipped. Click/tap blocks to set Pos1 and Pos2.',
      affectedCount: 0,
      equipWand: true,
    };
  }

  if (cmd === 'pos1' || cmd === '1') {
    const target = commandCoordinate(args, cursorFallback || state.pos1 || { x: 0, y: 1, z: 0 });
    if (!target) return rejectCommand(state, 'Pos1 requires three finite coordinates within the coordinate limit.');
    return {
      nextState: { ...state, pos1: target },
      success: true,
      message: `Pos1 set to (${target.x}, ${target.y}, ${target.z}).`,
      affectedCount: 0,
    };
  }

  if (cmd === 'pos2' || cmd === '2') {
    const target = commandCoordinate(args, cursorFallback || state.pos2 || { x: 0, y: 1, z: 0 });
    if (!target) return rejectCommand(state, 'Pos2 requires three finite coordinates within the coordinate limit.');
    return {
      nextState: { ...state, pos2: target },
      success: true,
      message: `Pos2 set to (${target.x}, ${target.y}, ${target.z}).`,
      affectedCount: 0,
    };
  }

  if (cmd === 'undo') {
    if (state.undoStack.length === 0) {
      return {
        nextState: state,
        success: false,
        message: 'Nothing left to undo.',
        affectedCount: 0,
      };
    }
    const last = state.undoStack[state.undoStack.length - 1];
    const currentSnapshot = captureSnapshot(state, last.label);
    return {
      nextState: {
        ...restoreSnapshot(state, last),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, currentSnapshot].slice(-ENGINE_EDIT_LIMITS.historyDepth),
      },
      success: true,
      message: `Undid: ${last.label}`,
      affectedCount: Math.abs(
        Object.keys(last.blocks).length - Object.keys(state.blocks).length
      ),
    };
  }

  if (cmd === 'redo') {
    if (state.redoStack.length === 0) {
      return {
        nextState: state,
        success: false,
        message: 'Nothing to redo.',
        affectedCount: 0,
      };
    }
    const next = state.redoStack[state.redoStack.length - 1];
    const currentSnapshot = captureSnapshot(state, next.label);
    return {
      nextState: {
        ...restoreSnapshot(state, next),
        undoStack: [...state.undoStack, currentSnapshot].slice(-ENGINE_EDIT_LIMITS.historyDepth),
        redoStack: state.redoStack.slice(0, -1),
      },
      success: true,
      message: `Redid: ${next.label}`,
      affectedCount: Math.abs(
        Object.keys(next.blocks).length - Object.keys(state.blocks).length
      ),
    };
  }

  if (cmd === 'island' || cmd === 'plot') {
    const withUndo = pushUndoSnapshot(state, '//plot reset');
    const fresh = createStarterSkyblockWorld();
    for (const [key, block] of Object.entries(fresh)) block.id = placementIdentity(key);
    return {
      nextState: { ...withUndo, blocks: fresh },
      success: true,
      message: `Restored starter studio plot (${Object.keys(fresh).length} blocks).`,
      affectedCount: Object.keys(fresh).length,
    };
  }

  if (cmd === 'paste') {
    if (state.clipboard.length === 0) {
      return {
        nextState: state,
        success: false,
        message: 'Clipboard is empty. Select a region and run //copy first.',
        affectedCount: 0,
      };
    }
    const origin = commandCoordinate(args, state.pos1 || cursorFallback || { x: 0, y: 1, z: 0 });
    if (!origin) return rejectCommand(state, 'Paste requires three finite coordinates within the coordinate limit.');
    const pasteError = validatePlacementBlocks(state.clipboard, state.clipboardCustomDefs, origin, 0, state.customBlocks);
    if (pasteError) return rejectCommand(state, pasteError);
    const nextBlocks = { ...state.blocks };
    const nextCustom = mergePlacementDefinitions(state.customBlocks, state.clipboardCustomDefs);
    let count = 0;
    for (const b of state.clipboard) {
      const tx = origin.x + b.position.x;
      const ty = origin.y + b.position.y;
      const tz = origin.z + b.position.z;
      const k = coordKey(tx, ty, tz);
      const placed: PlacedBlock = {
        ...cloneBlock(b),
        id: placementIdentity(coordKey(tx, ty, tz)),
        position: { x: tx, y: ty, z: tz },
      };
      if (!samePlacementContent(state.blocks[k], placed)) { nextBlocks[k] = placed; count++; }
    }
    if (count === 0 && sameBlueprintData(nextCustom, state.customBlocks)) return { nextState: state, success: true, message: 'Clipboard already matches the destination; nothing changed.', affectedCount: 0 };
    const withUndo = pushUndoSnapshot(state, '//paste');
    return {
      nextState: { ...withUndo, blocks: nextBlocks, customBlocks: nextCustom },
      success: true,
      message: `Pasted ${count} blocks at (${origin.x}, ${origin.y}, ${origin.z}).`,
      affectedCount: count,
    };
  }

  // Commands that operate around Pos1 (sphere, cyl)
  if (cmd === 'sphere' || cmd === 'hsphere') {
    const center = state.pos1 || cursorFallback || { x: 0, y: 1, z: 0 };
    const blockArg = args[0] || 'cobble_brick';
    const radius = parseBoundedInteger(args[1], 3, 12);
    if (radius === null) return rejectCommand(state, 'Sphere radius must be a whole number from 1 to 12.');
    const shapeError = getGridCoordError(center) || getSelectionVolumeError(
      { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      { x: center.x + radius, y: center.y + radius, z: center.z + radius });
    if (shapeError) return rejectCommand(state, shapeError);
    const isHollow =
      cmd === 'hsphere' || (args[2] || '').toLowerCase() === 'hollow';
    const isAir = ['air','0','none'].includes(blockArg.toLowerCase());
    const def = isAir ? null : resolveBlockAlias(blockArg, state.customBlocks);
    if (!isAir && !def) {
      return {
        nextState: state,
        success: false,
        message: `Unknown block "${blockArg}".`,
        affectedCount: 0,
      };
    }
    const withUndo = pushUndoSnapshot(state, `//sphere ${blockArg} ${radius}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist <= radius + 0.35 && (!isHollow || dist >= radius - 0.75)) {
            const x = center.x + dx;
            const y = center.y + dy;
            const z = center.z + dz;
            const k = coordKey(x, y, z);
            if (isAir) {
              if (nextBlocks[k]) {
                delete nextBlocks[k];
                count++;
              }
            } else if (def) {
              nextBlocks[k] = {
                id: placementIdentity(coordKey(x, y, z)),
                blockDefId: def.id,
                position: { x, y, z },
                rotation: 0,
              };
              count++;
            }
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Created ${isHollow ? 'hollow ' : ''}sphere (${count} blocks) at (${center.x}, ${center.y}, ${center.z}).`,
      affectedCount: count,
    };
  }

  if (cmd === 'cyl' || cmd === 'hcyl') {
    const center = state.pos1 || cursorFallback || { x: 0, y: 1, z: 0 };
    const blockArg = args[0] || 'cobble_brick';
    const radius = parseBoundedInteger(args[1], 3, 12);
    const height = parseBoundedInteger(args[2], 1, 20);
    if (radius === null || height === null) return rejectCommand(state, 'Cylinder radius must be 1–12 and height 1–20, both whole numbers.');
    const shapeError = getGridCoordError(center) || getSelectionVolumeError(
      { x: center.x - radius, y: center.y, z: center.z - radius },
      { x: center.x + radius, y: center.y + height - 1, z: center.z + radius });
    if (shapeError) return rejectCommand(state, shapeError);
    const isHollow =
      cmd === 'hcyl' || (args[3] || '').toLowerCase() === 'hollow';
    const def = resolveBlockAlias(blockArg, state.customBlocks);
    if (!def) {
      return {
        nextState: state,
        success: false,
        message: `Unknown block "${blockArg}".`,
        affectedCount: 0,
      };
    }
    const withUndo = pushUndoSnapshot(state, `//cyl ${def.id} ${radius} ${height}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;
    for (let dy = 0; dy < height; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= radius + 0.35 && (!isHollow || dist >= radius - 0.75)) {
            const x = center.x + dx;
            const y = center.y + dy;
            const z = center.z + dz;
            const k = coordKey(x, y, z);
            nextBlocks[k] = {
              id: placementIdentity(coordKey(x, y, z)),
              blockDefId: def.id,
              position: { x, y, z },
              rotation: 0,
            };
            count++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Created cylinder (${count} blocks) at (${center.x}, ${center.y}, ${center.z}).`,
      affectedCount: count,
    };
  }

  // Remaining commands require a valid Pos1 & Pos2 selection region
  if (!state.pos1 || !state.pos2) {
    return {
      nextState: state,
      success: false,
      message: 'Select a region first using //pos1 and //pos2 or the Wand tool.',
      affectedCount: 0,
    };
  }

  const selectionError = getSelectionVolumeError(state.pos1, state.pos2);
  if (selectionError) return rejectCommand(state, selectionError);
  const bounds = getSelectionBounds(state.pos1, state.pos2);
  const dims = getSelectionDimensions(state.pos1, state.pos2);

  if (cmd === 'shift') {
    if (args.length > 2) return rejectCommand(state, 'Shift accepts a distance and an optional direction.');
    const distance = parseBoundedInteger(args[0], 1, 24);
    if (distance === null) return rejectCommand(state, 'Shift distance must be a whole number from 1 to 24.');
    const direction = parseDirectionVector(args[1]);
    if (!direction) return rejectCommand(state, `Unknown direction "${args[1]}".`);
    const offset = { x: direction.x * distance, y: direction.y * distance, z: direction.z * distance };
    const pos1 = { x: state.pos1.x + offset.x, y: state.pos1.y + offset.y, z: state.pos1.z + offset.z };
    const pos2 = { x: state.pos2.x + offset.x, y: state.pos2.y + offset.y, z: state.pos2.z + offset.z };
    const destinationError = getSelectionVolumeError(pos1, pos2);
    if (destinationError) return rejectCommand(state, destinationError);
    // Preserve anchor orientation and all placed/clipboard data. The editor
    // session owns the transaction and undo entry for this selection-only edit.
    return {
      nextState: { ...state, pos1, pos2 }, success: true,
      message: `Shifted selection by (${offset.x}, ${offset.y}, ${offset.z}); placed blocks stayed fixed.`,
      affectedCount: 0,
    };
  }

  if (cmd === 'size' || cmd === 'count') {
    let occupied = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          if (state.blocks[coordKey(x, y, z)]) occupied++;
        }
      }
    }
    return {
      nextState: state,
      success: true,
      message: `Selection ${dims.lx}×${dims.ly}×${dims.lz} (${dims.volume} volume, ${occupied} solid blocks).`,
      affectedCount: occupied,
    };
  }

  if (cmd === 'expand') {
    const amount = parseBoundedInteger(args[0], 1, ENGINE_EDIT_LIMITS.maxAbsCoordinate);
    if (amount === null) return rejectCommand(state, 'Expansion amount must be a positive whole number within the coordinate limit.');
    const dir = (args[1] || 'all').toLowerCase();
    const p1 = { ...state.pos1 };
    const p2 = { ...state.pos2 };
    if (dir === 'all') {
      p1.x = bounds.minX - amount;
      p1.y = bounds.minY - amount;
      p1.z = bounds.minZ - amount;
      p2.x = bounds.maxX + amount;
      p2.y = bounds.maxY + amount;
      p2.z = bounds.maxZ + amount;
    } else {
      const vec = parseDirectionVector(dir);
      if (!vec) return rejectCommand(state, `Unknown direction "${dir}".`);
      p1.x = bounds.minX + (vec.x < 0 ? vec.x * amount : 0);
      p1.y = bounds.minY + (vec.y < 0 ? vec.y * amount : 0);
      p1.z = bounds.minZ + (vec.z < 0 ? vec.z * amount : 0);
      p2.x = bounds.maxX + (vec.x > 0 ? vec.x * amount : 0);
      p2.y = bounds.maxY + (vec.y > 0 ? vec.y * amount : 0);
      p2.z = bounds.maxZ + (vec.z > 0 ? vec.z * amount : 0);
    }
    const expansionError = getSelectionVolumeError(p1, p2);
    if (expansionError) return rejectCommand(state, expansionError);
    const newDims = getSelectionDimensions(p1, p2);
    return {
      nextState: { ...state, pos1: p1, pos2: p2 },
      success: true,
      message: `Expanded selection to ${newDims.lx}×${newDims.ly}×${newDims.lz} (${newDims.volume} studs).`,
      affectedCount: newDims.volume,
    };
  }

  if (cmd === 'copy') {
    const copied: PlacedBlock[] = [];
    const customMap: Record<string, CustomBlockDefinition> = {};
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const b = state.blocks[coordKey(x, y, z)];
          if (b) {
            copied.push({
              ...cloneBlock(b),
              position: {
                x: x - bounds.minX,
                y: y - bounds.minY,
                z: z - bounds.minZ,
              },
            });
            const def = state.customBlocks[b.blockDefId];
            if (def) customMap[def.id] = cloneDefinition(def);
          }
        }
      }
    }
    return {
      nextState: {
        ...state,
        clipboard: copied,
        clipboardCustomDefs: Object.values(customMap),
      },
      success: true,
      message: `Copied ${copied.length} blocks to clipboard.`,
      affectedCount: copied.length,
    };
  }

  if (cmd === 'cut') {
    const withUndo = pushUndoSnapshot(state, '//cut');
    const nextBlocks = { ...withUndo.blocks };
    const copied: PlacedBlock[] = [];
    const customMap: Record<string, CustomBlockDefinition> = {};
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const k = coordKey(x, y, z);
          const b = nextBlocks[k];
          if (b) {
            copied.push({
              ...cloneBlock(b),
              position: {
                x: x - bounds.minX,
                y: y - bounds.minY,
                z: z - bounds.minZ,
              },
            });
            const def = state.customBlocks[b.blockDefId];
            if (def) customMap[def.id] = cloneDefinition(def);
            delete nextBlocks[k];
          }
        }
      }
    }
    return {
      nextState: {
        ...withUndo,
        blocks: nextBlocks,
        clipboard: copied,
        clipboardCustomDefs: Object.values(customMap),
      },
      success: true,
      message: `Cut ${copied.length} blocks to clipboard.`,
      affectedCount: copied.length,
    };
  }

  if (cmd === 'clear') {
    const withUndo = pushUndoSnapshot(state, '//clear');
    const nextBlocks = { ...withUndo.blocks };
    let removed = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const k = coordKey(x, y, z);
          if (nextBlocks[k]) {
            delete nextBlocks[k];
            removed++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Cleared ${removed} blocks from selection.`,
      affectedCount: removed,
    };
  }

  if (cmd === 'set' || cmd === 'fill') {
    const blockArg = args[0] || '';
    if (!blockArg) {
      return {
        nextState: state,
        success: false,
        message: 'Usage: //set <blockName|air>',
        affectedCount: 0,
      };
    }
    const isAir = ['air','0','none'].includes(blockArg.toLowerCase());
    const def = isAir ? null : resolveBlockAlias(blockArg, state.customBlocks);
    if (!isAir && !def) {
      return {
        nextState: state,
        success: false,
        message: `Block "${blockArg}" not found. Try grass, cobble, oak, glass, neon, or a custom block ID.`,
        affectedCount: 0,
      };
    }
    const withUndo = pushUndoSnapshot(state, `//set ${blockArg}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const k = coordKey(x, y, z);
          if (isAir) {
            if (nextBlocks[k]) {
              delete nextBlocks[k];
              count++;
            }
          } else if (def) {
            nextBlocks[k] = {
              id: placementIdentity(coordKey(x, y, z)),
              blockDefId: def.id,
              position: { x, y, z },
              rotation: 0,
            };
            count++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: isAir
        ? `Cleared ${count} blocks in selection.`
        : `Filled ${count} blocks with ${def!.name}.`,
      affectedCount: count,
    };
  }

  if (cmd === 'replace' || cmd === 'rep') {
    // Supports //replace <toBlock> (replaces all non-air) OR //replace <fromBlock> <toBlock>
    const rawArgs = args.join(' ').split(/[\s,]+/).filter(Boolean);
    if (rawArgs.length === 0) {
      return {
        nextState: state,
        success: false,
        message: 'Usage: //replace <fromBlock> <toBlock> or //replace <toBlock>',
        affectedCount: 0,
      };
    }
    const hasTwo = rawArgs.length >= 2;
    const fromDef = hasTwo ? resolveBlockAlias(rawArgs[0], state.customBlocks) : null;
    const toArg = hasTwo ? rawArgs[1] : rawArgs[0];
    const toIsAir = ['air','0','none'].includes(toArg.toLowerCase());
    const toDef = toIsAir ? null : resolveBlockAlias(toArg, state.customBlocks);

    if (hasTwo && !fromDef) {
      return {
        nextState: state,
        success: false,
        message: `Source block "${rawArgs[0]}" not found.`,
        affectedCount: 0,
      };
    }
    if (!toIsAir && !toDef) {
      return {
        nextState: state,
        success: false,
        message: `Target block "${toArg}" not found.`,
        affectedCount: 0,
      };
    }

    const withUndo = pushUndoSnapshot(state, `//replace ${rawArgs.join(' ')}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const k = coordKey(x, y, z);
          const existing = nextBlocks[k];
          if (!existing) continue;
          if (!fromDef || existing.blockDefId === fromDef.id) {
            if (toIsAir) {
              delete nextBlocks[k];
            } else if (toDef) {
              nextBlocks[k] = {
                ...existing,
                blockDefId: toDef.id,
              };
            }
            count++;
          }
        }
      }
    }

    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Replaced ${count} blocks with ${toIsAir ? 'air' : toDef!.name}.`,
      affectedCount: count,
    };
  }

  if (cmd === 'walls') {
    const blockArg = args[0] || 'cobble_brick';
    const def = resolveBlockAlias(blockArg, state.customBlocks);
    if (!def) {
      return {
        nextState: state,
        success: false,
        message: `Block "${blockArg}" not found.`,
        affectedCount: 0,
      };
    }
    const withUndo = pushUndoSnapshot(state, `//walls ${def.id}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const isPerimeter =
            x === bounds.minX ||
            x === bounds.maxX ||
            z === bounds.minZ ||
            z === bounds.maxZ;
          if (isPerimeter) {
            const k = coordKey(x, y, z);
            nextBlocks[k] = {
              id: placementIdentity(coordKey(x, y, z)),
              blockDefId: def.id,
              position: { x, y, z },
              rotation: 0,
            };
            count++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Built perimeter walls (${count} blocks of ${def.name}).`,
      affectedCount: count,
    };
  }

  if (cmd === 'box' || cmd === 'outline') {
    const blockArg = args[0] || 'cobble_brick';
    const def = resolveBlockAlias(blockArg, state.customBlocks);
    if (!def) {
      return {
        nextState: state,
        success: false,
        message: `Block "${blockArg}" not found.`,
        affectedCount: 0,
      };
    }
    const withUndo = pushUndoSnapshot(state, `//box ${def.id}`);
    const nextBlocks = { ...withUndo.blocks };
    let count = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const isShell =
            x === bounds.minX ||
            x === bounds.maxX ||
            y === bounds.minY ||
            y === bounds.maxY ||
            z === bounds.minZ ||
            z === bounds.maxZ;
          if (isShell) {
            const k = coordKey(x, y, z);
            nextBlocks[k] = {
              id: placementIdentity(coordKey(x, y, z)),
              blockDefId: def.id,
              position: { x, y, z },
              rotation: 0,
            };
            count++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Built hollow box shell (${count} blocks of ${def.name}).`,
      affectedCount: count,
    };
  }

  if (cmd === 'hollow') {
    const withUndo = pushUndoSnapshot(state, '//hollow');
    const nextBlocks = { ...withUndo.blocks };
    let removed = 0;
    for (let x = bounds.minX + 1; x <= bounds.maxX - 1; x++) {
      for (let y = bounds.minY + 1; y <= bounds.maxY - 1; y++) {
        for (let z = bounds.minZ + 1; z <= bounds.maxZ - 1; z++) {
          const k = coordKey(x, y, z);
          if (nextBlocks[k]) {
            delete nextBlocks[k];
            removed++;
          }
        }
      }
    }
    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Hollowed interior (${removed} inner blocks removed).`,
      affectedCount: removed,
    };
  }

  if (cmd === 'stack') {
    const repeatCount = parseBoundedInteger(args[0], 1, 12);
    if (repeatCount === null) return rejectCommand(state, 'Stack count must be a whole number from 1 to 12.');
    const dirVec = parseDirectionVector(args[1]);
    if (!dirVec) return rejectCommand(state, `Unknown direction "${args[1]}".`);
    const workError = getCellCountError([dims.volume, repeatCount + 1]);
    const destinationError = getGridCoordError({
      x: (dirVec.x < 0 ? bounds.minX : bounds.maxX) + dirVec.x * dims.lx * repeatCount,
      y: (dirVec.y < 0 ? bounds.minY : bounds.maxY) + dirVec.y * dims.ly * repeatCount,
      z: (dirVec.z < 0 ? bounds.minZ : bounds.maxZ) + dirVec.z * dims.lz * repeatCount,
    });
    if (workError || destinationError) return rejectCommand(state, (workError || destinationError)!);
    const sourceBlocks: PlacedBlock[] = [];

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const b = state.blocks[coordKey(x, y, z)];
          if (b) {
            if (getGridCoordError(b.position) || b.position.x !== x || b.position.y !== y || b.position.z !== z) {
              return rejectCommand(state, 'Selection contains a block with invalid or inconsistent coordinates.');
            }
            sourceBlocks.push(b);
          }
        }
      }
    }

    const withUndo = pushUndoSnapshot(state, `//stack ${repeatCount} ${args[1] || 'up'}`);
    const nextBlocks = { ...withUndo.blocks };
    let placed = 0;
    for (let step = 1; step <= repeatCount; step++) {
      const ox = dirVec.x * dims.lx * step;
      const oy = dirVec.y * dims.ly * step;
      const oz = dirVec.z * dims.lz * step;
      for (const b of sourceBlocks) {
        const tx = b.position.x + ox;
        const ty = b.position.y + oy;
        const tz = b.position.z + oz;
        const k = coordKey(tx, ty, tz);
        nextBlocks[k] = {
          ...cloneBlock(b),
          id: placementIdentity(coordKey(tx, ty, tz)),
          position: { x: tx, y: ty, z: tz },
        };
        placed++;
      }
    }

    return {
      nextState: { ...withUndo, blocks: nextBlocks },
      success: true,
      message: `Stacked selection ${repeatCount}× (${placed} blocks placed).`,
      affectedCount: placed,
    };
  }

  if (cmd === 'move') {
    const dist = parseBoundedInteger(args[0], 1, 24);
    if (dist === null) return rejectCommand(state, 'Move distance must be a whole number from 1 to 24.');
    const dirVec = parseDirectionVector(args[1]);
    if (!dirVec) return rejectCommand(state, `Unknown direction "${args[1]}".`);
    const destinationError = getSelectionVolumeError(
      { x: state.pos1.x + dirVec.x * dist, y: state.pos1.y + dirVec.y * dist, z: state.pos1.z + dirVec.z * dist },
      { x: state.pos2.x + dirVec.x * dist, y: state.pos2.y + dirVec.y * dist, z: state.pos2.z + dirVec.z * dist });
    if (destinationError) return rejectCommand(state, destinationError);
    const sourceBlocks: PlacedBlock[] = [];

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
          const k = coordKey(x, y, z);
          const b = state.blocks[k];
          if (b) {
            if (getGridCoordError(b.position) || b.position.x !== x || b.position.y !== y || b.position.z !== z) {
              return rejectCommand(state, 'Selection contains a block with invalid or inconsistent coordinates.');
            }
            sourceBlocks.push(b);
          }
        }
      }
    }

    const withUndo = pushUndoSnapshot(state, `//move ${dist} ${args[1] || 'up'}`);
    const nextBlocks = { ...withUndo.blocks };
    for (const b of sourceBlocks) delete nextBlocks[coordKey(b.position.x, b.position.y, b.position.z)];
    const ox = dirVec.x * dist;
    const oy = dirVec.y * dist;
    const oz = dirVec.z * dist;
    for (const b of sourceBlocks) {
      const tx = b.position.x + ox;
      const ty = b.position.y + oy;
      const tz = b.position.z + oz;
      nextBlocks[coordKey(tx, ty, tz)] = {
        ...cloneBlock(b),
        id: b.id,
        position: { x: tx, y: ty, z: tz },
      };
    }

    return {
      nextState: {
        ...withUndo,
        blocks: nextBlocks,
        pos1: { x: state.pos1.x + ox, y: state.pos1.y + oy, z: state.pos1.z + oz },
        pos2: { x: state.pos2.x + ox, y: state.pos2.y + oy, z: state.pos2.z + oz },
      },
      success: true,
      message: `Moved ${sourceBlocks.length} blocks by (${ox}, ${oy}, ${oz}).`,
      affectedCount: sourceBlocks.length,
    };
  }

  return {
    nextState: state,
    success: false,
    message: `Unknown WorldEdit command "//${cmd}". Type //help for available commands.`,
    affectedCount: 0,
  };
}

export function createBlueprintFromSelection(
  state: WorldEditEngineState,
  name: string,
  description: string,
  authorId = 'local_builder',
  authorName = 'Local Builder',
  isPublic = false
): BlueprintPrefab | null {
  if (!state.pos1 || !state.pos2) return null;
  if (getSelectionVolumeError(state.pos1, state.pos2)) return null;
  const bounds = getSelectionBounds(state.pos1, state.pos2);
  const selected: { block: PlacedBlock; x: number; y: number; z: number }[] = [];
  const relativeBlocks: PlacedBlock[] = [];
  const referencedDefs: Record<string, CustomBlockDefinition> = {};

  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const b = state.blocks[coordKey(x, y, z)];
        if (b) selected.push({ block: b, x, y, z });
      }
    }
  }

  if (!selected.length || placementPayloadError(selected.map(item => item.block), [], state.customBlocks)) return null;
  for (const { block: b, x, y, z } of selected) {
    if (getGridCoordError(b.position) || b.position.x !== x || b.position.y !== y || b.position.z !== z) return null;
    const definition = state.customBlocks[b.blockDefId];
    relativeBlocks.push({
      ...cloneBlock(b),
      position: { x: x - bounds.minX, y: y - bounds.minY, z: z - bounds.minZ },
    });
    referencedDefs[definition.id] = cloneDefinition(definition);
  }

  const dims = getSelectionDimensions(state.pos1, state.pos2);
  const blueprint: BlueprintPrefab = {
    id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Untitled Structure',
    description: description.trim() || 'Saved structure blueprint',
    authorId,
    authorName,
    blueprintType: 'structure_blueprint',
    isPublic,
    size: { lx: dims.lx, ly: dims.ly, lz: dims.lz },
    blocks: relativeBlocks,
    customBlockDefs: Object.values(referencedDefs),
    createdAt: new Date().toISOString(),
  };
  return blueprintPayloadError(blueprint, {}) ? null : blueprint;
}

export function createBlueprintFromCustomBlock(
  blockDef: CustomBlockDefinition,
  description = 'Custom designed interlocking stud block',
  authorId = 'local_builder',
  authorName = 'Local Builder',
  isPublic = false
): BlueprintPrefab {
  const definitionError = validateBlueprintDefinitionMerge({}, [blockDef]);
  if (definitionError) throw new Error(definitionError);
  const blueprint: BlueprintPrefab = {
    id: `bp_block_${blockDef.id}`,
    name: blockDef.name,
    description,
    authorId,
    authorName,
    blueprintType: 'custom_block',
    isPublic,
    size: {
      lx: blockDef.width,
      ly: Math.max(1, Math.ceil(blockDef.heightPlates / 3)),
      lz: blockDef.depth,
    },
    blocks: [
      {
        id: 'blk_0_0_0',
        blockDefId: blockDef.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
      },
    ],
    customBlockDefs: [cloneDefinition(blockDef)],
    createdAt: new Date().toISOString(),
  };
  const error = blueprintPayloadError(blueprint, {});
  if (error) throw new Error(error);
  return blueprint;
}

export function rotateRelativeCoord(
  coord: GridCoord,
  rotation: 0 | 90 | 180 | 270
): GridCoord {
  switch (rotation) {
    case 90:
      return { x: -coord.z, y: coord.y, z: coord.x };
    case 180:
      return { x: -coord.x, y: coord.y, z: -coord.z };
    case 270:
      return { x: coord.z, y: coord.y, z: -coord.x };
    default:
      return { x: coord.x, y: coord.y, z: coord.z };
  }
}

export function stampBlueprintIntoWorld(
  state: WorldEditEngineState,
  blueprint: BlueprintPrefab,
  anchor: GridCoord,
  rotation: 0 | 90 | 180 | 270 = 0
): WorldEditEngineState {
  if (validateBlueprintPlacement(state, blueprint, anchor, rotation)) return state;
  const placementIdentity = createPlacementIdentity(state.blocks);
  const nextBlocks = { ...state.blocks };
  const nextCustom = mergePlacementDefinitions(state.customBlocks, blueprint.customBlockDefs);
  let changedBlocks = false;

  for (const b of blueprint.blocks) {
    const rotPos = rotateRelativeCoord(b.position, rotation);
    const tx = anchor.x + rotPos.x;
    const ty = anchor.y + rotPos.y;
    const tz = anchor.z + rotPos.z;
    const combinedRot = (((b.rotation + rotation) % 360) as 0 | 90 | 180 | 270) || 0;
    const k = coordKey(tx, ty, tz);
    const placed: PlacedBlock = {
      ...cloneBlock(b),
      id: placementIdentity(k),
      position: { x: tx, y: ty, z: tz },
      rotation: combinedRot,
    };
    if (!samePlacementContent(state.blocks[k], placed)) { nextBlocks[k] = placed; changedBlocks = true; }
  }
  if (!changedBlocks && sameBlueprintData(nextCustom, state.customBlocks)) return state;
  const withUndo = pushUndoSnapshot(state, `Stamp Blueprint: ${blueprint.name}`);
  return {
    ...withUndo,
    blocks: nextBlocks,
    customBlocks: nextCustom,
  };
}

export function loadBlueprintIntoNewWorld(
  state: WorldEditEngineState,
  blueprint: BlueprintPrefab,
  includeBasePlatform = true
): WorldEditEngineState {
  if (validateBlueprintLoad(state, blueprint, includeBasePlatform)) return state;
  const baseBlocks: Record<string, PlacedBlock> = {};
  const placementIdentity = createPlacementIdentity(state.blocks);

  if (includeBasePlatform) {
    const padX = Math.max(4, Math.ceil(blueprint.size.lx / 2) + 2);
    const padZ = Math.max(4, Math.ceil(blueprint.size.lz / 2) + 2);
    for (let x = -padX; x <= padX; x++) {
      for (let z = -padZ; z <= padZ; z++) {
        baseBlocks[coordKey(x, 0, z)] = {
          id: placementIdentity(coordKey(x, 0, z)),
          blockDefId: 'grass_brick',
          position: { x, y: 0, z },
          rotation: 0,
        };
      }
    }
  }

  const nextCustom = mergePlacementDefinitions(state.customBlocks, blueprint.customBlockDefs);

  const offsetX = -Math.floor(blueprint.size.lx / 2);
  const offsetZ = -Math.floor(blueprint.size.lz / 2);

  for (const b of blueprint.blocks) {
    const tx = offsetX + b.position.x;
    const ty = 1 + b.position.y;
    const tz = offsetZ + b.position.z;
    baseBlocks[coordKey(tx, ty, tz)] = {
      ...cloneBlock(b),
      id: placementIdentity(coordKey(tx, ty, tz)),
      position: { x: tx, y: ty, z: tz },
    };
  }

  const pos1 = { x: offsetX, y: 1, z: offsetZ };
  const pos2 = {
      x: offsetX + Math.max(0, Math.ceil(blueprint.size.lx) - 1),
      y: 1 + Math.max(0, Math.ceil(blueprint.size.ly) - 1),
      z: offsetZ + Math.max(0, Math.ceil(blueprint.size.lz) - 1),
  };
  for (const [key, block] of Object.entries(baseBlocks)) if (samePlacementContent(state.blocks[key], block)) baseBlocks[key] = state.blocks[key];
  if (sameBlueprintData(state.blocks, baseBlocks) && sameBlueprintData(state.customBlocks, nextCustom) && sameBlueprintData(state.pos1, pos1) && sameBlueprintData(state.pos2, pos2)) return state;
  const withUndo = pushUndoSnapshot(state, `Load Blueprint World: ${blueprint.name}`);
  return {
    ...withUndo, blocks: baseBlocks, customBlocks: nextCustom, pos1, pos2,
  };
}

export const STARTER_STRUCTURE_BLUEPRINTS: BlueprintPrefab[] = [
  {
    id: 'bp_starter_watchtower',
    name: 'Skyblock Watchtower',
    description: 'Fortified 3×3 cobblestone & timber lookout tower with glowing lantern crest.',
    authorId: 'system',
    authorName: 'BrickForge Studio',
    blueprintType: 'structure_blueprint',
    isPublic: true,
    size: { lx: 3, ly: 5, lz: 3 },
    customBlockDefs: [],
    createdAt: '2026-10-31T00:00:00.000Z',
    blocks: (() => {
      const arr: PlacedBlock[] = [];
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 3; x++) {
          for (let z = 0; z < 3; z++) {
            const isCorner = (x === 0 || x === 2) && (z === 0 || z === 2);
            const isWall = x === 0 || x === 2 || z === 0 || z === 2;
            if (y < 3 && isWall) {
              arr.push({
                id: `wt_${x}_${y}_${z}`,
                blockDefId: isCorner ? 'cobble_brick' : 'oak_plank',
                position: { x, y, z },
                rotation: 0,
              });
            } else if (y === 3 && isCorner) {
              arr.push({
                id: `wt_${x}_${y}_${z}`,
                blockDefId: 'cobble_brick',
                position: { x, y, z },
                rotation: 0,
              });
            }
          }
        }
      }
      arr.push({
        id: 'wt_top_beacon',
        blockDefId: 'voxel_lantern',
        position: { x: 1, y: 4, z: 1 },
        rotation: 0,
      });
      return arr;
    })(),
  },
  {
    id: 'bp_starter_shrine',
    name: 'Neon Beacon Archway',
    description: 'Symmetrical tech-alloy portal arch with suspended cyan energy core.',
    authorId: 'system',
    authorName: 'BrickForge Studio',
    blueprintType: 'structure_blueprint',
    isPublic: true,
    size: { lx: 5, ly: 4, lz: 1 },
    customBlockDefs: [],
    createdAt: '2026-10-31T00:00:00.000Z',
    blocks: [
      { id: 'sh_1', blockDefId: 'titanium_panel', position: { x: 0, y: 0, z: 0 }, rotation: 0 },
      { id: 'sh_2', blockDefId: 'titanium_panel', position: { x: 0, y: 1, z: 0 }, rotation: 0 },
      { id: 'sh_3', blockDefId: 'titanium_panel', position: { x: 0, y: 2, z: 0 }, rotation: 0 },
      { id: 'sh_4', blockDefId: 'titanium_panel', position: { x: 4, y: 0, z: 0 }, rotation: 0 },
      { id: 'sh_5', blockDefId: 'titanium_panel', position: { x: 4, y: 1, z: 0 }, rotation: 0 },
      { id: 'sh_6', blockDefId: 'titanium_panel', position: { x: 4, y: 2, z: 0 }, rotation: 0 },
      { id: 'sh_7', blockDefId: 'cobble_brick', position: { x: 0, y: 3, z: 0 }, rotation: 0 },
      { id: 'sh_8', blockDefId: 'cobble_brick', position: { x: 1, y: 3, z: 0 }, rotation: 0 },
      { id: 'sh_9', blockDefId: 'neon_beacon', position: { x: 2, y: 3, z: 0 }, rotation: 0 },
      { id: 'sh_10', blockDefId: 'cobble_brick', position: { x: 3, y: 3, z: 0 }, rotation: 0 },
      { id: 'sh_11', blockDefId: 'cobble_brick', position: { x: 4, y: 3, z: 0 }, rotation: 0 },
      { id: 'sh_12', blockDefId: 'voxel_lantern', position: { x: 2, y: 1, z: 0 }, rotation: 0 },
    ],
  },
  {
    id: 'bp_starter_cottage',
    name: 'Timber Homestead Cabin',
    description: 'Cozy oak and masonry starter shelter with sloped blue roof tiles and glass windows.',
    authorId: 'system',
    authorName: 'BrickForge Studio',
    blueprintType: 'structure_blueprint',
    isPublic: true,
    size: { lx: 4, ly: 4, lz: 4 },
    customBlockDefs: [],
    createdAt: '2026-10-31T00:00:00.000Z',
    blocks: (() => {
      const arr: PlacedBlock[] = [];
      for (let x = 0; x < 4; x++) {
        for (let z = 0; z < 4; z++) {
          const isEdge = x === 0 || x === 3 || z === 0 || z === 3;
          const isDoor = z === 0 && (x === 1 || x === 2);
          if (isEdge && !isDoor) {
            arr.push({
              id: `cab_w1_${x}_${z}`,
              blockDefId: 'oak_plank',
              position: { x, y: 0, z },
              rotation: 0,
            });
            arr.push({
              id: `cab_w2_${x}_${z}`,
              blockDefId: x === 0 || x === 3 ? 'crystal_glass' : 'oak_plank',
              position: { x, y: 1, z },
              rotation: 0,
            });
          }
          arr.push({
            id: `cab_r_${x}_${z}`,
            blockDefId: 'roof_slope_blue',
            position: { x, y: 2, z },
            rotation: 0,
          });
        }
      }
      return arr;
    })(),
  },
];
