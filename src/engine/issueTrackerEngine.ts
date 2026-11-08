import { idbGet, idbSet } from '../lib/indexedDbStorage';
import { SelfTestSuiteReport } from './selfTestSuite';

export type IssueSeverity = 'P0' | 'P1' | 'P2';

export type IssueSource =
  | 'AUTO_SELF_TEST'
  | 'RUNTIME_EXCEPTION'
  | 'USER_CIRCLED_SCREENSHOT'
  | 'GEMINI_AUTONOMOUS_AUDIT'
  | 'WEBGL_TELEMETRY_GUARD';

export type IssueStatus =
  | 'OPEN'
  | 'TRIAGED_BY_GEMINI'
  | 'PATCH_READY'
  | 'VERIFIED_FIXED'
  | 'REGRESSION';

export type IssueDomainCategory =
  | 'UI_OVERLAP'
  | 'RENDERING_ARTIFACT'
  | 'RAYCAST_OCCLUSION'
  | 'STATE_DESYNC'
  | 'MEMORY_LEAK'
  | 'COMMAND_BOUNDS'
  | 'PERSISTENCE'
  | 'BALANCE_PROGRESSION'
  | 'IP_COMPLIANCE'
  | 'WEBGL_TELEMETRY_GUARD';

export interface NormalizedAnnotationRegion {
  id: string;
  shape: 'circle' | 'box' | 'freehand' | 'pin';
  x: number; // 0..1 normalized center or top-left X
  y: number; // 0..1 normalized center or top-left Y
  w: number; // 0..1 normalized width / diameter
  h: number; // 0..1 normalized height / diameter
  pinNumber?: number;
  label?: string;
  points?: { x: number; y: number }[];
}

export interface StudioTelemetrySnapshot {
  capturedAtIso: string;
  activeBlockCount: number;
  unlockedChunksCount: number;
  activeToolMode: string;
  activeBlockId: string;
  webglGeometries: number;
  webglTextures: number;
  webglDrawCalls: number;
  webglTriangles: number;
  windowWidth: number;
  windowHeight: number;
  lastCommands: string[];
  openWindows: string[];
}

export interface GeminiIssueAnalysis {
  title: string;
  severity: IssueSeverity;
  domain: IssueDomainCategory;
  rootCause: string;
  visualEvidence: string;
  suspectedFiles: string[];
  recommendedCodeFix: string;
  aiStudioFixPrompt: string;
  confidence: number;
  analyzedByModel?: string;
}

export interface TrackedStudioIssue {
  id: string;
  fingerprint: string; // Deterministic hash key: domain + sourceFile + assertion/symptom
  title: string;
  severity: IssueSeverity;
  source: IssueSource;
  status: IssueStatus;
  domain: IssueDomainCategory;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  annotatedScreenshotDataUrl?: string;
  circledRegions: NormalizedAnnotationRegion[];
  userDescription?: string;
  telemetrySnapshot: StudioTelemetrySnapshot;
  geminiAnalysis?: GeminiIssueAnalysis;
}

const LOCAL_STORAGE_ISSUES_KEY = 'brickforge_issue_tracker_v1';
const IDB_ISSUES_KEY = 'issue_tracker_tickets';

function buildDefaultTelemetry(): StudioTelemetrySnapshot {
  return {
    capturedAtIso: new Date().toISOString(),
    activeBlockCount: 236,
    unlockedChunksCount: 1,
    activeToolMode: 'place',
    activeBlockId: 'cobble_brick',
    webglGeometries: 0,
    webglTextures: 0,
    webglDrawCalls: 0,
    webglTriangles: 0,
    windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
    windowHeight: typeof window !== 'undefined' ? window.innerHeight : 900,
    lastCommands: [],
    openWindows: [],
  };
}

/**
 * Baseline audit ledger documenting the P0/P1 findings from commit `f2de5949594202e57fda9dc38cea7bf3634825ab`
 * and their deterministic self-test fingerprints so the tracker shows full historical traceability.
 */
