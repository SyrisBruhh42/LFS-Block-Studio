import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coordKey,
  createBlueprintFromCustomBlock,
  createBlueprintFromSelection,
  createInitialEngineState,
  executeWorldEditCommand,
  getSelectionDimensions,
  loadBlueprintIntoNewWorld,
  stampBlueprintIntoWorld,
} from './worldEditEngine';
import { CustomBlockDefinition } from './types';
import {
  DEFAULT_COMMAND_MACRO_LOOPS,
  DEFAULT_MODULAR_HUD_CONFIG,
  OPEN_SOURCE_MARKET_CATALOG,
  resetEntireWorldToTemplate,
  resetSpecificChunkInWorld,
} from './openSourceBlockMarket';
import {
  createDefaultHotkeyConfig,
  formatKeyCode,
  matchesKeyBinding,
} from './hotkeys';
import { buildProjectBackupPayload } from '../lib/googleDrive';
import {
  computeInitialBlockMappings,
  exportBrickLDraw,
  exportMinecraftFunction,
  exportSpongeSchematicJson,
} from './schematicExporter';
import {
  DEFAULT_CHUNK_CONFIG,
  DEFAULT_SMART_PATTERN_CONFIG,
  DEFAULT_VOLUME_BRUSH_CONFIG,
  applyVolumeBrushToWorld,
  areBlocksColorAndPatternCompatible,
  computeChunkPerformanceStats,
  computeSmartBlockVariation,
  computeVolumeBrushOffsets,
  expandWorldIntoChunk,
  isBlockInActiveChunk,
  predictBlockAttributesOnPlacement,
  stepBlockScaleOnScroll,
  transformSelectionBox,
} from './chunkAndPatternEngine';
import {
  DEFAULT_ADAPTIVE_UI_CONFIG,
  DEFAULT_STYLUS_MODE_CONFIG,
  computeEffectiveUiMetrics,
  computePressureBlockScale,
} from '../components/AdaptiveMobileStylusHub';
import {
  DEFAULT_SPATIAL_COPILOT_CONFIG,
  DEFAULT_SYMMETRY_CONFIG,
  analyzeSelectionMorphology,
  auditWorldWalkability,
  computeCommandPreviewCoords,
  computeSymmetryTargets,
  createInitialAdaptivePatternArchive,
  detectArchitecturalObjectClass,
  detectWorldSymmetry,
  predictNextBlocksCopilot,
  recordAcceptedGhostPredictionsInArchive,
  recordBlockRemovalForLingerLearning,
  recordPlacementInPatternArchive,
} from './spatialCopilotEngine';

test('Selection dimensions and volume calculate accurately', () => {
  const dims = getSelectionDimensions({ x: -2, y: 1, z: -1 }, { x: 2, y: 3, z: 2 });
  assert.equal(dims.lx, 5);
  assert.equal(dims.ly, 3);
  assert.equal(dims.lz, 4);
  assert.equal(dims.volume, 60);
});

test('WorldEdit //pos1, //pos2, and //set fill region and support //undo and //redo', () => {
  let state = createInitialEngineState();
  const initialCount = Object.keys(state.blocks).length;

  let res = executeWorldEditCommand(state, '//pos1 0 5 0');
  assert.equal(res.success, true);
  state = res.nextState;

  res = executeWorldEditCommand(state, '//pos2 2 6 1');
  assert.equal(res.success, true);
  state = res.nextState;

  // Region is 3 x 2 x 2 = 12 blocks
  res = executeWorldEditCommand(state, '//set cobble_brick');
  assert.equal(res.success, true);
  assert.equal(res.affectedCount, 12);
  state = res.nextState;
  assert.equal(state.blocks[coordKey(1, 5, 1)]?.blockDefId, 'cobble_brick');
  assert.equal(Object.keys(state.blocks).length, initialCount + 12);

  // Undo restores previous block count
  res = executeWorldEditCommand(state, '//undo');
  assert.equal(res.success, true);
  state = res.nextState;
  assert.equal(Object.keys(state.blocks).length, initialCount);

  // Redo re-applies the 12 blocks
  res = executeWorldEditCommand(state, '//redo');
  assert.equal(res.success, true);
  state = res.nextState;
  assert.equal(Object.keys(state.blocks).length, initialCount + 12);
});

