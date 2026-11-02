import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import type { StudioDocument } from './studioDocument';
import type { PlacedBlock, WorldEditEngineState } from '../engine/types';
import { StudioEditorSession, type StudioEditorResult, type StudioEditorToken, type StudioHistoryBudget } from './studioEditorSession';

function document(): StudioDocument {
  const doc = makeStudioDocument();
  doc.blocks = {};
  doc.revision = 7;
  doc.extensions = { notes: { text: 'Original', tags: ['one', 'two'] } };
  return doc;
}
function session(doc = document(), budget?: StudioHistoryBudget): StudioEditorSession {
  const result = new StudioEditorSession(doc, budget); result.setWritable(true); return result;
}
function block(x = 0): PlacedBlock { return { id: `fixture:${x}`, blockDefId: 'cobble_brick', position: { x, y: 0, z: 0 }, rotation: 0 }; }
function applied(result: StudioEditorResult): void { assert.equal(result.status, 'applied', result.message); }
function rejected(result: StudioEditorResult): void { assert.equal(result.status, 'rejected', result.message); }
function durable(doc: StudioDocument, revision = doc.revision + 1): StudioDocument { return { ...structuredClone(doc), revision, savedAt: `2026-11-01T12:00:${String(revision).padStart(2, '0')}.000Z` }; }
function content(store: StudioEditorSession): string { const snapshot = store.getSnapshot(); return JSON.stringify({ document: snapshot.document, workspace: snapshot.workspace, token: store.getToken(), canUndo: snapshot.canUndo, canRedo: snapshot.canRedo, history: store.getHistoryUsage() }); }
function renameHistorySize(doc: StudioDocument, label: string, name: string): number {
  const probe = session(doc);
  applied(probe.transaction(label, () => { probe.setWorldField('worldName', name); }));
  return probe.getHistoryUsage().retainedBytes;
}

test('session starts nonwritable with fresh identity, immutable snapshots and bound subscription methods', () => {
  const input = document(), store = new StudioEditorSession(input), second = new StudioEditorSession(input);
  assert.equal(store.getSnapshot().writable, false);
  assert.notEqual(store.getToken().sessionId, second.getToken().sessionId);
  assert.equal(store.getToken().editRevision, 0);
  const { getSnapshot, subscribe, getEngineState, getDocument } = store;
  assert.equal(getSnapshot(), getSnapshot()); assert.equal(getEngineState(), getEngineState());
  assert.deepEqual(getEngineState().undoStack, []); assert.deepEqual(getEngineState().redoStack, []);
  assert.ok(Object.isFrozen(getSnapshot())); assert.ok(Object.isFrozen(getDocument().world));
  input.world.worldName = 'External'; assert.equal(getDocument().world.worldName, 'Fixture');
  assert.equal(Object.isFrozen(input.world), false);
  let notifications = 0; const unsubscribe = subscribe(() => { notifications++; });
  rejected(store.setWorldField('worldName', 'Denied'));
  assert.equal(getDocument().world.worldName, 'Fixture');
  store.setWritable(true); const count = notifications; unsubscribe();
  applied(store.setWorldField('worldName', 'Allowed')); assert.equal(notifications, count);
});

test('constructor rejects invalid documents and invalid history budgets', () => {
  assert.throws(() => new StudioEditorSession({ ...document(), revision: Infinity }));
  for (const limits of [{ maxEntries: 0, maxBytes: 100 }, { maxEntries: 31, maxBytes: 100 }, { maxEntries: 2, maxBytes: Infinity }, { maxEntries: 1, maxBytes: 17 * 1024 * 1024 }]) assert.throws(() => new StudioEditorSession(document(), limits));
});

