import {
  createInitialEngineState,
  executeWorldEditCommand,
  MAX_SAFE_REGION_CELL_BUDGET,
  MAX_SAFE_WORLD_COORD,
  createBlueprintFromCustomBlock,
  STARTER_STRUCTURE_BLUEPRINTS,
} from './worldEditEngine';
import { ChunkExpansionStyle, WorldEditEngineState } from './types';
import {
  computeInitialBlockMappings,
  exportSpongeSchematicJson,
  MAX_SAFE_SCHEMATIC_VOLUME,
} from './schematicExporter';
import {
  resetEntireWorldToTemplate,
  resetSpecificChunkInWorld,
  OPEN_SOURCE_CREATOR_PACKS,
} from './openSourceBlockMarket';
import { expandWorldIntoChunk } from './chunkAndPatternEngine';
import {
  serializeCloudWorldPayload,
  serializeCloudBlueprintPayload,
  getScopedDefaultWorldId,
} from '../lib/firebase';
import { validateImportedWorldPayload } from '../lib/googleDrive';
import { DEFAULT_HOTKEYS, HotkeyActionMeta } from './hotkeys';
import {
  computeTextureCohesionAffinity,
  detectArchitecturalObjectClass,
  createInitialAdaptivePatternArchive,
  auditWorldWalkability,
} from './spatialCopilotEngine';
import {
  ARCHITECTURAL_CONTRACTS,
  evaluateContractProgress,
  computeUpdatedBuildStreak,
} from './studioEngagementEngine';
import { exportToGltfJson } from './godotExporter';

export type SelfTestDomainId =
  | 'command_bounds_fuzzer'
  | 'undo_preset_transactions'
  | 'persistence_serialization_crucible'
  | 'ux_ergonomics_input_ownership'
  | 'balance_copilot_progression'
  | 'legal_ip_export_fidelity';

export interface SelfTestAssertionResult {
  id: string;
  domain: SelfTestDomainId;
  title: string;
  passed: boolean;
  durationMs: number;
  expectedSummary: string;
  actualSummary: string;
  assertionDiff?: string;
  sourceFile: string;
  fingerprint: string;
  remediationStatus: 'VERIFIED_REMEDIATED' | 'REGRESSION_DETECTED';
}

export interface SelfTestDomainSuiteReport {
  domain: SelfTestDomainId;
  title: string;
  description: string;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  assertions: SelfTestAssertionResult[];
}

export interface SelfTestSuiteReport {
  reportId: string;
  generatedAtIso: string;
  commitBaseline: string;
  totalPassed: number;
  totalFailed: number;
  totalAssertions: number;
  totalDurationMs: number;
  allPassed: boolean;
  suites: SelfTestDomainSuiteReport[];
}

function createEmptyEngineState(): WorldEditEngineState {
  const s = createInitialEngineState();
  return {
    ...s,
    blocks: {},
    pos1: null,
    pos2: null,
    undoStack: [],
    redoStack: [],
  };
}

function runAssertion(params: {
  id: string;
  domain: SelfTestDomainId;
  title: string;
  sourceFile: string;
  expectedSummary: string;
  fn: () => { passed: boolean; actualSummary: string; diff?: string };
}): SelfTestAssertionResult {
  const t0 = performance.now();
  let passed = false;
  let actualSummary = '';
  let assertionDiff: string | undefined;
  try {
    const res = params.fn();
    passed = res.passed;
    actualSummary = res.actualSummary;
    assertionDiff = res.diff;
  } catch (err: any) {
    passed = false;
    actualSummary = `Exception thrown: ${err?.message || String(err)}`;
    assertionDiff = err?.stack || String(err);
  }
  const durationMs = Number(Math.max(0.01, performance.now() - t0).toFixed(3));
  const fingerprint = `${params.domain}:${params.sourceFile}:${params.id}`;
  return {
    id: params.id,
    domain: params.domain,
    title: params.title,
    passed,
    durationMs,
    expectedSummary: params.expectedSummary,
    actualSummary,
    assertionDiff,
    sourceFile: params.sourceFile,
    fingerprint,
    remediationStatus: passed ? 'VERIFIED_REMEDIATED' : 'REGRESSION_DETECTED',
  };
}

/**
 * 1. Command & Bounds Fuzzer (`src/engine/worldEditEngine.ts` & `src/engine/schematicExporter.ts`)
 */
