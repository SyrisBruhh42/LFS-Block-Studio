import {
  createStudioId, parseStudioDocument, STUDIO_DOCUMENT_LIMITS, validateStudioDocument,
  type DocumentIssue, type StudioDocument,
} from './studioDocument';
import { assertCompatiblePolicyTransition, samePolicyEnvelope } from './studioTargetPolicy';

export const STUDIO_DOCUMENT_DB = 'lfs_studio_documents_v1';
const VERSION = 1;
const META = 'metadata';
const REVISIONS = 'revisions';
const CANDIDATES = 'candidates';
export type StorageErrorCode = 'unavailable' | 'blocked' | 'quota' | 'aborted' | 'conflict' | 'stale-source' | 'not-found' | 'invalid-document' | 'unsupported-schema' | 'size-limit' | 'corrupt-storage' | 'storage-error';
export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: { code: StorageErrorCode; message: string; issues?: DocumentIssue[] } };
export interface ActiveDocumentToken { documentId: string; revision: number; activationId: string }
export interface ActiveStudioDocument { document: StudioDocument; token: ActiveDocumentToken }
export interface LegacyDocumentSource { sourceId: string; raw: string }
export type CandidateState = 'staged' | 'verified' | 'promoted';
export interface StudioDocumentCandidate {
  candidateId: string; document: StudioDocument; legacySources: LegacyDocumentSource[];
  state: CandidateState; createdAt: string;
}
export interface CandidateSummary {
  candidateId: string; documentId: string; revision: number; worldName: string;
  state: CandidateState; createdAt: string;
}
export interface RevisionSummary { documentId: string; revision: number; savedAt: string; worldName: string }
export interface StoreOperationOptions { signal?: AbortSignal }
export type RecoveryRecordRef = { kind: 'active' } | { kind: 'revision' | 'candidate'; key: IDBValidKey };
export interface RecoveryRecordSummary { ref: Exclude<RecoveryRecordRef, { kind: 'active' }>; label: string }
export interface RecoveryRecordPage { items: RecoveryRecordSummary[]; nextCursor: IDBValidKey | null }
export interface RawRecoveryRecord {
  ref: RecoveryRecordRef;
  resolvedRef?: Exclude<RecoveryRecordRef, { kind: 'active' }>;
  /** Re-encoded IndexedDB envelope, not claimed to be original transport bytes. */
  envelopeJson: string | null;
  activePointerJson?: string;
  /** Stored text, or losslessly decoded known UTF-8 text, even when schema validation fails. */
  json: string | null;
  /** Exact supported-size binary JSON field, including damaged/unknown encodings. */
  encodedDocumentBytes?: Uint8Array;
  sources: LegacyDocumentSource[];
  /** Blob UTF-8 encoding would replace these damaged UTF-16 text parts. */
  unsafeTextParts: string[];
  issues: string[];
  document?: StudioDocument;
  checkpoint?: RecoveryRecordRef;
}
export const RECOVERY_READ_LIMITS = { pageSize: 25, maxPageSize: 50, maxKeyBytes: 4096, maxPageKeyBytes: 64 * 1024, maxEnvelopeBytes: 64 * 1024 * 1024, maxNodes: 200_000, maxDepth: 32 } as const;
export interface PolicyTransitionOptions extends StoreOperationOptions {
  /** Trusted synchronous live-session guard; checked again inside the final transaction. */
  isSourceCurrent?: () => boolean;
}
interface StoredRevision { documentId: string; revision: number; json: string }
interface StoredCandidate {
  candidateId: string; documentId: string; revision: number; worldName: string;
  json: string | Uint8Array; jsonEncoding?: 'utf8-json-v1'; legacySources: LegacyDocumentSource[]; state: CandidateState; createdAt: string;
}
const ok = <T>(value: T): StoreResult<T> => ({ ok: true, value });
const failed = <T = never>(code: StorageErrorCode, message: string): StoreResult<T> => ({ ok: false, error: { code, message } });
function storageFailure(error: unknown): StoreResult<never> {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'QuotaExceededError') return failed('quota', 'Browser storage is full. Work remains unsaved; keep the current project open and download a recovery copy.');
  if (name === 'AbortError') return failed('aborted', 'The storage transaction was aborted; the previous active revision remains unchanged.');
  if (name === 'ConstraintError') return failed('conflict', 'This document revision already exists. Reload or restore as a new project.');
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'VersionError') return failed('unavailable', 'Browser storage is unavailable or incompatible. No fallback write was claimed.');
  if (name === 'UnknownError' && error instanceof Error && /serialized keys and\/or value are too large/.test(error.message)) return failed('size-limit', 'The browser rejected an oversized storage record. The current project was retained; keep a project backup before retrying.');
  return failed('storage-error', 'Browser storage did not complete the operation. Preserve the current work and retry or export a recovery copy.');
}
/** Stored candidate encoding is separate from document schema and policy. */
function candidateJsonText(row: { json: unknown; jsonEncoding?: unknown }): StoreResult<string> {
  if (row.jsonEncoding === undefined) return typeof row.json === 'string' ? ok(row.json) : failed('corrupt-storage', 'Candidate document text is missing.');
  if (row.jsonEncoding !== 'utf8-json-v1') return failed('unsupported-schema', 'Candidate storage encoding is not supported. The record and originals were retained.');
  if (!(row.json instanceof Uint8Array)) return failed('corrupt-storage', 'Encoded candidate document is not a byte array.');
  if (row.json.byteLength > STUDIO_DOCUMENT_LIMITS.maxBytes) return failed('size-limit', 'Encoded candidate document exceeds the project byte limit.');
  try { return ok(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(row.json)); }
  catch { return failed('corrupt-storage', 'Encoded candidate document contains invalid UTF-8. Download the stored bytes for recovery.'); }
}
function originalSources(value: unknown): StoreResult<{ sources: LegacyDocumentSource[]; bytes: number }> {
  if (!Array.isArray(value) || value.length > 64 || Reflect.ownKeys(value).length !== value.length + 1) return failed('size-limit', 'Original-source lists require at most 64 undecorated entries.');
  const sources: LegacyDocumentSource[] = [], ids = new Set<string>(); let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry?.enumerable || !('value' in entry)) return failed('invalid-document', 'Original-source entries must be data values.');
    const source = entry.value;
    if (!source || typeof source !== 'object' || Array.isArray(source) || ![Object.prototype, null].includes(Object.getPrototypeOf(source)) || Reflect.ownKeys(source).length !== 2) return failed('invalid-document', 'Original sources require sourceId and raw text only.');
    const id = Object.getOwnPropertyDescriptor(source, 'sourceId'), raw = Object.getOwnPropertyDescriptor(source, 'raw');
    if (!id?.enumerable || !raw?.enumerable || !('value' in id) || !('value' in raw) || typeof id.value !== 'string' || !id.value.length || id.value.length > 512 || typeof raw.value !== 'string' || ids.has(id.value)) return failed('invalid-document', 'Original sources require unique source IDs and data text.');
    if (raw.value.length > STUDIO_DOCUMENT_LIMITS.maxBytes || (bytes += textBytes(raw.value)) > STUDIO_DOCUMENT_LIMITS.maxBytes) return failed('size-limit', 'Original recovery sources exceed the size limit.');
    ids.add(id.value); sources.push({ sourceId: id.value, raw: raw.value });
  }
  return ok({ sources, bytes });
}
/** Final transaction checks must bound damaged records before comparing them. */
function sameOriginalSources(value: unknown, expected: LegacyDocumentSource[]): boolean {
  const checked = originalSources(value);
  return checked.ok && checked.value.sources.length === expected.length && checked.value.sources.every((source, index) =>
    source.sourceId === expected[index].sourceId && source.raw === expected[index].raw);
}
function sameToken(left: ActiveDocumentToken | null | undefined, right: ActiveDocumentToken | null): boolean {
  if (!left || !right) return !left && !right;
  return left.documentId === right.documentId && left.revision === right.revision && left.activationId === right.activationId;
}
function validToken(value: unknown): value is ActiveDocumentToken {
  if (!value || typeof value !== 'object') return false;
  const t = value as ActiveDocumentToken;
  return typeof t.documentId === 'string' && typeof t.activationId === 'string' && t.activationId.length > 0 && Number.isSafeInteger(t.revision) && t.revision >= 0;
}