test('composite setters publish once and undo/redo the complete authored domain and workspace', () => {
  const store = session(), before = store.getSnapshot(); let notifications = 0;
  store.subscribe(() => { notifications++; });
  applied(store.transaction('Composite build', () => {
    store.setWorldField('worldName', 'Changed');
    store.setDocumentField('blueprints', []);
    store.setDocumentField('chunkConfig', config => ({ ...config, chunkSize: 8 }));
    store.setDocumentField('patternConfig', config => ({ ...config, seed: 123 }));
    store.setDocumentField('lightingConfig', light => ({ ...light!, timeOfDay: 18 }));
    store.setDocumentField('extensions', { notes: ['changed'] });
    store.setEngineState(engine => ({ ...engine, blocks: { '0,0,0': block() },
      customBlocks: { ...engine.customBlocks, cobble_brick: { ...engine.customBlocks.cobble_brick, color: '#112233' } },
      pos1: { x: -1, y: 0, z: 1 }, pos2: { x: 2, y: 3, z: 4 }, clipboard: [block(0.25)], clipboardCustomDefs: [engine.customBlocks.cobble_brick] }));
    assert.equal(store.getDocument().world.worldName, 'Changed');
    assert.equal(store.getSnapshot(), before);
  }));
  const after = store.getSnapshot();
  assert.equal(notifications, 1); assert.equal(after.editRevision, 1); assert.equal(after.document.revision, 7);
  applied(store.undo()); assert.deepEqual(store.getDocument(), before.document); assert.deepEqual(store.getSnapshot().workspace, before.workspace);
  assert.equal(store.getSnapshot().canUndo, false); assert.equal(store.getSnapshot().canRedo, true);
  applied(store.redo()); assert.deepEqual(store.getDocument(), after.document); assert.deepEqual(store.getSnapshot().workspace, after.workspace);
  assert.equal(store.getSnapshot().editRevision, 3);
});

test('nested transactions safely join one batch and validate only the final composite state', () => {
  const doc = document(); doc.blocks['0,0,0'] = block(); const store = session(doc);
  applied(store.transaction('Remove definition and uses', () => {
    store.setDocumentField('customBlocks', defs => { const next = { ...defs }; delete next.cobble_brick; return next; });
    store.setDocumentField('blueprints', []); // Starter blueprints also reference this definition.
    store.transaction('Nested remove', () => { store.setDocumentField('blocks', {}); });
  }));
  assert.equal(store.getDocument().customBlocks.cobble_brick, undefined);
  applied(store.undo()); assert.deepEqual(store.getDocument(), doc); assert.equal(store.getSnapshot().canUndo, false);
});

test('final validation, exceptions and ignored nested rejection roll back all setters and effects', () => {
  for (const failure of ['schema', 'throw', 'nested', 'explicit']) {
    const store = session(), before = content(store); let effects = 0;
    rejected(store.transaction('Rejected composite', () => {
      store.setWorldField('worldName', 'Partial'); store.afterCommit(() => { effects++; });
      if (failure === 'schema') store.setDocumentField('blocks', { '0,0,0': { ...block(), blockDefId: 'missing' } });
      if (failure === 'throw') throw new Error('Fixture failure');
      if (failure === 'nested') store.transaction('Nested', () => { store.reject('Nested rejected'); });
      if (failure === 'explicit') store.reject('Explicit rejected');
      store.setWorldField('description', 'Also partial');
    }));
    assert.equal(content(store), before, failure); assert.equal(effects, 0, failure);
  }
});

test('no-op preserves snapshot identity, redo, live revision and suppresses queued effects', () => {
  const store = session(); applied(store.setWorldField('worldName', 'Edited')); applied(store.undo());
  const before = store.getSnapshot(); let effects = 0;
  assert.equal(store.transaction('No-op', () => { store.setWorldField('worldName', 'Fixture'); store.afterCommit(() => { effects++; }); }).status, 'noop');
  assert.equal(store.getSnapshot(), before); assert.equal(effects, 0); assert.equal(before.canRedo, true);
  applied(store.redo()); assert.equal(store.getDocument().world.worldName, 'Edited');
});