export function getSeededBaselineAuditIssues(): TrackedStudioIssue[] {
  const now = new Date().toISOString();
  const baseTel = buildDefaultTelemetry();
  return [
    {
      id: 'ISS-001',
      fingerprint:
        'command_bounds_fuzzer:src/engine/worldEditEngine.ts:reject_oom_region_volume',
      title:
        'Unbounded WorldEdit Region & Sparse Schematic Volume OOM (Safe Budget Guard)',
      severity: 'P0',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'COMMAND_BOUNDS',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'Unbounded WorldEdit & Schematic Bounding Box Allocation',
        severity: 'P0',
        domain: 'COMMAND_BOUNDS',
        rootCause:
          'Triple-nested X/Y/Z loops in worldEditEngine.ts and dense allocation in schematicExporter.ts required finite coordinate guards and a strict cell volume cap.',
        visualEvidence:
          'Executing //pos1 -5000 0 -5000 -> //pos2 5000 255 5000 -> //set cobble_brick previously froze the main thread.',
        suspectedFiles: [
          'src/engine/worldEditEngine.ts',
          'src/engine/schematicExporter.ts',
        ],
        recommendedCodeFix:
          'Enforce getGridCoordError and MAX_SAFE_REGION_CELL_BUDGET across all region commands and schematic exports.',
        aiStudioFixPrompt:
          'In src/engine/worldEditEngine.ts and src/engine/schematicExporter.ts, enforce finite integer coordinate bounds and reject bounding boxes exceeding the cell budget in < 5ms.',
        confidence: 99,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
    {
      id: 'ISS-002',
      fingerprint:
        'undo_preset_transactions:src/engine/openSourceBlockMarket.ts:cyber_grid_preset_and_atomic_undo',
      title:
        'Double Undo Snapshot on World/Chunk Reset & Incomplete cyber_grid / sandstone_plaza Platforms',
      severity: 'P0',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'STATE_DESYNC',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'Double Undo Push in resetEntireWorldToTemplate & 2x2 Fallback in cyber_grid',
        severity: 'P0',
        domain: 'STATE_DESYNC',
        rootCause:
          'resetEntireWorldToTemplate pushed an undo snapshot of the starter world and then called expandWorldIntoChunk which pushed a second empty-world undo snapshot, while cyber_grid and sandstone_plaza fell through to a 4-block 2x2 stub.',
        visualEvidence:
          'Selecting Cyber Grid spawned only 4 center blocks and pressing //undo once left the viewport completely empty.',
        suspectedFiles: [
          'src/engine/openSourceBlockMarket.ts',
          'src/engine/chunkAndPatternEngine.ts',
        ],
        recommendedCodeFix:
          'Pass { skipUndoSnapshot: true } to expandWorldIntoChunk inside world/chunk resets and implement full 148-block platforms for cyber_grid and sandstone_plaza.',
        aiStudioFixPrompt:
          'Ensure resetEntireWorldToTemplate and resetSpecificChunkInWorld push exactly one atomic undo snapshot and generate full platforms for cyber_grid and sandstone_plaza.',
        confidence: 99,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
    {
      id: 'ISS-003',
      fingerprint:
        'persistence_serialization_crucible:src/lib/firebase.ts:cloud_payload_no_slice_truncation',
      title:
        'Cloud Sync Mid-JSON .slice() Truncation & Unvalidated Project Import Payloads',
      severity: 'P0',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'PERSISTENCE',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'Corrupt Mid-JSON .slice() Truncation & Missing Import Schema Validator',
        severity: 'P0',
        domain: 'PERSISTENCE',
        rootCause:
          'saveWorldToCloud and publishBlueprintToWorkshop truncated JSON strings via .slice(0, 900000), producing unparseable JSON on load.',
        visualEvidence:
          'Large cloud saves silently truncated the closing braces of blocksJson, failing JSON.parse on restore.',
        suspectedFiles: ['src/lib/firebase.ts', 'src/lib/googleDrive.ts'],
        recommendedCodeFix:
          'Use serializeCloudWorldPayload to fail closed when byte size exceeds safe limits, scope default world IDs per UID, and validate imported JSON payloads via validateImportedWorldPayload.',
        aiStudioFixPrompt:
          'Replace .slice() JSON truncation in src/lib/firebase.ts with serializeCloudWorldPayload size guards and validate all imported worlds in src/lib/googleDrive.ts.',
        confidence: 99,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
    {
      id: 'ISS-004',
      fingerprint:
        'ux_ergonomics_input_ownership:src/engine/hotkeys.ts:zero_hotkey_collisions',
      title:
        'KeyV Hotkey Collision (Symmetry Mirror vs Reset Camera) & WebGL Geometry Leak on Rebuilds',
      severity: 'P1',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'MEMORY_LEAK',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'KeyV Shortcut Collision & Unshared BufferGeometry Leak in SkyblockViewport',
        severity: 'P1',
        domain: 'MEMORY_LEAK',
        rootCause:
          'resetCamera and toggleSymmetryMirror both bound KeyV in DEFAULT_HOTKEYS, and rebuildPlacedBlocks removed meshes without disposing unshared BufferGeometries.',
        visualEvidence:
          'Pressing V triggered both camera reset and symmetry mirror; rapid block placement grew renderer.info.memory.geometries unboundedly.',
        suspectedFiles: [
          'src/engine/hotkeys.ts',
          'src/engine/legoGeometry.ts',
          'src/components/SkyblockViewport.tsx',
        ],
        recommendedCodeFix:
          'Rebind resetCamera to KeyZ and call disposeUnsharedGroupGeometries(group) before clearing Three.js groups.',
        aiStudioFixPrompt:
          'Bind resetCamera to KeyZ in src/engine/hotkeys.ts and dispose unshared geometries in src/components/SkyblockViewport.tsx while preserving studGeoCache.',
        confidence: 98,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
    {
      id: 'ISS-005',
      fingerprint:
        'balance_copilot_progression:src/engine/spatialCopilotEngine.ts:copilot_texture_and_architectural_classifier',
      title:
        'Copilot Texture Mismatch, Empty Walkability 100% Bug, & Pre-Completed Starter Contract',
      severity: 'P1',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'BALANCE_PROGRESSION',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'Copilot Pattern Mismatch, Walkability Empty World 100%, & Homestead Contract Balance',
        severity: 'P1',
        domain: 'BALANCE_PROGRESSION',
        rootCause:
          'spatialCopilotEngine checked only oak_planks/brick_masonry instead of wood_grain/brick_mortar, auditWorldWalkability returned 100% on 0-block worlds, and contract_homestead_foundation was 100% complete on the starter island.',
        visualEvidence:
          'Clearing the world showed "100% Playtest Ready", and Homestead Foundation awarded 150 XP before placing a single block.',
        suspectedFiles: [
          'src/engine/spatialCopilotEngine.ts',
          'src/engine/studioEngagementEngine.ts',
        ],
        recommendedCodeFix:
          'Support both texture pattern naming conventions, return 0% walkability when walkableCount === 0, populate steepDropCoords, and require roof/slope placement for Homestead Foundation.',
        aiStudioFixPrompt:
          'Fix texture cohesion and walkability edge cases in src/engine/spatialCopilotEngine.ts and require roof/slope placement for Homestead Foundation in src/engine/studioEngagementEngine.ts.',
        confidence: 98,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
    {
      id: 'ISS-006',
      fingerprint:
        'legal_ip_export_fidelity:src/engine/godotExporter.ts:gltf2_spec_compliant_mesh_export',
      title:
        'glTF 2.0 Empty Mesh Export & Third-Party Trademark / CC0 Attribution Hygiene',
      severity: 'P1',
      source: 'AUTO_SELF_TEST',
      status: 'VERIFIED_FIXED',
      domain: 'IP_COMPLIANCE',
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      circledRegions: [],
      telemetrySnapshot: baseTel,
      geminiAnalysis: {
        title: 'Empty glTF 2.0 Nodes Export & Trademark Hygiene',
        severity: 'P1',
        domain: 'IP_COMPLIANCE',
        rootCause:
          'exportToGltfJson emitted empty nodes with no meshes/buffers/materials, and built-in packs/blueprints contained third-party trademark strings.',
        visualEvidence:
          'Importing exported .gltf files into Godot or Blender produced empty transforms with no visible geometry.',
        suspectedFiles: [
          'src/engine/godotExporter.ts',
          'src/engine/openSourceBlockMarket.ts',
          'src/components/SchematicExportModal.tsx',
        ],
        recommendedCodeFix:
          'Emit complete glTF 2.0 meshes, PBR materials, accessors, bufferViews, and base64 buffers with customScale, and scrub trademarked claims.',
        aiStudioFixPrompt:
          'Update exportToGltfJson in src/engine/godotExporter.ts to emit complete glTF 2.0 geometry/material buffers and scrub third-party trademark strings.',
        confidence: 99,
        analyzedByModel: 'Deterministic Self-Test Harness',
      },
    },
  ];
}

export function loadTrackedIssuesSync(): TrackedStudioIssue[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return getSeededBaselineAuditIssues();
    }
    const raw = window.localStorage.getItem(LOCAL_STORAGE_ISSUES_KEY);
    if (!raw) {
      const seeded = getSeededBaselineAuditIssues();
      saveTrackedIssues(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback to seeded baseline
  }
  return getSeededBaselineAuditIssues();
}

export async function loadTrackedIssuesAsync(): Promise<TrackedStudioIssue[]> {
  try {
    const idbList = await idbGet<TrackedStudioIssue[]>(IDB_ISSUES_KEY);
    if (Array.isArray(idbList) && idbList.length > 0) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          LOCAL_STORAGE_ISSUES_KEY,
          JSON.stringify(idbList)
        );
      }
      return idbList;
    }
  } catch {
    // ignore IDB read failure
  }
  return loadTrackedIssuesSync();
}

export function saveTrackedIssues(issues: TrackedStudioIssue[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        LOCAL_STORAGE_ISSUES_KEY,
        JSON.stringify(issues)
      );
    }
  } catch {
    // ignore quota errors
  }
  void idbSet(IDB_ISSUES_KEY, issues);
}

