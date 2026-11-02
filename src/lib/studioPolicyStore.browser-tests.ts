/** Real IndexedDB contracts. Run only from the disposable loopback QA runner. */
import { StudioDocumentStore, type ActiveStudioDocument, type StoreResult } from './studioDocumentStore';
import { createStudioId, type StudioDocument } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { candidateJavaTarget, type StudioTarget } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';

export interface PolicyStorageTestResult { name: string; ok: boolean; error?: string }
const PREFIX = 'lfs-policy-contract-test-';
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function take<T>(result: StoreResult<T>): T { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; }
function rejects<T>(result: StoreResult<T>, code?: string): void { expect(!result.ok, 'Operation unexpectedly succeeded.'); if (code) expect(result.error.code === code, `Expected ${code}; received ${result.error.code}: ${result.error.message}`); }
function equal(left: unknown, right: unknown, message: string): void { expect(JSON.stringify(left) === JSON.stringify(right), message); }
async function bounded<T>(operation: Promise<T>, name: string, milliseconds = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out.`)), milliseconds); })]); }
  finally { clearTimeout(timer!); }
}
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.addEventListener('blocked', () => reject(new Error('Test database operation was blocked.'))); }); }
async function mutateRecord(dbName: string, storeName: string, key: IDBValidKey, mutate: (record: any) => any): Promise<void> {
  expect(dbName.startsWith(PREFIX), 'Refusing to mutate a non-test database.');
  const db = await request(indexedDB.open(dbName));
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite'), store = tx.objectStore(storeName), read = store.get(key);
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('Fixture write aborted.'));
      read.onsuccess = () => { try { store.put(mutate(read.result)); } catch (error) { tx.abort(); reject(error); } };
    });
  } finally { db.close(); }
}
function nextPolicy(source: StudioDocument, target: StudioTarget = { kind: 'freeform' }): StudioDocument {
  return { ...structuredClone(source), schemaVersion: 2, revision: source.revision + 1,
    historyEpoch: createStudioId('policy-epoch'), savedAt: new Date().toISOString(),
    targetPolicy: { policyVersion: 1, checkpoint: { documentId: source.documentId, revision: source.revision, historyEpoch: source.historyEpoch }, target: structuredClone(target) } };
}
function emptyJavaFixture(): StudioDocument {
  const document = makeStudioDocument(createStudioId('policy-project'));
  const unit = { ...document.customBlocks.grass_brick, id: 'unit', name: 'Policy fixture unit', shape: 'cube' as const, width: 1, depth: 1, heightPlates: 3, hasStuds: false };
  delete unit.voxels; delete unit.defaultScale;
  document.blocks = {}; document.blueprints = []; document.customBlocks = { unit };
  document.extensions = { preservedNote: 'Opaque metadata must survive policy transitions.' };
  return document;
}
function javaTarget(document: StudioDocument, locked = true): StudioTarget {
  const captured = captureJavaDefinitionBinding(document.customBlocks.unit, 'minecraft:stone');
  expect(captured.ok, 'Java fixture binding failed.');
  return candidateJavaTarget([captured.binding], locked);
}
async function initial(store: StudioDocumentStore, document = makeStudioDocument(createStudioId('policy-project'))): Promise<ActiveStudioDocument> {
  const staged = take(await store.stageCandidate(document, [{ sourceId: 'legacy:policy-fixture', raw: '{"original":true}' }]));
  return take(await store.promoteCandidate(staged.candidateId, null));
}
async function unchanged(store: StudioDocumentStore, active: ActiveStudioDocument): Promise<void> {
  store.close(); equal(take(await store.loadActive()), active, 'Reopening changed the prior active state.');
  equal(take(await store.loadRevision(active.document.documentId, active.document.revision)), active.document, 'Predecessor changed.');
  rejects(await store.loadRevision(active.document.documentId, active.document.revision + 1), 'not-found');
}
async function injectWriteFailure(
  dbName: string, method: 'add' | 'put', matches: (name: string, data: any) => boolean,
  mode: 'quota' | 'abort', controller: AbortController, operation: () => Promise<void>,
): Promise<void> {
  const original = IDBObjectStore.prototype[method]; let hits = 0;
  IDBObjectStore.prototype[method] = function (...args: Parameters<IDBObjectStore['add']>) {
    const match = this.transaction.db.name === dbName && matches(this.name, args[0]);
    if (match && mode === 'quota') { hits++; throw new DOMException('Injected policy quota failure', 'QuotaExceededError'); }
    const r = original.apply(this, args);
    if (match) r.addEventListener('success', () => { hits++; controller.abort(); }, { once: true });
    return r;
  };
  try { await operation(); expect(hits > 0, 'Failure injection did not reach the intended write.'); }
  finally { IDBObjectStore.prototype[method] = original; }
}

export async function runStudioPolicyStoreBrowserTests(): Promise<PolicyStorageTestResult[]> {
  const results: PolicyStorageTestResult[] = [];
  async function check(name: string, run: (store: StudioDocumentStore, dbName: string, stores: StudioDocumentStore[]) => Promise<void>): Promise<void> {
    const dbName = createStudioId('lfs-policy-contract-test'), store = new StudioDocumentStore({ dbName }), stores = [store];
    try { await bounded(run(store, dbName, stores), name); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error) }); }
    finally {
      for (const connection of stores) connection.close();
      try { expect(dbName.startsWith(PREFIX), 'Refusing to delete a non-test database.'); await bounded(request(indexedDB.deleteDatabase(dbName)), 'Database cleanup', 3000); }
      catch (error) { results.push({ name: `${name}: disposable cleanup`, ok: false, error: String(error) }); }
    }
  }

  await check('changed original-source list after policy readback rejects activation and retains the predecessor', async (store, dbName) => {
    const first = await initial(store), originalStage = store.stageCandidate.bind(store);
    store.stageCandidate = async (...args) => {
      const result = await originalStage(...args);
      if (result.ok) await mutateRecord(dbName, 'candidates', result.value.candidateId, record => ({ ...record, legacySources: [{ sourceId: 'unexpected', raw: 'changed after readback' }] }));
      return result;
    };
    try { rejects(await store.transitionPolicy(nextPolicy(first.document), first.token), 'conflict'); }
    finally { store.stageCandidate = originalStage; }
    await unchanged(store, first);
  });

  await check('schema1 to explicit schema2 Freeform commits complete content, checkpoint and fresh activation', async store => {
    const first = await initial(store), proposed = nextPolicy(first.document);
    const changed = take(await store.transitionPolicy(proposed, first.token));
    equal(changed.document, proposed, 'Transition changed proposed content.');
    expect(changed.token.activationId !== first.token.activationId, 'Transition did not fence the old activation.');
    equal(take(await store.loadRevision(first.document.documentId, first.document.revision)), first.document, 'Schema1 checkpoint lost.');
    store.close(); equal(take(await store.loadActive()), changed, 'Reopen did not load complete schema2 policy.');
    const candidates = take(await store.listCandidates(100));
    expect(candidates.filter(c => c.state === 'promoted').length === 2, 'Promotion markers were not committed.');
  });

  await check('Java initial lock, unlock and relock retain every checkpoint and reject stale activation', async store => {
    let active = await initial(store, emptyJavaFixture()); const history = [active];
    for (const locked of [true, false, true]) {
      const next = nextPolicy(active.document, javaTarget(active.document, locked));
      const transitioned = take(await store.transitionPolicy(next, active.token));
      expect(transitioned.token.activationId !== active.token.activationId, 'Policy activation identity was reused.');
      history.push(transitioned); active = transitioned;
    }
    for (const checkpoint of history) equal(take(await store.loadRevision(checkpoint.document.documentId, checkpoint.document.revision)), checkpoint.document, 'A policy checkpoint was not retained.');
    store.close(); equal(take(await store.loadActive()), active, 'Reopen lost Java lock or content.');
    const saved = { ...structuredClone(active.document), revision: active.document.revision + 1 };
    rejects(await store.save(saved, { ...active.token, activationId: history[0].token.activationId }), 'conflict');
  });

  await check('explicit Freeform policy can select compatible Java candidate without rewriting content', async store => {
    const first = await initial(store, emptyJavaFixture());
    const freeform = take(await store.transitionPolicy(nextPolicy(first.document), first.token));
    const java = take(await store.transitionPolicy(nextPolicy(freeform.document, javaTarget(freeform.document)), freeform.token));
    expect(java.document.targetPolicy!.target.kind === 'minecraft-java', 'Java policy was not installed.');
    equal(java.document.extensions, first.document.extensions, 'Opaque source metadata changed.');
    equal(java.document.lightingConfig, first.document.lightingConfig, 'Lighting changed.');
  });

  await check('ordinary saves cannot change schema, epoch, lock, mappings or policy checkpoint', async store => {
    const first = await initial(store, emptyJavaFixture());
    rejects(await store.save(nextPolicy(first.document), first.token), 'conflict');
    const epochOnly = { ...structuredClone(first.document), revision: 1, historyEpoch: 'forbidden-save-epoch' };
    rejects(await store.save(epochOnly, first.token), 'conflict');
    const locked = take(await store.transitionPolicy(nextPolicy(first.document, javaTarget(first.document)), first.token));
    const ordinary = { ...structuredClone(locked.document), revision: locked.document.revision + 1 };
    const changes: ((d: StudioDocument) => void)[] = [
      d => { d.schemaVersion = 1; delete d.targetPolicy; }, d => { d.historyEpoch = 'bypass-epoch'; },
      d => { (d.targetPolicy!.target as any).locked = false; },
      d => { (d.targetPolicy!.target as any).bindings[0].blockState = 'minecraft:cobblestone'; },
      d => { d.targetPolicy!.checkpoint.historyEpoch = 'different-checkpoint'; },
    ];
    for (const change of changes) { const attempted = structuredClone(ordinary); change(attempted); rejects(await store.save(attempted, locked.token), 'conflict'); }
    await unchanged(store, locked);
    ordinary.world.worldName = 'Legitimate content save';
    const saved = take(await store.save(ordinary, locked.token));
    equal(saved.document.targetPolicy, locked.document.targetPolicy, 'Normal save changed target policy.');
    expect(saved.token.activationId === locked.token.activationId, 'Normal save rotated activation.');
  });

  await check('same-lock, rebinding, authored changes and wrong checkpoint reject before staging', async store => {
    const first = await initial(store, emptyJavaFixture());
    const locked = take(await store.transitionPolicy(nextPolicy(first.document, javaTarget(first.document)), first.token));
    const beforeCandidates = take(await store.listCandidates(100)).length;
    const changes: ((d: StudioDocument) => void)[] = [
      d => { (d.targetPolicy!.target as any).locked = true; },
      d => { (d.targetPolicy!.target as any).bindings[0].blockState = 'minecraft:cobblestone'; },
      d => { d.world.worldName = 'Undisclosed content replacement'; },
      d => { d.patternConfig.seed++; },
      d => { d.targetPolicy!.checkpoint.revision--; },
      d => { d.targetPolicy!.checkpoint.documentId = 'wrong-project'; },
      d => { d.targetPolicy!.target = { kind: 'freeform' }; },
    ];
    for (const change of changes) {
      const attempted = nextPolicy(locked.document, javaTarget(locked.document, false)); change(attempted);
      rejects(await store.transitionPolicy(attempted, locked.token), 'conflict');
    }
    expect(take(await store.listCandidates(100)).length === beforeCandidates, 'Rejected transition staged a candidate.');
    await unchanged(store, locked);
  });

  await check('pre-aborted policy transition and stale live source leave no staged candidate', async store => {
    const first = await initial(store), proposed = nextPolicy(first.document), before = take(await store.listCandidates(100));
    const abort = new AbortController(); abort.abort();
    rejects(await store.transitionPolicy(proposed, first.token, { signal: abort.signal }), 'aborted');
    rejects(await store.transitionPolicy(proposed, first.token, { isSourceCurrent: () => false }), 'stale-source');
    equal(take(await store.listCandidates(100)), before, 'Cancelled/stale source staged data.');
    await unchanged(store, first);
  });

  for (const phase of ['stage', 'verify', 'commit'] as const) for (const mode of ['quota', 'abort'] as const) {
    await check(`${mode} during policy ${phase} preserves prior authority and recoverable stage state`, async (store, dbName) => {
      const first = await initial(store), next = nextPolicy(first.document), controller = new AbortController();
      await injectWriteFailure(dbName, phase === 'verify' ? 'put' : 'add', (name, data) =>
        phase === 'stage' ? name === 'candidates' && data.state === 'staged' :
        phase === 'verify' ? name === 'candidates' && data.state === 'verified' : name === 'revisions',
      mode, controller, async () => { rejects(await store.transitionPolicy(next, first.token, { signal: controller.signal }), mode === 'quota' ? 'quota' : 'aborted'); });
      await unchanged(store, first);
      const pending = take(await store.listCandidates(100)).filter(c => c.revision === next.revision);
      if (phase === 'stage') expect(pending.length === 0, 'Aborted/failed stage leaked a candidate.');
      else {
        expect(pending.length === 1 && pending[0].state === (phase === 'verify' ? 'staged' : 'verified'), 'Recovery candidate marker was partially committed.');
        equal(take(await store.loadCandidate(pending[0].candidateId)).document, next, 'Recoverable candidate content changed.');
        rejects(await store.promoteCandidate(pending[0].candidateId, first.token), 'conflict');
      }
      const retry = take(await store.transitionPolicy(next, first.token));
      equal(take(await store.loadActive()), retry, 'Clean retry could not commit the complete policy.');
    });
  }

  for (const failedStore of ['metadata', 'candidates']) {
    await check(`quota after revision insertion but before ${failedStore} commit rolls back all policy writes`, async (store, dbName) => {
      const first = await initial(store), next = nextPolicy(first.document), controller = new AbortController();
      await injectWriteFailure(dbName, 'put', (name, data) => name === failedStore && (name !== 'candidates' || data.state === 'promoted'), 'quota', controller,
        async () => { rejects(await store.transitionPolicy(next, first.token), 'quota'); });
      await unchanged(store, first);
      expect(take(await store.listCandidates(100)).some(c => c.revision === next.revision && c.state === 'verified'), 'Verified candidate was lost.');
    });
  }

  await check('competing policy writers commit exactly one complete successor', async (store, dbName, stores) => {
    const first = await initial(store), other = new StudioDocumentStore({ dbName }); stores.push(other);
    const a = nextPolicy(first.document), b = nextPolicy(first.document);
    const outcomes = await Promise.all([store.transitionPolicy(a, first.token), other.transitionPolicy(b, first.token)]);
    expect(outcomes.filter(result => result.ok).length === 1, 'Policy CAS accepted both writers or neither.');
    rejects(outcomes.find(result => !result.ok)!, 'conflict');
    const winner = take(outcomes.find(result => result.ok)!);
    store.close(); other.close(); equal(take(await store.loadActive()), winner, 'Reopen did not select the winning complete policy.');
    equal(take(await store.loadRevision(first.document.documentId, first.document.revision)), first.document, 'Competing transition damaged checkpoint.');
  });

  await check('intervening ordinary save beats a staged policy transition without losing either candidate', async (store, dbName, stores) => {
    const first = await initial(store), other = new StudioDocumentStore({ dbName }); stores.push(other);
    const originalStage = store.stageCandidate.bind(store); let staged!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { staged = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
    store.stageCandidate = async (...args) => { const result = await originalStage(...args); staged(); await resume; return result; };
    const transition = store.transitionPolicy(nextPolicy(first.document), first.token);
    try {
      await reached;
      const edited = { ...structuredClone(first.document), revision: first.document.revision + 1 }; edited.world.worldName = 'Other writer preserved';
      const saved = take(await other.save(edited, first.token)); release();
      rejects(await transition, 'conflict'); equal(take(await store.loadActive()), saved, 'Stale transition overwrote intervening save.');
      expect(take(await store.listCandidates(100)).some(c => c.state === 'verified'), 'Losing candidate was discarded.');
    } finally { release(); store.stageCandidate = originalStage; }
  });

  await check('live source change during verification is rechecked inside commit and preserves predecessor', async store => {
    const first = await initial(store), originalStage = store.stageCandidate.bind(store); let current = true, checks = 0;
    store.stageCandidate = async (...args) => { const result = await originalStage(...args); current = false; return result; };
    try {
      rejects(await store.transitionPolicy(nextPolicy(first.document), first.token, { isSourceCurrent: () => { checks++; return current; } }), 'stale-source');
    } finally { store.stageCandidate = originalStage; }
    expect(checks >= 2, 'Live source guard was not checked again after verification.');
    await unchanged(store, first);
    expect(take(await store.listCandidates(100)).some(c => c.state === 'verified'), 'Stale source candidate was not retained.');
  });

  await check('changed verified candidate cannot be promoted by policy transaction', async (store, dbName) => {
    const first = await initial(store), originalStage = store.stageCandidate.bind(store);
    store.stageCandidate = async (...args) => {
      const result = await originalStage(...args);
      if (result.ok) await mutateRecord(dbName, 'candidates', result.value.candidateId, row => ({ ...row, state: 'staged' }));
      return result;
    };
    try { rejects(await store.transitionPolicy(nextPolicy(first.document), first.token), 'conflict'); }
    finally { store.stageCandidate = originalStage; }
    await unchanged(store, first);
  });

  await check('unknown persisted policy never reopens or saves as unlocked Freeform', async (store, dbName) => {
    const first = await initial(store, emptyJavaFixture());
    const active = take(await store.transitionPolicy(nextPolicy(first.document, javaTarget(first.document)), first.token));
    const mutations: ((d: any) => void)[] = [
      d => { d.targetPolicy.policyVersion = 99; }, d => { d.targetPolicy.target.profileId = 'unknown-profile'; d.targetPolicy.target.locked = false; },
      d => { delete d.targetPolicy; }, d => { d.schemaVersion = 99; },
    ];
    for (const mutate of mutations) {
      const damaged = structuredClone(active.document); mutate(damaged);
      await mutateRecord(dbName, 'revisions', [active.document.documentId, active.document.revision], row => ({ ...row, json: JSON.stringify(damaged) }));
      store.close(); rejects(await store.loadActive());
      const attempted = { ...structuredClone(active.document), revision: active.document.revision + 1 };
      rejects(await store.save(attempted, active.token));
      equal(take(await store.loadRevision(first.document.documentId, first.document.revision)), first.document, 'Unknown policy destroyed legacy checkpoint.');
      rejects(await store.loadRevision(active.document.documentId, active.document.revision + 1), 'not-found');
    }
  });

  await check('ordinary save rejects valid JSON whose predecessor identity differs from its revision key', async (store, dbName) => {
    const first = await initial(store), next = { ...structuredClone(first.document), revision: first.document.revision + 1 };
    for (const changed of [{ documentId: 'wrong-document' }, { revision: 42 }]) {
      await mutateRecord(dbName, 'revisions', [first.document.documentId, first.document.revision], row => ({ ...row, json: JSON.stringify({ ...first.document, ...changed }) }));
      rejects(await store.save(next, first.token), 'corrupt-storage');
      rejects(await store.loadRevision(first.document.documentId, next.revision), 'not-found');
    }
  });
  return results;
}
