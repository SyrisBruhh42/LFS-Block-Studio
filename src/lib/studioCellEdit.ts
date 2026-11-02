/** Read-only cell projections and detached property patches. The session owns commit/history. */
import { validateStudioDocument, STUDIO_DOCUMENT_LIMITS, type StudioDocument } from './studioDocument';
import type { PlacedBlock, WorldChunkConfig } from '../engine/types';
import type { StudioWorkspace } from './studioEditorSession';
import { sameBlueprintData } from '../engine/placementContent';
import { chunkKey, getChunkCoordForBlock } from '../engine/chunkAndPatternEngine';

export interface StudioCellTarget { readonly documentId: string; readonly blockId: string; readonly keyHint: string }
export interface StudioCellDraft {
  x: string; y: string; z: string; definitionId: string; rotation: string;
  scaleMode: 'definition' | 'custom'; scaleX: string; scaleY: string; scaleZ: string;
  resetAppearance: boolean;
}
export interface StudioCellProjection { key: string; block: PlacedBlock; definition: StudioDocument['customBlocks'][string] }
export interface StudioCellEditReport {
  readonly before: { readonly definition: string; readonly position: string; readonly rotation: number; readonly scale: string };
  readonly after: { readonly definition: string; readonly position: string; readonly rotation: number; readonly scale: string };
  readonly changes: readonly string[];
  readonly followsSelection: boolean;
  readonly revealsChunk: string | null;
  readonly noop: boolean;
}
export interface PreparedStudioCellEdit {
  readonly sourceToken: string; readonly target: StudioCellTarget;
  readonly fromKey: string; readonly toKey: string; readonly before: PlacedBlock; readonly after: PlacedBlock;
  readonly chunkConfig: WorldChunkConfig | null; readonly followsSelection: boolean;
  readonly report: StudioCellEditReport;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const point = (p: PlacedBlock['position']) => `${p.x}, ${p.y}, ${p.z}`;
export function effectiveCellScale(block: PlacedBlock, definition: StudioDocument['customBlocks'][string]) { return block.customScale ?? definition.defaultScale ?? { x: 1, y: 1, z: 1 }; }
const scaleText = (block: PlacedBlock, definition: StudioDocument['customBlocks'][string]) => { const s = effectiveCellScale(block, definition); return `${s.x} × ${s.y} × ${s.z}${block.customScale ? ' · instance' : ' · definition'}`; };
export function resolveStudioCell(document: StudioDocument, target: StudioCellTarget | null): StudioCellProjection | null {
  if (!target || target.documentId !== document.documentId) return null;
  const known = document.blocks[target.keyHint];
  if (known?.id === target.blockId) return { key: target.keyHint, block: known, definition: document.customBlocks[known.blockDefId] };
  for (const [key, block] of Object.entries(document.blocks)) if (block.id === target.blockId) return { key, block, definition: document.customBlocks[block.blockDefId] };
  return null;
}
export function draftStudioCell(cell: StudioCellProjection): StudioCellDraft {
  const scale = effectiveCellScale(cell.block, cell.definition);
  return { x: String(cell.block.position.x), y: String(cell.block.position.y), z: String(cell.block.position.z), definitionId: cell.block.blockDefId,
    rotation: String(cell.block.rotation), scaleMode: cell.block.customScale ? 'custom' : 'definition',
    scaleX: String(scale.x), scaleY: String(scale.y), scaleZ: String(scale.z), resetAppearance: false };
}
export function checkCellDraft(value: StudioCellDraft): StudioCellDraft {
  const keys = ['x','y','z','definitionId','rotation','scaleMode','scaleX','scaleY','scaleZ','resetAppearance'];
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) throw new Error('Cell properties require the known draft fields.');
  const copy: Record<string, any> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !('value' in d)) throw new Error('Cell properties require plain data values.');
    if (key === 'resetAppearance' ? typeof d.value !== 'boolean' : typeof d.value !== 'string' || d.value.length > (key === 'definitionId' ? 200 : 64)) throw new Error('Cell property value is unsupported or too long.');
    copy[key] = d.value;
  }
  if (!['definition','custom'].includes(copy.scaleMode)) throw new Error('Choose definition or instance scale.');
  return copy as StudioCellDraft;
}
function numeric(text: string, name: string, min: number, max: number, integer = false) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) throw new Error(`${name} must be a decimal number.`);
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max || integer && !Number.isSafeInteger(n)) throw new Error(`${name} must be ${integer ? 'a whole number' : 'a finite number'} between ${min} and ${max}.`);
  return n || 0;
}
const exactPoint = (a: PlacedBlock['position'] | null, b: PlacedBlock['position']) => Boolean(a && a.x === b.x && a.y === b.y && a.z === b.z);
/** Region commands own integer grid addresses; authored Freeform positions remain exact. */
export const studioCellAnchor = (position: PlacedBlock['position']) => ({ x: Math.round(position.x) || 0, y: Math.round(position.y) || 0, z: Math.round(position.z) || 0 });
const selectsCell = (workspace: StudioWorkspace, position: PlacedBlock['position']) => [position,studioCellAnchor(position)].some(p => exactPoint(workspace.pos1,p) && exactPoint(workspace.pos2,p));
export function prepareStudioCellEdit(document: StudioDocument, target: StudioCellTarget, input: StudioCellDraft, sourceToken: string, workspace: StudioWorkspace): PreparedStudioCellEdit {
  if (typeof sourceToken !== 'string' || !sourceToken.length || sourceToken.length > 4096) throw new Error('A current editing source is required.');
  const cell = resolveStudioCell(document, target); if (!cell) throw new Error('This cell is no longer present in this project. Reload or choose a current cell.');
  const draft = checkCellDraft(input), definition = document.customBlocks[draft.definitionId];
  if (!definition) throw new Error('Choose a block definition from this project.');
  const locked = document.targetPolicy?.target.kind === 'minecraft-java' && document.targetPolicy.target.locked;
  const position = { x: numeric(draft.x,'X',-STUDIO_DOCUMENT_LIMITS.maxCoordinate,STUDIO_DOCUMENT_LIMITS.maxCoordinate,locked), y: numeric(draft.y,'Y',-STUDIO_DOCUMENT_LIMITS.maxCoordinate,STUDIO_DOCUMENT_LIMITS.maxCoordinate,locked), z: numeric(draft.z,'Z',-STUDIO_DOCUMENT_LIMITS.maxCoordinate,STUDIO_DOCUMENT_LIMITS.maxCoordinate,locked) };
  if (!['0','90','180','270'].includes(draft.rotation)) throw new Error('Choose a quarter-turn rotation.');
  const after: PlacedBlock = { ...structuredClone(cell.block), blockDefId: definition.id, position, rotation: Number(draft.rotation) as PlacedBlock['rotation'] };
  if (draft.scaleMode === 'definition') delete after.customScale;
  else after.customScale = { x: numeric(draft.scaleX,'Scale X',.01,64), y: numeric(draft.scaleY,'Scale Y',.01,64), z: numeric(draft.scaleZ,'Scale Z',.01,64) };
  if (draft.resetAppearance) { delete after.colorOverride; delete after.textureOverride; delete after.materialOverride; }
  const toKey = `${Math.round(position.x)},${Math.round(position.y)},${Math.round(position.z)}`;
  if (toKey !== cell.key && document.blocks[toKey]) throw new Error(`The destination anchor (${toKey}) is occupied. Choose a free anchor; no existing cell will be replaced.`);
  const moved = !sameBlueprintData(cell.block.position, position), blocks = { ...document.blocks };
  if (toKey !== cell.key) delete blocks[cell.key];
  blocks[toKey] = after;
  const { cx, cz } = getChunkCoordForBlock(position.x, position.z, document.chunkConfig.chunkSize), ck = chunkKey(cx,cz);
  const reveal = moved && (!document.chunkConfig.unlockedChunks.includes(ck) || document.chunkConfig.activeChunks[ck] !== true);
  const chunkConfig = reveal ? { ...document.chunkConfig, unlockedChunks: [...new Set([...document.chunkConfig.unlockedChunks,ck])], activeChunks: { ...document.chunkConfig.activeChunks,[ck]:true } } : null;
  const checked = validateStudioDocument({ ...document, blocks, chunkConfig: chunkConfig ?? document.chunkConfig });
  if (!checked.ok) throw new Error(checked.error.message);
  const canonical = checked.value.blocks[toKey], followsSelection = moved && selectsCell(workspace,cell.block.position);
  const changes: string[] = [];
  if (moved) changes.push('Position');
  if (cell.block.blockDefId !== canonical.blockDefId) changes.push('Block type');
  if (cell.block.rotation !== canonical.rotation) changes.push('Rotation');
  if (!sameBlueprintData(cell.block.customScale,canonical.customScale)) changes.push('Scale source or values');
  if (['colorOverride','textureOverride','materialOverride'].some(k => (cell.block as any)[k] !== (canonical as any)[k])) changes.push('Instance appearance');
  if (reveal) changes.push('Destination chunk becomes visible');
  if (followsSelection) changes.push('Single-cell selection follows the destination grid anchor');
  const report: StudioCellEditReport = { before: { definition: cell.definition.name, position: point(cell.block.position), rotation:cell.block.rotation, scale:scaleText(cell.block,cell.definition) },
    after: { definition:definition.name, position:point(canonical.position), rotation:canonical.rotation, scale:scaleText(canonical,definition) }, changes, followsSelection, revealsChunk:reveal?ck:null, noop:changes.length===0 };
  return freeze({ sourceToken,target:{...target},fromKey:cell.key,toKey,before:structuredClone(cell.block),after:structuredClone(canonical),chunkConfig:chunkConfig?structuredClone(chunkConfig):null,followsSelection,report });
}
/** Call only inside the expected-source session transaction; validates the exact preimage too. */
export function applyStudioCellEditPatch(document: StudioDocument, workspace: StudioWorkspace, edit: PreparedStudioCellEdit) {
  if (document.documentId !== edit.target.documentId || !sameBlueprintData(document.blocks[edit.fromKey],edit.before)) throw new Error('The inspected cell changed after review. Review it again.');
  if (edit.toKey !== edit.fromKey && document.blocks[edit.toKey]) throw new Error('The reviewed destination is now occupied.');
  if (edit.followsSelection && !selectsCell(workspace,edit.before.position)) throw new Error('The selection changed after review.');
  if (edit.report.noop) return { blocks:document.blocks,chunkConfig:document.chunkConfig,pos1:workspace.pos1,pos2:workspace.pos2 };
  const blocks = { ...document.blocks }; if (edit.toKey !== edit.fromKey) delete blocks[edit.fromKey]; blocks[edit.toKey] = structuredClone(edit.after);
  return { blocks,chunkConfig:edit.chunkConfig ?? document.chunkConfig,pos1:edit.followsSelection?studioCellAnchor(edit.after.position):workspace.pos1,pos2:edit.followsSelection?studioCellAnchor(edit.after.position):workspace.pos2 };
}
