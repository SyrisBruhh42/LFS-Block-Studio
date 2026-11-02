import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { describeCompatibilitySource, reviewStudioCompatibility, eligibleJavaDefinitions, matchesCompatibilityReview, type CompatibilityDraft } from './studioCompatibility';
import { StudioEditorSession } from './studioEditorSession';
import { validateStudioDocument, type StudioDocument } from './studioDocument';

const token = 'live-source-token';
const assignment = { definitionId: 'cobble_brick', blockState: 'minecraft:cobblestone' as const };
function source() {
  const d = makeStudioDocument(); d.blocks = { '-2,3,5': { id: 'b1', blockDefId: 'cobble_brick', position: { x: -2, y: 3, z: 5 }, rotation: 0 } }; return d;
}
const draft = (assignments: CompatibilityDraft['assignments'] = [assignment], locked = true): CompatibilityDraft => ({ sourceToken: token, locked, assignments });
function lockedDocument(): StudioDocument {
  const d = source(), report = reviewStudioCompatibility(d, draft()); assert.equal(report.canApply, true);
  return { ...d, schemaVersion: 2, revision: 1, historyEpoch: 'locked-epoch', targetPolicy: { policyVersion: 1, checkpoint: { documentId: d.documentId, revision: 0, historyEpoch: d.historyEpoch }, target: report.target } };
}
test('explicit review binds unchanged unit geometry and exact appearance choices without mutating source', () => {
  const d = source(), before = JSON.stringify(d); const report = reviewStudioCompatibility(d, draft());
  assert.equal(report.canApply, true); assert.equal(report.sourceToken, token); assert.equal(report.mappings[0].instances, 1);
  assert.match(report.mappings[0].appearanceSummary, /reviewed substitution/); assert.equal(JSON.stringify(d), before);
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.target)); assert.ok(Object.isFrozen(report.mappings));
});
test('missing choices are never inferred from appearance or names; empty palette cannot lock a blank project', () => {
  const d = source(); let report = reviewStudioCompatibility(d, draft([])); assert.equal(report.canApply, false);
  assert.ok(report.issues.some(i => i.code === 'missing-binding')); d.blocks = {}; report = reviewStudioCompatibility(d, draft([]));
  assert.equal(report.canApply, false); assert.ok(report.issues.some(i => i.code === 'no-eligible-definition'));
});
test('unused Freeform resources can remain stored but placing one into the locked world fails atomically', () => {
  const d = lockedDocument(); assert.ok(d.customBlocks.voxel_lantern); assert.ok(d.blueprints.length);
  assert.ok(validateStudioDocument(d).ok); const session = new StudioEditorSession(d); session.setWritable(true);
  const before = session.getSnapshot(); let effect = 0;
  const result = session.transaction('Unmapped placement', () => {
    session.setDocumentField('blocks', prev => ({ ...prev, '0,0,0': { id: 'wrong', blockDefId: 'voxel_lantern', position: { x: 0, y: 0, z: 0 }, rotation: 0 } }));
    session.afterCommit(() => { effect++; });
  });
  assert.equal(result.status, 'rejected'); assert.equal(session.getDocument(), before.document); assert.equal(session.getSnapshot().editRevision, before.editRevision); assert.equal(effect, 0);
});
test('unlock preserves exact stored assignments; same-state and remap requests require a new proposal or copy', () => {
  const d = lockedDocument(); const report = reviewStudioCompatibility(d, draft([assignment], false)); assert.equal(report.canApply, true);
  assert.equal(report.target.kind === 'minecraft-java' && report.target.locked, false);
  assert.equal(reviewStudioCompatibility(d, draft()).canApply, false);
  const changed = reviewStudioCompatibility(d, draft([{ ...assignment, blockState: 'minecraft:stone' }], false));
  assert.equal(changed.canApply, false); assert.ok(changed.issues.some(i => i.code === 'copy-required'));
});
test('unlocked definition edits invalidate old bindings and cannot be silently recaptured on relock', () => {
  const d = structuredClone(lockedDocument()); if (d.targetPolicy!.target.kind !== 'minecraft-java') throw new Error('fixture');
  d.targetPolicy!.target.locked = false; d.customBlocks.cobble_brick.color = '#ff0000';
  assert.deepEqual(eligibleJavaDefinitions(d), []); const report = reviewStudioCompatibility(d, draft());
  assert.equal(report.canApply, false); assert.ok(report.issues.some(i => i.code === 'definition-changed'));
});
test('unsupported geometry, orientation and instance appearance show bounded affected-instance issues', () => {
  for (const mutate of [
    (d: StudioDocument) => { d.blocks['-2,3,5'].rotation = 90; },
    (d: StudioDocument) => { d.blocks['-2,3,5'].colorOverride = '#abcdef'; },
    (d: StudioDocument) => { d.customBlocks.cobble_brick.hasStuds = true; },
  ]) {
    const d = source(); mutate(d); const report = reviewStudioCompatibility(d, draft()); assert.equal(report.canApply, false);
    assert.ok(report.issues.some(i => i.affectedInstances === 1 && i.affectedInstanceIds.includes('b1')));
  }
});
test('invalid choice properties, duplicates, air and oversized lists reject before capture', () => {
  for (const choices of [
    { ...draft(), extra: true }, draft([assignment, assignment]), draft([{ ...assignment, blockState: 'minecraft:air' as any }]),
    draft(Array.from({ length: 4097 }, (_, i) => ({ ...assignment, definitionId: `id${i}` }))),
  ]) assert.throws(() => reviewStudioCompatibility(source(), choices));
});
test('choice and array accessors are rejected without executing them', () => {
  let calls = 0; const choices = draft(); Object.defineProperty(choices, 'locked', { enumerable: true, get() { calls++; return true; } });
  assert.throws(() => reviewStudioCompatibility(source(), choices)); assert.equal(calls, 0);
  const entries = [assignment]; Object.defineProperty(entries, '0', { enumerable: true, get() { calls++; return assignment; } });
  assert.throws(() => reviewStudioCompatibility(source(), draft(entries))); assert.equal(calls, 0);
});
test('only the captured immutable review at the exact live token can be applied', () => {
  const review = reviewStudioCompatibility(source(), draft()); assert.equal(matchesCompatibilityReview(review, review, token), true);
  assert.equal(matchesCompatibilityReview(structuredClone(review), review, token), false);
  assert.equal(matchesCompatibilityReview(review, review, 'after-edit-and-undo'), false);
  assert.equal(matchesCompatibilityReview(review, null, token), false);
});
test('definition presentation and eligible palette use exact bindings without changing stored unused resources', () => {
  const d = lockedDocument(), description = describeCompatibilitySource(d, token);
  assert.equal(description.target, d.targetPolicy!.target); assert.equal(description.definitions.find(x => x.id === 'cobble_brick')!.instances, 1);
  assert.ok(description.definitions.some(x => x.id === 'voxel_lantern' && x.instances === 0));
  assert.deepEqual(eligibleJavaDefinitions(d), ['cobble_brick']);
});
test('many rejected placements truncate diagnostics and sampled IDs without producing partial approval', () => {
  const d = source(); d.blocks = {};
  for (let i = 0; i < 150; i++) d.blocks[`${i},0,0`] = { id: `b${i}`, blockDefId: 'cobble_brick', position: { x: i, y: 0, z: 0 }, rotation: 90 };
  const report = reviewStudioCompatibility(d, draft()); assert.equal(report.canApply, false); assert.equal(report.issues.length, 100); assert.equal(report.issuesTruncated, true);
});