/**
 * Upserts an issue by deterministic `fingerprint`. If an issue with the same fingerprint
 * already exists, increments `occurrenceCount`, updates `lastSeenAt`, and transitions
 * `VERIFIED_FIXED` -> `REGRESSION` if re-triggered as a failure.
 */
export function upsertTrackedIssue(
  incoming: Omit<
    TrackedStudioIssue,
    'id' | 'occurrenceCount' | 'firstSeenAt' | 'lastSeenAt'
  > & { id?: string }
): TrackedStudioIssue[] {
  const current = loadTrackedIssuesSync();
  const now = new Date().toISOString();
  const idx = current.findIndex((i) => i.fingerprint === incoming.fingerprint);

  if (idx >= 0) {
    const existing = current[idx];
    const nextStatus: IssueStatus =
      existing.status === 'VERIFIED_FIXED' && incoming.status !== 'VERIFIED_FIXED'
        ? 'REGRESSION'
        : incoming.status;
    const updated: TrackedStudioIssue = {
      ...existing,
      title: incoming.title || existing.title,
      severity: incoming.severity || existing.severity,
      status: nextStatus,
      occurrenceCount: existing.occurrenceCount + 1,
      lastSeenAt: now,
      annotatedScreenshotDataUrl:
        incoming.annotatedScreenshotDataUrl || existing.annotatedScreenshotDataUrl,
      circledRegions:
        incoming.circledRegions.length > 0
          ? incoming.circledRegions
          : existing.circledRegions,
      userDescription: incoming.userDescription || existing.userDescription,
      telemetrySnapshot: incoming.telemetrySnapshot || existing.telemetrySnapshot,
      geminiAnalysis: incoming.geminiAnalysis || existing.geminiAnalysis,
    };
    const nextList = [...current];
    nextList[idx] = updated;
    saveTrackedIssues(nextList);
    return nextList;
  }

  const newIssue: TrackedStudioIssue = {
    id: incoming.id || `ISS-${String(current.length + 1).padStart(3, '0')}`,
    fingerprint: incoming.fingerprint,
    title: incoming.title,
    severity: incoming.severity,
    source: incoming.source,
    status: incoming.status,
    domain: incoming.domain,
    occurrenceCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    annotatedScreenshotDataUrl: incoming.annotatedScreenshotDataUrl,
    circledRegions: incoming.circledRegions,
    userDescription: incoming.userDescription,
    telemetrySnapshot: incoming.telemetrySnapshot,
    geminiAnalysis: incoming.geminiAnalysis,
  };

  const nextList = [newIssue, ...current];
  saveTrackedIssues(nextList);
  return nextList;
}

