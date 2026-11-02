/** Detached proposals only. The mounted session validates and commits once. */
import { JAVA_SCHEMATIC_PROFILE } from '../engine/javaProfile';
import {
  applyVolumeBrushToWorld, computeVolumeBrushOffsets, getVolumeBrushApplicationError,
  getChunkCoordForBlock, chunkKey, type VolumeBrushApplicationParams,
} from '../engine/chunkAndPatternEngine';
import { computeSymmetryTargets, getSymmetryTargetsError } from '../engine/spatialCopilotEngine';
import { samePlacementContent } from '../engine/placementContent';
import { ENGINE_EDIT_LIMITS, coordKey } from '../engine/worldEditEngine';
import type { GridCoord, SymmetryConfig, WorldEditEngineState } from '../engine/types';
import type { StudioDocument } from './studioDocument';

export const SINGLE_CELL_BRUSH = Object.freeze({ shape: 'cube' as const, radius: 0, height: 1, hollow: false, airOnly: false });

export function studioSymmetryTargets(document: StudioDocument, coord: GridCoord, rotation: 0 | 90 | 180 | 270, symmetry: SymmetryConfig) {
  const error = getSymmetryTargetsError(coord, rotation, symmetry);
  if (error) throw new Error(error);
  const targets = computeSymmetryTargets(coord, rotation, symmetry);
  const target = document.targetPolicy?.target;
  if (target?.kind !== 'minecraft-java' || !target.locked) return targets;
  // This exact candidate contains only full, directionless block states. Reflect
  // cell addresses while retaining their native state, with canonical rotation0.
  // Freeform and future directional profiles cannot inherit this exception.
  if (target.profileId !== JAVA_SCHEMATIC_PROFILE.id || rotation !== 0) throw new Error('This locked profile requires unrotated mapped unit cells.');
  return targets.map(item => ({ ...item, rotation: 0 as const }));
}

export interface StudioBrushOptions extends Omit<VolumeBrushApplicationParams, 'state' | 'patternConfig'> {
  symmetry: SymmetryConfig;
}
export interface StudioBrushProposal {
  state: WorldEditEngineState;
  chunkConfig: StudioDocument['chunkConfig'];
  changedCoords: GridCoord[];
  affectedCount: number;
}

export function prepareStudioBrush(document: StudioDocument, state: WorldEditEngineState, options: StudioBrushOptions): StudioBrushProposal {
  if (state.blocks !== document.blocks || state.customBlocks !== document.customBlocks) throw new Error('Brush preparation requires one current project snapshot; source snapshots cannot be mixed.');
  const targets = studioSymmetryTargets(document, options.center, options.rotation, options.symmetry);
  const targetPolicy = document.targetPolicy?.target;
  const patternConfig = targetPolicy?.kind === 'minecraft-java' && targetPolicy.locked
    ? { ...document.patternConfig, smartPlacementPrediction: false } : document.patternConfig;
  // Preflight every mirrored extent before generating any proposal or history.
  for (const target of targets) {
    const error = getVolumeBrushApplicationError({ ...options, state, center: target.coord, rotation: target.rotation, patternConfig });
    if (error) throw new Error(error);
  }
  const offsets = computeVolumeBrushOffsets(options.brush);
  if (!targets.length || !offsets.length || targets.length * offsets.length > ENGINE_EDIT_LIMITS.maxOperationCells) throw new Error('The mirrored brush exceeds the combined operation limit.');
  const touched = new Map<string, GridCoord>();
  for (const target of targets) for (const offset of offsets) {
    const coord = { x: target.coord.x + offset.x, y: target.coord.y + offset.y, z: target.coord.z + offset.z };
    touched.set(coordKey(coord.x, coord.y, coord.z), coord);
  }
  let working = state;
  for (const target of targets) {
    const result = applyVolumeBrushToWorld({ ...options, state: working, center: target.coord, rotation: target.rotation, patternConfig }, { recordHistory: false });
    if (result.error) throw new Error(result.error);
    working = result.nextState;
  }
  // Overlapping centers can visit a cell repeatedly. Count final changed cells
  // once, including removals, instead of counting mirror centers or visits.
  const changedCoords = [...touched].filter(([key]) => {
    const after = working.blocks[key], before = state.blocks[key];
    return after ? !samePlacementContent(before, after) : Boolean(before);
  }).map(([, coord]) => coord);
  if (!changedCoords.length) return { state, chunkConfig: document.chunkConfig, changedCoords, affectedCount: 0 };
  const placing = options.mode === 'place' || options.mode === 'brush_place';
  let chunkConfig = document.chunkConfig;
  if (placing) {
    const unlocked = new Set(chunkConfig.unlockedChunks), active = { ...chunkConfig.activeChunks };
    let changed = false;
    for (const coord of changedCoords) {
      const { cx, cz } = getChunkCoordForBlock(coord.x, coord.z, chunkConfig.chunkSize), key = chunkKey(cx, cz);
      if (!unlocked.has(key) || active[key] !== true) { unlocked.add(key); active[key] = true; changed = true; }
    }
    if (changed) chunkConfig = { ...chunkConfig, unlockedChunks: [...unlocked], activeChunks: active };
  }
  return { state: working, chunkConfig, changedCoords, affectedCount: changedCoords.length };
}
