import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from '../lib/studioDocument.test-fixtures';
import type { StudioDocument } from '../lib/studioDocument';
import {
  applyStudioAction, createStudioActionState, getStudioActionHistoryBytes, getStudioActionToken,
  STUDIO_ACTION_LIMITS, type StudioAction, type StudioActionState, type StudioActionToken,
} from './studioActions';

function document(): StudioDocument {
  const doc = makeStudioDocument();
  doc.blocks = {};
  doc.revision = 41;
  doc.extensions = { sourceNotes: { tags: ['kept', 'verbatim'], detail: { author: 'fixture' } } };
  return doc;
}
function session(doc = document(), budget?: StudioActionState['historyBudget']): StudioActionState {
  const created = createStudioActionState(doc, 'session-fixture', budget);
  if (!created.ok) throw new Error(created.error.message);
  return created.state;
}
const origin = { x: 0, y: 0, z: 0 };
const cobble = { blockDefId: 'cobble_brick', rotation: 0 as const };
function place(x = 0): StudioAction { return { type: 'place', position: { x, y: 0, z: 0 }, placement: cobble }; }
function apply(state: StudioActionState, action: StudioAction): StudioActionState {
  const result = applyStudioAction(state, getStudioActionToken(state), action);
  assert.equal(result.status, 'applied', result.status === 'rejected' ? result.error.message : 'expected applied');
  return result.state;
}
function reject(state: StudioActionState, action: unknown, expected: unknown = getStudioActionToken(state), code?: string) {
  const before = JSON.stringify(state);
  const result = applyStudioAction(state, expected as StudioActionToken, action as StudioAction);
  assert.equal(result.status, 'rejected');
  assert.equal(result.state, state);
  if (code && result.status === 'rejected') assert.equal(result.error.code, code);
  assert.equal(JSON.stringify(state), before);
  return result;
}

test('factory validates the full authored document and exposes only an isolated Freeform session', () => {
  const original = document(), state = session(original);
  assert.deepEqual(state.document, original);
  original.world.worldName = 'Changed outside';
  original.extensions!.sourceNotes = null;
  assert.equal(state.document.world.worldName, 'Fixture');
  assert.ok(state.document.extensions!.sourceNotes);
  assert.equal(state.mode, 'freeform-only');
  assert.equal(state.editRevision, 0); assert.equal(state.document.revision, 41);
  assert.ok(Object.isFrozen(state)); assert.ok(Object.isFrozen(state.document.world));
  assert.ok(Object.isFrozen(getStudioActionToken(state)));
  assert.equal(createStudioActionState({ ...document(), profile: 'java' }, 'session').ok, false);
  assert.equal(createStudioActionState(document(), '').ok, false);
  assert.equal(createStudioActionState(document(), 'session', { maxEntries: 31, maxBytes: 1 }).ok, false);
});

test('place and erase produce deterministic IDs, one history entry, and a monotonic live revision', () => {
  const initial = session(), placed = apply(initial, place(-3));
  assert.deepEqual(placed.document.blocks['-3,0,0'], { id: 'blk_-3_0_0', position: { x: -3, y: 0, z: 0 }, ...cobble });
  assert.equal(placed.editRevision, 1); assert.equal(placed.document.revision, 41);
  assert.equal(placed.undoStack.length, 1); assert.equal(placed.redoStack.length, 0);
  assert.deepEqual(placed, apply(initial, place(-3)));
  const erased = apply(placed, { type: 'erase', position: { x: -3, y: 0, z: 0 } });
  assert.deepEqual(erased.document.blocks, {});
  assert.equal(erased.editRevision, 2); assert.equal(erased.undoStack.length, 2);
});

test('paint has explicit override removal and leaves other authored fields intact', () => {
  const placed = apply(session(), place());
  const painted = apply(placed, { type: 'paint', position: origin, appearance: { colorOverride: '#123456', textureOverride: 'oak_planks', materialOverride: 'matte' } });
  assert.equal(painted.document.blocks['0,0,0'].colorOverride, '#123456');
  const cleared = apply(painted, { type: 'paint', position: origin, appearance: { colorOverride: null } });
  assert.equal(Object.hasOwn(cleared.document.blocks['0,0,0'], 'colorOverride'), false);
  assert.equal(cleared.document.blocks['0,0,0'].textureOverride, 'oak_planks');
  assert.deepEqual(cleared.document.world, placed.document.world);
  assert.deepEqual(cleared.document.customBlocks, placed.document.customBlocks);
});

