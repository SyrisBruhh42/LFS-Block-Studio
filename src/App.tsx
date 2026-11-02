/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStudioPersistence, type StudioAuthoredContent, type StudioEditAuthority } from './lib/useStudioPersistence';
import { createStudioId, type StudioDocument } from './lib/studioDocument';
import { StudioEditorSession } from './lib/studioEditorSession';
import { prepareStudioBrush, SINGLE_CELL_BRUSH } from './lib/studioBrushEdit';
import { StudioRecipeModel } from './lib/studioRecipeModel';
import { StudioKitModel } from './lib/studioKitModel';
import { StudioResourceWorkspace } from './components/StudioResourceWorkspace';
import { StudioRecipeWorkspace } from './components/StudioRecipeWorkspace';
import { importStudioCandidate } from './lib/legacyStudioImport';
import { prepareBlueprintImport, prepareCloudSnapshotImport } from './lib/studioResourceImport';
import { StudioRecoveryPanel } from './components/StudioRecoveryPanel';
import { StudioNavigationToolbar } from './components/StudioNavigationToolbar';
import { StudioCoordinateEditor } from './components/StudioCoordinateEditor';
import { StudioWorkspaceMenu, type StudioWorkspaceAction, type StudioMenuPage } from './components/StudioWorkspaceMenu';
import { StudioCellInspector } from './components/StudioCellInspector';
import { StudioCellInspectorModel } from './lib/studioCellInspectorModel';
import { applyStudioCellEditPatch, studioCellAnchor } from './lib/studioCellEdit';
import { useStudioWorkspacePreferences } from './lib/useStudioWorkspacePreferences';
import { StudioCompatibilityPanel, type StudioCompatibilityReview } from './components/StudioCompatibilityPanel';
import { describeCompatibilitySource, reviewStudioCompatibility, eligibleJavaDefinitions, matchesCompatibilityReview } from './lib/studioCompatibility';
import { validateBlueprintDefinitionMerge } from './engine/worldEditEngine';
import type { ViewportNavigationAction, ViewportNavigationRequest, ViewportNavigationState } from './engine/viewportNavigation';
import { hasOpenViewportModal, shouldIgnoreViewportKeyboard } from './engine/viewportInput';
import { User } from 'firebase/auth';
import {
  AdaptivePatternArchiveState,
  AdaptiveUiConfig,
  BlockScale3D,
  BlueprintPrefab,
  ChunkExpansionStyle,
  CollaboratorPresence,
  CommandMacroLoop,
  CustomBlockDefinition,
  DynamicLightingConfig,
  GitCommitNode,
  GridCoord,
  ModularHudConfig,
  SavedStudioProject,
  ScrollResizeAxis,
  ScrollResizeMode,
  SmartPatternVariationConfig,
  SpatialCopilotConfig,
  StylusModeConfig,
  SymmetryConfig,
  ToolMode,
  VolumeBrushConfig,
  WorldChunkConfig,
  WorldEditEngineState,
  WorldResetTemplateId,
} from './engine/types';
import {
  DEFAULT_CHUNK_CONFIG,
  DEFAULT_SMART_PATTERN_CONFIG,
  DEFAULT_VOLUME_BRUSH_CONFIG,
  chunkKey,
  expandWorldIntoChunk,
  getChunkCoordForBlock,
  predictBlockAttributesOnPlacement,
  stepBlockScaleOnScroll,
  transformSelectionBox,
} from './engine/chunkAndPatternEngine';
import {
  DEFAULT_SPATIAL_COPILOT_CONFIG,
  DEFAULT_SYMMETRY_CONFIG,
  PlacementHistoryEntry,
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
} from './engine/spatialCopilotEngine';
import {
  DEFAULT_MODULAR_HUD_CONFIG,
  resetEntireWorldToTemplate,
  resetSpecificChunkInWorld,
} from './engine/openSourceBlockMarket';
import {
  HotkeyConfig,
  loadHotkeyConfig,
  matchesKeyBinding,
  saveHotkeyConfig,
} from './engine/hotkeys';
import {
  STARTER_STRUCTURE_BLUEPRINTS,
  coordKey,
  createBlueprintFromCustomBlock,
  createBlueprintFromSelection,
  createInitialEngineState,
  executeWorldEditCommand,
  getSelectionBounds,
  getGridCoordError,
  getSelectionDimensions,
  loadBlueprintIntoNewWorld,
  pushUndoSnapshot,
  stampBlueprintIntoWorld,
  validateBlueprintPlacement,
  validateBlueprintLoad,
} from './engine/worldEditEngine';
import {
  CameraViewPreset,
  SkyblockViewport,
  getViewportRenderTelemetry,
} from './components/SkyblockViewport';
import {
  RightInspectorTab,
  RibbonTabId,
  StudioRibbonHeader,
} from './components/StudioRibbonHeader';
import { PaintToolboxSidebar } from './components/PaintToolboxSidebar';
import { CommandLegendSidebar } from './components/CommandLegendSidebar';
import { BlockWorkshopModal } from './components/BlockWorkshopModal';
import { BlueprintsModal } from './components/BlueprintsModal';
import { CloudMultiplayerModal } from './components/CloudMultiplayerModal';
import { SchematicExportModal } from './components/SchematicExportModal';
import { HotkeysModal } from './components/HotkeysModal';
import { DriveBackupModal } from './components/DriveBackupModal';
import { BlockMarketModal } from './components/BlockMarketModal';
import { MainMenuProjectModal } from './components/MainMenuProjectModal';
import { ModularActionBarsHud } from './components/ModularActionBarsHud';
import {
  AdaptiveMobileStylusHub,
  DEFAULT_ADAPTIVE_UI_CONFIG,
  DEFAULT_STYLUS_MODE_CONFIG,
  computeEffectiveUiMetrics,
} from './components/AdaptiveMobileStylusHub';
import {
  CloudWorldSummary,
  fetchCloudBlueprints,
  getAccessToken,
  googleSignIn,
  initAuth,
  listUserAndPublicWorlds,
  saveBlueprintToCloud,
  saveWorldToCloud,
  subscribeToAuth,
  updateCollaboratorPresence,
} from './lib/firebase';
import {
  BrickForgeProjectBackup,
  LocalAutosaveSnapshot,
  buildProjectBackupPayload,
} from './lib/googleDrive';
import {
  DEFAULT_USER_PROGRESS_STATE,
  StudioUserProgressState,
  idbSet,
  idbGetStrict,
} from './lib/indexedDbStorage';
import {
  playBlockEraseSound,
  playBlockPlaceSound,
  playContractCompleteFanfare,
  playGhostAcceptArpeggio,
} from './lib/spatialSoundAndHaptics';
import {
  AtmospherePresetId,
  ProceduralBiomeId,
  applyProceduralBiomeToWorld,
  buildOrderedTimelapseList,
  computeMasteryRank,
  computeUpdatedBuildStreak,
  getAtmospherePresetById,
  sliceBlocksAtTimelapseStep,
} from './engine/studioEngagementEngine';
import { ContractsAndBiomesModal } from './components/ContractsAndBiomesModal';
import { CinematicTimelapseDock } from './components/CinematicTimelapseDock';
import { OnboardingTourOverlay } from './components/OnboardingTourOverlay';
import { DraggableHudOverlay } from './components/DraggableWindow';
import {
  SelfTestingAuditorModal,
  AuditorModalTab,
} from './components/SelfTestingAuditorModal';
import { installGlobalIssueInterceptors } from './engine/issueTrackerEngine';
import {
  emitOasisMilestoneReward,
  installOasisCapsuleBridge,
  publishOasisAudioplayState,
} from './lib/oasisCapsuleBridge';
import { computeResponsiveWorkspaceMetrics } from './engine/windowLayoutEngine';
import {
  BookOpen,
  GitBranch,
  Palette,
  Play,
  Sun,
  Terminal,
} from 'lucide-react';

const LOCAL_BLUEPRINTS_STORAGE_KEY = 'brickforge_saved_blueprints_v1';
const LOCAL_CUSTOM_BLOCKS_STORAGE_KEY = 'brickforge_custom_blocks_v1';
const LOCAL_AUTOSAVE_SNAPSHOTS_KEY = 'brickforge_autosave_snapshots_v1';
const LOCAL_AUTOSAVE_PREFS_KEY = 'brickforge_autosave_prefs_v1';
const LOCAL_GIT_COMMITS_KEY = 'brickforge_git_commits_v1';
const LOCAL_ADAPTIVE_UI_KEY = 'brickforge_adaptive_ui_v1';
const LOCAL_STYLUS_MODE_KEY = 'brickforge_stylus_mode_v1';
const LOCAL_MODULAR_HUD_KEY = 'brickforge_modular_hud_v1';
const LOCAL_SAVED_PROJECTS_KEY = 'brickforge_saved_projects_v1';
const LOCAL_COPILOT_ARCHIVE_KEY = 'brickforge_copilot_archive_v1';
const LOCAL_USER_PROGRESS_KEY = 'brickforge_user_progress_v1';
const DEFAULT_LIGHTING_CONFIG: DynamicLightingConfig = {
  timeOfDay: 13.5, sunAzimuth: 135, sunIntensity: 1.5, ambientIntensity: 0.7,
  shadowsEnabled: true, pointLightsEnabled: true, fogDensity: 0.25,
};

function generateShortHash(): string {
  return Math.random().toString(16).substring(2, 9);
}

function initialStudioDocument(): StudioDocument {
  const engine = createInitialEngineState();
  return structuredClone({
    format: 'lfs-studio-project', schemaVersion: 1, documentId: createStudioId(), revision: 0,
    historyEpoch: createStudioId('history'), savedAt: new Date().toISOString(),
    world: { worldId: createStudioId('world'), worldName: 'Untitled Studio Project', roomCode: 'SKY101', isPublicWorld: false },
    blocks: engine.blocks, customBlocks: engine.customBlocks, blueprints: STARTER_STRUCTURE_BLUEPRINTS,
    chunkConfig: DEFAULT_CHUNK_CONFIG, patternConfig: DEFAULT_SMART_PATTERN_CONFIG, lightingConfig: DEFAULT_LIGHTING_CONFIG,
  });
}

function authoredDocument(document: StudioDocument): StudioAuthoredContent {
  const { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions } = document;
  return { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions };
}