// Count without making a second full UTF-8 buffer. JSON mode includes escapes.
function textBytes(text: string, json = false): number {
  let bytes = json ? 2 : 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (json && (code === 34 || code === 92 || code < 32)) bytes += code < 32 && ![8, 9, 10, 12, 13].includes(code) ? 6 : 2;
    else if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += json && code >= 0xd800 && code <= 0xdfff ? 6 : 3;
  }
  return bytes;
}
function wellFormedText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function recoveryKeyBytes(key: IDBValidKey): number {
  let nodes = 0, bytes = 0;
  const visit = (value: IDBValidKey, depth: number): void => {
    if (++nodes > 128 || depth > 8) throw new Error('Recovery key structure exceeds its limit.');
    if (typeof value === 'string') {
      if (value.length > RECOVERY_READ_LIMITS.maxKeyBytes) throw new Error('Recovery key exceeds 4 KiB.');
      bytes += textBytes(value);
    } else if (typeof value === 'number' || value instanceof Date) bytes += 8;
    else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) bytes += value.byteLength;
    else if (Array.isArray(value)) { if (value.length > 128) throw new Error('Recovery key structure exceeds its limit.'); value.forEach(part => visit(part, depth + 1)); }
    else throw new Error('Unsupported recovery record key.');
    if (bytes > RECOVERY_READ_LIMITS.maxKeyBytes) throw new Error('Recovery key exceeds 4 KiB.');
  };
  visit(key, 0); return bytes;
}
/** No silent JSON coercion of malformed IndexedDB values, and no unbounded stringify. */
function recoveryEnvelope(value: unknown): string {
  let nodes = 0, bytes = 0;
  const seen = new Set<object>();
  const add = (amount: number) => { bytes += amount; if (bytes > RECOVERY_READ_LIMITS.maxEnvelopeBytes) throw new Error('Envelope exceeds the 64 MiB download limit; available text parts can still be downloaded separately.'); };
  const visit = (entry: unknown, depth: number): void => {
    if (++nodes > RECOVERY_READ_LIMITS.maxNodes || depth > RECOVERY_READ_LIMITS.maxDepth) throw new Error('Envelope exceeds recovery structure limits; available text parts remain separate.');
    if (typeof entry === 'string') { if (entry.length > RECOVERY_READ_LIMITS.maxEnvelopeBytes) throw new Error('Envelope text exceeds the recovery limit.'); add(textBytes(entry, true)); return; }
    if (entry === null || typeof entry === 'boolean') { add(entry === null ? 4 : entry ? 4 : 5); return; }
    if (typeof entry === 'number' && Number.isFinite(entry) && !Object.is(entry, -0)) { add(String(entry).length); return; }
    if (!entry || typeof entry !== 'object' || (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)) throw new Error('Envelope contains non-JSON values; it was not converted or silently omitted.');
    if (seen.has(entry)) throw new Error('Envelope contains a cycle; it was not changed.');
    seen.add(entry); add(2);
    if (Array.isArray(entry)) {
      if (entry.length > RECOVERY_READ_LIMITS.maxNodes) throw new Error('Envelope array exceeds the recovery limit.');
      if (Object.keys(entry).some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= entry.length)) throw new Error('Envelope array has extra properties that JSON would omit; it was not silently converted.');
      for (let i = 0; i < entry.length; i++) { if (i) add(1); visit(entry[i], depth + 1); }
    } else {
      const keys = Object.keys(entry);
      if (keys.length > RECOVERY_READ_LIMITS.maxNodes) throw new Error('Envelope object exceeds the recovery limit.');
      keys.forEach((key, i) => { if (i) add(1); add(textBytes(key, true) + 1); visit((entry as Record<string, unknown>)[key], depth + 1); });
    }
    seen.delete(entry);
  };
  visit(value, 0);
  return JSON.stringify(value);
}
/** Individual-source rescue also works when a binary field prevents a full JSON envelope. */
export function encodeStudioRecoverySourceEnvelope(source: LegacyDocumentSource): string {
  if (!source || typeof source.sourceId !== 'string' || source.sourceId.length > 512 || typeof source.raw !== 'string') throw new Error('Choose a preserved original source.');
  return recoveryEnvelope({ sourceId: source.sourceId, raw: source.raw });
}

