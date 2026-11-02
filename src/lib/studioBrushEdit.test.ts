import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStudioBrush, studioSymmetryTargets, SINGLE_CELL_BRUSH, type StudioBrushOptions } from './studioBrushEdit';
import { StudioEditorSession, type StudioEditorToken } from './studioEditorSession';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { validateStudioDocument, type StudioDocument } from './studioDocument';
import { candidateJavaTarget } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';
import { DEFAULT_SYMMETRY_CONFIG, recordBlockRemovalForLingerLearning, createInitialAdaptivePatternArchive } from '../engine/spatialCopilotEngine';
import type { SymmetryConfig } from '../engine/types';

function document(locked = false) {
  const d = makeStudioDocument('brush-fixture'); d.blocks = {}; d.blueprints = [];
  const unit = { ...d.customBlocks.cobble_brick, id: 'unit', name: 'Brush unit', shape: 'cube' as const, width: 1, depth: 1, heightPlates: 3, hasStuds: false };
  delete unit.voxels; delete unit.defaultScale;
  d.customBlocks = { unit, unused: { ...unit, id: 'unused', name: 'Unmapped' } };
  d.patternConfig.smartPlacementPrediction = false; d.extensions = { keep: ['brush fixture', { exact: true }] };
  if (locked) {
    const captured = captureJavaDefinitionBinding(unit, 'minecraft:stone'); assert.ok(captured.ok);
    const previous = structuredClone(d); d.schemaVersion = 2; d.revision = 1; d.historyEpoch = 'locked-epoch';
    d.targetPolicy = { policyVersion: 1, checkpoint: { documentId: previous.documentId, revision: previous.revision, historyEpoch: previous.historyEpoch }, target: candidateJavaTarget([captured.binding]) };
  }
  assert.ok(validateStudioDocument(d).ok); return d;
}
function session(d = document()) { const s = new StudioEditorSession(d); s.setWritable(true); return s; }
function options(change: Partial<StudioBrushOptions> = {}): StudioBrushOptions {
  return { center: { x: 4, y: 8, z: 4 }, mode: 'brush_place', brush: { shape: 'cube', radius: 1, height: 2, hollow: false, airOnly: false },
    activeBlockId: 'unit', rotation: 0, symmetry: { ...DEFAULT_SYMMETRY_CONFIG }, ...change };
}
const mirror = (mode: SymmetryConfig['mode'], pivotX = 0, pivotZ = 0) => ({ ...DEFAULT_SYMMETRY_CONFIG, mode, pivotX, pivotZ });
function stable(s: StudioEditorSession) { return JSON.stringify({ document: s.getDocument(), workspace: s.getSnapshot().workspace, token: s.getToken(), history: s.getHistoryUsage() }); }
function commit(s: StudioEditorSession, o: StudioBrushOptions, effect: (count: number) => void = () => {}, token: StudioEditorToken = s.getToken()) {
  return s.transaction('Brush fixture', () => {
    const p = prepareStudioBrush(s.getDocument(), s.getEngineState(), o);
    s.setEngineState(p.state); s.setDocumentField('chunkConfig', p.chunkConfig);
    s.afterCommit(() => effect(p.affectedCount));
  }, token);
}

test('four mirrored brushes commit complete cells/chunks as one history step with exact Undo and Redo', () => {
  const s = session(), original = JSON.stringify(s.getDocument()), o = options({ center: { x: 18, y: 8, z: 18 }, symmetry: mirror('quad_xz') }); let changed = 0;
  const p = prepareStudioBrush(s.getDocument(), s.getEngineState(), o);
  assert.equal(p.affectedCount, 108); assert.equal(Object.keys(p.state.blocks).length, 108);
  assert.deepEqual(p.state.undoStack, []); assert.deepEqual(p.state.redoStack, []);
  assert.equal(JSON.stringify(s.getDocument()), original, 'Preparation mutated the source.');
  assert.equal(commit(s, o, n => { changed = n; }).status, 'applied'); assert.equal(changed, 108);
  assert.equal(s.getHistoryUsage().undoEntries, 1);
  for (const key of ['1,1', '-1,1', '1,-1', '-1,-1']) assert.equal(s.getDocument().chunkConfig.activeChunks[key], true);
  const after = JSON.stringify(s.getDocument());
  assert.equal(s.undo().status, 'applied'); assert.equal(JSON.stringify(s.getDocument()), original);
  assert.equal(s.redo().status, 'applied'); assert.equal(JSON.stringify(s.getDocument()), after);
});