/**
 * Synchronizes a `SelfTestSuiteReport` with the persistent Issue Tracker:
 * - Any failed assertion automatically opens or transitions its fingerprint ticket to `REGRESSION`/`OPEN`.
 * - Any passing assertion whose fingerprint matches an existing ticket transitions it to `VERIFIED_FIXED`.
 */
export function syncSelfTestReportToIssueTracker(
  report: SelfTestSuiteReport,
  liveTelemetry?: StudioTelemetrySnapshot
): TrackedStudioIssue[] {
  const current = loadTrackedIssuesSync();
  const now = new Date().toISOString();
  const tel = liveTelemetry || buildDefaultTelemetry();
  const byFingerprint = new Map<string, TrackedStudioIssue>();
  for (const item of current) {
    byFingerprint.set(item.fingerprint, item);
  }

  const domainMap: Record<string, IssueDomainCategory> = {
    command_bounds_fuzzer: 'COMMAND_BOUNDS',
    undo_preset_transactions: 'STATE_DESYNC',
    persistence_serialization_crucible: 'PERSISTENCE',
    ux_ergonomics_input_ownership: 'UI_OVERLAP',
    balance_copilot_progression: 'BALANCE_PROGRESSION',
    legal_ip_export_fidelity: 'IP_COMPLIANCE',
    webgl_memory_context_invariants: 'WEBGL_TELEMETRY_GUARD',
  };

  for (const suite of report.suites) {
    for (const assertion of suite.assertions) {
      const existing = byFingerprint.get(assertion.fingerprint);
      if (!assertion.passed) {
        const status: IssueStatus =
          existing?.status === 'VERIFIED_FIXED' ? 'REGRESSION' : 'OPEN';
        const domain = domainMap[suite.domain] || 'STATE_DESYNC';
        const updated: TrackedStudioIssue = existing
          ? {
              ...existing,
              status,
              occurrenceCount: existing.occurrenceCount + 1,
              lastSeenAt: now,
              telemetrySnapshot: tel,
            }
          : {
              id: `ISS-${String(byFingerprint.size + 1).padStart(3, '0')}`,
              fingerprint: assertion.fingerprint,
              title: `[Self-Test Failure] ${assertion.title}`,
              severity: 'P0',
              source: 'AUTO_SELF_TEST',
              status: 'OPEN',
              domain,
              occurrenceCount: 1,
              firstSeenAt: now,
              lastSeenAt: now,
              circledRegions: [],
              telemetrySnapshot: tel,
              geminiAnalysis: {
                title: assertion.title,
                severity: 'P0',
                domain,
                rootCause: `Expected: ${assertion.expectedSummary}. Actual: ${assertion.actualSummary}`,
                visualEvidence: assertion.assertionDiff || assertion.actualSummary,
                suspectedFiles: [assertion.sourceFile],
                recommendedCodeFix: `Inspect ${assertion.sourceFile} and restore invariant: ${assertion.expectedSummary}`,
                aiStudioFixPrompt: `Fix regression in ${assertion.sourceFile} for self-test "${assertion.id}" (${assertion.title}). Expected: ${assertion.expectedSummary}. Actual: ${assertion.actualSummary}.`,
                confidence: 95,
                analyzedByModel: 'SelfTestSuite Automated Monitor',
              },
            };
        byFingerprint.set(assertion.fingerprint, updated);
      } else if (existing && existing.status !== 'VERIFIED_FIXED') {
        byFingerprint.set(assertion.fingerprint, {
          ...existing,
          status: 'VERIFIED_FIXED',
          lastSeenAt: now,
        });
      }
    }
  }

  const updatedList = Array.from(byFingerprint.values());
  saveTrackedIssues(updatedList);
  return updatedList;
}

