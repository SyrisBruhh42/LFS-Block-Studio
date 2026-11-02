/**
 * ISOLATED / NOT MOUNTED IN APP: this first Freeform action slice does not establish G2.
 * Full authored document history is covered; selection/clipboard, durable activation,
 * target/lock transitions and the remaining App mutation routes are not integrated.
 * Existing fractional Freeform anchors may load; these four grid actions require integers.
 * Opaque document extensions are preserved data, never game-profile authority.
 */
import { validateStudioDocument, STUDIO_DOCUMENT_LIMITS, type StudioDocument } from '../lib/studioDocument';
import { getGridCoordError, getSelectionVolumeError, ENGINE_EDIT_LIMITS, DEFAULT_BLOCK_DEFINITIONS } from './worldEditEngine';
import type { GridCoord, PlacedBlock } from './types';

export const STUDIO_ACTION_LIMITS = Object.freeze({
  maxActionCells: ENGINE_EDIT_LIMITS.maxOperationCells,
  maxHistoryEntries: 30,
  maxHistoryBytes: 16 * 1024 * 1024,
});
export interface StudioActionToken {
  readonly documentId: string;
  readonly editRevision: number;
  readonly sessionId: string;
  readonly historyEpoch: string;
}
export type StudioPlacement = Pick<PlacedBlock, 'blockDefId' | 'rotation' | 'customScale' | 'colorOverride' | 'textureOverride' | 'materialOverride'>;
export type StudioPaint = {
  readonly colorOverride?: PlacedBlock['colorOverride'] | null;
  readonly textureOverride?: PlacedBlock['textureOverride'] | null;
  readonly materialOverride?: PlacedBlock['materialOverride'] | null;
};
export type StudioAction =
  | { readonly type: 'place'; readonly position: GridCoord; readonly placement: StudioPlacement }
  | { readonly type: 'erase'; readonly position: GridCoord }
  | { readonly type: 'paint'; readonly position: GridCoord; readonly appearance: StudioPaint }
  | { readonly type: 'fill'; readonly bounds: { readonly min: GridCoord; readonly max: GridCoord }; readonly placement: StudioPlacement }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };
export interface StudioActionHistoryEntry {
  readonly label: string;
  readonly source: StudioActionToken;
  /** Complete authored payload; durable identity/revision/timestamp stay in the active envelope. */
  readonly authoredJson: string;
}
export interface StudioActionState {
  readonly mode: 'freeform-only';
  readonly document: StudioDocument;
  /** Live action counter, independent of document.revision (the durable store CAS counter). */
  readonly editRevision: number;
  readonly sessionId: string;
  readonly undoStack: readonly StudioActionHistoryEntry[];
  readonly redoStack: readonly StudioActionHistoryEntry[];
  readonly historyBudget: { readonly maxEntries: number; readonly maxBytes: number };
}
export type StudioActionErrorCode = 'invalid-action' | 'invalid-state' | 'invalid-document' | 'stale-action' | 'history-limit' | 'history-unavailable' | 'revision-limit';
export interface StudioActionFailure { readonly code: StudioActionErrorCode; readonly message: string }
export type StudioActionResult =
  | { readonly status: 'applied'; readonly state: StudioActionState; readonly token: StudioActionToken; readonly affectedCount: number; readonly label: string }
  | { readonly status: 'noop'; readonly state: StudioActionState; readonly token: StudioActionToken; readonly affectedCount: 0 }
  | { readonly status: 'rejected'; readonly state: StudioActionState; readonly error: StudioActionFailure };