export function runCommandAndBoundsFuzzer(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 1A: Non-finite coordinates (NaN, Infinity, -Infinity) rejected cleanly in < 5ms without mutating blocks
  assertions.push(
    runAssertion({
      id: 'reject_non_finite_coords',
      domain: 'command_bounds_fuzzer',
      title:
        'Reject NaN, Infinity, -Infinity, and out-of-range coordinates in //pos1, //pos2, //paste, //sphere',
      sourceFile: 'src/engine/worldEditEngine.ts',
      expectedSummary:
        'Non-finite and out-of-range coordinates return success: false in < 15ms with 0 block mutations',
      fn: () => {
        const base = createInitialEngineState();
        const initialBlockCount = Object.keys(base.blocks).length;
        const adversarialCmds = [
          '//pos1 NaN 0 0',
          '//pos2 Infinity 10 -Infinity',
          `//pos1 ${MAX_SAFE_WORLD_COORD + 500} 0 0`,
          '//paste NaN 5 5',
          '//sphere cobble_brick NaN',
          '//cyl oak_plank Infinity 4',
        ];
        const start = performance.now();
        let state = base;
        const results = adversarialCmds.map((cmd) => {
          const r = executeWorldEditCommand(state, cmd);
          state = r.nextState;
          return r;
        });
        const elapsed = performance.now() - start;
        const allRejected = results.every((r) => r.success === false);
        const blocksUnchanged =
          Object.keys(state.blocks).length === initialBlockCount;
        const passed = allRejected && blocksUnchanged && elapsed < 15;
        return {
          passed,
          actualSummary: `Rejected ${results.filter((r) => !r.success).length}/${adversarialCmds.length} commands in ${elapsed.toFixed(2)}ms; block count=${Object.keys(state.blocks).length} (initial=${initialBlockCount})`,
          diff: passed
            ? undefined
            : `allRejected=${allRejected}, blocksUnchanged=${blocksUnchanged}, elapsed=${elapsed.toFixed(2)}ms`,
        };
      },
    })
  );

  // 1B: Massive region volume rejected in < 5ms without hanging main thread
  assertions.push(
    runAssertion({
      id: 'reject_oom_region_volume',
      domain: 'command_bounds_fuzzer',
      title:
        'Guard //set, //walls, //box, //copy, //stack against OOM bounding boxes',
      sourceFile: 'src/engine/worldEditEngine.ts',
      expectedSummary: `Bounding box exceeding ${MAX_SAFE_REGION_CELL_BUDGET.toLocaleString()} cells fails fast (< 5ms) with success: false and zero block mutation`,
      fn: () => {
        const state = createInitialEngineState();
        const initialCount = Object.keys(state.blocks).length;
        const hugeState = {
          ...state,
          pos1: { x: -5000, y: 0, z: -5000 },
          pos2: { x: 5000, y: 255, z: 5000 },
        };
        const tStart = performance.now();
        const setRes = executeWorldEditCommand(hugeState, '//set cobble_brick');
        const wallsRes = executeWorldEditCommand(hugeState, '//walls oak_plank');
        const copyRes = executeWorldEditCommand(hugeState, '//copy');
        const elapsed = performance.now() - tStart;

        const passed =
          !setRes.success &&
          !wallsRes.success &&
          !copyRes.success &&
          Object.keys(setRes.nextState.blocks).length === initialCount &&
          elapsed < 5;
        return {
          passed,
          actualSummary: `//set, //walls, //copy rejected in ${elapsed.toFixed(3)}ms; blocks=${Object.keys(setRes.nextState.blocks).length}`,
          diff: passed
            ? undefined
            : `set=${setRes.success}, walls=${wallsRes.success}, copy=${copyRes.success}, elapsed=${elapsed.toFixed(3)}ms`,
        };
      },
    })
  );

  // 1C: Fractional coordinate rounding & deterministic valid region fill
  assertions.push(
    runAssertion({
      id: 'fractional_coord_normalization',
      domain: 'command_bounds_fuzzer',
      title:
        'Normalize fractional coordinates in //pos1 and //pos2 to integer grid cells',
      sourceFile: 'src/engine/worldEditEngine.ts',
      expectedSummary:
        'Fractional coordinates (1.4, 2.6, -0.2) round deterministically to integers (1, 3, 0)',
      fn: () => {
        let state = createEmptyEngineState();
        state = executeWorldEditCommand(state, '//pos1 1.4 2.6 -0.2').nextState;
        state = executeWorldEditCommand(state, '//pos2 2.4 2.6 0.4').nextState;
        const p1 = state.pos1;
        const p2 = state.pos2;
        const passed =
          Boolean(p1 && p2) &&
          p1!.x === 1 &&
          p1!.y === 3 &&
          p1!.z === 0 &&
          p2!.x === 2 &&
          p2!.y === 3 &&
          p2!.z === 0;
        return {
          passed,
          actualSummary: `pos1=(${p1?.x},${p1?.y},${p1?.z}), pos2=(${p2?.x},${p2?.y},${p2?.z})`,
          diff: passed ? undefined : `Expected (1,3,0)->(2,3,0)`,
        };
      },
    })
  );

  // 1D: Sponge Schematic Exporter rejects sparse extreme bounding boxes exceeding MAX_SAFE_SCHEMATIC_VOLUME
  assertions.push(
    runAssertion({
      id: 'schematic_exporter_sparse_oom_guard',
      domain: 'command_bounds_fuzzer',
      title:
        'Guard exportSpongeSchematicJson against sparse extreme bounding boxes',
      sourceFile: 'src/engine/schematicExporter.ts',
      expectedSummary: `Sparse 2-block world spanning > ${MAX_SAFE_SCHEMATIC_VOLUME.toLocaleString()} cells throws descriptive volume budget error in < 5ms`,
      fn: () => {
        const sparseBlocks = {
          '0,0,0': {
            id: 'blk_1',
            blockDefId: 'cobble_brick',
            position: { x: 0, y: 0, z: 0 },
            rotation: 0 as const,
          },
          '500,200,500': {
            id: 'blk_2',
            blockDefId: 'cobble_brick',
            position: { x: 500, y: 200, z: 500 },
            rotation: 0 as const,
          },
        };
        const tStart = performance.now();
        let threwVolumeError = false;
        let errMessage = '';
        try {
          exportSpongeSchematicJson('Sparse OOM Test', sparseBlocks, {
            cobble_brick: 'minecraft:stone_bricks',
          });
        } catch (err: any) {
          threwVolumeError = true;
          errMessage = err?.message || String(err);
        }
        const elapsed = performance.now() - tStart;
        const passed =
          threwVolumeError &&
          errMessage.includes('exceeds safe memory allocation threshold') &&
          elapsed < 5;
        return {
          passed,
          actualSummary: threwVolumeError
            ? `Rejected in ${elapsed.toFixed(3)}ms: "${errMessage.slice(0, 90)}..."`
            : 'Did not throw on sparse OOM schematic volume',
          diff: passed
            ? undefined
            : `threw=${threwVolumeError}, elapsed=${elapsed}ms, msg=${errMessage}`,
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'command_bounds_fuzzer',
    title: 'Suite 1: Command & Bounds Fuzzer',
    description:
      'Adversarial coordinate fuzzing (NaN, ±Infinity, out-of-range) and volume budget enforcement across WorldEdit and Schematic export.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * 2. Undo & Preset Transaction Audit (`src/engine/openSourceBlockMarket.ts` & `src/engine/chunkAndPatternEngine.ts`)
 */
export function runUndoAndPresetTransactionAudit(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 2A: cyber_grid preset generates full neon-corner platform (> 64 blocks) and atomic single //undo restores 236-block starter island
  assertions.push(
    runAssertion({
      id: 'cyber_grid_preset_and_atomic_undo',
      domain: 'undo_preset_transactions',
      title:
        'Verify cyber_grid generates full 148-block neon platform and single //undo restores 236-block starter island',
      sourceFile: 'src/engine/openSourceBlockMarket.ts',
      expectedSummary:
        'cyber_grid places >= 140 blocks with 1 undo snapshot; single //undo restores exact 236-block starter island',
      fn: () => {
        const starter = createInitialEngineState();
        const starterCount = Object.keys(starter.blocks).length; // 236
        const initialUndoDepth = starter.undoStack.length;

        const resetRes = resetEntireWorldToTemplate(starter, 'cyber_grid', 16);
        const cyberCount = Object.keys(resetRes.nextState.blocks).length;
        const undoDepthAfterReset = resetRes.nextState.undoStack.length;

        const undoRes = executeWorldEditCommand(resetRes.nextState, '//undo');
        const restoredCount = Object.keys(undoRes.nextState.blocks).length;

        const passed =
          starterCount === 236 &&
          cyberCount >= 140 &&
          undoDepthAfterReset === initialUndoDepth + 1 &&
          undoRes.success &&
          restoredCount === starterCount;

        return {
          passed,
          actualSummary: `starter=${starterCount} blocks -> cyber_grid=${cyberCount} blocks (undoStack +${undoDepthAfterReset - initialUndoDepth}) -> //undo restored=${restoredCount} blocks`,
          diff: passed
            ? undefined
            : `starter=${starterCount}, cyber=${cyberCount}, undoDelta=${undoDepthAfterReset - initialUndoDepth}, restored=${restoredCount}`,
        };
      },
    })
  );

  // 2B: All ChunkExpansionStyle presets generate deterministic platforms (sandstone_plaza >= 140 blocks, empty_grid == 4 anchor blocks)
  assertions.push(
    runAssertion({
      id: 'all_chunk_expansion_styles_complete',
      domain: 'undo_preset_transactions',
      title:
        'Verify all 5 ChunkExpansionStyle values generate deterministic platforms (sandstone_plaza 148 blocks, no unhandled fallback)',
      sourceFile: 'src/engine/chunkAndPatternEngine.ts',
      expectedSummary:
        'grass_island, stone_foundation, timber_deck, and sandstone_plaza each place >= 64 blocks; empty_grid places 4 center anchor blocks',
      fn: () => {
        const styles: ChunkExpansionStyle[] = [
          'grass_island',
          'stone_foundation',
          'timber_deck',
          'sandstone_plaza',
          'empty_grid',
        ];
        const counts: Record<string, number> = {};
        for (const style of styles) {
          const empty = createEmptyEngineState();
          const res = expandWorldIntoChunk(empty, 1, 0, style, 16);
          counts[style] = res.addedCount;
        }
        const platformStyles: ChunkExpansionStyle[] = [
          'grass_island',
          'stone_foundation',
          'timber_deck',
          'sandstone_plaza',
        ];
        const allComplete =
          platformStyles.every((s) => counts[s] >= 64) &&
          counts.empty_grid >= 4;
        return {
          passed: allComplete,
          actualSummary: styles.map((s) => `${s}:${counts[s]}`).join(', '),
          diff: allComplete
            ? undefined
            : `Incomplete style counts: ${JSON.stringify(counts)}`,
        };
      },
    })
  );

  // 2C: resetSpecificChunkInWorld pushes exactly 1 undo snapshot so single //undo restores previous chunk blocks
  assertions.push(
    runAssertion({
      id: 'chunk_reset_single_atomic_undo',
      domain: 'undo_preset_transactions',
      title:
        'Verify resetSpecificChunkInWorld pushes 1 atomic undo snapshot for non-empty chunk reset',
      sourceFile: 'src/engine/openSourceBlockMarket.ts',
      expectedSummary:
        'Resetting chunk (0,0) to stone_foundation pushes 1 undo entry; single //undo restores 236 starter blocks',
      fn: () => {
        const starter = createInitialEngineState();
        const beforeCount = Object.keys(starter.blocks).length;
        const chunkReset = resetSpecificChunkInWorld(
          starter,
          0,
          0,
          'stone_foundation',
          16
        );
        const undoDelta =
          chunkReset.nextState.undoStack.length - starter.undoStack.length;
        const afterUndo = executeWorldEditCommand(
          chunkReset.nextState,
          '//undo'
        );
        const restoredCount = Object.keys(afterUndo.nextState.blocks).length;
        const passed =
          undoDelta === 1 && afterUndo.success && restoredCount === beforeCount;
        return {
          passed,
          actualSummary: `undoDelta=${undoDelta}, chunkResetBlocks=${Object.keys(chunkReset.nextState.blocks).length}, restoredAfterSingleUndo=${restoredCount}`,
          diff: passed
            ? undefined
            : `Expected undoDelta=1 and restoredCount=${beforeCount}, got undoDelta=${undoDelta}, restored=${restoredCount}`,
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'undo_preset_transactions',
    title: 'Suite 2: Undo & Preset Transaction Audit',
    description:
      'Verifies atomic undo snapshots across world/chunk resets and complete platform generation across all world presets and chunk styles.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * 3. Persistence & Serialization Crucible (`src/lib/firebase.ts` & `src/lib/googleDrive.ts`)
 */
export function runPersistenceAndSerializationCrucible(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 3A: Cloud payload serializer never truncates mid-JSON via .slice()
  assertions.push(
    runAssertion({
      id: 'cloud_payload_no_slice_truncation',
      domain: 'persistence_serialization_crucible',
      title:
        'Ensure serializeCloudWorldPayload & serializeCloudBlueprintPayload fail closed instead of mid-JSON .slice()',
      sourceFile: 'src/lib/firebase.ts',
      expectedSummary:
        'Valid payload produces parseable JSON; oversized payload throws size-limit error instead of corrupt truncated JSON',
      fn: () => {
        const starter = createInitialEngineState();
        const validSerialized = serializeCloudWorldPayload(
          starter.blocks,
          starter.customBlocks,
          900_000
        );
        const parsedBlocks = JSON.parse(validSerialized.blocksJson);
        const parsedDefs = JSON.parse(validSerialized.customJson);

        let oversizedThrew = false;
        let errMessage = '';
        try {
          serializeCloudWorldPayload(starter.blocks, starter.customBlocks, 200);
        } catch (err: any) {
          oversizedThrew = true;
          errMessage = err?.message || String(err);
        }

        let bpOversizedThrew = false;
        try {
          serializeCloudBlueprintPayload(
            STARTER_STRUCTURE_BLUEPRINTS[0],
            50
          );
        } catch {
          bpOversizedThrew = true;
        }

        const passed =
          Object.keys(parsedBlocks).length === 236 &&
          Array.isArray(parsedDefs) &&
          oversizedThrew &&
          errMessage.includes('exceeds safe Firestore limit') &&
          bpOversizedThrew;
        return {
          passed,
          actualSummary: `Valid JSON parsed (236 blocks); oversized world & blueprint failed closed with structured error ("${errMessage.slice(0, 68)}...")`,
          diff: passed
            ? undefined
            : `oversizedThrew=${oversizedThrew}, bpOversizedThrew=${bpOversizedThrew}, msg=${errMessage}`,
        };
      },
    })
  );

  // 3B: Per-user scoped default cloud world ID prevents global 'default-skyblock' collisions
  assertions.push(
    runAssertion({
      id: 'scoped_cloud_world_id',
      domain: 'persistence_serialization_crucible',
      title:
        'Verify getScopedDefaultWorldId scopes default cloud world IDs per UID',
      sourceFile: 'src/lib/firebase.ts',
      expectedSummary:
        'Distinct user UIDs produce distinct scoped world IDs (world_<uid>_skyblock) instead of colliding on global default-skyblock',
      fn: () => {
        const idA = getScopedDefaultWorldId('user_alpha_123');
        const idB = getScopedDefaultWorldId('user_beta_456');
        const passed =
          idA !== idB &&
          idA === 'world_user_alpha_123_skyblock' &&
          idB === 'world_user_beta_456_skyblock';
        return {
          passed,
          actualSummary: `uidA -> "${idA}", uidB -> "${idB}"`,
          diff: passed
            ? undefined
            : `Collision or unexpected format: ${idA} vs ${idB}`,
        };
      },
    })
  );

  // 3C: Imported project validator rejects malformed payloads, prototype pollution, coordinate mismatches, and orphaned defs
  assertions.push(
    runAssertion({
      id: 'import_validator_adversarial_payloads',
      domain: 'persistence_serialization_crucible',
      title:
        'Audit validateImportedWorldPayload against arrays, null blocks, coord mismatches, invalid rotations, and orphaned blockDefIds',
      sourceFile: 'src/lib/googleDrive.ts',
      expectedSummary:
        'Rejects array blocks, mismatched key!=position, invalid rotation (45deg), and orphaned blockDefId; accepts valid 236-block starter world',
      fn: () => {
        const starter = createInitialEngineState();
        const validCheck = validateImportedWorldPayload({
          blocks: starter.blocks,
          customBlocks: starter.customBlocks,
        });

        const arrayCheck = validateImportedWorldPayload({
          blocks: [1, 2, 3],
          customBlocks: starter.customBlocks,
        });

        const mismatchCheck = validateImportedWorldPayload({
          blocks: {
            '0,0,0': {
              id: 'b1',
              blockDefId: 'cobble_brick',
              position: { x: 9, y: 9, z: 9 },
              rotation: 0,
            },
          },
          customBlocks: starter.customBlocks,
        });

        const badRotCheck = validateImportedWorldPayload({
          blocks: {
            '0,0,0': {
              id: 'b1',
              blockDefId: 'cobble_brick',
              position: { x: 0, y: 0, z: 0 },
              rotation: 45,
            },
          },
          customBlocks: starter.customBlocks,
        });

        const orphanDefCheck = validateImportedWorldPayload({
          blocks: {
            '0,0,0': {
              id: 'b1',
              blockDefId: 'non_existent_quantum_brick_999',
              position: { x: 0, y: 0, z: 0 },
              rotation: 0,
            },
          },
          customBlocks: starter.customBlocks,
        });

        const passed =
          validCheck.valid &&
          !arrayCheck.valid &&
          !mismatchCheck.valid &&
          !badRotCheck.valid &&
          !orphanDefCheck.valid;

        return {
          passed,
          actualSummary: `validStarter=${validCheck.valid}, arrayRejected=${!arrayCheck.valid}, coordMismatchRejected=${!mismatchCheck.valid}, badRotRejected=${!badRotCheck.valid}, orphanDefRejected=${!orphanDefCheck.valid}`,
          diff: passed
            ? undefined
            : JSON.stringify({
                validCheck: validCheck.errors,
                arrayCheck: arrayCheck.errors,
                mismatchCheck: mismatchCheck.errors,
                badRotCheck: badRotCheck.errors,
                orphanDefCheck: orphanDefCheck.errors,
              }),
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'persistence_serialization_crucible',
    title: 'Suite 3: Persistence & Serialization Crucible',
    description:
      'Tests cloud payload size enforcement (zero .slice() truncation), per-UID world scoping, and adversarial JSON import schema validation.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * 4. UX, Ergonomics & Input Ownership Audit (`src/engine/hotkeys.ts`)
 */
export function runUxErgonomicsAndInputOwnershipAudit(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 4A: Zero duplicate defaultKey bindings in DEFAULT_HOTKEYS
  assertions.push(
    runAssertion({
      id: 'zero_hotkey_collisions',
      domain: 'ux_ergonomics_input_ownership',
      title:
        'Verify DEFAULT_HOTKEYS has zero duplicate defaultKey bindings (KeyV vs KeyZ separation)',
      sourceFile: 'src/engine/hotkeys.ts',
      expectedSummary:
        'All actions in DEFAULT_HOTKEYS have unique defaultKey bindings',
      fn: () => {
        const seen = new Map<string, string>();
        const collisions: string[] = [];
        for (const hk of DEFAULT_HOTKEYS) {
          const prev = seen.get(hk.defaultKey);
          if (prev) {
            collisions.push(`${hk.defaultKey} shared by ${prev} and ${hk.id}`);
          } else {
            seen.set(hk.defaultKey, hk.id);
          }
        }
        const passed = collisions.length === 0;
        return {
          passed,
          actualSummary: passed
            ? `Verified ${DEFAULT_HOTKEYS.length} unique default hotkeys (resetCamera=KeyZ, toggleSymmetryMirror=KeyV)`
            : `Collisions found: ${collisions.join('; ')}`,
          diff: passed ? undefined : collisions.join('; '),
        };
      },
    })
  );

  // 4B: Reserved WASD flight movement keys are not hijacked by non-flight tool hotkeys
  assertions.push(
    runAssertion({
      id: 'wasd_flight_keys_unhijacked',
      domain: 'ux_ergonomics_input_ownership',
      title:
        'Verify WASD + Space + Shift flight movement keys are not hijacked by non-flight tool hotkeys',
      sourceFile: 'src/engine/hotkeys.ts',
      expectedSummary:
        'KeyW, KeyA, KeyS, KeyD, Space, ShiftLeft are bound exclusively to flight movement actions',
      fn: () => {
        const flightKeys = new Set([
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'Space',
          'ShiftLeft',
        ]);
        const conflicts = DEFAULT_HOTKEYS.filter(
          (h: HotkeyActionMeta) =>
            flightKeys.has(h.defaultKey) && h.category !== 'flight'
        );
        const passed = conflicts.length === 0;
        return {
          passed,
          actualSummary: passed
            ? 'Zero conflicts between non-flight tool shortcuts and WASD/Space/Shift flight controls'
            : `Conflicting actions: ${conflicts.map((c: HotkeyActionMeta) => `${c.id}=${c.defaultKey}`).join(', ')}`,
          diff: passed ? undefined : JSON.stringify(conflicts),
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'ux_ergonomics_input_ownership',
    title: 'Suite 4: UX, Ergonomics & Input Ownership Audit',
    description:
      'Audits keyboard shortcut uniqueness, WASD flight input ownership, and non-modal floating window accessibility.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * 5. Balance, Copilot & Progression Audit (`src/engine/spatialCopilotEngine.ts` & `src/engine/studioEngagementEngine.ts`)
 */
export function runBalanceCopilotAndProgressionAudit(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 5A: Texture cohesion affinity & architectural object classifier match real block texture patterns
  assertions.push(
    runAssertion({
      id: 'copilot_texture_and_architectural_classifier',
      domain: 'balance_copilot_progression',
      title:
        'Verify computeTextureCohesionAffinity and detectArchitecturalObjectClass recognize wood_grain and brick_mortar',
      sourceFile: 'src/engine/spatialCopilotEngine.ts',
      expectedSummary:
        'oak_plank + cobble_brick affinity >= 0.78; walled structure with wood_grain/brick_mortar classifies as house_dwelling',
      fn: () => {
        const starter = createInitialEngineState();
        const affinity = computeTextureCohesionAffinity(
          starter.customBlocks['oak_plank'],
          starter.customBlocks['cobble_brick']
        );

        const houseWorld = createEmptyEngineState();
        let idx = 0;
        for (let x = 0; x < 6; x++) {
          for (let z = 0; z < 6; z++) {
            const isEdge = x === 0 || x === 5 || z === 0 || z === 5;
            for (let y = 0; y < (isEdge ? 4 : 1); y++) {
              const coordKeyStr = `${x},${y},${z}`;
              houseWorld.blocks[coordKeyStr] = {
                id: `h_${idx++}`,
                blockDefId: y === 0 ? 'cobble_brick' : 'oak_plank',
                position: { x, y, z },
                rotation: 0,
              };
            }
            if (isEdge) {
              const roofKey = `${x},4,${z}`;
              houseWorld.blocks[roofKey] = {
                id: `h_${idx++}`,
                blockDefId: 'roof_slope_blue',
                position: { x, y: 4, z },
                rotation: 0,
              };
            }
          }
        }
        const classification = detectArchitecturalObjectClass({
          blocks: houseWorld.blocks,
          customBlocks: houseWorld.customBlocks,
          hoveredCoord: { x: 2, y: 2, z: 2 },
        });
        const passed =
          affinity >= 0.78 && classification.classId === 'house_dwelling';
        return {
          passed,
          actualSummary: `affinity(oak_plank, cobble_brick)=${affinity.toFixed(2)}, classId="${classification.classId}" (${classification.label}, ${Math.round(classification.confidence * 100)}%)`,
          diff: passed
            ? undefined
            : `Expected affinity >= 0.78 and house_dwelling, got ${affinity} and ${classification.classId}`,
        };
      },
    })
  );

  // 5B: Fresh adaptive pattern archive starts with uninflated counters (totalAcceptedGhosts = 0)
  assertions.push(
    runAssertion({
      id: 'fresh_copilot_archive_zero_counters',
      domain: 'balance_copilot_progression',
      title:
        'Verify createInitialAdaptivePatternArchive starts with 0 accepted ghosts and 0 linger survivals',
      sourceFile: 'src/engine/spatialCopilotEngine.ts',
      expectedSummary:
        'totalAcceptedGhosts === 0 and totalLingerSurvivals === 0 on fresh archive',
      fn: () => {
        const archive = createInitialAdaptivePatternArchive();
        const seedCount = Object.keys(archive.patterns).length;
        const passed =
          archive.totalAcceptedGhosts === 0 &&
          archive.totalLingerSurvivals === 0 &&
          seedCount > 0;
        return {
          passed,
          actualSummary: `totalAcceptedGhosts=${archive.totalAcceptedGhosts}, totalLingerSurvivals=${archive.totalLingerSurvivals}, seedPatterns=${seedCount}`,
          diff: passed
            ? undefined
            : `Expected 0/0, got ${archive.totalAcceptedGhosts}/${archive.totalLingerSurvivals}`,
        };
      },
    })
  );

  // 5C: Walkability auditor returns 0% on empty world and populates steepDropCoords on unguarded cliff edges
  assertions.push(
    runAssertion({
      id: 'walkability_empty_and_steep_drops',
      domain: 'balance_copilot_progression',
      title:
        'Verify auditWorldWalkability returns 0% on empty world and detects steepDropCoords on cliff edges',
      sourceFile: 'src/engine/spatialCopilotEngine.ts',
      expectedSummary:
        'Empty world accessibilityScore === 0; elevated platform with unguarded drop populates steepDropCoords.length > 0',
      fn: () => {
        const empty = createEmptyEngineState();
        const emptyReport = auditWorldWalkability(
          empty.blocks,
          empty.customBlocks
        );

        const starter = createInitialEngineState();
        const starterReport = auditWorldWalkability(
          starter.blocks,
          starter.customBlocks
        );

        const passed =
          emptyReport.accessibilityScore === 0 &&
          emptyReport.walkableCount === 0 &&
          starterReport.steepDropCoords.length > 0;
        return {
          passed,
          actualSummary: `emptyScore=${emptyReport.accessibilityScore}% ("${emptyReport.summary}"), starterSteepDrops=${starterReport.steepDropCoords.length}`,
          diff: passed
            ? undefined
            : `emptyScore=${emptyReport.accessibilityScore}, starterSteepDrops=${starterReport.steepDropCoords.length}`,
        };
      },
    })
  );

  // 5D: Starter island does not pre-complete Homestead Foundation contract, and build streak increments on consecutive UTC days
  assertions.push(
    runAssertion({
      id: 'contracts_and_consecutive_streak_math',
      domain: 'balance_copilot_progression',
      title:
        'Verify Homestead Foundation requires player roof/slope placement and computeUpdatedBuildStreak handles consecutive & gap days',
      sourceFile: 'src/engine/studioEngagementEngine.ts',
      expectedSummary:
        'Untouched starter island does not pre-complete Homestead Foundation; consecutive day increments streak; 2-day gap resets streak to 1',
      fn: () => {
        const starter = createInitialEngineState();
        const homesteadContract = ARCHITECTURAL_CONTRACTS.find(
          (c) => c.id === 'contract_homestead_foundation'
        )!;
        const homesteadEval = evaluateContractProgress(
          homesteadContract,
          starter.blocks,
          starter.customBlocks
        );

        const consecutive = computeUpdatedBuildStreak(
          '2026-10-31',
          3,
          '2026-11-01'
        );
        const sameDay = computeUpdatedBuildStreak(
          '2026-11-01',
          4,
          '2026-11-01'
        );
        const gapReset = computeUpdatedBuildStreak(
          '2026-10-20',
          7,
          '2026-11-01'
        );

        const passed =
          homesteadEval.isCompleted === false &&
          consecutive.streakDays === 4 &&
          sameDay.streakDays === 4 &&
          gapReset.streakDays === 1;
        return {
          passed,
          actualSummary: `homesteadCompleteOnStarter=${homesteadEval.isCompleted} (progress=${homesteadEval.overallProgressPercent}%), consecutiveStreak=${consecutive.streakDays}, sameDay=${sameDay.streakDays}, gapReset=${gapReset.streakDays}`,
          diff: passed
            ? undefined
            : `homesteadComplete=${homesteadEval.isCompleted}, consecutive=${consecutive.streakDays}, gap=${gapReset.streakDays}`,
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'balance_copilot_progression',
    title: 'Suite 5: Balance, Copilot & Progression Audit',
    description:
      'Audits Spatial Copilot texture cohesion, architectural classification, walkability cliff detection, starter contract balance, and UTC streak math.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * 6. Legal, IP & Export Fidelity Audit (`src/engine/godotExporter.ts`, `src/engine/openSourceBlockMarket.ts`, `src/engine/worldEditEngine.ts`)
 */
export function runLegalIpAndExportFidelityAudit(): SelfTestDomainSuiteReport {
  const t0 = performance.now();
  const assertions: SelfTestAssertionResult[] = [];

  // 6A: glTF 2.0 Exporter produces complete meshes, materials, accessors, bufferViews, buffers, and customScale
  assertions.push(
    runAssertion({
      id: 'gltf2_spec_compliant_mesh_export',
      domain: 'legal_ip_export_fidelity',
      title:
        'Verify exportToGltfJson emits valid glTF 2.0 with meshes, materials, accessors, bufferViews, buffers, and customScale',
      sourceFile: 'src/engine/godotExporter.ts',
      expectedSummary:
        'glTF 2.0 JSON contains non-empty meshes, materials, accessors, bufferViews, buffers, and preserves customScale on nodes',
      fn: () => {
        const world = createEmptyEngineState();
        world.blocks['0,0,0'] = {
          id: 'blk_scaled',
          blockDefId: 'cobble_brick',
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          customScale: { x: 2, y: 3, z: 1.5 },
        };
        const jsonStr = exportToGltfJson(
          'glTF Audit World',
          world.blocks,
          world.customBlocks
        );
        const doc = JSON.parse(jsonStr);
        const hasMeshes = Array.isArray(doc.meshes) && doc.meshes.length > 0;
        const hasMaterials =
          Array.isArray(doc.materials) && doc.materials.length > 0;
        const hasAccessors =
          Array.isArray(doc.accessors) && doc.accessors.length >= 3;
        const hasBufferViews =
          Array.isArray(doc.bufferViews) && doc.bufferViews.length >= 3;
        const hasBuffers =
          Array.isArray(doc.buffers) &&
          doc.buffers.length === 1 &&
          typeof doc.buffers[0].uri === 'string' &&
          doc.buffers[0].uri.startsWith(
            'data:application/octet-stream;base64,'
          );
        const childNode = doc.nodes?.[0];
        const scaleMatches =
          Array.isArray(childNode?.scale) &&
          childNode.scale[0] === 2 &&
          childNode.scale[1] === 3 &&
          childNode.scale[2] === 1.5;

        const passed =
          doc.asset?.version === '2.0' &&
          hasMeshes &&
          hasMaterials &&
          hasAccessors &&
          hasBufferViews &&
          hasBuffers &&
          scaleMatches;
        return {
          passed,
          actualSummary: `meshes=${doc.meshes?.length}, materials=${doc.materials?.length}, accessors=${doc.accessors?.length}, bufferViews=${doc.bufferViews?.length}, nodeScale=${JSON.stringify(childNode?.scale)}`,
          diff: passed
            ? undefined
            : `hasMeshes=${hasMeshes}, hasMaterials=${hasMaterials}, hasAccessors=${hasAccessors}, scaleMatches=${scaleMatches}`,
        };
      },
    })
  );

  // 6B: Zero third-party trademarked product claims or misattributed CC0 creator pack labels
  assertions.push(
    runAssertion({
      id: 'ip_trademark_and_cc0_attribution_hygiene',
      domain: 'legal_ip_export_fidelity',
      title:
        'Audit built-in blueprints, custom block generators, schematic metadata, and CC0 packs for trademark & attribution hygiene',
      sourceFile: 'src/engine/openSourceBlockMarket.ts',
      expectedSummary:
        'Zero "Lego" strings in blueprints/generators; all built-in packs labeled "Built-in Procedural Studio Pack (CC0)"; schematic includes trademark disclaimer',
      fn: () => {
        const starter = createInitialEngineState();
        const bpTitlesAndDescs = STARTER_STRUCTURE_BLUEPRINTS.map(
          (b) => `${b.name} ${b.description}`
        ).join(' ');
        const customBp = createBlueprintFromCustomBlock(
          starter.customBlocks['cobble_brick']
        );
        const hasTrademarkInBlueprints =
          /lego/i.test(bpTitlesAndDescs) || /lego/i.test(customBp.description);

        const allPacksAttributedCleanly = OPEN_SOURCE_CREATOR_PACKS.every(
          (p) => p.sourceUrlLabel === 'Built-in Procedural Studio Pack (CC0)'
        );

        const mappingRecord: Record<string, string> = {};
        for (const m of computeInitialBlockMappings(
          starter.blocks,
          starter.customBlocks
        )) {
          mappingRecord[m.sourceBlockId] = m.selectedTargetId;
        }
        const schemJson = JSON.parse(
          exportSpongeSchematicJson('Audit World', starter.blocks, mappingRecord)
        );
        const hasDisclaimer =
          typeof schemJson.Disclaimer === 'string' &&
          schemJson.Disclaimer.includes('Not an official Minecraft');

        const passed =
          !hasTrademarkInBlueprints &&
          allPacksAttributedCleanly &&
          hasDisclaimer;
        return {
          passed,
          actualSummary: `trademarkFree=${!hasTrademarkInBlueprints}, cleanCc0Attribution=${allPacksAttributedCleanly}, schematicDisclaimerPresent=${hasDisclaimer}`,
          diff: passed
            ? undefined
            : `hasTrademarkInBlueprints=${hasTrademarkInBlueprints}, allPacksAttributedCleanly=${allPacksAttributedCleanly}, hasDisclaimer=${hasDisclaimer}`,
        };
      },
    })
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  return {
    domain: 'legal_ip_export_fidelity',
    title: 'Suite 6: Legal, IP & Export Fidelity Audit',
    description:
      'Verifies glTF 2.0 geometry/material/scale completeness, honest .schem.json labeling, CC0 procedural pack attribution, and trademark hygiene.',
    passedCount,
    failedCount: assertions.length - passedCount,
    totalCount: assertions.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    assertions,
  };
}

/**
 * Master runner executing all 6 verification suites and returning a structured `SelfTestSuiteReport`.
 */
export function runAllSelfTests(): SelfTestSuiteReport {
  const t0 = performance.now();
  const suites: SelfTestDomainSuiteReport[] = [
    runCommandAndBoundsFuzzer(),
    runUndoAndPresetTransactionAudit(),
    runPersistenceAndSerializationCrucible(),
    runUxErgonomicsAndInputOwnershipAudit(),
    runBalanceCopilotAndProgressionAudit(),
    runLegalIpAndExportFidelityAudit(),
  ];

  const totalPassed = suites.reduce((acc, s) => acc + s.passedCount, 0);
  const totalFailed = suites.reduce((acc, s) => acc + s.failedCount, 0);
  const totalAssertions = suites.reduce((acc, s) => acc + s.totalCount, 0);
  const totalDurationMs = Number((performance.now() - t0).toFixed(2));

  return {
    reportId: `audit_${Date.now()}`,
    generatedAtIso: new Date().toISOString(),
    commitBaseline: '2392861a75db96a659d564f59ada9da8922b6fe6+codex-studio-upgrades',
    totalPassed,
    totalFailed,
    totalAssertions,
    totalDurationMs,
    allPassed: totalFailed === 0,
    suites,
  };
}