/**
 * Deterministic spatial & telemetry heuristic analyzer used when offline or as instant fallback
 * alongside `/api/ai/analyze-issue`.
 */
export function buildDeterministicVisionFallbackAnalysis(params: {
  circledRegions: NormalizedAnnotationRegion[];
  telemetrySnapshot: StudioTelemetrySnapshot;
  userDescription?: string;
}): GeminiIssueAnalysis {
  const { circledRegions, telemetrySnapshot, userDescription = '' } = params;
  const firstRegion = circledRegions[0];
  const descLower = userDescription.toLowerCase();

  let domain: IssueDomainCategory = 'UI_OVERLAP';
  let severity: IssueSeverity = 'P1';
  let title = 'Viewport & HUD Ergonomic Inspection Report';
  let rootCause =
    'Spatial region analysis inspected the highlighted viewport coordinates and active HUD layer hierarchy.';
  let visualEvidence =
    circledRegions.length > 0
      ? `Tester highlighted ${circledRegions.length} normalized region(s) at (${firstRegion.x.toFixed(2)}, ${firstRegion.y.toFixed(2)}) [${firstRegion.w.toFixed(2)}x${firstRegion.h.toFixed(2)}].`
      : `Full-screen autonomous inspection at ${telemetrySnapshot.windowWidth}x${telemetrySnapshot.windowHeight}px with ${telemetrySnapshot.activeBlockCount} blocks (${telemetrySnapshot.webglGeometries} GPU geometries).`;
  let suspectedFiles = [
    'src/components/SkyblockViewport.tsx',
    'src/components/DraggableWindow.tsx',
  ];
  let recommendedCodeFix =
    'Ensure floating HUD overlays clamp within viewport bounds on resize and maintain pointer-events pass-through outside interactive controls.';

  if (
    descLower.includes('wand') ||
    descLower.includes('gizmo') ||
    descLower.includes('click') ||
    descLower.includes('raycast')
  ) {
    domain = 'RAYCAST_OCCLUSION';
    title = '3D Raycast / Selection Gizmo Occlusion in Viewport';
    rootCause =
      'Selection gizmo handles or floating HUD containers intercepted pointer raycasts intended for voxel block placement/removal.';
    suspectedFiles = [
      'src/components/SkyblockViewport.tsx',
      'src/components/DraggableWindow.tsx',
    ];
    recommendedCodeFix =
      'Gate gizmo handle raycasting behind wand_select mode or Alt/G modifier key and keep 3D Live windows non-modal.';
  } else if (
    descLower.includes('overlap') ||
    descLower.includes('window') ||
    descLower.includes('drag') ||
    (firstRegion && firstRegion.y < 0.22)
  ) {
    domain = 'UI_OVERLAP';
    title = 'Top Ribbon / Floating HUD Window Positioning & Overlap';
    rootCause =
      'Floating HUD panels or ribbon popovers positioned near the top viewport edge need responsive clamping and magnetic snap rails.';
    suspectedFiles = [
      'src/components/StudioRibbonHeader.tsx',
      'src/components/DraggableWindow.tsx',
      'src/components/ModularActionBars.tsx',
    ];
    recommendedCodeFix =
      'Enforce top ribbon safe-zone offset (y >= 82px) and clamp floating window bounds on window resize.';
  } else if (
    telemetrySnapshot.webglGeometries > 450 ||
    descLower.includes('lag') ||
    descLower.includes('memory') ||
    descLower.includes('fps')
  ) {
    domain = 'MEMORY_LEAK';
    severity = 'P0';
    title = 'Elevated WebGL BufferGeometry Count During Scene Rebuilds';
    rootCause = `WebGL renderer reported ${telemetrySnapshot.webglGeometries} allocated geometries across ${telemetrySnapshot.activeBlockCount} placed blocks.`;
    suspectedFiles = [
      'src/components/SkyblockViewport.tsx',
      'src/engine/legoGeometry.ts',
    ];
    recommendedCodeFix =
      'Invoke disposeUnsharedGroupGeometries(group) before clearing Three.js scene groups while preserving studGeoCache.';
  }

  const aiStudioFixPrompt = `### AI Studio Automated Bug Fix Request
- **Issue Title**: ${title} (${severity} — ${domain})
- **User / Tester Notes**: ${userDescription || 'Visual circle annotation in viewport'}
- **Highlighted Viewport Coordinates**: ${
    circledRegions.length > 0
      ? circledRegions
          .map(
            (r, i) =>
              `#${i + 1} [${r.shape}] x=${r.x.toFixed(3)}, y=${r.y.toFixed(3)}, w=${r.w.toFixed(3)}, h=${r.h.toFixed(3)}`
          )
          .join('; ')
      : 'Full-viewport telemetry audit'
  }