test('complete authored snapshots and undo/redo preserve world, definitions, library, configurations and extensions', () => {
  const initial = session(), placed = apply(initial, place());
  const snapshot = JSON.parse(placed.undoStack[0].authoredJson);
  const { format: _format, schemaVersion: _schema, documentId: _id, revision: _revision,
    historyEpoch: _epoch, savedAt: _savedAt, ...authored } = initial.document;
  assert.deepEqual(snapshot, authored);
  assert.deepEqual(snapshot.blueprints, initial.document.blueprints);
  assert.deepEqual(snapshot.lightingConfig, initial.document.lightingConfig);
  const undone = apply(placed, { type: 'undo' });
  assert.deepEqual(undone.document, initial.document);
  assert.equal(undone.editRevision, 2); assert.equal(undone.document.revision, 41);
  assert.equal(undone.undoStack.length, 0); assert.equal(undone.redoStack.length, 1);
  const redone = apply(undone, { type: 'redo' });
  assert.deepEqual(redone.document, placed.document);
  assert.equal(redone.editRevision, 3); assert.equal(redone.document.revision, 41);
  assert.equal(redone.undoStack.length, 1); assert.equal(redone.redoStack.length, 0);
});

test('undo preserves newer durable revision and timestamp while restoring authored content', () => {
  const initial = session(), placed = apply(initial, place());
  // Model a future persistence acknowledgement; there is deliberately no replacement action.
  const acknowledged = { ...placed, document: { ...placed.document, revision: 42, savedAt: '2026-11-01T13:00:00.000Z' } };
  const undone = apply(acknowledged, { type: 'undo' });
  assert.deepEqual(undone.document, { ...initial.document, revision: 42, savedAt: '2026-11-01T13:00:00.000Z' });
  assert.equal(undone.editRevision, 2);
});

test('optional authored metadata stays exactly absent across edit, undo and redo', () => {
  const doc = document(); delete doc.lightingConfig; delete doc.extensions; delete doc.world.description;
  const initial = session(doc), edited = apply(initial, place());
  const undone = apply(edited, { type: 'undo' }), redone = apply(undone, { type: 'redo' });
  for (const state of [initial, edited, undone, redone]) {
    assert.equal(Object.hasOwn(state.document, 'lightingConfig'), false);
    assert.equal(Object.hasOwn(state.document, 'extensions'), false);
    assert.equal(Object.hasOwn(state.document.world, 'description'), false);
  }
  assert.deepEqual(undone.document, doc);
});

test('mutable input aliases are neither retained nor frozen by the action boundary', () => {
  const initial = session();
  const scale = { x: 2, y: 1, z: 1 };
  const action: StudioAction = { type: 'place', position: { ...origin }, placement: { ...cobble, customScale: scale } };
  const placed = apply(initial, action);
  scale.x = 3;
  assert.equal(placed.document.blocks['0,0,0'].customScale!.x, 2);
  const mutable = structuredClone(placed);
  const next = apply(mutable, place(2));
  assert.equal(Object.isFrozen(mutable.undoStack[0]), false);
  assert.equal(Object.isFrozen(mutable.undoStack[0].source), false);
  assert.equal(Object.isFrozen(mutable.historyBudget), false);
  (mutable.undoStack[0].source as { documentId: string }).documentId = 'changed-outside';
  assert.equal(next.undoStack[0].source.documentId, 'project-fixture');
});

