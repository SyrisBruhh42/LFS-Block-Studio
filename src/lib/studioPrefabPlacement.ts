import type { BlueprintPrefab, GridCoord, PlacedBlock, WorldEditEngineState } from '../engine/types';
import { stampBlueprintIntoWorld, validateBlueprintPlacement } from '../engine/worldEditEngine';
import { sameBlueprintData, samePlacementContent } from '../engine/placementContent';
import { chunkKey, getChunkCoordForBlock } from '../engine/chunkAndPatternEngine';
import { validateStudioDocument, type StudioDocument } from './studioDocument';
import { stringifyBoundedJson } from './boundedJson';

export interface StudioPrefabReport {
  format: 'lfs-studio-prefab-review'; version: 1; sourceToken: string; blueprintId: string; name: string; anchor: GridCoord; rotation: number;
  cells: { key: string; before: PlacedBlock | null; after: PlacedBlock }[]; added: number; replaced: number; revealedChunks: string[]; noop: boolean;
}
export interface StudioPrefabProposal { sourceToken: string; state: WorldEditEngineState; chunkConfig: StudioDocument['chunkConfig']; report: StudioPrefabReport }
export function prepareStudioPrefabPlacement(document: StudioDocument, state: WorldEditEngineState, sourceToken: string, blueprintId: string, anchor: GridCoord, rotation: 0 | 90 | 180 | 270): StudioPrefabProposal {
  if (document.blocks !== state.blocks || document.customBlocks !== state.customBlocks) throw new Error('Prefab placement requires one current project snapshot.');
  if (![0, 90, 180, 270].includes(rotation) || !anchor || ![anchor.x, anchor.y, anchor.z].every(value => Number.isFinite(value) && Math.abs(value) <= 1000000)) throw new Error('Prefab placement requires bounded finite coordinates and a quarter-turn rotation.');
  const blueprint: BlueprintPrefab | undefined = document.blueprints.find(bp => bp.id === blueprintId);
  if (!blueprint) throw new Error('Choose a blueprint in the current project library.');
  const error = validateBlueprintPlacement(state, blueprint, anchor, rotation); if (error) throw new Error(error);
  const proposed = stampBlueprintIntoWorld(state, blueprint, anchor, rotation);
  const cells = Object.entries(proposed.blocks).filter(([key, after]) => !samePlacementContent(state.blocks[key], after)).map(([key, after]) => ({ key, before: state.blocks[key] ?? null, after }));
  const unlocked = new Set(document.chunkConfig.unlockedChunks), active = { ...document.chunkConfig.activeChunks }, revealedChunks: string[] = [];
  for (const { after } of cells) {
    const { cx, cz } = getChunkCoordForBlock(after.position.x, after.position.z, document.chunkConfig.chunkSize), key = chunkKey(cx, cz);
    if (!unlocked.has(key) || active[key] !== true) { unlocked.add(key); active[key] = true; revealedChunks.push(key); }
  }
  const chunkConfig = revealedChunks.length ? { ...document.chunkConfig, unlockedChunks: [...unlocked], activeChunks: active } : document.chunkConfig;
  const checked = validateStudioDocument({ ...document, blocks: proposed.blocks, customBlocks: proposed.customBlocks, chunkConfig });
  if (!checked.ok) throw new Error(checked.error.message);
  const report: StudioPrefabReport = { format: 'lfs-studio-prefab-review', version: 1, sourceToken, blueprintId, name: blueprint.name, anchor: { ...anchor }, rotation, cells, added: cells.filter(c => !c.before).length, replaced: cells.filter(c => c.before).length, revealedChunks, noop: !cells.length && !revealedChunks.length && sameBlueprintData(state.customBlocks, proposed.customBlocks) };
  stringifyBoundedJson(report, 32 * 1024 * 1024, 'Prefab review');
  return { sourceToken, state: proposed, chunkConfig, report };
}