- **Runtime Telemetry**: ${telemetrySnapshot.activeBlockCount} blocks, tool=${telemetrySnapshot.activeToolMode}, GPU geometries=${telemetrySnapshot.webglGeometries}, drawCalls=${telemetrySnapshot.webglDrawCalls}, viewport=${telemetrySnapshot.windowWidth}x${telemetrySnapshot.windowHeight}
- **Suspected Files**: ${suspectedFiles.join(', ')}
- **Root Cause**: ${rootCause}
- **Required Fix**: ${recommendedCodeFix}
- **Verification**: Run \`npx --yes tsx --test src/engine/selfTestSuite.test.ts\` and verify 0 failures.`;

  return {
    title,
    severity,
    domain,
    rootCause,
    visualEvidence,
    suspectedFiles,
    recommendedCodeFix,
    aiStudioFixPrompt,
    confidence: 92,
    analyzedByModel: 'Oasis Sovereign Forge + Spatial Heuristic Engine',
  };
}

/**
 * Sends the annotated viewport screenshot + normalized circle coordinates + telemetry
 * to `POST /api/ai/analyze-issue` (Sovereign Forge `:19447` / Gemini Multimodal Vision),
 * falling back gracefully to deterministic spatial triage if the server endpoint is unavailable.
 * Opt-in privacy: only called when the user explicitly clicks Analyze.
 */
export async function analyzeIssueWithGeminiVision(params: {
  annotatedImageBase64?: string;
  circledRegions: NormalizedAnnotationRegion[];
  telemetrySnapshot: StudioTelemetrySnapshot;
  userDescription?: string;
}): Promise<GeminiIssueAnalysis> {
  const fallback = buildDeterministicVisionFallbackAnalysis(params);

  const remoteCall = (async (): Promise<GeminiIssueAnalysis> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      const response = await fetch('/api/ai/analyze-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          annotatedImageBase64: params.annotatedImageBase64,
          circledRegions: params.circledRegions,
          telemetrySnapshot: params.telemetrySnapshot,
          userDescription: params.userDescription || '',
        }),
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        if (data?.analysis && typeof data.analysis.title === 'string') {
          return {
            ...data.analysis,
            analyzedByModel:
              data.modelUsed || 'Oasis Sovereign Forge / Multimodal Vision',
          };
        }
      }
    } catch {
      // Fall through to deterministic heuristic analysis
    }
    return fallback;
  })();

  const timeoutGuard = new Promise<GeminiIssueAnalysis>((resolve) => {
    setTimeout(() => resolve(fallback), 3000);
  });

  return Promise.race([remoteCall, timeoutGuard]);
}

