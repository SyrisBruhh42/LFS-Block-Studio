/** Disposable IndexedDB fixtures for the versioned large-candidate encoding. */
import { StudioDocumentStore, encodeStudioRecoverySourceEnvelope, type StoreResult } from './studioDocumentStore';
import { createStudioId, STUDIO_DOCUMENT_LIMITS } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';
const prefix = 'lfs-encoded-candidate-test';
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function take<T>(result: StoreResult<T>): T { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; }
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function record(dbName: string, value: any) {
  expect(dbName.startsWith(prefix), 'Write outside fixture namespace.');
  const db = await request(indexedDB.open(dbName));
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('candidates', 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.objectStore('candidates').put(value); }); } finally { db.close(); }
}
async function read(dbName: string, key: string) {
  const db = await request(indexedDB.open(dbName));
  try { return await request(db.transaction('candidates', 'readonly').objectStore('candidates').get(key)); } finally { db.close(); }
}
function row(id: string, encoded = true) {
  const d = makeStudioDocument(id); d.blocks = {}; d.blueprints = [];
  return { candidateId: `candidate:${id}`, documentId: d.documentId, revision: d.revision, worldName: d.world.worldName,
    json: encoded ? new TextEncoder().encode(JSON.stringify(d)) : JSON.stringify(d), ...(encoded ? { jsonEncoding: 'utf8-json-v1' } : {}),
    legacySources: [{ sourceId: 'file:original', raw: ' \n{"original":"Ω"}\r\n' }], state: 'verified', createdAt: d.savedAt };
}
export async function runStudioEncodedCandidateBrowserTests() {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  async function check(name: string, test: (store: StudioDocumentStore, db: string) => Promise<void>) {
    const db = createStudioId(prefix), store = new StudioDocumentStore({ dbName: db });
    try { take(await store.loadActive()); await test(store, db); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error) }); }
    finally { store.close(); expect(db.startsWith(prefix), 'Cleanup outside fixture namespace.'); await request(indexedDB.deleteDatabase(db)); }
  }
  await check('legacy string candidate remains readable, promotable and exactly preserved', async (store, db) => {
    const original = row('legacy-candidate', false); await record(db, original);
    const loaded = take(await store.loadCandidate(original.candidateId)); expect(loaded.legacySources[0].raw === original.legacySources[0].raw, 'Legacy source changed.');
    take(await store.promoteCandidate(original.candidateId, null));
    expect(JSON.stringify(take(await store.loadActive())!.document) === original.json, 'Legacy document changed.');
  });
  await check('large candidate selects UTF-8 canonical bytes while preserving document and damaged original code units', async (store, db) => {
    const d = makeStudioDocument('encoded-large'); d.blocks = {}; d.blueprints = []; d.extensions = { preserved: 'x'.repeat(17 * 1024 * 1024), surrogate: '\ud800' };
    const source = { sourceId: 'localStorage:original', raw: 'y'.repeat(17 * 1024 * 1024) + '\udfff' };
    const candidate = take(await store.stageCandidate(d, [source])), raw = await read(db, candidate.candidateId);
    expect(raw.jsonEncoding === 'utf8-json-v1' && raw.json instanceof Uint8Array, 'Large record did not select byte encoding.');
    const loaded = take(await store.loadCandidate(candidate.candidateId)); expect(JSON.stringify(loaded.document) === JSON.stringify(d), 'Encoded document differs.'); expect(loaded.legacySources[0].raw === source.raw, 'Original code units changed.');
    const rescue = take(await store.readRecoveryRecord({ kind: 'candidate', key: candidate.candidateId }));
    expect(rescue.json === JSON.stringify(d) && rescue.encodedDocumentBytes?.length === raw.json.length, 'Stored byte/text rescue incomplete.');
    expect(rescue.envelopeJson === null && rescue.unsafeTextParts.includes('source:0'), 'Lossy envelope or source was admitted.');
    expect(JSON.parse(encodeStudioRecoverySourceEnvelope(source)).raw === source.raw, 'Individual-source envelope lost a code unit.');
    const active = take(await store.promoteCandidate(candidate.candidateId, null)); expect(JSON.stringify(active.document) === JSON.stringify(d), 'Activation changed encoded content.');
    store.close(); expect(JSON.stringify(take(await store.loadActive())!.document) === JSON.stringify(d), 'Reopen changed encoded content.');
  });
  await check('readback verification accepts exact encoded bytes, not byte-array object identity', async (store, db) => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
      if (this.transaction.db.name === db && this.name === 'candidates' && typeof args[0]?.json === 'string') args[0] = { ...args[0], json: new TextEncoder().encode(args[0].json), jsonEncoding: 'utf8-json-v1' };
      return original.apply(this, args);
    };
    try {
      const d = makeStudioDocument('converted-at-write'), candidate = take(await store.stageCandidate(d));
      expect((await read(db, candidate.candidateId)).json instanceof Uint8Array, 'Encoding fixture did not run.');
      expect(JSON.stringify(take(await store.promoteCandidate(candidate.candidateId, null)).document) === JSON.stringify(d), 'Exact byte readback failed.');
    } finally { IDBObjectStore.prototype.add = original; }
  });
  await check('unknown encoding, invalid UTF-8, wrong representation and oversized bytes stay unactivatable and recoverable', async (store, db) => {
    const variants = [
      { name: 'unknown', data: { jsonEncoding: 'future-encoding' }, code: 'unsupported-schema' },
      { name: 'invalid', data: { json: new Uint8Array([0xc3, 0x28]) }, code: 'corrupt-storage' },
      { name: 'wrong-type', data: { json: '{}' }, code: 'corrupt-storage' },
      { name: 'oversized', data: { json: new Uint8Array(STUDIO_DOCUMENT_LIMITS.maxBytes + 1) }, code: 'size-limit' },
    ];
    for (const v of variants) {
      const data = { ...row(v.name), ...v.data }; await record(db, data);
      const result = await store.loadCandidate(data.candidateId); expect(!result.ok && result.error.code === v.code, `${v.name} became readable.`);
      const rescue = take(await store.readRecoveryRecord({ kind: 'candidate', key: data.candidateId })); expect(!rescue.document, `${v.name} became activatable.`);
      if (v.name === 'unknown' || v.name === 'invalid') expect(rescue.encodedDocumentBytes instanceof Uint8Array, `${v.name} bytes unavailable.`);
      expect(take(await store.loadActive()) === null, 'Malformed candidate changed active pointer.');
    }
  });
  await check('original-source admission rejects getters, duplicate IDs and over-limit text before writing or activation', async (store, db) => {
    let reads = 0;
    const accessor = Object.defineProperty({ sourceId: 'accessor' }, 'raw', { enumerable: true, get() { reads++; return 'must not run'; } });
    const attempts: any[] = [[accessor], [{ sourceId: 'same', raw: 'one' }, { sourceId: 'same', raw: 'two' }], [{ sourceId: 'large', raw: 'x'.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1) }]];
    for (const sources of attempts) expect(!(await store.stageCandidate(makeStudioDocument('rejected-original'), sources)).ok, 'Invalid original admitted.');
    expect(reads === 0 && take(await store.listCandidates()).length === 0 && take(await store.loadActive()) === null, 'Source rejection ran a getter or wrote state.');
    const malformed = { ...row('malformed-original'), legacySources: [{ sourceId: 'large', raw: 'x'.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1) }] };
    await record(db, malformed); expect(!(await store.loadCandidate(malformed.candidateId)).ok, 'Oversize stored originals bypassed read admission.');
    const rescue = take(await store.readRecoveryRecord({ kind: 'candidate', key: malformed.candidateId }));
    expect(!rescue.document && rescue.json !== null && rescue.encodedDocumentBytes, 'Malformed originals hid document rescue or enabled opening.');
  });
  for (const mode of ['document', 'original', 'oversized-original', 'state', 'identity']) await check(`changed encoded ${mode} after readback rejects final activation without changing the active project`, async (store, db) => {
    const initial = take(await store.stageCandidate(makeStudioDocument('initial-active'))), active = take(await store.promoteCandidate(initial.candidateId, null));
    const target = row(`changed-${mode}`); await record(db, target);
    const original = store.loadCandidate;
    store.loadCandidate = async id => {
      const result = await original.call(store, id);
      if (id === target.candidateId) {
        const changed: any = structuredClone(target);
        if (mode === 'document') { const d = JSON.parse(new TextDecoder().decode(changed.json)); d.world.worldName = 'Swapped after read'; changed.json = new TextEncoder().encode(JSON.stringify(d)); }
        else if (mode === 'original') changed.legacySources[0].raw = 'swapped after read';
        else if (mode === 'oversized-original') changed.legacySources[0].raw = 'x'.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1);
        else if (mode === 'state') changed.state = 'unknown-state';
        else changed.documentId = 'different-document';
        await record(db, changed);
      }
      return result;
    };
    try {
      const result = await store.promoteCandidate(target.candidateId, active.token); expect(!result.ok && result.error.code === 'conflict', 'Changed candidate activated.');
      expect(JSON.stringify(take(await store.loadActive())) === JSON.stringify(active), 'Conflict changed active authority.');
    } finally { store.loadCandidate = original; }
  });
  return results;
}