test('post-commit effects see accepted state, failures do not undo it and remaining effects run', () => {
  const store = session(); const observed: string[] = [];
  const result = store.transaction('With effects', () => {
    store.setWorldField('worldName', 'Applied');
    store.afterCommit(() => { observed.push(store.getDocument().world.worldName); throw new Error('Effect fixture'); });
    store.afterCommit(() => { observed.push('second'); });
  });
  applied(result); assert.match(result.message!, /post-commit effect failed/);
  assert.deepEqual(observed, ['Applied', 'second']); assert.equal(store.getDocument().world.worldName, 'Applied');
  applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Fixture');
  store.afterCommit(() => { observed.push('outside'); }); assert.equal(observed.at(-1), 'outside');
});

test('reentrant mutations in subscribers and commit effects are rejected without recursive publish', () => {
  const store = session(); let notifications = 0; const results: StudioEditorResult[] = [];
  store.subscribe(() => {
    notifications++; results.push(store.setWorldField('worldName', 'Subscriber write'));
    results.push(store.undo()); results.push(store.installVerifiedDocument(document()));
    assert.equal(store.beginExclusive(), null); store.setWritable(false);
  });
  applied(store.transaction('Outer', () => {
    store.setWorldField('worldName', 'Accepted');
    store.afterCommit(() => { results.push(store.setWorldField('description', 'Effect write')); results.push(store.redo()); });
  }));
  assert.equal(notifications, 1); results.forEach(rejected);
  assert.equal(store.getDocument().world.worldName, 'Accepted'); assert.equal(store.getSnapshot().writable, true);
  assert.equal(store.getSnapshot().editRevision, 1);
});

test('updater reentry poisons the whole batch while legitimate nested transaction callbacks remain allowed', () => {
  const store = session(), before = content(store);
  rejected(store.setWorldField('worldName', previous => { store.setWorldField('description', 'Side write'); return previous + '!'; }));
  assert.equal(content(store), before);
  rejected(store.transaction('Nested history', () => { store.setWorldField('worldName', 'Partial'); store.undo(); }));
  assert.equal(content(store), before);
});

test('declared async callbacks and async setters reject before invocation', async () => {
  const store = session(), before = content(store); let ran = false;
  rejected(store.transaction('Async', async () => { ran = true; store.setWorldField('worldName', 'Bad'); }));
  rejected(store.setWorldField('worldName', (async () => { ran = true; return 'Bad'; }) as unknown as () => string));
  await Promise.resolve(); assert.equal(ran, false); assert.equal(content(store), before);
});

test('returned Promise and descriptor-only thenable detection reject the synchronous draft without invoking then', () => {
  const store = session(), before = content(store); let getterCalls = 0;
  const thenable = Object.defineProperty({}, 'then', { get() { getterCalls++; return () => undefined; } });
  rejected(store.transaction('Thenable', () => { store.setWorldField('worldName', 'Partial'); return thenable; }));
  rejected(store.transaction('Promise', () => { store.setWorldField('worldName', 'Partial'); return Promise.resolve(); }));
  rejected(store.setWorldField('worldName', (() => thenable) as unknown as () => string));
  assert.equal(getterCalls, 0); assert.equal(content(store), before);
});

test('mutable aliases are copied and frozen internally without freezing caller-owned data', () => {
  const store = session(); const input = { values: ['original'] };
  applied(store.setDocumentField('extensions', input)); input.values.push('outside');
  assert.deepEqual(store.getDocument().extensions, { values: ['original'] });
  const next = { ...store.getEngineState(), pos1: { x: 1.25, y: -2, z: 0 }, clipboard: [block(0.25)] };
  applied(store.setEngineState(next)); next.pos1.x = 99; next.clipboard[0].position.x = 99;
  assert.equal(store.getSnapshot().workspace.pos1!.x, 1.25); assert.equal(store.getSnapshot().workspace.clipboard[0].position.x, 0.25);
  assert.equal(Object.isFrozen(next.clipboard), false); assert.ok(Object.isFrozen(store.getSnapshot().workspace.clipboard[0].position));
  assert.throws(() => { store.getDocument().world.worldName = 'Bypass'; });
});