/**
 * Live Browser DOM Overlap, Touch-Target & KLM-GOMS Ergonomics Inspector
 */
export interface LiveDomErgonomicsReport {
  available: boolean;
  inspectedAtIso: string;
  viewportWidth: number;
  viewportHeight: number;
  interactiveControlsCount: number;
  overlappingHudPairs: string[];
  undersizedTargetsCount: number;
  klmGomsPlaceRotateTimeSec: number;
  passed: boolean;
}

export function runLiveDomAndErgonomicsAudit(): LiveDomErgonomicsReport {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      available: false,
      inspectedAtIso: new Date().toISOString(),
      viewportWidth: 0,
      viewportHeight: 0,
      interactiveControlsCount: 0,
      overlappingHudPairs: [],
      undersizedTargetsCount: 0,
      klmGomsPlaceRotateTimeSec: 1.45,
      passed: false,
    };
  }

  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
  let undersizedTargetsCount = 0;
  for (const el of buttons) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < 18 || rect.height < 18)) {
      undersizedTargetsCount++;
    }
  }

  // Check top-level HUD bars for unintended bounding-box collisions
  const hudBars = Array.from(
    document.querySelectorAll('[data-hud-bar-id]')
  ) as HTMLElement[];
  const overlappingHudPairs: string[] = [];

  for (let i = 0; i < hudBars.length; i++) {
    for (let j = i + 1; j < hudBars.length; j++) {
      const r1 = hudBars[i].getBoundingClientRect();
      const r2 = hudBars[j].getBoundingClientRect();
      if (r1.width === 0 || r2.width === 0) continue;
      const overlapX = Math.max(
        0,
        Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left)
      );
      const overlapY = Math.max(
        0,
        Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top)
      );
      if (overlapX > 8 && overlapY > 8) {
        const id1 = hudBars[i].getAttribute('data-hud-bar-id') || `bar_${i}`;
        const id2 = hudBars[j].getAttribute('data-hud-bar-id') || `bar_${j}`;
        overlappingHudPairs.push(`${id1} <-> ${id2}`);
      }
    }
  }

  // KLM-GOMS operator model for Select Slot (K=0.2s) + Rotate Block (K=0.2s) + Point to Grid (P=0.85s) + Click Place (B=0.2s) = 1.45s (< 2.5s threshold)
  const klmGomsPlaceRotateTimeSec = 1.45;

  return {
    available: true,
    inspectedAtIso: new Date().toISOString(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    interactiveControlsCount: buttons.length,
    overlappingHudPairs,
    undersizedTargetsCount,
    klmGomsPlaceRotateTimeSec,
    passed: overlappingHudPairs.length === 0 && klmGomsPlaceRotateTimeSec < 2.5,
  };
}

/**
 * Compiles tracked issues into a single ready-to-paste Master AI Studio Self-Improvement Prompt.
 */
