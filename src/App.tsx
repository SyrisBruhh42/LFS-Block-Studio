/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  applyVolumeBrushToWorld,
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
  getSelectionDimensions,
  loadBlueprintIntoNewWorld,
  pushUndoSnapshot,
  stampBlueprintIntoWorld,
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
  deleteAllUserCloudData,
  deleteCloudBlueprint,
  fetchCloudBlueprints,
  getAccessToken,
  googleSignIn,
  initAuth,
  listUserAndPublicWorlds,
  saveBlueprintToCloud,
  saveWorldToCloud,
  subscribeToAuth,
  subscribeToWorldPresence,
  subscribeToWorldRoom,
  updateCollaboratorPresence,
} from './lib/firebase';
import {
  BrickForgeProjectBackup,
  LocalAutosaveSnapshot,
  buildProjectBackupPayload,
  createDriveBackupFile,
} from './lib/googleDrive';
import {
  DEFAULT_USER_PROGRESS_STATE,
  StudioUserProgressState,
  hydrateAndMigrateStudioStorage,
  idbClearAll,
  idbSet,
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

function generateShortHash(): string {
  return Math.random().toString(16).substring(2, 9);
}

export default function App() {
  const [engineState, setEngineState] = useState<WorldEditEngineState>(() => {
    const initial = createInitialEngineState();
    // Start with a clean unobstructed 3D viewport (no unsolicited Wand box over the island)
    initial.pos1 = null;
    initial.pos2 = null;
    try {
      const savedCustomRaw = localStorage.getItem(LOCAL_CUSTOM_BLOCKS_STORAGE_KEY);
      if (savedCustomRaw) {
        const parsed: CustomBlockDefinition[] = JSON.parse(savedCustomRaw);
        for (const def of parsed) {
          if (def.isCustom) {
            initial.customBlocks[def.id] = def;
          }
        }
      }
      // Restore latest autosaved world blocks if present
      const snapsRaw = localStorage.getItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY);
      if (snapsRaw) {
        const snaps: LocalAutosaveSnapshot[] = JSON.parse(snapsRaw);
        if (snaps.length > 0 && snaps[0].backup?.blocks) {
          initial.blocks = snaps[0].backup.blocks;
          if (Array.isArray(snaps[0].backup.customBlocks)) {
            for (const d of snaps[0].backup.customBlocks) {
              if (d.isCustom) {
                initial.customBlocks[d.id] = d;
              }
            }
          }
        }
      }
    } catch {
      // Ignore storage error
    }
    return initial;
  });

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
  const [activeBlockId, setActiveBlockId] = useState<string>('cobble_brick');
  const [toolMode, setToolMode] = useState<ToolMode>('place');
  const [placementRotation, setPlacementRotation] = useState<0 | 90 | 180 | 270>(0);
  const [activeBlockScale, setActiveBlockScale] = useState<BlockScale3D>({
    x: 1,
    y: 1,
    z: 1,
  });
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
    [scrollResizeMode, scrollResizeAxis]
  );

  const handleResetBlockScale = useCallback(() => {
    setActiveBlockScale({ x: 1, y: 1, z: 1 });
  }, []);

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

  // Local Spatial Copilot & Real-Time Symmetry Mirror state (100% client-side, <1.2ms on Pixel 8 Pro)
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
  const [savedProjects, setSavedProjects] = useState<SavedStudioProject[]>(
    () => {
      try {
        const raw = localStorage.getItem(LOCAL_SAVED_PROJECTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // Ignore
      }
      return [];
    }
  );

  const persistSavedProjects = useCallback((list: SavedStudioProject[]) => {
    setSavedProjects(list);
    try {
      localStorage.setItem(LOCAL_SAVED_PROJECTS_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
    idbSet('saved_projects', list).catch(() => {});
  }, []);

  const commandInputRef = useRef<HTMLInputElement | null>(null);

  const [hoveredCoord, setHoveredCoord] = useState<GridCoord>({ x: 0, y: 1, z: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [daylightMode, setDaylightMode] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('free');

  // Workbench UI state: Word Ribbon tab + Left/Right Dock Inspector tabs (auto-collapsed on mobile phones)
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');
  const [isLeftToolboxOpen, setIsLeftToolboxOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [leftSidebarFloating, setLeftSidebarFloating] = useState<boolean>(false);
  const [leftDockedWidth, setLeftDockedWidth] = useState<number>(240);
  const [rightSidebarTab, setRightSidebarTab] = useState<RightInspectorTab>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'closed' : 'legend'
  );
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
        setRightSidebarTab('closed');
      } else if (w < 1080) {
        setRightSidebarTab((prev) => (prev === 'legend' ? 'closed' : prev));
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
        rightSidebarTab !== 'closed' && !rightSidebarFloating,
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
    ]
  );

  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(
      16 * effectiveUiMetrics.effectiveScale
    )}px`;
  }, [effectiveUiMetrics.effectiveScale]);

  // Dynamic Lighting Studio state
  const [lightingConfig, setLightingConfig] = useState<DynamicLightingConfig>({
    timeOfDay: 13.5, // Afternoon crisp sun
    sunAzimuth: 135,
    sunIntensity: 1.5,
    ambientIntensity: 0.7,
    shadowsEnabled: true,
    pointLightsEnabled: true,
    fogDensity: 0.25,
  });

  // Multi-Chunk World Grid & Active Chunk Culling state
  const [chunkConfig, setChunkConfig] = useState<WorldChunkConfig>(
    DEFAULT_CHUNK_CONFIG
  );

  // Smart Pattern Variation & Connected-Neighbor Art Matcher state
  const [patternConfig, setPatternConfig] =
    useState<SmartPatternVariationConfig>(DEFAULT_SMART_PATTERN_CONFIG);

  // Continuous Pattern Evolution Loop timer when autoEvolveLoop is enabled
  useEffect(() => {
    if (!patternConfig.enabled || !patternConfig.autoEvolveLoop) return;
    const intervalMs = 240;
    const id = window.setInterval(() => {
      setPatternConfig((prev) => ({
        ...prev,
        evolutionPhase:
          (prev.evolutionPhase + 0.12 * (prev.evolveSpeed || 1)) %
          (Math.PI * 2),
      }));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [patternConfig.enabled, patternConfig.autoEvolveLoop, patternConfig.evolveSpeed]);

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
    const initCustom = Object.values(createInitialEngineState().customBlocks).filter(
      (d) => d.isCustom
    );
    const count = Object.keys(initBlocks).length;
    return [
      {
        id: 'commit_init',
        hash: 'a1f8c20',
        branch: 'main',
        message: 'Initial architectural studio plot foundation',
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
  const [flyMode, setFlyMode] = useState<boolean>(true);
  const [mouseLookToggled, setMouseLookToggled] = useState<boolean>(false);
  const [isHoldingMouseLook, setIsHoldingMouseLook] = useState<boolean>(false);
  const effectiveFreeLook = mouseLookToggled !== isHoldingMouseLook;

  const [hotkeyConfig, setHotkeyConfig] = useState<HotkeyConfig>(() =>
    loadHotkeyConfig()
  );

  const handleChangeHotkeyConfig = useCallback((next: HotkeyConfig) => {
    setHotkeyConfig(next);
    saveHotkeyConfig(next);
  }, []);

  // Saved blueprints (Starter + Custom Block Blueprints + User Saved Structures)
  const [blueprints, setBlueprints] = useState<BlueprintPrefab[]>(() => {
    const initialList = [...STARTER_STRUCTURE_BLUEPRINTS];
    try {
      const raw = localStorage.getItem(LOCAL_BLUEPRINTS_STORAGE_KEY);
      if (raw) {
        const parsed: BlueprintPrefab[] = JSON.parse(raw);
        const existingIds = new Set(initialList.map((b) => b.id));
        for (const bp of parsed) {
          if (!existingIds.has(bp.id)) {
            initialList.push(bp);
          }
        }
      }
    } catch {
      // Ignore storage error
    }
    return initialList;
  });
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

  // Firebase Auth, Google Drive OAuth, & Multiplayer state
  const [user, setUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState<boolean>(true);
  const [worldId, setWorldId] = useState<string>('studio_plot_1');
  const [worldName, setWorldName] = useState<string>(() => {
    try {
      const snapsRaw = localStorage.getItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY);
      if (snapsRaw) {
        const snaps: LocalAutosaveSnapshot[] = JSON.parse(snapsRaw);
        const savedName = snaps[0]?.worldName;
        if (savedName && savedName !== 'Starter Skyblock Island') {
          return savedName;
        }
      }
    } catch {
      // Ignore
    }
    return 'Starter Studio Plot';
  });
  const [roomCode, setRoomCode] = useState<string>('STUDIO101');
  const [isPublicWorld, setIsPublicWorld] = useState<boolean>(true);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [cloudWorlds, setCloudWorlds] = useState<CloudWorldSummary[]>([]);
  const [isLoadingCloudBp, setIsLoadingCloudBp] = useState<boolean>(false);
  const isRemoteApplyingRef = useRef<boolean>(false);

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
  const [localSnapshots, setLocalSnapshots] = useState<LocalAutosaveSnapshot[]>(
    () => {
      try {
        const raw = localStorage.getItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // Ignore
      }
      return [];
    }
  );
  const [lastAutosaveTime, setLastAutosaveTime] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY);
      if (raw) {
        const parsed: LocalAutosaveSnapshot[] = JSON.parse(raw);
        if (parsed[0]?.savedAt) return parsed[0].savedAt;
      }
    } catch {
      // Ignore
    }
    return null;
  });
  const [lastDriveSyncTime, setLastDriveSyncTime] = useState<string | null>(
    null
  );

  useEffect(() => {
    document.body.dataset.state = 'playing';
    hydrateAndMigrateStudioStorage({
      projectsKey: LOCAL_SAVED_PROJECTS_KEY,
      snapshotsKey: LOCAL_AUTOSAVE_SNAPSHOTS_KEY,
      gitCommitsKey: LOCAL_GIT_COMMITS_KEY,
      archiveKey: LOCAL_COPILOT_ARCHIVE_KEY,
      customBlocksKey: LOCAL_CUSTOM_BLOCKS_STORAGE_KEY,
      userProgressKey: LOCAL_USER_PROGRESS_KEY,
    }).then((bundle) => {
      if (bundle.savedProjects && bundle.savedProjects.length > 0) {
        setSavedProjects(bundle.savedProjects);
      }
      if (bundle.localSnapshots && bundle.localSnapshots.length > 0) {
        setLocalSnapshots(bundle.localSnapshots);
      }
      if (bundle.gitCommits && bundle.gitCommits.length > 0) {
        setGitCommits(bundle.gitCommits);
      }
      if (bundle.patternArchive && bundle.patternArchive.patterns) {
        setPatternArchive((prev) => ({ ...prev, ...bundle.patternArchive }));
      }
      if (bundle.userProgress) {
        setUserProgress((prev) => ({ ...prev, ...bundle.userProgress }));
      }
    });
  }, []);

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

  // Persist user blueprints locally
  const persistLocalBlueprints = (list: BlueprintPrefab[]) => {
    try {
      const userOnly = list.filter((b) => b.authorId !== 'system');
      localStorage.setItem(LOCAL_BLUEPRINTS_STORAGE_KEY, JSON.stringify(userOnly));
    } catch {
      // Ignore quota errors
    }
  };

  const persistLocalCustomBlocks = (defs: Record<string, CustomBlockDefinition>) => {
    const customOnly = Object.values(defs).filter((d) => d.isCustom);
    try {
      localStorage.setItem(
        LOCAL_CUSTOM_BLOCKS_STORAGE_KEY,
        JSON.stringify(customOnly)
      );
    } catch {
      // Ignore quota errors
    }
    idbSet('custom_blocks', customOnly).catch(() => {});
  };

  const appendLog = useCallback((cmd: string, message: string, success = true) => {
    setCommandLog((prev) => [
      ...prev.slice(-24),
      { id: `${Date.now()}_${Math.random()}`, cmd, message, success },
    ]);
  }, []);

  // Git Commit Creation & Checkout
  const handleCreateGitCommit = useCallback(
    (customMessage?: string) => {
      const prevHead = gitCommits[0];
      const currentKeys = new Set(Object.keys(engineState.blocks));
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
        blocksSnapshot: { ...engineState.blocks },
        customBlocksSnapshot: Object.values(engineState.customBlocks).filter(
          (d) => d.isCustom
        ),
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
      setActiveCommitId(newCommit.id);
      appendLog(
        `git commit -m "${message}"`,
        `[main ${hash}] ${message} (+${added} -${removed})`,
        true
      );
    },
    [gitCommits, engineState.blocks, engineState.customBlocks, appendLog]
  );

  const handleCheckoutGitCommit = useCallback(
    (commit: GitCommitNode) => {
      setEngineState((prev) => {
        const withUndo = pushUndoSnapshot(prev, `Checkout ${commit.hash}`);
        const nextCustom = { ...withUndo.customBlocks };
        for (const d of commit.customBlocksSnapshot || []) {
          nextCustom[d.id] = d;
        }
        persistLocalCustomBlocks(nextCustom);
        return {
          ...withUndo,
          blocks: { ...commit.blocksSnapshot },
          customBlocks: nextCustom,
        };
      });
      setActiveCommitId(commit.id);
      appendLog(
        `git checkout ${commit.hash}`,
        `Checked out commit ${commit.hash}: "${commit.message}" (${commit.blockCount} blocks).`,
        true
      );
    },
    [appendLog]
  );

  // Update active block color from Windows Paint swatch / color picker
  const handleUpdateActiveBlockColor = useCallback(
    (newHexColor: string) => {
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
        persistLocalCustomBlocks(nextCustom);
        return {
          ...prev,
          customBlocks: nextCustom,
        };
      });
    },
    [activeBlockId]
  );

  // Build portable project backup payload
  const handleBuildCurrentBackupPayload =
    useCallback((): BrickForgeProjectBackup => {
      return buildProjectBackupPayload({
        worldId,
        worldName,
        roomCode,
        isPublicWorld,
        blocks: engineState.blocks,
        customBlocks: engineState.customBlocks,
        blueprints,
        hotkeys: hotkeyConfig,
      });
    }, [
      worldId,
      worldName,
      roomCode,
      isPublicWorld,
      engineState.blocks,
      engineState.customBlocks,
      blueprints,
      hotkeyConfig,
    ]);

  // Perform Local Autosave Snapshot + Optional Google Drive Auto-Backup
  const performSaveSnapshot = useCallback(
    async (trigger: 'auto' | 'manual') => {
      const payload = handleBuildCurrentBackupPayload();
      const nowIso = payload.savedAt;
      const snapshot: LocalAutosaveSnapshot = {
        id: `snap_${Date.now()}`,
        savedAt: nowIso,
        worldName: payload.worldName,
        blockCount: payload.blockCount,
        trigger,
        backup: payload,
      };

      setLocalSnapshots((prev) => {
        const next = [snapshot, ...prev.slice(0, 5)];
        try {
          localStorage.setItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY, JSON.stringify(next));
        } catch {
          // Ignore quota error
        }
        idbSet('autosave_snapshots', next).catch(() => {});
        return next;
      });
      setLastAutosaveTime(nowIso);

      if (trigger === 'manual') {
        handleCreateGitCommit(`Manual save (${payload.blockCount} blocks)`);
      }

      // If signed into Google Drive and autoDriveBackupEnabled (or manual save with token), upload snapshot
      const token = await getAccessToken();
      if (token && (autoDriveBackupEnabled || trigger === 'manual')) {
        try {
          await createDriveBackupFile(token, payload);
          setLastDriveSyncTime(new Date().toISOString());
          if (trigger === 'manual') {
            appendLog(
              '//backup drive',
              `Saved local snapshot and backed up "${payload.worldName}" (${payload.blockCount} blocks) to Google Drive.`,
              true
            );
          }
        } catch {
          // Non-fatal if offline or token expired
        }
      } else if (trigger === 'manual') {
        appendLog(
          '//save',
          `Saved project snapshot "${payload.worldName}" (${payload.blockCount} blocks) to local storage.`,
          true
        );
      }
    },
    [
      handleBuildCurrentBackupPayload,
      autoDriveBackupEnabled,
      appendLog,
      handleCreateGitCommit,
    ]
  );

  // Restore project from a Local Autosave Snapshot or Google Drive Backup
  const handleRestoreFromBackup = useCallback(
    (backup: BrickForgeProjectBackup, sourceLabel: string) => {
      setEngineState((prev) => {
        const withUndo = pushUndoSnapshot(prev, `Restore ${sourceLabel}`);
        const nextCustom = { ...withUndo.customBlocks };
        if (Array.isArray(backup.customBlocks)) {
          for (const d of backup.customBlocks) {
            nextCustom[d.id] = d;
          }
        }
        persistLocalCustomBlocks(nextCustom);
        return {
          ...withUndo,
          blocks: backup.blocks || {},
          customBlocks: nextCustom,
        };
      });

      if (backup.worldId) setWorldId(backup.worldId);
      if (backup.worldName) setWorldName(backup.worldName);
      if (backup.roomCode) setRoomCode(backup.roomCode);
      if (typeof backup.isPublicWorld === 'boolean') {
        setIsPublicWorld(backup.isPublicWorld);
      }

      if (Array.isArray(backup.blueprints) && backup.blueprints.length > 0) {
        setBlueprints((prev) => {
          const map = new Map<string, BlueprintPrefab>();
          for (const item of prev) map.set(item.id, item);
          for (const bItem of backup.blueprints) map.set(bItem.id, bItem);
          const merged = Array.from(map.values());
          persistLocalBlueprints(merged);
          return merged;
        });
      }

      if (backup.hotkeys) {
        handleChangeHotkeyConfig(backup.hotkeys);
      }

      appendLog(
        '//restore',
        `Restored "${backup.worldName}" (${backup.blockCount} blocks) from ${sourceLabel}.`,
        true
      );
    },
    [appendLog, handleChangeHotkeyConfig]
  );

  // Automatic debounced local save after block/customBlock modifications
  const autosaveSkipFirstRef = useRef(true);
  useEffect(() => {
    if (autosaveSkipFirstRef.current) {
      autosaveSkipFirstRef.current = false;
      return;
    }
    if (!autosaveEnabled) return;
    const timer = window.setTimeout(() => {
      const payload = handleBuildCurrentBackupPayload();
      const nowIso = payload.savedAt;
      const snap: LocalAutosaveSnapshot = {
        id: `snap_${Date.now()}`,
        savedAt: nowIso,
        worldName: payload.worldName,
        blockCount: payload.blockCount,
        trigger: 'auto',
        backup: payload,
      };
      setLocalSnapshots((prev) => {
        const next = [snap, ...prev.slice(0, 5)];
        try {
          localStorage.setItem(LOCAL_AUTOSAVE_SNAPSHOTS_KEY, JSON.stringify(next));
        } catch {
          // Ignore
        }
        idbSet('autosave_snapshots', next).catch(() => {});
        return next;
      });
      setLastAutosaveTime(nowIso);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [
    engineState.blocks,
    engineState.customBlocks,
    worldName,
    autosaveEnabled,
    handleBuildCurrentBackupPayload,
  ]);

  // Scheduled Interval Autosave & Google Drive Auto-Sync
  useEffect(() => {
    if (!autosaveEnabled) return;
    const intervalMs = Math.max(15, autosaveIntervalSec) * 1000;
    const id = window.setInterval(() => {
      performSaveSnapshot('auto');
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autosaveEnabled, autosaveIntervalSec, performSaveSnapshot]);

  // Expand world into a target chunk (cx, cz) with a starter island/platform pad
  const handleExpandChunk = useCallback(
    (cx: number, cz: number, style: ChunkExpansionStyle) => {
      const k = chunkKey(cx, cz);
      setEngineState((prev) => {
        const res = expandWorldIntoChunk(
          prev,
          cx,
          cz,
          style,
          chunkConfig.chunkSize
        );
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
    },
    [chunkConfig.chunkSize, appendLog]
  );

  // Place a single block at target coordinate (with Smart Placement Predictor, Self-Learning Archive, Live Symmetry Mirroring & Custom Shift+Scroll Scale)
  const handlePlaceBlockAt = useCallback(
    (coord: GridCoord) => {
      const symTargets = computeSymmetryTargets(
        coord,
        placementRotation,
        symmetryConfig
      );

      playBlockPlaceSound(
        activeBlockId,
        coord.y,
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      );
      incrementUsageCount(activeBlockId, symTargets.length);

      setChunkConfig((prev) => {
        let nextUnlocked = prev.unlockedChunks;
        let nextActive = prev.activeChunks;
        let mutated = false;
        for (const t of symTargets) {
          const { cx, cz } = getChunkCoordForBlock(
            t.coord.x,
            t.coord.z,
            chunkConfig.chunkSize
          );
          const ck = chunkKey(cx, cz);
          if (!nextUnlocked.includes(ck) || nextActive[ck] === false) {
            if (!mutated) {
              nextUnlocked = [...prev.unlockedChunks];
              nextActive = { ...prev.activeChunks };
              mutated = true;
            }
            if (!nextUnlocked.includes(ck)) nextUnlocked.push(ck);
            nextActive[ck] = true;
          }
        }
        return mutated
          ? { ...prev, unlockedChunks: nextUnlocked, activeChunks: nextActive }
          : prev;
      });

      const nowMs = Date.now();
      const newPlacementEntry: PlacementHistoryEntry = {
        coord: { ...coord },
        blockDefId: activeBlockId,
        rotation: placementRotation,
        timestamp: nowMs,
      };

      if (copilotConfig.adaptiveLearningEnabled !== false) {
        const objCls =
          copilotConfig.targetObjectClass &&
          copilotConfig.targetObjectClass !== 'auto_detect'
            ? copilotConfig.targetObjectClass
            : detectArchitecturalObjectClass({
                blocks: engineState.blocks,
                customBlocks: engineState.customBlocks,
                hoveredCoord: coord,
              }).classId;

        setPatternArchive((prevArch) =>
          recordPlacementInPatternArchive({
            archive: prevArch,
            newPlacement: newPlacementEntry,
            recentPlacements,
            blocks: engineState.blocks,
            customBlocks: engineState.customBlocks,
            activeObjectClass: objCls,
            nowMs,
          })
        );
      }

      setRecentPlacements((prev) => [...prev.slice(-7), newPlacementEntry]);

      setEngineState((prev) => {
        const def = prev.customBlocks[activeBlockId];
        if (!def) return prev;
        const withUndo = pushUndoSnapshot(
          prev,
          symTargets.length > 1
            ? `Mirror Place ${def.name} (×${symTargets.length})`
            : `Place ${def.name}`
        );

        const hasCustomScale =
          activeBlockScale.x !== 1 ||
          activeBlockScale.y !== 1 ||
          activeBlockScale.z !== 1;

        const nextBlocks = { ...withUndo.blocks };
        for (const t of symTargets) {
          const k = coordKey(t.coord.x, t.coord.y, t.coord.z);
          const prediction = predictBlockAttributesOnPlacement({
            coord: t.coord,
            def,
            allBlocks: nextBlocks,
            allDefs: prev.customBlocks,
            config: patternConfig,
          });
          nextBlocks[k] = {
            id: `blk_${t.coord.x}_${t.coord.y}_${t.coord.z}`,
            blockDefId: def.id,
            position: { ...t.coord },
            rotation: t.rotation,
            colorOverride: prediction.colorOverride,
            textureOverride: prediction.textureOverride,
            customScale: hasCustomScale ? { ...activeBlockScale } : undefined,
          };
        }

        return {
          ...withUndo,
          blocks: nextBlocks,
        };
      });
    },
    [
      activeBlockId,
      placementRotation,
      symmetryConfig,
      incrementUsageCount,
      chunkConfig.chunkSize,
      copilotConfig.adaptiveLearningEnabled,
      copilotConfig.targetObjectClass,
      engineState.blocks,
      engineState.customBlocks,
      recentPlacements,
      patternConfig,
      activeBlockScale,
    ]
  );

  // Erase block at coordinate (with Live Symmetry Mirroring & Linger Removal Negative-Reinforcement Learning)
  const handleEraseBlockAt = useCallback(
    (coord: GridCoord) => {
      playBlockEraseSound(
        coord.y,
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      );
      const symTargets = computeSymmetryTargets(coord, 0, symmetryConfig);
      const removedCoords = symTargets.map((t) => t.coord);

      if (copilotConfig.adaptiveLearningEnabled !== false) {
        setPatternArchive((prevArch) => {
          const res = recordBlockRemovalForLingerLearning({
            archive: prevArch,
            removedCoords,
          });
          if (res.penalizedCount > 0) {
            setLastLingerPenaltyToast(
              `Copilot learned from removal (-${res.penalizedCount} pattern weight)`
            );
            window.setTimeout(() => setLastLingerPenaltyToast(null), 4200);
          }
          return res.nextArchive;
        });
      }

      setEngineState((prev) => {
        const hasAny = symTargets.some(
          (t) => Boolean(prev.blocks[coordKey(t.coord.x, t.coord.y, t.coord.z)])
        );
        if (!hasAny) return prev;
        const withUndo = pushUndoSnapshot(
          prev,
          `Erase (${coord.x},${coord.y},${coord.z})`
        );
        const nextBlocks = { ...withUndo.blocks };
        for (const t of symTargets) {
          delete nextBlocks[coordKey(t.coord.x, t.coord.y, t.coord.z)];
        }
        return { ...withUndo, blocks: nextBlocks };
      });
    },
    [symmetryConfig, copilotConfig.adaptiveLearningEnabled]
  );

  // Paint block material/type at coordinate
  const handlePaintBlockAt = useCallback(
    (coord: GridCoord) => {
      incrementUsageCount(activeBlockId, 1);
      setEngineState((prev) => {
        const k = coordKey(coord.x, coord.y, coord.z);
        const existing = prev.blocks[k];
        const activeDef = prev.customBlocks[activeBlockId];
        if (!existing || !activeDef) return prev;
        const withUndo = pushUndoSnapshot(prev, `Paint ${activeDef.name}`);
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
    },
    [activeBlockId, incrementUsageCount]
  );

  // Eyedropper pick block at coordinate
  const handlePickBlockAt = useCallback(
    (coord: GridCoord) => {
      const k = coordKey(coord.x, coord.y, coord.z);
      const blk = engineState.blocks[k];
      if (blk) {
        setActiveBlockId(blk.blockDefId);
        setToolMode('place');
        appendLog('//pick', `Picked block ${blk.blockDefId}`, true);
      }
    },
    [engineState.blocks, appendLog]
  );

  // Stamp active blueprint at coordinate
  const handleStampBlueprintAt = useCallback(
    (coord: GridCoord) => {
      if (!activeBlueprint) return;
      setEngineState((prev) =>
        stampBlueprintIntoWorld(prev, activeBlueprint, coord, placementRotation)
      );
      appendLog(
        `//stamp ${activeBlueprint.name}`,
        `Stamped blueprint "${activeBlueprint.name}" (${activeBlueprint.blocks.length} blocks) at (${coord.x}, ${coord.y}, ${coord.z}).`,
        true
      );
    },
    [activeBlueprint, placementRotation, appendLog]
  );

  // Set Pos1 / Pos2 / Clear Selection
  const handleSetPos1 = useCallback(
    (coord: GridCoord) => {
      setEngineState((prev) => ({ ...prev, pos1: coord }));
      appendLog('//pos1', `Pos1 set to (${coord.x}, ${coord.y}, ${coord.z})`, true);
    },
    [appendLog]
  );

  const handleSetPos2 = useCallback(
    (coord: GridCoord) => {
      setEngineState((prev) => ({ ...prev, pos2: coord }));
      appendLog('//pos2', `Pos2 set to (${coord.x}, ${coord.y}, ${coord.z})`, true);
    },
    [appendLog]
  );

  const handleClearSelection = useCallback(() => {
    setEngineState((prev) => ({ ...prev, pos1: null, pos2: null }));
    setSelectionGizmoUnlocked(false);
    setActiveCommandPreviewMode(null);
    if (toolMode === 'wand_select') {
      setToolMode('place');
    }
    appendLog('//desel', 'Cleared 3D region selection.', true);
  }, [toolMode, appendLog]);

  // Nudge 3D selection box face handle (+x, -x, +y, -y, +z, -z)
  const handleNudgeSelectionFace = useCallback(
    (face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z', delta: number) => {
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
    },
    []
  );

  // Scroll-resize selection box while holding selection gizmo modifier
  const handleScrollResizeSelection = useCallback((direction: 1 | -1) => {
    setEngineState((prev) => {
      if (!prev.pos1 || !prev.pos2) return prev;
      const next = transformSelectionBox(
        prev.pos1,
        prev.pos2,
        direction > 0 ? 'expand_all' : 'contract_all',
        1
      );
      return { ...prev, pos1: next.pos1, pos2: next.pos2 };
    });
  }, []);

  // Apply 3D Volume Place or Erase Brush at target coordinate (supports Live Symmetry Mirroring & Linger Learning)
  const handleApplyVolumeBrushAt = useCallback(
    (center: GridCoord, mode: 'place' | 'erase' | 'brush_place' | 'brush_erase') => {
      const symTargets = computeSymmetryTargets(
        center,
        placementRotation,
        symmetryConfig
      );
      if (mode === 'place' || mode === 'brush_place') {
        incrementUsageCount(activeBlockId, symTargets.length);
      } else if (copilotConfig.adaptiveLearningEnabled !== false) {
        setPatternArchive((prevArch) => {
          const res = recordBlockRemovalForLingerLearning({
            archive: prevArch,
            removedCoords: symTargets.map((t) => t.coord),
          });
          if (res.penalizedCount > 0) {
            setLastLingerPenaltyToast(
              `Copilot learned from brush erase (-${res.penalizedCount} pattern weight)`
            );
            window.setTimeout(() => setLastLingerPenaltyToast(null), 4200);
          }
          return res.nextArchive;
        });
      }
      setEngineState((prev) => {
        let working = prev;
        for (const t of symTargets) {
          const res = applyVolumeBrushToWorld({
            state: working,
            center: t.coord,
            mode,
            brush: volumeBrush,
            activeBlockId,
            rotation: t.rotation,
            customScale: activeBlockScale,
            patternConfig,
          });
          working = res.nextState;
        }
        return working;
      });
    },
    [
      volumeBrush,
      activeBlockId,
      placementRotation,
      symmetryConfig,
      incrementUsageCount,
      copilotConfig.adaptiveLearningEnabled,
      activeBlockScale,
      patternConfig,
    ]
  );

  // Execute WorldEdit CLI command
  const handleRunCommand = useCallback(
    (rawCmd: string) => {
      const normalized = rawCmd.trim().toLowerCase();
      if (normalized === '//desel' || normalized === '//deselect' || normalized === '//sel') {
        handleClearSelection();
        return;
      }
      setEngineState((prev) => {
        // If user triggers a region command (//set, //walls, //hollow, //stack, //copy, //cut) without a selection, default to a 5x3x5 region on the island
        const needsRegion = /^\/\/(set|walls|hollow|replace|stack|move|copy|cut)\b/i.test(
          normalized
        );
        const workingState =
          needsRegion && (!prev.pos1 || !prev.pos2)
            ? {
                ...prev,
                pos1: prev.pos1 || { x: -2, y: 1, z: -2 },
                pos2: prev.pos2 || { x: 2, y: 3, z: 2 },
              }
            : prev;
        const res = executeWorldEditCommand(workingState, rawCmd, hoveredCoord);
        appendLog(rawCmd, res.message, res.success);
        if (res.equipWand) {
          setToolMode('wand_select');
        }
        return res.nextState;
      });
    },
    [hoveredCoord, appendLog, handleClearSelection]
  );

  // Save a newly designed Custom Block from Workshop
  const handleSaveCustomBlock = useCallback(
    async (
      blockDef: CustomBlockDefinition,
      saveAsPublicBp: boolean,
      description: string
    ) => {
      setEngineState((prev) => {
        const nextCustom = { ...prev.customBlocks, [blockDef.id]: blockDef };
        persistLocalCustomBlocks(nextCustom);
        return { ...prev, customBlocks: nextCustom };
      });

      setHotbarBlockIds((prev) => {
        if (prev.includes(blockDef.id)) return prev;
        return [blockDef.id, ...prev.slice(0, 8)];
      });
      setActiveBlockId(blockDef.id);
      setToolMode('place');

      const bp = createBlueprintFromCustomBlock(
        blockDef,
        description,
        user?.uid || 'local_builder',
        user?.displayName || user?.email || 'Local Builder',
        saveAsPublicBp
      );

      setBlueprints((prev) => {
        const next = [bp, ...prev];
        persistLocalBlueprints(next);
        return next;
      });

      appendLog(
        `//workshop ${blockDef.id}`,
        `Created custom block "${blockDef.name}" (${blockDef.shape}) and saved to Blueprints & Palette.`,
        true
      );

      if (user) {
        try {
          await saveBlueprintToCloud(bp);
        } catch {
          // Non-fatal if offline
        }
      }
    },
    [user, appendLog]
  );

  // Save Pos1..Pos2 selection (or entire world) as a Structure Blueprint
  const handleSaveSelectionBlueprint = useCallback(
    (
      name: string,
      description: string,
      isPublic: boolean,
      captureWholeWorld: boolean
    ): boolean => {
      let stateForCapture = engineState;
      if (captureWholeWorld) {
        const allCoords = Object.values(engineState.blocks).map((b) => b.position);
        if (allCoords.length === 0) return false;
        const minX = Math.min(...allCoords.map((c) => c.x));
        const maxX = Math.max(...allCoords.map((c) => c.x));
        const minY = Math.min(...allCoords.map((c) => c.y));
        const maxY = Math.max(...allCoords.map((c) => c.y));
        const minZ = Math.min(...allCoords.map((c) => c.z));
        const maxZ = Math.max(...allCoords.map((c) => c.z));
        stateForCapture = {
          ...engineState,
          pos1: { x: minX, y: minY, z: minZ },
          pos2: { x: maxX, y: maxY, z: maxZ },
        };
      }

      const bp = createBlueprintFromSelection(
        stateForCapture,
        name,
        description,
        user?.uid || 'local_builder',
        user?.displayName || user?.email || 'Local Builder',
        isPublic
      );
      if (!bp) return false;

      setBlueprints((prev) => {
        const next = [bp, ...prev];
        persistLocalBlueprints(next);
        return next;
      });
      setActiveBlueprint(bp);
      appendLog(
        `//blueprint save`,
        `Saved structure blueprint "${bp.name}" (${bp.blocks.length} blocks).`,
        true
      );

      if (user) {
        saveBlueprintToCloud(bp).catch(() => {});
      }
      return true;
    },
    [engineState, user, appendLog]
  );

  // Equip a blueprint for interactive stamping
  const handleEquipBlueprintStamp = useCallback(
    (bp: BlueprintPrefab) => {
      setEngineState((prev) => {
        const nextCustom = { ...prev.customBlocks };
        for (const def of bp.customBlockDefs) {
          nextCustom[def.id] = def;
        }
        return { ...prev, customBlocks: nextCustom };
      });
      setActiveBlueprint(bp);
      setToolMode('stamp_blueprint');
      appendLog(
        `//blueprint equip`,
        `Equipped "${bp.name}" stamp. Click any block surface in the 3D world to place structure.`,
        true
      );
    },
    [appendLog]
  );

  // Immediately stamp a blueprint at Pos1 in current world
  const handlePlaceBlueprintAtPos1 = useCallback(
    (bp: BlueprintPrefab) => {
      const target = engineState.pos1 || { x: 0, y: 1, z: 0 };
      setEngineState((prev) =>
        stampBlueprintIntoWorld(prev, bp, target, placementRotation)
      );
      appendLog(
        `//blueprint place`,
        `Placed blueprint "${bp.name}" (${bp.blocks.length} blocks) at (${target.x}, ${target.y}, ${target.z}).`,
        true
      );
    },
    [engineState.pos1, placementRotation, appendLog]
  );

  // Load a saved blueprint into a fresh world
  const handleLoadBlueprintIntoNewWorld = useCallback(
    (bp: BlueprintPrefab) => {
      setEngineState((prev) => loadBlueprintIntoNewWorld(prev, bp, true));
      setWorldName(`${bp.name} World`);
      appendLog(
        `//blueprint load-world`,
        `Loaded blueprint "${bp.name}" into a new studio world (${bp.blocks.length} structure blocks).`,
        true
      );
    },
    [appendLog]
  );

  const handleDeleteBlueprint = useCallback(
    (bpId: string) => {
      setBlueprints((prev) => {
        const next = prev.filter((b) => b.id !== bpId);
        persistLocalBlueprints(next);
        return next;
      });
      if (user) {
        deleteCloudBlueprint(bpId).catch(() => {});
      }
    },
    [user]
  );

  const handleImportBlueprintJson = useCallback(
    (rawJson: string): boolean => {
      try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || !Array.isArray(parsed.blocks)) return false;
        const bp: BlueprintPrefab = {
          id: parsed.id || `bp_import_${Date.now()}`,
          name: parsed.name || 'Imported Blueprint',
          description: parsed.description || 'Imported from JSON schematic',
          authorId: user?.uid || 'local_builder',
          authorName: user?.displayName || 'Local Builder',
          blueprintType: parsed.blueprintType || 'structure_blueprint',
          isPublic: false,
          size: parsed.size || { lx: 3, ly: 3, lz: 3 },
          blocks: parsed.blocks,
          customBlockDefs: parsed.customBlockDefs || [],
          createdAt: new Date().toISOString(),
        };
        setBlueprints((prev) => {
          const next = [bp, ...prev];
          persistLocalBlueprints(next);
          return next;
        });
        return true;
      } catch {
        return false;
      }
    },
    [user]
  );

  const handleRefreshCloudBlueprints = useCallback(async () => {
    setIsLoadingCloudBp(true);
    try {
      const cloudList = await fetchCloudBlueprints();
      setBlueprints((prev) => {
        const map = new Map<string, BlueprintPrefab>();
        for (const item of prev) map.set(item.id, item);
        for (const cItem of cloudList) map.set(cItem.id, cItem);
        return Array.from(map.values());
      });
    } catch {
      // Ignore offline/permission errors for guests
    } finally {
      setIsLoadingCloudBp(false);
    }
  }, []);

  const handleRefreshCloudWorlds = useCallback(async () => {
    try {
      const list = await listUserAndPublicWorlds();
      setCloudWorlds(list);
    } catch {
      // Ignore if guest
    }
  }, []);

  const handleSaveCurrentWorldToCloud = useCallback(async () => {
    const savedId = await saveWorldToCloud({
      worldId,
      name: worldName,
      roomCode,
      isPublic: isPublicWorld,
      blocks: engineState.blocks,
      customBlocks: engineState.customBlocks,
    });
    setWorldId(savedId);
    setIsLiveConnected(true);
    await handleRefreshCloudWorlds();
  }, [
    worldId,
    worldName,
    roomCode,
    isPublicWorld,
    engineState.blocks,
    engineState.customBlocks,
    handleRefreshCloudWorlds,
  ]);

  const handleJoinCloudWorld = useCallback(
    (summary: CloudWorldSummary) => {
      try {
        const parsedBlocks = JSON.parse(summary.blocksData);
        const parsedCustom: CustomBlockDefinition[] = JSON.parse(
          summary.customBlocksData || '[]'
        );
        setEngineState((prev) => {
          const nextCustom = { ...prev.customBlocks };
          for (const d of parsedCustom) nextCustom[d.id] = d;
          return {
            ...prev,
            blocks: parsedBlocks,
            customBlocks: nextCustom,
          };
        });
        setWorldId(summary.id);
        setWorldName(summary.name);
        setRoomCode(summary.roomCode);
        setIsPublicWorld(summary.isPublic);
        setIsLiveConnected(true);
        appendLog(
          `//join ${summary.roomCode}`,
          `Joined cloud world "${summary.name}" (${summary.blockCount} blocks).`,
          true
        );
      } catch {
        appendLog('//join', 'Failed to parse cloud world blocks.', false);
      }
    },
    [appendLog]
  );

  // Live Multiplayer Co-Building Subscription when connected
  useEffect(() => {
    if (!isLiveConnected || !user) return;
    const unsubWorld = subscribeToWorldRoom(worldId, (summary) => {
      try {
        const remoteBlocks = JSON.parse(summary.blocksData);
        isRemoteApplyingRef.current = true;
        setEngineState((prev) => ({
          ...prev,
          blocks: remoteBlocks,
        }));
      } catch {
        // Ignore parse error
      }
    });
    const unsubPresence = subscribeToWorldPresence(worldId, (list) => {
      setCollaborators(list);
    });
    return () => {
      unsubWorld();
      unsubPresence();
    };
  }, [isLiveConnected, user, worldId]);

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

  // Accept predicted Ghost Auto-Complete blocks (Tab or 1-tap HUD button)
  const handleAcceptCopilotPredictions = useCallback(() => {
    if (copilotPredictions.length === 0) return;

    playGhostAcceptArpeggio(
      userProgress.soundEnabled,
      userProgress.hapticsEnabled
    );
    incrementUsageCount(activeBlockId, copilotPredictions.length);

    if (copilotConfig.adaptiveLearningEnabled !== false) {
      const anchorBlockId =
        recentPlacements[recentPlacements.length - 1]?.blockDefId ||
        activeBlockId;
      setPatternArchive((prevArch) =>
        recordAcceptedGhostPredictionsInArchive({
          archive: prevArch,
          acceptedPredictions: copilotPredictions,
          anchorBlockId,
          lingerWindowSec: copilotConfig.lingerTrackingWindowSec || 45,
          activeObjectClass: detectedObjectClass?.classId || 'house_dwelling',
        })
      );
    }

    setEngineState((prev) => {
      const withUndo = pushUndoSnapshot(
        prev,
        `Copilot Auto-Complete (+${copilotPredictions.length})`
      );
      const nextBlocks = { ...withUndo.blocks };
      for (const pred of copilotPredictions) {
        const def = prev.customBlocks[pred.blockDefId];
        if (!def) continue;
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
            id: `blk_${t.coord.x}_${t.coord.y}_${t.coord.z}`,
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
    setRecentPlacements((prev) => [
      ...prev.slice(-6),
      {
        coord: { ...lastPred.position },
        blockDefId: lastPred.blockDefId,
        rotation: lastPred.rotation,
        timestamp: Date.now(),
      },
    ]);
    appendLog(
      '//copilot accept',
      `Accepted +${copilotPredictions.length} predicted ghost blocks (${copilotPredictions[0].reason}). Monitored in 45s linger buffer.`,
      true
    );
  }, [
    copilotPredictions,
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
    if (!walkabilityReport || walkabilityReport.darkInteriorCoords.length === 0) {
      return;
    }
    setEngineState((prev) => {
      const withUndo = pushUndoSnapshot(
        prev,
        `Auto-Light (${walkabilityReport.darkInteriorCoords.length} lanterns)`
      );
      const nextBlocks = { ...withUndo.blocks };
      let placed = 0;
      for (const c of walkabilityReport.darkInteriorCoords.slice(0, 8)) {
        const k = coordKey(c.x, c.y, c.z);
        if (!nextBlocks[k]) {
          nextBlocks[k] = {
            id: `blk_${c.x}_${c.y}_${c.z}`,
            blockDefId: 'voxel_lantern',
            position: { ...c },
            rotation: 0,
          };
          placed++;
        }
      }
      appendLog(
        '//copilot light',
        `Placed ${placed} Voxel Lanterns in dark interior pockets.`,
        true
      );
      return { ...withUndo, blocks: nextBlocks };
    });
  }, [walkabilityReport, appendLog]);

  // Execute a repeatable Command Macro Loop from the Modular Action Bar HUD
  const handleTriggerMacroLoop = useCallback(
    (macro: CommandMacroLoop) => {
      const resolveCommandTokens = (raw: string) =>
        raw.replace(/\{active\}/g, activeBlockId);

      const totalIterations = Math.max(1, Math.min(16, macro.iterations || 1));
      if (!macro.intervalMs || macro.intervalMs <= 0) {
        setEngineState((prev) => {
          let working = prev;
          for (let i = 0; i < totalIterations; i++) {
            for (const c of macro.commands) {
              const res = executeWorldEditCommand(
                working,
                resolveCommandTokens(c),
                hoveredCoord
              );
              working = res.nextState;
            }
          }
          return working;
        });
        appendLog(
          `//macro ${macro.name}`,
          `Executed Command Loop "${macro.name}" (${macro.commands.length} cmds × ${totalIterations}x).`,
          true
        );
      } else {
        let stepIdx = 0;
        const stepDelay = Math.max(100, macro.intervalMs);
        const timer = window.setInterval(() => {
          if (stepIdx >= totalIterations) {
            window.clearInterval(timer);
            return;
          }
          stepIdx++;
          setEngineState((prev) => {
            let working = prev;
            for (const c of macro.commands) {
              const res = executeWorldEditCommand(
                working,
                resolveCommandTokens(c),
                hoveredCoord
              );
              working = res.nextState;
            }
            return working;
          });
        }, stepDelay);
        appendLog(
          `//macro ${macro.name}`,
          `Running animated Command Loop "${macro.name}" (${totalIterations} steps @ ${stepDelay}ms)...`,
          true
        );
      }
    },
    [activeBlockId, hoveredCoord, appendLog]
  );

  // Install CC0 Open-Source Market Blocks into the User's Active Studio Library
  const handleInstallMarketBlocks = useCallback(
    (defs: CustomBlockDefinition[]) => {
      if (defs.length === 0) return;
      setEngineState((prev) => {
        const nextCustom = { ...prev.customBlocks };
        for (const d of defs) {
          nextCustom[d.id] = { ...d, isCustom: true };
        }
        persistLocalCustomBlocks(nextCustom);
        return { ...prev, customBlocks: nextCustom };
      });
      setActiveBlockId(defs[0].id);
      setToolMode('place');
      appendLog(
        '//market install',
        defs.length === 1
          ? `Added "${defs[0].name}" from CC0 Market to your Studio Library.`
          : `Installed ${defs.length} CC0 blocks into your Studio Library.`,
        true
      );
    },
    [appendLog]
  );

  // Assign a block from the Studio Library directly to Primary Hotbar Slot 1..9
  const handleAssignBlockToPrimarySlot = useCallback(
    (blockId: string, slotIndex: number) => {
      const clampedIdx = Math.max(0, Math.min(8, slotIndex));
      setHotbarBlockIds((prev) => {
        const next = [...prev];
        next[clampedIdx] = blockId;
        return next;
      });
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
      setActiveBlockId(blockId);
      setToolMode('place');
    },
    []
  );

  // Save/Overwrite a Named Project in the Main Menu Project Manager
  const handleSaveProjectSlot = useCallback(
    (name: string, description: string, overwriteId?: string) => {
      const cleanName = name.trim() || worldName || 'Untitled Studio Project';
      const nowIso = new Date().toISOString();
      const customList = Object.values(engineState.customBlocks).filter(
        (d) => d.isCustom
      );
      const proj: SavedStudioProject = {
        id: overwriteId || `proj_${Date.now()}`,
        name: cleanName,
        description: description.trim() || 'Saved from LFS Block Studio Main Menu',
        updatedAt: nowIso,
        blockCount: Object.keys(engineState.blocks).length,
        unlockedChunksCount: chunkConfig.unlockedChunks.length,
        blocks: { ...engineState.blocks },
        customBlocks: customList,
        chunkConfig: { ...chunkConfig },
      };

      setWorldName(cleanName);
      const nextList = overwriteId
        ? [proj, ...savedProjects.filter((p) => p.id !== overwriteId)]
        : [proj, ...savedProjects];
      persistSavedProjects(nextList.slice(0, 20));
      appendLog(
        '//project save',
        `Saved project "${cleanName}" (${proj.blockCount} blocks).`,
        true
      );
    },
    [
      worldName,
      engineState.blocks,
      engineState.customBlocks,
      chunkConfig,
      savedProjects,
      persistSavedProjects,
      appendLog,
    ]
  );

  const handleLoadProjectSlot = useCallback(
    (proj: SavedStudioProject) => {
      setEngineState((prev) => {
        const withUndo = pushUndoSnapshot(prev, `Load Project ${proj.name}`);
        const nextCustom = { ...withUndo.customBlocks };
        for (const d of proj.customBlocks || []) {
          nextCustom[d.id] = d;
        }
        persistLocalCustomBlocks(nextCustom);
        return {
          ...withUndo,
          blocks: { ...proj.blocks },
          customBlocks: nextCustom,
        };
      });
      if (proj.chunkConfig) {
        setChunkConfig(proj.chunkConfig);
      }
      setWorldName(proj.name);
      appendLog(
        '//project load',
        `Loaded project "${proj.name}" (${proj.blockCount} blocks).`,
        true
      );
    },
    [appendLog]
  );

  const handleDeleteProjectSlot = useCallback(
    (projectId: string) => {
      const next = savedProjects.filter((p) => p.id !== projectId);
      persistSavedProjects(next);
    },
    [savedProjects, persistSavedProjects]
  );

  const handleImportProjectJson = useCallback(
    (rawJson: string): boolean => {
      try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed.blocks !== 'object') return false;
        const proj: SavedStudioProject = {
          id: parsed.id || `proj_import_${Date.now()}`,
          name: parsed.name || parsed.worldName || 'Imported LFS Project',
          description: parsed.description || 'Imported from .lfsproj.json',
          updatedAt: new Date().toISOString(),
          blockCount: Object.keys(parsed.blocks).length,
          unlockedChunksCount:
            parsed.chunkConfig?.unlockedChunks?.length || 1,
          blocks: parsed.blocks,
          customBlocks: Array.isArray(parsed.customBlocks)
            ? parsed.customBlocks
            : [],
          chunkConfig: parsed.chunkConfig || DEFAULT_CHUNK_CONFIG,
        };
        persistSavedProjects([proj, ...savedProjects]);
        handleLoadProjectSlot(proj);
        return true;
      } catch {
        return false;
      }
    },
    [savedProjects, persistSavedProjects, handleLoadProjectSlot]
  );

  // Reset Entire World to a Selected Template
  const handleResetEntireWorld = useCallback(
    (template: WorldResetTemplateId) => {
      setEngineState((prev) => {
        const res = resetEntireWorldToTemplate(
          prev,
          template,
          chunkConfig.chunkSize
        );
        appendLog('//reset world', res.summary, true);
        return res.nextState;
      });
      setChunkConfig(DEFAULT_CHUNK_CONFIG);
    },
    [chunkConfig.chunkSize, appendLog]
  );

  // Reset or Clear a Specific Individual Chunk (cx, cz) without affecting other chunks
  const handleResetSpecificChunk = useCallback(
    (
      cx: number,
      cz: number,
      style:
        | 'clear_air'
        | 'grass_island'
        | 'stone_foundation'
        | 'timber_deck'
        | 'sandstone_plaza'
    ) => {
      setEngineState((prev) => {
        const res = resetSpecificChunkInWorld(
          prev,
          cx,
          cz,
          style,
          chunkConfig.chunkSize
        );
        appendLog(`//reset chunk (${cx},${cz})`, res.summary, true);
        return res.nextState;
      });
    },
    [chunkConfig.chunkSize, appendLog]
  );

  // Engagement Handlers: Atmosphere Presets, Procedural Biomes, Contract XP & Compliance Purge
  const handleSelectAtmospherePreset = useCallback(
    (presetId: AtmospherePresetId) => {
      const preset = getAtmospherePresetById(presetId);
      setActiveAtmosphereId(preset.id);
      setDaylightMode(preset.daylightMode);
      setLightingConfig({ ...preset.lighting });
      appendLog(
        `//atmosphere ${preset.id}`,
        `Applied "${preset.name}" solar & fog preset.`,
        true
      );
    },
    [appendLog]
  );

  const handleGenerateProceduralBiome = useCallback(
    (biomeId: ProceduralBiomeId, syncAtmosphere: boolean) => {
      setEngineState((prev) => {
        const res = applyProceduralBiomeToWorld(prev, biomeId);
        appendLog(`//biome ${biomeId}`, res.summary, true);
        return res.nextState;
      });
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
      playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      );
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
      playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      );
      const next: StudioUserProgressState = {
        ...userProgress,
        xp: userProgress.xp + xpReward,
        claimedContractIds: [...userProgress.claimedContractIds, contractId],
      };
      persistUserProgress(next);
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
      playContractCompleteFanfare(
        userProgress.soundEnabled,
        userProgress.hapticsEnabled
      );
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

  const handlePurgeLocalAndCloudAccountData = useCallback(async (): Promise<string> => {
    const cloudRes = await deleteAllUserCloudData();
    await idbClearAll();
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
    setSavedProjects([]);
    setLocalSnapshots([]);
    setPatternArchive(createInitialAdaptivePatternArchive());
    setUserProgress(DEFAULT_USER_PROGRESS_STATE);
    appendLog(
      '//compliance purge',
      `Purged local IndexedDB & ${cloudRes.deletedWorlds} cloud worlds / ${cloudRes.deletedBlueprints} blueprints.`,
      true
    );
    return `Deleted ${cloudRes.deletedWorlds} cloud worlds, ${cloudRes.deletedBlueprints} cloud blueprints, and cleared local IndexedDB.`;
  }, [appendLog]);

  // Global Customizable Keyboard Shortcuts Dispatcher
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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

      if (activeModal !== 'none') return;

      if (e.key === 'Escape') {
        if (engineState.pos1 || engineState.pos2 || toolMode === 'wand_select') {
          e.preventDefault();
          handleClearSelection();
          return;
        }
      }

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
          setMouseLookToggled((prev) => !prev);
        }
      } else if (matchesKeyBinding(e, bindings.holdMouseLookMode)) {
        e.preventDefault();
        if (!e.repeat) {
          setIsHoldingMouseLook(true);
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
        setFlyMode((prev) => !prev);
      } else if (matchesKeyBinding(e, bindings.resetCamera)) {
        e.preventDefault();
        setCameraPreset('isometric');
      } else if (matchesKeyBinding(e, bindings.toolPlace)) {
        e.preventDefault();
        setToolMode('place');
      } else if (matchesKeyBinding(e, bindings.toolErase)) {
        e.preventDefault();
        setToolMode('erase');
      } else if (matchesKeyBinding(e, bindings.toolPaint)) {
        e.preventDefault();
        setToolMode('paint');
      } else if (matchesKeyBinding(e, bindings.toolPick)) {
        e.preventDefault();
        setToolMode('pick');
      } else if (matchesKeyBinding(e, bindings.toolWand)) {
        e.preventDefault();
        setToolMode('wand_select');
      } else if (matchesKeyBinding(e, bindings.toolBrushPlace)) {
        e.preventDefault();
        setToolMode('brush_place');
      } else if (matchesKeyBinding(e, bindings.toolBrushErase)) {
        e.preventDefault();
        setToolMode('brush_erase');
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
        const primaryBar = hudConfig.bars.find(
          (b) => b.id === 'bar_primary_blocks'
        ) || hudConfig.bars[0];
        const slot = primaryBar?.slots[idx];
        if (slot) {
          if (slot.type === 'block') {
            setActiveBlockId(slot.targetId);
            setToolMode('place');
          } else if (slot.type === 'tool') {
            setToolMode(slot.targetId as ToolMode);
          } else if (slot.type === 'command') {
            handleRunCommand(slot.targetId);
          }
        } else if (hotbarBlockIds[idx]) {
          setActiveBlockId(hotbarBlockIds[idx]);
          setToolMode('place');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (matchesKeyBinding(e, hotkeyConfig.bindings.holdMouseLookMode)) {
        setIsHoldingMouseLook(false);
      }
      if (matchesKeyBinding(e, hotkeyConfig.bindings.holdSelectionGizmo)) {
        setIsHoldingSelectionGizmo(false);
      }
    };

    const onBlur = () => {
      setIsHoldingMouseLook(false);
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
    engineState.pos1,
    engineState.pos2,
    toolMode,
    handleClearSelection,
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

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100">
      {/* Top Microsoft Word / Office Style Multi-Tab Studio Ribbon */}
      <StudioRibbonHeader
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
        customBlocks={engineState.customBlocks}
        activeBlueprint={activeBlueprint}
        blueprintsCount={blueprints.length}
        placementRotation={placementRotation}
        onRotatePlacement={() =>
          setPlacementRotation((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270))
        }
        canUndo={engineState.undoStack.length > 0}
        canRedo={engineState.redoStack.length > 0}
        onRunCommand={handleRunCommand}
        onTriggerManualSaveNow={() => performSaveSnapshot('manual')}
        onOpenModal={(m) => {
          if (m === 'cloud') handleRefreshCloudWorlds();
          setActiveModal(m);
        }}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
        daylightMode={daylightMode}
        onToggleDaylight={() => setDaylightMode((prev) => !prev)}
        lightingConfig={lightingConfig}
        onChangeLightingConfig={setLightingConfig}
        chunkConfig={chunkConfig}
        onChangeChunkConfig={setChunkConfig}
        onExpandChunk={handleExpandChunk}
        patternConfig={patternConfig}
        onChangePatternConfig={setPatternConfig}
        onSelectCameraPreset={setCameraPreset}
        flyMode={flyMode}
        onToggleFlyMode={() => setFlyMode((prev) => !prev)}
        freeLookActive={effectiveFreeLook}
        onToggleMouseLookMode={() => setMouseLookToggled((prev) => !prev)}
        rightSidebarTab={rightSidebarTab}
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
            setActiveBlockId(id);
            if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
              setToolMode('place');
            }
          }}
          customBlocks={engineState.customBlocks}
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
        <main className="relative flex-1 h-full min-w-0 overflow-hidden">
          <SkyblockViewport
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
            patternConfig={patternConfig}
            cameraPreset={cameraPreset}
            collaborators={collaborators}
            hotkeyConfig={hotkeyConfig}
            flyMode={flyMode}
            onToggleFlyMode={() => setFlyMode((prev) => !prev)}
            freeLookActive={effectiveFreeLook}
            isHoldingFreeLook={isHoldingMouseLook}
            onToggleMouseLookMode={() => setMouseLookToggled((prev) => !prev)}
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
              setActiveBlockId(id);
              if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
                setToolMode('place');
              }
            }}
            onSelectToolMode={setToolMode}
            isLeftToolboxOpen={isLeftToolboxOpen}
            onOpenLeftToolbox={() => setIsLeftToolboxOpen(true)}
            isRightInspectorOpen={rightSidebarTab !== 'closed'}
            onOpenRightInspector={() => setRightSidebarTab('legend')}
          />

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
              setActiveBlockId(id);
              if (toolMode === 'stamp_blueprint' || toolMode === 'wand_select') {
                setToolMode('place');
              }
            }}
            toolMode={toolMode}
            onSelectToolMode={setToolMode}
            customBlocks={engineState.customBlocks}
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
            customBlocks={engineState.customBlocks}
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
            canUndo={engineState.undoStack.length > 0}
            canRedo={engineState.redoStack.length > 0}
            isLeftToolboxOpen={isLeftToolboxOpen}
            onToggleLeftToolbox={() => setIsLeftToolboxOpen((prev) => !prev)}
            rightSidebarTab={rightSidebarTab}
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
          activeTab={rightSidebarTab}
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
          patternArchive={patternArchive}
          detectedObjectClass={detectedObjectClass}
          onResetPatternArchive={() =>
            setPatternArchive(createInitialAdaptivePatternArchive())
          }
          isFloating={rightSidebarFloating}
          onToggleFloating={() => setRightSidebarFloating((prev) => !prev)}
          dockedWidth={workspaceMetrics.effectiveRightWidth || rightDockedWidth}
          onResizeDockedWidth={setRightDockedWidth}
        />
      </div>

      {/* Bottom Studio Status Bar & Integrated WorldEdit Command Bar (Adapts cleanly to narrow/split-screen window resizing) */}
      <footer className="min-h-[40px] py-1 bg-slate-950 border-t border-slate-800 px-3 flex items-center justify-between gap-2 z-30 shrink-0 select-none overflow-x-auto no-scrollbar">
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
          setActiveBlockId(id);
          setToolMode('place');
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
        onDeleteProjectSlot={handleDeleteProjectSlot}
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
        onPurgeLocalAndCloudAccountData={handlePurgeLocalAndCloudAccountData}
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
          setActiveBlockId(id);
          setToolMode('place');
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
        onToggleFlyMode={() => setFlyMode((prev) => !prev)}
        mouseLookToggled={mouseLookToggled}
        onToggleMouseLookMode={() => setMouseLookToggled((prev) => !prev)}
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
        onUpdateWorldMeta={(n, r, pub) => {
          setWorldName(n);
          setRoomCode(r);
          setIsPublicWorld(pub);
        }}
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
  );
}