test('fractional Freeform anchors and workspace-only history preserve document identity', () => {
  const doc = document(); doc.blocks['0,0,0'] = block(0.25); const store = session(doc), before = store.getDocument();
  applied(store.setEngineState(state => ({ ...state, pos1: { x: 0.25, y: -0.5, z: 1 }, clipboard: [block(0.25)] })));
  assert.equal(store.getDocument(), before); assert.equal(store.getSnapshot().workspace.pos1!.x, 0.25);
  applied(store.undo()); assert.equal(store.getDocument(), before); assert.equal(store.getSnapshot().workspace.pos1, null);
  applied(store.redo()); assert.equal(store.getDocument(), before); assert.equal(store.getSnapshot().workspace.clipboard[0].position.x, 0.25);
});

test('workspace rejects invalid positions, missing definitions, duplicate anchors and malformed blocks atomically', () => {
  const changes: Partial<WorldEditEngineState>[] = [
    { pos1: { x: Infinity, y: 0, z: 0 } }, { pos2: { x: NaN, y: 0, z: 0 } }, { pos1: { x: 1_000_001, y: 0, z: 0 } },
    { clipboard: [block(), { ...block(), id: 'duplicate' }] }, { clipboard: [{ ...block(), blockDefId: 'missing' }] },
    { clipboard: [{ ...block(), rotation: 45 as 0 }] }, { clipboardCustomDefs: [document().customBlocks.cobble_brick, document().customBlocks.cobble_brick] },
  ];
  for (const change of changes) { const store = session(), before = content(store); rejected(store.setEngineState(state => ({ ...state, ...change }))); assert.equal(content(store), before); }
});

test('clipboard definitions survive removal of a current-world definition and complete undo', () => {
  const doc = document(); doc.blueprints = [];
  const store = session(doc), original = store.getDocument().customBlocks.cobble_brick;
  applied(store.transaction('Keep clipboard definition', () => {
    store.setEngineState(state => ({ ...state, clipboard: [block()], clipboardCustomDefs: [original] }));
    store.setDocumentField('customBlocks', defs => { const next = { ...defs }; delete next.cobble_brick; return next; });
  }));
  assert.equal(store.getDocument().customBlocks.cobble_brick, undefined);
  assert.equal(store.getSnapshot().workspace.clipboardCustomDefs[0].id, 'cobble_brick');
  applied(store.undo()); assert.ok(store.getDocument().customBlocks.cobble_brick); assert.deepEqual(store.getSnapshot().workspace.clipboard, []);
});

test('accessors and unknown fields reject without invocation; legacy engine stacks are discarded without traversal', () => {
  const store = session(), before = content(store); let getterCalls = 0;
  const input = Object.defineProperty({}, 'sneaky', { enumerable: true, get() { getterCalls++; return 'Bad'; } });
  rejected(store.setDocumentField('extensions', input));
  const engine = { ...store.getEngineState() };
  Object.defineProperty(engine, 'pos1', { enumerable: true, get() { getterCalls++; return null; } });
  rejected(store.setEngineState(engine));
  rejected(store.setEngineState({ ...store.getEngineState(), unknown: 1 } as unknown as WorldEditEngineState));
  rejected(store.setDocumentField('revision' as 'world', 999 as unknown as StudioDocument['world']));
  assert.equal(content(store), before); assert.equal(getterCalls, 0);
  const ignored = [Object.defineProperty({}, 'blocks', { enumerable: true, get() { getterCalls++; throw new Error('must not read'); } })];
  applied(store.setEngineState({ ...store.getEngineState(), pos1: { x: 1, y: 0, z: 0 }, undoStack: ignored as WorldEditEngineState['undoStack'] }));
  assert.equal(getterCalls, 0); assert.deepEqual(store.getEngineState().undoStack, []); assert.deepEqual(store.getEngineState().redoStack, []);
});

test('tokens guard every identity dimension and reject edit-undo ABA even when content matches', () => {
  const store = session(), token = store.getToken();
  for (const bad of [{ ...token, documentId: 'other' }, { ...token, sessionId: 'other' }, { ...token, historyEpoch: 'other' }, { ...token, editRevision: 99 }]) rejected(store.transaction('Stale', () => { store.setWorldField('worldName', 'Bad'); }, bad));
  applied(store.setWorldField('worldName', 'Changed')); applied(store.undo());
  assert.equal(store.getDocument().world.worldName, 'Fixture');
  rejected(store.transaction('ABA', () => { store.setWorldField('worldName', 'Bad'); }, token));
  rejected(store.redo(token)); applied(store.redo(store.getToken()));
});