class Rejected extends Error {
  constructor(readonly code: StudioActionErrorCode, message: string) { super(message); }
}
function reject(code: StudioActionErrorCode, message: string): never { throw new Rejected(code, message); }
function failure(error: unknown): StudioActionFailure {
  return error instanceof Rejected ? { code: error.code, message: error.message }
    : { code: 'invalid-action', message: 'The action could not be safely read; no changes were applied.' };
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = [], code: StudioActionErrorCode = 'invalid-action'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject(code, 'Expected a plain data object.');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ![...required, ...optional].includes(key)) reject(code, 'Unsupported field.');
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!property.enumerable || !('value' in property) || property.value === undefined) reject(code, 'Expected an enumerable data field; omit absent optional fields.');
    result[key] = property.value;
  }
  for (const key of required) if (!Object.hasOwn(result, key)) reject(code, `Missing ${key}.`);
  return result;
}
function identifier(value: unknown, code: StudioActionErrorCode): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(value)) reject(code, 'Invalid identity.');
  return value;
}
function counter(value: unknown, code: StudioActionErrorCode, maximum = Number.MAX_SAFE_INTEGER, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) reject(code, 'Invalid bounded integer.');
  return value;
}
function token(value: unknown, code: StudioActionErrorCode): StudioActionToken {
  const t = record(value, ['documentId', 'editRevision', 'sessionId', 'historyEpoch'], [], code);
  return Object.freeze({ documentId: identifier(t.documentId, code), editRevision: counter(t.editRevision, code),
    sessionId: identifier(t.sessionId, code), historyEpoch: identifier(t.historyEpoch, code) });
}
export function getStudioActionToken(state: StudioActionState): StudioActionToken {
  return Object.freeze({ documentId: state.document.documentId, editRevision: state.editRevision,
    sessionId: state.sessionId, historyEpoch: state.document.historyEpoch });
}
function sameSession(a: StudioActionToken, b: StudioActionToken): boolean {
  return a.documentId === b.documentId && a.sessionId === b.sessionId && a.historyEpoch === b.historyEpoch;
}
function grid(value: unknown): GridCoord {
  const p = record(value, ['x', 'y', 'z']);
  const coordinate = { x: p.x as number, y: p.y as number, z: p.z as number };
  const error = getGridCoordError(coordinate);
  if (error) reject('invalid-action', error);
  return coordinate;
}
const APPEARANCE = ['colorOverride', 'textureOverride', 'materialOverride'] as const;
function placement(value: unknown): StudioPlacement {
  const p = record(value, ['blockDefId', 'rotation'], [...APPEARANCE, 'customScale']);
  identifier(p.blockDefId, 'invalid-action');
  if (![0, 90, 180, 270].includes(p.rotation as number)) reject('invalid-action', 'Unsupported rotation.');
  if (p.customScale !== undefined) p.customScale = record(p.customScale, ['x', 'y', 'z']);
  return p as unknown as StudioPlacement;
}
function parseAction(value: unknown): StudioAction {
  // Read only the descriptor until the discriminator selects an exact shape.
  if (!value || typeof value !== 'object') reject('invalid-action', 'Expected an action.');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
  if (!descriptor || !('value' in descriptor)) reject('invalid-action', 'Missing action type.');
  switch (descriptor.value) {
    case 'undo': case 'redo': return record(value, ['type']) as unknown as StudioAction;
    case 'place': { const a = record(value, ['type', 'position', 'placement']); return { type: 'place', position: grid(a.position), placement: placement(a.placement) }; }
    case 'erase': { const a = record(value, ['type', 'position']); return { type: 'erase', position: grid(a.position) }; }
    case 'paint': {
      const a = record(value, ['type', 'position', 'appearance']);
      const appearance = record(a.appearance, [], APPEARANCE);
      for (const field of APPEARANCE) if (Object.hasOwn(appearance, field) && appearance[field] !== null && typeof appearance[field] !== 'string') reject('invalid-action', 'Appearance must be text or explicit null to remove an override.');
      return { type: 'paint', position: grid(a.position), appearance };
    }
    case 'fill': {
      const a = record(value, ['type', 'bounds', 'placement']);
      const b = record(a.bounds, ['min', 'max']);
      const min = grid(b.min), max = grid(b.max);
      if (min.x > max.x || min.y > max.y || min.z > max.z) reject('invalid-action', 'Fill bounds must be ordered.');
      const error = getSelectionVolumeError(min, max);
      if (error) reject('invalid-action', error);
      return { type: 'fill', bounds: { min, max }, placement: placement(a.placement) };
    }
    default: reject('invalid-action', 'Unsupported action. Target/lock changes and document replacement are unavailable in this slice.');
  }
}
function validated(value: unknown): StudioDocument {
  const result = validateStudioDocument(value);
  if (!result.ok) reject('invalid-document', result.error.message);
  return result.value;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
// This counts UTF-8 payload bytes, not JavaScript heap overhead or a RAM guarantee.
function utf8Size(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (n < 128) bytes++;
    else if (n < 2048) bytes += 2;
    else if (n >= 0xd800 && n <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
export function getStudioActionHistoryBytes(state: Pick<StudioActionState, 'undoStack' | 'redoStack'>): number {
  return [...state.undoStack, ...state.redoStack].reduce((sum, entry) => sum + entryBytes(entry), 0);
}
function entryBytes(entry: StudioActionHistoryEntry): number {
  // Reserve the maximum live-counter width so 9 -> 10 cannot make recovery exceed
  // an otherwise exact-fit budget. All other identity fields are fixed within the epoch.
  return utf8Size(entry.authoredJson) + utf8Size(JSON.stringify({ label: entry.label,
    source: { ...entry.source, editRevision: Number.MAX_SAFE_INTEGER } }));
}
function budget(value: unknown): StudioActionState['historyBudget'] {
  const b = record(value, ['maxEntries', 'maxBytes'], [], 'invalid-state');
  return Object.freeze({ maxEntries: counter(b.maxEntries, 'invalid-state', STUDIO_ACTION_LIMITS.maxHistoryEntries, 1),
    maxBytes: counter(b.maxBytes, 'invalid-state', STUDIO_ACTION_LIMITS.maxHistoryBytes, 1) });
}

/** Creates a fresh isolated session; installing it into App/persistence is a separate unimplemented transition. */
export function createStudioActionState(document: unknown, sessionId: string,
  historyBudget: StudioActionState['historyBudget'] = { maxEntries: STUDIO_ACTION_LIMITS.maxHistoryEntries, maxBytes: STUDIO_ACTION_LIMITS.maxHistoryBytes }
): { ok: true; state: StudioActionState } | { ok: false; error: StudioActionFailure } {
  try {
    return { ok: true, state: deepFreeze({ mode: 'freeform-only', document: validated(document), editRevision: 0,
      sessionId: identifier(sessionId, 'invalid-state'), undoStack: [], redoStack: [], historyBudget: budget(historyBudget) } as StudioActionState) };
  } catch (error) { return { ok: false, error: failure(error) }; }
}
function validateState(state: StudioActionState): { document: StudioDocument; current: StudioActionToken } {
  const s = record(state, ['mode', 'document', 'editRevision', 'sessionId', 'undoStack', 'redoStack', 'historyBudget'], [], 'invalid-state');
  if (s.mode !== 'freeform-only') reject('invalid-state', 'Game profile enforcement is unavailable.');
  const document = validated(s.document);
  const current = token({ documentId: document.documentId, editRevision: s.editRevision, sessionId: s.sessionId, historyEpoch: document.historyEpoch }, 'invalid-state');
  const limits = budget(s.historyBudget);
  for (const stack of [s.undoStack, s.redoStack]) {
    if (!Array.isArray(stack) || stack.length > limits.maxEntries || Reflect.ownKeys(stack).length !== stack.length + 1) reject('invalid-state', 'Invalid history array.');
    for (let i = 0; i < stack.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(stack, String(i));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) reject('invalid-state', 'Invalid history entry.');
      const entry = record(descriptor.value, ['label', 'source', 'authoredJson'], [], 'invalid-state');
      if (typeof entry.label !== 'string' || entry.label.length > 80 || typeof entry.authoredJson !== 'string'
        || entry.authoredJson.length > limits.maxBytes) reject('invalid-state', 'Invalid history payload.');
      const source = token(entry.source, 'invalid-state');
      if (!sameSession(source, current) || source.editRevision >= current.editRevision) reject('invalid-state', 'History belongs to another session, epoch or revision.');
    }
  }
  if (state.undoStack.length + state.redoStack.length > limits.maxEntries || getStudioActionHistoryBytes(state) > limits.maxBytes) reject('invalid-state', 'Combined history budget exceeded.');
  return { document, current };
}
function snapshot(document: StudioDocument, source: StudioActionToken, label: string): StudioActionHistoryEntry {
  const { format: _format, schemaVersion: _schema, documentId: _id, revision: _revision,
    historyEpoch: _epoch, savedAt: _savedAt, ...authored } = document;
  return Object.freeze({ authoredJson: JSON.stringify(authored), source, label });
}
function restoreAuthored(json: string, current: StudioDocument): StudioDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { reject('invalid-state', 'History snapshot is invalid; it was not applied.'); }
  const authored = record(parsed, ['world', 'blocks', 'customBlocks', 'blueprints', 'chunkConfig', 'patternConfig'], ['lightingConfig', 'extensions'], 'invalid-state');
  // Construct from the envelope explicitly: absent optional authored fields must stay absent.
  return validated({ format: current.format, schemaVersion: current.schemaVersion, documentId: current.documentId,
    revision: current.revision, historyEpoch: current.historyEpoch, savedAt: current.savedAt, ...authored });
}
function trimHistory(undo: StudioActionHistoryEntry[], redo: StudioActionHistoryEntry[], immediate: StudioActionHistoryEntry, limits: StudioActionState['historyBudget']): void {
  if (entryBytes(immediate) > limits.maxBytes) reject('history-limit', 'The immediate predecessor does not fit the history budget; the edit was not applied.');
  while (undo.length + redo.length > limits.maxEntries || getStudioActionHistoryBytes({ undoStack: undo, redoStack: redo }) > limits.maxBytes) {
    const u = undo[0] === immediate ? undefined : undo[0], r = redo[0] === immediate ? undefined : redo[0];
    if (u && (!r || u.source.editRevision <= r.source.editRevision)) undo.shift();
    else if (r) redo.shift();
    else reject('history-limit', 'The recoverable predecessor cannot be retained.');
  }
}
function cellKey(p: GridCoord): string { return `${p.x},${p.y},${p.z}`; }
function blockAt(p: GridCoord, pConfig: StudioPlacement, existing?: PlacedBlock, occupiedIds?: Set<string>): PlacedBlock {
  const baseId = `blk_${p.x}_${p.y}_${p.z}`;
  let id = existing?.id ?? baseId;
  if (!existing && occupiedIds) {
    let suffix = 1;
    while (occupiedIds.has(id)) id = `${baseId}:${suffix++}`;
    occupiedIds.add(id);
  }
  return { id, position: { ...p }, ...pConfig };
}
function sameBlock(a: PlacedBlock | undefined, b: PlacedBlock): boolean {
  if (!a || a.id !== b.id || a.blockDefId !== b.blockDefId || a.rotation !== b.rotation
    || a.position.x !== b.position.x || a.position.y !== b.position.y || a.position.z !== b.position.z) return false;
  for (const key of APPEARANCE) if (a[key] !== b[key]) return false;
  if (Boolean(a.customScale) !== Boolean(b.customScale)) return false;
  return !a.customScale || (['x', 'y', 'z'] as const).every(axis => a.customScale![axis] === b.customScale![axis]);
}
function eachCell(bounds: { min: GridCoord; max: GridCoord }, visit: (position: GridCoord) => void): void {
  for (let y = bounds.min.y; y <= bounds.max.y; y++) for (let z = bounds.min.z; z <= bounds.max.z; z++) for (let x = bounds.min.x; x <= bounds.max.x; x++) visit({ x, y, z });
}
function propose(document: StudioDocument, action: Exclude<StudioAction, { type: 'undo' | 'redo' }>): { document: StudioDocument; affectedCount: number; label: string } {
  const blocks = document.blocks;
  if (action.type === 'erase') {
    const key = cellKey(action.position);
    if (!Object.hasOwn(blocks, key)) return { document, affectedCount: 0, label: 'Erase block' };
    const next = { ...blocks }; delete next[key];
    return { document: validated({ ...document, blocks: next }), affectedCount: 1, label: 'Erase block' };
  }
  if (action.type === 'paint') {
    const key = cellKey(action.position), previous = blocks[key];
    // Validate appearance even when the selected slot is empty; bad requests are not no-ops.
    const probeDefinition = Object.values(document.customBlocks)[0] ?? DEFAULT_BLOCK_DEFINITIONS[0];
    const probe: PlacedBlock = { id: 'paint_probe', blockDefId: probeDefinition.id, position: { x: 0, y: 0, z: 0 }, rotation: 0 };
    for (const field of APPEARANCE) if (Object.hasOwn(action.appearance, field) && action.appearance[field] !== null) probe[field] = action.appearance[field] as never;
    if (Object.keys(action.appearance).length) validated({ ...document, customBlocks: { ...document.customBlocks, [probeDefinition.id]: probeDefinition }, blocks: { '0,0,0': probe } });
    if (!previous) return { document, affectedCount: 0, label: 'Paint block' };
    const next = { ...previous };
    for (const field of APPEARANCE) if (Object.hasOwn(action.appearance, field)) {
      if (action.appearance[field] === null) delete next[field]; else next[field] = action.appearance[field] as never;
    }
    if (sameBlock(previous, next)) return { document, affectedCount: 0, label: 'Paint block' };
    return { document: validated({ ...document, blocks: { ...blocks, [key]: next } }), affectedCount: 1, label: 'Paint block' };
  }
  const first = action.type === 'place' ? action.position : action.bounds.min;
  // Reuse the complete schema before dense enumeration, including definition references/material/scale.
  validated({ ...document, blocks: { [cellKey(first)]: blockAt(first, action.placement) } });
  let additions = 0;
  const capacity = STUDIO_DOCUMENT_LIMITS.maxBlocks - Object.keys(blocks).length;
  const visit = (fn: (p: GridCoord) => void) => action.type === 'place' ? fn(action.position) : eachCell(action.bounds, fn);
  visit(p => { if (!Object.hasOwn(blocks, cellKey(p)) && ++additions > capacity) reject('invalid-document', 'The result would exceed the total document block limit.'); });
  const next = { ...blocks };
  const occupiedIds = new Set(Object.values(blocks).map(block => block.id));
  let affectedCount = 0;
  visit(p => {
    const key = cellKey(p), previous = blocks[key], block = blockAt(p, action.placement, previous, occupiedIds);
    if (!sameBlock(previous, block)) { next[key] = block; affectedCount++; }
  });
  return { document: affectedCount ? validated({ ...document, blocks: next }) : document, affectedCount, label: action.type === 'place' ? 'Place block' : 'Fill region' };
}

/** Pure proposal/validation/commit: no effects, storage, arbitrary replacement or target transition. */
export function applyStudioAction(state: StudioActionState, expected: StudioActionToken, action: StudioAction): StudioActionResult {
  try {
    const request = parseAction(action);
    const basis = token(expected, 'invalid-action');
    const { document, current } = validateState(state);
    if (!sameSession(current, basis) || current.editRevision !== basis.editRevision) reject('stale-action', 'The document, live revision, session or history epoch changed. Recompute the action.');
    let nextDocument: StudioDocument, label: string, historyLabel: string, affectedCount = 0;
    // Copy even a structurally valid caller-provided history container before freezing the
    // result. No input object becomes frozen as a side effect of applying an action.
    const copyEntry = (entry: StudioActionHistoryEntry): StudioActionHistoryEntry => ({ ...entry, source: { ...entry.source } });
    const undo = state.undoStack.map(copyEntry), redo = state.redoStack.map(copyEntry);
    if (request.type === 'undo' || request.type === 'redo') {
      const from = request.type === 'undo' ? undo : redo, to = request.type === 'undo' ? redo : undo;
      const target = from.pop();
      if (!target) reject('history-unavailable', `Nothing to ${request.type}.`);
      // Undo authored values, never rewind durable CAS identity or its saved timestamp.
      nextDocument = restoreAuthored(target.authoredJson, document);
      label = `${request.type === 'undo' ? 'Undo' : 'Redo'} ${target.label}`;
      historyLabel = target.label;
      const immediate = snapshot(document, current, target.label);
      to.push(immediate); trimHistory(undo, redo, immediate, state.historyBudget);
      affectedCount = Object.keys(nextDocument.blocks).filter(key => !sameBlock(document.blocks[key], nextDocument.blocks[key])).length
        + Object.keys(document.blocks).filter(key => !Object.hasOwn(nextDocument.blocks, key)).length;
    } else {
      const proposal = propose(document, request);
      if (proposal.affectedCount === 0) return { status: 'noop', state, token: current, affectedCount: 0 };
      nextDocument = proposal.document; label = proposal.label; affectedCount = proposal.affectedCount;
      historyLabel = label;
      const immediate = snapshot(document, current, label);
      undo.push(immediate); redo.length = 0; trimHistory(undo, redo, immediate, state.historyBudget);
    }
    if (state.editRevision === Number.MAX_SAFE_INTEGER) reject('revision-limit', 'The live revision limit was reached; create a new session through the recovery workflow.');
    // The result must also fit as the recoverable predecessor of a future Undo/Redo.
    // Otherwise a small-to-large edit could succeed but its first Undo would be impossible.
    const futureToken = Object.freeze({ ...current, editRevision: state.editRevision + 1 });
    if (entryBytes(snapshot(nextDocument, futureToken, historyLabel)) > state.historyBudget.maxBytes) reject('history-limit', 'The resulting document cannot support recoverable history within this budget; the edit was not applied.');
    const next = deepFreeze({ ...state, document: nextDocument, editRevision: state.editRevision + 1,
      undoStack: undo, redoStack: redo, historyBudget: { ...state.historyBudget } });
    return { status: 'applied', state: next, token: getStudioActionToken(next), affectedCount, label };
  } catch (error) { return { status: 'rejected', state, error: failure(error) }; }
}
