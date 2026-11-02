/** Run in a disposable browser context via Vite; uses only uniquely named test databases.
 * const {runStudioDocumentStoreBrowserTests} = await import('/src/lib/studioDocumentStore.browser-tests.ts');
 * await runStudioDocumentStoreBrowserTests();
 */
import { StudioDocumentStore, type StoreResult, type ActiveStudioDocument } from './studioDocumentStore';
import { createStudioId } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';

export interface BrowserContractResult { name: string; ok: boolean; error?: string }
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function value<T>(result: StoreResult<T>): T { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; }
function equal(left: unknown, right: unknown, message: string): void { expect(JSON.stringify(left) === JSON.stringify(right), message); }
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function removeTestDatabase(name: string): Promise<void> {
  expect(name.startsWith('lfs-contract-test-'), 'Refusing to delete a non-test database.');
  await request(indexedDB.deleteDatabase(name));
}
async function initial(store: StudioDocumentStore, name = 'project-first'): Promise<ActiveStudioDocument> {
  const candidate = value(await store.stageCandidate(makeStudioDocument(name), [{ sourceId: 'legacy:fixture', raw: '{"unknownOriginal":true}' }]));
  return value(await store.promoteCandidate(candidate.candidateId, null));
}

export async function runStudioDocumentStoreBrowserTests(): Promise<BrowserContractResult[]> {
  const results: BrowserContractResult[] = [];
  async function check(name: string, run: (store: StudioDocumentStore, dbName: string, stores: StudioDocumentStore[]) => Promise<void>) {
    const dbName = createStudioId('lfs-contract-test');
    const store = new StudioDocumentStore({ dbName }); const stores = [store];
    try { await run(store, dbName, stores); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error) }); }
    finally { for (const s of stores) s.close(); await removeTestDatabase(dbName); }
  }

  await check('candidate readback preserves raw legacy sources and does not activate until promotion', async store => {
    const doc = makeStudioDocument(); const raw = '{"legacyFieldNeverDropped":[1,2]}';
    const staged = value(await store.stageCandidate(doc, [{ sourceId: 'localStorage:original', raw }]));
    expect(staged.state === 'verified', 'Stage did not verify.');
    expect(value(await store.loadActive()) === null, 'Staging changed the active project.');
    const recovered = value(await store.loadCandidate(staged.candidateId)); equal(recovered.document, doc, 'Candidate document differs.'); expect(recovered.legacySources[0].raw === raw, 'Raw source changed.');
    const active = value(await store.promoteCandidate(staged.candidateId, null)); equal(active.document, doc, 'Promoted data differs.');
    store.close(); equal(value(await store.loadActive())!.document, doc, 'Reopened document differs.');
  });

  await check('complete authored state saves and previous immutable revision remains recoverable', async store => {
    const first = await initial(store); const next = structuredClone(first.document); next.revision++;
    next.world.worldName = 'Edited'; Object.values(next.customBlocks)[0].color = '#abcdef'; next.patternConfig.seed = 818; next.lightingConfig!.fogDensity = 0.32;
    const saved = value(await store.save(next, first.token));
    equal(value(await store.loadActive()), saved, 'Save readback differs.');
    equal(value(await store.loadRevision(first.document.documentId, 0)), first.document, 'Previous revision was lost.');
    expect(value(await store.listRevisions(first.document.documentId)).length === 2, 'Revision inventory incomplete.');
  });

  await check('competing tabs compare-and-swap; exactly one same-revision writer wins', async (store, dbName, stores) => {
    const first = await initial(store); const other = new StudioDocumentStore({ dbName }); stores.push(other);
    const a = structuredClone(first.document); a.revision++; a.world.worldName = 'Tab A';
    const b = structuredClone(a); b.world.worldName = 'Tab B';
    const outcomes = await Promise.all([store.save(a, first.token), other.save(b, first.token)]);
    expect(outcomes.filter(r => r.ok).length === 1, 'CAS accepted both writers or neither.');
    const rejected = outcomes.find(r => !r.ok)!; expect(!rejected.ok && rejected.error.code === 'conflict', 'Losing writer was not a conflict.');
    const winner = outcomes.find(r => r.ok)!; equal(value(await store.loadActive()), value(winner), 'Active pointer differs from the winning write.');
  });

  await check('abort after write request success does not acknowledge save or move active pointer', async store => {
    const first = await initial(store); const next = structuredClone(first.document); next.revision++;
    const controller = new AbortController(); const original = IDBObjectStore.prototype.add; let sawSuccess = false;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      const r = original.apply(this, args);
      if (this.name === 'revisions') r.addEventListener('success', () => { sawSuccess = true; controller.abort(); }, { once: true });
      return r;
    };
    try {
      const result = await store.save(next, first.token, { signal: controller.signal });
      expect(sawSuccess, 'Abort fixture never reached request success.'); expect(!result.ok && result.error.code === 'aborted', 'Aborted transaction reported saved.');
    } finally { IDBObjectStore.prototype.add = original; }
    equal(value(await store.loadActive()), first, 'Abort moved active pointer.');
    expect(!(await store.loadRevision(next.documentId, 1)).ok, 'Aborted revision leaked.');
  });

  await check('interrupted verification leaves staged candidate recoverable but non-activatable', async store => {
    const first = await initial(store); const controller = new AbortController(); const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const r = original.apply(this, args);
      if (this.name === 'candidates' && args[0]?.state === 'verified') r.addEventListener('success', () => controller.abort(), { once: true });
      return r;
    };
    try { const result = await store.stageCandidate(makeStudioDocument('project-candidate'), [{ sourceId: 'raw', raw: 'retained' }], { signal: controller.signal }); expect(!result.ok && result.error.code === 'aborted', 'Verification abort reported success.'); }
    finally { IDBObjectStore.prototype.put = original; }
    equal(value(await store.loadActive()), first, 'Staging failure changed active state.');
    const staged = value(await store.listCandidates()).find(c => c.state === 'staged'); expect(staged, 'Staged recovery source disappeared.');
    expect(value(await store.loadCandidate(staged.candidateId)).legacySources[0].raw === 'retained', 'Original disappeared.');
    const promotion = await store.promoteCandidate(staged.candidateId, first.token); expect(!promotion.ok && promotion.error.code === 'conflict', 'Unverified candidate was activated.');
  });

  await check('aborted activation is atomic and verified candidate can subsequently be promoted', async store => {
    const first = await initial(store); const candidate = value(await store.stageCandidate(makeStudioDocument('project-replacement')));
    const controller = new AbortController(); const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      const r = original.apply(this, args); if (this.name === 'revisions') r.addEventListener('success', () => controller.abort(), { once: true }); return r;
    };
    try { const result = await store.promoteCandidate(candidate.candidateId, first.token, { signal: controller.signal }); expect(!result.ok && result.error.code === 'aborted', 'Aborted activation reported success.'); }
    finally { IDBObjectStore.prototype.add = original; }
    equal(value(await store.loadActive()), first, 'Failed activation replaced source.');
    expect(value(await store.loadCandidate(candidate.candidateId)).state === 'verified', 'Candidate marker partially committed.');
    expect(value(await store.promoteCandidate(candidate.candidateId, first.token)).document.documentId === 'project-replacement', 'Retry could not activate complete candidate.');
  });

  await check('stale candidate cannot replace an intervening save; stale activation token cannot save into a new project', async store => {
    const first = await initial(store); const candidate = value(await store.stageCandidate(makeStudioDocument('project-later')));
    const next = structuredClone(first.document); next.revision++; const saved = value(await store.save(next, first.token));
    const stale = await store.promoteCandidate(candidate.candidateId, first.token); expect(!stale.ok && stale.error.code === 'conflict', 'Stale candidate replaced a newer save.');
    const active = value(await store.promoteCandidate(candidate.candidateId, saved.token));
    const oldSave = structuredClone(saved.document); oldSave.revision++;
    const result = await store.save(oldSave, saved.token); expect(!result.ok && result.error.code === 'conflict', 'Old project token saved after a switch.'); equal(value(await store.loadActive()), active, 'Old save changed new active project.');
  });

  await check('injected quota failure remains explicit and retains previous active revision', async store => {
    const first = await initial(store); const next = structuredClone(first.document); next.revision++;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readwrite') throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try { const result = await store.save(next, first.token); expect(!result.ok && result.error.code === 'quota', 'Quota failure was hidden.'); }
    finally { IDBDatabase.prototype.transaction = original; }
    equal(value(await store.loadActive()), first, 'Quota failure changed active project.');
  });

  await check('quota thrown inside a request callback aborts save and promotion without an uncaught exception', async store => {
    const first = await initial(store); const next = structuredClone(first.document); next.revision++;
    const candidate = value(await store.stageCandidate(makeStudioDocument('callback-quota-candidate')));
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'revisions') throw new DOMException('Injected callback quota', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try {
      const saved = await store.save(next, first.token);
      expect(!saved.ok && saved.error.code === 'quota', 'Callback quota was not classified on save.');
      const promoted = await store.promoteCandidate(candidate.candidateId, first.token);
      expect(!promoted.ok && promoted.error.code === 'quota', 'Callback quota was not classified on promotion.');
    } finally { IDBObjectStore.prototype.add = original; }
    equal(value(await store.loadActive()), first, 'Callback quota moved the active revision.');
    expect(value(await store.loadCandidate(candidate.candidateId)).state === 'verified', 'Failed promotion changed candidate state.');
  });

  await check('versionchange closes cached connection and incompatible reopen fails instead of hanging', async (store, dbName) => {
    await initial(store);
    const upgraded = await request(indexedDB.open(dbName, 2)); upgraded.close();
    const result = await store.loadActive(); expect(!result.ok && result.error.code === 'unavailable', 'Old store did not report incompatible database version.');
  });
  await check('legacy helpers distinguish missing/failed reads and wait for set/clear transaction completion', async (_store, dbName) => {
    // A fresh module instance plus redirected open confines legacy tests to this disposable DB.
    const originalOpen = IDBFactory.prototype.open;
    const originalPut = IDBObjectStore.prototype.put;
    const originalGet = IDBObjectStore.prototype.get;
    const originalClear = IDBObjectStore.prototype.clear;
    IDBFactory.prototype.open = function (name: string, version?: number) {
      return originalOpen.call(this, name === 'lfs_studio_db_v1' ? dbName : name, version);
    };
    try {
      const legacy = await import(/* @vite-ignore */ `./indexedDbStorage.ts?contract=${encodeURIComponent(dbName)}`);
      expect(await legacy.idbGetStrict('test-missing') === null, 'Missing key was not null.');
      expect(await legacy.idbSet('test-value', { preserved: true }), 'Initial legacy write failed.');
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        const r = originalPut.apply(this, args);
        if (this.name === 'studio_kv') r.addEventListener('success', () => this.transaction.abort(), { once: true });
        return r;
      };
      expect(await legacy.idbSet('test-value', { preserved: false }) === false, 'Aborted legacy write reported success.');
      IDBObjectStore.prototype.put = originalPut;
      equal(await legacy.idbGetStrict('test-value'), { preserved: true }, 'Aborted legacy write lost predecessor.');
      IDBObjectStore.prototype.clear = function () {
        const r = originalClear.call(this);
        if (this.name === 'studio_kv') r.addEventListener('success', () => this.transaction.abort(), { once: true });
        return r;
      };
      expect(await legacy.idbClearAll() === false, 'Aborted clear reported success.');
      IDBObjectStore.prototype.clear = originalClear;
      equal(await legacy.idbGetStrict('test-value'), { preserved: true }, 'Aborted clear lost predecessor.');
      IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
        const r = originalGet.apply(this, args);
        if (this.name === 'studio_kv') r.addEventListener('success', () => this.transaction.abort(), { once: true });
        return r;
      };
      let rejected = false;
      try { await legacy.idbGetStrict('test-value'); } catch { rejected = true; }
      expect(rejected, 'Aborted legacy read masqueraded as a missing key.');
    } finally {
      IDBObjectStore.prototype.put = originalPut; IDBObjectStore.prototype.get = originalGet; IDBObjectStore.prototype.clear = originalClear;
      IDBFactory.prototype.open = originalOpen;
      // versionchange closes the fresh legacy module's cached connection before cleanup.
      const upgraded = await request(indexedDB.open(dbName, 2)); upgraded.close();
    }
  });
  return results;
}