test('exclusive handles block normal writes and preserve nonwritable state on release', () => {
  const store = new StudioEditorSession(document()), handle = store.beginExclusive()!;
  assert.ok(handle); assert.equal(store.beginExclusive(), null); store.setWritable(true);
  rejected(store.transaction('Locked', () => { throw new Error('must not run'); }));
  rejected(store.setWorldField('worldName', 'Bad')); rejected(store.undo()); rejected(store.redo());
  assert.equal(store.endExclusive({ ...handle }), false); assert.equal(store.getSnapshot().exclusive, true);
  store.setWritable(false); assert.equal(store.endExclusive(handle), true); assert.equal(store.getSnapshot().writable, false);
  assert.equal(store.endExclusive(handle), false); rejected(store.setWorldField('worldName', 'Still blocked'));
});

test('verified installation validates first, rotates session, clears full history/workspace and retains lock', () => {
  const store = session(); applied(store.setEngineState(state => ({ ...state, pos1: { x: 1, y: 2, z: 3 }, clipboard: [block()] })));
  const oldToken = store.getToken(), before = content(store);
  rejected(store.installVerifiedDocument(document())); assert.equal(content(store), before);
  const handle = store.beginExclusive()!;
  rejected(store.installVerifiedDocument({ ...document(), revision: -1 })); assert.equal(content(store), before);
  const next = document(); next.documentId = 'next-project'; next.historyEpoch = 'next-epoch';
  applied(store.installVerifiedDocument(next)); assert.equal(store.getDocument().documentId, 'next-project');
  assert.notEqual(store.getToken().sessionId, oldToken.sessionId); assert.ok(store.getToken().editRevision > oldToken.editRevision);
  assert.equal(store.getSnapshot().canUndo, false); assert.equal(store.getSnapshot().canRedo, false); assert.equal(store.getSnapshot().workspace.pos1, null);
  assert.deepEqual(store.getSnapshot().workspace.clipboard, []); assert.equal(store.getSnapshot().exclusive, true);
  assert.equal(store.endExclusive(handle), true);
  rejected(store.transaction('Old session', () => { store.setWorldField('worldName', 'Bad'); }, oldToken));
});

test('authority changes, install and exclusion acquisition inside a batch abort the batch', () => {
  for (const action of ['writable', 'install', 'exclusive']) {
    const store = session(), before = store.getDocument();
    rejected(store.transaction('Interrupted', () => {
      store.setWorldField('worldName', 'Partial');
      if (action === 'writable') store.setWritable(false);
      if (action === 'install') store.installVerifiedDocument(document());
      if (action === 'exclusive') store.beginExclusive();
    }));
    assert.equal(store.getDocument(), before); assert.equal(store.getSnapshot().canUndo, false); assert.equal(store.getSnapshot().exclusive, false);
  }
});

test('combined history count bounds undo and redo and new edits clear only redo', () => {
  const store = session(document(), { maxEntries: 3, maxBytes: 16 * 1024 * 1024 });
  for (let n = 1; n <= 5; n++) applied(store.setWorldField('worldName', `Change ${n}`));
  for (let n = 0; n < 3; n++) applied(store.undo());
  assert.equal(store.getDocument().world.worldName, 'Change 2'); assert.equal(store.undo().status, 'noop');
  for (let n = 0; n < 3; n++) applied(store.redo()); assert.equal(store.redo().status, 'noop');
  applied(store.undo()); applied(store.setWorldField('worldName', 'Branch'));
  assert.equal(store.redo().status, 'noop'); applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Change 4');
});