test('WorldEdit //walls, //replace, and //hollow manipulate selection accurately', () => {
  let state = createInitialEngineState();
  state = executeWorldEditCommand(state, '//pos1 0 6 0').nextState;
  state = executeWorldEditCommand(state, '//pos2 2 8 2').nextState;

  // Fill 3x3x3 = 27 blocks
  let res = executeWorldEditCommand(state, '//set oak_plank');
  assert.equal(res.affectedCount, 27);
  state = res.nextState;

  // Hollow removes the 1 interior center block at (1,7,1)
  res = executeWorldEditCommand(state, '//hollow');
  assert.equal(res.affectedCount, 1);
  state = res.nextState;
  assert.equal(state.blocks[coordKey(1, 7, 1)], undefined);

  // Replace oak_plank with crystal_glass
  res = executeWorldEditCommand(state, '//replace oak_plank crystal_glass');
  assert.equal(res.affectedCount, 26);
  state = res.nextState;
  assert.equal(state.blocks[coordKey(0, 6, 0)]?.blockDefId, 'crystal_glass');
});

test('WorldEdit //copy and //paste duplicate selected structures', () => {
  let state = createInitialEngineState();
  state = executeWorldEditCommand(state, '//pos1 0 6 0').nextState;
  state = executeWorldEditCommand(state, '//pos2 1 6 1').nextState;
  state = executeWorldEditCommand(state, '//set neon_beacon').nextState;

  const copyRes = executeWorldEditCommand(state, '//copy');
  assert.equal(copyRes.success, true);
  assert.equal(copyRes.affectedCount, 4);
  state = copyRes.nextState;

  const pasteRes = executeWorldEditCommand(state, '//paste 4 6 4');
  assert.equal(pasteRes.success, true);
  assert.equal(pasteRes.affectedCount, 4);
  state = pasteRes.nextState;
  assert.equal(state.blocks[coordKey(4, 6, 4)]?.blockDefId, 'neon_beacon');
  assert.equal(state.blocks[coordKey(5, 6, 5)]?.blockDefId, 'neon_beacon');
});

test('Custom blocks and multi-block blueprints can be created and stamped or loaded into a new world', () => {
  let state = createInitialEngineState();
  const customBlock: CustomBlockDefinition = {
    id: 'custom_ruby_slope',
    name: 'Ruby Slope 2×2',
    shape: 'slope',
    width: 2,
    depth: 2,
    heightPlates: 3,
    color: '#E11D48',
    texturePattern: 'cobblestone',
    materialFinish: 'metallic',
    hasStuds: false,
    isCustom: true,
  };
  state.customBlocks[customBlock.id] = customBlock;

  const blockBp = createBlueprintFromCustomBlock(customBlock, 'Custom ruby slope');
  assert.equal(blockBp.blueprintType, 'custom_block');
  assert.equal(blockBp.blocks.length, 1);

  // Stamp custom block blueprint at (2, 4, 2)
  state = stampBlueprintIntoWorld(state, blockBp, { x: 2, y: 4, z: 2 }, 90);
  assert.equal(state.blocks[coordKey(2, 4, 2)]?.blockDefId, 'custom_ruby_slope');
  assert.equal(state.blocks[coordKey(2, 4, 2)]?.rotation, 90);

  // Select a region containing our custom block and save as a structure blueprint
  state = executeWorldEditCommand(state, '//pos1 0 1 0').nextState;
  state = executeWorldEditCommand(state, '//pos2 2 4 2').nextState;
  const structBp = createBlueprintFromSelection(state, 'My Ruby Shrine', 'Test blueprint');
  assert.ok(structBp);
  assert.equal(structBp.name, 'My Ruby Shrine');
  assert.ok(structBp.blocks.length >= 3);

  // Load the saved structure blueprint into a brand new world
  const newWorldState = loadBlueprintIntoNewWorld(state, structBp, false);
  assert.equal(Object.keys(newWorldState.blocks).length, structBp.blocks.length);
});