/** Separate namespace; legacy keys and migration originals are never deleted by this store. */
export class StudioDocumentStore {
  private connection: IDBDatabase | null = null;
  private opening: Promise<StoreResult<IDBDatabase>> | null = null;
  private connectionGeneration = 0;
  private readonly factory: IDBFactory | undefined;
  readonly dbName: string;
  constructor(options: { indexedDB?: IDBFactory; dbName?: string } = {}) {
    this.factory = options.indexedDB ?? globalThis.indexedDB;
    this.dbName = options.dbName ?? STUDIO_DOCUMENT_DB;
  }
  close(): void { this.connectionGeneration++; this.connection?.close(); this.connection = null; }

  private open(): Promise<StoreResult<IDBDatabase>> {
    if (this.connection) return Promise.resolve(ok(this.connection));
    if (this.opening) return this.opening;
    if (!this.factory) return Promise.resolve(failed('unavailable', 'IndexedDB is unavailable; editing must not be reported as saved.'));
    const generation = this.connectionGeneration;
    this.opening = new Promise<StoreResult<IDBDatabase>>(resolve => {
      let settled = false;
      const finish = (result: StoreResult<IDBDatabase>) => { if (!settled) { settled = true; resolve(result); } };
      try {
        const request = this.factory!.open(this.dbName, VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
          if (!db.objectStoreNames.contains(REVISIONS)) db.createObjectStore(REVISIONS, { keyPath: ['documentId', 'revision'] });
          if (!db.objectStoreNames.contains(CANDIDATES)) {
            const store = db.createObjectStore(CANDIDATES, { keyPath: 'candidateId' });
            store.createIndex('createdAt', 'createdAt');
          }
        };
        request.onblocked = () => finish(failed('blocked', 'Another tab is blocking the storage upgrade. Close that tab and retry; existing data was retained.'));
        request.onerror = () => finish(storageFailure(request.error));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          if (generation !== this.connectionGeneration) { db.close(); finish(failed('aborted', 'Storage was closed before opening completed.')); return; }
          this.connection = db;
          db.onversionchange = () => { db.close(); if (this.connection === db) this.connection = null; };
          db.onclose = () => { if (this.connection === db) this.connection = null; };
          finish(ok(db));
        };
      } catch (error) { finish(storageFailure(error)); }
    }).finally(() => { this.opening = null; });
    return this.opening;
  }

  /** Recovery never creates or upgrades a missing/incompatible namespace. */
  private openExisting(): Promise<StoreResult<IDBDatabase>> {
    if (this.connection) return Promise.resolve(ok(this.connection));
    if (!this.factory) return Promise.resolve(failed('unavailable', 'IndexedDB is unavailable. Recovery data was not treated as empty.'));
    const generation = this.connectionGeneration;
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: StoreResult<IDBDatabase>) => { if (!settled) { settled = true; resolve(result); } };
      try {
        const request = this.factory!.open(this.dbName);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
          finish(failed('not-found', 'No existing project storage was found. Recovery did not create a database.'));
        };
        request.onblocked = () => finish(failed('blocked', 'Another connection is blocking recovery access. Retry after it closes.'));
        request.onerror = () => finish(storageFailure(request.error));
        request.onsuccess = () => {
          const db = request.result;
          if (settled || generation !== this.connectionGeneration) { db.close(); finish(failed('aborted', 'Recovery was closed before storage opened.')); return; }
          // Recovery may inspect a future database version, but must not hand that
          // connection to ordinary writers that only understand VERSION.
          finish(ok(db));
        };
      } catch (error) { finish(storageFailure(error)); }
    });
  }

  private async transaction<T>(names: string[], mode: IDBTransactionMode,
    work: (tx: IDBTransaction, result: (value: T) => void, reject: (code: StorageErrorCode, message: string) => void, guard: (callback: () => void) => () => void) => void,
    options: StoreOperationOptions = {}, existingOnly = false,
  ): Promise<StoreResult<T>> {
    if (options.signal?.aborted) return failed('aborted', 'Operation cancelled before storage started.');
    const opened = await (existingOnly ? this.openExisting() : this.open());
    if (!opened.ok) return opened;
    const closeRecovery = () => { if (existingOnly && opened.value !== this.connection) opened.value.close(); };
    if (options.signal?.aborted) { closeRecovery(); return failed('aborted', 'Operation cancelled before storage started.'); }
    return new Promise(resolve => {
      let tx: IDBTransaction;
      try { tx = opened.value.transaction(names, mode); }
      catch (error) { closeRecovery(); if (!existingOnly) this.close(); resolve(storageFailure(error)); return; }
      let value: T; let hasResult = false; let failure: StoreResult<never> | undefined;
      const cancel = () => { failure = failed('aborted', 'Operation cancelled; the transaction was not committed.'); try { tx.abort(); } catch { /* A completed transaction cannot be cancelled retroactively. */ } };
      const cleanup = () => { options.signal?.removeEventListener('abort', cancel); closeRecovery(); };
      const reject = (code: StorageErrorCode, message: string) => { failure = failed(code, message); try { tx.abort(); } catch { /* abort/complete handler settles */ } };
      tx.oncomplete = () => { cleanup(); resolve(hasResult ? ok(value) : failed('corrupt-storage', 'Storage completed without an expected result.')); };
      tx.onabort = () => { cleanup(); resolve(failure ?? storageFailure(tx.error ?? new DOMException('Aborted', 'AbortError'))); };
      tx.onerror = () => { /* Default error propagation aborts; inspect tx.error at abort. */ };
      options.signal?.addEventListener('abort', cancel, { once: true });
      const failOperation = (error: unknown) => {
        failure = storageFailure(error);
        try { tx.abort(); } catch { cleanup(); resolve(failure); }
      };
      // Request handlers run later, outside the initial work() call's stack.
      // Catch synchronous API failures inside those handlers before the browser
      // turns them into an uncaught exception and an unclassified abort.
      const guard = (callback: () => void) => () => { try { callback(); } catch (error) { failOperation(error); } };
      try { work(tx, result => { value = result; hasResult = true; }, reject, guard); }
      catch (error) { failOperation(error); }
    });
  }

  async loadActive(options: StoreOperationOptions = {}): Promise<StoreResult<ActiveStudioDocument | null>> {
    const result = await this.transaction<{ token: ActiveDocumentToken; stored: StoredRevision } | null>([META, REVISIONS], 'readonly', (tx, done, reject, guard) => {
      const request = tx.objectStore(META).get('active');
      request.onsuccess = guard(() => {
        if (request.result === undefined) { done(null); return; }
        if (!validToken(request.result)) { reject('corrupt-storage', 'The active document pointer is invalid; recovery candidates were retained.'); return; }
        const token = request.result as ActiveDocumentToken;
        const document = tx.objectStore(REVISIONS).get([token.documentId, token.revision]);
        document.onsuccess = guard(() => {
          if (!document.result) { reject('corrupt-storage', 'The active revision is missing; recovery candidates were retained.'); return; }
          done({ token, stored: document.result });
        });
      });
    }, options);
    if (!result.ok || result.value === null) return result as StoreResult<ActiveStudioDocument | null>;
    const parsed = parseStudioDocument(result.value.stored.json);
    if (!parsed.ok) return parsed;
    if (parsed.value.documentId !== result.value.token.documentId || parsed.value.revision !== result.value.token.revision) return failed('corrupt-storage', 'Active document identity does not match its pointer.');
    return ok({ document: parsed.value, token: result.value.token });
  }

  async save(document: StudioDocument, expected: ActiveDocumentToken, options: StoreOperationOptions = {}): Promise<StoreResult<ActiveStudioDocument>> {
    const checked = validateStudioDocument(document);
    if (!checked.ok) return checked;
    const d = checked.value;
    if (!validToken(expected) || d.documentId !== expected.documentId || d.revision !== expected.revision + 1) return failed('conflict', 'Save must advance the expected active document by exactly one revision.');
    const json = JSON.stringify(d);
    const expectedToken = { ...expected };
    return this.transaction([META, REVISIONS], 'readwrite', (tx, done, reject, guard) => {
      const active = tx.objectStore(META).get('active');
      active.onsuccess = guard(() => {
        if (!sameToken(active.result, expectedToken)) { reject('conflict', 'Another tab or operation changed the active project. Preserve this work and reload or restore it as a copy.'); return; }
        const previous = tx.objectStore(REVISIONS).get([expectedToken.documentId, expectedToken.revision]);
        previous.onsuccess = guard(() => {
          if (!previous.result) { reject('corrupt-storage', 'The current durable predecessor is missing.'); return; }
          const parsed = parseStudioDocument(previous.result.json);
          if (!parsed.ok) { reject(parsed.error.code, parsed.error.message); return; }
          if (parsed.value.documentId !== expectedToken.documentId || parsed.value.revision !== expectedToken.revision) { reject('corrupt-storage', 'The durable predecessor identity differs from its revision key.'); return; }
          if (!samePolicyEnvelope(parsed.value, d)) { reject('conflict', 'An ordinary save cannot change schema, target policy or history epoch. Use a verified policy transition.'); return; }
          const token = { ...expectedToken, revision: d.revision };
          tx.objectStore(REVISIONS).add({ documentId: d.documentId, revision: d.revision, json } satisfies StoredRevision);
          tx.objectStore(META).put(token, 'active');
          done({ document: d, token });
        });
      });
    }, options);
  }

  /**
   * Same-project policy change. The prior immutable revision is the checkpoint;
   * its reference, new policy/epoch, revision and activation commit together.
   * Staging/readback can leave a recoverable candidate, never a partial activation.
   */
  async transitionPolicy(document: StudioDocument, expected: ActiveDocumentToken, options: PolicyTransitionOptions = {}): Promise<StoreResult<ActiveStudioDocument>> {
    if (!validToken(expected)) return failed('conflict', 'A current active token is required for policy transition.');
    const expectedToken = { ...expected };
    const sourceIsCurrent = () => { try { return !options.isSourceCurrent || options.isSourceCurrent() === true; } catch { return false; } };
    const checked = validateStudioDocument(document);
    if (!checked.ok) return checked;
    const d = checked.value;
    const previous = await this.loadRevision(expectedToken.documentId, expectedToken.revision);
    if (!previous.ok) return previous;
    try { assertCompatiblePolicyTransition(previous.value, d); }
    catch (error) { return failed('conflict', error instanceof Error ? error.message : 'Invalid target transition.'); }
    if (!sourceIsCurrent()) return failed('stale-source', 'The live source changed before target staging.');
    const staged = await this.stageCandidate(d, [], options);
    if (!staged.ok) return staged;
    const json = JSON.stringify(d), previousJson = JSON.stringify(previous.value);
    const token: ActiveDocumentToken = { documentId: d.documentId, revision: d.revision, activationId: createStudioId('activation') };
    return this.transaction([META, REVISIONS, CANDIDATES], 'readwrite', (tx, done, reject, guard) => {
      const active = tx.objectStore(META).get('active');
      active.onsuccess = guard(() => {
        if (!sameToken(active.result, expectedToken)) { reject('conflict', 'The project changed while the target policy was prepared. Review the transition again.'); return; }
        const predecessor = tx.objectStore(REVISIONS).get([expectedToken.documentId, expectedToken.revision]);
        predecessor.onsuccess = guard(() => {
          if (!predecessor.result || predecessor.result.json !== previousJson) { reject('corrupt-storage', 'The checkpoint predecessor changed or disappeared.'); return; }
          const candidate = tx.objectStore(CANDIDATES).get(staged.value.candidateId);
          candidate.onsuccess = guard(() => {
            const stored = candidate.result as StoredCandidate | undefined;
            const text = stored && candidateJsonText(stored);
            if (!stored || stored.state !== 'verified' || stored.documentId !== d.documentId || stored.revision !== d.revision || !text?.ok || text.value !== json || !sameOriginalSources(stored.legacySources, [])) { reject('conflict', 'Target candidate lost its readback verification.'); return; }
            if (!sourceIsCurrent()) { reject('stale-source', 'The live source changed during target verification. Nothing was activated.'); return; }
            tx.objectStore(REVISIONS).add({ documentId: d.documentId, revision: d.revision, json } satisfies StoredRevision);
            tx.objectStore(META).put(token, 'active');
            tx.objectStore(CANDIDATES).put({ ...stored, state: 'promoted' });
            done({ document: d, token });
          });
        });
      });
    }, options);
  }

  async stageCandidate(document: StudioDocument, legacySources: LegacyDocumentSource[] = [], options: StoreOperationOptions = {}): Promise<StoreResult<StudioDocumentCandidate>> {
    const checked = validateStudioDocument(document);
    if (!checked.ok) return checked;
    const originals = originalSources(legacySources);
    if (!originals.ok) return originals;
    const { sources, bytes } = originals.value;
    const d = checked.value, json = JSON.stringify(d);
    // A canonical project plus its originals can approach twice the file limit;
    // UTF-16 string serialization can exceed Chromium's per-value transport cap.
    // Encode only the canonical JSON when the combined text exceeds one project
    // allowance. Original strings retain exact code units, including damage.
    const encoded = textBytes(json) + bytes > STUDIO_DOCUMENT_LIMITS.maxBytes;
    const candidate: StoredCandidate = { candidateId: createStudioId('candidate'), documentId: d.documentId, revision: d.revision, worldName: d.world.worldName,
      json: encoded ? new TextEncoder().encode(json) : json, ...(encoded ? { jsonEncoding: 'utf8-json-v1' as const } : {}), legacySources: sources, state: 'staged', createdAt: new Date().toISOString() };
    const written = await this.transaction([CANDIDATES], 'readwrite', (tx, done, _reject, guard) => { tx.objectStore(CANDIDATES).add(candidate); done(candidate.candidateId); }, options);
    if (!written.ok) return written;
    // A separate transaction proves candidate readback before it can be promoted.
    const readback = await this.loadCandidate(candidate.candidateId);
    if (!readback.ok) return readback;
    if (JSON.stringify(readback.value.document) !== json || !sameOriginalSources(readback.value.legacySources, sources)) return failed('corrupt-storage', 'Candidate readback differs from the staged original. Active document was not changed.');
    return this.transaction([CANDIDATES], 'readwrite', (tx, done, reject, guard) => {
      const request = tx.objectStore(CANDIDATES).get(candidate.candidateId);
      request.onsuccess = guard(() => {
        const stored = request.result as StoredCandidate | undefined;
        const text = stored && candidateJsonText(stored);
        if (!stored || stored.documentId !== d.documentId || stored.revision !== d.revision || !text?.ok || text.value !== json || !sameOriginalSources(stored.legacySources, sources) || stored.state !== 'staged') { reject('conflict', 'Candidate changed during verification; active document was not changed.'); return; }
        tx.objectStore(CANDIDATES).put({ ...stored, state: 'verified' });
        done({ candidateId: candidate.candidateId, document: d, legacySources: sources, state: 'verified', createdAt: candidate.createdAt });
      });
    }, options);
  }

  async loadCandidate(candidateId: string): Promise<StoreResult<StudioDocumentCandidate>> {
    const result = await this.transaction<StoredCandidate>([CANDIDATES], 'readonly', (tx, done, reject, guard) => {
      const request = tx.objectStore(CANDIDATES).get(candidateId);
      request.onsuccess = guard(() => request.result ? done(request.result) : reject('not-found', 'Recovery candidate was not found.'));
    });
    if (!result.ok) return result;
    const originals = originalSources(result.value.legacySources);
    if (!originals.ok) return originals;
    const text = candidateJsonText(result.value);
    if (!text.ok) return text;
    const parsed = parseStudioDocument(text.value);
    if (!parsed.ok) return parsed;
    const c = result.value;
    if (c.documentId !== parsed.value.documentId || c.revision !== parsed.value.revision || !['staged', 'verified', 'promoted'].includes(c.state)) return failed('corrupt-storage', 'Recovery candidate identity or state is invalid.');
    return ok({ candidateId: c.candidateId, document: parsed.value, legacySources: originals.value.sources, state: c.state, createdAt: c.createdAt });
  }

  async promoteCandidate(candidateId: string, expected: ActiveDocumentToken | null, options: StoreOperationOptions = {}): Promise<StoreResult<ActiveStudioDocument>> {
    if (expected !== null && !validToken(expected)) return failed('conflict', 'An expected active token or explicit empty state is required.');
    const expectedToken = expected === null ? null : { ...expected };
    const loaded = await this.loadCandidate(candidateId);
    if (!loaded.ok) return loaded;
    if (loaded.value.state === 'staged') return failed('conflict', 'Candidate has not completed independent readback verification.');
    const d = loaded.value.document; const json = JSON.stringify(d), originals = loaded.value.legacySources;
    const token: ActiveDocumentToken = { documentId: d.documentId, revision: d.revision, activationId: createStudioId('activation') };
    return this.transaction([META, REVISIONS, CANDIDATES], 'readwrite', (tx, done, reject, guard) => {
      const active = tx.objectStore(META).get('active');
      active.onsuccess = guard(() => {
        if (!sameToken(active.result, expectedToken)) { reject('conflict', 'The active project changed while the candidate was staged. Review again before activation.'); return; }
        const request = tx.objectStore(CANDIDATES).get(candidateId);
        request.onsuccess = guard(() => {
          const candidate = request.result as StoredCandidate | undefined;
          const text = candidate && candidateJsonText(candidate);
          if (!candidate || candidate.state !== loaded.value.state || candidate.documentId !== d.documentId || candidate.revision !== d.revision || !text?.ok || text.value !== json || !sameOriginalSources(candidate.legacySources, originals)) { reject('conflict', 'Candidate changed or lost verification before activation.'); return; }
          // Reusing a document ID could rewind its history. Restores/imports must be copies.
          const existing = tx.objectStore(REVISIONS).getAllKeys(IDBKeyRange.bound([d.documentId, 0], [d.documentId, Number.MAX_SAFE_INTEGER]), 1);
          existing.onsuccess = guard(() => {
            if (existing.result.length > 0) { reject('conflict', 'This document ID was already activated. Restore it with a new document ID.'); return; }
            tx.objectStore(REVISIONS).add({ documentId: d.documentId, revision: d.revision, json } satisfies StoredRevision);
            tx.objectStore(META).put(token, 'active');
            tx.objectStore(CANDIDATES).put({ ...candidate, state: 'promoted' });
            done({ document: d, token });
          });
        });
      });
    }, options);
  }

  async listCandidates(limit = 20): Promise<StoreResult<CandidateSummary[]>> {
    const count = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    return this.transaction([CANDIDATES], 'readonly', (tx, done, _reject, guard) => {
      const rows: CandidateSummary[] = [];
      const cursor = tx.objectStore(CANDIDATES).index('createdAt').openCursor(null, 'prev');
      cursor.onsuccess = guard(() => {
        const current = cursor.result;
        if (!current || rows.length >= count) { done(rows); return; }
        const { candidateId, documentId, revision, worldName, state, createdAt } = current.value as StoredCandidate;
        rows.push({ candidateId, documentId, revision, worldName, state, createdAt }); current.continue();
      });
    });
  }

  async loadRevision(documentId: string, revision: number): Promise<StoreResult<StudioDocument>> {
    const result = await this.transaction<StoredRevision>([REVISIONS], 'readonly', (tx, done, reject, guard) => {
      const request = tx.objectStore(REVISIONS).get([documentId, revision]);
      request.onsuccess = guard(() => request.result ? done(request.result) : reject('not-found', 'Requested revision was not found.'));
    });
    if (!result.ok) return result;
    const parsed = parseStudioDocument(result.value.json);
    if (!parsed.ok) return parsed;
    if (parsed.value.documentId !== documentId || parsed.value.revision !== revision) return failed('corrupt-storage', 'Stored revision identity differs from its key.');
    return parsed;
  }

  async listRevisions(documentId: string, limit = 20): Promise<StoreResult<RevisionSummary[]>> {
    const count = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    return this.transaction([REVISIONS], 'readonly', (tx, done, reject, guard) => {
      const rows: RevisionSummary[] = [];
      const range = IDBKeyRange.bound([documentId, 0], [documentId, Number.MAX_SAFE_INTEGER]);
      const cursor = tx.objectStore(REVISIONS).openCursor(range, 'prev');
      cursor.onsuccess = guard(() => {
        const current = cursor.result;
        if (!current || rows.length >= count) { done(rows); return; }
        const parsed = parseStudioDocument((current.value as StoredRevision).json);
        if (!parsed.ok) { reject('corrupt-storage', 'A stored recovery revision is invalid. It was retained for recovery.'); return; }
        rows.push({ documentId, revision: parsed.value.revision, savedAt: parsed.value.savedAt, worldName: parsed.value.world.worldName });
        current.continue();
      });
    });
  }

  /** Primary keys, not the createdAt index: damaged/missing metadata stays discoverable. */
  async listRecoveryPage(query: { kind: 'revision' | 'candidate'; after?: IDBValidKey | null; limit?: number }, options: StoreOperationOptions = {}): Promise<StoreResult<RecoveryRecordPage>> {
    const limit = query.limit ?? RECOVERY_READ_LIMITS.pageSize;
    if (!['revision', 'candidate'].includes(query.kind) || !Number.isInteger(limit) || limit < 1 || limit > RECOVERY_READ_LIMITS.maxPageSize) return failed('size-limit', 'Recovery pages require 1–50 keys.');
    try { if (query.after != null) recoveryKeyBytes(query.after); } catch { return failed('size-limit', 'Recovery cursor exceeds key limits; it was not used.'); }
    const name = query.kind === 'revision' ? REVISIONS : CANDIDATES;
    return this.transaction([name], 'readonly', (tx, done, reject, guard) => {
      const items: RecoveryRecordSummary[] = [];
      let last: IDBValidKey | null = null;
      let keyBytes = 0;
      const request = tx.objectStore(name).openKeyCursor(query.after == null ? null : IDBKeyRange.lowerBound(query.after, true));
      request.onsuccess = guard(() => {
        const cursor = request.result;
        if (!cursor) { done({ items, nextCursor: null }); return; }
        // Read one extra key (never its value) to distinguish a full final page.
        if (items.length === limit) { done({ items, nextCursor: last }); return; }
        const key = cursor.primaryKey;
        try { keyBytes += recoveryKeyBytes(key); } catch { reject('size-limit', 'A stored recovery key exceeds the 4 KiB/structure limit. The page was not silently truncated; stored records are unchanged.'); return; }
        if (items.length && keyBytes > RECOVERY_READ_LIMITS.maxPageKeyBytes) { done({ items, nextCursor: last }); return; }
        const label = typeof key === 'string' ? key.slice(0, 160)
          : Array.isArray(key) && key.length === 2 && typeof key[0] === 'string' && typeof key[1] === 'number'
            ? `${key[0].slice(0, 140)} · revision ${key[1]}` : 'Unrecognized record key';
        items.push({ ref: { kind: query.kind, key }, label }); last = key; cursor.continue();
      });
    }, options, true);
  }

  /** Read-only rescue does not require a supported schema or valid policy. */
  async readRecoveryRecord(ref: RecoveryRecordRef, options: StoreOperationOptions = {}): Promise<StoreResult<RawRecoveryRecord>> {
    if (!ref || !['active', 'revision', 'candidate'].includes(ref.kind)) return failed('invalid-document', 'Choose an active record, revision or candidate.');
    try { if (ref.kind !== 'active') recoveryKeyBytes(ref.key); } catch { return failed('size-limit', 'Recovery record key exceeds read limits; stored data was not changed.'); }
    type RawRead = { record: unknown; pointer?: unknown; resolvedRef?: Exclude<RecoveryRecordRef, { kind: 'active' }>; problem?: string };
    const result = await this.transaction<RawRead>(ref.kind === 'active' ? [META, REVISIONS] : [ref.kind === 'revision' ? REVISIONS : CANDIDATES], 'readonly', (tx, done, reject, guard) => {
      if (ref.kind !== 'active') {
        const request = tx.objectStore(ref.kind === 'revision' ? REVISIONS : CANDIDATES).get(ref.key);
        request.onsuccess = guard(() => request.result === undefined ? reject('not-found', 'That recovery record no longer exists. Refresh the list; no empty project was substituted.') : done({ record: request.result, resolvedRef: ref }));
        return;
      }
      const pointer = tx.objectStore(META).get('active');
      pointer.onsuccess = guard(() => {
        if (pointer.result === undefined) { reject('not-found', 'No active pointer exists. Browse revisions and candidates separately.'); return; }
        if (!validToken(pointer.result)) { done({ record: pointer.result, pointer: pointer.result, problem: 'The active pointer is invalid. Its envelope can be rescued; browse saved revisions separately.' }); return; }
        const resolvedRef: Exclude<RecoveryRecordRef, { kind: 'active' }> = { kind: 'revision', key: [pointer.result.documentId, pointer.result.revision] };
        try { recoveryKeyBytes(resolvedRef.key); } catch { done({ record: pointer.result, pointer: pointer.result, problem: 'The active pointer key exceeds bounded recovery limits. Its envelope remains available.' }); return; }
        const request = tx.objectStore(REVISIONS).get(resolvedRef.key);
        request.onsuccess = guard(() => done(request.result === undefined
          ? { record: pointer.result, pointer: pointer.result, problem: 'The active revision is missing. The pointer was retained; browse other records.' }
          : { record: request.result, pointer: pointer.result, resolvedRef }));
      });
    }, options, true);
    if (!result.ok) return result;
    if (options.signal?.aborted) return failed('aborted', 'Recovery read was cancelled.');
    const { record, pointer, resolvedRef, problem } = result.value;
    const out: RawRecoveryRecord = { ref: structuredClone(ref), resolvedRef, envelopeJson: null, json: null, sources: [], unsafeTextParts: [], issues: problem ? [problem] : [] };
    try { out.envelopeJson = recoveryEnvelope(record); } catch (error) { out.issues.push(error instanceof Error ? error.message : 'The envelope cannot be exported safely.'); }
    if (pointer !== undefined) {
      try { out.activePointerJson = recoveryEnvelope(pointer); } catch { out.issues.push('The active pointer exceeds the JSON recovery envelope limits.'); }
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) { out.issues.push('Stored record is not an object.'); return ok(out); }
    const row = record as Record<string, unknown>;
    const originals = row.legacySources !== undefined || resolvedRef?.kind === 'candidate' ? originalSources(row.legacySources) : ok({ sources: [], bytes: 0 });
    if (!originals.ok) out.issues.push(`${originals.error.code}: ${originals.error.message} Opening is disabled until original-source recovery is resolved.`);
    if (row.json instanceof Uint8Array && row.json.byteLength <= STUDIO_DOCUMENT_LIMITS.maxBytes) out.encodedDocumentBytes = row.json;
    const decoded = candidateJsonText({ json: row.json, jsonEncoding: row.jsonEncoding });
    const text = typeof row.json === 'string' ? row.json : decoded.ok ? decoded.value : null;
    if (!decoded.ok) out.issues.push(`${decoded.error.code}: ${decoded.error.message}`);
    if (text !== null) {
      if (text.length > STUDIO_DOCUMENT_LIMITS.maxBytes || textBytes(text) > STUDIO_DOCUMENT_LIMITS.maxBytes) out.issues.push('Stored document text exceeds the 32 MiB recovery text limit. It was not parsed or truncated.');
      else {
        out.json = text;
        if (!wellFormedText(text)) { out.unsafeTextParts.push('document'); out.issues.push('Document text contains an unpaired UTF-16 surrogate. A direct UTF-8 download would change it; use the JSON envelope, which preserves the code unit as an escape, when available.'); }
      }
    } else out.issues.push('Stored document text is missing or is not a string; inspect its envelope.');
    if (row.legacySources !== undefined) {
      if (!Array.isArray(row.legacySources) || row.legacySources.length > 64) out.issues.push('Original-source list is malformed or exceeds 64 entries; inspect the envelope.');
      else {
        let bytes = 0;
        for (const source of row.legacySources) {
          if (!source || typeof source.sourceId !== 'string' || source.sourceId.length > 512 || typeof source.raw !== 'string') { out.issues.push('An original-source entry is malformed; inspect the envelope.'); continue; }
          if (source.raw.length > STUDIO_DOCUMENT_LIMITS.maxBytes || (bytes += textBytes(source.raw)) > STUDIO_DOCUMENT_LIMITS.maxBytes) { out.issues.push('Original text exceeds the 32 MiB aggregate recovery limit; it was not truncated.'); continue; }
          if (!wellFormedText(source.raw)) {
            out.unsafeTextParts.push(`source:${out.sources.length}`);
            out.issues.push(`Original source ${out.sources.length + 1} contains an unpaired UTF-16 surrogate. Direct download is disabled; its JSON envelope preserves the code unit as an escape when available.`);
          }
          out.sources.push({ sourceId: source.sourceId, raw: source.raw });
        }
      }
    }
    if (out.json !== null && decoded.ok && originals.ok) {
      const parsed = parseStudioDocument(out.json);
      if (!parsed.ok) out.issues.push(`${parsed.error.code}: ${parsed.error.message}`);
      else {
        const d = parsed.value;
        const matches = resolvedRef && row.documentId === d.documentId && row.revision === d.revision
          && (resolvedRef.kind === 'revision'
            ? Array.isArray(resolvedRef.key) && resolvedRef.key[0] === d.documentId && resolvedRef.key[1] === d.revision
            : row.candidateId === resolvedRef.key && ['staged', 'verified', 'promoted'].includes(String(row.state)));
        if (!matches) out.issues.push('Record identity/state does not match its stored key. Raw download is available; opening is disabled.');
        else {
          out.document = d;
          if (d.targetPolicy?.checkpoint) out.checkpoint = { kind: 'revision', key: [d.targetPolicy.checkpoint.documentId, d.targetPolicy.checkpoint.revision] };
        }
      }
    }
    return ok(out);
  }
}