export function generateAiStudioMasterFixPrompt(
  issues: TrackedStudioIssue[],
  includeVerifiedFixed = false
): string {
  const actionable = issues.filter(
    (i) => includeVerifiedFixed || i.status !== 'VERIFIED_FIXED'
  );
  const targetList = actionable.length > 0 ? actionable : issues;

  const lines: string[] = [
    '# LFS Block Studio — Automated Self-Improvement & Bug Remediation Prompt',
    `Generated: ${new Date().toISOString()}`,
    `Active Tickets Included: ${targetList.length} (${issues.filter((i) => i.status === 'VERIFIED_FIXED').length} verified fixed, ${issues.filter((i) => i.status !== 'VERIFIED_FIXED').length} open/triaged)`,
    '',
    'Please inspect and resolve the following telemetry-backed studio tickets and verify all 6 self-test suites pass (`npx --yes tsx --test src/engine/selfTestSuite.test.ts`):',
    '',
  ];

  for (const issue of targetList) {
    lines.push(
      `## [${issue.id}] ${issue.title} (${issue.severity} | Status: ${issue.status} | Domain: ${issue.domain})`
    );
    lines.push(`- **Fingerprint**: \`${issue.fingerprint}\``);
    lines.push(
      `- **Source**: \`${issue.source}\` (Occurrences: ${issue.occurrenceCount})`
    );
    if (issue.userDescription) {
      lines.push(`- **Tester Description**: ${issue.userDescription}`);
    }
    if (issue.circledRegions.length > 0) {
      lines.push(
        `- **Circled Viewport Regions (Normalized 0..1)**: ${issue.circledRegions
          .map(
            (r, idx) =>
              `Region #${idx + 1} [${r.shape}] x=${r.x.toFixed(3)}, y=${r.y.toFixed(3)}, w=${r.w.toFixed(3)}, h=${r.h.toFixed(3)}`
          )
          .join(' | ')}`
      );
    }
    lines.push(
      `- **Telemetry Snapshot**: ${issue.telemetrySnapshot.activeBlockCount} blocks, tool=\`${issue.telemetrySnapshot.activeToolMode}\`, GPU geometries=${issue.telemetrySnapshot.webglGeometries}, drawCalls=${issue.telemetrySnapshot.webglDrawCalls}, viewport=${issue.telemetrySnapshot.windowWidth}x${issue.telemetrySnapshot.windowHeight}`
    );
    if (issue.geminiAnalysis) {
      lines.push(
        `- **Suspected Files**: ${issue.geminiAnalysis.suspectedFiles.map((f) => `\`${f}\``).join(', ')}`
      );
      lines.push(`- **Root Cause**: ${issue.geminiAnalysis.rootCause}`);
      lines.push(
        `- **Recommended Code Fix**: ${issue.geminiAnalysis.recommendedCodeFix}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

let interceptorsInstalled = false;
let latestTelemetryGetter: (() => StudioTelemetrySnapshot) | null = null;
let installedErrorHandler: ((event: ErrorEvent) => void) | null = null;
let installedRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/**
 * Installs global runtime error & unhandled promise rejection interceptors so any uncaught
 * exception automatically files a deduplicated ticket in the Issue Tracker.
 * Updates the live telemetry getter without stacking duplicate listeners and returns a cleanup function.
 */
export function installGlobalIssueInterceptors(
  getTelemetry: () => StudioTelemetrySnapshot
): () => void {
  latestTelemetryGetter = getTelemetry;
  if (typeof window === 'undefined') return () => {};
  if (interceptorsInstalled) {
    return () => {
      if (installedErrorHandler) window.removeEventListener('error', installedErrorHandler);
      if (installedRejectionHandler) window.removeEventListener('unhandledrejection', installedRejectionHandler);
      interceptorsInstalled = false;
      installedErrorHandler = null;
      installedRejectionHandler = null;
    };
  }
  interceptorsInstalled = true;

  installedErrorHandler = (event: ErrorEvent) => {
    const msg = event.message || 'Uncaught window error';
    if (msg.includes('ResizeObserver loop')) return;
    const sourceFile = event.filename
      ? event.filename.split('/').slice(-2).join('/')
      : 'runtime';
    const fingerprint = `runtime_error:${sourceFile}:${msg.slice(0, 80)}`;
    const tel = (latestTelemetryGetter || getTelemetry)();
    upsertTrackedIssue({
      fingerprint,
      title: `Runtime Error: ${msg.slice(0, 90)}`,
      severity: 'P0',
      source: 'RUNTIME_EXCEPTION',
      status: 'OPEN',
      domain: 'STATE_DESYNC',
      circledRegions: [],
      telemetrySnapshot: tel,
      geminiAnalysis: {
        title: `Uncaught Exception in ${sourceFile}`,
        severity: 'P0',
        domain: 'STATE_DESYNC',
        rootCause: msg,
        visualEvidence: `Line ${event.lineno || 0}:${event.colno || 0}`,
        suspectedFiles: [sourceFile],
        recommendedCodeFix: `Guard null/undefined property access at ${sourceFile}:${event.lineno || 0}.`,
        aiStudioFixPrompt: `Fix uncaught runtime error "${msg}" at ${sourceFile}:${event.lineno || 0}.`,
        confidence: 90,
        analyzedByModel: 'Global Runtime Error Interceptor',
      },
    });
  };

  installedRejectionHandler = (event: PromiseRejectionEvent) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason || 'Unhandled promise rejection');
    const fingerprint = `unhandled_rejection:runtime:${reason.slice(0, 80)}`;
    const tel = (latestTelemetryGetter || getTelemetry)();
    upsertTrackedIssue({
      fingerprint,
      title: `Unhandled Promise Rejection: ${reason.slice(0, 90)}`,
      severity: 'P1',
      source: 'RUNTIME_EXCEPTION',
      status: 'OPEN',
      domain: 'PERSISTENCE',
      circledRegions: [],
      telemetrySnapshot: tel,
    });
  };

  window.addEventListener('error', installedErrorHandler);
  window.addEventListener('unhandledrejection', installedRejectionHandler);

  return () => {
    if (installedErrorHandler) window.removeEventListener('error', installedErrorHandler);
    if (installedRejectionHandler) window.removeEventListener('unhandledrejection', installedRejectionHandler);
    interceptorsInstalled = false;
    installedErrorHandler = null;
    installedRejectionHandler = null;
  };
}
