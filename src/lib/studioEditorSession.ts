import { samePolicyEnvelope } from './studioTargetPolicy';
import { captureStudioHistoryDelta, applyStudioHistoryDelta } from './studioHistoryDelta';
/**
 * Synchronous Freeform editing authority. App adapters must route every authored
 * mutation here before claiming shared-boundary coverage; this is not a game lock.
 * StudioDocument remains the schema authority. Opaque extensions remain data.
 * History owns authored content plus selection/clipboard, never durable revisions.
 * Legacy engine history is discarded: the controller is the only history owner.
 * Callbacks are trusted synchronous application code, not a script sandbox.
 * Async functions/returned thenables are rejected; scheduling future work inside
 * an ordinary callback is outside this contract and requires an explicit token.
 */
import { createStudioId, STUDIO_DOCUMENT_LIMITS, validateStudioDocument, type StudioDocument } from './studioDocument';
import { STUDIO_ACTION_LIMITS, type StudioActionToken } from '../engine/studioActions';
import type { WorldEditEngineState } from '../engine/types';

export type StudioEditorToken = StudioActionToken;
export type StudioAuthoredKey = 'world' | 'blocks' | 'customBlocks' | 'blueprints' | 'chunkConfig' | 'patternConfig' | 'lightingConfig' | 'extensions';
export type StudioWorkspace = Pick<WorldEditEngineState, 'pos1' | 'pos2' | 'clipboard' | 'clipboardCustomDefs'>;
export interface StudioEditorSnapshot {
  readonly document: StudioDocument;
  readonly workspace: StudioWorkspace;
  readonly sessionId: string;
  readonly editRevision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly lastError: string | null;
  readonly writable: boolean;
  readonly exclusive: boolean;
}
export interface StudioEditorResult { readonly status: 'applied' | 'noop' | 'rejected'; readonly message?: string }
export interface StudioHistoryBudget { readonly maxEntries: number; readonly maxBytes: number }
export interface StudioHistoryUsage extends StudioHistoryBudget { readonly undoEntries: number; readonly redoEntries: number; readonly retainedBytes: number }
/** Opaque identity: only the identical handle returned by this session releases it. */
export interface StudioExclusiveHandle { readonly sessionId: string; readonly lockId: string }
type Update<T> = T | ((previous: T) => T);
type Frame = { readonly payload: string; readonly label: string; readonly bytes: number };
type Batch = { document: StudioDocument; workspace: StudioWorkspace; effects: (() => void)[]; failure: string | null };
const AUTHORED: readonly StudioAuthoredKey[] = ['world', 'blocks', 'customBlocks', 'blueprints', 'chunkConfig', 'patternConfig', 'lightingConfig', 'extensions'];
const ENGINE_KEYS = ['blocks', 'customBlocks', 'pos1', 'pos2', 'clipboard', 'clipboardCustomDefs', 'undoStack', 'redoStack'];
const EMPTY_WORKSPACE: StudioWorkspace = Object.freeze({ pos1: null, pos2: null, clipboard: Object.freeze([]), clipboardCustomDefs: Object.freeze([]) }) as unknown as StudioWorkspace;
const noop = (): StudioEditorResult => ({ status: 'noop' });
function message(error: unknown): string { return error instanceof Error ? error.message : 'The edit could not be safely applied.'; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
/** Descriptor-only clone: reject accessors before reading them, with bounded traversal. */
function cloneData<T>(value: T): T {
  let nodes = 0, characters = 0;
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number, inArray = false): unknown => {
    if (++nodes > STUDIO_DOCUMENT_LIMITS.maxNodes || depth > STUDIO_DOCUMENT_LIMITS.maxDepth) throw new Error('Edit data exceeds nesting or node limits.');
    if (input === undefined && !inArray) return undefined;
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string') {
      characters += input.length;
      if (characters > STUDIO_DOCUMENT_LIMITS.maxBytes) throw new Error('Edit text exceeds the document limit.');
      return input;
    }
    if (!input || typeof input !== 'object') throw new Error('Edits must contain finite JSON data.');
    const array = Array.isArray(input);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Edits must contain plain data objects.');
    if (ancestors.has(input)) throw new Error('Cyclic edit data is unsupported.');
    const keys = Reflect.ownKeys(input);
    if (keys.length > STUDIO_DOCUMENT_LIMITS.maxNodes - nodes) throw new Error('Edit data exceeds the node limit.');
    if (array && keys.length !== input.length + 1) throw new Error('Sparse or decorated arrays are unsupported.');
    ancestors.add(input);
    const output: any = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsupported edit data key.');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length)) throw new Error('Decorated arrays are unsupported.');
      const property = Object.getOwnPropertyDescriptor(input, key)!;
      if (!property.enumerable || !('value' in property)) throw new Error('Edit accessors and non-enumerable fields are unsupported.');
      characters += key.length;
      if (characters > STUDIO_DOCUMENT_LIMITS.maxBytes) throw new Error('Edit text exceeds the document limit.');
      const item = visit(property.value, depth + 1, array);
      if (item !== undefined) output[key] = item;
    }
    ancestors.delete(input);
    return output;
  };
  return freeze(visit(value, 0) as T);
}
function validateDocument(value: unknown): StudioDocument {
  const result = validateStudioDocument(value);
  if (!result.ok) throw new Error(result.error.message);
  return freeze(result.value);
}
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
function authored(document: StudioDocument): Pick<StudioDocument, StudioAuthoredKey> {
  const output = {} as Pick<StudioDocument, StudioAuthoredKey>;
  for (const key of AUTHORED) if (Object.hasOwn(document, key)) (output as any)[key] = document[key];
  return output;
}
function restoreAuthored(current: StudioDocument, value: Pick<StudioDocument, StudioAuthoredKey>): StudioDocument {
  return { format: current.format, schemaVersion: current.schemaVersion, documentId: current.documentId,
    revision: current.revision, historyEpoch: current.historyEpoch, savedAt: current.savedAt,
    ...(current.targetPolicy ? { targetPolicy: current.targetPolicy } : {}), ...value };
}
function validateWorkspace(workspace: StudioWorkspace, document: StudioDocument): StudioWorkspace {
  for (const pos of [workspace.pos1, workspace.pos2]) {
    if (pos !== null && (!pos || typeof pos !== 'object' || Object.keys(pos).length !== 3 || !(['x', 'y', 'z'] as const).every(k => Object.hasOwn(pos, k) && typeof pos[k] === 'number' && Number.isFinite(pos[k]) && Math.abs(pos[k]) <= STUDIO_DOCUMENT_LIMITS.maxCoordinate))) throw new Error('Selection anchors must be finite bounded coordinates.');
  }
  if (!Array.isArray(workspace.clipboard) || workspace.clipboard.length > STUDIO_DOCUMENT_LIMITS.maxBlocks || !Array.isArray(workspace.clipboardCustomDefs) || workspace.clipboardCustomDefs.length > STUDIO_DOCUMENT_LIMITS.maxDefinitions) throw new Error('Clipboard exceeds its bounded capacity.');
  const defs: WorldEditEngineState['customBlocks'] = Object.create(null), ids = new Set<string>();
  for (const def of workspace.clipboardCustomDefs) {
    if (!def || typeof def.id !== 'string' || ids.has(def.id)) throw new Error('Clipboard definitions must have unique IDs.');
    ids.add(def.id); defs[def.id] = def;
  }
  const blocks: WorldEditEngineState['blocks'] = Object.create(null);
  for (const block of workspace.clipboard) {
    if (!block?.position) throw new Error('Invalid clipboard block.');
    const key = `${Math.round(block.position.x)},${Math.round(block.position.y)},${Math.round(block.position.z)}`;
    if (Object.hasOwn(blocks, key)) throw new Error('Clipboard contains duplicate anchors.');
    blocks[key] = block;
    if (!Object.hasOwn(defs, block.blockDefId) && Object.hasOwn(document.customBlocks, block.blockDefId)) defs[block.blockDefId] = document.customBlocks[block.blockDefId];
  }
  // Reuse the complete block/definition schema instead of maintaining a second one.
  validateDocument({ ...document, customBlocks: defs, blocks, blueprints: [] });
  return workspace;
}
/** Read-only reuse for detached plain-data proposals; never an import or commit authority. */
export { validateWorkspace as validateStudioWorkspace };
function isAsync(fn: unknown): boolean { return typeof fn === 'function' && Object.prototype.toString.call(fn) === '[object AsyncFunction]'; }
function assertSyncResult(value: unknown): void {
  if (value && (typeof value === 'object' || typeof value === 'function')) {
    // Do not execute user-defined `then` accessors.
    let object = value, depth = 0;
    while (object && object !== Object.prototype) {
      if (++depth > STUDIO_DOCUMENT_LIMITS.maxDepth) throw new Error('Unsupported callback return prototype chain.');
      if (Object.getOwnPropertyDescriptor(object, 'then')) {
        // Drain native Promise rejection without invoking a supplied `then` getter.
        // This does not cancel already scheduled work or sandbox callback code.
        try { Promise.prototype.then.call(value, () => undefined, () => undefined); } catch { /* Non-Promise thenable. */ }
        throw new Error('Asynchronous edits are unsupported; resolve work before opening a transaction.');
      }
      object = Object.getPrototypeOf(object);
    }
  }
}
function readToken(value: StudioEditorToken): StudioEditorToken {
  const fields = ['documentId', 'historyEpoch', 'sessionId', 'editRevision'];
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== fields.length) throw new Error('Invalid edit identity.');
  for (const field of fields) {
    const property = Object.getOwnPropertyDescriptor(value, field);
    if (!property?.enumerable || !('value' in property)) throw new Error('Invalid edit identity.');
    if (field === 'editRevision') {
      if (!Number.isSafeInteger(property.value) || property.value < 0) throw new Error('Invalid edit revision.');
    } else if (typeof property.value !== 'string' || property.value.length < 1 || property.value.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(property.value)) throw new Error('Invalid edit identity.');
  }
  return cloneData(value);
}