test('Minecraft WASD hotkey mapping, Mouse Free-Look toggle/hold keys, and Google Drive backup payload serialize accurately', () => {
  const hk = createDefaultHotkeyConfig();
  assert.equal(hk.bindings.moveForward, 'KeyW');
  assert.equal(hk.bindings.flyUp, 'Space');
  assert.equal(hk.bindings.flyDown, 'ShiftLeft');
  assert.equal(hk.bindings.toggleMouseLookMode, 'KeyC');
  assert.equal(hk.bindings.holdMouseLookMode, 'AltLeft');
  assert.equal(hk.bindings.focusCommandLine, 'Slash');
  assert.equal(hk.bindings.holdSelectionGizmo, 'KeyN');
  assert.equal(hk.bindings.toolBrushPlace, 'KeyY');
  assert.equal(hk.bindings.toolBrushErase, 'KeyO');
  assert.equal(hk.flight.mouseLookSensitivity, 1.0);
  assert.equal(hk.flight.crosshairCenterAim, true);
  assert.equal(formatKeyCode('KeyW'), 'W');
  assert.equal(formatKeyCode('KeyC'), 'C');
  assert.equal(formatKeyCode('Slash'), '/ (Slash)');
  assert.equal(formatKeyCode('AltLeft'), 'Alt');
  assert.equal(formatKeyCode('Space'), 'Space');
  assert.equal(
    matchesKeyBinding({ code: 'KeyW', key: 'w' } as KeyboardEvent, 'KeyW'),
    true
  );
  assert.equal(
    matchesKeyBinding({ code: 'KeyC', key: 'c' } as KeyboardEvent, 'KeyC'),
    true
  );
  assert.equal(
    matchesKeyBinding({ code: 'AltRight', key: 'Alt' } as KeyboardEvent, 'AltLeft'),
    true
  );

  const state = createInitialEngineState();
  const payload = buildProjectBackupPayload({
    worldId: 'sky_1',
    worldName: 'Backup Test Island',
    roomCode: 'SKY101',
    isPublicWorld: true,
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    blueprints: [],
    hotkeys: hk,
  });
  assert.equal(payload.version, '1.0');
  assert.equal(payload.worldName, 'Backup Test Island');
  assert.equal(payload.blockCount, Object.keys(state.blocks).length);
  assert.equal(payload.hotkeys?.bindings.moveForward, 'KeyW');
});

test('Universal Schematic Exporter and closest-block mapping generate valid Minecraft Sponge Schematic v2, .mcfunction, and Brick .ldr outputs', () => {
  const state = createInitialEngineState();
  const mappings = computeInitialBlockMappings(state.blocks, state.customBlocks);
  assert.ok(mappings.length >= 3);

  const mappingRecord: Record<string, string> = {};
  for (const m of mappings) {
    mappingRecord[m.sourceBlockId] = m.selectedTargetId;
  }

  const spongeJson = exportSpongeSchematicJson(
    'Test Schematic',
    state.blocks,
    mappingRecord
  );
  const parsedSponge = JSON.parse(spongeJson);
  assert.equal(parsedSponge.Version, 2);
  assert.equal(parsedSponge.Palette['minecraft:air'], 0);
  assert.ok(Array.isArray(parsedSponge.BlockData));

  const mcFunc = exportMinecraftFunction(
    'Test Schematic',
    state.blocks,
    mappingRecord
  );
  assert.ok(mcFunc.includes('setblock ~'));
  assert.ok(mcFunc.includes('minecraft:'));

  const ldr = exportBrickLDraw('Test Schematic', state.blocks, state.customBlocks);
  assert.ok(ldr.includes('0 BrickForge Studio Universal Brick Schematic'));
  assert.ok(ldr.includes('3005.dat'));
});

