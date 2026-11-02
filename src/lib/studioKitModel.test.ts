import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioKitModel, type StudioKitExportDraft } from './studioKitModel';
import { StudioEditorSession } from './studioEditorSession';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { readStudioKit, type StudioKitImportProposal } from './studioKit';
import { courtyardStarterKit, COURTYARD_KIT_LICENSE } from '../resources/kits/courtyardStarter';
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const stable = (s: StudioEditorSession) => JSON.stringify({ document: s.getDocument(), workspace: s.getSnapshot().workspace, history: s.getHistoryUsage(), token: s.getToken() });
function setup(options: { maxBytes?: number; preserve?: (p: StudioKitImportProposal, s: StudioEditorSession) => Promise<boolean>; decode?: typeof readStudioKit; afterPlacement?: () => void } = {}) {
  const d = makeStudioDocument('kit-model-fixture'); d.blocks = {}; d.blueprints = []; d.extensions = { preserve: ['all', 'unrelated', 'authored', 'fields'] };
  const s = new StudioEditorSession(d, { maxBytes: options.maxBytes ?? 16 * 1048576, maxEntries: 30 }); s.setWritable(true); let preserves = 0, imports = 0, placements = 0;
  const m = new StudioKitModel(() => ({ document: s.getDocument(), engine: s.getEngineState(), token: JSON.stringify(s.getToken()), writable: s.getSnapshot().writable && !s.getSnapshot().exclusive }), async p => { preserves++; return options.preserve ? options.preserve(p, s) : true; }, p => {
    imports++; return s.transaction('Kit import', () => { s.setDocumentField('customBlocks', p.document.customBlocks); s.setDocumentField('blueprints', p.document.blueprints); s.setDocumentField('extensions', p.document.extensions); }, JSON.parse(p.sourceToken));
  }, p => { placements++; const r = s.transaction('Kit placement', () => { s.setEngineState(p.state); s.setDocumentField('chunkConfig', p.chunkConfig); }, JSON.parse(p.sourceToken)); options.afterPlacement?.(); return r; }, options.decode);
  s.subscribe(m.synchronize); m.show();
  return { s, m, counts: () => ({ preserves, imports, placements }), load: () => m.loadStarter(m.getSnapshot().version), preview: () => m.previewPlacement('courtyard_v1_garden', '18', '1', '18', '0', m.getSnapshot().version) };
}
const exportDraft = (s: StudioEditorSession): StudioKitExportDraft => ({ id: 'model-export', name: 'Model export', description: 'Export fixture', author: 'Fixture author', license: 'MIT', sourceUrl: '', licenseText: COURTYARD_KIT_LICENSE, notices: 'Fixture', sourceToken: JSON.stringify(s.getToken()), definitionIds: [], blueprintIds: ['courtyard_v1_garden'], rightsConfirmed: true });