test('no-op place, paint, erase and fill preserve exact state identity, revision and redo', () => {
  let state = apply(session(), place());
  state = apply(state, place(2));
  state = apply(state, { type: 'undo' });
  for (const action of [place(), { type: 'erase', position: { x: 99, y: 0, z: 0 } },
    { type: 'paint', position: origin, appearance: {} }, { type: 'paint', position: origin, appearance: { colorOverride: null } },
    { type: 'fill', bounds: { min: origin, max: origin }, placement: cobble }] as StudioAction[]) {
    const result = applyStudioAction(state, getStudioActionToken(state), action);
    assert.equal(result.status, 'noop'); assert.equal(result.state, state);
    assert.equal(state.redoStack.length, 1); assert.equal(state.editRevision, 3);
  }
  const changed = apply(state, place(4));
  assert.equal(changed.redoStack.length, 0);
});

test('tokens bind document, live revision, session and history epoch, including edit-undo ABA', () => {
  const initial = session(), basis = getStudioActionToken(initial);
  let state = apply(initial, place()); state = apply(state, { type: 'undo' });
  assert.deepEqual(state.document, initial.document);
  reject(state, place(), basis, 'stale-action');
  for (const patch of [{ documentId: 'another' }, { sessionId: 'reopened-session' }, { historyEpoch: 'new-epoch' }, { editRevision: state.editRevision + 1 }]) {
    reject(state, place(), { ...getStudioActionToken(state), ...patch }, 'stale-action');
  }
  reject(state, place(), { ...getStudioActionToken(state), unexpected: true }, 'invalid-action');
  reject(state, place(), { ...getStudioActionToken(state), editRevision: NaN }, 'invalid-action');
});

test('fill uses explicit ordered inclusive bounds, replaces atomically and records one predecessor', () => {
  const initial = session();
  const filled = apply(initial, { type: 'fill', bounds: { min: { x: -2, y: 1, z: 3 }, max: { x: 0, y: 2, z: 4 } }, placement: cobble });
  assert.equal(Object.keys(filled.document.blocks).length, 12);
  assert.ok(filled.document.blocks['-2,1,3']); assert.ok(filled.document.blocks['0,2,4']);
  assert.equal(filled.undoStack.length, 1);
  assert.deepEqual(apply(filled, { type: 'undo' }).document, initial.document);
});

test('nonfinite, fractional, extreme or unordered coordinates and oversized dense regions reject before enumeration', () => {
  const state = session();
  for (const x of [NaN, Infinity, -Infinity, 0.5, 1_000_001, Number.MAX_SAFE_INTEGER]) {
    reject(state, { ...place(), position: { x, y: 0, z: 0 } }, undefined, 'invalid-action');
    reject(state, { type: 'fill', bounds: { min: origin, max: { x, y: 0, z: 0 } }, placement: cobble }, undefined, 'invalid-action');
  }
  reject(state, { type: 'fill', bounds: { min: origin, max: { x: 999, y: 999, z: 999 } }, placement: cobble }, undefined, 'invalid-action');
  reject(state, { type: 'fill', bounds: { min: { x: 1, y: 0, z: 0 }, max: origin }, placement: cobble }, undefined, 'invalid-action');
});

test('invalid definitions, material fields and scale reject atomically, including paint on an empty slot', () => {
  const state = session();
  for (const placement of [{ ...cobble, blockDefId: 'missing' }, { ...cobble, rotation: 45 },
    { ...cobble, colorOverride: 'nope' }, { ...cobble, textureOverride: 'unknown' },
    { ...cobble, customScale: { x: Infinity, y: 1, z: 1 } }, { ...cobble, customScale: { x: 0, y: 1, z: 1 } }]) {
    reject(state, { type: 'place', position: origin, placement });
    reject(state, { type: 'fill', bounds: { min: origin, max: { x: 99, y: 99, z: 9 } }, placement });
  }
  reject(state, { type: 'paint', position: origin, appearance: { colorOverride: 'bad color' } }, undefined, 'invalid-document');
  const empty = document(); empty.customBlocks = {}; empty.blueprints = [];
  const emptyState = session(empty);
  assert.equal(applyStudioAction(emptyState, getStudioActionToken(emptyState), { type: 'paint', position: origin, appearance: { colorOverride: null } }).status, 'noop');
});

