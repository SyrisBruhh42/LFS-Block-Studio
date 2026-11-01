import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AdaptiveUiConfig,
  BlockScale3D,
  BlueprintPrefab,
  CollaboratorPresence,
  CopilotPredictedBlock,
  CustomBlockDefinition,
  DetectedArchitecturalObjectClass,
  DetectedSymmetryCandidate,
  DynamicLightingConfig,
  GridCoord,
  PlacedBlock,
  ScrollResizeAxis,
  ScrollResizeMode,
  SelectionCommandRecommendation,
  SmartPatternVariationConfig,
  SpatialCopilotConfig,
  StylusModeConfig,
  SymmetryConfig,
  ToolMode,
  VolumeBrushConfig,
  VolumeBrushShape,
  WalkabilityAuditReport,
  WorldChunkConfig,
} from '../engine/types';
import {
  HotkeyConfig,
  formatKeyCode,
  matchesKeyBinding,
} from '../engine/hotkeys';
import {
  buildBlockMeshGroup,
  disposeUnsharedGroupGeometries,
} from '../engine/legoGeometry';
import { getSelectionBounds, rotateRelativeCoord } from '../engine/worldEditEngine';
import {
  DEFAULT_VOLUME_BRUSH_CONFIG,
  computeSmartBlockVariation,
  computeVolumeBrushOffsets,
  getChunkWorldBounds,
  isBlockInActiveChunk,
  parseChunkKey,
} from '../engine/chunkAndPatternEngine';
import {
  DEFAULT_STYLUS_MODE_CONFIG,
  computePressureBlockScale,
} from './AdaptiveMobileStylusHub';
import { DraggableHudOverlay } from './DraggableWindow';
import { STUDIO_DRAG_MIME, parseStudioDragPayload } from '../engine/windowLayoutEngine';

export type CameraViewPreset = 'isometric' | 'top' | 'front' | 'free';

export interface ViewportRenderTelemetry {
  geometries: number;
  textures: number;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  isMounted: boolean;
  steepDropOverlayCount: number;
  steepDropPulseOpacity: number;
}

let activeViewportBridge: {
  getRenderer: () => THREE.WebGLRenderer | null;
  getScene: () => THREE.Scene | null;
  getCamera: () => THREE.PerspectiveCamera | null;
  rebuildPlacedBlocks: () => void;
  renderNow: () => void;
  getSteepDropTelemetry: () => { count: number; pulseOpacity: number };
} | null = null;

export function getViewportRenderTelemetry(): ViewportRenderTelemetry {
  const renderer = activeViewportBridge?.getRenderer();
  const steepDrop = activeViewportBridge?.getSteepDropTelemetry() ?? {
    count: 0,
    pulseOpacity: 0,
  };
  if (!renderer) {
    return {
      geometries: 0,
      textures: 0,
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      isMounted: false,
      steepDropOverlayCount: steepDrop.count,
      steepDropPulseOpacity: steepDrop.pulseOpacity,
    };
  }
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    points: renderer.info.render.points,
    lines: renderer.info.render.lines,
    isMounted: true,
    steepDropOverlayCount: steepDrop.count,
    steepDropPulseOpacity: steepDrop.pulseOpacity,
  };
}

export function runLiveViewportGpuRebuildStressTest(iterations = 50): {
  iterations: number;
  geometriesBefore: number;
  geometriesAfter: number;
  deltaGeometries: number;
  passed: boolean;
  durationMs: number;
} {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const bridge = activeViewportBridge;
  const renderer = bridge?.getRenderer();
  if (!bridge || !renderer) {
    return {
      iterations,
      geometriesBefore: 0,
      geometriesAfter: 0,
      deltaGeometries: 0,
      passed: true,
      durationMs: 0,
    };
  }
  bridge.rebuildPlacedBlocks();
  const geometriesBefore = renderer.info.memory.geometries;
  for (let i = 0; i < iterations; i++) {
    bridge.rebuildPlacedBlocks();
  }
  bridge.renderNow();
  const geometriesAfter = renderer.info.memory.geometries;
  const deltaGeometries = geometriesAfter - geometriesBefore;
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    iterations,
    geometriesBefore,
    geometriesAfter,
    deltaGeometries,
    passed: Math.abs(deltaGeometries) <= 4,
    durationMs: Number((t1 - t0).toFixed(2)),
  };
}

/**
 * Captures the live 3D WebGL viewport canvas (forcing an immediate synchronous render first so
 * the drawing buffer is populated) and overlays visible HUD/window bounding boxes for Gemini Vision diagnostics.
 */