export class StudioEditorSession {
  private snapshot: StudioEditorSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly limits: StudioHistoryBudget;
  private undoFrames: Frame[] = [];
  private redoFrames: Frame[] = [];
  private batch: Batch | null = null;
  private lock: StudioExclusiveHandle | null = null;
  private engineCache: WorldEditEngineState | null = null;
  private phase: 'idle' | 'notifying' | 'effects' | 'updater' = 'idle';

  constructor(document: StudioDocument, historyBudget: StudioHistoryBudget = {
    maxEntries: STUDIO_ACTION_LIMITS.maxHistoryEntries, maxBytes: STUDIO_ACTION_LIMITS.maxHistoryBytes,
  }) {
    const limits = cloneData(historyBudget);
    if (Object.keys(limits).length !== 2 || !Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1 || limits.maxEntries > STUDIO_ACTION_LIMITS.maxHistoryEntries || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > STUDIO_ACTION_LIMITS.maxHistoryBytes) throw new Error('Invalid history budget.');
    this.limits = limits;
    this.snapshot = Object.freeze({ document: validateDocument(document), workspace: EMPTY_WORKSPACE,
      sessionId: createStudioId('session'), editRevision: 0, canUndo: false, canRedo: false, lastError: null, writable: false, exclusive: false });
  }
  getSnapshot = (): StudioEditorSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getDocument = (): StudioDocument => this.batch?.document ?? this.snapshot.document;
  getToken = (): StudioEditorToken => Object.freeze({ documentId: this.snapshot.document.documentId,
    historyEpoch: this.snapshot.document.historyEpoch, sessionId: this.snapshot.sessionId, editRevision: this.snapshot.editRevision });
  getHistoryUsage = (): StudioHistoryUsage => Object.freeze({ undoEntries: this.undoFrames.length, redoEntries: this.redoFrames.length,
    retainedBytes: [...this.undoFrames, ...this.redoFrames].reduce((sum, frame) => sum + frame.bytes, 0),
    maxEntries: this.limits.maxEntries, maxBytes: this.limits.maxBytes });
  getEngineState = (): WorldEditEngineState => {
    const document = this.getDocument(), workspace = this.batch?.workspace ?? this.snapshot.workspace;
    if (!this.batch && this.engineCache) return this.engineCache;
    const engine = Object.freeze({ blocks: document.blocks, customBlocks: document.customBlocks, ...workspace,
      undoStack: Object.freeze([]), redoStack: Object.freeze([]) }) as unknown as WorldEditEngineState;
    if (!this.batch) this.engineCache = engine;
    return engine;
  };
  private publish = (patch: Partial<StudioEditorSnapshot>): void => {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch }); this.engineCache = null;
    // A consumer's broken listener must not roll back an already published edit.
    const previousPhase = this.phase;
    this.phase = 'notifying';
    try { for (const listener of [...this.listeners]) { try { listener(); } catch { /* Subscriber owns its rendering failure. */ } } }
    finally { this.phase = previousPhase; }
  };
  private denied = (reason: string): StudioEditorResult => {
    if (this.batch) this.batch.failure ??= reason;
    else if (this.phase === 'idle' && this.snapshot.lastError !== reason) this.publish({ lastError: reason });
    return { status: 'rejected', message: reason };
  };
  private gate = (expected?: StudioEditorToken): string | null => {
    if (this.phase !== 'idle') return 'Reentrant mutation during notification, effects or an updater is unsupported.';
    if (!this.snapshot.writable) return 'Editing is unavailable until project recovery is ready.';
    if (this.lock) return 'Project replacement is in progress; editing is temporarily unavailable.';
    if (expected !== undefined) {
      try {
        const token = readToken(expected), current = this.getToken();
        if (!sameData(token, current)) return 'The edit belongs to an older project, session or revision.';
      } catch { return 'Invalid edit identity.'; }
    }
    return this.batch?.failure ?? null;
  };
  private frame = (before: StudioEditorSnapshot, document: StudioDocument, workspace: StudioWorkspace, label: string): Frame => {
    // Retain both directions once. This bounds encoded changes, not project size
    // or JavaScript heap usage. Complete state still validates on every restore.
    return { ...captureStudioHistoryDelta({ authored: authored(before.document), workspace: before.workspace },
      { authored: authored(document), workspace }, label, this.limits.maxBytes), label };
  };
  private trim = (undo: Frame[], redo: Frame[], protectedFrame: Frame): void => {
    const size = () => [...undo, ...redo].reduce((sum, frame) => sum + frame.bytes, 0);
    while (undo.length + redo.length > this.limits.maxEntries || size() > this.limits.maxBytes) {
      if (undo.length && undo[0] !== protectedFrame) undo.shift();
      else if (redo.length && redo[0] !== protectedFrame) redo.shift();
      else throw new Error('The immediate recoverable predecessor cannot fit the history budget.');
    }
  };
  private nextRevision = (): number => {
    if (this.snapshot.editRevision >= Number.MAX_SAFE_INTEGER) throw new Error('The live edit counter is exhausted; reopen a verified project copy.');
    return this.snapshot.editRevision + 1;
  };
  transaction = (label: string, callback: () => void, expected?: StudioEditorToken): StudioEditorResult => {
    const denied = this.gate(expected);
    if (denied) return this.denied(denied);
    if (typeof label !== 'string' || label.length < 1 || label.length > 80 || typeof callback !== 'function' || isAsync(callback)) return this.denied('Transactions require a short label and a synchronous callback.');
    if (this.batch) {
      try { assertSyncResult(callback()); } catch (error) { return this.denied(message(error)); }
      return this.batch.failure ? { status: 'rejected', message: this.batch.failure } : noop();
    }
    const before = this.snapshot;
    const batch: Batch = { document: before.document, workspace: before.workspace, effects: [], failure: null };
    this.batch = batch;
    let result: StudioEditorResult;
    let patch: Partial<StudioEditorSnapshot> | null = null;
    try {
      assertSyncResult(callback());
      if (batch.failure) throw new Error(batch.failure);
      if (!this.snapshot.writable || this.lock) throw new Error('Edit authority changed during the transaction.');
      const document = validateDocument(batch.document), workspace = validateWorkspace(batch.workspace, document);
      const sameDocument = sameData(document, before.document), sameWorkspace = sameData(workspace, before.workspace);
      if (sameDocument && sameWorkspace) result = noop();
      else {
        const revision = this.nextRevision();
        const predecessor = this.frame(before, document, workspace, label);
        const undo = [...this.undoFrames, predecessor], redo: Frame[] = [];
        this.trim(undo, redo, predecessor);
        this.undoFrames = undo; this.redoFrames = redo;
        patch = { document: sameDocument ? before.document : document, workspace: sameWorkspace ? before.workspace : workspace,
          editRevision: revision, canUndo: true, canRedo: false, lastError: null };
        result = { status: 'applied' };
      }
    } catch (error) { result = { status: 'rejected', message: message(error) }; }
    this.batch = null;
    if (patch) this.publish(patch);
    if (result.status === 'rejected') return this.denied(result.message!);
    if (result.status === 'applied') {
      const errors: string[] = [];
      this.phase = 'effects';
      try { for (const effect of batch.effects) { try { assertSyncResult(effect()); } catch (error) { errors.push(message(error)); } } }
      finally { this.phase = 'idle'; }
      if (errors.length) {
        const error = `Edit applied, but a post-commit effect failed: ${errors.join('; ')}`;
        this.publish({ lastError: error }); return { status: 'applied', message: error };
      }
    }
    return result;
  };
  private set = (label: string, apply: () => void): StudioEditorResult => {
    if (!this.batch) return this.transaction(label, apply);
    const denied = this.gate();
    if (denied) return this.denied(denied);
    try { apply(); return noop(); } catch (error) { return this.denied(message(error)); }
  };
  private invokeUpdate = <T>(value: Update<T>, previous: T): T => {
    if (isAsync(value)) throw new Error('Asynchronous setters are unsupported.');
    let output: T;
    this.phase = 'updater';
    try { output = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value; }
    finally { this.phase = 'idle'; }
    assertSyncResult(output);
    return output;
  };
  private update = <T>(value: Update<T>, previous: T): T => cloneData(this.invokeUpdate(value, previous));
  setEngineState = (value: Update<WorldEditEngineState>): StudioEditorResult => this.set('Edit world', () => {
    const raw = this.invokeUpdate(value, this.getEngineState());
    if (!raw || typeof raw !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) || Reflect.ownKeys(raw).length !== ENGINE_KEYS.length || !ENGINE_KEYS.every(key => Object.hasOwn(raw, key))) throw new Error('Unsupported engine state fields.');
    const data: Record<string, unknown> = {};
    for (const key of ENGINE_KEYS) {
      const property = Object.getOwnPropertyDescriptor(raw, key)!;
      if (!property.enumerable || !('value' in property)) throw new Error('Engine accessors are unsupported.');
      if (key === 'undoStack' || key === 'redoStack') {
        if (!Array.isArray(property.value)) throw new Error('Invalid legacy engine history.');
      } else data[key] = property.value;
    }
    if (Array.isArray(data.clipboard) && data.clipboard.length > STUDIO_DOCUMENT_LIMITS.maxBlocks) throw new Error('Clipboard exceeds its bounded capacity.');
    if (Array.isArray(data.clipboardCustomDefs) && data.clipboardCustomDefs.length > STUDIO_DOCUMENT_LIMITS.maxDefinitions) throw new Error('Clipboard definitions exceed their bounded capacity.');
    const next = cloneData(data) as unknown as Omit<WorldEditEngineState, 'undoStack' | 'redoStack'>;
    // Legacy stacks are temporary adapter output. Never import their undo authority.
    this.batch!.document = Object.freeze({ ...this.batch!.document, blocks: next.blocks, customBlocks: next.customBlocks });
    this.batch!.workspace = Object.freeze({ pos1: next.pos1, pos2: next.pos2, clipboard: next.clipboard, clipboardCustomDefs: next.clipboardCustomDefs });
  });
  setDocumentField = <K extends StudioAuthoredKey>(key: K, value: Update<StudioDocument[K]>): StudioEditorResult => this.set(`Edit ${String(key)}`, () => {
    if (!AUTHORED.includes(key)) throw new Error('Only authored document fields can be edited.');
    const next = this.update(value, this.batch!.document[key]);
    const document = { ...this.batch!.document };
    if (next === undefined && ['lightingConfig', 'extensions'].includes(key)) delete document[key];
    else (document as any)[key] = next;
    this.batch!.document = Object.freeze(document);
  });
  setWorldField = <K extends keyof StudioDocument['world']>(key: K, value: Update<StudioDocument['world'][K]>): StudioEditorResult => this.set(`Edit ${String(key)}`, () => {
    if (!['worldId', 'worldName', 'roomCode', 'isPublicWorld', 'description'].includes(key)) throw new Error('Unsupported world field.');
    const next = this.update(value, this.batch!.document.world[key]);
    const world = { ...this.batch!.document.world };
    if (key === 'description' && next === undefined) delete world.description;
    else (world as any)[key] = next;
    this.batch!.document = Object.freeze({ ...this.batch!.document, world: Object.freeze(world) });
  });
  afterCommit = (effect: () => void): void => {
    if (this.phase !== 'idle') { this.reject('Reentrant post-commit effects are unsupported.'); return; }
    if (typeof effect !== 'function' || isAsync(effect)) { this.reject('Post-commit effects must be synchronous functions.'); return; }
    if (this.batch) this.batch.effects.push(effect);
    else {
      let error: string | null = null;
      this.phase = 'effects';
      try { assertSyncResult(effect()); } catch (caught) { error = message(caught); }
      finally { this.phase = 'idle'; }
      if (error) this.denied(error);
    }
  };
  reject = (reason: string): StudioEditorResult => this.denied(typeof reason === 'string' && reason.length ? reason : 'Edit rejected.');
  private moveHistory = (direction: 'undo' | 'redo', expected?: StudioEditorToken): StudioEditorResult => {
    if (this.batch) return this.denied('Undo and redo cannot run inside an edit transaction.');
    const denied = this.gate(expected);
    if (denied) return this.denied(denied);
    const source = direction === 'undo' ? this.undoFrames : this.redoFrames;
    if (!source.length) return noop();
    try {
      const target = source[source.length - 1], parsed = applyStudioHistoryDelta({ authored: authored(this.snapshot.document), workspace: this.snapshot.workspace }, target.payload, direction);
      const document = validateDocument(restoreAuthored(this.snapshot.document, parsed.authored));
      const workspace = freeze(validateWorkspace(cloneData(parsed.workspace), document));
      const undo = [...this.undoFrames], redo = [...this.redoFrames];
      if (direction === 'undo') { undo.pop(); redo.push(target); } else { redo.pop(); undo.push(target); }
      this.trim(undo, redo, target);
      const revision = this.nextRevision();
      this.undoFrames = undo; this.redoFrames = redo;
      this.publish({ document: sameData(document, this.snapshot.document) ? this.snapshot.document : document,
        workspace: sameData(workspace, this.snapshot.workspace) ? this.snapshot.workspace : workspace,
        editRevision: revision, canUndo: undo.length > 0, canRedo: redo.length > 0, lastError: null });
      return { status: 'applied' };
    } catch (error) { return this.denied(message(error)); }
  };
  undo = (expected?: StudioEditorToken): StudioEditorResult => this.moveHistory('undo', expected);
  redo = (expected?: StudioEditorToken): StudioEditorResult => this.moveHistory('redo', expected);
  setWritable = (writable: boolean): void => {
    if (this.phase !== 'idle') { this.reject('Reentrant authority changes are unsupported.'); return; }
    if (typeof writable !== 'boolean') { this.reject('Writable state must be a boolean.'); return; }
    if (this.batch) this.batch.failure ??= 'Edit authority changed during the transaction.';
    if (writable !== this.snapshot.writable) this.publish({ writable });
  };
  beginExclusive = (): StudioExclusiveHandle | null => {
    if (this.phase !== 'idle') { this.reject('Reentrant project replacement is unsupported.'); return null; }
    if (this.batch) { this.reject('Project replacement cannot start inside an edit transaction.'); return null; }
    if (this.lock) return null;
    this.lock = Object.freeze({ sessionId: this.snapshot.sessionId, lockId: createStudioId('lock') });
    this.publish({ exclusive: true }); return this.lock;
  };
  endExclusive = (handle: StudioExclusiveHandle): boolean => {
    if (this.phase !== 'idle' || this.batch) { this.reject('Reentrant exclusion release is unsupported.'); return false; }
    if (!this.lock || handle !== this.lock) return false;
    this.lock = null; this.publish({ exclusive: false }); return true;
  };
  /** Trusted persistence activation only; callers must verify durable installation first. */
  installVerifiedDocument = (value: StudioDocument): StudioEditorResult => {
    if (this.phase !== 'idle') return this.denied('Reentrant project installation is unsupported.');
    if (this.batch) return this.denied('Project installation cannot run inside an edit transaction.');
    if (!this.lock && this.snapshot.writable) return this.denied('Verified project installation requires exclusive or nonwritable authority.');
    try {
      const document = validateDocument(value), sessionId = createStudioId('session');
      const revision = this.nextRevision();
      this.undoFrames = []; this.redoFrames = [];
      this.publish({ document, workspace: EMPTY_WORKSPACE, sessionId, editRevision: revision, canUndo: false, canRedo: false, lastError: null });
      return { status: 'applied' };
    } catch (error) { return this.denied(message(error)); }
  };
  /**
   * Trusted successful-store receipt. `expected` is captured with the saved content.
   * Edits made while saving remain authoritative; only the durable envelope advances.
   * A receipt proves persistence externally, not by calling this method.
   */
  acknowledgeDurable = (value: StudioDocument, expected: StudioEditorToken): StudioEditorResult => {
    if (this.phase !== 'idle' || this.batch) return this.denied('Durable acknowledgement cannot run inside another operation.');
    try {
      const saved = validateDocument(value), token = readToken(expected), current = this.getToken();
      if (token.documentId !== current.documentId || token.historyEpoch !== current.historyEpoch || token.sessionId !== current.sessionId || token.editRevision > current.editRevision || saved.documentId !== current.documentId || saved.historyEpoch !== current.historyEpoch) throw new Error('The save receipt belongs to another project, session or revision.');
      const previous = this.snapshot.document;
      if (!samePolicyEnvelope(previous, saved)) throw new Error('A save receipt cannot change the target policy.');
      if (saved.revision < previous.revision) throw new Error('The save receipt is older than the acknowledged durable revision.');
      if (saved.revision === previous.revision) {
        if (saved.savedAt !== previous.savedAt) throw new Error('Conflicting save receipts share a durable revision.');
        return noop();
      }
      this.publish({ document: Object.freeze({ ...previous, revision: saved.revision, savedAt: saved.savedAt }) });
      return { status: 'applied' };
    } catch (error) { return this.denied(message(error)); }
  };
}
