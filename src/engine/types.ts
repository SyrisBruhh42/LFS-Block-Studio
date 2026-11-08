export interface GridCoord {
  x: number;
  y: number;
  z: number;
}

export type BlockShape =
  | 'brick'
  | 'cube'
  | 'plate'
  | 'tile'
  | 'slope'
  | 'arch'
  | 'cylinder'
  | 'micro_voxel';

export type BlockTexturePattern =
  | 'solid'
  | 'smooth_abs'
  | 'cobblestone'
  | 'cobble'
  | 'oak_planks'
  | 'wood_grain'
  | 'wood_plank'
  | 'tech_panel'
  | 'metallic_brushed'
  | 'checker_tile'
  | 'brick_masonry'
  | 'brick_mortar'
  | 'brick'
  | 'roof_tiles'
  | 'glass_grid'
  | 'grass_top';

export type BlockMaterialFinish =
  | 'plastic'
  | 'matte'
  | 'satin'
  | 'pearl'
  | 'metallic'
  | 'glass'
  | 'translucent'
  | 'neon';

export interface MicroVoxel {
  x: number; // 0..7
  y: number; // 0..7
  z: number; // 0..7
  color: string;
}

export interface BlockScale3D {
  x: number; // 0.2 .. 8.0 multiplier
  y: number; // 0.2 .. 8.0 multiplier
  z: number; // 0.2 .. 8.0 multiplier
}

export type ScrollResizeMode = 'snap' | 'free';

export type ScrollResizeAxis =
  | 'uniform'
  | 'footprint'
  | 'height'
  | 'width'
  | 'depth';

export interface CustomBlockDefinition {
  id: string;
  name: string;
  shape: BlockShape;
  width: number; // X studs (0.25..8)
  depth: number; // Z studs (0.25..8)
  heightPlates: number; // 1 plate = 1/3 brick height, 3 plates = 1 standard brick, 6 = 2 bricks
  color: string;
  texturePattern: BlockTexturePattern;
  materialFinish: BlockMaterialFinish;
  hasStuds: boolean;
  voxels?: MicroVoxel[];
  isCustom?: boolean;
  defaultScale?: BlockScale3D;
}

export interface PlacedBlock {
  id: string;
  blockDefId: string;
  position: GridCoord; // Anchor stud coordinate (minimum corner or center origin)
  rotation: 0 | 90 | 180 | 270;
  colorOverride?: string;
  textureOverride?: BlockTexturePattern;
  materialOverride?: BlockMaterialFinish;
  customScale?: BlockScale3D; // Dynamic per-block scale set via Shift+Scroll (Snap or Free mode)
}

export interface BlueprintPrefab {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  blueprintType: 'custom_block' | 'structure_blueprint';
  isPublic: boolean;
  size: {
    lx: number;
    ly: number;
    lz: number;
  };
  blocks: PlacedBlock[]; // Positions normalized relative to (0,0,0)
  customBlockDefs: CustomBlockDefinition[];
  createdAt: string;
}

export type ToolMode =
  | 'place'
  | 'erase'
  | 'brush_place'
  | 'brush_erase'
  | 'paint'
  | 'pick'
  | 'stamp_blueprint'
  | 'wand_select';

export type VolumeBrushShape = 'sphere' | 'cube' | 'cylinder' | 'diamond';

export interface VolumeBrushConfig {
  shape: VolumeBrushShape;
  radius: number; // 1..8 (radius 1 = 3x3x3, radius 2 = 5x5x5, etc.)
  height: number; // 1..12 (used when shape === 'cylinder')
  hollow: boolean; // Hollow shell vs solid volume
  airOnly: boolean; // When placing with brush_place, only place in empty air cells
}

export interface SelectionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface WorldStateSnapshot {
  blocks: Record<string, PlacedBlock>;
  label: string;
  // Optional only to read legacy, blocks-only history. New snapshots capture the
  // complete authored engine domain; history stacks themselves are not nested.
  customBlocks?: Record<string, CustomBlockDefinition>;
  pos1?: GridCoord | null;
  pos2?: GridCoord | null;
  clipboard?: PlacedBlock[];
  clipboardCustomDefs?: CustomBlockDefinition[];
}