test('review, metadata download and draft edits have no authored effect; one import undoes completely', async () => {
  const { s, m, load, counts } = setup(), before = stable(s); assert.equal((await load()).status, 'noop'); assert.equal(stable(s), before); const report = m.getSnapshot().importReport!;
  assert.ok(Object.isFrozen(report.addedDefinitions)); assert.ok(m.originalDownload(m.getSnapshot().version)); assert.equal(stable(s), before);
  assert.equal((await m.applyImport(report)).status, 'applied'); assert.deepEqual(counts(), { preserves: 1, imports: 1, placements: 0 }); assert.equal(s.getHistoryUsage().undoEntries, 1); s.undo(); assert.deepEqual(s.getDocument(), JSON.parse(before).document); assert.deepEqual(s.getSnapshot().workspace, JSON.parse(before).workspace);
});
test('duplicate and forged import reports cannot apply or consume a newer review', async () => {
  const gate = deferred<boolean>(), { s, m, load, counts } = setup({ preserve: () => gate.promise }); await load(); const old = m.getSnapshot().importReport!;
  assert.equal((await m.applyImport({ ...old })).status, 'rejected'); assert.strictEqual(m.getSnapshot().importReport, old);
  const pending = m.applyImport(old); assert.equal(m.getSnapshot().phase, 'preserving'); assert.equal((await m.applyImport(old)).status, 'rejected'); gate.resolve(true); assert.equal((await pending).status, 'applied');
  m.reviewImport(m.getSnapshot().version); const current = m.getSnapshot().importReport!; assert.notStrictEqual(current, old); assert.equal((await m.applyImport(old)).status, 'rejected'); assert.strictEqual(m.getSnapshot().importReport, current); assert.equal(counts().imports, 1); assert.equal(s.getHistoryUsage().undoEntries, 1);
});
test('own original preservation may hold the editor exclusion and still commits after its release', async () => {
  const gate = deferred<boolean>(); let release: (() => void) | undefined;
  const { s, m, load } = setup({ preserve: async (_p, editor) => { const handle = editor.beginExclusive()!; release = () => { editor.endExclusive(handle); }; await gate.promise; release(); return true; } }); await load(); const pending = m.applyImport(m.getSnapshot().importReport!);
  assert.equal(s.getSnapshot().exclusive, true); assert.equal(m.getSnapshot().phase, 'preserving'); gate.resolve(true); assert.equal((await pending).status, 'applied'); assert.equal(s.getSnapshot().exclusive, false);
});
test('cancel/close/reopen during preservation cannot publish into a new view or submit a library edit', async () => {
  for (const action of ['cancel', 'reopen']) {
    const gate = deferred<boolean>(), { s, m, load, counts } = setup({ preserve: () => gate.promise }); await load(); const before = stable(s), pending = m.applyImport(m.getSnapshot().importReport!);
    if (action === 'cancel') m.cancel(); else { m.close(); m.show(); }
    const snapshot = m.getSnapshot(); gate.resolve(true); assert.equal((await pending).status, 'rejected'); assert.strictEqual(m.getSnapshot(), snapshot); assert.equal(stable(s), before); assert.equal(counts().imports, 0);
  }
});
test('source changes, failed preservation and unavailable authority prevent a post-await import', async () => {
  for (const mode of ['source', 'failed', 'readonly']) {
    const gate = deferred<boolean>(), { s, m, load, counts } = setup({ preserve: () => gate.promise }); await load(); const pending = m.applyImport(m.getSnapshot().importReport!);
    if (mode === 'source') s.setWorldField('worldName', 'New source'); if (mode === 'readonly') s.setWritable(false); const before = stable(s); gate.resolve(mode !== 'failed'); assert.equal((await pending).status, 'rejected'); assert.equal(stable(s), before); assert.equal(counts().imports, 0); assert.equal(m.getSnapshot().phase, null);
  }
});
test('final history admission may reject a reviewed import after preserving its original without partial library state', async () => {
  const { s, m, load, counts } = setup({ maxBytes: 100 }); await load(); const before = stable(s); assert.equal((await m.applyImport(m.getSnapshot().importReport!)).status, 'rejected'); assert.equal(stable(s), before); assert.deepEqual(counts(), { preserves: 1, imports: 1, placements: 0 }); assert.equal(m.getSnapshot().importReport, null);
});
test('repeat no-op import skips another archive write and retains source, history and Redo', async () => {
  const { s, m, load, counts } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); s.setWorldField('worldName', 'Redo'); s.undo(); m.reviewImport(m.getSnapshot().version); assert.equal(m.getSnapshot().importReport!.noop, true); const before = stable(s);
  assert.equal((await m.applyImport(m.getSnapshot().importReport!)).status, 'noop'); assert.equal(stable(s), before); assert.equal(counts().preserves, 1); assert.equal(s.redo().status, 'applied');
});
test('bounds and wrong file sizes reject reads, revoke the previous review and never call an oversized producer', async () => {
  const { s, m, load } = setup(); await load(); const before = stable(s); let called = false;
  assert.equal((await m.load('huge.zip', 6 * 1048576 + 1, async () => { called = true; return new Uint8Array(); }, m.getSnapshot().version)).status, 'rejected'); assert.equal(called, false); assert.equal(m.getSnapshot().importReport, null);
  assert.equal((await m.load('wrong.zip', 100, async () => new Uint8Array(99), m.getSnapshot().version)).status, 'rejected'); assert.equal(stable(s), before);
});
test('a late file producer or decoder ignoring abort cannot overwrite a newer resource context', async () => {
  const bytes = await courtyardStarterKit(), decoded = await readStudioKit(bytes);
  for (const stage of ['producer', 'decoder']) {
    const gate = deferred<Uint8Array>(), decodeGate = deferred<typeof decoded>(), entered = deferred<boolean>(); let calls = 0;
    const { m } = setup({ decode: stage === 'decoder' ? async () => { if (!calls++) { entered.resolve(true); return decodeGate.promise; } return decoded; } : undefined });
    const pending = m.load('late.zip', bytes.length, stage === 'producer' ? () => gate.promise : async () => bytes, m.getSnapshot().version);
    if (stage === 'decoder') await entered.promise;
    m.close(); m.show(); await m.load('current.zip', bytes.length, async () => bytes, m.getSnapshot().version); const current = m.getSnapshot();
    if (stage === 'producer') gate.resolve(bytes); else decodeGate.resolve(decoded);
    assert.equal((await pending).status, 'rejected'); assert.strictEqual(m.getSnapshot(), current);
  }
});
test('draft edits and edit-Undo ABA invalidate an old placement review', async () => {
  const { s, m, load, preview } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); preview(); const report = m.getSnapshot().placementReport!; m.edit(); assert.equal(m.applyPlacement(report).status, 'rejected');
  preview(); const old = m.getSnapshot().placementReport!; s.setWorldField('worldName', 'Temporary'); s.undo(); assert.equal(m.getSnapshot().placementReport, null); const before = stable(s); assert.equal(m.applyPlacement(old).status, 'rejected'); assert.equal(stable(s), before);
});
test('one blueprint placement has full Undo/Redo; duplicate/forged reports reject and repeated final placement is a no-op', async () => {
  const { s, m, load, preview, counts } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); const before = structuredClone(s.getDocument()); preview(); const report = m.getSnapshot().placementReport!;
  assert.equal(m.applyPlacement({ ...report }).status, 'rejected'); assert.equal(m.applyPlacement(report).status, 'applied'); assert.equal(m.applyPlacement(report).status, 'rejected'); assert.equal(counts().placements, 1); const after = structuredClone(s.getDocument()); s.undo(); assert.deepEqual(s.getDocument(), before); s.redo(); assert.deepEqual(s.getDocument(), after);
  s.setWorldField('worldName', 'Redo'); s.undo(); preview(); assert.equal(m.getSnapshot().placementReport!.noop, true); const stableBefore = stable(s); assert.equal(m.applyPlacement(m.getSnapshot().placementReport!).status, 'noop'); assert.equal(stable(s), stableBefore);
});
test('a completion from an old placement view cannot change a reopened view', async () => {
  let model: StudioKitModel;
  const { m, load, preview } = setup({ afterPlacement: () => { model.close(); model.show(); } }); model = m; await load(); await m.applyImport(m.getSnapshot().importReport!); preview(); const result = m.applyPlacement(m.getSnapshot().placementReport!);
  assert.equal(result.status, 'applied'); assert.equal(m.getSnapshot().message, ''); assert.equal(m.getSnapshot().placementReport, null);
});
test('invalid finite/rotation/selection and read-only placement drafts reject without authored changes', async () => {
  const { s, m, load } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); const before = stable(s);
  for (const args of [['NaN', '1', '0', '0'], ['', '1', '0', '0'], ['0', '1', '0', '42']]) assert.equal(m.previewPlacement('courtyard_v1_garden', ...args as [string, string, string, string], m.getSnapshot().version).status, 'rejected');
  assert.equal(m.previewPlacement('missing', '0', '1', '0', '0', m.getSnapshot().version).status, 'rejected'); assert.equal(stable(s), before); s.setWritable(false); assert.equal(m.previewPlacement('courtyard_v1_garden', '0', '1', '0', '0', m.getSnapshot().version).status, 'rejected');
});
test('kit export contains complete selected resources/notices and is detached and single-consumption', async () => {
  const { s, m, load } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); const before = stable(s), draft = exportDraft(s), pending = m.prepareExport(draft, m.getSnapshot().version); draft.name = 'Changed object after submission';
  const value = await pending; assert.ok(value); assert.equal(value.filename, 'Model-export.studio-kit.zip'); value.bytes.fill(0); const accepted = m.consumeDownload(value); assert.ok(accepted); const kit = await readStudioKit(accepted.bytes); assert.equal(kit.manifest.name, 'Model export'); assert.equal(kit.resources.blueprints.length, 1); assert.equal(kit.resources.definitions.length, 4); assert.equal(kit.resources.provenance[0].licenseText, COURTYARD_KIT_LICENSE); assert.equal(stable(s), before); assert.equal(m.consumeDownload(value), null);
});
test('export source, sharing declaration, cancellation and late file consumption are fenced', async () => {
  const { s, m, load } = setup(); await load(); await m.applyImport(m.getSnapshot().importReport!); const draft = exportDraft(s);
  assert.equal(await m.prepareExport({ ...draft, rightsConfirmed: false }, m.getSnapshot().version), null); assert.equal(await m.prepareExport({ ...draft, sourceToken: 'old-project' }, m.getSnapshot().version), null);
  let pending = m.prepareExport(draft, m.getSnapshot().version); m.edit(); assert.equal(await pending, null);
  let value = await m.prepareExport(draft, m.getSnapshot().version); assert.ok(value); m.close(); m.show(); assert.equal(m.consumeDownload(value), null);
  value = await m.prepareExport(draft, m.getSnapshot().version); assert.ok(value); s.setWorldField('worldName', 'Other source'); assert.equal(m.consumeDownload(value), null);
});