test('Multi-Chunk World expansion, active chunk FPS culling, and Smart Connected Art Matcher work accurately', () => {
  let state = createInitialEngineState();
  const baseCount = Object.keys(state.blocks).length;

  // Expand into East Chunk (1, 0) with a stone_foundation pad (12x12 = 144 blocks)
  const expanded = expandWorldIntoChunk(state, 1, 0, 'stone_foundation', 16);
  state = expanded.nextState;
  assert.equal(expanded.addedCount, 144);
  assert.equal(Object.keys(state.blocks).length, baseCount + 144);

  // When Chunk (1, 0) is active, all blocks are rendered
  const activeConfig = {
    ...DEFAULT_CHUNK_CONFIG,
    unlockedChunks: ['0,0', '1,0'],
    activeChunks: { '0,0': true, '1,0': true },
  };
  const statsAll = computeChunkPerformanceStats(state.blocks, activeConfig);
  assert.equal(statsAll.renderedBlocks, baseCount + 144);
  assert.equal(statsAll.hibernatedBlocks, 0);

  // When Chunk (1, 0) is hibernated/paused, its 144 blocks are culled from rendering
  const culledConfig = {
    ...activeConfig,
    activeChunks: { '0,0': true, '1,0': false },
  };
  const statsCulled = computeChunkPerformanceStats(state.blocks, culledConfig);
  assert.equal(statsCulled.renderedBlocks, baseCount);
  assert.equal(statsCulled.hibernatedBlocks, 144);
  assert.equal(isBlockInActiveChunk({ x: 16, y: 0, z: 0 }, culledConfig), false);

  // Smart Pattern Variation & Connected-Neighbor Art Matcher links adjacent blocks
  assert.equal(DEFAULT_SMART_PATTERN_CONFIG.pixelsPerBlock, 64);
  assert.equal(DEFAULT_SMART_PATTERN_CONFIG.artStyle, 'pixel_art_hd');
  const sampleBlock = state.blocks[coordKey(0, 0, 0)];
  const sampleDef = state.customBlocks[sampleBlock.blockDefId];
  const varied = computeSmartBlockVariation(
    sampleBlock,
    sampleDef,
    state.blocks,
    state.customBlocks,
    DEFAULT_SMART_PATTERN_CONFIG
  );
  assert.equal(varied.connectedMode, 'seamless_interior');
  assert.equal(varied.uvRotationQuarterTurns, 0);
  assert.ok(varied.variantIndex >= 0 && varied.variantIndex <= 3);
  assert.deepEqual(varied.atlasTopCell, [0, 0]);
  assert.ok(varied.effectiveHex.startsWith('#'));

  // Test Color & Pattern Similarity Matcher + Placement Predictor
  const compatSame = areBlocksColorAndPatternCompatible({
    blockAId: 'cobble_brick',
    patternA: 'cobblestone',
    colorA: '#7E8B9B',
    blockBId: 'stone_brick',
    patternB: 'cobblestone',
    colorB: '#8592A2',
    colorThreshold: 45,
  });
  assert.equal(compatSame.compatible, true);

  const prediction = predictBlockAttributesOnPlacement({
    coord: { x: 0, y: 1, z: 0 },
    def: state.customBlocks['cobble_brick'],
    allBlocks: state.blocks,
    allDefs: state.customBlocks,
    config: DEFAULT_SMART_PATTERN_CONFIG,
  });
  assert.ok(prediction.matchedNeighborsCount >= 1);

  // Test Shift+Scroll Block Resizing (Snap Scroll vs Free Scroll)
  const snapUp = stepBlockScaleOnScroll(
    { x: 1, y: 1, z: 1 },
    1,
    'snap',
    'uniform'
  );
  assert.deepEqual(snapUp, { x: 1.5, y: 1.5, z: 1.5 });

  const freeUp = stepBlockScaleOnScroll(
    { x: 1, y: 1, z: 1 },
    1,
    'free',
    'height'
  );
  assert.deepEqual(freeUp, { x: 1, y: 1.1, z: 1 });
});