export interface WorldEditEngineState {
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  pos1: GridCoord | null;
  pos2: GridCoord | null;
  clipboard: PlacedBlock[];
  clipboardCustomDefs: CustomBlockDefinition[];
  undoStack: WorldStateSnapshot[];
  redoStack: WorldStateSnapshot[];
}

export interface CommandExecutionResult {
  nextState: WorldEditEngineState;
  success: boolean;
  message: string;
  affectedCount: number;
  equipWand?: boolean;
}

export interface CollaboratorPresence {
  userId: string;
  userName: string;
  color: string;
  cursorX: number;
  cursorY: number;
  cursorZ: number;
  activeTool: string;
  isWorldPublic: boolean;
}

export interface DynamicLightingConfig {
  timeOfDay: number; // 0..24 hours (e.g. 6.5 = sunrise, 13.5 = noon, 18.5 = sunset, 22 = night)
  sunAzimuth: number; // 0..360 degrees
  sunIntensity: number; // 0..3.0
  ambientIntensity: number; // 0.1..2.0
  shadowsEnabled: boolean;
  pointLightsEnabled: boolean; // Emissive blocks cast real PointLight illumination
  fogDensity: number; // 0..0.035
}

export interface GitCommitNode {
  id: string;
  hash: string;
  branch: string;
  message: string;
  timestamp: string;
  blockCount: number;
  addedDelta: number;
  removedDelta: number;
  blocksSnapshot: Record<string, PlacedBlock>;
  customBlocksSnapshot?: CustomBlockDefinition[];
}

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export type ChunkExpansionStyle =
  | 'grass_island'
  | 'stone_foundation'
  | 'timber_deck'
  | 'sandstone_plaza'
  | 'empty_grid';

export interface WorldChunkConfig {
  chunkSize: number; // Footprint size per chunk on X/Z (8, 12, 16, 24, 32, 48, 64; default 16)
  chunkHeight?: number; // Vertical chunk cage & build ceiling height (8, 16, 32, 64, 128, 256; default 16)
  cellSubdivision?: number; // Grid cell step visual subdivision (0.25, 0.5, 1, 2; default 1)
  activeChunks: Record<string, boolean>; // Keyed by "cx,cz", true = active/rendered, false = hibernated/unloaded
  unlockedChunks: string[]; // List of "cx,cz" keys unlocked in the world
  showChunkBorders: boolean; // Render 3D chunk boundary grids & labels
  autoCullDistanceChunks: number; // 0 = disabled (render all active), 1..4 = auto-cull chunks beyond N radius from cursor
}

export type PixelsPerBlock = 16 | 32 | 64;

export type ProceduralArtStyle =
  | 'pixel_art_hd'
  | 'hand_painted'
  | 'chiseled_pbr';

export interface SmartPatternVariationConfig {
  enabled: boolean; // Master toggle for Smart Pattern Variation & Connected Art Matcher
  pixelsPerBlock: PixelsPerBlock; // 16x16 Classic Voxel, 32x32 Detailed Voxel, or 64x64 HD Pixel-Art
  artStyle: ProceduralArtStyle; // Crisp HD Pixel-Art, Hand-Painted Brush, or Chiseled Architectural PBR
  megaSpritemapMode?: boolean; // Map blocks into a continuous 4x4 world-space mega-spritemap so stones/grain/turf cross block boundaries seamlessly
  smartPlacementPrediction?: boolean; // Lightweight placement prediction algorithm that seeks similar colors & patterns on block placement
  colorSimilarityThreshold?: number; // Perceptual color distance threshold (10..80) to connect & harmonize similar-colored neighbor blocks
  seed: number; // Deterministic pattern evolution seed
  evolutionPhase: number; // Continuous looping phase (0..2π) for pattern evolution
  autoEvolveLoop: boolean; // Automatically loop/evolve pattern variation over time
  evolveSpeed: number; // 0.2..3.0x loop speed
  hueShiftSpread: number; // 0..25 degrees organic hue variation across blocks
  luminanceJitter: number; // 0..0.30 lightness/contrast variation across blocks
  roughnessVariance: number; // 0..0.35 surface roughness variation
  spatialScale: number; // 0.25..3.0 wavelength of coherent 3D noise clusters
  seamBlendStrength: number; // 0..1.0 Smart Connected-Neighbor Art Matcher (links textures & blends colors across touching faces)
  weatheringMossIntensity: number; // 0..1.0 organic moss/patina near turf or exposed crevices
  uvAutoRotate: boolean; // Deterministically vary sub-pattern variants per coordinate to break tiling repetition without breaking horizontal courses
}