export default function App() {
  const [editor] = useState(() => new StudioEditorSession(initialStudioDocument()));
  const editorSnapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const workspaceAppearance = useStudioWorkspacePreferences();
  const [cellInspector] = useState(() => new StudioCellInspectorModel(() => ({ document: editor.getDocument(), workspace: editor.getSnapshot().workspace,
    token: JSON.stringify(editor.getToken()), writable: editor.getSnapshot().writable && !editor.getSnapshot().exclusive }), edit => editor.transaction('Edit cell properties', () => {
      const engine = editor.getEngineState(), patch = applyStudioCellEditPatch(editor.getDocument(), engine, edit);
      editor.setEngineState({ ...engine, blocks: patch.blocks, pos1: patch.pos1, pos2: patch.pos2 });
      editor.setDocumentField('chunkConfig', patch.chunkConfig);
    }, JSON.parse(edit.sourceToken))));
  const cellInspectorSnapshot = useSyncExternalStore(cellInspector.subscribe, cellInspector.getSnapshot, cellInspector.getSnapshot);
  useEffect(() => { const unsubscribe = editor.subscribe(cellInspector.synchronize); cellInspector.synchronize(); return unsubscribe; }, [editor, cellInspector]);
  const [recipeModel] = useState(() => new StudioRecipeModel(() => ({ document: editor.getDocument(), workspace: editor.getSnapshot().workspace,
    token: JSON.stringify(editor.getToken()), writable: editor.getSnapshot().writable && !editor.getSnapshot().exclusive }), proposal => editor.transaction(`Recipe: ${proposal.report.name}`, () => {
      editor.setEngineState(proposal.state); editor.setDocumentField('chunkConfig', proposal.chunkConfig);
    }, JSON.parse(proposal.sourceToken))));
  const recipeSnapshot = useSyncExternalStore(recipeModel.subscribe, recipeModel.getSnapshot, recipeModel.getSnapshot);
  useEffect(() => { const unsubscribe = editor.subscribe(recipeModel.synchronize); recipeModel.synchronize(); return () => { unsubscribe(); recipeModel.close(); }; }, [editor, recipeModel]);
  const [studioMenuStartPage, setStudioMenuStartPage] = useState<StudioMenuPage>('actions');
  const engineState = editor.getEngineState();
  const setEngineState = editor.setEngineState;
  // A cached rendered edit cannot target a newer source or reopened session.
  const directEditToken = useMemo(() => editor.getToken(), [editor, editorSnapshot.sessionId, editorSnapshot.editRevision]);
  const target = editorSnapshot.document.targetPolicy?.target;
  const isJavaLocked = target?.kind === 'minecraft-java' && target.locked;
  const eligibleBlockIds = useMemo(() => eligibleJavaDefinitions(editorSnapshot.document), [editorSnapshot.document]);
  const selectableDefinitions = useMemo(() => isJavaLocked
    ? Object.fromEntries(eligibleBlockIds.map(id => [id, engineState.customBlocks[id]]))
    : engineState.customBlocks, [isJavaLocked, eligibleBlockIds, engineState.customBlocks]);

  const [hotbarBlockIds, setHotbarBlockIds] = useState<string[]>([
    'grass_brick',
    'cobble_brick',
    'oak_plank',
    'lego_red_2x2',
    'lego_amber_2x4',
    'roof_slope_blue',
    'titanium_panel',
    'crystal_glass',
    'voxel_lantern',
  ]);
  const [preferredBlockId, setPreferredBlockId] = useState<string>('cobble_brick');
  const activeBlockId = isJavaLocked && !eligibleBlockIds.includes(preferredBlockId) ? eligibleBlockIds[0] ?? '' : preferredBlockId;
  const recipeBlockId = selectableDefinitions[activeBlockId] ? activeBlockId : Object.keys(selectableDefinitions)[0] ?? '';
  const setActiveBlockId = useCallback((id: string) => {
    if (isJavaLocked && !eligibleBlockIds.includes(id)) { editor.reject('This block has no unchanged mapping in the locked profile. Choose an eligible block or review unlocking.'); return; }
    setPreferredBlockId(id);
  }, [isJavaLocked, eligibleBlockIds, editor]);
  const [toolMode, setToolMode] = useState<ToolMode>('place');
  const [freeformRotation, setFreeformRotation] = useState<0 | 90 | 180 | 270>(0);
  const placementRotation = isJavaLocked ? 0 : freeformRotation;
  const setPlacementRotation = useCallback((value: React.SetStateAction<0 | 90 | 180 | 270>) => {
    if (isJavaLocked) { editor.reject('This candidate profile supports unrotated unit blocks. Rotation remains available after unlocking.'); return; }
    setFreeformRotation(value);
  }, [isJavaLocked, editor]);
  const [freeformBlockScale, setFreeformBlockScale] = useState<BlockScale3D>({
    x: 1,
    y: 1,
    z: 1,
  });
  const activeBlockScale = useMemo(() => isJavaLocked ? { x: 1, y: 1, z: 1 } : freeformBlockScale, [isJavaLocked, freeformBlockScale]);
  const setActiveBlockScale = useCallback((value: React.SetStateAction<BlockScale3D>) => {
    if (isJavaLocked) { editor.reject('This candidate profile supports unit scale. Freeform scale is retained for use after unlocking.'); return; }
    setFreeformBlockScale(value);
  }, [isJavaLocked, editor]);
  const [scrollResizeMode, setScrollResizeMode] =
    useState<ScrollResizeMode>('snap');
  const [scrollResizeAxis, setScrollResizeAxis] =
    useState<ScrollResizeAxis>('uniform');

  const handleScrollResizeBlock = useCallback(
    (direction: 1 | -1) => {
      setActiveBlockScale((prev) =>
        stepBlockScaleOnScroll(
          prev,
          direction,
          scrollResizeMode,
          scrollResizeAxis
        )
      );
    },
    [scrollResizeMode, scrollResizeAxis, setActiveBlockScale]
  );

  const handleResetBlockScale = useCallback(() => {
    setActiveBlockScale({ x: 1, y: 1, z: 1 });
  }, [setActiveBlockScale]);

  // 3D Volume Place & Erase Brush config (scrollable radius 1..8, sphere/cube/cylinder/diamond)
  const [volumeBrush, setVolumeBrush] = useState<VolumeBrushConfig>(
    DEFAULT_VOLUME_BRUSH_CONFIG
  );

  // Selection Area 3D Gizmo Modifier Gate (hold N / Ctrl or click unlock badge in HUD)
  const [isHoldingSelectionGizmo, setIsHoldingSelectionGizmo] =
    useState<boolean>(false);
  const [selectionGizmoUnlocked, setSelectionGizmoUnlocked] =
    useState<boolean>(false);
  const effectiveSelectionGizmoActive =
    isHoldingSelectionGizmo || selectionGizmoUnlocked;

  // Local Spatial Copilot & Real-Time Symmetry Mirror state (device performance unqualified)
  const [symmetryConfig, setSymmetryConfig] = useState<SymmetryConfig>(
    DEFAULT_SYMMETRY_CONFIG
  );
  const [copilotConfig, setCopilotConfig] = useState<SpatialCopilotConfig>(
    DEFAULT_SPATIAL_COPILOT_CONFIG
  );
  const [recentPlacements, setRecentPlacements] = useState<
    PlacementHistoryEntry[]
  >([]);
  const [activeCommandPreviewMode, setActiveCommandPreviewMode] = useState<
    'set' | 'walls' | 'hollow' | 'stack_up' | 'clear' | null
  >(null);

  // Self-Learning Adaptive Pattern Archive & Linger Removal Feedback state
  const [patternArchive, setPatternArchive] =
    useState<AdaptivePatternArchiveState>(() => {
      try {
        const raw = localStorage.getItem(LOCAL_COPILOT_ARCHIVE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.patterns) {
            return {
              ...createInitialAdaptivePatternArchive(),
              ...parsed,
            };
          }
        }
      } catch {
        // Ignore
      }
      return createInitialAdaptivePatternArchive();
    });
  const [lastLingerPenaltyToast, setLastLingerPenaltyToast] = useState<
    string | null
  >(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_COPILOT_ARCHIVE_KEY,
        JSON.stringify(patternArchive)
      );
    } catch {
      // Ignore quota error
    }
    idbSet('copilot_archive', patternArchive).catch(() => {});
  }, [patternArchive]);

  // User Progression, Mastery Ranks, Audio/Haptics & Compliance Moderation State
  const [userProgress, setUserProgress] = useState<StudioUserProgressState>(
    () => {
      try {
        const raw = localStorage.getItem(LOCAL_USER_PROGRESS_KEY);
        if (raw) {
          return { ...DEFAULT_USER_PROGRESS_STATE, ...JSON.parse(raw) };
        }
      } catch {
        // Ignore
      }
      return DEFAULT_USER_PROGRESS_STATE;
    }
  );

  const persistUserProgress = useCallback((next: StudioUserProgressState) => {
    setUserProgress(next);
    try {
      localStorage.setItem(LOCAL_USER_PROGRESS_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
    idbSet('user_progress', next).catch(() => {});
  }, []);

  const masteryInfo = useMemo(
    () => computeMasteryRank(userProgress.xp),
    [userProgress.xp]
  );

  // Interactive 4-Step Onboarding Tour state
  const [showOnboardingTour, setShowOnboardingTour] = useState<boolean>(false);

  // Cinema & Timelapse Replay Studio state
  const [isCinemaOpen, setIsCinemaOpen] = useState<boolean>(false);
  const [timelapsePlaying, setTimelapsePlaying] = useState<boolean>(false);
  const [timelapseStep, setTimelapseStep] = useState<number>(0);
  const [timelapseSpeed, setTimelapseSpeed] = useState<1 | 2 | 5 | 10 | 20>(5);
  const [turntableEnabled, setTurntableEnabled] = useState<boolean>(false);
  const [showFramingGrid, setShowFramingGrid] = useState<boolean>(false);
  const [activeAtmosphereId, setActiveAtmosphereId] =
    useState<AtmospherePresetId>('studio_noon');
  const [snapshotTriggerCount, setSnapshotTriggerCount] = useState<number>(0);

  const orderedTimelapseBlocks = useMemo(
    () => buildOrderedTimelapseList(engineState.blocks),
    [engineState.blocks]
  );

  useEffect(() => {
    if (!isCinemaOpen) {
      setTimelapsePlaying(false);
      setTurntableEnabled(false);
    } else {
      setTimelapseStep(orderedTimelapseBlocks.length);
    }
  }, [isCinemaOpen, orderedTimelapseBlocks.length]);

  useEffect(() => {
    if (!isCinemaOpen || !timelapsePlaying) return;
    const total = orderedTimelapseBlocks.length;
    const stepAdvance = Math.max(1, Math.round(timelapseSpeed / 2));
    const intervalMs = Math.max(35, Math.round(140 / timelapseSpeed));
    const id = window.setInterval(() => {
      setTimelapseStep((prev) => {
        if (prev >= total) {
          setTimelapsePlaying(false);
          return total;
        }
        return Math.min(total, prev + stepAdvance);
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isCinemaOpen, timelapsePlaying, timelapseSpeed, orderedTimelapseBlocks.length]);

  const effectiveViewportBlocks = useMemo(() => {
    if (!isCinemaOpen || timelapseStep >= orderedTimelapseBlocks.length) {
      return engineState.blocks;
    }
    return sliceBlocksAtTimelapseStep(orderedTimelapseBlocks, timelapseStep);
  }, [
    isCinemaOpen,
    timelapseStep,
    orderedTimelapseBlocks,
    engineState.blocks,
  ]);

  // Moveable, Resizable & Lockable Multi-Hotbar HUD config (WoW / ElvUI style)
  const [hudConfig, setHudConfig] = useState<ModularHudConfig>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_MODULAR_HUD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.bars)) {
          return {
            ...DEFAULT_MODULAR_HUD_CONFIG,
            ...parsed,
          };
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_MODULAR_HUD_CONFIG;
  });

  const handleChangeHudConfig = useCallback((next: ModularHudConfig) => {
    setHudConfig(next);
    try {
      localStorage.setItem(LOCAL_MODULAR_HUD_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }, []);

  const incrementUsageCount = useCallback((id: string, delta = 1) => {
    setHudConfig((prev) => {
      const nextCounts = {
        ...prev.usageCounts,
        [id]: (prev.usageCounts[id] || 0) + delta,
      };
      const next = { ...prev, usageCounts: nextCounts };
      try {
        localStorage.setItem(LOCAL_MODULAR_HUD_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Multi-Project Save / Load Manager state
  const [savedProjects, setSavedProjects] = useState<SavedStudioProject[]>([]);
  const [projectCatalogVersion, setProjectCatalogVersion] = useState(0);

  const commandInputRef = useRef<HTMLInputElement | null>(null);

  const [hoveredCoord, setHoveredCoord] = useState<GridCoord>({ x: 0, y: 1, z: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [daylightMode, setDaylightMode] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('free');
  const [navigationRequest, setNavigationRequest] = useState<ViewportNavigationRequest>({ id: 1, action: 'orbit' });
  const [navigationState, setNavigationState] = useState<ViewportNavigationState>({ mode: 'orbit', projection: 'perspective', canGoBack: false });
  const navigate = useCallback((action: ViewportNavigationAction) => {
    setNavigationRequest(previous => ({ id: previous.id + 1, action }));
  }, []);

  // Workbench UI state: Word Ribbon tab + Left/Right Dock Inspector tabs (auto-collapsed on mobile phones)
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');
  const [isLeftToolboxOpen, setIsLeftToolboxOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [leftSidebarFloating, setLeftSidebarFloating] = useState<boolean>(false);
  const [leftDockedWidth, setLeftDockedWidth] = useState<number>(240);
  const [rightSidebarTab, setRightSidebarTabState] = useState<RightInspectorTab>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'closed' : 'legend'
  );
  const setRightSidebarTab = useCallback((next: React.SetStateAction<RightInspectorTab>) => { cellInspector.close(); setRightSidebarTabState(next); }, [cellInspector]);
  const [rightSidebarFloating, setRightSidebarFloating] = useState<boolean>(false);
  const [rightDockedWidth, setRightDockedWidth] = useState<number>(320);

  useEffect(() => {
    const onResetAll = () => {
      setLeftSidebarFloating(false);
      setLeftDockedWidth(240);
      setRightSidebarFloating(false);
      setRightDockedWidth(320);
      setHudConfig((prev) => ({
        ...DEFAULT_MODULAR_HUD_CONFIG,
        usageCounts: prev.usageCounts,
      }));
    };
    window.addEventListener('lfs-studio-reset-all-windows', onResetAll);
    return () =>
      window.removeEventListener('lfs-studio-reset-all-windows', onResetAll);
  }, []);

  // Adaptive UI Rescaling, Accessibility & Android Ergonomic Hub Config
  const [uiConfig, setUiConfig] = useState<AdaptiveUiConfig>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_ADAPTIVE_UI_KEY);
      if (raw) {
        return { ...DEFAULT_ADAPTIVE_UI_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // Ignore
    }
    return DEFAULT_ADAPTIVE_UI_CONFIG;
  });

  const handleChangeUiConfig = useCallback((next: AdaptiveUiConfig) => {
    setUiConfig(next);
    try {
      localStorage.setItem(LOCAL_ADAPTIVE_UI_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }, []);

  // PC (Wacom/Surface) & Android (S-Pen/USI) Stylus Mode Config
  const [stylusConfig, setStylusConfig] = useState<StylusModeConfig>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STYLUS_MODE_KEY);
      if (raw) {
        return { ...DEFAULT_STYLUS_MODE_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // Ignore
    }
    return DEFAULT_STYLUS_MODE_CONFIG;
  });

  const handleChangeStylusConfig = useCallback((next: StylusModeConfig) => {
    setStylusConfig(next);
    try {
      localStorage.setItem(LOCAL_STYLUS_MODE_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }, []);

  const [lastPointerType, setLastPointerType] = useState<
    'mouse' | 'pen' | 'touch'
  >('mouse');
  const [lastStylusPressure, setLastStylusPressure] = useState<number>(0.5);
  const [isViewportPanningOrDrawing, setIsViewportPanningOrDrawing] =
    useState<boolean>(false);
  const [isAdaptiveSettingsOpen, setIsAdaptiveSettingsOpen] =
    useState<boolean>(false);

  const handleStylusTelemetryChange = useCallback(
    (
      pointerType: 'mouse' | 'pen' | 'touch',
      pressure: number,
      autoActivatedPen?: boolean
    ) => {
      setLastPointerType(pointerType);
      if (pointerType === 'pen') {
        setLastStylusPressure(pressure);
      }
      if (autoActivatedPen) {
        setStylusConfig((prev) => {
          if (prev.enabled) return prev;
          const updated = { ...prev, enabled: true };
          try {
            localStorage.setItem(LOCAL_STYLUS_MODE_KEY, JSON.stringify(updated));
          } catch {
            // Ignore
          }
          return updated;
        });
      }
    },
    []
  );

  // Track window & visualViewport dimensions so rescaling, split-screen, and orientation shifts adapt gracefully
  const [windowDims, setWindowDims] = useState<{ width: number; height: number }>(
    () => ({
      width: typeof window !== 'undefined' ? window.innerWidth : 1280,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
    })
  );

  useEffect(() => {
    const onResize = () => {
      const w = window.visualViewport?.width || window.innerWidth;
      const h = window.visualViewport?.height || window.innerHeight;
      setWindowDims({ width: w, height: h });
      if (w < 768) {
        setIsLeftToolboxOpen(false);
        setRightSidebarTabState('closed');
      } else if (w < 1080) {
        setRightSidebarTabState((prev) => (prev === 'legend' ? 'closed' : prev));
      }
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  const effectiveUiMetrics = computeEffectiveUiMetrics(
    windowDims.width,
    windowDims.height,
    uiConfig
  );

  const workspaceMetrics = useMemo(
    () =>
      computeResponsiveWorkspaceMetrics(
        windowDims.width,
        windowDims.height,
        isLeftToolboxOpen && !leftSidebarFloating,
        leftDockedWidth,
        cellInspectorSnapshot.open || rightSidebarTab !== 'closed' && !rightSidebarFloating,
        rightDockedWidth
      ),
    [
      windowDims.width,
      windowDims.height,
      isLeftToolboxOpen,
      leftSidebarFloating,
      leftDockedWidth,
      rightSidebarTab,
      rightSidebarFloating,
      rightDockedWidth,
      cellInspectorSnapshot.open,
    ]
  );

  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(
      16 * effectiveUiMetrics.effectiveScale
    )}px`;
  }, [effectiveUiMetrics.effectiveScale]);

  // Dynamic Lighting Studio state
  const authoredLighting = editorSnapshot.document.lightingConfig;
  const lightingConfig = authoredLighting ?? DEFAULT_LIGHTING_CONFIG;
  const setLightingConfig = useCallback((next: React.SetStateAction<DynamicLightingConfig>) => {
    return editor.setDocumentField('lightingConfig', previous => typeof next === 'function' ? next(previous ?? DEFAULT_LIGHTING_CONFIG) : next);
  }, [editor]);

  // Multi-Chunk World Grid & Active Chunk Culling state
  const chunkConfig = editorSnapshot.document.chunkConfig;
  const setChunkConfig = useCallback((next: React.SetStateAction<WorldChunkConfig>) => editor.setDocumentField('chunkConfig', next), [editor]);

  // Smart Pattern Variation & Connected-Neighbor Art Matcher state
  const patternConfig = editorSnapshot.document.patternConfig;
  const setPatternConfig = useCallback((next: React.SetStateAction<SmartPatternVariationConfig>) => editor.setDocumentField('patternConfig', next), [editor]);

  // Animation belongs to the viewport. Timer ticks must not mutate authored
  // settings, generate durable revisions or invalidate a pending recovery.
  const [patternPreviewOffset, setPatternPreviewOffset] = useState(0);
  useEffect(() => {
    setPatternPreviewOffset(0);
    if (!patternConfig.enabled || !patternConfig.autoEvolveLoop) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setPatternPreviewOffset(previous => (previous + 0.12 * patternConfig.evolveSpeed) % (Math.PI * 2));
    }, 240);
    return () => window.clearInterval(id);
  }, [patternConfig]);
  const previewPatternConfig = useMemo(() => patternConfig.enabled && patternConfig.autoEvolveLoop
    ? { ...patternConfig, evolutionPhase: (patternConfig.evolutionPhase + patternPreviewOffset) % (Math.PI * 2) }
    : patternConfig, [patternConfig, patternPreviewOffset]);

  // Git-style Version Control Commit Tree state
  const [gitCommits, setGitCommits] = useState<GitCommitNode[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_GIT_COMMITS_KEY);
      if (raw) {
        const parsed: GitCommitNode[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore
    }
    const initBlocks = createInitialEngineState().blocks;
    const initCustom = Object.values(createInitialEngineState().customBlocks);
    const count = Object.keys(initBlocks).length;
    return [
      {
        id: 'commit_init',
        hash: 'a1f8c20',
        branch: 'main',
        message: 'Initial realistic Skyblock island foundation',
        timestamp: new Date().toISOString(),
        blockCount: count,
        addedDelta: count,
        removedDelta: 0,
        blocksSnapshot: initBlocks,
        customBlocksSnapshot: initCustom,
      },
    ];
  });
  const [activeCommitId, setActiveCommitId] = useState<string>(() => {
    return gitCommits[0]?.id || 'commit_init';
  });

  // Minecraft WASD Flying Mode, Free-Look Mouse Mode & Customizable Hotkey Config
  const flyMode = navigationState.mode === 'fly';
  const mouseLookToggled = flyMode;
  const [isHoldingMouseLook, setIsHoldingMouseLook] = useState<boolean>(false);
  const effectiveFreeLook = flyMode;
  const toggleFlyNavigation = useCallback(() => navigate(navigationState.mode === 'fly' ? 'orbit' : 'fly'), [navigate, navigationState.mode]);

  const [hotkeyConfig, setHotkeyConfig] = useState<HotkeyConfig>(() =>
    loadHotkeyConfig()
  );

  const handleChangeHotkeyConfig = useCallback((next: HotkeyConfig) => {
    setHotkeyConfig(next);
    saveHotkeyConfig(next);
  }, []);

  // Saved blueprints (Starter + Custom Block Blueprints + User Saved Structures)
  const blueprints = editorSnapshot.document.blueprints;
  const setBlueprints = useCallback((next: React.SetStateAction<BlueprintPrefab[]>) => editor.setDocumentField('blueprints', next), [editor]);
  const [activeBlueprint, setActiveBlueprint] = useState<BlueprintPrefab | null>(
    STARTER_STRUCTURE_BLUEPRINTS[0]
  );

  // Command execution log & bottom command input
  const [commandInput, setCommandInput] = useState<string>('');
  const [commandLog, setCommandLog] = useState<
    { id: string; cmd: string; message: string; success: boolean }[]
  >([
    {
      id: 'init',
      cmd: '//lfs',
      message:
        'LFS Block Studio Workbench ready. Press / to focus command bar, or use Ribbon tabs & 3D Brushes.',
      success: true,
    },
  ]);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    | 'none'
    | 'workshop'
    | 'blueprints'
    | 'cloud'
    | 'export'
    | 'hotkeys'
    | 'drive'
    | 'market'
    | 'main_menu'
    | 'contracts_biomes'
    | 'compatibility'
    | 'studio_menu'
  >('none');
  const [isAuditorModalOpen, setIsAuditorModalOpen] = useState<boolean>(false);
  const [auditorInitialTab, setAuditorInitialTab] =
    useState<AuditorModalTab>('self_tests');

  useEffect(() => {
    installGlobalIssueInterceptors(() => {
      const gpu = getViewportRenderTelemetry();
      return {
        capturedAtIso: new Date().toISOString(),
        activeBlockCount: Object.keys(engineState.blocks).length,
        unlockedChunksCount: chunkConfig.unlockedChunks.length,
        activeToolMode: toolMode,
        activeBlockId,
        webglGeometries: gpu.geometries,
        webglTextures: gpu.textures,
        webglDrawCalls: gpu.calls,
        webglTriangles: gpu.triangles,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        lastCommands: commandLog.slice(-6).map((c) => c.cmd),
        openWindows: activeModal === 'none' ? [] : [activeModal],
      };
    });
  }, [
    engineState.blocks,
    chunkConfig.unlockedChunks.length,
    toolMode,
    activeBlockId,
    commandLog,
    activeModal,
  ]);

  useEffect(() => {
    return installOasisCapsuleBridge();
  }, []);

  useEffect(() => {
    const preset = getAtmospherePresetById(activeAtmosphereId);
    publishOasisAudioplayState({
      title: `LFS Block Studio · ${preset.name}`,
      artist: 'LFS Oasis Spatial Soundscape',
      atmospherePresetId: activeAtmosphereId,
      isPlaying: userProgress.soundEnabled,
    });
  }, [activeAtmosphereId, userProgress.soundEnabled]);

  // Firebase Auth, Google Drive OAuth, & Multiplayer state
  const [user, setUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState<boolean>(true);
  const { worldId, worldName, roomCode, isPublicWorld } = editorSnapshot.document.world;
  const setWorldId = useCallback((next: React.SetStateAction<string>) => editor.setWorldField('worldId', next), [editor]);
  const setWorldName = useCallback((next: React.SetStateAction<string>) => editor.setWorldField('worldName', next), [editor]);
  const setRoomCode = useCallback((next: React.SetStateAction<string>) => editor.setWorldField('roomCode', next), [editor]);
  const setIsPublicWorld = useCallback((next: React.SetStateAction<boolean>) => editor.setWorldField('isPublicWorld', next), [editor]);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [cloudWorlds, setCloudWorlds] = useState<CloudWorldSummary[]>([]);
  const [isLoadingCloudBp, setIsLoadingCloudBp] = useState<boolean>(false);

  // Autosave & Google Drive Auto-Backup state
  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_AUTOSAVE_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.autosaveEnabled === 'boolean') {
          return parsed.autosaveEnabled;
        }
      }
    } catch {
      // Ignore
    }
    return true;
  });
  const [autosaveIntervalSec, setAutosaveIntervalSec] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_AUTOSAVE_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.autosaveIntervalSec === 'number') {
          return parsed.autosaveIntervalSec;
        }
      }
    } catch {
      // Ignore
    }
    return 30;
  });
  const [autoDriveBackupEnabled, setAutoDriveBackupEnabled] =
    useState<boolean>(() => {
      try {
        const raw = localStorage.getItem(LOCAL_AUTOSAVE_PREFS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.autoDriveBackupEnabled === 'boolean') {
            return parsed.autoDriveBackupEnabled;
          }
        }
      } catch {
        // Ignore
      }
      return true;
    });
  const [localSnapshots, setLocalSnapshots] = useState<LocalAutosaveSnapshot[]>([]);
  const [lastAutosaveTime, setLastAutosaveTime] = useState<string | null>(null);
  const [lastDriveSyncTime, setLastDriveSyncTime] = useState<string | null>(
    null
  );

  const applyRecoveredDocument = useCallback((doc: StudioDocument) => {
    const result = editor.installVerifiedDocument(doc);
    if (result.status === 'rejected') throw new Error(result.message);
    setIsLiveConnected(false);
  }, [editor]);
  const authoredContent = useMemo(() => authoredDocument(editorSnapshot.document), [editorSnapshot.document]);
  const editAuthority = useMemo<StudioEditAuthority>(() => ({
    readContent: () => authoredDocument(editor.getDocument()),
    getToken: () => JSON.stringify(editor.getToken()),
    setWritable: editor.setWritable,
    acquireLock: () => {
      const handle = editor.beginExclusive();
      return handle ? () => { editor.endExclusive(handle); } : null;
    },
    acknowledgeSaved: (doc, sourceToken) => {
      const result = editor.acknowledgeDurable(doc, JSON.parse(sourceToken));
      if (result.status === 'rejected') throw new Error(result.message);
    },
  }), [editor]);
  const persistence = useStudioPersistence({
    content: authoredContent, onRestore: applyRecoveredDocument, autosaveEnabled, autosaveIntervalSec, editAuthority,
  });
  const [kitModel] = useState(() => new StudioKitModel(
    () => ({ document: editor.getDocument(), engine: editor.getEngineState(), token: JSON.stringify(editor.getToken()), writable: editor.getSnapshot().writable && !editor.getSnapshot().exclusive }),
    proposal => persistence.preserveResourceCandidate(proposal.archivalDocument, proposal.legacySources, proposal.sourceToken),
    proposal => editor.transaction(`Import kit: ${proposal.report.name}`, () => {
      editor.setDocumentField('customBlocks', proposal.document.customBlocks);
      editor.setDocumentField('blueprints', proposal.document.blueprints);
      editor.setDocumentField('extensions', proposal.document.extensions);
    }, JSON.parse(proposal.sourceToken)),
    proposal => editor.transaction(`Place blueprint: ${proposal.report.name}`, () => {
      editor.setEngineState(proposal.state); editor.setDocumentField('chunkConfig', proposal.chunkConfig);
    }, JSON.parse(proposal.sourceToken))));
  const kitSnapshot = useSyncExternalStore(kitModel.subscribe, kitModel.getSnapshot, kitModel.getSnapshot);
  useEffect(() => { const unsubscribe = editor.subscribe(kitModel.synchronize); kitModel.synchronize(); return () => { unsubscribe(); kitModel.close(); }; }, [editor, kitModel]);
  const compatibilityReview = useRef<StudioCompatibilityReview | null>(null);
  const compatibilitySource = useMemo(() => describeCompatibilitySource(editorSnapshot.document, JSON.stringify(editor.getToken())), [editor, editorSnapshot.document, editorSnapshot.editRevision, editorSnapshot.sessionId]);
  const handleReviewCompatibility = useCallback((draft: Parameters<typeof reviewStudioCompatibility>[1]) => {
    if (!persistence.ready || persistence.busy || !editor.getSnapshot().writable || editor.getSnapshot().exclusive) throw new Error('Finish saving or recovery before reviewing a target change.');
    if (draft.sourceToken !== JSON.stringify(editor.getToken())) throw new Error('The project changed. Review the current build again.');
    const report = reviewStudioCompatibility(editor.getDocument(), draft);
    compatibilityReview.current = report;
    return report;
  }, [editor, persistence.ready, persistence.busy]);
  const handleApplyCompatibility = useCallback(async (report: StudioCompatibilityReview, acknowledgement: { appearanceSubstitution: true; newHistoryEpoch: true }) => {
    if (!matchesCompatibilityReview(report, compatibilityReview.current, JSON.stringify(editor.getToken()))) return { status: 'stale' as const, message: 'This review no longer matches the current project. Review again before applying.' };
    if (acknowledgement.appearanceSubstitution !== true || acknowledgement.newHistoryEpoch !== true) return { status: 'rejected' as const, message: 'Review the appearance substitutions and new Undo-history consequence first.' };
    compatibilityReview.current = null; // one submission per exact review, including uncertain outcomes
    const applied = await persistence.transitionTarget(report.target, report.sourceToken);
    return applied
      ? { status: 'applied' as const, message: 'Target policy saved. A checkpoint preserves the previous state; this project now has a new Undo history.' }
      : { status: 'rejected' as const, message: 'The target transition did not finish in this view. Check saving/recovery status before reviewing or retrying.' };
  }, [editor, persistence.transitionTarget]);
  useEffect(() => { setLastAutosaveTime(persistence.savedAt); }, [persistence.savedAt]);
  useEffect(() => {
    if (!persistence.ready) return;
    let cancelled = false;
    (async () => {
      const copies = await persistence.listNamedCopies();
      const projects: SavedStudioProject[] = copies.map(copy => ({
        id: copy.id, name: copy.document.world.worldName, description: copy.document.world.description ?? '',
        updatedAt: copy.document.savedAt, blockCount: Object.keys(copy.document.blocks).length,
        unlockedChunksCount: copy.document.chunkConfig.unlockedChunks.length,
        blocks: copy.document.blocks, customBlocks: Object.values(copy.document.customBlocks),
        chunkConfig: copy.document.chunkConfig, completeDocument: copy.document,
      }));
      // Keep legacy slots discoverable without rewriting or deleting their original records.
      const originals: { source: string; value: unknown }[] = [];
      try { const raw = localStorage.getItem(LOCAL_SAVED_PROJECTS_KEY); if (raw) originals.push({ source: 'local', value: JSON.parse(raw) }); } catch { /* Active IndexedDB project remains usable without localStorage. */ }
      try { originals.push({ source: 'idb', value: await idbGetStrict('saved_projects') }); } catch { /* Failure is not permission to overwrite the legacy store. */ }
      for (const original of originals) {
        if (!Array.isArray(original.value)) continue;
        for (const [index, item] of original.value.slice(0, 100).entries()) {
          const parsed = importStudioCandidate(JSON.stringify(item), persistence.importDefaults());
          if (parsed.ok === false) continue;
          const doc = parsed.value;
          projects.push({ id: `legacy:${original.source}:${index}`, name: doc.world.worldName, description: 'Preserved legacy project', updatedAt: doc.savedAt,
            blockCount: Object.keys(doc.blocks).length, unlockedChunksCount: doc.chunkConfig.unlockedChunks.length,
            blocks: doc.blocks, customBlocks: Object.values(doc.customBlocks), chunkConfig: doc.chunkConfig, completeDocument: doc });
        }
      }
      if (!cancelled) setSavedProjects(projects);
    })().catch(() => { /* Recovery panel retains its storage error; never replace a failed list with an empty one. */ });
    return () => { cancelled = true; };
  }, [persistence.ready, persistence.listNamedCopies, persistence.importDefaults, projectCatalogVersion, activeModal]);

  // Save autosave preferences
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_AUTOSAVE_PREFS_KEY,
        JSON.stringify({
          autosaveEnabled,
          autosaveIntervalSec,
          autoDriveBackupEnabled,
        })
      );
    } catch {
      // Ignore
    }
  }, [autosaveEnabled, autosaveIntervalSec, autoDriveBackupEnabled]);

  // Subscribe to Firebase Auth & Workspace OAuth Token state
  useEffect(() => {
    const unsubInit = initAuth(
      (u, token) => {
        setUser(u);
        setDriveAccessToken(token);
        setNeedsDriveAuth(false);
      },
      (u) => {
        setUser(u ?? null);
        setDriveAccessToken(null);
        setNeedsDriveAuth(true);
      }
    );
    const unsubSub = subscribeToAuth((u) => {
      setUser(u);
      if (!u) {
        setDriveAccessToken(null);
        setNeedsDriveAuth(true);
      }
    });
    return () => {
      unsubInit();
      unsubSub();
    };
  }, []);

  const handleConnectGoogleDrive = useCallback(async (): Promise<
    string | null
  > => {
    const existing = await getAccessToken();
    if (existing) {
      setDriveAccessToken(existing);
      setNeedsDriveAuth(false);
      return existing;
    }
    const result = await googleSignIn();
    if (result) {
      setUser(result.user);
      setDriveAccessToken(result.accessToken);
      setNeedsDriveAuth(false);
      return result.accessToken;
    }
    return null;
  }, []);

  const appendLog = useCallback((cmd: string, message: string, success = true) => {
    const write = () => setCommandLog((prev) => [
      ...prev.slice(-24),
      { id: `${Date.now()}_${Math.random()}`, cmd, message, success },
    ]);
    if (success) editor.afterCommit(write); else write();
  }, [editor]);

  // Git Commit Creation & Checkout
  const handleCreateGitCommit = useCallback(
    (customMessage?: string) => {
      const current = editor.getEngineState();
      const prevHead = gitCommits[0];
      const currentKeys = new Set(Object.keys(current.blocks));
      const prevKeys = new Set(
        prevHead ? Object.keys(prevHead.blocksSnapshot) : []
      );
      let added = 0;
      let removed = 0;
      for (const k of currentKeys) {
        if (!prevKeys.has(k)) added++;
      }
      for (const k of prevKeys) {
        if (!currentKeys.has(k)) removed++;
      }

      const hash = generateShortHash();
      const message =
        customMessage ||
        `Snapshot (${currentKeys.size} blocks, +${added}/-${removed})`;

      const newCommit: GitCommitNode = {
        id: `commit_${Date.now()}`,
        hash,
        branch: 'main',
        message,
        timestamp: new Date().toISOString(),
        blockCount: currentKeys.size,
        addedDelta: added,
        removedDelta: removed,
        blocksSnapshot: structuredClone(current.blocks),
        customBlocksSnapshot: structuredClone(Object.values(current.customBlocks)),
      };

      setGitCommits((prev) => {
        const next = [newCommit, ...prev.slice(0, 14)];
        try {
          localStorage.setItem(LOCAL_GIT_COMMITS_KEY, JSON.stringify(next));
        } catch {
          // Ignore quota error
        }
        idbSet('git_commits', next).catch(() => {});
        return next;
      });
      editor.afterCommit(() => setActiveCommitId(newCommit.id));
      appendLog(
        `git commit -m "${message}"`,
        `[main ${hash}] ${message} (+${added} -${removed})`,
        true
      );
    },
    [editor, gitCommits, appendLog]
  );

  const handleCheckoutGitCommit = useCallback(
    (commit: GitCommitNode) => {
      return editor.transaction('Checkout Git Commit', () => {
      setEngineState((prev) => {
        const withUndo = pushUndoSnapshot(prev, `Checkout ${commit.hash}`);
        const nextCustom = { ...withUndo.customBlocks };
        for (const d of commit.customBlocksSnapshot || []) {
          nextCustom[d.id] = d;
        }

        return {
          ...withUndo,
          blocks: { ...commit.blocksSnapshot },
          customBlocks: nextCustom,
        };
      });
      editor.afterCommit(() => setActiveCommitId(commit.id));
      appendLog(
        `git checkout ${commit.hash}`,
        `Checked out commit ${commit.hash}: "${commit.message}" (${commit.blockCount} blocks).`,
        true
      );
      });
    },
    [appendLog]
  );

  // Update active block color from Windows Paint swatch / color picker
  const handleUpdateActiveBlockColor = useCallback(
    (newHexColor: string) => {
      return editor.transaction('Update Active Block Color', () => {
      setEngineState((prev) => {
        const currentDef = prev.customBlocks[activeBlockId];
        if (!currentDef) return prev;
        const updatedDef: CustomBlockDefinition = {
          ...currentDef,
          color: newHexColor,
        };
        const nextCustom = {
          ...prev.customBlocks,
          [activeBlockId]: updatedDef,
        };

        return {
          ...prev,
          customBlocks: nextCustom,
        };
      });
      });
    },
    [activeBlockId]
  );

  // Build portable project backup payload
  const handleBuildCurrentBackupPayload = useCallback((): BrickForgeProjectBackup => {
    const document = persistence.currentDocument();
    return buildProjectBackupPayload({
      worldId: document.world.worldId, worldName: document.world.worldName, roomCode: document.world.roomCode,
      isPublicWorld: document.world.isPublicWorld, blocks: document.blocks, customBlocks: document.customBlocks,
      blueprints: document.blueprints, hotkeys: hotkeyConfig, completeDocument: document,
    });
  }, [hotkeyConfig, persistence.currentDocument]);

  // The local receipt follows transaction completion. Cloud backup is an explicit separate operation.
  const performSaveSnapshot = useCallback(async (trigger: 'auto' | 'manual'): Promise<boolean> => {
    const token = JSON.stringify(editor.getToken());
    const succeeded = await persistence.save();
    if (!succeeded) {
      if (trigger === 'manual') appendLog('//save', 'The project was not saved. Retry or download your work from the recovery notice.', false);
      return false;
    }
    if (trigger === 'manual') {
      if (token !== JSON.stringify(editor.getToken())) {
        appendLog('//save', 'Saved the captured revision. Later edits remain in your open project.');
      } else {
        const payload = handleBuildCurrentBackupPayload();
        setLocalSnapshots(previous => [{ id: createStudioId('snapshot'), savedAt: payload.savedAt, worldName: payload.worldName, blockCount: payload.blockCount, trigger, backup: payload }, ...previous.slice(0, 5)]);
        handleCreateGitCommit(`Manual save (${payload.blockCount} blocks)`);
        appendLog('//save', `Saved "${payload.worldName}" locally. Download a project copy for an independent backup.`);
      }
    }
    return true;
  }, [editor, persistence.save, handleBuildCurrentBackupPayload, appendLog, handleCreateGitCommit]);

  // Restores are validated, durable copies; original project revisions remain recoverable.
  const handleRestoreFromBackup = useCallback(async (backup: BrickForgeProjectBackup, sourceLabel: string) => {
    const raw = JSON.stringify(backup);
    const result = importStudioCandidate(raw, persistence.importDefaults());
    if (result.ok === false) { appendLog('//restore', result.error.message, false); return false; }
    const restored = await persistence.restoreCopy(result.value, [{ sourceId: sourceLabel, raw }]);
    appendLog('//restore', restored ? `Restored "${result.value.world.worldName}" as a separate project.` : 'Restore stopped. Your current project was retained.', restored);
    return restored;
  }, [persistence.importDefaults, persistence.restoreCopy, appendLog]);

  // Expand world into a target chunk (cx, cz) with a starter island/platform pad
  const handleExpandChunk = useCallback(
    (cx: number, cz: number, style: ChunkExpansionStyle) => {
      return editor.transaction('Expand Chunk', () => {
      const k = chunkKey(cx, cz);
      setEngineState((prev) => {
        const res = expandWorldIntoChunk(
          prev,
          cx,
          cz,
          style,
          chunkConfig.chunkSize
        );
        if (res.error) throw new Error(res.error);
        return res.nextState;
      });
      setChunkConfig((prev) => {
        const unlocked = prev.unlockedChunks.includes(k)
          ? prev.unlockedChunks
          : [...prev.unlockedChunks, k];
        return {
          ...prev,
          unlockedChunks: unlocked,
          activeChunks: {
            ...prev.activeChunks,
            [k]: true,
          },
        };
      });
      appendLog(
        `//chunk expand (${cx}, ${cz})`,
        `Expanded world into Chunk (${cx}, ${cz}) with "${style}" pad.`,
        true
      );
      });
    },
    [chunkConfig.chunkSize, appendLog]
  );

  // Single-cell and volume placement share the same detached proposal rules.
  const handlePlaceBlockAt = useCallback((coord: GridCoord) => editor.transaction('Place Block At', () => {
    const source = editor.getEngineState();
    const proposal = prepareStudioBrush(editor.getDocument(), source, { center: coord, mode: 'place', brush: SINGLE_CELL_BRUSH,
      activeBlockId, rotation: placementRotation, customScale: activeBlockScale, symmetry: symmetryConfig });
    if (!proposal.affectedCount) return;
    setEngineState(proposal.state); setChunkConfig(proposal.chunkConfig);
    editor.afterCommit(() => playBlockPlaceSound(activeBlockId, coord.y, userProgress.soundEnabled, userProgress.hapticsEnabled));
    editor.afterCommit(() => incrementUsageCount(activeBlockId, proposal.affectedCount));
    const placed = proposal.state.blocks[coordKey(proposal.changedCoords[0].x, proposal.changedCoords[0].y, proposal.changedCoords[0].z)];
    const nowMs = Date.now(), newPlacementEntry: PlacementHistoryEntry = {
      coord: { ...placed.position }, blockDefId: placed.blockDefId, rotation: placed.rotation, timestamp: nowMs,
    };
    if (copilotConfig.adaptiveLearningEnabled !== false) {
      const objCls = copilotConfig.targetObjectClass && copilotConfig.targetObjectClass !== 'auto_detect'
        ? copilotConfig.targetObjectClass : detectArchitecturalObjectClass({ blocks: source.blocks, customBlocks: source.customBlocks, hoveredCoord: coord }).classId;
      editor.afterCommit(() => setPatternArchive(previous => recordPlacementInPatternArchive({ archive: previous,
        newPlacement: newPlacementEntry, recentPlacements, blocks: source.blocks, customBlocks: source.customBlocks,
        activeObjectClass: objCls, nowMs })));
    }
    editor.afterCommit(() => setRecentPlacements(previous => [...previous.slice(-7), newPlacementEntry]));
  }, directEditToken), [editor, directEditToken, activeBlockId, placementRotation, activeBlockScale, symmetryConfig,
    userProgress.soundEnabled, userProgress.hapticsEnabled, incrementUsageCount, copilotConfig.adaptiveLearningEnabled,
    copilotConfig.targetObjectClass, recentPlacements, setChunkConfig]);

  const handleEraseBlockAt = useCallback((coord: GridCoord) => editor.transaction('Erase Block At', () => {
    const proposal = prepareStudioBrush(editor.getDocument(), editor.getEngineState(), { center: coord, mode: 'erase', brush: SINGLE_CELL_BRUSH,
      activeBlockId, rotation: 0, symmetry: symmetryConfig });
    if (!proposal.affectedCount) return;
    setEngineState(proposal.state);
    editor.afterCommit(() => playBlockEraseSound(coord.y, userProgress.soundEnabled, userProgress.hapticsEnabled));
    if (copilotConfig.adaptiveLearningEnabled !== false) editor.afterCommit(() => setPatternArchive(previous => {
      const result = recordBlockRemovalForLingerLearning({ archive: previous, removedCoords: proposal.changedCoords });
      if (result.penalizedCount > 0) {
        setLastLingerPenaltyToast(`Copilot learned from removal (-${result.penalizedCount} pattern weight)`);
        window.setTimeout(() => setLastLingerPenaltyToast(null), 4200);
      }
      return result.nextArchive;
    }));
  }, directEditToken), [editor, directEditToken, activeBlockId, symmetryConfig, copilotConfig.adaptiveLearningEnabled,
    userProgress.soundEnabled, userProgress.hapticsEnabled]);

  // Paint block material/type at coordinate
  const handlePaintBlockAt = useCallback(
    (coord: GridCoord) => {
      return editor.transaction('Paint Block At', () => {
      const error = getGridCoordError(coord); if (error) throw new Error(error);
      editor.afterCommit(() => incrementUsageCount(activeBlockId, 1));
      setEngineState((prev) => {
        const k = coordKey(coord.x, coord.y, coord.z);
        const existing = prev.blocks[k];
        const activeDef = prev.customBlocks[activeBlockId];
        if (!existing || !activeDef) return prev;
        const withUndo = pushUndoSnapshot(prev, `Paint ${activeDef.name}`);
        if (isJavaLocked) {
          // In the game profile, material painting means a real native block-state change.
          // Per-instance color/texture overrides are not admitted by this candidate.
          return { ...withUndo, blocks: { ...withUndo.blocks, [k]: { ...existing, blockDefId: activeDef.id } } };
        }
        return {
          ...withUndo,
          blocks: {
            ...withUndo.blocks,
            [k]: {
              ...existing,
              colorOverride: activeDef.color,
              textureOverride: activeDef.texturePattern,
              materialOverride: activeDef.materialFinish,
            },
          },
        };
      });
      }, directEditToken);
    },
    [activeBlockId, incrementUsageCount, isJavaLocked, directEditToken]
  );

  // Eyedropper pick block at coordinate
  const handlePickBlockAt = useCallback(
    (coord: GridCoord) => {
      const k = coordKey(coord.x, coord.y, coord.z);
      const blk = engineState.blocks[k];
      if (blk) {
        editor.afterCommit(() => setActiveBlockId(blk.blockDefId));
        editor.afterCommit(() => setToolMode('place'));
        appendLog('//pick', `Picked block ${blk.blockDefId}`, true);
      }
    },
    [engineState.blocks, appendLog]
  );

  // Stamp active blueprint at coordinate
  const handleStampBlueprintAt = useCallback(
    (coord: GridCoord) => {
      return editor.transaction('Stamp Blueprint At', () => {
      if (!activeBlueprint) return;
      const error = validateBlueprintPlacement(editor.getEngineState(), activeBlueprint, coord, placementRotation);
      if (error) throw new Error(error);
      setEngineState((prev) =>
        stampBlueprintIntoWorld(prev, activeBlueprint, coord, placementRotation)
      );
      appendLog(
        `//stamp ${activeBlueprint.name}`,
        `Stamped blueprint "${activeBlueprint.name}" (${activeBlueprint.blocks.length} blocks) at (${coord.x}, ${coord.y}, ${coord.z}).`,
        true
      );
      }, directEditToken);
    },
    [activeBlueprint, placementRotation, appendLog, directEditToken]
  );

  // Set Pos1 / Pos2
  const handleSetPos1 = useCallback(
    (coord: GridCoord) => {
      return editor.transaction('Set Pos1', () => {
      setEngineState((prev) => ({ ...prev, pos1: coord }));
      appendLog('//pos1', `Pos1 set to (${coord.x}, ${coord.y}, ${coord.z})`, true);
      }, directEditToken);
    },
    [appendLog, directEditToken]
  );

  const handleSetPos2 = useCallback(
    (coord: GridCoord) => {
      return editor.transaction('Set Pos2', () => {
      setEngineState((prev) => ({ ...prev, pos2: coord }));
      appendLog('//pos2', `Pos2 set to (${coord.x}, ${coord.y}, ${coord.z})`, true);
      }, directEditToken);
    },
    [appendLog, directEditToken]
  );

  const handleClearSelection = useCallback(() => {
    editor.transaction('Clear selection', () => {
      setEngineState((prev) => ({ ...prev, pos1: null, pos2: null }));
    }, directEditToken);
    setSelectionGizmoUnlocked(false);
    setActiveCommandPreviewMode(null);
    setToolMode((current) => (current === 'wand_select' ? 'place' : current));
    appendLog('//desel', 'Cleared 3D region selection.', true);
  }, [editor, directEditToken, appendLog]);

  // Nudge 3D selection box face handle (+x, -x, +y, -y, +z, -z)
  const handleNudgeSelectionFace = useCallback(
    (face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z', delta: number) => {
      return editor.transaction('Nudge Selection Face', () => {
      setEngineState((prev) => {
        if (!prev.pos1 || !prev.pos2) return prev;
        const b = getSelectionBounds(prev.pos1, prev.pos2);
        const min = { x: b.minX, y: b.minY, z: b.minZ };
        const max = { x: b.maxX, y: b.maxY, z: b.maxZ };
        if (face === '+x') max.x = Math.max(min.x, max.x + delta);
        if (face === '-x') min.x = Math.min(max.x, min.x - delta);
        if (face === '+y') max.y = Math.max(min.y, max.y + delta);
        if (face === '-y') min.y = Math.min(max.y, min.y - delta);
        if (face === '+z') max.z = Math.max(min.z, max.z + delta);
        if (face === '-z') min.z = Math.min(max.z, min.z - delta);
        return { ...prev, pos1: min, pos2: max };
      });
      }, directEditToken);
    },
    [directEditToken]
  );

  // Scroll-resize selection box while holding selection gizmo modifier
  const handleScrollResizeSelection = useCallback((direction: 1 | -1) => editor.transaction('Resize selection', () => {
    setEngineState((prev) => {
      if (!prev.pos1 || !prev.pos2) return prev;
      const next = transformSelectionBox(
        prev.pos1,
        prev.pos2,
        direction > 0 ? 'expand_all' : 'contract_all',
        1
      );
      if (next.error) throw new Error(next.error);
      return { ...prev, pos1: next.pos1, pos2: next.pos2 };
    });
  }, directEditToken), [editor, directEditToken]);

  // One complete session commit for all mirrored brush cells and revealed chunks.
  const handleApplyVolumeBrushAt = useCallback((center: GridCoord, mode: 'place' | 'erase' | 'brush_place' | 'brush_erase') => {
    let affectedCount = 0;
    const result = editor.transaction('Apply Volume Brush At', () => {
      const proposal = prepareStudioBrush(editor.getDocument(), editor.getEngineState(), { center, mode, brush: volumeBrush,
        activeBlockId, rotation: placementRotation, customScale: activeBlockScale, symmetry: symmetryConfig });
      affectedCount = proposal.affectedCount;
      if (!affectedCount) return;
      setEngineState(proposal.state); setChunkConfig(proposal.chunkConfig);
      if (mode === 'place' || mode === 'brush_place') editor.afterCommit(() => incrementUsageCount(activeBlockId, affectedCount));
      else if (copilotConfig.adaptiveLearningEnabled !== false) editor.afterCommit(() => setPatternArchive(previous => {
        const learned = recordBlockRemovalForLingerLearning({ archive: previous, removedCoords: proposal.changedCoords });
        if (learned.penalizedCount > 0) {
          setLastLingerPenaltyToast(`Copilot learned from brush erase (-${learned.penalizedCount} pattern weight)`);
          window.setTimeout(() => setLastLingerPenaltyToast(null), 4200);
        }
        return learned.nextArchive;
      }));
    }, directEditToken);
    return result.status === 'applied' ? { ...result, message: result.message ?? `Changed ${affectedCount} cells. Undo restores the complete brush edit.` } : result;
  }, [editor, directEditToken, volumeBrush, activeBlockId, placementRotation, activeBlockScale, symmetryConfig,
    incrementUsageCount, copilotConfig.adaptiveLearningEnabled, setChunkConfig]);

  // Execute WorldEdit CLI command
  const handleRunCommand = useCallback(
    (rawCmd: string) => {
      if (typeof rawCmd !== 'string' || rawCmd.length > 4096) {
        appendLog('//command', 'Command exceeds the supported length.', false); return { status: 'rejected' as const, message: 'Command exceeds the supported length.' };
      }
      const verb = rawCmd.trim().replace(/^\/+/, '').toLowerCase();
      if (verb === 'undo' || verb === 'redo') {
        const result = verb === 'undo' ? editor.undo() : editor.redo();
        appendLog(rawCmd, result.message ?? (result.status === 'applied' ? `${verb === 'undo' ? 'Undid' : 'Redid'} the complete edit.` : `Nothing to ${verb}.`), result.status !== 'rejected');
        return result;
      }
      const token = editor.getToken();
      const res = executeWorldEditCommand(editor.getEngineState(), rawCmd, hoveredCoord);
      if (!res.success) { appendLog(rawCmd, res.message, false); return { status: 'rejected' as const, message: res.message }; }
      const result = editor.transaction('Command', () => { setEngineState(res.nextState); }, token);
      appendLog(rawCmd, result.status === 'rejected' ? result.message! : res.message, result.status !== 'rejected');
      if (result.status !== 'rejected' && res.equipWand) setToolMode('wand_select');
      if (result.status !== 'rejected' && ['desel', 'deselect', 'sel'].includes(verb)) {
        setSelectionGizmoUnlocked(false);
        setActiveCommandPreviewMode(null);
        setToolMode(current => current === 'wand_select' ? 'place' : current);
      }
      return result;
    },
    [editor, hoveredCoord, appendLog]
  );

  // Save a newly designed Custom Block from Workshop
  const handleSaveCustomBlock = useCallback(async (
    blockDef: CustomBlockDefinition, saveAsPublicBp: boolean, description: string
  ) => {
    const bp = createBlueprintFromCustomBlock(blockDef, description, user?.uid || 'local_builder', user?.displayName || user?.email || 'Local Builder', saveAsPublicBp);
    const result = editor.transaction('Create workshop block and blueprint', () => {
      const collision = validateBlueprintDefinitionMerge(editor.getEngineState().customBlocks, [blockDef]);
      if (collision) throw new Error(collision);
      setEngineState(prev => ({ ...prev, customBlocks: { ...prev.customBlocks, [blockDef.id]: blockDef } }));
      setBlueprints(prev => [bp, ...prev]);
      editor.afterCommit(() => {
        setHotbarBlockIds(prev => prev.includes(blockDef.id) ? prev : [blockDef.id, ...prev.slice(0, 8)]);
        setActiveBlockId(blockDef.id); setToolMode('place');
      });
      appendLog('//workshop', `Created "${blockDef.name}" and its blueprint.`, true);
    });
    if (result.status === 'applied' && saveAsPublicBp && user) {
      try { await saveBlueprintToCloud(bp); }
      catch { appendLog('//workshop cloud', 'Saved locally; cloud publication failed.', false); }
    }
    return result.status === 'applied';
  }, [editor, user, appendLog]);

  // Save Pos1..Pos2 selection (or entire world) as a Structure Blueprint
  const handleSaveSelectionBlueprint = useCallback((
    name: string, description: string, isPublic: boolean, captureWholeWorld: boolean
  ): boolean => {
    let state = editor.getEngineState();
    if (captureWholeWorld) {
      const blocks = Object.values(state.blocks);
      if (!blocks.length) return false;
      const min = { ...blocks[0].position }, max = { ...min };
      for (const { position } of blocks) for (const axis of ['x', 'y', 'z'] as const) {
        min[axis] = Math.min(min[axis], position[axis]); max[axis] = Math.max(max[axis], position[axis]);
      }
      state = { ...state, pos1: min, pos2: max };
    }
    const bp = createBlueprintFromSelection(state, name, description, user?.uid || 'local_builder', user?.displayName || user?.email || 'Local Builder', isPublic);
    if (!bp) return false;
    const result = editor.transaction('Save selection blueprint', () => {
      setBlueprints(prev => [bp, ...prev]);
      editor.afterCommit(() => { setActiveBlueprint(bp); });
      appendLog('//blueprint save', `Saved "${bp.name}" (${bp.blocks.length} blocks).`);
    });
    if (result.status !== 'applied') return false;
    if (isPublic && user) void saveBlueprintToCloud(bp).catch(() => appendLog('//blueprint cloud', 'Saved locally; cloud publication failed.', false));
    return true;
  }, [editor, user, appendLog]);

  // Equip a blueprint for interactive stamping
  const handleEquipBlueprintStamp = useCallback((bp: BlueprintPrefab) => {
    // Equipping is a tool preference. Definitions are admitted with the stamp itself.
    setActiveBlueprint(bp); setToolMode('stamp_blueprint');
    appendLog('//blueprint equip', `Equipped "${bp.name}". Stamping validates the complete blueprint.`);
  }, [appendLog]);

  // Immediately stamp a blueprint at Pos1 in current world
  const handlePlaceBlueprintAtPos1 = useCallback(
    (bp: BlueprintPrefab) => {
      return editor.transaction('Place Blueprint At Pos1', () => {
      const target = editor.getEngineState().pos1 || { x: 0, y: 1, z: 0 };
      const error = validateBlueprintPlacement(editor.getEngineState(), bp, target, placementRotation);
      if (error) throw new Error(error);
      setEngineState((prev) =>
        stampBlueprintIntoWorld(prev, bp, target, placementRotation)
      );
      appendLog(
        `//blueprint place`,
        `Placed blueprint "${bp.name}" (${bp.blocks.length} blocks) at (${target.x}, ${target.y}, ${target.z}).`,
        true
      );
      });
    },
    [engineState.pos1, placementRotation, appendLog]
  );

  // Load a saved blueprint into a fresh world
  const handleLoadBlueprintIntoNewWorld = useCallback(async (bp: BlueprintPrefab) => {
    const state = editor.getEngineState();
    const error = validateBlueprintLoad(state, bp, true);
    if (error) { appendLog('//blueprint new-world', error, false); return false; }
    const next = loadBlueprintIntoNewWorld(state, bp, true);
    const candidate = { ...editor.getDocument(), blocks: next.blocks, customBlocks: next.customBlocks,
      chunkConfig: structuredClone(DEFAULT_CHUNK_CONFIG),
      world: { worldId: createStudioId('world'), worldName: `${bp.name} World`, roomCode: '', isPublicWorld: false },
    };
    const opened = await persistence.restoreCopy(candidate);
    appendLog('//blueprint new-world', opened ? `Opened "${bp.name}" as a separate project.` : 'New project was not opened; current work is preserved.', opened);
    return opened;
  }, [editor, persistence.restoreCopy, appendLog]);

  const handleDeleteBlueprint = useCallback((bpId: string) => {
    const result = editor.transaction('Remove library blueprint', () => { setBlueprints(prev => prev.filter(bp => bp.id !== bpId)); });
    if (result.status === 'applied') appendLog('//blueprint remove', 'Removed the local library entry. Undo restores it.');
  }, [editor, appendLog]);

  const handleImportBlueprintJson = useCallback(async (rawJson: string): Promise<boolean> => {
    const token = editor.getToken();
    const prepared = prepareBlueprintImport(rawJson, { sourceId: 'blueprint:import', authorId: user?.uid || 'local_builder', authorName: user?.displayName || 'Local Builder' });
    if (!prepared.ok) { appendLog('//blueprint import', prepared.error.message, false); return false; }
    const { blueprint, document, legacySources } = prepared.value;
    if (!await persistence.preserveResourceCandidate(document, legacySources, JSON.stringify(token))) {
      appendLog('//blueprint import', 'The original could not be preserved for this edit revision. Nothing was imported; review the project notice and retry.', false);
      return false;
    }
    const result = editor.transaction('Import blueprint', () => { setBlueprints(prev => [blueprint, ...prev]); }, token);
    if (result.status === 'rejected') appendLog('//blueprint import', result.message!, false);
    return result.status === 'applied';
  }, [editor, user, persistence.preserveResourceCandidate, appendLog]);

  const handleRefreshCloudBlueprints = useCallback(async () => {
    const token = editor.getToken();
    setIsLoadingCloudBp(true);
    try {
      const cloudList = await fetchCloudBlueprints();
      const result = editor.transaction('Import cloud library', () => {
        setBlueprints(prev => {
          const map = new Map(prev.map(bp => [bp.id, bp]));
          for (const bp of cloudList) {
            const existing = map.get(bp.id);
            if (existing && JSON.stringify(existing) !== JSON.stringify(bp)) throw new Error(`Cloud blueprint "${bp.name}" conflicts with a local entry. Import a separate copy.`);
            map.set(bp.id, bp);
          }
          return [...map.values()];
        });
      }, token);
      if (result.status === 'rejected') appendLog('//cloud library', result.message!, false);
    } catch (error) { appendLog('//cloud library', error instanceof Error ? error.message : 'Cloud library unavailable.', false); }
    finally { setIsLoadingCloudBp(false); }
  }, [editor, appendLog]);

  const handleRefreshCloudWorlds = useCallback(async () => {
    try {
      const list = await listUserAndPublicWorlds();
      setCloudWorlds(list);
    } catch {
      // Ignore if guest
    }
  }, []);

  const handleSaveCurrentWorldToCloud = useCallback(async () => {
    const token = editor.getToken(), document = editor.getDocument();
    const savedId = await saveWorldToCloud({
      worldId: document.world.worldId, name: document.world.worldName, roomCode: document.world.roomCode,
      isPublic: document.world.isPublicWorld, blocks: document.blocks, customBlocks: document.customBlocks,
    });
    const result = editor.transaction('Record cloud identity', () => { setWorldId(savedId); }, token);
    appendLog('//cloud save', result.status === 'rejected' ? 'The captured cloud snapshot was saved; newer local work remains unchanged.' : 'Saved the captured cloud snapshot. Live co-editing is not connected.');
    await handleRefreshCloudWorlds();
  }, [editor, appendLog, handleRefreshCloudWorlds]);

  const handleJoinCloudWorld = useCallback(async (summary: CloudWorldSummary) => {
    const prepared = prepareCloudSnapshotImport({ sourceId: `cloud:${summary.id}`, name: summary.name,
      blocksData: summary.blocksData, ...(summary.customBlocksData === undefined ? {} : { customBlocksData: summary.customBlocksData }) });
    if (!prepared.ok) { appendLog('//cloud open', prepared.error.message, false); return; }
    const opened = await persistence.restoreCopy(prepared.value.document, prepared.value.legacySources);
    appendLog('//cloud open', opened ? 'Opened a separate local copy with its original cloud data preserved. Live co-editing is not connected.' : 'Cloud copy was not opened; current work is preserved.', opened);
  }, [persistence.restoreCopy, appendLog]);

  // Whole-world live replacement has no conflict protocol. It cannot write into
  // this session. Cloud snapshots enter only through verified separate-copy recovery.

  // Broadcast cursor presence in live multiplayer mode
  const handleCursorMove = useCallback(
    (coord: GridCoord) => {
      setHoveredCoord(coord);
      if (isLiveConnected && user) {
        updateCollaboratorPresence(
          worldId,
          coord,
          toolMode,
          '#F59E0B',
          isPublicWorld
        ).catch(() => {});
      }
    },
    [isLiveConnected, user, worldId, toolMode, isPublicWorld]
  );

  // Event-driven Local Spatial Copilot computations (<1.2ms on Pixel 8 Pro, zero idle frame cost)
  const detectedSymmetry = useMemo(() => {
    if (!copilotConfig.enabled || !copilotConfig.autoDetectSymmetry) return null;
    return detectWorldSymmetry(engineState.blocks, recentPlacements);
  }, [
    copilotConfig.enabled,
    copilotConfig.autoDetectSymmetry,
    engineState.blocks,
    recentPlacements,
  ]);

  const detectedObjectClass = useMemo(() => {
    if (!copilotConfig.enabled) return null;
    return detectArchitecturalObjectClass({
      blocks: engineState.blocks,
      customBlocks: engineState.customBlocks,
      hoveredCoord,
      archive: patternArchive,
      forcedClass: copilotConfig.targetObjectClass,
    });
  }, [
    copilotConfig.enabled,
    copilotConfig.targetObjectClass,
    engineState.blocks,
    engineState.customBlocks,
    hoveredCoord,
    patternArchive,
  ]);

  const copilotPredictions = useMemo(() => {
    if (
      isJavaLocked ||
      !copilotConfig.enabled ||
      !copilotConfig.ghostAutoCompleteEnabled ||
      toolMode !== 'place'
    ) {
      return [];
    }
    return predictNextBlocksCopilot({
      hoveredCoord,
      activeBlockId,
      placementRotation,
      blocks: engineState.blocks,
      customBlocks: engineState.customBlocks,
      recentPlacements,
      maxPredictions: 4,
      archive:
        copilotConfig.adaptiveLearningEnabled !== false
          ? patternArchive
          : undefined,
      detectedObjectClass,
      patternConfig,
      connectedTextureGhostMatch:
        copilotConfig.connectedTextureGhostMatch !== false,
    });
  }, [
    isJavaLocked,
    copilotConfig.enabled,
    copilotConfig.ghostAutoCompleteEnabled,
    copilotConfig.adaptiveLearningEnabled,
    copilotConfig.connectedTextureGhostMatch,
    toolMode,
    hoveredCoord,
    activeBlockId,
    placementRotation,
    engineState.blocks,
    engineState.customBlocks,
    recentPlacements,
    patternArchive,
    detectedObjectClass,
    patternConfig,
  ]);
  // A displayed proposal belongs to this source generation, including edit→Undo.
  // Any intervening mutation before React renders the new proposal rejects Apply.
  const copilotProposalToken = useMemo(() => editor.getToken(), [editor, editorSnapshot.sessionId, editorSnapshot.editRevision, copilotPredictions, symmetryConfig, patternConfig]);

  const selectionMorphology = useMemo(() => {
    if (!copilotConfig.enabled) return null;
    return analyzeSelectionMorphology(
      engineState.pos1,
      engineState.pos2,
      engineState.blocks,
      activeBlockId
    );
  }, [
    copilotConfig.enabled,
    engineState.pos1,
    engineState.pos2,
    engineState.blocks,
    activeBlockId,
  ]);

  const commandPreviewCoords = useMemo(() => {
    if (
      !copilotConfig.enabled ||
      !copilotConfig.selectionCommandGhostPreview ||
      !activeCommandPreviewMode
    ) {
      return [];
    }
    return computeCommandPreviewCoords(
      engineState.pos1,
      engineState.pos2,
      activeCommandPreviewMode,
      engineState.blocks
    );
  }, [
    copilotConfig.enabled,
    copilotConfig.selectionCommandGhostPreview,
    activeCommandPreviewMode,
    engineState.pos1,
    engineState.pos2,
    engineState.blocks,
  ]);

  const walkabilityReport = useMemo(() => {
    if (!copilotConfig.enabled) return null;
    return auditWorldWalkability(engineState.blocks, engineState.customBlocks);
  }, [copilotConfig.enabled, engineState.blocks, engineState.customBlocks]);
  const walkabilityProposalToken = useMemo(() => editor.getToken(), [editor, editorSnapshot.sessionId, editorSnapshot.editRevision, walkabilityReport]);

  // Accept predicted Ghost Auto-Complete blocks (Tab or 1-tap HUD button)
  const handleAcceptCopilotPredictions = useCallback(() => {
      return editor.transaction('Accept Copilot Predictions', () => {
    if (copilotPredictions.length === 0) return;

    editor.afterCommit(() => playGhostAcceptArpeggio(
      userProgress.soundEnabled,
      userProgress.hapticsEnabled
    ));
    editor.afterCommit(() => incrementUsageCount(activeBlockId, copilotPredictions.length));

    if (copilotConfig.adaptiveLearningEnabled !== false) {
      const anchorBlockId =
        recentPlacements[recentPlacements.length - 1]?.blockDefId ||
        activeBlockId;
      editor.afterCommit(() => setPatternArchive((prevArch) =>
        recordAcceptedGhostPredictionsInArchive({
          archive: prevArch,
          acceptedPredictions: copilotPredictions,
          anchorBlockId,
          lingerWindowSec: copilotConfig.lingerTrackingWindowSec || 45,
          activeObjectClass: detectedObjectClass?.classId || 'house_dwelling',
        })
      ));
    }

    setEngineState((prev) => {
      const withUndo = pushUndoSnapshot(
        prev,
        `Copilot Auto-Complete (+${copilotPredictions.length})`
      );
      const nextBlocks = { ...withUndo.blocks };
      for (const pred of copilotPredictions) {
        const def = prev.customBlocks[pred.blockDefId];
        if (!def) throw new Error('A predicted block definition is no longer available. Recompute the preview.');
        const symTargets = computeSymmetryTargets(
          pred.position,
          pred.rotation,
          symmetryConfig
        );
        for (const t of symTargets) {
          const k = coordKey(t.coord.x, t.coord.y, t.coord.z);
          const ctmPred =
            copilotConfig.connectedTextureGhostMatch !== false
              ? predictBlockAttributesOnPlacement({
                  coord: t.coord,
                  def,
                  allBlocks: nextBlocks,
                  allDefs: prev.customBlocks,
                  config: patternConfig,
                })
              : { colorOverride: pred.colorOverride, textureOverride: pred.textureOverride };
          nextBlocks[k] = {
            id: nextBlocks[k]?.id ?? createStudioId('block'),
            blockDefId: def.id,
            position: { ...t.coord },
            rotation: t.rotation,
            colorOverride: ctmPred.colorOverride ?? pred.colorOverride,
            textureOverride: ctmPred.textureOverride ?? pred.textureOverride,
          };
        }
      }
      return { ...withUndo, blocks: nextBlocks };
    });
    const lastPred = copilotPredictions[copilotPredictions.length - 1];
    editor.afterCommit(() => setRecentPlacements((prev) => [
      ...prev.slice(-6),
      {
        coord: { ...lastPred.position },
        blockDefId: lastPred.blockDefId,
        rotation: lastPred.rotation,
        timestamp: Date.now(),
      },
    ]));
    appendLog(
      '//copilot accept',
      `Accepted +${copilotPredictions.length} predicted ghost blocks (${copilotPredictions[0].reason}). Monitored in 45s linger buffer.`,
      true
    );
      }, copilotProposalToken);
  }, [
    copilotPredictions,
    copilotProposalToken,
    incrementUsageCount,
    activeBlockId,
    copilotConfig.adaptiveLearningEnabled,
    copilotConfig.lingerTrackingWindowSec,
    copilotConfig.connectedTextureGhostMatch,
    recentPlacements,
    detectedObjectClass,
    symmetryConfig,
    patternConfig,
    appendLog,
  ]);

  // Auto-Place Voxel Lanterns in dark interior spots flagged by Walkability Audit
  const handleAutoLightDarkSpots = useCallback(() => {
    return editor.transaction('Auto-light interior', () => {
      if (!walkabilityReport?.darkInteriorCoords.length) return;
      const previous = editor.getEngineState(), blocks = { ...previous.blocks };
      let placed = 0;
      for (const position of walkabilityReport.darkInteriorCoords.slice(0, 8)) {
        const key = coordKey(position.x, position.y, position.z);
        if (!blocks[key]) { blocks[key] = { id: createStudioId('block'), blockDefId: 'voxel_lantern', position: { ...position }, rotation: 0 }; placed++; }
      }
      setEngineState({ ...previous, blocks });
      appendLog('//copilot light', `Placed ${placed} lanterns.`);
    }, walkabilityProposalToken);
  }, [editor, walkabilityReport, walkabilityProposalToken, appendLog]);

  // Every HUD macro opens the same detached review; choosing a recipe never applies it.
  const handleTriggerMacroLoop = useCallback((macro: CommandMacroLoop) => {
    const cursor = studioCellAnchor(hoveredCoord ?? editor.getEngineState().pos1 ?? { x: 0, y: 1, z: 0 });
    recipeModel.show(recipeBlockId);
    recipeModel.loadMacro(macro, recipeBlockId, cursor, false, recipeModel.getSnapshot().version);
  }, [editor, recipeModel, recipeBlockId, hoveredCoord]);

  // Add local catalogue definitions without retargeting existing instances.
  const handleInstallMarketBlocks = useCallback(
    (defs: CustomBlockDefinition[]) => {
      return editor.transaction('Add catalogue blocks', () => {
      if (defs.length === 0) return;
      const collision = validateBlueprintDefinitionMerge(editor.getEngineState().customBlocks, defs);
      if (collision) throw new Error(collision);
      setEngineState((prev) => {
        const nextCustom = { ...prev.customBlocks };
        for (const d of defs) {
          if (!Object.hasOwn(nextCustom, d.id)) nextCustom[d.id] = structuredClone(d);
        }

        return { ...prev, customBlocks: nextCustom };
      });
      if (!isJavaLocked || eligibleBlockIds.includes(defs[0].id)) {
        editor.afterCommit(() => setActiveBlockId(defs[0].id));
        editor.afterCommit(() => setToolMode('place'));
      }
      appendLog(
        '//market install',
        defs.length === 1
          ? `Added "${defs[0].name}" from the local catalogue to your Studio Library.`
          : `Added ${defs.length} catalogue blocks to your Studio Library.`,
        true
      );
      });
    },
    [editor, appendLog, isJavaLocked, eligibleBlockIds, setActiveBlockId]
  );

  // Assign a block from the Studio Library directly to Primary Hotbar Slot 1..9
  const handleAssignBlockToPrimarySlot = useCallback(
    (blockId: string, slotIndex: number) => {
      const clampedIdx = Math.max(0, Math.min(8, slotIndex));
      editor.afterCommit(() => setHotbarBlockIds((prev) => {
        const next = [...prev];
        next[clampedIdx] = blockId;
        return next;
      }));
      setHudConfig((prev) => {
        const nextBars = prev.bars.map((bar) => {
          if (bar.id !== 'bar_primary_blocks') return bar;
          const nextSlots = [...bar.slots];
          while (nextSlots.length <= clampedIdx) nextSlots.push(null);
          nextSlots[clampedIdx] = {
            id: `slot_1_${clampedIdx + 1}`,
            type: 'block',
            targetId: blockId,
            hotkeyHint: String(clampedIdx + 1),
          };
          return { ...bar, slots: nextSlots };
        });
        const next = { ...prev, bars: nextBars };
        try {
          localStorage.setItem(LOCAL_MODULAR_HUD_KEY, JSON.stringify(next));
        } catch {
          // Ignore
        }
        return next;
      });
      editor.afterCommit(() => setActiveBlockId(blockId));
      editor.afterCommit(() => setToolMode('place'));
    },
    []
  );

  // Named checkpoints preserve full documents. Earlier copies remain available in Recovery.
  const handleSaveProjectSlot = useCallback(async (name: string, description: string): Promise<boolean> => {
    const saved = await persistence.saveNamedCopy(name, description);
    if (saved) setProjectCatalogVersion(version => version + 1);
    appendLog('//project checkpoint', saved ? `Saved a complete named copy: "${name}".` : 'Named copy was not saved. Check the recovery notice.', saved);
    return saved;
  }, [persistence.saveNamedCopy, appendLog]);

  const handleLoadProjectSlot = useCallback(async (project: SavedStudioProject): Promise<boolean> => {
    const raw = JSON.stringify(project.completeDocument ?? project);
    const result = importStudioCandidate(raw, persistence.importDefaults());
    if (result.ok === false) { appendLog('//project open', result.error.message, false); return false; }
    const opened = await persistence.restoreCopy(result.value, [{ sourceId: `project:${project.id}`, raw }]);
    if (opened) setProjectCatalogVersion(version => version + 1);
    return opened;
  }, [persistence.importDefaults, persistence.restoreCopy, appendLog]);

  const handleImportProjectJson = useCallback(async (rawJson: string): Promise<boolean> => {
    const result = importStudioCandidate(rawJson, persistence.importDefaults());
    if (result.ok === false) { appendLog('//project import', result.error.message, false); return false; }
    const opened = await persistence.restoreCopy(result.value, [{ sourceId: 'imported-project-file', raw: rawJson }]);
    if (opened) setProjectCatalogVersion(version => version + 1);
    return opened;
  }, [persistence.importDefaults, persistence.restoreCopy, appendLog]);

  // Reset Entire World to a Selected Template
  const handleResetEntireWorld = useCallback((template: WorldResetTemplateId) => {
    return editor.transaction('Reset world', () => {
      const result = resetEntireWorldToTemplate(editor.getEngineState(), template, editor.getDocument().chunkConfig.chunkSize);
      setEngineState(result.nextState);
      setChunkConfig(DEFAULT_CHUNK_CONFIG);
      appendLog('//reset world', result.summary);
    });
  }, [editor, appendLog]);

  const handleResetSpecificChunk = useCallback((cx: number, cz: number, style: 'clear_air' | 'grass_island' | 'stone_foundation' | 'timber_deck' | 'sandstone_plaza') => {
    return editor.transaction('Reset chunk', () => {
      const result = resetSpecificChunkInWorld(editor.getEngineState(), cx, cz, style, editor.getDocument().chunkConfig.chunkSize);
      setEngineState(result.nextState);
      appendLog('//reset chunk', result.summary);
    });
  }, [editor, appendLog]);

  // Engagement Handlers: Atmosphere Presets, Procedural Biomes, Contract XP & Compliance Purge
  const handleSelectAtmospherePreset = useCallback(
    (presetId: AtmospherePresetId) => {
      return editor.transaction('Select Atmosphere Preset', () => {
      const preset = getAtmospherePresetById(presetId);
      editor.afterCommit(() => setActiveAtmosphereId(preset.id));
      editor.afterCommit(() => setDaylightMode(preset.daylightMode));
      setLightingConfig({ ...preset.lighting });
      appendLog(
        `//atmosphere ${preset.id}`,
        `Applied "${preset.name}" solar & fog preset.`,
        true
      );
      });
    },
    [appendLog]
  );

  const handleGenerateProceduralBiome = useCallback(
    (biomeId: ProceduralBiomeId, syncAtmosphere: boolean) => {
      return editor.transaction('Generate Procedural Biome', () => {
      const res = applyProceduralBiomeToWorld(editor.getEngineState(), biomeId);
      setEngineState(res.nextState);
      appendLog(`//biome ${biomeId}`, res.summary, true);
      setChunkConfig(DEFAULT_CHUNK_CONFIG);
      if (syncAtmosphere) {
        const presetId =
          biomeId === 'terraced_zen_garden'
            ? 'dawn_mist'
            : biomeId === 'desert_mesa_citadel'
            ? 'golden_hour'
            : biomeId === 'volcanic_caldera'
            ? 'starlight_midnight'
            : biomeId === 'cyber_grid_plate'
            ? 'overcast_blueprint'
            : 'studio_noon';
        handleSelectAtmospherePreset(presetId);
      }
      editor.afterCommit(() => playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      ));
      });
    },
    [
      appendLog,
      handleSelectAtmospherePreset,
      userProgress.soundEnabled,
      userProgress.hapticsEnabled,
    ]
  );

  const handleClaimContractReward = useCallback(
    (contractId: string, xpReward: number) => {
      if (userProgress.claimedContractIds.includes(contractId)) return;
      editor.afterCommit(() => playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      ));
      const next: StudioUserProgressState = {
        ...userProgress,
        xp: userProgress.xp + xpReward,
        claimedContractIds: [...userProgress.claimedContractIds, contractId],
      };
      persistUserProgress(next);
      emitOasisMilestoneReward({
        milestoneId: `contract:${contractId}`,
        title: `Completed Architectural Contract (${contractId})`,
        studioXpEarned: xpReward,
      });
      appendLog(
        `//contract claim ${contractId}`,
        `Completed Architectural Contract (+${xpReward} XP)! Total: ${next.xp} XP.`,
        true
      );
    },
    [userProgress, persistUserProgress, appendLog]
  );

  const handleClaimDailyPromptReward = useCallback(
    (dateKey: string, bonusXp: number) => {
      if (userProgress.claimedDailyDates.includes(dateKey)) return;
      editor.afterCommit(() => playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      ));
      const streakUpdate = computeUpdatedBuildStreak(
        userProgress.lastBuildDate,
        userProgress.streakDays,
        dateKey
      );
      const next: StudioUserProgressState = {
        ...userProgress,
        xp: userProgress.xp + bonusXp,
        claimedDailyDates: [...userProgress.claimedDailyDates, dateKey],
        streakDays: streakUpdate.streakDays,
        lastBuildDate: streakUpdate.lastBuildDate,
      };
      persistUserProgress(next);
      emitOasisMilestoneReward({
        milestoneId: `daily:${dateKey}`,
        title: `Daily Build Challenge (${dateKey})`,
        studioXpEarned: bonusXp,
      });
      appendLog(
        '//daily claim',
        `Claimed Daily Build Challenge (+${bonusXp} XP, ${next.streakDays}d streak)!`,
        true
      );
    },
    [userProgress, persistUserProgress, appendLog]
  );

  const handleReportOrBlockWorld = useCallback(
    (worldIdOrRoomCode: string) => {
      const nextIds = Array.from(
        new Set([...userProgress.reportedWorldIds, worldIdOrRoomCode])
      );
      persistUserProgress({
        ...userProgress,
        reportedWorldIds: nextIds,
      });
      setCloudWorlds((prev) =>
        prev.filter(
          (w) =>
            w.id !== worldIdOrRoomCode && w.roomCode !== worldIdOrRoomCode
        )
      );
    },
    [userProgress, persistUserProgress]
  );

  // Global Customizable Keyboard Shortcuts Dispatcher
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!persistence.ready || persistence.busy || persistence.recoveryOpen || activeModal !== 'none' || isAuditorModalOpen || recipeSnapshot.open || kitSnapshot.open || isAdaptiveSettingsOpen || showOnboardingTour || hasOpenViewportModal(document) || shouldIgnoreViewportKeyboard(e) || e.code === 'Tab') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ctrl+S / Cmd+S triggers immediate save & backup even if modal is closed
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        performSaveSnapshot('manual');
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleRunCommand(e.shiftKey ? '//redo' : '//undo');
        return;
      }

      if (e.metaKey || e.ctrlKey) return;

      const { bindings } = hotkeyConfig;

      if (matchesKeyBinding(e, bindings.focusCommandLine)) {
        e.preventDefault();
        setCommandInput((prev) => (prev.startsWith('/') ? prev : '//'));
        commandInputRef.current?.focus();
        return;
      }

      if (
        matchesKeyBinding(e, bindings.acceptCopilotGhost) &&
        copilotPredictions.length > 0
      ) {
        e.preventDefault();
        handleAcceptCopilotPredictions();
        return;
      }

      if (matchesKeyBinding(e, bindings.toggleSymmetryMirror)) {
        e.preventDefault();
        setSymmetryConfig((prev) => {
          const order: ('off' | 'mirror_x' | 'mirror_z' | 'quad_xz')[] = [
            'off',
            'mirror_x',
            'mirror_z',
            'quad_xz',
          ];
          const nextMode = order[(order.indexOf(prev.mode) + 1) % order.length];
          return { ...prev, mode: nextMode };
        });
        return;
      }

      if (matchesKeyBinding(e, bindings.toggleMouseLookMode)) {
        e.preventDefault();
        if (!e.repeat) {
          toggleFlyNavigation();
        }
      } else if (matchesKeyBinding(e, bindings.holdMouseLookMode)) {
        e.preventDefault();
        if (!e.repeat) {
          setIsHoldingMouseLook(true);
          navigate('begin-look');
        }
      } else if (matchesKeyBinding(e, bindings.holdSelectionGizmo)) {
        e.preventDefault();
        if (!e.repeat) {
          setIsHoldingSelectionGizmo(true);
        }
      } else if (matchesKeyBinding(e, bindings.rotateBlock)) {
        e.preventDefault();
        setPlacementRotation((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270));
      } else if (matchesKeyBinding(e, bindings.toggleDock)) {
        e.preventDefault();
        setRightSidebarTab((prev) => (prev === 'closed' ? 'legend' : 'closed'));
      } else if (matchesKeyBinding(e, bindings.toggleFlyMode)) {
        e.preventDefault();
        navigate(navigationState.mode === 'fly' ? 'orbit' : 'fly');
      } else if (matchesKeyBinding(e, bindings.resetCamera)) {
        e.preventDefault();
        navigate('home');
      } else if (matchesKeyBinding(e, bindings.toolPlace)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('place'));
      } else if (matchesKeyBinding(e, bindings.toolErase)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('erase'));
      } else if (matchesKeyBinding(e, bindings.toolPaint)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('paint'));
      } else if (matchesKeyBinding(e, bindings.toolPick)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('pick'));
      } else if (matchesKeyBinding(e, bindings.toolWand)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('wand_select'));
      } else if (matchesKeyBinding(e, bindings.toolBrushPlace)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('brush_place'));
      } else if (matchesKeyBinding(e, bindings.toolBrushErase)) {
        e.preventDefault();
        editor.afterCommit(() => setToolMode('brush_erase'));
      } else if (
        matchesKeyBinding(e, bindings.selectionRaiseUp) ||
        matchesKeyBinding(e, bindings.selectionLowerDown) ||
        matchesKeyBinding(e, bindings.selectionShiftNorth) ||
        matchesKeyBinding(e, bindings.selectionShiftSouth) ||
        matchesKeyBinding(e, bindings.selectionShiftWest) ||
        matchesKeyBinding(e, bindings.selectionShiftEast) ||
        matchesKeyBinding(e, bindings.selectionExpandAll) ||
        matchesKeyBinding(e, bindings.selectionContractAll)
      ) {
        e.preventDefault();
        const op = matchesKeyBinding(e, bindings.selectionRaiseUp)
          ? 'raise_up'
          : matchesKeyBinding(e, bindings.selectionLowerDown)
          ? 'lower_down'
          : matchesKeyBinding(e, bindings.selectionShiftNorth)
          ? 'shift_north'
          : matchesKeyBinding(e, bindings.selectionShiftSouth)
          ? 'shift_south'
          : matchesKeyBinding(e, bindings.selectionShiftWest)
          ? 'shift_west'
          : matchesKeyBinding(e, bindings.selectionShiftEast)
          ? 'shift_east'
          : matchesKeyBinding(e, bindings.selectionExpandAll)
          ? 'expand_all'
          : 'contract_all';
        setEngineState((prev) => {
          if (!prev.pos1 || !prev.pos2) return prev;
          const next = transformSelectionBox(prev.pos1, prev.pos2, op, 1);
          return { ...prev, pos1: next.pos1, pos2: next.pos2 };
        });
      } else if (matchesKeyBinding(e, bindings.quickSet)) {
        e.preventDefault();
        handleRunCommand(`//set ${activeBlockId}`);
      } else if (matchesKeyBinding(e, bindings.quickWalls)) {
        e.preventDefault();
        handleRunCommand(`//walls ${activeBlockId}`);
      } else if (matchesKeyBinding(e, bindings.quickCopy)) {
        e.preventDefault();
        handleRunCommand('//copy');
      } else if (matchesKeyBinding(e, bindings.quickPaste)) {
        e.preventDefault();
        handleRunCommand('//paste');
      } else if (matchesKeyBinding(e, bindings.saveProjectNow)) {
        e.preventDefault();
        performSaveSnapshot('manual');
      } else if (matchesKeyBinding(e, bindings.openHotkeys)) {
        e.preventDefault();
        setActiveModal('hotkeys');
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (hotbarBlockIds[idx]) {
          editor.afterCommit(() => setActiveBlockId(hotbarBlockIds[idx]));
          editor.afterCommit(() => setToolMode('place'));
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (matchesKeyBinding(e, hotkeyConfig.bindings.holdMouseLookMode)) {
        setIsHoldingMouseLook(false);
        navigate('end-look');
      }
      if (matchesKeyBinding(e, hotkeyConfig.bindings.holdSelectionGizmo)) {
        setIsHoldingSelectionGizmo(false);
      }
    };

    const onBlur = () => {
      setIsHoldingMouseLook(false);
      navigate('end-look');
      setIsHoldingSelectionGizmo(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    hotkeyConfig,
    activeModal,
    activeBlockId,
    hotbarBlockIds,
    copilotPredictions,
    handleAcceptCopilotPredictions,
    handleRunCommand,
    performSaveSnapshot,
    persistence.ready,
    persistence.busy,
    persistence.recoveryOpen,
    isAdaptiveSettingsOpen,
    recipeSnapshot.open,
    kitSnapshot.open,
    showOnboardingTour,
    navigate,
    navigationState.mode,
    toggleFlyNavigation,
  ]);

  const totalBlockCount = Object.keys(engineState.blocks).length;
  const selectionDims =
    engineState.pos1 && engineState.pos2
      ? getSelectionDimensions(engineState.pos1, engineState.pos2)
      : null;
  const latestLog = commandLog[commandLog.length - 1];

  const handleCommandFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    handleRunCommand(trimmed);
    setCommandInput('');
  };

  const openStudioMenu = (page: StudioMenuPage = 'actions') => { setStudioMenuStartPage(page); setActiveModal('studio_menu'); };
  const selectSceneCell = (key: string, token: string) => {
    if (token !== JSON.stringify(editor.getToken())) return editor.reject('The project changed. Inspect the current cell again.');
    const block = editor.getEngineState().blocks[key];
    if (!block) return editor.reject('This cell is no longer in the build.');
    return editor.transaction('Select scene cell', () => setEngineState(previous => ({ ...previous, pos1: studioCellAnchor(block.position), pos2: studioCellAnchor(block.position) })), JSON.parse(token));
  };
  const useSceneBlock = (id: string) => {
    if (isJavaLocked && !eligibleBlockIds.includes(id)) return editor.reject('This definition is unavailable under the game lock. Review compatibility before using it.');
    if (!editor.getEngineState().customBlocks[id]) return editor.reject('This definition is no longer available.');
    setActiveBlockId(id); setToolMode('place');
    return { status: 'noop' as const, message: 'Active block selected for your next placement. The build is unchanged.' };
  };
  const studioMenuActions: StudioWorkspaceAction[] = [
    { id: 'properties', label: 'Resume cell properties', category: 'Edit', description: 'Return to the last inspected cell and any unfinished properties draft.', keywords: 'inspector position scale rotation', disabledReason: cellInspectorSnapshot.target ? undefined : 'Choose a cell in Scene & inspect or coordinate tools first.', run: () => { cellInspector.reopen(); } },
    { id: 'save', label: 'Save project locally', category: 'Project', description: 'Save the complete editable project on this browser.', run: () => { void persistence.save(); } },
    { id: 'backup', label: 'Download project backup', category: 'Project', description: 'Keep an independent editable project file.', keywords: 'export json copy', run: persistence.downloadCurrent },
    { id: 'recover', label: 'Browse recovery records', category: 'Project', description: 'Inspect saved revisions and open a preserved copy.', run: () => { void persistence.openRecovery(); } },
    { id: 'projects', label: 'Projects and starters', category: 'Project', description: 'Open project copies, save a named copy or review a starter.', run: () => setActiveModal('main_menu') },
    { id: 'compatibility', label: 'Review game compatibility lock', category: 'Target', description: 'Choose explicit Java mappings and review the checkpoint and Undo boundary.', keywords: 'minecraft worldedit profile', run: () => setActiveModal('compatibility') },
    { id: 'export', label: 'Review exports', category: 'Target', description: 'Review a schematic candidate or the available Freeform draft formats.', keywords: 'schem schematic minecraft gltf godot', run: () => setActiveModal('export') },
    { id: 'undo', label: 'Undo last edit', category: 'Edit', description: 'Restore the complete previous edit, including selection.', disabledReason: editorSnapshot.canUndo ? undefined : 'No edit is available to undo.', run: () => { handleRunCommand('//undo'); } },
    { id: 'redo', label: 'Redo edit', category: 'Edit', description: 'Reapply the last undone edit.', disabledReason: editorSnapshot.canRedo ? undefined : 'No edit is available to redo.', run: () => { handleRunCommand('//redo'); } },
    { id: 'coordinate', label: 'Open coordinate tools', category: 'Build', description: 'Place, erase, paint or set selection corners with numeric controls.', keywords: 'precision xyz position', run: () => {
      const element = document.querySelector<HTMLDetailsElement>('[data-studio-coordinate-editor]');
      if (element) { element.open = true; element.querySelector<HTMLInputElement>('input')?.focus(); }
    } },
    { id: 'commands', label: 'Prepare a WorldEdit command', category: 'Build', description: 'Enter and review a command in the command line before running it.', keywords: 'code scripts set walls sphere copy paste selection', run: () => { commandInputRef.current?.focus(); } },
    { id: 'recipes', label: 'Open recipe workspace', category: 'Build', description: 'Compose bounded commands, inspect exact changes and Apply once with one Undo.', keywords: 'code scripts automation loops macro preview', run: () => recipeModel.show(recipeBlockId) },
    { id: 'place', label: 'Choose place tool', category: 'Build', description: 'Use the active block for the next explicit placement.', run: () => setToolMode('place') },
    { id: 'erase', label: 'Choose erase tool', category: 'Build', description: 'Choose the erase brush. The build changes only when you use it.', run: () => setToolMode('erase') },
    { id: 'selection', label: 'Choose selection wand', category: 'Build', description: 'Set region corners with the wand or coordinate tools.', run: () => setToolMode('wand_select') },
    { id: 'orbit', label: 'Orbit camera', category: 'Navigate', description: 'Rotate the camera around the working area.', run: () => navigate('orbit') },
    { id: 'pan', label: 'Pan camera', category: 'Navigate', description: 'Move the camera without editing the build.', run: () => navigate('pan') },
    { id: 'fly', label: 'Fly camera', category: 'Navigate', description: 'Use flight navigation. Speed and key mappings remain in navigation settings.', run: () => navigate('fly') },
    { id: 'frame', label: 'Frame selection', category: 'Navigate', description: 'Bring the explicit selected region into view.', disabledReason: engineState.pos1 && engineState.pos2 ? undefined : 'Set both selection corners first.', run: () => navigate('frame-selection') },
    { id: 'home', label: 'Recover camera', category: 'Navigate', description: 'Return to the Home view without changing the build.', keywords: 'lost reset', run: () => navigate('home') },
    { id: 'market', label: 'Browse local block catalogue', category: 'Resources', description: 'Inspect available local blocks before adding them to the library.', keywords: 'market assets', run: () => setActiveModal('market') },
    { id: 'resources', label: 'Open resource workspace', category: 'Resources', description: 'Review portable kits, browse blocks and blueprints, place precisely or package selected resources.', keywords: 'assets kit zip offline prefab library material import export', run: kitModel.show },
    { id: 'library', label: 'Open blueprint library', category: 'Resources', description: 'Browse structures or import a blueprint for review.', keywords: 'prefab resource kit', run: () => setActiveModal('blueprints') },
    { id: 'workshop', label: 'Open block workshop', category: 'Resources', description: 'Design a block and save it through the shared project session.', run: () => setActiveModal('workshop') },
    { id: 'controls', label: 'Controls and keyboard help', category: 'Help', description: 'Inspect and remap the existing supported shortcuts.', run: () => setActiveModal('hotkeys') },
    { id: 'settings', label: 'Studio UI and input settings', category: 'Help', description: 'Open existing scaling, layout and stylus settings.', run: () => setIsAdaptiveSettingsOpen(true) },
    { id: 'auditor', label: 'Open Self-Testing & Issue Auditor', category: 'Help', description: 'Run the 6-suite automated Crucible fuzzer, inspect live WebGL telemetry or review local issues.', keywords: 'self-test audit bug fuzzer diagnostics telemetry healer', run: () => { setAuditorInitialTab('self_tests'); setIsAuditorModalOpen(true); } },
    { id: 'visual_bug', label: 'Report Visual Bug (Circle & Analyze)', category: 'Help', description: 'Capture the 3D viewport, circle a visual bug and run local Sovereign Forge or heuristic root-cause analysis.', keywords: 'bug screenshot circle report issue', run: () => { setAuditorInitialTab('visual_bug_reporter'); setIsAuditorModalOpen(true); } },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100">
      <StudioRecoveryPanel persistence={persistence} />
      <section aria-label="Game target and compatibility" className="flex flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2 text-sm">
        <strong>{target?.kind === 'minecraft-java' ? `Java candidate · ${isJavaLocked ? 'Locked' : 'Unlocked'}` : 'Freeform project'}</strong>
        <button type="button" disabled={!persistence.ready || persistence.busy} onClick={() => setActiveModal('compatibility')} className="rounded border border-emerald-500 px-3 py-2 disabled:opacity-50">Review game compatibility</button>
        {isJavaLocked && <label>Active mapped block <select aria-label="Active mapped block" value={activeBlockId} disabled={!persistence.ready || persistence.busy} onChange={event => setActiveBlockId(event.target.value)} className="ml-2 rounded border border-slate-500 bg-slate-950 px-2 py-2">
          {eligibleBlockIds.map(id => <option key={id} value={id}>{engineState.customBlocks[id].name}</option>)}
        </select></label>}
        {target?.kind === 'minecraft-java' && <span className="text-amber-200">Native Minecraft export is not qualified.</span>}
        {isJavaLocked && <p className="basis-full text-xs text-slate-300">Candidate rules: mapped unit blocks, zero rotation and no instance appearance overrides. Paint replaces the mapped block type. Freeform scale/rotation preferences are retained for use after unlocking; smart appearance predictions are inactive while locked.</p>}
      </section>
      <StudioCompatibilityPanel isOpen={activeModal === 'compatibility'} onClose={() => setActiveModal('none')} source={compatibilitySource}
        disabled={!persistence.ready || persistence.busy} onReview={handleReviewCompatibility} onApply={handleApplyCompatibility} />
      <StudioWorkspaceMenu isOpen={activeModal === 'studio_menu'} onClose={() => setActiveModal(current => current === 'studio_menu' ? 'none' : current)}
        initialPage={studioMenuStartPage} appearance={workspaceAppearance} onInspectCell={cellInspector.inspect}
        document={editorSnapshot.document} sourceToken={JSON.stringify(editor.getToken())} history={editor.getHistoryUsage()} disabled={!editorSnapshot.writable || editorSnapshot.exclusive}
        actions={studioMenuActions} onRename={(name, token) => {
          if (token !== JSON.stringify(editor.getToken())) return editor.reject('The project changed. Reload the current name before applying your draft.');
          return editor.setWorldField('worldName', name);
        }} onSelectCell={selectSceneCell} onUseBlock={useSceneBlock} />
      <StudioRecipeWorkspace model={recipeModel} snapshot={recipeSnapshot} writable={editorSnapshot.writable && !editorSnapshot.exclusive} sourceToken={JSON.stringify(editor.getToken())}
        preferences={workspaceAppearance.preferences} definitions={selectableDefinitions} macros={hudConfig.macros} activeBlockId={activeBlockId}
        currentCursor={studioCellAnchor(hoveredCoord ?? engineState.pos1 ?? { x: 0, y: 1, z: 0 })} />
      <StudioResourceWorkspace model={kitModel} snapshot={kitSnapshot} document={editorSnapshot.document} sourceToken={JSON.stringify(editor.getToken())}
        writable={editorSnapshot.writable && !editorSnapshot.exclusive} preferences={workspaceAppearance.preferences} pos1={engineState.pos1} eligibleBlockIds={eligibleBlockIds}
        onOpenCatalogue={() => setActiveModal('market')} onOpenWorkshop={() => setActiveModal('workshop')}
        onUseBlock={(id, token) => token === JSON.stringify(editor.getToken()) ? useSceneBlock(id) : editor.reject('The project changed. Choose a current resource again.')}
        onEquipBlueprint={(id, token) => {
          if (token !== JSON.stringify(editor.getToken())) return editor.reject('The project changed. Choose a current blueprint again.');
          const bp = editor.getDocument().blueprints.find(value => value.id === id);
          if (!bp) return editor.reject('This blueprint is no longer in the current library.');
          handleEquipBlueprintStamp(bp); return { status: 'noop' };
        }} />
      <StudioCoordinateEditor disabled={!editorSnapshot.writable || editorSnapshot.exclusive} brush={volumeBrush} symmetry={symmetryConfig} javaLocked={isJavaLocked}
        onConfigure={(brush, symmetry) => { setVolumeBrush(brush); setSymmetryConfig(symmetry); }} hasSelection={Boolean(engineState.pos1 || engineState.pos2)} onClearSelection={() => handleRunCommand('//desel')} onApply={(action, coordinate) => {
        if (action === 'brush_place' || action === 'brush_erase') return handleApplyVolumeBrushAt(coordinate, action);
        if (action === 'inspect') {
          if (JSON.stringify(directEditToken) !== JSON.stringify(editor.getToken())) return editor.reject('The project changed. Inspect a current coordinate again.');
          return cellInspector.inspect(`${coordinate.x},${coordinate.y},${coordinate.z}`, JSON.stringify(directEditToken));
        }
        const handler = { place: handlePlaceBlockAt, erase: handleEraseBlockAt, paint: handlePaintBlockAt, pos1: handleSetPos1, pos2: handleSetPos2 }[action];
        return handler(coordinate);
      }} />
      {editorSnapshot.lastError && <div role="alert" className="px-4 py-2 text-sm bg-amber-950 text-amber-100">{editorSnapshot.lastError}</div>}
      <div className="flex min-h-0 flex-1 flex-col" inert={!persistence.ready || persistence.busy} aria-busy={!persistence.ready || persistence.busy}>
      {/* Top Microsoft Word / Office Style Multi-Tab Studio Ribbon */}
      <StudioRibbonHeader
        onOpenStudioMenu={() => openStudioMenu()}
        activeRibbonTab={activeRibbonTab}
        onSelectRibbonTab={setActiveRibbonTab}
        worldName={worldName}
        totalBlockCount={totalBlockCount}
        roomCode={roomCode}
        isSignedIn={Boolean(user)}
        autosaveEnabled={autosaveEnabled}
        lastAutosaveTime={lastAutosaveTime}
        toolMode={toolMode}
        onSelectToolMode={setToolMode}
        activeBlockId={activeBlockId}
        customBlocks={selectableDefinitions}
        activeBlueprint={activeBlueprint}
        blueprintsCount={blueprints.length}
        placementRotation={placementRotation}
        onRotatePlacement={() =>
          setPlacementRotation((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270))
        }
        canUndo={editorSnapshot.canUndo}
        canRedo={editorSnapshot.canRedo}
        onRunCommand={handleRunCommand}
        onTriggerManualSaveNow={() => performSaveSnapshot('manual')}
        onOpenModal={(m) => {
          if (m === 'cloud') handleRefreshCloudWorlds();
          setActiveModal(m);
        }}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
        daylightMode={daylightMode}
        onToggleDaylight={() => editor.afterCommit(() => setDaylightMode((prev) => !prev))}
        lightingConfig={lightingConfig}
        onChangeLightingConfig={setLightingConfig}
        chunkConfig={chunkConfig}
        onChangeChunkConfig={setChunkConfig}
        onExpandChunk={handleExpandChunk}
        patternConfig={patternConfig}
        onChangePatternConfig={setPatternConfig}
        onSelectCameraPreset={setCameraPreset}
        flyMode={flyMode}
        onToggleFlyMode={toggleFlyNavigation}
        freeLookActive={effectiveFreeLook}
        onToggleMouseLookMode={toggleFlyNavigation}
        rightSidebarTab={cellInspectorSnapshot.open ? 'closed' : rightSidebarTab}
        onSelectRightSidebarTab={setRightSidebarTab}
        gitCommits={gitCommits}
        onCreateGitCommit={() => handleCreateGitCommit()}
        ribbonCollapsed={effectiveUiMetrics.shouldCollapseRibbonSecondary}
        onToggleRibbonCollapsed={() =>
          handleChangeUiConfig({
            ...uiConfig,
            ribbonCollapsed: !effectiveUiMetrics.shouldCollapseRibbonSecondary,
          })
        }
        stylusEnabled={stylusConfig.enabled}
        onToggleStylusMode={() =>
          handleChangeStylusConfig({
            ...stylusConfig,
            enabled: !stylusConfig.enabled,
          })
        }
        uiScalePercent={Math.round(effectiveUiMetrics.effectiveScale * 100)}
        onOpenAdaptiveSettings={() => setIsAdaptiveSettingsOpen(true)}
        hudEditMode={hudConfig.masterHudEditMode}
        onToggleHudEditMode={() =>
          handleChangeHudConfig({
            ...hudConfig,
            masterHudEditMode: !hudConfig.masterHudEditMode,
          })
        }
        masteryRankTitle={masteryInfo.currentRank.title}
        userXp={userProgress.xp}
        isCinemaOpen={isCinemaOpen}
        onToggleCinemaDock={() => setIsCinemaOpen((prev) => !prev)}
        soundEnabled={userProgress.soundEnabled}
        onToggleSoundEnabled={() =>
          persistUserProgress({
            ...userProgress,
            soundEnabled: !userProgress.soundEnabled,
          })
        }
        onOpenAuditorModal={(tab) => {
          setAuditorInitialTab(tab);
          setIsAuditorModalOpen(true);
        }}
      />

      {/* Center Workbench Area: Left MS Paint Toolbox + Center 3D Viewport + Right Command Legend / Git / Lighting Dock */}
      <div className="relative flex-1 flex w-full overflow-hidden">
        {/* Left Dock or Floating Window: Windows Paint Style Tool Grid, Active Swatch, 16-Color Palette & Realistic Block Library */}
        <PaintToolboxSidebar
          isOpen={isLeftToolboxOpen}
          onClose={() => setIsLeftToolboxOpen(false)}
          toolMode={toolMode}
          onSelectToolMode={setToolMode}
          activeBlockId={activeBlockId}
          onSelectBlockId={(id) => {
            editor.afterCommit(() => setActiveBlockId(id));
            if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
              editor.afterCommit(() => setToolMode('place'));
            }
          }}
          customBlocks={selectableDefinitions}
          onUpdateActiveBlockColor={handleUpdateActiveBlockColor}
          activeBlueprint={activeBlueprint}
          placementRotation={placementRotation}
          onRotatePlacement={() =>
            setPlacementRotation((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270))
          }
          onOpenWorkshop={() => setActiveModal('workshop')}
          onOpenBlockMarket={() => setActiveModal('market')}
          isFloating={leftSidebarFloating}
          onToggleFloating={() => setLeftSidebarFloating((prev) => !prev)}
          dockedWidth={workspaceMetrics.effectiveLeftWidth || leftDockedWidth}
          onResizeDockedWidth={setLeftDockedWidth}
        />

            {/* Center 3D Architectural Voxel & Skyblock Viewport */}
        <main className="relative flex-1 h-full min-w-0 overflow-hidden flex flex-col">
          <StudioNavigationToolbar onNavigate={navigate} state={navigationState} disabled={!persistence.ready || persistence.busy} />
          <div className="relative min-h-0 flex-1">
          <SkyblockViewport
            navigationRequest={navigationRequest}
            onNavigationStateChange={setNavigationState}
            inputBlocked={!persistence.ready || persistence.busy || persistence.recoveryOpen || persistence.choices.length > 0 || activeModal !== 'none' || isAuditorModalOpen || recipeSnapshot.open || kitSnapshot.open || isAdaptiveSettingsOpen || showOnboardingTour || isCinemaOpen}
            editScope={`${editorSnapshot.sessionId}:${editorSnapshot.document.historyEpoch}`}
            blocks={effectiveViewportBlocks}
            customBlocks={engineState.customBlocks}
            activeBlockId={activeBlockId}
            activeBlueprint={activeBlueprint}
            toolMode={toolMode}
            placementRotation={placementRotation}
            pos1={engineState.pos1}
            pos2={engineState.pos2}
            showGrid={showGrid}
            daylightMode={daylightMode}
            lightingConfig={lightingConfig}
            chunkConfig={chunkConfig}
            patternConfig={previewPatternConfig}
            cameraPreset={cameraPreset}
            collaborators={collaborators}
            hotkeyConfig={hotkeyConfig}
            flyMode={flyMode}
            onToggleFlyMode={toggleFlyNavigation}
            freeLookActive={effectiveFreeLook}
            isHoldingFreeLook={isHoldingMouseLook}
            onToggleMouseLookMode={toggleFlyNavigation}
            activeBlockScale={activeBlockScale}
            scrollResizeMode={scrollResizeMode}
            scrollResizeAxis={scrollResizeAxis}
            onScrollResizeBlock={handleScrollResizeBlock}
            onChangeScrollResizeMode={setScrollResizeMode}
            onChangeScrollResizeAxis={setScrollResizeAxis}
            onResetBlockScale={handleResetBlockScale}
            onSetBlockScaleDirect={setActiveBlockScale}
            stylusConfig={stylusConfig}
            onToggleStylusMode={() =>
              handleChangeStylusConfig({
                ...stylusConfig,
                enabled: !stylusConfig.enabled,
              })
            }
            onStylusTelemetryChange={handleStylusTelemetryChange}
            uiConfig={uiConfig}
            isViewportPanningOrDrawing={isViewportPanningOrDrawing}
            onPanningOrDrawingChange={setIsViewportPanningOrDrawing}
            onOpenAdaptiveSettings={() => setIsAdaptiveSettingsOpen(true)}
            onCursorMove={handleCursorMove}
            onPlaceBlockAt={handlePlaceBlockAt}
            onEraseBlockAt={handleEraseBlockAt}
            onPaintBlockAt={handlePaintBlockAt}
            onPickBlockAt={handlePickBlockAt}
            onStampBlueprintAt={handleStampBlueprintAt}
            onSetPos1={handleSetPos1}
            onSetPos2={handleSetPos2}
            onClearSelection={handleClearSelection}
            onNudgeSelectionFace={handleNudgeSelectionFace}
            volumeBrush={volumeBrush}
            onChangeVolumeBrush={setVolumeBrush}
            onApplyVolumeBrushAt={handleApplyVolumeBrushAt}
            isSelectionGizmoActive={effectiveSelectionGizmoActive}
            onToggleSelectionGizmoLock={() =>
              setSelectionGizmoUnlocked((prev) => !prev)
            }
            onScrollResizeSelection={handleScrollResizeSelection}
            symmetryConfig={symmetryConfig}
            onChangeSymmetryConfig={setSymmetryConfig}
            detectedSymmetry={detectedSymmetry}
            copilotConfig={copilotConfig}
            onChangeCopilotConfig={setCopilotConfig}
            copilotPredictions={copilotPredictions}
            onAcceptCopilotPredictions={handleAcceptCopilotPredictions}
            selectionRecommendations={
              selectionMorphology?.recommendations || []
            }
            commandPreviewCoords={commandPreviewCoords}
            activeCommandPreviewMode={activeCommandPreviewMode}
            onHoverCommandPreviewMode={setActiveCommandPreviewMode}
            onRunRecommendedCommand={handleRunCommand}
            walkabilityReport={walkabilityReport}
            detectedObjectClass={detectedObjectClass}
            lastLingerPenaltyToast={lastLingerPenaltyToast}
            onCameraPresetHandled={() => setCameraPreset('free')}
            turntableEnabled={turntableEnabled}
            snapshotTriggerCount={snapshotTriggerCount}
            worldName={worldName}
            onSelectBlockId={(id) => {
              editor.afterCommit(() => setActiveBlockId(id));
              if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
                editor.afterCommit(() => setToolMode('place'));
              }
            }}
            onSelectToolMode={setToolMode}
            isLeftToolboxOpen={isLeftToolboxOpen}
            onOpenLeftToolbox={() => setIsLeftToolboxOpen(true)}
            isRightInspectorOpen={rightSidebarTab !== 'closed' || cellInspectorSnapshot.open}
            onOpenRightInspector={() => setRightSidebarTab('legend')}
          />
          </div>

          {/* Cinematic Photo Mode & Chronological Build Timelapse Dock */}
          <CinematicTimelapseDock
            isOpen={isCinemaOpen}
            onClose={() => setIsCinemaOpen(false)}
            totalBlocksCount={orderedTimelapseBlocks.length}
            currentStep={timelapseStep}
            isPlaying={timelapsePlaying}
            playbackSpeed={timelapseSpeed}
            turntableEnabled={turntableEnabled}
            showFramingGrid={showFramingGrid}
            activeAtmosphereId={activeAtmosphereId}
            onTogglePlay={() => {
              if (
                !timelapsePlaying &&
                timelapseStep >= orderedTimelapseBlocks.length
              ) {
                setTimelapseStep(0);
              }
              setTimelapsePlaying((prev) => !prev);
            }}
            onScrubStep={(step) => {
              setTimelapsePlaying(false);
              setTimelapseStep(step);
            }}
            onChangeSpeed={setTimelapseSpeed}
            onToggleTurntable={() => setTurntableEnabled((prev) => !prev)}
            onToggleFramingGrid={() => setShowFramingGrid((prev) => !prev)}
            onSelectAtmosphere={handleSelectAtmospherePreset}
            onCaptureSnapshotPng={() =>
              setSnapshotTriggerCount((prev) => prev + 1)
            }
          />

          {/* Non-Intrusive 4-Step Interactive Onboarding Tour */}
          <OnboardingTourOverlay
            isOpen={showOnboardingTour}
            onCompleteOrDismiss={() => {
              setShowOnboardingTour(false);
              persistUserProgress({
                ...userProgress,
                onboardingCompleted: true,
              });
            }}
            onOpenContractsModal={() => setActiveModal('contracts_biomes')}
          />

          {/* WoW / ElvUI / Bartender4 Style Moveable, Resizable & Lockable Multi-Hotbar & Command Loop HUD */}
          <ModularActionBarsHud
            hudConfig={hudConfig}
            onChangeHudConfig={handleChangeHudConfig}
            activeBlockId={activeBlockId}
            onSelectBlockId={(id) => {
              editor.afterCommit(() => setActiveBlockId(id));
              if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
                editor.afterCommit(() => setToolMode('place'));
              }
            }}
            toolMode={toolMode}
            onSelectToolMode={setToolMode}
            customBlocks={selectableDefinitions}
            onRunCommand={handleRunCommand}
            onTriggerMacroLoop={handleTriggerMacroLoop}
            runningMacroId={null}
            onOpenBlockMarket={() => setActiveModal('market')}
            onOpenMainMenu={() => setActiveModal('main_menu')}
            isPanningOrDrawing={isViewportPanningOrDrawing}
            autoFadeOnPan={uiConfig.autoFadeHudOnPan}
            centerViewportWidth={workspaceMetrics.centerViewportWidth}
            centerViewportHeight={workspaceMetrics.centerViewportHeight}
            hudBarAutoScale={workspaceMetrics.hudBarAutoScale}
            shouldStackBottomBars={workspaceMetrics.shouldStackBottomBars}
          />

          {/* Floating Quick Re-Open Toolbox Button when Left Dock is closed */}
          {!isLeftToolboxOpen && (
            <DraggableHudOverlay
              hudId="reopen_left_toolbox_hud"
              label="Paint & Blocks Button"
              anchorClassName="top-3 left-3"
              zIndex={20}
            >
              <button
                type="button"
                onClick={() => setIsLeftToolboxOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-100 flex items-center gap-1.5 shadow-lg"
              >
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>Paint & Blocks</span>
              </button>
            </DraggableHudOverlay>
          )}

          {/* Floating Quick Re-Open Inspector Button if Right Dock is closed */}
          {rightSidebarTab === 'closed' && (
            <DraggableHudOverlay
              hudId="reopen_right_inspector_hud"
              label="Command Legend Button"
              anchorClassName="top-3 right-3"
              zIndex={20}
            >
              <button
                type="button"
                onClick={() => setRightSidebarTab('legend')}
                className="px-3 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-100 flex items-center gap-1.5 shadow-lg"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Command Legend</span>
              </button>
            </DraggableHudOverlay>
          )}

          {/* Adaptive Android / Tablet / Stylus Ergonomic Quick-Hub & All-Tools Customizer Drawer */}
          <AdaptiveMobileStylusHub
            uiConfig={uiConfig}
            onChangeUiConfig={handleChangeUiConfig}
            stylusConfig={stylusConfig}
            onChangeStylusConfig={handleChangeStylusConfig}
            lastPointerType={lastPointerType}
            lastStylusPressure={lastStylusPressure}
            isViewportPanningOrDrawing={isViewportPanningOrDrawing}
            toolMode={toolMode}
            onSelectToolMode={setToolMode}
            activeBlockId={activeBlockId}
            customBlocks={selectableDefinitions}
            placementRotation={placementRotation}
            onRotatePlacement={() =>
              setPlacementRotation(
                (prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270)
              )
            }
            activeBlockScale={activeBlockScale}
            scrollResizeMode={scrollResizeMode}
            onScrollResizeBlock={handleScrollResizeBlock}
            onChangeScrollResizeMode={setScrollResizeMode}
            onResetBlockScale={handleResetBlockScale}
            hoveredCoord={hoveredCoord}
            onSetPos1={handleSetPos1}
            onSetPos2={handleSetPos2}
            onRunCommand={handleRunCommand}
            canUndo={editorSnapshot.canUndo}
            canRedo={editorSnapshot.canRedo}
            isLeftToolboxOpen={isLeftToolboxOpen}
            onToggleLeftToolbox={() => setIsLeftToolboxOpen((prev) => !prev)}
            rightSidebarTab={cellInspectorSnapshot.open ? 'closed' : rightSidebarTab}
            onSelectRightSidebarTab={setRightSidebarTab}
            onOpenModal={(m) => {
              if (m === 'cloud') handleRefreshCloudWorlds();
              setActiveModal(m);
            }}
            isSettingsModalOpen={isAdaptiveSettingsOpen}
            onCloseSettingsModal={() => setIsAdaptiveSettingsOpen(false)}
            onOpenSettingsModal={() => setIsAdaptiveSettingsOpen(true)}
          />
        </main>

        {/* Right Dock: Built-In Command & Tool Legend, Chunks & Smart Art, Git History Tree, and Dynamic Lighting Inspector */}
        <CommandLegendSidebar
          activeTab={cellInspectorSnapshot.open ? 'closed' : rightSidebarTab}
          onSelectTab={setRightSidebarTab}
          activeBlockId={activeBlockId}
          blocks={engineState.blocks}
          hoveredCoord={hoveredCoord}
          onRunCommand={handleRunCommand}
          lightingConfig={lightingConfig}
          onChangeLightingConfig={setLightingConfig}
          chunkConfig={chunkConfig}
          onChangeChunkConfig={setChunkConfig}
          onExpandChunk={handleExpandChunk}
          patternConfig={patternConfig}
          onChangePatternConfig={setPatternConfig}
          gitCommits={gitCommits}
          activeCommitId={activeCommitId}
          onCreateGitCommit={handleCreateGitCommit}
          onCheckoutGitCommit={handleCheckoutGitCommit}
          onOpenHotkeysModal={() => setActiveModal('hotkeys')}
          symmetryConfig={symmetryConfig}
          onChangeSymmetryConfig={setSymmetryConfig}
          detectedSymmetry={detectedSymmetry}
          copilotConfig={copilotConfig}
          onChangeCopilotConfig={setCopilotConfig}
          walkabilityReport={walkabilityReport}
          onAutoLightDarkSpots={handleAutoLightDarkSpots}
          autoLightUnavailableReason={isJavaLocked ? 'Lantern placement is unavailable in this Java candidate profile.' : !engineState.customBlocks.voxel_lantern ? 'This project needs a lantern definition before auto-light can place one.' : undefined}
          patternArchive={patternArchive}
          detectedObjectClass={detectedObjectClass}
          onResetPatternArchive={() =>
            editor.afterCommit(() => setPatternArchive(createInitialAdaptivePatternArchive()))
          }
          isFloating={rightSidebarFloating}
          onToggleFloating={() => setRightSidebarFloating((prev) => !prev)}
          dockedWidth={workspaceMetrics.effectiveRightWidth || rightDockedWidth}
          onResizeDockedWidth={setRightDockedWidth}
        />
        <StudioCellInspector model={cellInspector} snapshot={cellInspectorSnapshot} document={editorSnapshot.document} sourceToken={JSON.stringify(editor.getToken())}
          writable={editorSnapshot.writable && !editorSnapshot.exclusive} preferences={workspaceAppearance.preferences} definitions={selectableDefinitions}
          width={workspaceMetrics.effectiveRightWidth || rightDockedWidth} preferredWidth={rightDockedWidth} onWidth={setRightDockedWidth}
          onBrowse={() => openStudioMenu('scene')} onAppearance={() => openStudioMenu('comfort')} onSelectCell={selectSceneCell} onUseBlock={useSceneBlock} />
      </div>

      {/* Bottom Studio Status Bar & Integrated WorldEdit Command Bar (Adapts cleanly to narrow/split-screen window resizing) */}
      <footer className="min-h-[40px] py-1 bg-slate-950 border-t border-slate-800 px-3 flex items-center justify-between gap-2 z-30 shrink-0 select-none overflow-x-auto">
        {/* Left: WorldEdit CLI Input + Latest Output Feedback */}
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-2xl">
          <form
            onSubmit={handleCommandFormSubmit}
            className="flex items-center gap-1.5 w-44 sm:w-64 md:w-80 shrink-0"
          >
            <div className="relative flex-1">
              <Terminal className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={`Press / or type //set ${activeBlockId}, //walls...`}
                aria-label="WorldEdit Command Input"
                className="w-full pl-8 pr-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0"
            >
              <Play className="w-3 h-3" />
              <span>Run</span>
            </button>
          </form>

          {latestLog && (
            <div
              className={`hidden md:block text-[11px] font-mono truncate ${
                latestLog.success ? 'text-slate-300' : 'text-rose-400'
              }`}
              title={`${latestLog.cmd}: ${latestLog.message}`}
            >
              <span className="text-amber-400 font-semibold mr-1.5">
                {latestLog.cmd}
              </span>
              <span>{latestLog.message}</span>
            </div>
          )}
        </div>

        {/* Right: Coordinates, Selection Volume, Git Branch, Solar Time, and Total Block Readout */}
        <div
          data-testid="scene-telemetry-hud"
          className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono text-slate-400 shrink-0"
        >
          <span className="hidden sm:inline" title="3D Cursor Grid Coordinates">
            XYZ: ({hoveredCoord.x}, {hoveredCoord.y}, {hoveredCoord.z})
          </span>

          <span className="text-slate-700 hidden lg:inline">|</span>

          {selectionDims ? (
            <span className="text-cyan-400 hidden lg:inline">
              Sel: {selectionDims.lx}×{selectionDims.ly}×{selectionDims.lz} (
              {selectionDims.volume})
            </span>
          ) : (
            <span className="hidden lg:inline">Sel: None</span>
          )}

          <span className="text-slate-700 hidden xl:inline">|</span>

          <button
            type="button"
            onClick={() => setRightSidebarTab('git')}
            className="hidden xl:flex hover:text-emerald-300 items-center gap-1 text-emerald-400"
            title="Open Git Commit History"
          >
            <GitBranch className="w-3 h-3" />
            <span>main@{gitCommits[0]?.hash || 'init'}</span>
          </button>

          <span className="text-slate-700 hidden sm:inline">|</span>

          <button
            type="button"
            onClick={() => setRightSidebarTab('lighting')}
            className="hidden sm:flex hover:text-amber-300 items-center gap-1 text-slate-300"
            title="Open Dynamic Lighting Inspector"
          >
            <Sun className="w-3 h-3 text-amber-400" />
            <span>
              {String(Math.floor(lightingConfig.timeOfDay)).padStart(2, '0')}:
              {String(
                Math.floor((lightingConfig.timeOfDay % 1) * 60)
              ).padStart(2, '0')}
            </span>
          </button>

          <span className="text-slate-700">|</span>

          <span
            data-testid="world-block-count"
            className="text-amber-400 font-semibold tabular-nums"
          >
            {totalBlockCount} blocks
          </span>
        </div>
      </footer>

      {/* Modals */}
      <BlockMarketModal
        isOpen={activeModal === 'market'}
        onClose={() => setActiveModal('none')}
        customBlocks={engineState.customBlocks}
        activeBlockId={activeBlockId}
        hudConfig={hudConfig}
        usageCounts={hudConfig.usageCounts}
        onSelectBlockId={(id) => {
          editor.afterCommit(() => setActiveBlockId(id));
          editor.afterCommit(() => setToolMode('place'));
        }}
        onInstallMarketBlocks={handleInstallMarketBlocks}
        onAssignBlockToPrimarySlot={handleAssignBlockToPrimarySlot}
        onOpenWorkshop={() => setActiveModal('workshop')}
      />

      <MainMenuProjectModal
        isOpen={activeModal === 'main_menu'}
        onClose={() => setActiveModal('none')}
        worldName={worldName}
        onChangeWorldName={setWorldName}
        blocks={engineState.blocks}
        customBlocks={engineState.customBlocks}
        chunkConfig={chunkConfig}
        savedProjects={savedProjects}
        onSaveProjectSlot={handleSaveProjectSlot}
        onLoadProjectSlot={handleLoadProjectSlot}
        onImportProjectJson={handleImportProjectJson}
        onResetEntireWorld={handleResetEntireWorld}
        onResetSpecificChunk={handleResetSpecificChunk}
        onOpenDriveBackupModal={() => setActiveModal('drive')}
        onOpenBlockMarketModal={() => setActiveModal('market')}
        isSignedIn={Boolean(user)}
        userEmail={user?.email || null}
        reportedWorldIds={userProgress.reportedWorldIds}
        onReportOrBlockWorld={handleReportOrBlockWorld}
        onClearReportedWorlds={() =>
          persistUserProgress({ ...userProgress, reportedWorldIds: [] })
        }
      />

      <ContractsAndBiomesModal
        isOpen={activeModal === 'contracts_biomes'}
        onClose={() => setActiveModal('none')}
        blocks={engineState.blocks}
        customBlocks={engineState.customBlocks}
        userXp={userProgress.xp}
        claimedContractIds={userProgress.claimedContractIds}
        claimedDailyDates={userProgress.claimedDailyDates}
        streakDays={userProgress.streakDays}
        onClaimContractReward={handleClaimContractReward}
        onClaimDailyPromptReward={handleClaimDailyPromptReward}
        onGenerateProceduralBiome={handleGenerateProceduralBiome}
        onSelectAtmospherePreset={handleSelectAtmospherePreset}
        onSelectBlockId={(id) => {
          editor.afterCommit(() => setActiveBlockId(id));
          editor.afterCommit(() => setToolMode('place'));
        }}
        onLaunchOnboardingTour={() => setShowOnboardingTour(true)}
      />

      <BlockWorkshopModal
        isOpen={activeModal === 'workshop'}
        onClose={() => setActiveModal('none')}
        onSaveCustomBlock={handleSaveCustomBlock}
        initialBlock={engineState.customBlocks[activeBlockId]}
      />

      <BlueprintsModal
        isOpen={activeModal === 'blueprints'}
        onClose={() => setActiveModal('none')}
        blueprints={blueprints}
        pos1={engineState.pos1}
        pos2={engineState.pos2}
        blocks={engineState.blocks}
        onSaveSelectionBlueprint={handleSaveSelectionBlueprint}
        onEquipBlueprintStamp={handleEquipBlueprintStamp}
        onPlaceBlueprintAtPos1={handlePlaceBlueprintAtPos1}
        onLoadBlueprintIntoNewWorld={handleLoadBlueprintIntoNewWorld}
        onDeleteBlueprint={handleDeleteBlueprint}
        onImportBlueprintJson={handleImportBlueprintJson}
        onRefreshCloudBlueprints={handleRefreshCloudBlueprints}
        isLoadingCloud={isLoadingCloudBp}
      />

      <HotkeysModal
        isOpen={activeModal === 'hotkeys'}
        onClose={() => setActiveModal('none')}
        hotkeyConfig={hotkeyConfig}
        onChangeHotkeyConfig={handleChangeHotkeyConfig}
        flyMode={flyMode}
        onToggleFlyMode={toggleFlyNavigation}
        mouseLookToggled={mouseLookToggled}
        onToggleMouseLookMode={toggleFlyNavigation}
      />

      <DriveBackupModal
        isOpen={activeModal === 'drive'}
        onClose={() => setActiveModal('none')}
        user={user}
        driveAccessToken={driveAccessToken}
        needsDriveAuth={needsDriveAuth}
        onConnectGoogleDrive={handleConnectGoogleDrive}
        autosaveEnabled={autosaveEnabled}
        onToggleAutosave={setAutosaveEnabled}
        autosaveIntervalSec={autosaveIntervalSec}
        onChangeAutosaveInterval={setAutosaveIntervalSec}
        autoDriveBackupEnabled={autoDriveBackupEnabled}
        onToggleAutoDriveBackup={setAutoDriveBackupEnabled}
        lastAutosaveTime={lastAutosaveTime}
        lastDriveSyncTime={lastDriveSyncTime}
        localSnapshots={localSnapshots}
        onTriggerManualSaveNow={() => performSaveSnapshot('manual')}
        onBuildCurrentBackupPayload={handleBuildCurrentBackupPayload}
        onRestoreFromBackup={handleRestoreFromBackup}
        onDriveSynced={(ts) => setLastDriveSyncTime(ts)}
      />

      <CloudMultiplayerModal
        isOpen={activeModal === 'cloud'}
        onClose={() => setActiveModal('none')}
        user={user}
        worldId={worldId}
        worldName={worldName}
        roomCode={roomCode}
        isPublicWorld={isPublicWorld}
        isLiveConnected={isLiveConnected}
        collaborators={collaborators}
        cloudWorlds={cloudWorlds}
        onUpdateWorldMeta={(n, r, pub) => { editor.transaction('Edit world metadata', () => {
          setWorldName(n); setRoomCode(r); setIsPublicWorld(pub);
        }); }}
        onSaveCurrentWorldToCloud={handleSaveCurrentWorldToCloud}
        onJoinCloudWorld={handleJoinCloudWorld}
        onRefreshCloudWorlds={handleRefreshCloudWorlds}
      />

      <SchematicExportModal
        isOpen={activeModal === 'export'}
        onClose={() => setActiveModal('none')}
        worldName={worldName}
        blocks={engineState.blocks}
        customBlocks={engineState.customBlocks}
        studioDocument={editorSnapshot.document}
        sourceToken={compatibilitySource.token}
        selection={engineState.pos1 && engineState.pos2 ? { pos1: engineState.pos1, pos2: engineState.pos2 } : null}
        isCurrentSource={token => token === JSON.stringify(editor.getToken()) && editor.getSnapshot().writable && !editor.getSnapshot().exclusive}
        onOpenCompatibility={() => setActiveModal('compatibility')}
      />

      <SelfTestingAuditorModal
        isOpen={isAuditorModalOpen}
        initialTab={auditorInitialTab}
        onClose={() => setIsAuditorModalOpen(false)}
        activeBlockCount={totalBlockCount}
        unlockedChunksCount={chunkConfig.unlockedChunks.length}
        activeToolMode={toolMode}
        activeBlockId={activeBlockId}
        lastCommands={commandLog.slice(-8).map((c) => c.cmd)}
        openWindows={
          activeModal === 'none'
            ? isAuditorModalOpen
              ? ['self_testing_auditor_modal']
              : []
            : [activeModal]
        }
      />
      </div>
    </div>
  );
}