test('unknown actions and unsupported fields never acquire target authority from opaque extensions', () => {
  const doc = document(); doc.extensions = { claimedProfile: { locked: true, qualified: true } };
  const state = session(doc);
  for (const action of [null, {}, { type: 'replace', document: doc }, { type: 'set-profile', locked: true },
    { ...place(), arbitrary: true }, { type: 'place', position: { ...origin, w: 0 }, placement: cobble },
    { type: 'paint', position: origin, appearance: { colorOverride: undefined } },
    { type: 'place', position: origin, placement: { ...cobble, entities: [] } }]) reject(state, action, undefined, 'invalid-action');
  const accepted = apply(state, place());
  assert.equal(accepted.mode, 'freeform-only'); assert.deepEqual(accepted.document.extensions, doc.extensions);
});

test('accessors are not invoked and malformed runtime action data does not mutate state', () => {
  const state = session(); let invoked = false;
  const action = { ...place() };
  Object.defineProperty(action, 'placement', { get() { invoked = true; return cobble; }, enumerable: true });
  reject(state, action); assert.equal(invoked, false);
  reject(state, { ...place(), position: Object.create(origin) });
  reject(state, { type: 'undo', [Symbol('payload')]: true });
});

test('combined undo and redo count stays bounded and no-op cannot evict history', () => {
  let state = session(document(), { maxEntries: 3, maxBytes: STUDIO_ACTION_LIMITS.maxHistoryBytes });
  for (let i = 0; i < 5; i++) state = apply(state, place(i));
  assert.equal(state.undoStack.length, 3);
  state = apply(state, { type: 'undo' }); state = apply(state, { type: 'undo' });
  assert.equal(state.undoStack.length + state.redoStack.length, 3);
  state = apply(state, { type: 'redo' });
  assert.equal(state.undoStack.length + state.redoStack.length, 3);
  const noop = applyStudioAction(state, getStudioActionToken(state), { type: 'erase', position: { x: 100, y: 0, z: 0 } });
  assert.equal(noop.state, state);
});

test('history byte budget evicts only older entries and rejects an unretainable predecessor', () => {
  const base = session(), one = apply(base, place());
  const frameBytes = getStudioActionHistoryBytes(one);
  let bounded = session(document(), { maxEntries: 30, maxBytes: frameBytes * 2 + 1000 });
  for (let i = 0; i < 5; i++) bounded = apply(bounded, place(i));
  assert.ok(getStudioActionHistoryBytes(bounded) <= bounded.historyBudget.maxBytes);
  assert.ok(bounded.undoStack.length < 5);
  const tiny = session(document(), { maxEntries: 30, maxBytes: 1 });
  reject(tiny, place(), undefined, 'history-limit');
  const barely = session(document(), { maxEntries: 30, maxBytes: frameBytes });
  reject(barely, place(), undefined, 'history-limit'); // The larger result must be retainable for redo too.
});

test('history bytes include multibyte Unicode payload and both stacks', () => {
  const doc = document(); doc.world.description = '界\u{1F600}'.repeat(100);
  let state = apply(session(doc), place()); state = apply(state, place(1)); state = apply(state, { type: 'undo' });
  const independent = [...state.undoStack, ...state.redoStack].reduce((total, frame) => total
    + Buffer.byteLength(frame.authoredJson, 'utf8') + Buffer.byteLength(JSON.stringify({ label: frame.label,
      source: { ...frame.source, editRevision: Number.MAX_SAFE_INTEGER } }), 'utf8'), 0);
  assert.equal(getStudioActionHistoryBytes(state), independent);
});

test('corrupt, foreign-epoch and forged over-budget history fail without applying any snapshot', () => {
  const valid = apply(session(), place()), frame = valid.undoStack[0];
  reject({ ...valid, undoStack: [{ ...frame, authoredJson: '{broken' }] }, { type: 'undo' }, undefined, 'invalid-state');
  reject({ ...valid, undoStack: [{ ...frame, source: { ...frame.source, historyEpoch: 'different' } }] }, { type: 'undo' }, undefined, 'invalid-state');
  const foreign = { ...JSON.parse(frame.authoredJson), documentId: 'other-project' };
  reject({ ...valid, undoStack: [{ ...frame, authoredJson: JSON.stringify(foreign) }] }, { type: 'undo' }, undefined, 'invalid-state');
  reject({ ...valid, historyBudget: { maxEntries: 1, maxBytes: 1 } }, { type: 'undo' }, undefined, 'invalid-state');
  reject({ ...valid, undoStack: new Array(1) }, { type: 'undo' }, undefined, 'invalid-state');
});