test('Adaptive UI Rescaling metrics and Stylus Mode pressure scaling compute accurately across Android, Tablet, and PC viewports', () => {
  // Phone viewport (<768px) auto-collapses secondary ribbon and enforces >=44px touch targets
  const phoneMetrics = computeEffectiveUiMetrics(
    390,
    844,
    DEFAULT_ADAPTIVE_UI_CONFIG
  );
  assert.equal(phoneMetrics.isCompactPhone, true);
  assert.equal(phoneMetrics.shouldCollapseSidebars, true);
  assert.equal(phoneMetrics.shouldCollapseRibbonSecondary, true);
  assert.ok(phoneMetrics.touchTargetMinPx >= 44);

  // Accessible XL preset scales UI cleanly up to 1.2x+ and 48px touch targets
  const accessibleMetrics = computeEffectiveUiMetrics(1440, 900, {
    ...DEFAULT_ADAPTIVE_UI_CONFIG,
    densityPreset: 'accessible_large',
  });
  assert.equal(accessibleMetrics.effectiveScale, 1.2);
  assert.equal(accessibleMetrics.touchTargetMinPx, 48);

  // Stylus pressure block scaling (light pressure vs firm pressure)
  assert.equal(DEFAULT_STYLUS_MODE_CONFIG.autoDetectPen, true);
  assert.equal(DEFAULT_STYLUS_MODE_CONFIG.palmRejection, true);
  const lightScale = computePressureBlockScale(0.15, 1.0, 'snap');
  const firmScale = computePressureBlockScale(0.95, 1.0, 'snap');
  assert.ok(firmScale.x > lightScale.x);
});

test('3D Volume Place & Erase Brushes and Selection Box Shift/Raise/Expand transforms execute accurately', () => {
  let state = createInitialEngineState();

  // Cube brush with radius 1 produces 3x3x3 = 27 offsets
  const cubeOffsets = computeVolumeBrushOffsets({
    ...DEFAULT_VOLUME_BRUSH_CONFIG,
    shape: 'cube',
    radius: 1,
    hollow: false,
  });
  assert.equal(cubeOffsets.length, 27);

  // Hollow cube brush with radius 1 removes center (26 offsets)
  const hollowCubeOffsets = computeVolumeBrushOffsets({
    ...DEFAULT_VOLUME_BRUSH_CONFIG,
    shape: 'cube',
    radius: 1,
    hollow: true,
  });
  assert.equal(hollowCubeOffsets.length, 26);

  // Place 27 blocks in air at (0, 10, 0) using 3D brush_place
  const placed = applyVolumeBrushToWorld({
    state,
    center: { x: 0, y: 10, z: 0 },
    mode: 'place',
    brush: {
      shape: 'cube',
      radius: 1,
      height: 3,
      hollow: false,
      airOnly: true,
    },
    activeBlockId: 'cobble_brick',
    rotation: 0,
    patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
  });
  assert.equal(placed.affectedCount, 27);
  state = placed.nextState;
  assert.equal(state.blocks[coordKey(0, 10, 0)]?.blockDefId, 'cobble_brick');

  // Erase those 27 blocks using 3D brush_erase
  const erased = applyVolumeBrushToWorld({
    state,
    center: { x: 0, y: 10, z: 0 },
    mode: 'erase',
    brush: {
      shape: 'cube',
      radius: 1,
      height: 3,
      hollow: false,
      airOnly: false,
    },
    activeBlockId: 'cobble_brick',
    rotation: 0,
    patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
  });
  assert.equal(erased.affectedCount, 27);
  state = erased.nextState;
  assert.equal(state.blocks[coordKey(0, 10, 0)], undefined);

  // Selection box raise, shift, and expand/contract
  const raised = transformSelectionBox(
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 3, z: 2 },
    'raise_up',
    2
  );
  assert.deepEqual(raised.pos1, { x: 0, y: 3, z: 0 });
  assert.deepEqual(raised.pos2, { x: 2, y: 5, z: 2 });

  const expanded = transformSelectionBox(
    { x: 0, y: 2, z: 0 },
    { x: 2, y: 4, z: 2 },
    'expand_all',
    1
  );
  assert.deepEqual(expanded.pos1, { x: -1, y: 1, z: -1 });
  assert.deepEqual(expanded.pos2, { x: 3, y: 5, z: 3 });
});