test('byte budget retains both directions once; exact-fit Undo/Redo works and oversized changes reject atomically', () => {
  const doc = document(), label = 'Exact';
  const limit = renameHistorySize(doc, label, 'Short');
  const store = session(doc, { maxEntries: 3, maxBytes: limit });
  rejected(store.transaction(label, () => { store.setWorldField('worldName', 'Longer fixture'); }));
  assert.deepEqual(store.getDocument(), doc); assert.equal(store.getSnapshot().canUndo, false);
  applied(store.transaction(label, () => { store.setWorldField('worldName', 'Short'); }));
  applied(store.undo()); assert.deepEqual(store.getDocument(), doc); applied(store.redo());
  const tooSmall = session(doc, { maxEntries: 3, maxBytes: limit - 1 });
  rejected(tooSmall.transaction(label, () => { tooSmall.setWorldField('worldName', 'Short'); }));
  assert.equal(tooSmall.getSnapshot().canUndo, false);
});

test('byte accounting includes UTF-8 workspace payload and oldest frames are evicted within capacity', () => {
  const doc = document(), label = 'Bytes', limit = Math.max(renameHistorySize(doc, label, 'Second'), renameHistorySize(doc, label, 'Third')) + 6;
  const store = session(doc, { maxEntries: 30, maxBytes: limit });
  applied(store.transaction(label, () => { store.setWorldField('worldName', 'Second'); }));
  applied(store.transaction(label, () => { store.setWorldField('worldName', 'Third'); }));
  applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Second'); assert.equal(store.undo().status, 'noop');
  rejected(store.transaction(label, () => { store.setWorldField('worldName', '🧱'.repeat(10)); }));
  rejected(store.transaction(label, () => { store.setEngineState(state => ({ ...state, clipboard: [block()] })); }));
});

test('optional metadata absence is restored exactly through full history', () => {
  const store = session(), before = store.getDocument();
  applied(store.transaction('Remove optional fields', () => {
    store.setDocumentField('lightingConfig', undefined); store.setDocumentField('extensions', undefined); store.setWorldField('description', undefined);
  }));
  assert.equal(Object.hasOwn(store.getDocument(), 'lightingConfig'), false); assert.equal(Object.hasOwn(store.getDocument(), 'extensions'), false);
  applied(store.undo()); assert.deepEqual(store.getDocument(), before);
  applied(store.redo()); assert.equal(Object.hasOwn(store.getDocument().world, 'description'), false);
});

test('a validated project above the history allowance remains editable with small reversible changes', () => {
  const doc = document(); doc.extensions = { preserved: 'x'.repeat(20 * 1024 * 1024) };
  const store = session(doc), original = store.getDocument(), beforeWorkspace = store.getSnapshot().workspace;
  applied(store.transaction('Large project small edit', () => {
    store.setWorldField('worldName', 'A large editable project');
    store.setEngineState(state => ({ ...state, blocks: { '0,0,0': block() }, pos1: { x: 0, y: 0, z: 0 }, pos2: { x: 0, y: 0, z: 0 } }));
    store.setDocumentField('chunkConfig', config => ({ ...config, chunkSize: 8 }));
  }));
  const changed = store.getDocument(), workspace = store.getSnapshot().workspace, bytes = store.getHistoryUsage().retainedBytes;
  assert.ok(bytes < 4096, `Unchanged 20 MiB content must not be retained in this edit: ${bytes}`);
  applied(store.undo()); assert.deepEqual(store.getDocument(), original); assert.deepEqual(store.getSnapshot().workspace, beforeWorkspace);
  assert.equal(store.getHistoryUsage().retainedBytes, bytes);
  applied(store.redo()); assert.deepEqual(store.getDocument(), changed); assert.deepEqual(store.getSnapshot().workspace, workspace);
  const stable = content(store); let effects = 0;
  rejected(store.transaction('Cannot forget large original', () => { store.setDocumentField('extensions', undefined); store.afterCommit(() => { effects++; }); }));
  assert.equal(content(store), stable); assert.equal(effects, 0);
  assert.ok(Object.isFrozen(store.getHistoryUsage()));
});