export type UiDensityPreset =
  | 'auto'
  | 'compact'
  | 'balanced'
  | 'touch_comfortable'
  | 'accessible_large';

export type MobileHubDockPosition = 'bottom' | 'left_thumb' | 'right_thumb';

export type StylusBarrelAction = 'erase' | 'pick' | 'wand_select' | 'orbit';

export interface StylusModeConfig {
  enabled: boolean; // Active Stylus Mode (auto-activates when pen pointerType === 'pen' is detected, or manually toggled)
  autoDetectPen: boolean; // Automatically switch to Stylus Mode when hardware pen hovers or touches
  continuousStroke: boolean; // Dragging the stylus across the 3D grid continuously places/paints/erases blocks along the stroke path
  palmRejection: boolean; // Ignore stray touch/palm contacts while pen is active or hovering within 450ms
  touchOrbitsInStylusMode: boolean; // When Stylus Mode is active, finger touch orbits/pans the camera while the pen draws/builds
  barrelButtonAction: StylusBarrelAction; // Action triggered when holding stylus barrel button (button 2)
  eraserTailAction: 'erase' | 'undo'; // Action triggered when using stylus tail eraser (button 5 / buttons 32)
  pressureControlsScale: boolean; // Map pen pressure (0.1..1.0) to live block scale (Snap or Free steps)
  pressureSensitivity: number; // 0.5..2.0 multiplier for stylus pressure response
  hoverReticle: boolean; // Show precision stylus tilt/pressure reticle during pen hover
}

export interface AdaptiveUiConfig {
  uiScale: number; // 0.85 .. 1.35 master UI & HUD scale multiplier
  densityPreset: UiDensityPreset; // Auto-Responsive, Compact, Balanced, Touch Comfortable (44px+ targets), or Accessible Large
  autoCollapseRibbonOnCompact: boolean; // Collapse secondary ribbon row on compact height/mobile windows
  ribbonCollapsed: boolean; // Manual collapse state for top ribbon toolbar
  autoFadeHudOnPan: boolean; // Gracefully dim/condense floating HUD bars while actively panning/orbiting or drawing
  highContrastAccessible: boolean; // High-contrast WCAG AAA borders and focus rings
  mobileDockPosition: MobileHubDockPosition; // Bottom bar, Left-Thumb Arc, or Right-Thumb Arc for Android ergonomics
  pinnedQuickTools: ToolMode[]; // Customizable pinned tools on the Android/Compact quick dock
  showMobileCommandChips: boolean; // Show one-tap WorldEdit command chips (Pos1, Pos2, //set, //walls, Undo) on compact dock
}

export type SymmetryAxisMode = 'off' | 'mirror_x' | 'mirror_z' | 'quad_xz';

export interface SymmetryConfig {
  mode: SymmetryAxisMode;
  pivotX: number;
  pivotZ: number;
  showPlaneGizmo: boolean;
  autoDetectIntent: boolean;
}

export interface DetectedSymmetryCandidate {
  recommendedMode: SymmetryAxisMode;
  pivotX: number;
  pivotZ: number;
  confidence: number; // 0..1
  matchedPairs: number;
  summary: string;
}