test('overlapping mirrors count unique final cells and repeat without identity/history/Redo churn', () => {
  const s = session(), o = options({ center: { x: 1, y: 5, z: 1 }, symmetry: mirror('quad_xz') });
  assert.equal(commit(s, o).status, 'applied'); assert.equal(Object.keys(s.getDocument().blocks).length, 75);
  s.setWorldField('worldName', 'Pending change'); s.undo(); const before = stable(s); let effects = 0;
  const p = prepareStudioBrush(s.getDocument(), s.getEngineState(), o); assert.equal(p.affectedCount, 0); assert.equal(p.state, s.getEngineState());
  assert.equal(commit(s, o, () => { effects++; }).status, 'noop'); assert.equal(effects, 0); assert.equal(stable(s), before);
  assert.equal(s.redo().status, 'applied'); assert.equal(s.getDocument().world.worldName, 'Pending change');
});

test('brush erase exposes actual removed cells once, including non-center linger-watch cells', () => {
  const s = session(), o = options({ center: { x: 1, y: 5, z: 0 }, symmetry: mirror('mirror_x') });
  assert.equal(commit(s, o).status, 'applied'); const prior = JSON.stringify(s.getDocument());
  const p = prepareStudioBrush(s.getDocument(), s.getEngineState(), { ...o, mode: 'brush_erase' });
  assert.equal(p.affectedCount, 45); assert.equal(new Set(p.changedCoords.map(v => `${v.x},${v.y},${v.z}`)).size, 45);
  const archive = createInitialAdaptivePatternArchive(), patternKey = Object.keys(archive.patterns)[0];
  archive.lingerWatchList = [{ coordKeyStr: '2,4,1', position: { x: 2, y: 4, z: 1 }, blockDefId: 'unit', objectClassId: 'house_dwelling', patternKey, placedAt: 1000, expiresAt: 5000 }];
  const learned = recordBlockRemovalForLingerLearning({ archive, removedCoords: p.changedCoords, nowMs: 2000 });
  assert.equal(learned.penalizedCount, 1);
  assert.equal(commit(s, { ...o, mode: 'brush_erase' }).status, 'applied'); assert.deepEqual(s.getDocument().blocks, {});
  assert.equal(s.undo().status, 'applied'); assert.equal(JSON.stringify(s.getDocument()), prior);
});

test('final mirrored extent failure leaves document/workspace/token/history/effects unchanged', () => {
  const s = session(), o = options({ center: { x: 0, y: 4, z: 0 }, symmetry: mirror('mirror_x', 500_000) }), before = stable(s); let effects = 0;
  assert.equal(commit(s, o, () => { effects++; }).status, 'rejected'); assert.equal(stable(s), before); assert.equal(effects, 0);
});

test('negative brush coordinates retain every in-bounds layer without a hidden floor clip', () => {
  const s = session(); assert.equal(commit(s, options({ center: { x: -4, y: -16, z: -4 } })).status, 'applied');
  assert.equal(Object.keys(s.getDocument().blocks).length, 27);
  for (const y of [-17, -16, -15]) assert.equal(Object.values(s.getDocument().blocks).filter(b => b.position.y === y).length, 9);
});

test('whole and half-cell reflection is exact and other pivots reject without rounding', () => {
  const d = document(), center = { x: -2, y: 4, z: 3 };
  assert.deepEqual(studioSymmetryTargets(d, center, 90, mirror('mirror_x', .5)).map(t => t.coord.x), [-2, 3]);
  assert.deepEqual(studioSymmetryTargets(d, center, 0, mirror('mirror_z', 0, -.5)).map(t => t.coord.z), [3, -4]);
  for (const mode of ['mirror_x', 'mirror_z', 'quad_xz'] as const) assert.throws(() => studioSymmetryTargets(d, center, 0, mirror(mode, .25, .25)), /whole or half/);
});

test('Freeform retains reflected rotations while the exact locked directionless profile keeps rotation zero', () => {
  const center = { x: 2, y: 4, z: 3 };
  assert.deepEqual(studioSymmetryTargets(document(), center, 0, mirror('quad_xz')).map(t => t.rotation), [0, 0, 180, 180]);
  const locked = session(document(true)), before = locked.getDocument().targetPolicy;
  assert.equal(commit(locked, options({ center, symmetry: mirror('quad_xz') })).status, 'applied');
  assert.equal(Object.keys(locked.getDocument().blocks).length, 108);
  assert.ok(Object.values(locked.getDocument().blocks).every(b => b.rotation === 0 && b.colorOverride === undefined && b.textureOverride === undefined));
  assert.deepEqual(locked.getDocument().targetPolicy, before); assert.ok(validateStudioDocument(locked.getDocument()).ok);
  assert.equal(locked.undo().status, 'applied'); assert.deepEqual(locked.getDocument().blocks, {});
  assert.equal(locked.redo().status, 'applied'); assert.ok(validateStudioDocument(locked.getDocument()).ok);
});