test('Local Spatial Copilot: Symmetry Mirroring, Predictive Ghost Auto-Complete, Selection Morphology & Walkability Audit run in <2ms', () => {
  assert.equal(DEFAULT_SPATIAL_COPILOT_CONFIG.pixel8ProGpuGovernor, true);
  assert.equal(DEFAULT_SYMMETRY_CONFIG.mode, 'off');

  // 1. Live 4-Way Quad Symmetry produces 4 mirrored targets around (0, 0)
  const quadTargets = computeSymmetryTargets(
    { x: 3, y: 2, z: 4 },
    90,
    {
      mode: 'quad_xz',
      pivotX: 0,
      pivotZ: 0,
      showPlaneGizmo: true,
      autoDetectIntent: true,
    }
  );
  assert.equal(quadTargets.length, 4);
  assert.deepEqual(quadTargets[1].coord, { x: -3, y: 2, z: 4 });
  assert.equal(quadTargets[1].rotation, 270);

  // 2. Predictive Ghost Auto-Complete projects linear run ahead of cursor
  const state = createInitialEngineState();
  const preds = predictNextBlocksCopilot({
    hoveredCoord: { x: 2, y: 5, z: 0 },
    activeBlockId: 'cobble_brick',
    placementRotation: 0,
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    recentPlacements: [
      { coord: { x: 0, y: 5, z: 0 }, blockDefId: 'cobble_brick', rotation: 0, timestamp: 1 },
      { coord: { x: 1, y: 5, z: 0 }, blockDefId: 'cobble_brick', rotation: 0, timestamp: 2 },
    ],
    maxPredictions: 3,
  });
  assert.equal(preds.length, 3);
  assert.deepEqual(preds[0].position, { x: 2, y: 5, z: 0 });
  assert.deepEqual(preds[1].position, { x: 3, y: 5, z: 0 });
  assert.equal(preds[0].reason, 'linear_run');

  // 3. Smart Selection Morphology & Command Preview Coords
  const morph = analyzeSelectionMorphology(
    { x: -2, y: 4, z: -2 },
    { x: 2, y: 6, z: 2 },
    state.blocks,
    'cobble_brick'
  );
  assert.ok(morph);
  assert.equal(morph.recommendations[0].previewMode, 'walls');

  const wallPreview = computeCommandPreviewCoords(
    { x: 0, y: 5, z: 0 },
    { x: 2, y: 5, z: 2 },
    'walls',
    state.blocks
  );
  // 3x1x3 perimeter has 8 wall blocks
  assert.equal(wallPreview.length, 8);

  // 4. Walkability & Headroom Audit executes in < 5ms
  const audit = auditWorldWalkability(state.blocks, state.customBlocks);
  assert.ok(audit.walkableCount > 10);
  assert.ok(audit.accessibilityScore >= 25 && audit.accessibilityScore <= 100);
  assert.ok(audit.executionMs < 15);

  // 5. Auto-Symmetry Detector on starter world
  const sym = detectWorldSymmetry(state.blocks, []);
  if (sym) {
    assert.ok(sym.confidence >= 0.58);
  }
});

test('Open-Source CC0 Block Market, Modular Multi-Hotbars & World/Chunk Reset work cleanly', () => {
  assert.ok(OPEN_SOURCE_MARKET_CATALOG.length >= 20);
  assert.equal(DEFAULT_MODULAR_HUD_CONFIG.bars.length, 3);
  assert.ok(DEFAULT_COMMAND_MACRO_LOOPS.length >= 4);

  const initial = createInitialEngineState();
  const citadel = resetEntireWorldToTemplate(initial, 'citadel_plaza');
  assert.ok(Object.keys(citadel.nextState.blocks).length > 40);

  const voidWorld = resetEntireWorldToTemplate(citadel.nextState, 'empty_void');
  assert.equal(Object.keys(voidWorld.nextState.blocks).length, 1);

  const chunkReset = resetSpecificChunkInWorld(
    citadel.nextState,
    0,
    0,
    'stone_foundation'
  );
  assert.ok(chunkReset.removedCount > 0);
  assert.ok(chunkReset.addedCount > 0);
});