export type ArchitecturalObjectClassId =
  | 'auto_detect'
  | 'house_dwelling'
  | 'watchtower_spire'
  | 'bridge_aqueduct'
  | 'walled_courtyard'
  | 'terraced_pavilion';

export type CopilotPredictionReason =
  | 'linear_run'
  | 'battlement_pattern'
  | 'corner_closure'
  | 'slope_continuation'
  | 'learned_archive_habit'
  | 'object_class_template'
  | 'connected_texture_match';

export type ElevationZoneBand =
  | 'foundation'
  | 'wall_story'
  | 'roof_canopy'
  | 'sky_tower';

export interface CopilotPredictedBlock {
  position: GridCoord;
  blockDefId: string;
  rotation: 0 | 90 | 180 | 270;
  confidence: number; // 0..1
  reason: CopilotPredictionReason;
  patternKey?: string;
  objectClassId?: ArchitecturalObjectClassId;
  colorOverride?: string;
  textureOverride?: BlockTexturePattern;
}

export interface ArchivedSpatialPattern {
  key: string;
  anchorBlockId: string;
  predictedBlockId: string;
  offset: GridCoord; // Relative (dx, dy, dz) from anchor block
  rotationDelta: 0 | 90 | 180 | 270;
  elevationBand: ElevationZoneBand;
  objectClassAffinity: Exclude<ArchitecturalObjectClassId, 'auto_detect'>;
  occurrences: number;
  acceptedCount: number;
  lingerSurvivedCount: number;
  lingerRemovedPenaltyCount: number;
  textureCohesionScore: number; // 0..1
  confidenceWeight: number; // Learned reinforcement multiplier (0.05..1.85)
  lastTimestamp: number;
  lastAreaCentroid: GridCoord;
}

export interface LingerWatchedBlockEntry {
  coordKeyStr: string;
  position: GridCoord;
  blockDefId: string;
  patternKey: string;
  objectClassId: Exclude<ArchitecturalObjectClassId, 'auto_detect'>;
  placedAt: number;
  expiresAt: number;
}

export interface DetectedArchitecturalObjectClass {
  classId: Exclude<ArchitecturalObjectClassId, 'auto_detect'>;
  label: string;
  confidence: number; // 0..1
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  nextStageHint: string;
  recommendedBlockIds: string[];
}

export interface AdaptivePatternArchiveState {
  version: number;
  patterns: Record<string, ArchivedSpatialPattern>;
  lingerWatchList: LingerWatchedBlockEntry[];
  totalLearnedTransitions: number;
  totalAcceptedGhosts: number;
  totalLingerSurvivals: number;
  totalLingerRemovals: number;
  objectClassScores: Record<
    Exclude<ArchitecturalObjectClassId, 'auto_detect'>,
    number
  >;
}

export interface SelectionCommandRecommendation {
  command: string;
  label: string;
  reason: string;
  confidence: number; // 0..1
  previewMode: 'set' | 'walls' | 'hollow' | 'stack_up' | 'clear';
}

export interface WalkabilityAuditReport {
  walkableCount: number;
  headroomConflictCoords: GridCoord[];
  darkInteriorCoords: GridCoord[];
  steepDropCoords: GridCoord[];
  accessibilityScore: number; // 0..100
  summary: string;
  executionMs: number;
}

export type WorkspacePersonaId = 'auto' | 'sculptor' | 'architect_cad' | 'full_studio';