test('mixed domain history follows full-state snapshots through trimming, branching, arrays and both directions', () => {
  const store = session(); type State = { document: StudioDocument; workspace: ReturnType<StudioEditorSession['getSnapshot']>['workspace'] };
  const capture = (): State => structuredClone({ document: store.getDocument(), workspace: store.getSnapshot().workspace });
  const undo: State[] = [], redo: State[] = [];
  let seed = 38917;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let i = 0; i < 90; i++) {
    const choice = (random() >>> 16) % 8;
    if (choice === 0 && undo.length) {
      redo.push(capture()); const expected = undo.pop()!; applied(store.undo()); assert.deepEqual(capture(), expected);
    } else if (choice === 1 && redo.length) {
      undo.push(capture()); const expected = redo.pop()!; applied(store.redo()); assert.deepEqual(capture(), expected);
    } else {
      const before = capture();
      switch (choice % 5) {
        case 0: applied(store.setWorldField('worldName', `Build Ω ${i}`)); break;
        case 1: applied(store.setDocumentField('extensions', { notes: { steps: Array.from({ length: i % 7 }, (_, n) => ({ n, label: `step ${i}` })) }, i })); break;
        case 2: applied(store.setEngineState(s => ({ ...s, blocks: { ...s.blocks, [`${i},0,0`]: block(i) }, pos1: { x: i, y: 0, z: 0 } }))); break;
        case 3: {
          const emptySlice = i % 2 && !store.getDocument().blueprints.length;
          const result = store.setDocumentField('blueprints', values => i % 2 ? values.slice(1) : [...values, { ...document().blueprints[0], id: `bp-${i}`, name: `Inserted ${i}` }]);
          if (emptySlice) assert.equal(result.status, 'noop'); else applied(result);
          break;
        }
        case 4: applied(store.setDocumentField('patternConfig', c => ({ ...c, seed: i + 77 }))); break;
      }
      // A slice of an already empty array is a valid no-op; it cannot consume history.
      const changed = JSON.stringify(before) !== JSON.stringify(capture());
      if (changed) { undo.push(before); redo.length = 0; if (undo.length > 30) undo.shift(); }
    }
    assert.equal(store.getSnapshot().canUndo, undo.length > 0); assert.equal(store.getSnapshot().canRedo, redo.length > 0);
    assert.equal(store.getHistoryUsage().undoEntries, undo.length); assert.equal(store.getHistoryUsage().redoEntries, redo.length);
  }
  while (undo.length) { redo.push(capture()); const expected = undo.pop()!; applied(store.undo()); assert.deepEqual(capture(), expected); }
  while (redo.length) { undo.push(capture()); const expected = redo.pop()!; applied(store.redo()); assert.deepEqual(capture(), expected); }
});

test('durable acknowledgement preserves later authored edits, workspace, history and the live token', () => {
  const store = session(); applied(store.setWorldField('worldName', 'Saved candidate'));
  const source = store.getToken(), saved = durable(store.getDocument());
  applied(store.setWorldField('worldName', 'Newer edit')); applied(store.setEngineState(state => ({ ...state, pos1: { x: 2, y: 0, z: 0 } })));
  const before = store.getSnapshot(), token = store.getToken();
  applied(store.acknowledgeDurable(saved, source));
  assert.equal(store.getDocument().world.worldName, 'Newer edit'); assert.equal(store.getDocument().revision, 8);
  assert.equal(store.getSnapshot().workspace, before.workspace); assert.deepEqual(store.getToken(), token);
  applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Newer edit'); assert.equal(store.getDocument().revision, 8);
  applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Saved candidate'); assert.equal(store.getDocument().savedAt, saved.savedAt);
  applied(store.redo()); assert.equal(store.getDocument().world.worldName, 'Newer edit'); assert.equal(store.getDocument().revision, 8);
});