export function captureViewportDiagnosticFrame(): string | null {
  if (typeof document === 'undefined') return null;
  const bridge = activeViewportBridge;
  const renderer = bridge?.getRenderer();
  if (bridge && renderer) {
    bridge.renderNow();
  }

  const webglCanvas =
    renderer?.domElement ||
    (document.querySelector('canvas') as HTMLCanvasElement | null);
  const w = Math.max(640, Math.min(1440, window.innerWidth || 1280));
  const h = Math.max(400, Math.min(900, window.innerHeight || 720));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0B0F19';
  ctx.fillRect(0, 0, w, h);

  if (webglCanvas) {
    try {
      const rect = webglCanvas.getBoundingClientRect();
      ctx.drawImage(
        webglCanvas,
        rect.left || 0,
        rect.top || 0,
        rect.width || w,
        rect.height || h
      );
    } catch {
      // Fallback if WebGL canvas taint or context lost
    }
  }

  // Draw lightweight wireframe HUD diagnostic outlines of visible studio panels/bars so Gemini Vision sees exact layout geometry
  const uiNodes = document.querySelectorAll(
    'header, aside, [data-window-id], [data-hud-bar-id]'
  );
  uiNodes.forEach((node) => {
    const el = node as HTMLElement;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    // Skip the auditor modal itself if open
    if (el.getAttribute('data-window-id') === 'self_testing_auditor_window') {
      return;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(r.left, r.top, r.width, r.height);
    ctx.strokeRect(r.left, r.top, r.width, r.height);

    const label =
      el.getAttribute('aria-label') ||
      el.getAttribute('data-window-id') ||
      el.getAttribute('data-hud-bar-id') ||
      el.tagName.toLowerCase();
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.fillText(label.slice(0, 42), r.left + 8, r.top + 16);
    ctx.restore();
  });

  return outCanvas.toDataURL('image/png');
}

interface SkyblockViewportProps {
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  activeBlockId: string;
  activeBlueprint: BlueprintPrefab | null;
  toolMode: ToolMode;
  placementRotation: 0 | 90 | 180 | 270;
  pos1: GridCoord | null;
  pos2: GridCoord | null;
  showGrid: boolean;
  daylightMode: boolean;
  lightingConfig?: DynamicLightingConfig;
  chunkConfig?: WorldChunkConfig;
  patternConfig?: SmartPatternVariationConfig;
  cameraPreset: CameraViewPreset;
  collaborators: CollaboratorPresence[];
  hotkeyConfig: HotkeyConfig;
  flyMode: boolean;
  onToggleFlyMode: () => void;
  freeLookActive: boolean;
  isHoldingFreeLook: boolean;
  onToggleMouseLookMode: () => void;
  activeBlockScale?: BlockScale3D;
  scrollResizeMode?: ScrollResizeMode;
  scrollResizeAxis?: ScrollResizeAxis;
  onScrollResizeBlock?: (direction: 1 | -1) => void;
  onChangeScrollResizeMode?: (mode: ScrollResizeMode) => void;
  onChangeScrollResizeAxis?: (axis: ScrollResizeAxis) => void;
  onResetBlockScale?: () => void;
  onSetBlockScaleDirect?: (scale: BlockScale3D) => void;
  stylusConfig?: StylusModeConfig;
  onToggleStylusMode?: () => void;
  onStylusTelemetryChange?: (
    pointerType: 'mouse' | 'pen' | 'touch',
    pressure: number,
    autoActivatedPen?: boolean
  ) => void;
  uiConfig?: AdaptiveUiConfig;
  isViewportPanningOrDrawing?: boolean;
  onPanningOrDrawingChange?: (active: boolean) => void;
  onOpenAdaptiveSettings?: () => void;
  volumeBrush?: VolumeBrushConfig;
  onChangeVolumeBrush?: (next: VolumeBrushConfig) => void;
  onApplyVolumeBrushAt?: (
    coord: GridCoord,
    mode: 'brush_place' | 'brush_erase'
  ) => void;
  isSelectionGizmoActive?: boolean;
  onToggleSelectionGizmoLock?: () => void;
  onScrollResizeSelection?: (direction: 1 | -1, includeY: boolean) => void;
  symmetryConfig?: SymmetryConfig;
  onChangeSymmetryConfig?: (next: SymmetryConfig) => void;
  detectedSymmetry?: DetectedSymmetryCandidate | null;
  copilotConfig?: SpatialCopilotConfig;
  onChangeCopilotConfig?: (next: SpatialCopilotConfig) => void;
  copilotPredictions?: CopilotPredictedBlock[];
  onAcceptCopilotPredictions?: () => void;
  selectionRecommendations?: SelectionCommandRecommendation[];
  commandPreviewCoords?: GridCoord[];
  activeCommandPreviewMode?: 'set' | 'walls' | 'hollow' | 'stack_up' | 'clear' | null;
  onHoverCommandPreviewMode?: (
    mode: 'set' | 'walls' | 'hollow' | 'stack_up' | 'clear' | null
  ) => void;
  onRunRecommendedCommand?: (cmd: string) => void;
  walkabilityReport?: WalkabilityAuditReport | null;
  detectedObjectClass?: DetectedArchitecturalObjectClass | null;
  lastLingerPenaltyToast?: string | null;
  onCursorMove: (coord: GridCoord) => void;
  onPlaceBlockAt: (coord: GridCoord) => void;
  onEraseBlockAt: (coord: GridCoord) => void;
  onPaintBlockAt: (coord: GridCoord) => void;
  onPickBlockAt: (coord: GridCoord) => void;
  onStampBlueprintAt: (coord: GridCoord) => void;
  onSetPos1: (coord: GridCoord) => void;
  onSetPos2: (coord: GridCoord) => void;
  onNudgeSelectionFace: (face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z', delta: number) => void;
  onCameraPresetHandled: () => void;
  turntableEnabled?: boolean;
  snapshotTriggerCount?: number;
  worldName?: string;
  onSelectBlockId?: (id: string) => void;
  onSelectToolMode?: (mode: ToolMode) => void;
  onClearSelection?: () => void;
  isLeftToolboxOpen?: boolean;
  onOpenLeftToolbox?: () => void;
  isRightInspectorOpen?: boolean;
  onOpenRightInspector?: () => void;
}

export const SkyblockViewport: React.FC<SkyblockViewportProps> = ({
  blocks,
  customBlocks,
  activeBlockId,
  activeBlueprint,
  toolMode,
  placementRotation,
  pos1,
  pos2,
  showGrid,
  daylightMode,
  lightingConfig,
  chunkConfig,
  patternConfig,
  cameraPreset,
  collaborators,
  hotkeyConfig,
  flyMode,
  onToggleFlyMode,
  freeLookActive,
  isHoldingFreeLook,
  onToggleMouseLookMode,
  activeBlockScale = { x: 1, y: 1, z: 1 },
  scrollResizeMode = 'snap',
  scrollResizeAxis = 'uniform',
  onScrollResizeBlock,
  onChangeScrollResizeMode,
  onChangeScrollResizeAxis,
  onResetBlockScale,
  onSetBlockScaleDirect,
  stylusConfig = DEFAULT_STYLUS_MODE_CONFIG,
  onToggleStylusMode,
  onStylusTelemetryChange,
  uiConfig,
  isViewportPanningOrDrawing = false,
  onPanningOrDrawingChange,
  onOpenAdaptiveSettings,
  volumeBrush = DEFAULT_VOLUME_BRUSH_CONFIG,
  onChangeVolumeBrush,
  onApplyVolumeBrushAt,
  isSelectionGizmoActive = false,
  onToggleSelectionGizmoLock,
  onScrollResizeSelection,
  symmetryConfig,
  onChangeSymmetryConfig,
  detectedSymmetry,
  copilotConfig,
  onChangeCopilotConfig,
  copilotPredictions = [],
  onAcceptCopilotPredictions,
  selectionRecommendations = [],
  commandPreviewCoords = [],
  activeCommandPreviewMode = null,
  onHoverCommandPreviewMode,
  onRunRecommendedCommand,
  walkabilityReport = null,
  detectedObjectClass = null,
  lastLingerPenaltyToast = null,
  onCursorMove,
  onPlaceBlockAt,
  onEraseBlockAt,
  onPaintBlockAt,
  onPickBlockAt,
  onStampBlueprintAt,
  onSetPos1,
  onSetPos2,
  onNudgeSelectionFace,
  onCameraPresetHandled,
  turntableEnabled = false,
  snapshotTriggerCount = 0,
  worldName = 'lfs_block_studio',
  onSelectBlockId,
  onSelectToolMode,
  onClearSelection,
  isLeftToolboxOpen = true,
  onOpenLeftToolbox,
  isRightInspectorOpen = true,
  onOpenRightInspector,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const isSoftwareGlRef = useRef<boolean>(false);
  const [webglContextLost, setWebglContextLost] = useState<boolean>(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const prevBlocksMapRef = useRef<Record<string, PlacedBlock>>({});
  const spawnBurstRef = useRef<
    (pos: GridCoord, hexColor: string) => void
  >(() => {});

  // Store latest props and callbacks in refs so WebGL canvas is initialized once
  const propsRef = useRef({
    blocks,
    customBlocks,
    activeBlockId,
    activeBlueprint,
    toolMode,
    placementRotation,
    pos1,
    pos2,
    showGrid,
    daylightMode,
    lightingConfig,
    chunkConfig,
    patternConfig,
    collaborators,
    hotkeyConfig,
    flyMode,
    onToggleFlyMode,
    freeLookActive,
    isHoldingFreeLook,
    onToggleMouseLookMode,
    activeBlockScale,
    scrollResizeMode,
    scrollResizeAxis,
    onScrollResizeBlock,
    onSetBlockScaleDirect,
    stylusConfig,
    onStylusTelemetryChange,
    onPanningOrDrawingChange,
    volumeBrush,
    onChangeVolumeBrush,
    onApplyVolumeBrushAt,
    isSelectionGizmoActive,
    onScrollResizeSelection,
    symmetryConfig,
    copilotConfig,
    copilotPredictions,
    commandPreviewCoords,
    activeCommandPreviewMode,
    walkabilityReport,
    onCursorMove,
    onPlaceBlockAt,
    onEraseBlockAt,
    onPaintBlockAt,
    onPickBlockAt,
    onStampBlueprintAt,
    onSetPos1,
    onSetPos2,
    onNudgeSelectionFace,
  });
  propsRef.current = {
    blocks,
    customBlocks,
    activeBlockId,
    activeBlueprint,
    toolMode,
    placementRotation,
    pos1,
    pos2,
    showGrid,
    daylightMode,
    lightingConfig,
    chunkConfig,
    patternConfig,
    collaborators,
    hotkeyConfig,
    flyMode,
    onToggleFlyMode,
    freeLookActive,
    isHoldingFreeLook,
    onToggleMouseLookMode,
    activeBlockScale,
    scrollResizeMode,
    scrollResizeAxis,
    onScrollResizeBlock,
    onSetBlockScaleDirect,
    stylusConfig,
    onStylusTelemetryChange,
    onPanningOrDrawingChange,
    volumeBrush,
    onChangeVolumeBrush,
    onApplyVolumeBrushAt,
    isSelectionGizmoActive,
    onScrollResizeSelection,
    symmetryConfig,
    copilotConfig,
    copilotPredictions,
    commandPreviewCoords,
    activeCommandPreviewMode,
    walkabilityReport,
    onCursorMove,
    onPlaceBlockAt,
    onEraseBlockAt,
    onPaintBlockAt,
    onPickBlockAt,
    onStampBlueprintAt,
    onSetPos1,
    onSetPos2,
    onNudgeSelectionFace,
  };

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hemiLight: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    blocksGroup: THREE.Group;
    chunkGridsGroup: THREE.Group;
    ghostGroup: THREE.Group;
    selectionGroup: THREE.Group;
    copilotGroup: THREE.Group;
    collaboratorsGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    groundPlane: THREE.Mesh;
    gizmoHandles: THREE.Object3D[];
    interactables: THREE.Object3D[];
    hoveredCoord: GridCoord;
    wandNextCorner: 1 | 2;
    maxAnisotropy: number;
    yaw: number;
    pitch: number;
    orbitDist: number;
    syncYawPitchFromCamera: () => void;
    updateCenterCrosshairAim: () => void;
  } | null>(null);

  // Rebuild placed blocks when blocks or customBlocks change
  const rebuildPlacedBlocks = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    disposeUnsharedGroupGeometries(ctx.blocksGroup);
    while (ctx.blocksGroup.children.length > 0) {
      ctx.blocksGroup.remove(ctx.blocksGroup.children[0]);
    }
    ctx.interactables.length = 0;

    const {
      blocks: curBlocks,
      customBlocks: curDefs,
      lightingConfig: lCfg,
      chunkConfig: cCfg,
      patternConfig: pCfg,
    } = propsRef.current;
    let pointLightCount = 0;
    const allowPointLights = lCfg ? lCfg.pointLightsEnabled : true;
    for (const blk of Object.values(curBlocks)) {
      // Multi-Chunk Culling: skip building/rendering blocks inside hibernated or distance-culled chunks
      if (!isBlockInActiveChunk(blk.position, cCfg, ctx.hoveredCoord)) {
        continue;
      }

      const def = curDefs[blk.blockDefId];
      if (!def) continue;

      // Smart Pattern Variation & Connected-Neighbor Art Matcher
      const variation = computeSmartBlockVariation(
        blk,
        def,
        curBlocks,
        curDefs,
        pCfg
      );

      const meshGroup = buildBlockMeshGroup({
        def,
        colorOverride: variation.effectiveHex,
        textureOverride: blk.textureOverride,
        materialOverride: blk.materialOverride,
        customScale: blk.customScale,
        isSoftwareGl: isSoftwareGlRef.current,
        maxAnisotropy: ctx.maxAnisotropy,
        connectedMode: variation.connectedMode,
        connectedMask: variation.connectedMask,
        uvRotationQuarterTurns: variation.uvRotationQuarterTurns,
        roughnessDelta: variation.roughnessDelta,
        variantIndex: variation.variantIndex,
        pixelsPerBlock: pCfg?.pixelsPerBlock || 64,
        artStyle: pCfg?.artStyle || 'pixel_art_hd',
        atlasTopCell: variation.atlasTopCell,
        atlasSideCell: variation.atlasSideCell,
        megaSpritemapMode: pCfg?.megaSpritemapMode !== false,
      });

      meshGroup.position.set(blk.position.x, blk.position.y, blk.position.z);
      meshGroup.rotation.y = THREE.MathUtils.degToRad(blk.rotation);
      meshGroup.userData = {
        isPlacedBlock: true,
        gridCoord: { ...blk.position },
        blockId: blk.id,
      };

      // Invisible simplified proxy hitbox scaled to match customScale
      const sx = blk.customScale?.x ?? def.defaultScale?.x ?? 1;
      const sy = blk.customScale?.y ?? def.defaultScale?.y ?? 1;
      const sz = blk.customScale?.z ?? def.defaultScale?.z ?? 1;
      const w = Math.max(0.2, def.width * sx);
      const d = Math.max(0.2, def.depth * sz);
      const h = Math.max(0.15, (def.heightPlates / 3) * sy);
      const blockUserData = {
        isPlacedBlock: true,
        gridCoord: { ...blk.position },
        blockId: blk.id,
        blockHeight: Math.max(1, Math.round(h)),
      };
      meshGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData = { ...blockUserData };
          ctx.interactables.push(child);
        }
      });
      const hitGeo = new THREE.BoxGeometry(w, h, d);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set((w - 1) * 0.5, h * 0.5, (d - 1) * 0.5);
      hitMesh.userData = { ...blockUserData, isDisposableMaterial: true };
      meshGroup.add(hitMesh);
      ctx.interactables.push(hitMesh);

      // Attach dynamic PointLight to emissive / lantern blocks (up to 8 active lights)
      const finish = blk.materialOverride || def.materialFinish;
      if (
        allowPointLights &&
        pointLightCount < 8 &&
        (finish === 'neon' ||
          def.id === 'voxel_lantern' ||
          def.id === 'neon_beacon')
      ) {
        const lightColor = blk.colorOverride || def.color || '#F59E0B';
        const ptLight = new THREE.PointLight(lightColor, 2.2, 7.5, 1.5);
        ptLight.position.set(0, h + 0.35, 0);
        meshGroup.add(ptLight);
        pointLightCount++;
      }

      ctx.blocksGroup.add(meshGroup);
    }

    // Detect newly added or removed blocks to trigger spring scale-in or voxel debris burst (skip when >15 blocks change at once like world load)
    const prevMap = prevBlocksMapRef.current;
    const prevKeys = Object.keys(prevMap);
    const curKeys = Object.keys(curBlocks);
    const diffCount = Math.abs(curKeys.length - prevKeys.length);
    if (prevKeys.length > 0 && diffCount > 0 && diffCount <= 12) {
      for (const k of prevKeys) {
        if (!curBlocks[k]) {
          const oldBlk = prevMap[k];
          const oldDef = curDefs[oldBlk.blockDefId];
          spawnBurstRef.current(
            oldBlk.position,
            oldBlk.colorOverride || oldDef?.color || '#94A3B8'
          );
        }
      }
    }
    prevBlocksMapRef.current = { ...curBlocks };

    requestRenderRef.current();
  };

  // Rebuild 3D Chunk Grids & Active/Hibernated Chunk Boundary Wireframes
  const rebuildChunkGrids = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    disposeUnsharedGroupGeometries(ctx.chunkGridsGroup);
    while (ctx.chunkGridsGroup.children.length > 0) {
      ctx.chunkGridsGroup.remove(ctx.chunkGridsGroup.children[0]);
    }

    const { chunkConfig: cCfg, showGrid: sGrid } = propsRef.current;
    if (!sGrid) {
      requestRenderRef.current();
      return;
    }

    const size = cCfg?.chunkSize || 16;
    const chunkH = cCfg?.chunkHeight || 16;
    const cellStep = cCfg?.cellSubdivision || 1;
    const gridDivisions = Math.max(2, Math.min(128, Math.round(size / cellStep)));
    const unlocked = cCfg?.unlockedChunks?.length
      ? cCfg.unlockedChunks
      : ['0,0'];

    for (const key of unlocked) {
      const { cx, cz } = parseChunkKey(key);
      const bounds = getChunkWorldBounds(cx, cz, size);
      const isActive = cCfg ? cCfg.activeChunks[key] !== false : true;

      const chunkGrid = new THREE.GridHelper(
        size,
        gridDivisions,
        isActive ? 0x38bdf8 : 0xf59e0b,
        isActive ? 0x334155 : 0x451a03
      );
      chunkGrid.position.set(bounds.centerX, 0.01, bounds.centerZ);
      ctx.chunkGridsGroup.add(chunkGrid);

      if (cCfg?.showChunkBorders) {
        const borderGeo = new THREE.BoxGeometry(size, chunkH, size);
        const borderEdges = new THREE.EdgesGeometry(borderGeo);
        const borderLine = new THREE.LineSegments(
          borderEdges,
          new THREE.LineBasicMaterial({
            color: isActive ? 0x0ea5e9 : 0xf59e0b,
            transparent: true,
            opacity: isActive ? 0.28 : 0.55,
          })
        );
        borderLine.position.set(bounds.centerX, chunkH * 0.5, bounds.centerZ);
        ctx.chunkGridsGroup.add(borderLine);
      }
    }

    requestRenderRef.current();
  };

  // Rebuild ghost preview mesh when active block, blueprint, rotation, volumeBrush, or tool changes
  const rebuildGhostMesh = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    disposeUnsharedGroupGeometries(ctx.ghostGroup);
    while (ctx.ghostGroup.children.length > 0) {
      ctx.ghostGroup.remove(ctx.ghostGroup.children[0]);
    }

    const {
      toolMode: mode,
      activeBlockId: actId,
      customBlocks: defs,
      activeBlueprint: bp,
      placementRotation: rot,
      activeBlockScale: actScale,
      volumeBrush: vBrush,
    } = propsRef.current;

    if (mode === 'place') {
      const def = defs[actId];
      if (def) {
        const ghost = buildBlockMeshGroup({
          def,
          customScale: actScale,
          isSoftwareGl: true,
          maxAnisotropy: ctx.maxAnisotropy,
          ghostOpacity: 0.52,
        });
        ghost.rotation.y = THREE.MathUtils.degToRad(rot);
        ctx.ghostGroup.add(ghost);
      }
    } else if (mode === 'brush_place' || mode === 'brush_erase') {
      const brushCfg = vBrush || DEFAULT_VOLUME_BRUSH_CONFIG;
      const isErase = mode === 'brush_erase';
      const primaryColor = isErase ? 0xf43f5e : 0x22d3ee;
      const r = Math.max(0, Math.min(8, Math.round(brushCfg.radius)));
      const span = r * 2 + 1;

      // Outer 3D Brush Envelope Wireframe
      let envGeo: THREE.BufferGeometry;
      if (brushCfg.shape === 'sphere') {
        envGeo = new THREE.SphereGeometry(r + 0.52, 16, 12);
      } else if (brushCfg.shape === 'cylinder') {
        const cylH = Math.max(1, brushCfg.height || span);
        envGeo = new THREE.CylinderGeometry(r + 0.52, r + 0.52, cylH, 16);
      } else if (brushCfg.shape === 'diamond') {
        envGeo = new THREE.OctahedronGeometry(r + 0.65, 0);
      } else {
        envGeo = new THREE.BoxGeometry(span + 0.08, span + 0.08, span + 0.08);
      }
      const envEdges = new THREE.EdgesGeometry(envGeo);
      const envWire = new THREE.LineSegments(
        envEdges,
        new THREE.LineBasicMaterial({
          color: primaryColor,
          transparent: true,
          opacity: 0.9,
        })
      );
      const envYOffset =
        brushCfg.shape === 'cylinder'
          ? Math.max(1, brushCfg.height || span) * 0.5
          : 0.5;
      envWire.position.set(0, envYOffset, 0);
      ctx.ghostGroup.add(envWire);

      // Translucent volume tint inside the 3D brush
      const envFill = new THREE.Mesh(
        envGeo,
        new THREE.MeshBasicMaterial({
          color: primaryColor,
          transparent: true,
          opacity: isErase ? 0.14 : 0.12,
          depthWrite: false,
        })
      );
      envFill.position.set(0, envYOffset, 0);
      ctx.ghostGroup.add(envFill);

      // Center anchor block marker
      const centerGeo = new THREE.BoxGeometry(1.04, 1.04, 1.04);
      const centerWire = new THREE.LineSegments(
        new THREE.EdgesGeometry(centerGeo),
        new THREE.LineBasicMaterial({ color: 0xf59e0b })
      );
      centerWire.position.set(0, 0.5, 0);
      ctx.ghostGroup.add(centerWire);
    } else if (mode === 'stamp_blueprint' && bp) {
      for (const blk of bp.blocks) {
        const def = defs[blk.blockDefId] || bp.customBlockDefs.find((d) => d.id === blk.blockDefId);
        if (!def) continue;
        const part = buildBlockMeshGroup({
          def,
          isSoftwareGl: true,
          maxAnisotropy: ctx.maxAnisotropy,
          ghostOpacity: 0.48,
        });
        const relPos = rotateRelativeCoord(blk.position, rot);
        part.position.set(relPos.x, relPos.y, relPos.z);
        part.rotation.y = THREE.MathUtils.degToRad((blk.rotation + rot) % 360);
        ctx.ghostGroup.add(part);
      }
    } else {
      // Wireframe cursor box for erase / paint / pick / wand_select
      const boxGeo = new THREE.BoxGeometry(1.04, 1.04, 1.04);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const color =
        mode === 'erase'
          ? 0xf43f5e
          : mode === 'wand_select'
            ? 0x06b6d4
            : 0xf59e0b;
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color })
      );
      line.position.set(0, 0.5, 0);
      ctx.ghostGroup.add(line);
    }

    ctx.ghostGroup.position.set(
      ctx.hoveredCoord.x,
      ctx.hoveredCoord.y,
      ctx.hoveredCoord.z
    );
    requestRenderRef.current();
  };

  // Rebuild WorldEdit Pos1/Pos2 selection box & 6 face gizmo handles
  // Face gizmo nodes stay unobtrusive/pass-through unless isSelectionGizmoActive is true!
  const rebuildSelectionGizmos = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    disposeUnsharedGroupGeometries(ctx.selectionGroup);
    while (ctx.selectionGroup.children.length > 0) {
      ctx.selectionGroup.remove(ctx.selectionGroup.children[0]);
    }
    ctx.gizmoHandles.length = 0;

    const {
      pos1: p1,
      pos2: p2,
      toolMode: curToolMode,
      isSelectionGizmoActive: gizmoUnlocked,
      activeCommandPreviewMode: cmdPreviewMode,
    } = propsRef.current;

    const showFullWandGizmos =
      curToolMode === 'wand_select' ||
      gizmoUnlocked ||
      Boolean(cmdPreviewMode);

    if (p1 && showFullWandGizmos) {
      const p1Geo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
      const p1Edges = new THREE.EdgesGeometry(p1Geo);
      const p1Marker = new THREE.LineSegments(
        p1Edges,
        new THREE.LineBasicMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.85,
        })
      );
      p1Marker.position.set(p1.x, p1.y + 0.5, p1.z);
      ctx.selectionGroup.add(p1Marker);
    }

    if (p2 && showFullWandGizmos) {
      const p2Geo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
      const p2Edges = new THREE.EdgesGeometry(p2Geo);
      const p2Marker = new THREE.LineSegments(
        p2Edges,
        new THREE.LineBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.85,
        })
      );
      p2Marker.position.set(p2.x, p2.y + 0.5, p2.z);
      ctx.selectionGroup.add(p2Marker);
    }

    if (p1 && p2) {
      const b = getSelectionBounds(p1, p2);
      const lx = b.maxX - b.minX + 1;
      const ly = b.maxY - b.minY + 1;
      const lz = b.maxZ - b.minZ + 1;
      const cx = (b.minX + b.maxX) * 0.5;
      const cy = (b.minY + b.maxY) * 0.5 + 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;

      // Bounding box wireframe — subtle & unobtrusive when in normal Place/Erase mode
      const boxGeo = new THREE.BoxGeometry(lx + 0.08, ly + 0.08, lz + 0.08);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const wireframe = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: gizmoUnlocked ? 0xf59e0b : 0x38bdf8,
          transparent: true,
          opacity: showFullWandGizmos ? 0.85 : 0.28,
        })
      );
      wireframe.position.set(cx, cy, cz);
      ctx.selectionGroup.add(wireframe);

      if (showFullWandGizmos) {
        // Translucent tint volume only when in Wand mode or holding Gizmo modifier
        const fillMat = new THREE.MeshBasicMaterial({
          color: gizmoUnlocked ? 0xf59e0b : 0x06b6d4,
          transparent: true,
          opacity: gizmoUnlocked ? 0.1 : 0.05,
          depthWrite: false,
        });
        const fillMesh = new THREE.Mesh(boxGeo, fillMat);
        fillMesh.position.set(cx, cy, cz);
        ctx.selectionGroup.add(fillMesh);

        // 6 3D face handle gizmos (+X, -X, +Y, -Y, +Z, -Z)
        const handleDefs: {
          face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
          pos: [number, number, number];
          color: number;
        }[] = [
          { face: '+x', pos: [b.maxX + 0.85, cy, cz], color: 0xf43f5e },
          { face: '-x', pos: [b.minX - 0.85, cy, cz], color: 0xf43f5e },
          { face: '+y', pos: [cx, b.maxY + 1.35, cz], color: 0x22c55e },
          { face: '-y', pos: [cx, b.minY - 0.35, cz], color: 0x22c55e },
          { face: '+z', pos: [cx, cy, b.maxZ + 0.85], color: 0x3b82f6 },
          { face: '-z', pos: [cx, cy, b.minZ - 0.85], color: 0x3b82f6 },
        ];

        const handleGeo = new THREE.OctahedronGeometry(
          gizmoUnlocked ? 0.3 : 0.18,
          0
        );
        for (const h of handleDefs) {
          const hMat = new THREE.MeshStandardMaterial({
            color: h.color,
            emissive: h.color,
            emissiveIntensity: gizmoUnlocked ? 0.65 : 0.2,
            roughness: 0.2,
            transparent: true,
            opacity: gizmoUnlocked ? 0.95 : 0.45,
          });
          const hMesh = new THREE.Mesh(handleGeo, hMat);
          hMesh.position.set(h.pos[0], h.pos[1], h.pos[2]);
          hMesh.userData = {
            isGizmoHandle: true,
            face: h.face,
          };
          ctx.selectionGroup.add(hMesh);
          ctx.gizmoHandles.push(hMesh);
        }
      }
    }

    requestRenderRef.current();
  };

  // Rebuild collaborator 3D cursors
  const rebuildCollaborators = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    disposeUnsharedGroupGeometries(ctx.collaboratorsGroup);
    while (ctx.collaboratorsGroup.children.length > 0) {
      ctx.collaboratorsGroup.remove(ctx.collaboratorsGroup.children[0]);
    }

    for (const col of propsRef.current.collaborators) {
      const cursorGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
      const edges = new THREE.EdgesGeometry(cursorGeo);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: col.color || '#f59e0b' })
      );
      line.position.set(col.cursorX, col.cursorY + 0.5, col.cursorZ);
      ctx.collaboratorsGroup.add(line);
    }

    requestRenderRef.current();
  };

  // Shared zero-GC geometries & materials for Spatial Copilot ghosts, symmetry planes, and steep-drop safety grids
  const sharedCopilotGeoRef = useRef<{
    boxGeo: THREE.BoxGeometry;
    boxEdges: THREE.EdgesGeometry;
    planeGeo: THREE.PlaneGeometry;
    planeEdges: THREE.EdgesGeometry;
    markerGeo: THREE.OctahedronGeometry;
    steepDropTileGeo: THREE.PlaneGeometry;
    steepDropGridGeo: THREE.BufferGeometry;
  } | null>(null);

  const steepDropPulseMatsRef = useRef<{
    fillMat: THREE.MeshBasicMaterial;
    gridMat: THREE.LineBasicMaterial;
  } | null>(null);
  const activeSteepDropCountRef = useRef<number>(0);

  const getSteepDropPulseMaterials = () => {
    if (!steepDropPulseMatsRef.current) {
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const gridMat = new THREE.LineBasicMaterial({
        color: 0xf87171,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      steepDropPulseMatsRef.current = { fillMat, gridMat };
    }
    return steepDropPulseMatsRef.current;
  };

  const getSharedCopilotGeometries = () => {
    if (!sharedCopilotGeoRef.current) {
      const boxGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
      const boxEdges = new THREE.EdgesGeometry(boxGeo);
      const planeGeo = new THREE.PlaneGeometry(36, 18);
      const planeEdges = new THREE.EdgesGeometry(planeGeo);
      const markerGeo = new THREE.OctahedronGeometry(0.28, 0);

      // 0.92x0.92 horizontal safety tile + 2x2 internal grid cross for steepDropCoords
      const steepDropTileGeo = new THREE.PlaneGeometry(0.92, 0.92);
      steepDropTileGeo.rotateX(-Math.PI / 2);

      const h = 0.46;
      const gridVertices = new Float32Array([
        // Outer square perimeter
        -h, 0, -h,  h, 0, -h,
         h, 0, -h,  h, 0,  h,
         h, 0,  h, -h, 0,  h,
        -h, 0,  h, -h, 0, -h,
        // Inner 2x2 sub-grid cross lines
        -h, 0,  0,  h, 0,  0,
         0, 0, -h,  0, 0,  h,
      ]);
      const steepDropGridGeo = new THREE.BufferGeometry();
      steepDropGridGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(gridVertices, 3)
      );

      sharedCopilotGeoRef.current = {
        boxGeo,
        boxEdges,
        planeGeo,
        planeEdges,
        markerGeo,
        steepDropTileGeo,
        steepDropGridGeo,
      };
    }
    return sharedCopilotGeoRef.current;
  };

  // Rebuild 3D Spatial Copilot overlays: Symmetry Laser Planes, Ghost Auto-Complete, Command Preview, & Walkability
  const rebuildCopilotOverlays = () => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    const shared = getSharedCopilotGeometries();
    const sharedSet = new Set<THREE.BufferGeometry>([
      shared.boxGeo,
      shared.boxEdges,
      shared.planeGeo,
      shared.planeEdges,
      shared.markerGeo,
      shared.steepDropTileGeo,
      shared.steepDropGridGeo,
    ]);
    disposeUnsharedGroupGeometries(ctx.copilotGroup, sharedSet);
    while (ctx.copilotGroup.children.length > 0) {
      ctx.copilotGroup.remove(ctx.copilotGroup.children[0]);
    }

    const {
      symmetryConfig: sym,
      copilotConfig: copCfg,
      copilotPredictions: preds,
      commandPreviewCoords: cmdCoords,
      activeCommandPreviewMode: cmdMode,
      walkabilityReport: walkRep,
    } = propsRef.current;

    // 1. Render Active 3D Symmetry Mirror Laser Plane(s)
    if (sym && sym.mode !== 'off' && sym.showPlaneGizmo) {
      if (sym.mode === 'mirror_x' || sym.mode === 'quad_xz') {
        const xPlaneMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const xPlane = new THREE.Mesh(shared.planeGeo, xPlaneMat);
        xPlane.rotation.y = Math.PI / 2;
        xPlane.position.set(sym.pivotX, 6, sym.pivotZ);
        ctx.copilotGroup.add(xPlane);

        const xBorder = new THREE.LineSegments(
          shared.planeEdges,
          new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.65,
          })
        );
        xBorder.rotation.y = Math.PI / 2;
        xBorder.position.set(sym.pivotX, 6, sym.pivotZ);
        ctx.copilotGroup.add(xBorder);
      }

      if (sym.mode === 'mirror_z' || sym.mode === 'quad_xz') {
        const zPlaneMat = new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const zPlane = new THREE.Mesh(shared.planeGeo, zPlaneMat);
        zPlane.position.set(sym.pivotX, 6, sym.pivotZ);
        ctx.copilotGroup.add(zPlane);

        const zBorder = new THREE.LineSegments(
          shared.planeEdges,
          new THREE.LineBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.65,
          })
        );
        zBorder.position.set(sym.pivotX, 6, sym.pivotZ);
        ctx.copilotGroup.add(zBorder);
      }
    }

    if (copCfg && !copCfg.enabled) {
      requestRenderRef.current();
      return;
    }

    // 2. Render Copilot Predictive Ghost Auto-Complete Blocks (Press Tab to accept)
    if (
      (!copCfg || copCfg.ghostAutoCompleteEnabled) &&
      preds &&
      preds.length > 0
    ) {
      const ghostWireMat = new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.9,
      });
      const ghostFillMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });

      for (const p of preds) {
        const wire = new THREE.LineSegments(shared.boxEdges, ghostWireMat);
        wire.position.set(p.position.x, p.position.y + 0.5, p.position.z);
        ctx.copilotGroup.add(wire);

        const fill = new THREE.Mesh(shared.boxGeo, ghostFillMat);
        fill.position.set(p.position.x, p.position.y + 0.5, p.position.z);
        ctx.copilotGroup.add(fill);
      }
    }

    // 3. Render Non-Destructive WorldEdit Selection Command Preview Ghosts
    if (
      (!copCfg || copCfg.selectionCommandGhostPreview) &&
      cmdCoords &&
      cmdCoords.length > 0 &&
      cmdMode
    ) {
      const isSubtractive = cmdMode === 'hollow' || cmdMode === 'clear';
      const previewColor = isSubtractive ? 0xf43f5e : 0xf59e0b;
      const cmdWireMat = new THREE.LineBasicMaterial({
        color: previewColor,
        transparent: true,
        opacity: 0.85,
      });
      const cmdFillMat = new THREE.MeshBasicMaterial({
        color: previewColor,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });

      for (const c of cmdCoords) {
        const wire = new THREE.LineSegments(shared.boxEdges, cmdWireMat);
        wire.position.set(c.x, c.y + 0.5, c.z);
        ctx.copilotGroup.add(wire);

        const fill = new THREE.Mesh(shared.boxGeo, cmdFillMat);
        fill.position.set(c.x, c.y + 0.5, c.z);
        ctx.copilotGroup.add(fill);
      }
    }

    // 4. Render Walkability Audit Overlays (Steep Drop Red Grid Pulse, Headroom Pinch Points & Unlit Interior Spots)
    if ((!copCfg || copCfg.showWalkabilityOverlays !== false) && walkRep) {
      const pinchMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.85,
      });
      for (const c of walkRep.headroomConflictCoords) {
        const m = new THREE.Mesh(shared.markerGeo, pinchMat);
        m.position.set(c.x, c.y + 0.5, c.z);
        ctx.copilotGroup.add(m);
      }

      const darkMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.8,
      });
      for (const c of walkRep.darkInteriorCoords) {
        const m = new THREE.Mesh(shared.markerGeo, darkMat);
        m.position.set(c.x, c.y + 0.5, c.z);
        ctx.copilotGroup.add(m);
      }

      // Faint red pulsing grid overlay on steepDropCoords (>= 3 block ledge drop)
      if (walkRep.steepDropCoords && walkRep.steepDropCoords.length > 0) {
        const { fillMat, gridMat } = getSteepDropPulseMaterials();
        const currentBlocks = propsRef.current.blocks;
        const currentCustom = propsRef.current.customBlocks;

        for (const c of walkRep.steepDropCoords) {
          const blk = currentBlocks[`${c.x},${c.y},${c.z}`];
          let blockHeight = 1.0;
          if (blk) {
            const def = currentCustom[blk.blockDefId];
            if (def) {
              const sy = blk.customScale?.y ?? def.defaultScale?.y ?? 1;
              blockHeight = Math.max(0.15, (def.heightPlates / 3) * sy);
            }
          }
          const topY = c.y + blockHeight + 0.018;

          const tileMesh = new THREE.Mesh(shared.steepDropTileGeo, fillMat);
          tileMesh.position.set(c.x, topY, c.z);
          tileMesh.userData = { isSteepDropOverlay: true, coord: c };
          ctx.copilotGroup.add(tileMesh);

          const gridLines = new THREE.LineSegments(
            shared.steepDropGridGeo,
            gridMat
          );
          gridLines.position.set(c.x, topY + 0.002, c.z);
          gridLines.userData = { isSteepDropOverlay: true, coord: c };
          ctx.copilotGroup.add(gridLines);
        }
        activeSteepDropCountRef.current = walkRep.steepDropCoords.length;
      } else {
        activeSteepDropCountRef.current = 0;
      }
    } else {
      activeSteepDropCountRef.current = 0;
    }

    requestRenderRef.current();
  };

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    isSoftwareGlRef.current = isSoftwareGl;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    // Pixel 8 Pro / High-DPI Mobile Frame-Budget Governor: cap DPR at 1.75 when governor is enabled
    const maxDpr =
      propsRef.current.copilotConfig?.pixel8ProGpuGovernor !== false ? 1.75 : 2;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = mount.clientWidth || window.innerWidth;
    const initH = mount.clientHeight || window.innerHeight;
    renderer.setSize(initW, initH);
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const skyHex = propsRef.current.daylightMode ? 0xdbeafe : 0x0b0f19;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(skyHex, 0.014);

    // 2. Studio PMREM Environment map on every device
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(48, initW / initH, 0.1, 250);
    camera.position.set(13, 12, 15);
    camera.lookAt(0, 1, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 65;
    controls.maxPolarAngle = Math.PI * 0.85;
    // Multi-touch 2-finger pinch-to-zoom & 2-finger pan gesture configuration
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // 3. Balanced 3-Point Studio & Skyblock Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
    keyLight.position.set(16, 26, 14);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 65;
    const d = 14;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-14, 10, -16);
    scene.add(rimLight);

    // Soft radial contact shadow plane beneath the floating Skyblock island
    const contactShadowGeo = new THREE.CircleGeometry(7.5, 32);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.position.set(0, -2.55, 0);
    scene.add(contactShadow);

    // Reference GridHelper at y = 0.01 (managed by chunkGridsGroup)
    const gridHelper = new THREE.GridHelper(16, 16, 0x38bdf8, 0x334155);
    gridHelper.visible = false;
    scene.add(gridHelper);

    // Expansive 160x160 invisible build plane at y = 0 for raycasting across multi-chunk builds
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ visible: false });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.position.set(0.5, 0, 0.5);
    groundPlane.userData = { isGroundPlane: true };
    scene.add(groundPlane);

    const blocksGroup = new THREE.Group();
    const chunkGridsGroup = new THREE.Group();
    const ghostGroup = new THREE.Group();
    const selectionGroup = new THREE.Group();
    const copilotGroup = new THREE.Group();
    const collaboratorsGroup = new THREE.Group();
    const debrisPoolGroup = new THREE.Group();
    scene.add(blocksGroup);
    scene.add(chunkGridsGroup);
    scene.add(ghostGroup);
    scene.add(selectionGroup);
    scene.add(copilotGroup);
    scene.add(collaboratorsGroup);
    scene.add(debrisPoolGroup);

    // Zero-GC Pooled Voxel Break Debris Particles (18 reusable micro-cubes)
    const DEBRIS_COUNT = 18;
    const sharedDebrisGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const debrisParticles: {
      mesh: THREE.Mesh;
      mat: THREE.MeshLambertMaterial;
      vel: THREE.Vector3;
      life: number;
    }[] = [];
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
      const mesh = new THREE.Mesh(sharedDebrisGeo, mat);
      mesh.visible = false;
      debrisPoolGroup.add(mesh);
      debrisParticles.push({
        mesh,
        mat,
        vel: new THREE.Vector3(),
        life: 0,
      });
    }
    let debrisAnimTimer = 0;

    function stepDebrisParticles() {
      debrisAnimTimer = 0;
      let anyAlive = false;
      for (const p of debrisParticles) {
        if (p.life <= 0) continue;
        p.life -= 0.08;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        anyAlive = true;
        p.vel.y -= 0.025;
        p.mesh.position.add(p.vel);
        p.mesh.rotation.x += 0.18;
        p.mesh.rotation.y += 0.22;
        const s = Math.max(0.1, p.life);
        p.mesh.scale.set(s, s, s);
      }
      requestRenderRef.current();
      if (anyAlive) {
        debrisAnimTimer = window.setTimeout(
          stepDebrisParticles,
          isSoftwareGl ? 60 : 24
        );
      }
    }

    spawnBurstRef.current = (pos: GridCoord, hexColor: string) => {
      if (isSoftwareGl) return;
      for (let i = 0; i < 8; i++) {
        const slot = debrisParticles[i % DEBRIS_COUNT];
        slot.mat.color.set(hexColor);
        slot.mesh.position.set(
          pos.x + (Math.random() - 0.5) * 0.4,
          pos.y + 0.5 + (Math.random() - 0.5) * 0.4,
          pos.z + (Math.random() - 0.5) * 0.4
        );
        slot.vel.set(
          (Math.random() - 0.5) * 0.14,
          0.08 + Math.random() * 0.1,
          (Math.random() - 0.5) * 0.14
        );
        slot.life = 1.0;
        slot.mesh.scale.set(1, 1, 1);
        slot.mesh.visible = true;
      }
      if (!debrisAnimTimer) {
        debrisAnimTimer = window.setTimeout(stepDebrisParticles, 20);
      }
    };

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const lookDirVec = new THREE.Vector3();

    function syncYawPitchFromCamera() {
      const ctx = sceneRefs.current;
      if (!ctx) return;
      ctx.camera.getWorldDirection(lookDirVec);
      ctx.pitch = Math.asin(THREE.MathUtils.clamp(lookDirVec.y, -0.985, 0.985));
      ctx.yaw = Math.atan2(-lookDirVec.x, -lookDirVec.z);
      const dist = ctx.camera.position.distanceTo(ctx.controls.target);
      ctx.orbitDist = THREE.MathUtils.clamp(dist || 14, 4, 45);
    }

    sceneRefs.current = {
      scene,
      camera,
      controls,
      hemiLight,
      keyLight,
      blocksGroup,
      chunkGridsGroup,
      ghostGroup,
      selectionGroup,
      copilotGroup,
      collaboratorsGroup,
      gridHelper,
      groundPlane,
      gizmoHandles: [],
      interactables: [],
      hoveredCoord: { x: 0, y: 1, z: 0 },
      wandNextCorner: 1,
      maxAnisotropy,
      yaw: 0,
      pitch: 0,
      orbitDist: 16,
      syncYawPitchFromCamera,
      updateCenterCrosshairAim: () => {},
    };
    syncYawPitchFromCamera();

    // 4. On-demand coalesced rendering with software-WebGL afterDraw fence
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      renderDirty = false;
      if (controls.enabled) {
        controls.update();
      }
      renderer.render(scene, camera);
      const done = () => {
        renderBusy = false;
        if (renderDirty) requestRender();
      };
      if (isSoftwareGl) afterDraw(done);
      else {
        frameId = requestAnimationFrame(done);
      }
    }

    requestRenderRef.current = requestRender;
    controls.addEventListener('change', requestRender);

    // Pre-allocated raycaster & pointer math (Zero-GC)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const downPixel = new THREE.Vector2();
    let downTimestamp = 0;
    let lastRaycastTime = 0;
    const lastFreeLookPointer = { x: 0, y: 0, active: false };

    function computeTargetCoordFromNdc(
      ndcX: number,
      ndcY: number,
      forModifyExisting: boolean,
      allowGizmoHit = false
    ): {
      coord: GridCoord | null;
      gizmoFace?: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
      gizmoWorldPos?: THREE.Vector3;
    } {
      const ctx = sceneRefs.current;
      if (!ctx) return { coord: null };

      pointerNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(pointerNdc, camera);

      // Only check 3D selection gizmo handles when the user is holding the Selection Gizmo modifier key
      // (or unlocked in HUD), so the nodes NEVER get in the way of normal building!
      if (
        (allowGizmoHit || propsRef.current.isSelectionGizmoActive) &&
        ctx.gizmoHandles.length > 0
      ) {
        const gizmoHits = raycaster.intersectObjects(ctx.gizmoHandles, false);
        if (gizmoHits.length > 0) {
          const hitObj = gizmoHits[0].object;
          const face = hitObj.userData.face;
          if (face) {
            return {
              coord: null,
              gizmoFace: face,
              gizmoWorldPos: hitObj.position.clone(),
            };
          }
        }
      }

      // 1. Always raycast against placed blocks FIRST so groundPlane at y=0 never blocks blocks at y < 0 or y = 0!
      const blockHits = raycaster.intersectObjects(ctx.interactables, false);
      if (blockHits.length > 0) {
        const hit = blockHits[0];
        const obj = hit.object;
        if (obj.userData.isPlacedBlock && obj.userData.gridCoord) {
          const baseCoord: GridCoord = obj.userData.gridCoord;
          if (forModifyExisting) {
            return { coord: { ...baseCoord } };
          }
          const normal = hit.face?.normal
            ? hit.face.normal.clone().transformDirection(obj.matrixWorld)
            : new THREE.Vector3(0, 1, 0);
          const stepX = Math.round(normal.x);
          const stepY = Math.round(normal.y);
          const stepZ = Math.round(normal.z);
          const blockH = obj.userData.blockHeight || 1;
          return {
            coord: {
              x: baseCoord.x + stepX,
              y: baseCoord.y + (stepY > 0 ? blockH : stepY),
              z: baseCoord.z + stepZ,
            },
          };
        }
      }

      // 2. Fallback to groundPlane ONLY when placing/hovering in open air (never when erasing/painting/picking existing blocks)
      if (!forModifyExisting) {
        const groundHits = raycaster.intersectObject(ctx.groundPlane, false);
        if (groundHits.length > 0) {
          const gHit = groundHits[0];
          const gx = Math.round(gHit.point.x);
          const gz = Math.round(gHit.point.z);
          return { coord: { x: gx, y: 0, z: gz } };
        }
      }

      return { coord: null };
    }

    function computeTargetCoord(
      clientX: number,
      clientY: number,
      forModifyExisting: boolean,
      allowGizmoHit = false
    ): {
      coord: GridCoord | null;
      gizmoFace?: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
      gizmoWorldPos?: THREE.Vector3;
    } {
      const { freeLookActive: isFreeLook, hotkeyConfig: hk } = propsRef.current;
      // In Free-Look Fly Builder mode with Crosshair Aim enabled, aim directly from screen center (0, 0)
      if (isFreeLook && hk.flight.crosshairCenterAim !== false) {
        return computeTargetCoordFromNdc(0, 0, forModifyExisting, allowGizmoHit);
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { coord: null };
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      return computeTargetCoordFromNdc(ndcX, ndcY, forModifyExisting, allowGizmoHit);
    }

    function updateCenterCrosshairAim() {
      const ctx = sceneRefs.current;
      if (!ctx) return;
      const mode = propsRef.current.toolMode;
      const modifyExisting =
        mode === 'erase' ||
        mode === 'brush_erase' ||
        mode === 'paint' ||
        mode === 'pick' ||
        mode === 'wand_select';
      const { coord } = computeTargetCoordFromNdc(0, 0, modifyExisting);
      if (coord) {
        if (
          coord.x !== ctx.hoveredCoord.x ||
          coord.y !== ctx.hoveredCoord.y ||
          coord.z !== ctx.hoveredCoord.z
        ) {
          ctx.hoveredCoord = coord;
          ctx.ghostGroup.position.set(coord.x, coord.y, coord.z);
          propsRef.current.onCursorMove(coord);
        }
      }
    }

    if (sceneRefs.current) {
      sceneRefs.current.updateCenterCrosshairAim = updateCenterCrosshairAim;
    }

    let lastPenTimestamp = 0;
    let isStylusStrokeActive = false;
    let lastStrokeCoordKey = '';
    let isPanningCamera = false;

    // 3D Selection Gizmo Node Drag State (Hold modifier key + drag node to stretch/shrink selection face)
    let activeGizmoDrag: {
      face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
      startClientX: number;
      startClientY: number;
      screenAxisX: number;
      screenAxisY: number;
      pixelsPerBlock: number;
      appliedSteps: number;
    } | null = null;

    function beginGizmoFaceDrag(
      face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z',
      worldOrigin: THREE.Vector3,
      clientX: number,
      clientY: number
    ) {
      const rect = renderer.domElement.getBoundingClientRect();
      const axisVec = new THREE.Vector3(
        face === '+x' ? 1 : face === '-x' ? -1 : 0,
        face === '+y' ? 1 : face === '-y' ? -1 : 0,
        face === '+z' ? 1 : face === '-z' ? -1 : 0
      );
      const p0 = worldOrigin.clone().project(camera);
      const p1 = worldOrigin.clone().add(axisVec).project(camera);

      const sx0 = ((p0.x + 1) * 0.5) * rect.width;
      const sy0 = ((-p0.y + 1) * 0.5) * rect.height;
      const sx1 = ((p1.x + 1) * 0.5) * rect.width;
      const sy1 = ((-p1.y + 1) * 0.5) * rect.height;

      const dx = sx1 - sx0;
      const dy = sy1 - sy0;
      const distPx = Math.max(12, Math.hypot(dx, dy));

      activeGizmoDrag = {
        face,
        startClientX: clientX,
        startClientY: clientY,
        screenAxisX: dx / distPx,
        screenAxisY: dy / distPx,
        pixelsPerBlock: distPx,
        appliedSteps: 0,
      };
      controls.enabled = false;
    }

    function executeStylusStrokeActionAt(
      coord: GridCoord,
      e: PointerEvent,
      sCfg: StylusModeConfig
    ) {
      const cKey = `${coord.x},${coord.y},${coord.z}`;
      if (cKey === lastStrokeCoordKey) return;
      lastStrokeCoordKey = cKey;

      // Stylus Pressure -> Dynamic Block Scale when enabled
      if (
        sCfg.pressureControlsScale &&
        e.pointerType === 'pen' &&
        e.pressure > 0 &&
        propsRef.current.onSetBlockScaleDirect
      ) {
        const nextScale = computePressureBlockScale(
          e.pressure,
          sCfg.pressureSensitivity || 1.0,
          propsRef.current.scrollResizeMode || 'snap'
        );
        propsRef.current.onSetBlockScaleDirect(nextScale);
      }

      // Check Stylus Tail Eraser (buttons === 32 or button === 5)
      if ((e.buttons & 32) !== 0 || e.button === 5) {
        propsRef.current.onEraseBlockAt(coord);
        return;
      }

      // Check Stylus Side Barrel Button (buttons === 2 or button === 2)
      if ((e.buttons & 2) !== 0 || e.button === 2) {
        if (sCfg.barrelButtonAction === 'erase') {
          propsRef.current.onEraseBlockAt(coord);
          return;
        } else if (sCfg.barrelButtonAction === 'pick') {
          propsRef.current.onPickBlockAt(coord);
          return;
        } else if (sCfg.barrelButtonAction === 'wand_select') {
          propsRef.current.onSetPos2(coord);
          return;
        }
      }

      const mode = propsRef.current.toolMode;
      if (mode === 'place') {
        propsRef.current.onPlaceBlockAt(coord);
      } else if (mode === 'erase') {
        propsRef.current.onEraseBlockAt(coord);
      } else if (mode === 'brush_place' || mode === 'brush_erase') {
        propsRef.current.onApplyVolumeBrushAt?.(coord, mode);
      } else if (mode === 'paint') {
        propsRef.current.onPaintBlockAt(coord);
      } else if (mode === 'pick') {
        propsRef.current.onPickBlockAt(coord);
      } else if (mode === 'stamp_blueprint') {
        propsRef.current.onStampBlueprintAt(coord);
      } else if (mode === 'wand_select') {
        propsRef.current.onSetPos1(coord);
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const ctx = sceneRefs.current;
      if (!ctx) return;

      // Handle Continuous 3D Dragging of Selection Face Nodes (+X, -X, +Y, -Y, +Z, -Z)
      if (activeGizmoDrag) {
        const dragDx = e.clientX - activeGizmoDrag.startClientX;
        const dragDy = e.clientY - activeGizmoDrag.startClientY;
        const projectedPx =
          dragDx * activeGizmoDrag.screenAxisX +
          dragDy * activeGizmoDrag.screenAxisY;
        const targetSteps = Math.round(
          projectedPx / activeGizmoDrag.pixelsPerBlock
        );
        const stepDiff = targetSteps - activeGizmoDrag.appliedSteps;
        if (stepDiff !== 0) {
          activeGizmoDrag.appliedSteps = targetSteps;
          propsRef.current.onNudgeSelectionFace(activeGizmoDrag.face, stepDiff);
        }
        return;
      }

      const sCfg = propsRef.current.stylusConfig || DEFAULT_STYLUS_MODE_CONFIG;
      const pType = (
        e.pointerType === 'pen' || e.pointerType === 'touch'
          ? e.pointerType
          : 'mouse'
      ) as 'mouse' | 'pen' | 'touch';

      if (pType === 'pen') {
        lastPenTimestamp = performance.now();
        if (propsRef.current.onStylusTelemetryChange) {
          propsRef.current.onStylusTelemetryChange(
            'pen',
            e.pressure || 0.5,
            sCfg.autoDetectPen && !sCfg.enabled
          );
        }
      }

      // Palm Rejection: Ignore stray palm touch events while pen is active or within 450ms
      if (
        pType === 'touch' &&
        (sCfg.enabled || sCfg.autoDetectPen) &&
        sCfg.palmRejection
      ) {
        const isLargePalmContact = (e.width || 0) > 28 || (e.height || 0) > 28;
        const isRecentPen = performance.now() - lastPenTimestamp < 450;
        if (isStylusStrokeActive || isRecentPen || isLargePalmContact) {
          return;
        }
      }

      // Detect active camera panning/orbiting to gracefully dim HUD when autoFadeHudOnPan is enabled
      if (
        !isStylusStrokeActive &&
        e.buttons > 0 &&
        Math.hypot(e.clientX - downPixel.x, e.clientY - downPixel.y) > 10
      ) {
        if (!isPanningCamera) {
          isPanningCamera = true;
          propsRef.current.onPanningOrDrawingChange?.(true);
        }
      }

      const { freeLookActive: isFreeLook, hotkeyConfig: hk } = propsRef.current;

      // Free-Look Fly Builder Mode: Mouse movement rotates camera yaw & pitch like an invisible flying 3D character
      if (isFreeLook && !isStylusStrokeActive) {
        let moveX = 0;
        let moveY = 0;
        if (document.pointerLockElement === renderer.domElement) {
          moveX = e.movementX || 0;
          moveY = e.movementY || 0;
        } else if (lastFreeLookPointer.active) {
          moveX = e.clientX - lastFreeLookPointer.x;
          moveY = e.clientY - lastFreeLookPointer.y;
        }
        lastFreeLookPointer.x = e.clientX;
        lastFreeLookPointer.y = e.clientY;
        lastFreeLookPointer.active = true;

        if (moveX !== 0 || moveY !== 0) {
          const sens = 0.0038 * (hk.flight.mouseLookSensitivity || 1.0);
          const invertMult = hk.flight.invertFlightLookY ? 1 : -1;
          ctx.yaw -= moveX * sens;
          ctx.pitch = THREE.MathUtils.clamp(
            ctx.pitch + moveY * sens * invertMult,
            -1.48,
            1.48
          );

          const cosP = Math.cos(ctx.pitch);
          lookDirVec
            .set(
              -Math.sin(ctx.yaw) * cosP,
              Math.sin(ctx.pitch),
              -Math.cos(ctx.yaw) * cosP
            )
            .normalize();

          ctx.controls.target
            .copy(ctx.camera.position)
            .addScaledVector(lookDirVec, ctx.orbitDist);
          ctx.camera.lookAt(ctx.controls.target);

          if (hk.flight.crosshairCenterAim !== false) {
            updateCenterCrosshairAim();
          }
          requestRender();
        }
      } else {
        lastFreeLookPointer.x = e.clientX;
        lastFreeLookPointer.y = e.clientY;
        lastFreeLookPointer.active = false;
      }

      const now = performance.now();
      if (now - lastRaycastTime < 28) return;
      lastRaycastTime = now;

      const mode = propsRef.current.toolMode;
      const isBarrelEraseOrPick =
        ((e.buttons & 2) !== 0 &&
          (sCfg.barrelButtonAction === 'erase' ||
            sCfg.barrelButtonAction === 'pick')) ||
        (e.buttons & 32) !== 0;

      const modifyExisting =
        mode === 'erase' ||
        mode === 'brush_erase' ||
        mode === 'paint' ||
        mode === 'pick' ||
        mode === 'wand_select' ||
        isBarrelEraseOrPick;

      const { coord } = computeTargetCoord(
        e.clientX,
        e.clientY,
        modifyExisting,
        e.ctrlKey
      );
      if (coord) {
        if (
          coord.x !== ctx.hoveredCoord.x ||
          coord.y !== ctx.hoveredCoord.y ||
          coord.z !== ctx.hoveredCoord.z
        ) {
          ctx.hoveredCoord = coord;
          ctx.ghostGroup.position.set(coord.x, coord.y, coord.z);
          propsRef.current.onCursorMove(coord);
          requestRender();
        }

        // Continuous Stylus Stroke Painting / Sculpting along the dragged path
        if (isStylusStrokeActive && sCfg.continuousStroke && e.buttons > 0) {
          executeStylusStrokeActionAt(coord, e, sCfg);
        }
      }
    };

    const onPointerLeave = () => {
      lastFreeLookPointer.active = false;
      if (activeGizmoDrag) {
        activeGizmoDrag = null;
        if (!propsRef.current.freeLookActive) {
          controls.enabled = true;
        }
      }
      if (isStylusStrokeActive || isPanningCamera) {
        isStylusStrokeActive = false;
        isPanningCamera = false;
        lastStrokeCoordKey = '';
        propsRef.current.onPanningOrDrawingChange?.(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      downPixel.set(e.clientX, e.clientY);
      downTimestamp = performance.now();
      lastStrokeCoordKey = '';

      const sCfg = propsRef.current.stylusConfig || DEFAULT_STYLUS_MODE_CONFIG;
      const pType = (
        e.pointerType === 'pen' || e.pointerType === 'touch'
          ? e.pointerType
          : 'mouse'
      ) as 'mouse' | 'pen' | 'touch';

      if (propsRef.current.onStylusTelemetryChange) {
        propsRef.current.onStylusTelemetryChange(
          pType,
          pType === 'pen' ? e.pressure || 0.5 : 0.5,
          pType === 'pen' && sCfg.autoDetectPen && !sCfg.enabled
        );
      }

      if (pType === 'pen') {
        lastPenTimestamp = performance.now();
      }

      // Palm Rejection on pointerdown
      if (
        pType === 'touch' &&
        (sCfg.enabled || sCfg.autoDetectPen) &&
        sCfg.palmRejection
      ) {
        const isLargePalmContact = (e.width || 0) > 28 || (e.height || 0) > 28;
        const isRecentPen = performance.now() - lastPenTimestamp < 450;
        if (isStylusStrokeActive || isRecentPen || isLargePalmContact) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Check if user is holding Selection Gizmo modifier key (or Ctrl) and grabbing a 3D Selection Face Node
      if (propsRef.current.isSelectionGizmoActive || e.ctrlKey) {
        const gizmoCheck = computeTargetCoord(
          e.clientX,
          e.clientY,
          false,
          true
        );
        if (gizmoCheck.gizmoFace && gizmoCheck.gizmoWorldPos) {
          beginGizmoFaceDrag(
            gizmoCheck.gizmoFace,
            gizmoCheck.gizmoWorldPos,
            e.clientX,
            e.clientY
          );
          return;
        }
      }

      // Determine whether this pointerdown initiates a Stylus Build/Paint Stroke vs Camera Orbit
      const stylusActive = sCfg.enabled || pType === 'pen';
      const isOrbitBarrel =
        (e.buttons & 2) !== 0 && sCfg.barrelButtonAction === 'orbit';
      const isFingerOrbitInStylusMode =
        pType === 'touch' && sCfg.touchOrbitsInStylusMode;

      if (stylusActive && !isOrbitBarrel && !isFingerOrbitInStylusMode) {
        isStylusStrokeActive = true;
        controls.enabled = false;
        propsRef.current.onPanningOrDrawingChange?.(true);

        const mode = propsRef.current.toolMode;
        const isBarrelEraseOrPick =
          ((e.buttons & 2) !== 0 &&
            (sCfg.barrelButtonAction === 'erase' ||
              sCfg.barrelButtonAction === 'pick')) ||
          (e.buttons & 32) !== 0;
        const modifyExisting =
          mode === 'erase' ||
          mode === 'brush_erase' ||
          mode === 'paint' ||
          mode === 'pick' ||
          mode === 'wand_select' ||
          isBarrelEraseOrPick;

        const { coord } = computeTargetCoord(
          e.clientX,
          e.clientY,
          modifyExisting
        );
        if (coord) {
          executeStylusStrokeActionAt(coord, e, sCfg);
        }
      } else if (!propsRef.current.freeLookActive) {
        controls.enabled = true;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activeGizmoDrag) {
        const dragTravel = Math.hypot(
          e.clientX - activeGizmoDrag.startClientX,
          e.clientY - activeGizmoDrag.startClientY
        );
        // If user just clicked the gizmo node without dragging, nudge by 1
        if (activeGizmoDrag.appliedSteps === 0 && dragTravel < 6) {
          propsRef.current.onNudgeSelectionFace(
            activeGizmoDrag.face,
            e.shiftKey ? -1 : 1
          );
        }
        activeGizmoDrag = null;
        if (!propsRef.current.freeLookActive) {
          controls.enabled = true;
        }
        return;
      }

      if (isPanningCamera) {
        isPanningCamera = false;
        propsRef.current.onPanningOrDrawingChange?.(false);
      }

      if (isStylusStrokeActive) {
        isStylusStrokeActive = false;
        lastStrokeCoordKey = '';
        if (!propsRef.current.freeLookActive) {
          controls.enabled = true;
        }
        propsRef.current.onPanningOrDrawingChange?.(false);
        return;
      }

      const dx = e.clientX - downPixel.x;
      const dy = e.clientY - downPixel.y;
      const dtClick = performance.now() - downTimestamp;
      const isFreeLook = propsRef.current.freeLookActive;

      // In Studio Pan mode, ignore camera orbit drags (> 14px travel).
      // In Free-Look mode, allow clicks even with slight mouse look movement (< 24px or < 260ms).
      if (!isFreeLook && Math.hypot(dx, dy) > 14) return;
      if (isFreeLook && Math.hypot(dx, dy) > 24 && dtClick > 260) return;

      const ctx = sceneRefs.current;
      if (!ctx) return;

      const mode = propsRef.current.toolMode;
      const modifyExisting =
        mode === 'erase' ||
        mode === 'brush_erase' ||
        mode === 'paint' ||
        mode === 'pick' ||
        mode === 'wand_select' ||
        e.button === 2;

      const { coord } = computeTargetCoord(
        e.clientX,
        e.clientY,
        modifyExisting
      );

      if (!coord) return;

      // Right-click erases in Place mode, runs 3D Erase Brush in 3D Place Brush mode, or sets Pos2 in Wand mode
      if (e.button === 2) {
        if (mode === 'wand_select') {
          propsRef.current.onSetPos2(coord);
        } else if (mode === 'brush_place' || mode === 'brush_erase') {
          propsRef.current.onApplyVolumeBrushAt?.(coord, 'brush_erase');
        } else {
          propsRef.current.onEraseBlockAt(coord);
        }
        return;
      }

      if (mode === 'place') {
        propsRef.current.onPlaceBlockAt(coord);
      } else if (mode === 'erase') {
        propsRef.current.onEraseBlockAt(coord);
      } else if (mode === 'brush_place' || mode === 'brush_erase') {
        propsRef.current.onApplyVolumeBrushAt?.(coord, mode);
      } else if (mode === 'paint') {
        propsRef.current.onPaintBlockAt(coord);
      } else if (mode === 'pick') {
        propsRef.current.onPickBlockAt(coord);
      } else if (mode === 'stamp_blueprint') {
        propsRef.current.onStampBlueprintAt(coord);
      } else if (mode === 'wand_select') {
        if (e.shiftKey || ctx.wandNextCorner === 2) {
          propsRef.current.onSetPos2(coord);
          ctx.wandNextCorner = 1;
        } else {
          propsRef.current.onSetPos1(coord);
          ctx.wandNextCorner = 2;
        }
      }
    };

    // Wheel Scroll Handler:
    // 1. Holding Selection Gizmo Key (or Ctrl) + Wheel -> Resizes the Pos1-Pos2 Selection Box!
    // 2. In 3D Volume Brush mode + Shift+Wheel -> Resizes the 3D Brush Radius (1..8)!
    // 3. Otherwise Shift + Wheel -> Resizes the Active Block Scale (Snap or Free mode)!
    // 4. In Free-Look mode without modifiers -> Flies forward/backward along look ray.
    const onWheel = (e: WheelEvent) => {
      const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;

      if (
        (propsRef.current.isSelectionGizmoActive || e.ctrlKey) &&
        propsRef.current.pos1 &&
        propsRef.current.onScrollResizeSelection
      ) {
        e.preventDefault();
        e.stopPropagation();
        propsRef.current.onScrollResizeSelection(dir, e.shiftKey);
        return;
      }

      const mode = propsRef.current.toolMode;
      if (
        e.shiftKey &&
        (mode === 'brush_place' || mode === 'brush_erase') &&
        propsRef.current.onChangeVolumeBrush
      ) {
        e.preventDefault();
        e.stopPropagation();
        const curBrush =
          propsRef.current.volumeBrush || DEFAULT_VOLUME_BRUSH_CONFIG;
        const nextRadius = Math.max(1, Math.min(8, curBrush.radius + dir));
        propsRef.current.onChangeVolumeBrush({
          ...curBrush,
          radius: nextRadius,
        });
        return;
      }

      if (e.shiftKey && propsRef.current.onScrollResizeBlock) {
        e.preventDefault();
        e.stopPropagation();
        propsRef.current.onScrollResizeBlock(dir);
        return;
      }

      if (!propsRef.current.freeLookActive) return;
      e.preventDefault();
      const ctx = sceneRefs.current;
      if (!ctx) return;
      ctx.camera.getWorldDirection(lookDirVec);
      const step = e.deltaY < 0 ? 1.35 : -1.35;
      ctx.camera.position.addScaledVector(lookDirVec, step);
      ctx.controls.target.addScaledVector(lookDirVec, step);
      updateCenterCrosshairAim();
      requestRender();
    };

    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerleave', onPointerLeave);
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('wheel', onWheel, {
      passive: false,
      capture: true,
    });

    // 5. Minecraft-based WASD + Space/Shift Creative Flying Controls
    const pressedFlightActions = new Set<
      'forward' | 'backward' | 'left' | 'right' | 'up' | 'down' | 'sprint'
    >();
    const flightVelocity = new THREE.Vector3(0, 0, 0);
    const targetVelocity = new THREE.Vector3(0, 0, 0);
    const forwardVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    let flightTickId = 0;
    let lastFlightTime = performance.now();
    let lastSpaceDownTime = 0;

    function isInputElementFocused(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      ) {
        return true;
      }
      // Also ignore if a modal dialog is open
      if (document.querySelector('[role="dialog"]')) {
        return true;
      }
      return false;
    }

    function stepFlightLoop() {
      flightTickId = 0;
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.004, (now - lastFlightTime) / 1000));
      lastFlightTime = now;

      const { hotkeyConfig: hk, freeLookActive: isFreeLook } = propsRef.current;
      const baseSpeed = 11.5 * (hk.flight.flySpeed || 1.0);
      const sprintMult = pressedFlightActions.has('sprint') ? 2.15 : 1.0;
      const speed = baseSpeed * sprintMult;

      // Compute horizontal forward vector from camera look direction
      camera.getWorldDirection(forwardVec);
      forwardVec.y = 0;
      if (forwardVec.lengthSq() < 0.0001) {
        forwardVec.set(0, 0, -1);
      } else {
        forwardVec.normalize();
      }
      // Right vector = forward x UP(0,1,0) -> (-forward.z, 0, forward.x)
      rightVec.set(-forwardVec.z, 0, forwardVec.x).normalize();

      const moveZ =
        (pressedFlightActions.has('forward') ? 1 : 0) -
        (pressedFlightActions.has('backward') ? 1 : 0);
      const moveX =
        (pressedFlightActions.has('right') ? 1 : 0) -
        (pressedFlightActions.has('left') ? 1 : 0);
      const moveY =
        (pressedFlightActions.has('up') ? 1 : 0) -
        (pressedFlightActions.has('down') ? 1 : 0);

      targetVelocity.set(0, 0, 0);
      if (moveZ !== 0 || moveX !== 0) {
        targetVelocity
          .addScaledVector(forwardVec, moveZ)
          .addScaledVector(rightVec, moveX);
        if (targetVelocity.lengthSq() > 1) {
          targetVelocity.normalize();
        }
        targetVelocity.multiplyScalar(speed);
      }
      targetVelocity.y = moveY * speed * 0.85;

      // Smooth Minecraft-style creative flight acceleration & air damping
      flightVelocity.lerp(targetVelocity, 0.32);

      if (flightVelocity.lengthSq() > 0.0005) {
        camera.position.addScaledVector(flightVelocity, dt);
        controls.target.addScaledVector(flightVelocity, dt);
        if (isFreeLook && hk.flight.crosshairCenterAim !== false) {
          updateCenterCrosshairAim();
        }
        requestRender();
      } else {
        flightVelocity.set(0, 0, 0);
      }

      if (pressedFlightActions.size > 0 || flightVelocity.lengthSq() > 0.0005) {
        flightTickId = window.setTimeout(
          stepFlightLoop,
          isSoftwareGl ? 45 : 16
        );
      }
    }

    function ensureFlightLoopRunning() {
      if (!flightTickId) {
        lastFlightTime = performance.now();
        flightTickId = window.setTimeout(
          stepFlightLoop,
          isSoftwareGl ? 45 : 16
        );
      }
    }

    const onFlightKeyDown = (e: KeyboardEvent) => {
      if (isInputElementFocused(e.target)) return;
      if (e.metaKey || (e.ctrlKey && e.key.toLowerCase() === 'z')) return;

      const { bindings, flight } = propsRef.current.hotkeyConfig;

      // Double-tap Space to toggle Fly Mode (like Minecraft Creative)
      if (
        !e.repeat &&
        flight.doubleSpaceToToggleFly &&
        matchesKeyBinding(e, bindings.flyUp)
      ) {
        const now = performance.now();
        if (now - lastSpaceDownTime < 320) {
          propsRef.current.onToggleFlyMode();
          lastSpaceDownTime = 0;
        } else {
          lastSpaceDownTime = now;
        }
      }

      // Allow WASD flight when either flyMode is ON or Free-Look Fly Builder is active
      if (!propsRef.current.flyMode && !propsRef.current.freeLookActive) {
        return;
      }

      let matched = false;
      if (matchesKeyBinding(e, bindings.moveForward)) {
        pressedFlightActions.add('forward');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.moveBackward)) {
        pressedFlightActions.add('backward');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.strafeLeft)) {
        pressedFlightActions.add('left');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.strafeRight)) {
        pressedFlightActions.add('right');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.flyUp)) {
        pressedFlightActions.add('up');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.flyDown)) {
        pressedFlightActions.add('down');
        matched = true;
      }
      if (matchesKeyBinding(e, bindings.sprintFly)) {
        pressedFlightActions.add('sprint');
      }

      if (matched) {
        e.preventDefault();
        ensureFlightLoopRunning();
      }
    };

    const onFlightKeyUp = (e: KeyboardEvent) => {
      const { bindings } = propsRef.current.hotkeyConfig;
      if (matchesKeyBinding(e, bindings.moveForward)) {
        pressedFlightActions.delete('forward');
      }
      if (matchesKeyBinding(e, bindings.moveBackward)) {
        pressedFlightActions.delete('backward');
      }
      if (matchesKeyBinding(e, bindings.strafeLeft)) {
        pressedFlightActions.delete('left');
      }
      if (matchesKeyBinding(e, bindings.strafeRight)) {
        pressedFlightActions.delete('right');
      }
      if (matchesKeyBinding(e, bindings.flyUp)) {
        pressedFlightActions.delete('up');
      }
      if (matchesKeyBinding(e, bindings.flyDown)) {
        pressedFlightActions.delete('down');
      }
      if (matchesKeyBinding(e, bindings.sprintFly)) {
        pressedFlightActions.delete('sprint');
      }
    };

    const onWindowBlur = () => {
      pressedFlightActions.clear();
      lastFreeLookPointer.active = false;
    };

    window.addEventListener('keydown', onFlightKeyDown);
    window.addEventListener('keyup', onFlightKeyUp);
    window.addEventListener('blur', onWindowBlur);

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (controls.enabled) {
        controls.update();
      }
      renderer.render(scene, camera);
    });
    resizeObserver.observe(mount);

    rebuildPlacedBlocks();
    rebuildChunkGrids();
    rebuildGhostMesh();
    rebuildSelectionGizmos();
    rebuildCopilotOverlays();
    rebuildCollaborators();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    controls.update();
    renderer.render(scene, camera);

    // WebGL Context-Loss & Automatic Recovery Listeners (iOS/Android backgrounding resilience)
    const onWebglContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglContextLost(true);
    };
    const onWebglContextRestored = () => {
      setWebglContextLost(false);
      rebuildPlacedBlocks();
      rebuildChunkGrids();
      rebuildGhostMesh();
      rebuildSelectionGizmos();
      rebuildCopilotOverlays();
      requestRender();
    };
    canvasEl.addEventListener('webglcontextlost', onWebglContextLost);
    canvasEl.addEventListener('webglcontextrestored', onWebglContextRestored);

    activeViewportBridge = {
      getRenderer: () => rendererRef.current,
      getScene: () => scene,
      getCamera: () => camera,
      rebuildPlacedBlocks: () => {
        rebuildPlacedBlocks();
        rebuildChunkGrids();
        rebuildGhostMesh();
        rebuildSelectionGizmos();
        rebuildCopilotOverlays();
        rebuildCollaborators();
      },
      renderNow: () => {
        if (controls.enabled) controls.update();
        renderer.render(scene, camera);
      },
      getSteepDropTelemetry: () => ({
        count: activeSteepDropCountRef.current,
        pulseOpacity: Number(
          (steepDropPulseMatsRef.current?.gridMat.opacity ?? 0).toFixed(3)
        ),
      }),
    };

    return () => {
      activeViewportBridge = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      clearTimeout(flightTickId);
      clearTimeout(debrisAnimTimer);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onFlightKeyDown);
      window.removeEventListener('keyup', onFlightKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerleave', onPointerLeave);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('wheel', onWheel, true);
      canvasEl.removeEventListener('webglcontextlost', onWebglContextLost);
      canvasEl.removeEventListener('webglcontextrestored', onWebglContextRestored);
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
      if (mount.contains(canvasEl)) {
        mount.removeChild(canvasEl);
      }
    };
  }, []);

  // Cinema Turntable Auto-Orbit Effect
  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx) return;
    ctx.controls.autoRotate = Boolean(turntableEnabled);
    ctx.controls.autoRotateSpeed = 2.0;
    if (!turntableEnabled) return;
    const id = window.setInterval(() => {
      requestRenderRef.current();
    }, isSoftwareGlRef.current ? 90 : 32);
    return () => window.clearInterval(id);
  }, [turntableEnabled]);

  // Cinema HD PNG Snapshot Capture Effect
  useEffect(() => {
    if (!snapshotTriggerCount) return;
    const renderer = rendererRef.current;
    const ctx = sceneRefs.current;
    if (!renderer || !ctx) return;
    renderer.render(ctx.scene, ctx.camera);
    try {
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const safeName = (worldName || 'lfs_studio_photo')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      a.download = `${safeName}_${Date.now()}.png`;
      a.click();
    } catch {
      // Ignore security taint if any
    }
  }, [snapshotTriggerCount, worldName]);

  // Synchronize OrbitControls vs. Free-Look Fly Builder camera state when mode toggles
  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx) return;
    ctx.syncYawPitchFromCamera();
    ctx.controls.enabled = !freeLookActive;
    if (freeLookActive && hotkeyConfig.flight.crosshairCenterAim !== false) {
      ctx.updateCenterCrosshairAim();
    }
    requestRenderRef.current();
  }, [freeLookActive, hotkeyConfig.flight.crosshairCenterAim]);

  useEffect(() => {
    rebuildPlacedBlocks();
  }, [
    blocks,
    customBlocks,
    lightingConfig?.pointLightsEnabled,
    chunkConfig,
    patternConfig,
  ]);

  useEffect(() => {
    rebuildChunkGrids();
  }, [chunkConfig, showGrid]);

  useEffect(() => {
    rebuildGhostMesh();
  }, [
    activeBlockId,
    activeBlueprint,
    toolMode,
    placementRotation,
    customBlocks,
    activeBlockScale,
    volumeBrush,
  ]);

  useEffect(() => {
    rebuildSelectionGizmos();
  }, [pos1, pos2, toolMode, isSelectionGizmoActive, activeCommandPreviewMode]);

  useEffect(() => {
    rebuildCopilotOverlays();
  }, [
    blocks,
    symmetryConfig,
    copilotConfig,
    copilotPredictions,
    commandPreviewCoords,
    activeCommandPreviewMode,
    walkabilityReport,
  ]);

  // Faint Red Grid Pulse Animation for Walkability Steep-Drop Hazard Overlays
  useEffect(() => {
    const steepCount = walkabilityReport?.steepDropCoords?.length ?? 0;
    const overlaysActive =
      (!copilotConfig ||
        (copilotConfig.enabled !== false &&
          copilotConfig.showWalkabilityOverlays !== false)) &&
      steepCount > 0;

    if (!overlaysActive) return;

    const mats = getSteepDropPulseMaterials();
    const intervalMs = isSoftwareGlRef.current ? 180 : 60;
    const timerId = window.setInterval(() => {
      const t = performance.now() * 0.004;
      const wave = 0.5 + 0.5 * Math.sin(t);
      mats.fillMat.opacity = 0.08 + wave * 0.11; // Faint red fill pulse (0.08 .. 0.19)
      mats.gridMat.opacity = 0.28 + wave * 0.36; // Crisp red grid pulse (0.28 .. 0.64)
      requestRenderRef.current();
    }, intervalMs);

    return () => window.clearInterval(timerId);
  }, [
    copilotConfig?.enabled,
    copilotConfig?.showWalkabilityOverlays,
    walkabilityReport?.steepDropCoords?.length,
  ]);

  useEffect(() => {
    rebuildCollaborators();
  }, [collaborators]);

  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    if (lightingConfig) {
      const {
        timeOfDay,
        sunAzimuth,
        sunIntensity,
        ambientIntensity,
        shadowsEnabled,
        fogDensity,
      } = lightingConfig;

      // Solar elevation angle from timeOfDay (6:00 = sunrise 0 deg, 12:00 = zenith 75 deg, 18:00 = sunset 0 deg, night = low moon)
      const dayPhase = ((timeOfDay - 6) / 12) * Math.PI;
      const sinElev = Math.sin(dayPhase);
      const isDaytime = timeOfDay >= 5.5 && timeOfDay <= 19.2;
      const elevRad = isDaytime
        ? Math.max(0.12, sinElev * 1.25)
        : 0.45; // Moon angle at night
      const azimRad = THREE.MathUtils.degToRad(sunAzimuth);
      const dist = 28;

      const lx = Math.cos(elevRad) * Math.cos(azimRad) * dist;
      const ly = Math.sin(elevRad) * dist;
      const lz = Math.cos(elevRad) * Math.sin(azimRad) * dist;
      ctx.keyLight.position.set(lx, Math.max(4, ly), lz);

      // Compute sky background & sun light color from timeOfDay
      let skyHex = 0x0b0f19;
      let sunHex = 0xfffbeb;
      if (timeOfDay >= 5.5 && timeOfDay < 8.0) {
        // Golden Dawn
        skyHex = 0x1e293b;
        sunHex = 0xfdba74;
      } else if (timeOfDay >= 8.0 && timeOfDay <= 16.5) {
        // Crisp Daylight / Studio
        skyHex = daylightMode ? 0xdbeafe : 0x0f172a;
        sunHex = 0xfffbeb;
      } else if (timeOfDay > 16.5 && timeOfDay <= 19.5) {
        // Warm Sunset
        skyHex = 0x1e1b4b;
        sunHex = 0xf97316;
      } else {
        // Starlit Night
        skyHex = 0x050811;
        sunHex = 0x93c5fd;
      }

      ctx.scene.background = new THREE.Color(skyHex);
      ctx.scene.fog = new THREE.FogExp2(skyHex, fogDensity * 0.032);
      ctx.keyLight.color.setHex(sunHex);
      ctx.keyLight.intensity = isDaytime ? sunIntensity : sunIntensity * 0.45;
      ctx.keyLight.castShadow = !isSoftwareGlRef.current && shadowsEnabled;
      ctx.hemiLight.intensity = ambientIntensity;
    } else {
      const skyHex = daylightMode ? 0xdbeafe : 0x0b0f19;
      ctx.scene.background = new THREE.Color(skyHex);
      ctx.scene.fog = new THREE.FogExp2(skyHex, 0.014);
    }

    requestRenderRef.current();
  }, [showGrid, daylightMode, lightingConfig]);

  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx || cameraPreset === 'free') return;
    if (cameraPreset === 'isometric') {
      ctx.camera.position.set(13, 12, 15);
    } else if (cameraPreset === 'top') {
      ctx.camera.position.set(0, 22, 0.01);
    } else if (cameraPreset === 'front') {
      ctx.camera.position.set(0, 5, 18);
    }
    ctx.controls.target.set(0, 1, 0);
    ctx.controls.update();
    ctx.syncYawPitchFromCamera();
    onCameraPresetHandled();
    requestRenderRef.current();
  }, [cameraPreset]);

  const toggleKeyLabel = formatKeyCode(hotkeyConfig.bindings.toggleMouseLookMode);
  const holdKeyLabel = formatKeyCode(hotkeyConfig.bindings.holdMouseLookMode);
  const gizmoHoldKeyLabel = formatKeyCode(
    hotkeyConfig.bindings.holdSelectionGizmo || 'KeyN'
  );
  const isVolumeBrushMode =
    toolMode === 'brush_place' || toolMode === 'brush_erase';

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden"
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes(STUDIO_DRAG_MIME) ||
          e.dataTransfer.types.includes('text/plain')
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const raw =
          e.dataTransfer.getData(STUDIO_DRAG_MIME) ||
          e.dataTransfer.getData('text/plain');
        const payload = parseStudioDragPayload(raw);
        if (!payload) return;
        e.preventDefault();
        if (payload.type === 'block' && payload.targetId && onSelectBlockId) {
          onSelectBlockId(payload.targetId);
        } else if (
          payload.type === 'tool' &&
          payload.targetId &&
          onSelectToolMode
        ) {
          onSelectToolMode(payload.targetId as ToolMode);
        } else if (
          payload.type === 'command' &&
          payload.targetId &&
          onRunRecommendedCommand
        ) {
          onRunRecommendedCommand(payload.targetId);
        }
      }}
    >
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        data-testid="skyblock-3d-canvas"
        className={`w-full h-full ${
          freeLookActive ? 'cursor-crosshair' : 'cursor-default'
        }`}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* WebGL Context-Loss Recovery Banner */}
      {webglContextLost && (
        <div
          data-testid="webgl-context-lost-banner"
          className="absolute inset-0 z-40 bg-slate-950/90 flex items-center justify-center p-4"
        >
          <div className="max-w-md rounded-2xl bg-slate-900 border border-amber-500/50 p-5 text-center space-y-2 shadow-2xl">
            <h3 className="text-sm font-bold text-amber-400">
              Restoring 3D GPU Context...
            </h3>
            <p className="text-xs text-slate-300">
              Your blocks and project state are safely preserved in IndexedDB
              while the WebGL renderer wakes up.
            </p>
          </div>
        </div>
      )}

      {/* Unified Top-Center Studio Viewport Bar (No overlapping corner pills!) */}
      <DraggableHudOverlay
        hudId="viewport_top_center_hud"
        label="Viewport Studio Bar"
        anchorClassName="top-2.5 left-1/2 -translate-x-1/2"
        zIndex={21}
      >
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-r-xl bg-slate-950/95 ${
            uiConfig?.highContrastAccessible
              ? 'border-2 border-amber-400'
              : 'border border-slate-800'
          } shadow-lg text-xs max-w-[92vw] overflow-x-auto no-scrollbar transition-opacity duration-200 ${
            uiConfig?.autoFadeHudOnPan && isViewportPanningOrDrawing
              ? 'opacity-30 pointer-events-none'
              : 'opacity-100'
          }`}
        >
          {/* Re-open Left Paint & Blocks Toolbox inline button when closed */}
          {!isLeftToolboxOpen && onOpenLeftToolbox && (
            <button
              type="button"
              data-testid="viewport-reopen-left-toolbox-btn"
              onClick={onOpenLeftToolbox}
              className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-[11px] whitespace-nowrap shrink-0"
              title="Open Left Paint & Block Library Dock"
            >
              Blocks
            </button>
          )}

          <button
            type="button"
            data-testid="viewport-mouse-mode-toggle"
            onClick={onToggleMouseLookMode}
            className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 text-[11px] ${
              freeLookActive
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title={`Switch between Studio Pan/Zoom and Free-Look Fly Builder (Toggle: ${toggleKeyLabel} · Hold: ${holdKeyLabel})`}
          >
            <span>
              {freeLookActive
                ? isHoldingFreeLook
                  ? 'Cam: Fly (Held)'
                  : 'Cam: Fly'
                : 'Cam: Orbit'}
            </span>
          </button>

          {/* 3D Volume Brush Controls when brush_place or brush_erase is equipped */}
          {isVolumeBrushMode && onChangeVolumeBrush ? (
            <div
              data-testid="volume-brush-hud"
              className="flex items-center gap-1 pl-1.5 border-l border-slate-800 shrink-0"
            >
              <span
                className={`text-[11px] font-mono font-bold whitespace-nowrap ${
                  toolMode === 'brush_erase' ? 'text-rose-400' : 'text-cyan-300'
                }`}
                title="Hold Shift + Scroll Mouse Wheel to resize 3D Brush Radius"
              >
                R={volumeBrush.radius}
              </span>

              <button
                type="button"
                onClick={() =>
                  onChangeVolumeBrush({
                    ...volumeBrush,
                    radius: Math.max(1, volumeBrush.radius - 1),
                  })
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold"
                title="Shrink 3D Brush Radius (Shift+Scroll Down)"
              >
                -
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeVolumeBrush({
                    ...volumeBrush,
                    radius: Math.min(8, volumeBrush.radius + 1),
                  })
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold"
                title="Grow 3D Brush Radius (Shift+Scroll Up)"
              >
                +
              </button>

              <select
                aria-label="3D Volume Brush Shape"
                value={volumeBrush.shape}
                onChange={(e) =>
                  onChangeVolumeBrush({
                    ...volumeBrush,
                    shape: e.target.value as VolumeBrushShape,
                  })
                }
                className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-200"
              >
                <option value="sphere">Sphere</option>
                <option value="cube">Cube</option>
                <option value="cylinder">Cylinder</option>
                <option value="diamond">Diamond</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  onChangeVolumeBrush({
                    ...volumeBrush,
                    hollow: !volumeBrush.hollow,
                  })
                }
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  volumeBrush.hollow
                    ? 'bg-amber-500/20 border border-amber-400 text-amber-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
                title="Toggle Solid vs Hollow Shell 3D Brush"
              >
                {volumeBrush.hollow ? 'Hollow' : 'Solid'}
              </button>
            </div>
          ) : (
            /* Shift + Scroll Block Resizer Controls (Snap vs Free Scroll) */
            <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800 shrink-0">
              <span
                className="text-[11px] font-mono text-amber-300 font-semibold whitespace-nowrap"
                title="Hold Shift + Scroll Mouse Wheel in 3D Viewport to resize block before placing"
              >
                {activeBlockScale.x.toFixed(
                  scrollResizeMode === 'free' ? 1 : activeBlockScale.x % 1 ? 2 : 0
                )}
                ×
                {activeBlockScale.y.toFixed(
                  scrollResizeMode === 'free' ? 1 : activeBlockScale.y % 1 ? 2 : 0
                )}
                ×
                {activeBlockScale.z.toFixed(
                  scrollResizeMode === 'free' ? 1 : activeBlockScale.z % 1 ? 2 : 0
                )}
              </span>

              {onScrollResizeBlock && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onScrollResizeBlock(-1)}
                    title="Shrink Active Block Scale (Shift+Scroll Down)"
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => onScrollResizeBlock(1)}
                    title="Grow Active Block Scale (Shift+Scroll Up)"
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold"
                  >
                    +
                  </button>
                </div>
              )}

              {onChangeScrollResizeMode && (
                <button
                  type="button"
                  data-testid="scroll-resize-mode-toggle"
                  onClick={() =>
                    onChangeScrollResizeMode(
                      scrollResizeMode === 'snap' ? 'free' : 'snap'
                    )
                  }
                  title="Toggle Shift+Scroll between Modular Snap Grid (0.25x..8x) and Fine Free Scroll (0.1x steps)"
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-colors ${
                    scrollResizeMode === 'snap'
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                      : 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  }`}
                >
                  {scrollResizeMode === 'snap' ? 'Snap' : 'Free'}
                </button>
              )}

              {onChangeScrollResizeAxis && (
                <select
                  aria-label="Shift+Scroll Resize Axis"
                  value={scrollResizeAxis}
                  onChange={(e) =>
                    onChangeScrollResizeAxis(e.target.value as ScrollResizeAxis)
                  }
                  className="hidden sm:inline-block px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="uniform">XYZ All</option>
                  <option value="footprint">W×D Flat</option>
                  <option value="height">Height Y</option>
                  <option value="width">Width X</option>
                  <option value="depth">Depth Z</option>
                </select>
              )}

              {onResetBlockScale &&
                (activeBlockScale.x !== 1 ||
                  activeBlockScale.y !== 1 ||
                  activeBlockScale.z !== 1) && (
                  <button
                    type="button"
                    onClick={onResetBlockScale}
                    title="Reset Block Scale to 1×1×1"
                    className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold"
                  >
                    1×
                  </button>
                )}
            </div>
          )}

          {/* Live Symmetry Mirror Toggle Button (V) */}
          {symmetryConfig && onChangeSymmetryConfig && (
            <button
              type="button"
              data-testid="viewport-symmetry-toggle"
              onClick={() => {
                const order: ('off' | 'mirror_x' | 'mirror_z' | 'quad_xz')[] = [
                  'off',
                  'mirror_x',
                  'mirror_z',
                  'quad_xz',
                ];
                const idx = order.indexOf(symmetryConfig.mode);
                const nextMode = order[(idx + 1) % order.length];
                onChangeSymmetryConfig({ ...symmetryConfig, mode: nextMode });
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap border transition-colors shrink-0 ${
                symmetryConfig.mode !== 'off'
                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-sky-400'
              }`}
              title="Cycle Real-Time Symmetry Mirror Plane (Hotkey: V)"
            >
              {symmetryConfig.mode === 'off'
                ? 'Sym: Off'
                : symmetryConfig.mode === 'mirror_x'
                  ? `Sym X=${symmetryConfig.pivotX}`
                  : symmetryConfig.mode === 'mirror_z'
                    ? `Sym Z=${symmetryConfig.pivotZ}`
                    : 'Sym 4×'}
            </button>
          )}

          {/* Steep Drop Spatial Safety Grid Pulse Toggle */}
          {walkabilityReport && walkabilityReport.steepDropCoords.length > 0 && (
            <button
              type="button"
              data-testid="viewport-steep-drop-toggle"
              onClick={() => {
                if (copilotConfig && onChangeCopilotConfig) {
                  onChangeCopilotConfig({
                    ...copilotConfig,
                    enabled: true,
                    showWalkabilityOverlays:
                      !copilotConfig.showWalkabilityOverlays,
                  });
                }
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap border transition-colors shrink-0 flex items-center gap-1 ${
                !copilotConfig || copilotConfig.showWalkabilityOverlays !== false
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-rose-400/50'
              }`}
              title="Toggle 3D Steep-Drop Red Grid Pulse Overlay (Highlights >=3 block ledges identified by Walkability Audit)"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !copilotConfig ||
                  copilotConfig.showWalkabilityOverlays !== false
                    ? 'bg-rose-400'
                    : 'bg-slate-600'
                }`}
              />
              <span>Drops: {walkabilityReport.steepDropCoords.length}</span>
            </button>
          )}

          {/* Selection Nodes & Clear Selection Controls when Pos1 or Pos2 is active */}
          {(pos1 || pos2) && (
            <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800 shrink-0">
              {pos1 && pos2 && onToggleSelectionGizmoLock && (
                <button
                  type="button"
                  data-testid="selection-gizmo-lock-toggle"
                  onClick={onToggleSelectionGizmoLock}
                  title={`Hold ${gizmoHoldKeyLabel} (or Ctrl) to drag 3D Selection Nodes, or click to toggle`}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap border transition-colors ${
                    isSelectionGizmoActive
                      ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {isSelectionGizmoActive ? 'Nodes: ON' : 'Nodes'}
                </button>
              )}
              {onClearSelection && (
                <button
                  type="button"
                  data-testid="clear-selection-btn"
                  onClick={onClearSelection}
                  title="Clear Pos1 & Pos2 Wand Selection Box (Shortcut: Esc)"
                  className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold whitespace-nowrap"
                >
                  Clear Sel
                </button>
              )}
            </div>
          )}

          {/* Re-open Right Inspector inline button when closed */}
          {!isRightInspectorOpen && onOpenRightInspector && (
            <button
              type="button"
              data-testid="viewport-reopen-right-inspector-btn"
              onClick={onOpenRightInspector}
              className="px-2 py-0.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-semibold text-[11px] whitespace-nowrap shrink-0"
              title="Open Right Command Legend & Studio Inspector Dock"
            >
              Inspector
            </button>
          )}
        </div>
      </DraggableHudOverlay>

      {/* Lightweight Contextual Copilot Bar — Only appears when actively predicting ghost runs, showing linger feedback, or using the Region Wand */}
      {(!copilotConfig || copilotConfig.enabled) &&
        ((copilotPredictions.length > 0 && onAcceptCopilotPredictions) ||
          Boolean(lastLingerPenaltyToast) ||
          (toolMode === 'wand_select' &&
            pos1 &&
            pos2 &&
            selectionRecommendations.length > 0 &&
            onRunRecommendedCommand)) && (
          <DraggableHudOverlay
            hudId="viewport_spatial_copilot_hud"
            label="Local Spatial Copilot"
            anchorClassName="top-12 left-1/2 -translate-x-1/2"
            zIndex={21}
          >
            <div
              data-testid="spatial-copilot-hud"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-r-xl bg-slate-950/95 border border-emerald-500/40 shadow-lg text-xs max-w-[90vw] overflow-x-auto no-scrollbar transition-opacity duration-200 ${
                uiConfig?.autoFadeHudOnPan && isViewportPanningOrDrawing
                  ? 'opacity-25 pointer-events-none'
                  : 'opacity-100'
              }`}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 shrink-0">
                Copilot
              </span>

              {/* 1. One-Tap Accept Predictive Ghost Auto-Complete (Tab) with Learned Reason */}
              {copilotPredictions.length > 0 && onAcceptCopilotPredictions && (
                <button
                  type="button"
                  data-testid="copilot-accept-ghost-btn"
                  onClick={onAcceptCopilotPredictions}
                  className="px-2 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
                  title="Accept predicted 3D block run (Keyboard shortcut: Tab)"
                >
                  <span>
                    Accept +{copilotPredictions.length} Ghost (Tab)
                  </span>
                  <span className="px-1 py-0.2 rounded bg-slate-950/20 text-[9px] font-mono uppercase">
                    {copilotPredictions[0].reason === 'learned_archive_habit'
                      ? 'Learned'
                      : copilotPredictions[0].reason === 'object_class_template'
                        ? 'Class'
                        : copilotPredictions[0].reason === 'connected_texture_match'
                          ? 'CTM'
                          : copilotPredictions[0].reason === 'slope_continuation'
                            ? 'Slope'
                            : 'Run'}
                  </span>
                </button>
              )}

              {/* Linger Removal Negative-Reinforcement Feedback Badge */}
              {lastLingerPenaltyToast && (
                <span
                  data-testid="copilot-linger-penalty-toast"
                  className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/50 text-amber-200 text-[10px] font-mono whitespace-nowrap shrink-0"
                >
                  {lastLingerPenaltyToast}
                </span>
              )}

              {/* 2. Smart Selection Command Previews when in Wand Select Mode */}
              {toolMode === 'wand_select' &&
                pos1 &&
                pos2 &&
                selectionRecommendations.length > 0 &&
                onRunRecommendedCommand && (
                  <div className="flex items-center gap-1 shrink-0">
                    {selectionRecommendations.slice(0, 3).map((rec) => {
                      const isPreviewing =
                        activeCommandPreviewMode === rec.previewMode;
                      return (
                        <button
                          key={rec.command}
                          type="button"
                          onMouseEnter={() =>
                            onHoverCommandPreviewMode?.(rec.previewMode)
                          }
                          onMouseLeave={() => onHoverCommandPreviewMode?.(null)}
                          onClick={() => {
                            onHoverCommandPreviewMode?.(null);
                            onRunRecommendedCommand(rec.command);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors whitespace-nowrap ${
                            isPreviewing
                              ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                              : 'bg-slate-900 text-amber-300 border-slate-700 hover:border-amber-400'
                          }`}
                          title={`${rec.reason} — Hover to preview 3D ghost blocks, click to execute ${rec.command}`}
                        >
                          {rec.label}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          </DraggableHudOverlay>
        )}

      {/* Center 3D Crosshair Reticle when Free-Look Fly Builder Mode is active */}
      {freeLookActive && hotkeyConfig.flight.crosshairCenterAim !== false && (
        <div
          data-testid="freelook-crosshair"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div className="w-4 h-0.5 bg-amber-400/90 shadow-sm" />
            <div className="h-4 w-0.5 bg-amber-400/90 absolute shadow-sm" />
            <div className="w-1.5 h-1.5 rounded-full border border-slate-950 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
};
