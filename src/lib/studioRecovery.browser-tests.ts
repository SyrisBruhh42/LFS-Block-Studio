/** Bounded real IndexedDB rescue tests. Only the disposable loopback runner may invoke these. */
import { StudioDocumentStore, type StoreResult, type RecoveryRecordRef, type RecoveryRecordPage } from './studioDocumentStore';
import { createStudioId, STUDIO_DOCUMENT_LIMITS } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';

const PREFIX = 'lfs-recovery-contract-test-';
export interface RecoveryTestResult { name: string; ok: boolean; error?: string }
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function take<T>(result: StoreResult<T>): T { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; }
function reject<T>(result: StoreResult<T>, code: string): void { expect(!result.ok && result.error.code === code, `Expected ${code}, received ${JSON.stringify(result).slice(0, 300)}`); }
function equal(a: unknown, b: unknown, message: string) { expect(JSON.stringify(a) === JSON.stringify(b), message); }
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.addEventListener('blocked', () => reject(new Error('Test database blocked.'))); }); }
async function bounded<T>(p: Promise<T>, label: string): Promise<T> { let timer: ReturnType<typeof setTimeout>; try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10000); })]); } finally { clearTimeout(timer!); } }
async function write(dbName: string, entries: { store: string; value: unknown; key?: IDBValidKey }[]) {
  expect(dbName.startsWith(PREFIX), 'Fixture write outside disposable database.');
  const db = await request(indexedDB.open(dbName));
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...new Set(entries.map(e => e.store))], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    for (const entry of entries) { const store = tx.objectStore(entry.store); if (entry.key === undefined) store.put(entry.value); else store.put(entry.value, entry.key); }
  }); } finally { db.close(); }
}
async function noWrites<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const original = IDBDatabase.prototype.transaction;
  let writes = 0;
  IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
    if (this.name === name && args[1] && args[1] !== 'readonly') { writes++; throw new Error('Recovery attempted a write transaction.'); }
    return original.apply(this, args);
  };
  try { const result = await operation(); expect(writes === 0, 'Recovery attempted storage mutation.'); return result; }
  finally { IDBDatabase.prototype.transaction = original; }
}
async function seedActive(store: StudioDocumentStore, dbName: string, json: string) {
  take(await store.loadActive());
  await write(dbName, [
    { store: 'metadata', key: 'active', value: { documentId: 'rescue', revision: 0, activationId: 'activation-test' } },
    { store: 'revisions', value: { documentId: 'rescue', revision: 0, json } },
  ]);
  store.close();
}
const ref = (kind: 'revision' | 'candidate', key: IDBValidKey): RecoveryRecordRef => ({ kind, key });