test('empty history and exhausted live revision reject without rewinding durable identity', () => {
  const state = session();
  reject(state, { type: 'undo' }, undefined, 'history-unavailable');
  reject(state, { type: 'redo' }, undefined, 'history-unavailable');
  const exhausted = { ...state, editRevision: Number.MAX_SAFE_INTEGER };
  reject(exhausted, place(), undefined, 'revision-limit');
  assert.equal(exhausted.document.revision, 41);
});

test('exact-fit history remains undoable across live-counter digit growth and durable acknowledgements', () => {
  const doc = document();
  doc.blocks['0,0,0'] = { id: 'initial', position: origin, ...cobble };
  const measured = apply(session(doc), { type: 'erase', position: origin });
  const byteBudget = getStudioActionHistoryBytes(measured);
  const start = { ...session(doc, { maxEntries: 30, maxBytes: byteBudget }), editRevision: 8 };
  const erased = apply(start, { type: 'erase', position: origin });
  assert.equal(erased.editRevision, 9);
  const acknowledged = { ...erased, document: { ...erased.document, revision: Number.MAX_SAFE_INTEGER, savedAt: '2026-11-01T12:00:00.000+00:00' } };
  const undone = apply(acknowledged, { type: 'undo' });
  assert.equal(undone.editRevision, 10); assert.deepEqual(undone.document.blocks, doc.blocks);
  assert.equal(undone.document.revision, Number.MAX_SAFE_INTEGER);
  const redone = apply(undone, { type: 'redo' });
  assert.equal(redone.editRevision, 11); assert.deepEqual(redone.document.blocks, {});
  assert.ok(getStudioActionHistoryBytes(redone) <= byteBudget);
});

test('place and fill allocate deterministic collision-free IDs after imports or legacy moves', () => {
  const doc = document();
  doc.blocks['5,0,0'] = { id: 'blk_0_0_0', position: { x: 5, y: 0, z: 0 }, ...cobble };
  doc.blocks['6,0,0'] = { id: 'blk_0_0_0:1', position: { x: 6, y: 0, z: 0 }, ...cobble };
  doc.blocks['7,0,0'] = { id: 'blk_1_0_0', position: { x: 7, y: 0, z: 0 }, ...cobble };
  const initial = session(doc), placed = apply(initial, place());
  assert.equal(placed.document.blocks['0,0,0'].id, 'blk_0_0_0:2');
  const fill: StudioAction = { type: 'fill', bounds: { min: origin, max: { x: 1, y: 0, z: 0 } }, placement: { blockDefId: 'oak_plank', rotation: 0 } };
  const filled = apply(placed, fill);
  assert.equal(filled.document.blocks['0,0,0'].id, 'blk_0_0_0:2');
  assert.equal(filled.document.blocks['1,0,0'].id, 'blk_1_0_0:1');
  assert.deepEqual(apply(placed, fill), filled);
  assert.equal(new Set(Object.values(filled.document.blocks).map(block => block.id)).size, 5);
});

test('exact 100000-cell fill succeeds and total document capacity rejects further additions', () => {
  const doc = document(); doc.blueprints = [];
  const state = apply(session(doc), { type: 'fill', bounds: { min: origin, max: { x: 999, y: 99, z: 0 } }, placement: cobble });
  assert.equal(Object.keys(state.document.blocks).length, 100_000);
  assert.equal(state.undoStack.length, 1);
  reject(state, place(-1), undefined, 'invalid-document');
  reject(state, { type: 'fill', bounds: { min: { x: -2, y: 0, z: 0 }, max: origin }, placement: cobble }, undefined, 'invalid-document');
});