export interface SpatialCopilotConfig {
  enabled: boolean;
  ghostAutoCompleteEnabled: boolean; // Predict next 1..4 blocks on linear/pattern runs (Tab to accept)
  selectionCommandGhostPreview: boolean; // Show 3D non-destructive preview of recommended WorldEdit command
  autoDetectSymmetry: boolean; // Automatically detect bilateral X/Z symmetry and suggest 1-tap mirror plane
  autoPersonaAdapting: boolean; // Automatically declutter UI panels based on recent user actions
  workspacePersona: WorkspacePersonaId;
  pixel8ProGpuGovernor: boolean; // Cap DPR <= 2.0, reuse shared ghost geometries, and bound copilot checks to <1.2ms
  showWalkabilityOverlays: boolean; // Render headroom pinch-points & dark spots in 3D viewport
  adaptiveLearningEnabled: boolean; // Archive completed actions & learn from recency, area, habit & linger removals
  lingerTrackingWindowSec: number; // Default 45s window to track if predicted blocks are kept or removed
  targetObjectClass: ArchitecturalObjectClassId; // 'auto_detect' or forced architectural object class
  connectedTextureGhostMatch: boolean; // Automatically match/link connected textures & colors on predicted ghost blocks
}

export type OpenSourceCreatorPackId =
  | 'polyhaven_cc0'
  | 'kenney_voxel_cc0'
  | 'ambientcg_pbr'
  | 'opengameart_pixel'
  | 'lfs_architectural';

export type MarketBlockCategory =
  | 'masonry'
  | 'timber'
  | 'metals'
  | 'glass_neon'
  | 'nature_terrain'
  | 'roofing_trim';

export interface OpenSourceMarketBlock {
  blockDef: CustomBlockDefinition;
  creatorPackId: OpenSourceCreatorPackId;
  creatorName: string;
  license: 'CC0 1.0 Public Domain' | 'CC-BY 4.0 Open Source' | 'Unverified local preset';
  category: MarketBlockCategory;
  tags: string[];
  downloadsCount?: number;
  rating?: number;
  description: string;
}

export interface CommandMacroLoop {
  id: string;
  name: string;
  description: string;
  commands: string[]; // Sequence of WorldEdit CLI commands e.g. ["//set cobble_brick", "//shift 1 up", "//walls oak_plank"]
  iterations: number; // 1..16 repeat count per trigger
  intervalMs: number; // 0 = instant batch, or 250..2000ms animated step loop
  iconColor: string;
}

export type ActionBarSlotType = 'block' | 'tool' | 'command' | 'macro_loop';

export interface ActionBarSlotItem {
  id: string;
  type: ActionBarSlotType;
  targetId: string; // blockDefId, ToolMode, raw '//command', or macroLoop.id
  label?: string;
  hotkeyHint?: string;
}

export type ActionBarLayoutStyle = 'row' | 'column' | 'grid_2x' | 'grid_3x';

export interface ModularActionBar {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  isMostUsedAutoBar?: boolean; // Automatically populated from most-used block/tool telemetry
  layout: ActionBarLayoutStyle;
  scale: number; // 0.75 .. 1.35 independent bar scale
  opacity: number; // 0.5 .. 1.0
  position: { xPercent: number; yPercent: number }; // Viewport percentage coordinates (clamped 2..94%) so resizing window never loses a bar
  slots: (ActionBarSlotItem | null)[];
}

export interface ModularHudConfig {
  masterHudEditMode: boolean; // WoW / ElvUI style Unlock & Move All Bars mode
  snapToGridPercent: number; // 0 = free, 2 = 2% snap grid
  showKeybindLabels: boolean;
  showTooltips: boolean;
  bars: ModularActionBar[];
  macros: CommandMacroLoop[];
  usageCounts: Record<string, number>; // Tracks blockDefId and tool/command usage count for "Most Used" bar & Market sorting
}

export type WorldResetTemplateId =
  | 'starter_skyblock'
  | 'citadel_plaza'
  | 'timber_homestead'
  | 'cyber_grid'
  | 'empty_void';

export interface SavedStudioProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  blockCount: number;
  unlockedChunksCount: number;
  blocks: Record<string, PlacedBlock>;
  customBlocks: CustomBlockDefinition[];
  chunkConfig: WorldChunkConfig;
  /** Versioned payload is validated at the document boundary before opening. */
  completeDocument?: unknown;
}