export async function runStudioRecoveryBrowserTests(): Promise<RecoveryTestResult[]> {
  const results: RecoveryTestResult[] = [];
  async function check(name: string, run: (store: StudioDocumentStore, db: string) => Promise<void>) {
    const dbName = createStudioId('lfs-recovery-contract-test'), store = new StudioDocumentStore({ dbName });
    try { await bounded(run(store, dbName), name); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error) }); }
    finally { store.close(); try { expect(dbName.startsWith(PREFIX), 'Unsafe cleanup.'); await bounded(request(indexedDB.deleteDatabase(dbName)), 'cleanup'); } catch (error) { results.push({ name: `${name}: cleanup`, ok: false, error: String(error) }); } }
  }
  await check('missing namespace returns not-found and recovery does not create it', async (store, db) => {
    await noWrites(db, async () => {
      reject(await store.listRecoveryPage({ kind: 'revision' }), 'not-found');
      reject(await store.readRecoveryRecord({ kind: 'active' }), 'not-found');
    });
    expect(!(await indexedDB.databases()).some(item => item.name === db), 'Read-only rescue initialized a missing database.');
  });
  await check('existing empty page and missing active record remain distinct', async (store, db) => {
    take(await store.loadActive()); store.close();
    await noWrites(db, async () => {
      equal(take(await store.listRecoveryPage({ kind: 'candidate' })), { items: [], nextCursor: null }, 'Empty page not explicit.');
      reject(await store.readRecoveryRecord({ kind: 'active' }), 'not-found');
    });
  });
  await check('future schema active document preserves exact text and pointer without downgrade', async (store, db) => {
    const future: any = makeStudioDocument('rescue'); future.schemaVersion = 99; future.world.worldName = 'café 🌱';
    const raw = ` \n${JSON.stringify(future, null, 2)}\r\n`;
    await seedActive(store, db, raw);
    await noWrites(db, async () => {
      const result = take(await store.readRecoveryRecord({ kind: 'active' }));
      expect(result.json === raw && !result.document && result.issues.some(x => x.includes('unsupported-schema')), 'Future schema was lost or opened.');
      equal(JSON.parse(result.envelopeJson!).json, raw, 'Envelope changed exact JSON text.');
      expect(JSON.parse(result.activePointerJson!).activationId === 'activation-test', 'Pointer changed.');
      expect((await store.loadActive()).ok === false, 'Read-only rescue unlocked unsupported content.');
    });
  });
  await check('unknown schema2 policy remains closed while raw text is exportable', async (store, db) => {
    const document: any = makeStudioDocument('rescue'); document.schemaVersion = 2;
    document.targetPolicy = { policyVersion: 999, target: { kind: 'minecraft-java', locked: false } };
    const raw = JSON.stringify(document, null, 2); await seedActive(store, db, raw);
    await noWrites(db, async () => {
      const result = take(await store.readRecoveryRecord({ kind: 'active' }));
      expect(result.json === raw && !result.document && result.issues.length > 0, 'Unknown policy became a usable Freeform project.');
    });
  });
  await check('incomplete document JSON remains exact and independently downloadable', async (store, db) => {
    const raw = '{"schemaVersion":2,\n "unclosed":'; await seedActive(store, db, raw);
    const result = await noWrites(db, async () => take(await store.readRecoveryRecord({ kind: 'active' })));
    expect(result.json === raw && !result.document && result.issues.length > 0, 'Corruption was normalized or hidden.');
  });
  await check('malformed active pointer can be rescued without guessing a revision', async (store, db) => {
    take(await store.loadActive()); const pointer = { documentId: 'rescue', revision: 'broken', future: ['keep'] };
    await write(db, [{ store: 'metadata', key: 'active', value: pointer }]); store.close();
    const result = await noWrites(db, async () => take(await store.readRecoveryRecord({ kind: 'active' })));
    equal(JSON.parse(result.activePointerJson!), pointer, 'Malformed pointer lost.');
    expect(!result.resolvedRef && !result.document && result.issues.some(x => x.includes('pointer is invalid')), 'Pointer guessed.');
  });
  await check('dangling active pointer is an explicit recoverable issue, not empty storage', async (store, db) => {
    take(await store.loadActive()); await write(db, [{ store: 'metadata', key: 'active', value: { documentId: 'missing', revision: 4, activationId: 'a' } }]);
    const result = await noWrites(db, async () => take(await store.readRecoveryRecord({ kind: 'active' })));
    expect(result.issues.some(x => x.includes('revision is missing')) && result.activePointerJson && !result.document, 'Dangling pointer not reported.');
  });
  await check('malformed candidate metadata stays discoverable and its sources remain exact', async (store, db) => {
    take(await store.loadActive());
    const sources = [{ sourceId: 'file:original.json', raw: '\ufeff  {"x": 2}\r\n' }, { sourceId: 'cloud:blocksData', raw: '{not JSON' }];
    await write(db, [{ store: 'candidates', value: { candidateId: 'no-date', json: '{"schemaVersion":42}', legacySources: sources, futureMetadata: { intact: true } } }]);
    await noWrites(db, async () => {
      const page = take(await store.listRecoveryPage({ kind: 'candidate' })); expect(page.items.length === 1, 'Missing createdAt made record invisible.');
      const result = take(await store.readRecoveryRecord(page.items[0].ref)); equal(result.sources, sources, 'Source text was changed.');
      expect(JSON.parse(result.envelopeJson!).futureMetadata.intact, 'Unknown envelope field lost.');
    });
  });
  await check('valid document with mismatched stored identity cannot be opened from rescue', async (store, db) => {
    await seedActive(store, db, JSON.stringify(makeStudioDocument('different')));
    const result = take(await store.readRecoveryRecord(ref('revision', ['rescue', 0])));
    expect(!result.document && result.json && result.issues.some(x => x.includes('identity')), 'Mismatched raw record became restorable.');
  });
  await check('non-string document field exports its envelope without coercion', async (store, db) => {
    take(await store.loadActive()); await write(db, [{ store: 'revisions', value: { documentId: 'bad', revision: -1, json: { preserve: [1, 2] } } }]);
    const page = take(await store.listRecoveryPage({ kind: 'revision' }));
    const result = take(await store.readRecoveryRecord(page.items[0].ref));
    expect(result.json === null && !result.document, 'Non-string document was normalized.');
    equal(JSON.parse(result.envelopeJson!).json, { preserve: [1, 2] }, 'Malformed field lost.');
  });
  await check('overlimit document is not parsed or truncated and retains a bounded envelope route', async (store, db) => {
    const raw = 'x'.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1); await seedActive(store, db, raw);
    const result = take(await store.readRecoveryRecord({ kind: 'active' }));
    expect(result.json === null && !result.document && result.issues.some(x => x.includes('32 MiB')), 'Oversize input admitted.');
    expect(JSON.parse(result.envelopeJson!).json.length === raw.length, 'Oversize source was truncated in envelope.');
  });
  await check('malformed source entry does not hide independent bounded originals', async (store, db) => {
    take(await store.loadActive()); await write(db, [{ store: 'candidates', value: { candidateId: 'sources', json: '{}', legacySources: [null, { sourceId: 'keep', raw: 'exact\n' }, { sourceId: 'bad', raw: 2 }] } }]);
    const result = take(await store.readRecoveryRecord(ref('candidate', 'sources')));
    equal(result.sources, [{ sourceId: 'keep', raw: 'exact\n' }], 'Available original lost.'); expect(result.issues.length > 0, 'Malformed source not disclosed.');
  });
  await check('non-JSON envelope data is refused explicitly while valid source text remains available', async (store, db) => {
    take(await store.loadActive()); const cycle: any = {}; cycle.self = cycle;
    await write(db, [{ store: 'candidates', value: { candidateId: 'cycle', json: 'raw json text', legacySources: [{ sourceId: 'original', raw: 'keep' }], cycle } }]);
    const result = take(await store.readRecoveryRecord(ref('candidate', 'cycle')));
    expect(result.envelopeJson === null && result.json === 'raw json text' && result.sources[0].raw === 'keep' && result.issues.some(x => x.includes('cycle')), 'Non-JSON data silently omitted or blocked independent rescue.');
  });
  await check('key-only pagination traverses more than100 revisions and candidates without whole-value scans', async (store, db) => {
    take(await store.loadActive());
    await write(db, Array.from({ length: 127 }, (_, i) => [
      { store: 'revisions', value: { documentId: 'pages', revision: i, json: i % 2 ? '{}' : 'broken' } },
      { store: 'candidates', value: { candidateId: `candidate-${String(i).padStart(3, '0')}`, json: '{}', createdAt: i % 2 ? undefined : 'same-date' } },
    ]).flat());
    const getAll = IDBObjectStore.prototype.getAll, getAllKeys = IDBObjectStore.prototype.getAllKeys, openCursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.getAll = IDBObjectStore.prototype.getAllKeys = IDBObjectStore.prototype.openCursor = function () { throw new Error('Value/unbounded enumeration forbidden.'); } as any;
    try { await noWrites(db, async () => {
      for (const kind of ['revision', 'candidate'] as const) {
        let after: IDBValidKey | null = null, pages = 0; const keys = new Set<string>();
        do {
          const page: RecoveryRecordPage = take(await store.listRecoveryPage({ kind, after, limit: 25 })); expect(page.items.length <= 25, 'Page unbounded.');
          for (const item of page.items) { const key = JSON.stringify(item.ref.key); expect(!keys.has(key), 'Duplicate paged record.'); keys.add(key); }
          after = page.nextCursor; expect(++pages <= 6, 'Pagination did not terminate.');
        } while (after !== null);
        expect(keys.size === 127 && pages === 6, 'Records after100 were inaccessible.');
      }
    }); } finally { IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.getAllKeys = getAllKeys; IDBObjectStore.prototype.openCursor = openCursor; }
  });
  await check('policy checkpoint reference can be inspected without transition or activation', async (store, db) => {
    const first = makeStudioDocument('checkpoint'); const candidate = take(await store.stageCandidate(first)); const active = take(await store.promoteCandidate(candidate.candidateId, null));
    const policy = { ...first, schemaVersion: 2 as const, revision: 1, historyEpoch: 'next', targetPolicy: { policyVersion: 1 as const, target: { kind: 'freeform' as const }, checkpoint: { documentId: first.documentId, revision: 0, historyEpoch: first.historyEpoch } } };
    take(await store.transitionPolicy(policy, active.token));
    await noWrites(db, async () => {
      const current = take(await store.readRecoveryRecord({ kind: 'active' })); expect(current.checkpoint, 'Checkpoint unavailable.');
      const previous = take(await store.readRecoveryRecord(current.checkpoint)); equal(previous.document, first, 'Wrong checkpoint resolved.');
      expect(take(await store.loadActive())!.document.revision === 1, 'Checkpoint inspection activated old state.');
    });
  });
  await check('cancelled and failed transactions produce errors rather than empty or partial records', async (store, db) => {
    await seedActive(store, db, JSON.stringify(makeStudioDocument('rescue')));
    const controller = new AbortController(); controller.abort();
    reject(await store.listRecoveryPage({ kind: 'revision' }, { signal: controller.signal }), 'aborted');
    reject(await store.readRecoveryRecord({ kind: 'active' }, { signal: controller.signal }), 'aborted');
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
      const r = original.apply(this, args);
      if (this.transaction.db.name === db && this.name === 'revisions') r.addEventListener('success', () => this.transaction.abort(), { once: true });
      return r;
    };
    try { reject(await store.readRecoveryRecord({ kind: 'active' }), 'aborted'); }
    finally { IDBObjectStore.prototype.get = original; }
    expect(take(await store.loadActive())!.document.documentId === 'rescue', 'Aborted read changed durable state.');
  });
  await check('transaction setup failures and invalid page bounds do not become an empty list', async (store, db) => {
    take(await store.loadActive()); const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) { if (this.name === db) throw new DOMException('Injected unavailable read', 'InvalidStateError'); return original.apply(this, args); };
    try { reject(await store.listRecoveryPage({ kind: 'candidate' }), 'unavailable'); reject(await store.readRecoveryRecord({ kind: 'active' }), 'unavailable'); }
    finally { IDBDatabase.prototype.transaction = original; }
    for (const limit of [0, 51, Infinity, NaN, 1.1]) reject(await store.listRecoveryPage({ kind: 'candidate', limit }), 'size-limit');
  });
  await check('future database version is rescued read-only without enabling ordinary writers', async (store, db) => {
    await seedActive(store, db, JSON.stringify(makeStudioDocument('rescue'))); store.close();
    const future = await request(indexedDB.open(db, 2)); future.close();
    const result = await noWrites(db, async () => take(await store.readRecoveryRecord({ kind: 'active' })));
    expect(result.json !== null, 'Future database version could not be rescued.');
    reject(await store.loadActive(), 'unavailable');
  });
  await check('oversize record keys fail explicitly without skipped or silently partial pages', async (store, db) => {
    take(await store.loadActive()); const key = 'x'.repeat(4097);
    await write(db, [{ store: 'candidates', value: { candidateId: key, json: '{}' } }]);
    await noWrites(db, async () => {
      reject(await store.listRecoveryPage({ kind: 'candidate' }), 'size-limit');
      reject(await store.readRecoveryRecord(ref('candidate', key)), 'size-limit');
      reject(await store.listRecoveryPage({ kind: 'candidate', after: key }), 'size-limit');
    });
  });
  await check('page key-byte budget returns a continuation instead of retaining unbounded keys', async (store, db) => {
    take(await store.loadActive());
    await write(db, Array.from({ length: 30 }, (_, i) => ({ store: 'candidates', value: { candidateId: String(i).padStart(2, '0') + 'k'.repeat(3900), json: '{}' } })));
    const first = take(await store.listRecoveryPage({ kind: 'candidate', limit: 50 }));
    expect(first.items.length > 0 && first.items.length < 30 && first.nextCursor !== null, 'Key bytes did not bound page.');
    const second = take(await store.listRecoveryPage({ kind: 'candidate', limit: 50, after: first.nextCursor }));
    expect(first.items.length + second.items.length === 30 && second.nextCursor === null, 'Byte-limited continuation lost records.');
  });
  await check('array metadata that JSON would omit is refused rather than silently lost', async (store, db) => {
    take(await store.loadActive()); const sources: any = [{ sourceId: 'retained', raw: 'exact text' }]; sources.note = 'preserve-me';
    await write(db, [{ store: 'candidates', value: { candidateId: 'array-extra', json: '{}', legacySources: sources } }]);
    const result = take(await store.readRecoveryRecord(ref('candidate', 'array-extra')));
    expect(result.envelopeJson === null && result.issues.some(x => x.includes('extra properties')), 'Array metadata silently omitted.');
    expect(result.sources[0].raw === 'exact text', 'Independent source text was needlessly hidden.');
  });
  await check('unpaired surrogate text disables lossy UTF8 download while envelope preserves code units', async (store, db) => {
    take(await store.loadActive());
    await write(db, [{ store: 'candidates', value: { candidateId: 'surrogate', json: '\ud800', legacySources: [{ sourceId: 'damaged', raw: '\udfff' }] } }]);
    const result = take(await store.readRecoveryRecord(ref('candidate', 'surrogate')));
    expect(result.unsafeTextParts.includes('document') && result.unsafeTextParts.includes('source:0'), 'Lossy raw text was not flagged.');
    const envelope = JSON.parse(result.envelopeJson!);
    expect(envelope.json.charCodeAt(0) === 0xd800 && envelope.legacySources[0].raw.charCodeAt(0) === 0xdfff, 'Envelope changed original UTF16 code units.');
  });
  return results;
}