test('save acknowledgement after undo does not change redo and survives exact-fit history budgets', () => {
  const doc = document(), label = 'Exact', store = session(doc, { maxEntries: 3, maxBytes: renameHistorySize(doc, label, 'Short') });
  applied(store.transaction(label, () => { store.setWorldField('worldName', 'Short'); }));
  const source = store.getToken(), saved = durable(store.getDocument()); applied(store.undo());
  const token = store.getToken(); applied(store.acknowledgeDurable(saved, source));
  assert.deepEqual(store.getToken(), token); assert.equal(store.getSnapshot().canRedo, true);
  applied(store.redo()); assert.equal(store.getDocument().world.worldName, 'Short'); assert.equal(store.getDocument().revision, 8);
  applied(store.undo()); assert.equal(store.getDocument().world.worldName, 'Fixture');
});

test('durable receipts reject foreign sessions, future edit counters, regressions and conflicts without changing history', () => {
  const store = session(), source = store.getToken(), saved = durable(store.getDocument());
  applied(store.acknowledgeDurable(saved, source)); const before = content(store);
  for (const token of [{ ...source, sessionId: 'foreign' }, { ...source, historyEpoch: 'foreign' }, { ...source, documentId: 'foreign' }, { ...source, editRevision: 999 }]) rejected(store.acknowledgeDurable(durable(saved), token));
  rejected(store.acknowledgeDurable(document(), source));
  rejected(store.acknowledgeDurable({ ...saved, savedAt: '2026-11-01T13:00:00Z' }, source));
  rejected(store.acknowledgeDurable({ ...saved, documentId: 'foreign' }, source));
  assert.equal(store.acknowledgeDurable(saved, source).status, 'noop'); assert.equal(content(store), before);
  const handle = store.beginExclusive()!; applied(store.installVerifiedDocument(document())); store.endExclusive(handle);
  const installed = content(store); rejected(store.acknowledgeDurable(saved, source)); assert.equal(content(store), installed);
});

test('trusted durable receipts may arrive while nonwritable or excluded, but cannot reenter an edit batch', () => {
  const store = session(), token = store.getToken(), saved = durable(store.getDocument());
  store.setWritable(false); const handle = store.beginExclusive()!; applied(store.acknowledgeDurable(saved, token));
  assert.equal(store.getSnapshot().exclusive, true); assert.equal(store.getSnapshot().writable, false);
  store.endExclusive(handle); store.setWritable(true); const before = content(store);
  rejected(store.transaction('No acknowledgement reentry', () => { store.setWorldField('worldName', 'Partial'); store.acknowledgeDurable(durable(saved), store.getToken()); }));
  assert.equal(content(store), before);
});

test('native rejected Promises are drained after rejecting the batch, without invoking thenable getters', async () => {
  const store = session(), before = content(store);
  rejected(store.transaction('Rejected promise', () => { store.setWorldField('worldName', 'Partial'); return Promise.reject(new Error('Expected async rejection')); }));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(content(store), before);
});

test('malformed identity accessors and additional undefined fields cannot bypass token shape checks', () => {
  const store = session(), original = store.getToken(), before = content(store); let getterCalls = 0;
  const accessor = { ...original };
  Object.defineProperty(accessor, 'sessionId', { enumerable: true, get() { getterCalls++; return original.sessionId; } });
  for (const token of [accessor, { ...original, unknown: undefined }, { ...original, editRevision: NaN }, null]) {
    rejected(store.transaction('Bad token', () => { store.setWorldField('worldName', 'Bad'); }, token as StudioEditorToken));
    rejected(store.acknowledgeDurable(durable(store.getDocument()), token as StudioEditorToken));
  }
  assert.equal(getterCalls, 0); assert.equal(content(store), before);
});

test('clipboard count limits reject before visiting oversized array entries', () => {
  const store = session(), before = content(store); let getterCalls = 0;
  const clipboard: PlacedBlock[] = new Array(100_001);
  Object.defineProperty(clipboard, '0', { enumerable: true, get() { getterCalls++; return block(); } });
  rejected(store.setEngineState({ ...store.getEngineState(), clipboard }));
  const defs = new Array(4_097);
  Object.defineProperty(defs, '0', { enumerable: true, get() { getterCalls++; return document().customBlocks.cobble_brick; } });
  rejected(store.setEngineState({ ...store.getEngineState(), clipboardCustomDefs: defs }));
  assert.equal(getterCalls, 0); assert.equal(content(store), before);
});