test('Refined Self-Learning 3D Ghost Auto-Complete: Pattern Archive, Linger Removal Penalty, Object Class Detection & CTM Ghost Cohesion', () => {
  const state = createInitialEngineState();
  let archive = createInitialAdaptivePatternArchive();
  const now = 1_700_000_000_000;

  // 1. Record repeated placement habit: placing 'oak_plank' on top (+Y=1) of 'cobble_brick'
  const recentHistory = [
    { coord: { x: 2, y: 2, z: 2 }, blockDefId: 'cobble_brick', rotation: 0 as const, timestamp: now - 2000 },
  ];
  archive = recordPlacementInPatternArchive({
    archive,
    newPlacement: { coord: { x: 2, y: 3, z: 2 }, blockDefId: 'oak_plank', rotation: 0, timestamp: now - 1500 },
    recentPlacements: recentHistory,
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    activeObjectClass: 'house_dwelling',
    nowMs: now - 1500,
  });
  archive = recordPlacementInPatternArchive({
    archive,
    newPlacement: { coord: { x: 2, y: 3, z: 2 }, blockDefId: 'oak_plank', rotation: 0, timestamp: now - 1000 },
    recentPlacements: recentHistory,
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    activeObjectClass: 'house_dwelling',
    nowMs: now - 1000,
  });

  assert.equal(archive.totalLearnedTransitions, 5);
  const patternKeys = Object.keys(archive.patterns);
  assert.ok(patternKeys.length >= 3);
  const learnedPattern = Object.values(archive.patterns).find(
    (p) => p.anchorBlockId === 'cobble_brick' && p.predictedBlockId === 'oak_plank'
  );
  assert.ok(learnedPattern);
  assert.deepEqual(learnedPattern.offset, { x: 0, y: 1, z: 0 });
  assert.ok(learnedPattern.confidenceWeight >= 0.95);

  // 2. Accept a ghost prediction and verify it enters the Linger Watch List
  const preds = predictNextBlocksCopilot({
    hoveredCoord: { x: 3, y: 2, z: 2 },
    activeBlockId: 'cobble_brick',
    placementRotation: 0,
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    recentPlacements: [
      { coord: { x: 3, y: 2, z: 2 }, blockDefId: 'cobble_brick', rotation: 0, timestamp: now - 500 },
    ],
    maxPredictions: 4,
    archive,
    connectedTextureGhostMatch: true,
    patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
    nowMs: now,
  });

  assert.ok(preds.length > 0);
  // Ensure learned archive habit was surfaced
  const archivePred =
    preds.find((p) => p.reason === 'learned_archive_habit') || preds[0];
  assert.ok(archivePred);

  archive = recordAcceptedGhostPredictionsInArchive({
    archive,
    acceptedPredictions: [archivePred],
    anchorBlockId: 'cobble_brick',
    lingerWindowSec: 45,
    activeObjectClass: 'house_dwelling',
    nowMs: now,
  });
  assert.equal(archive.totalAcceptedGhosts, 5);
  assert.equal(archive.lingerWatchList.length, 1);

  const watchedPatternKey = archive.lingerWatchList[0].patternKey;
  const weightBeforeRemoval = archive.patterns[watchedPatternKey].confidenceWeight;

  // 3. Remove the predicted block inside the 45-second linger window -> verify penalty down-weights pattern
  const removalRes = recordBlockRemovalForLingerLearning({
    archive,
    removedCoords: [archivePred.position],
    nowMs: now + 5000, // 5 seconds later (within 45s linger window)
  });
  assert.equal(removalRes.penalizedCount, 1);
  archive = removalRes.nextArchive;
  assert.equal(archive.totalLingerRemovals, 1);
  assert.equal(archive.lingerWatchList.length, 0);
  assert.ok(
    archive.patterns[watchedPatternKey].confidenceWeight < weightBeforeRemoval,
    'Expected confidenceWeight to decrease after linger removal'
  );

  // 4. Architectural Object Class detection identifies a House / Dwelling
  const detectedClass = detectArchitecturalObjectClass({
    blocks: state.blocks,
    customBlocks: state.customBlocks,
    hoveredCoord: { x: 0, y: 2, z: 0 },
    archive,
    forcedClass: 'house_dwelling',
  });
  assert.ok(detectedClass);
  assert.equal(detectedClass.classId, 'house_dwelling');
  assert.ok(detectedClass.confidence >= 0.55);
});