test('locked unmapped, scaled and rotated proposals reject atomically without effects or policy changes', () => {
  for (const change of [{ activeBlockId: 'unused' }, { customScale: { x: 2, y: 1, z: 1 } }, { rotation: 90 as const }]) {
    const s = session(document(true)), before = stable(s); let effects = 0;
    assert.equal(commit(s, options({ symmetry: mirror('quad_xz'), ...change }), () => { effects++; }).status, 'rejected');
    assert.equal(stable(s), before); assert.equal(effects, 0);
  }
});

test('all brush shapes, hollow and empty-only flags preserve exact cell sets and erase no-ops', () => {
  for (const [shape, hollow, count] of [['cube', false, 27], ['cube', true, 26], ['sphere', false, 7], ['cylinder', false, 10], ['diamond', false, 19]] as const) {
    const s = session(), o = options(); o.brush = { ...o.brush, shape, hollow };
    assert.equal(commit(s, o).status, 'applied'); assert.equal(Object.keys(s.getDocument().blocks).length, count);
    const before = stable(s); assert.equal(commit(s, { ...o, brush: { ...o.brush, airOnly: true } }).status, 'noop'); assert.equal(stable(s), before);
    assert.equal(commit(s, { ...o, mode: 'erase' }).status, 'applied'); const empty = stable(s);
    assert.equal(commit(s, { ...o, mode: 'erase' }).status, 'noop'); assert.equal(stable(s), empty);
  }
});

test('radius-zero placement and erasure share mirrored cells without legacy engine snapshots', () => {
  const s = session(), o = options({ brush: SINGLE_CELL_BRUSH, symmetry: mirror('quad_xz') });
  assert.equal(commit(s, o).status, 'applied'); assert.equal(Object.keys(s.getDocument().blocks).length, 4);
  assert.equal(s.getHistoryUsage().undoEntries, 1); assert.deepEqual(s.getEngineState().undoStack, []);
  assert.equal(commit(s, { ...o, mode: 'erase' }).status, 'applied'); assert.equal(Object.keys(s.getDocument().blocks).length, 0);
  assert.equal(s.getHistoryUsage().undoEntries, 2);
});

test('cached source tokens reject after edit-to-Undo ABA and project replacement before preparation', () => {
  const s = session(), cached = s.getToken(); s.setWorldField('worldName', 'Intervening'); s.undo();
  let prepared = 0;
  const delayed = () => s.transaction('Delayed brush', () => { prepared++; const p = prepareStudioBrush(s.getDocument(), s.getEngineState(), options()); s.setEngineState(p.state); }, cached);
  const before = stable(s); assert.equal(delayed().status, 'rejected'); assert.equal(prepared, 0); assert.equal(stable(s), before);
  const replacement: StudioDocument = { ...document(), historyEpoch: 'replacement-epoch' }; s.installVerifiedDocument(replacement);
  const after = stable(s); assert.equal(delayed().status, 'rejected'); assert.equal(prepared, 0); assert.equal(stable(s), after);
});

test('invalid brush/mirror/mode inputs reject before any history or feedback is published', () => {
  const invalid = [options({ center: { x: Infinity, y: 0, z: 0 } }), options({ rotation: 45 as 0 }), options({ mode: 'unknown' as 'place' }),
    options({ brush: { ...SINGLE_CELL_BRUSH, radius: 9 } }), options({ symmetry: mirror('quad_xz', .25) }), options({ activeBlockId: 'missing' })];
  for (const o of invalid) { const s = session(), before = stable(s); let effects = 0; assert.equal(commit(s, o, () => { effects++; }).status, 'rejected'); assert.equal(stable(s), before); assert.equal(effects, 0); }
});

test('a final history-capacity rejection rolls back staged cells and chunk visibility together', () => {
  const s = new StudioEditorSession(document(), { maxEntries: 30, maxBytes: 1 }); s.setWritable(true);
  const before = stable(s); let effects = 0;
  assert.equal(commit(s, options({ center: { x: 18, y: 8, z: 18 }, symmetry: mirror('quad_xz') }), () => { effects++; }).status, 'rejected');
  assert.equal(stable(s), before); assert.equal(effects, 0);
});

test('mixed document and engine snapshots reject rather than preparing from another source', () => {
  const a = session(), b = session(), before = stable(a);
  assert.throws(() => prepareStudioBrush(a.getDocument(), b.getEngineState(), options()), /source snapshots cannot be mixed/);
  assert.equal(stable(a), before);
});
