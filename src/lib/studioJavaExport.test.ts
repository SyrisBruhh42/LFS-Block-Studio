import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';
import { candidateJavaTarget } from './studioTargetPolicy';
import { prepareStudioJavaExport, encodeStudioJavaExport, type StudioJavaExportRequest } from './studioJavaExport';
import { StudioEditorSession } from './studioEditorSession';

function fixture(locked = true): StudioJavaExportRequest {
  const document = makeStudioDocument(); document.schemaVersion = 2; document.revision = 7;
  document.blocks = {
    '-4,2,7': { id: 'first', blockDefId: 'cobble_brick', position: { x: -4, y: 2, z: 7 }, rotation: 0 },
    '-2,3,10': { id: 'second', blockDefId: 'oak_plank', position: { x: -2, y: 3, z: 10 }, rotation: 0 },
  };
  const bindings = (['cobble_brick', 'oak_plank'] as const).map((id, i) => { const result = captureJavaDefinitionBinding(document.customBlocks[id], i ? 'minecraft:oak_planks' : 'minecraft:cobblestone'); assert.ok(result.ok); return result.binding; });
  document.targetPolicy = { policyVersion: 1, checkpoint: { documentId: document.documentId, revision: 6, historyEpoch: 'old-epoch' }, target: candidateJavaTarget(bindings, locked) };
  const sourceToken = JSON.stringify({ documentId: document.documentId, historyEpoch: document.historyEpoch, sessionId: 'session-fixture', editRevision: 12 });
  return { document, sourceToken, name: 'Asymmetric Java fixture', scope: 'world', selection: null, anchor: { x: 1, y: -5, z: 10 } };
}
function ready(request = fixture()) { const result = prepareStudioJavaExport(request); assert.ok(result.ok, JSON.stringify(result)); return result.plan; }
function rejected(request: unknown, text?: RegExp) { const result = prepareStudioJavaExport(request); assert.equal(result.ok, false); if (!result.ok && text) assert.match(result.issues.map(x => x.message).join(' '), text); return result; }

test('world review captures exact mappings, negative bounds, anchor, air and source identity without changing the document', () => {
  const request = fixture(), before = structuredClone(request), plan = ready(request);
  assert.deepEqual(plan.input.bounds, { min: { x: -4, y: 2, z: 7 }, max: { x: -2, y: 3, z: 10 } });
  assert.deepEqual(plan.schematic.offset, { x: -5, y: 7, z: -3 });
  assert.equal(plan.schematic.volume, 24); assert.equal(plan.schematic.implicitAirCells, 22);
  assert.deepEqual(plan.input.cells.map(x => x.blockState), ['minecraft:cobblestone', 'minecraft:oak_planks']);
  assert.equal(plan.source.liveEditRevision, 12); assert.equal(plan.source.capturedDurableRevision, 7); assert.equal(plan.excludedByScope, 0);
  assert.equal(plan.schematic.profile.nativeQualification, 'not-run'); assert.deepEqual(request, before);
  assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.input.cells));
});

test('explicit selection normalizes corners, excludes only out-of-scope cells and keeps all selected air', () => {
  const request = fixture(); request.scope = 'selection'; request.selection = { pos1: { x: -3, y: 3, z: 8 }, pos2: { x: -4, y: 2, z: 7 } };
  const plan = ready(request);
  assert.equal(plan.input.cells.length, 1); assert.equal(plan.excludedByScope, 1); assert.equal(plan.schematic.volume, 8); assert.equal(plan.schematic.implicitAirCells, 7);
  assert.deepEqual(plan.input.cells[0], { x: -4, y: 2, z: 7, blockState: 'minecraft:cobblestone' });
});

test('empty world requires explicit bounds while a reviewed empty selection is an air-only schematic', () => {
  const request = fixture(); request.document.blocks = {}; rejected(request, /empty/);
  request.scope = 'selection'; request.selection = { pos1: { x: 2, y: 3, z: 4 }, pos2: { x: 3, y: 4, z: 5 } };
  const plan = ready(request); assert.equal(plan.schematic.volume, 8); assert.equal(plan.schematic.implicitAirCells, 8); assert.equal(plan.schematic.nonAirCells, 0);
});

test('unlocked Java builds still reject incompatible included content and never infer replacement mappings', () => {
  for (const mutate of [
    (r: StudioJavaExportRequest) => { r.document.blocks['-4,2,7'].rotation = 90; },
    (r: StudioJavaExportRequest) => { r.document.blocks['-4,2,7'].colorOverride = '#123456'; },
    (r: StudioJavaExportRequest) => { r.document.customBlocks.cobble_brick.color = '#abcdef'; },
    (r: StudioJavaExportRequest) => { r.document.blocks['-4,2,7'].blockDefId = 'voxel_lantern'; },
  ]) { const request = fixture(false); mutate(request); const before = structuredClone(request); rejected(request); assert.deepEqual(request, before); }
  const request = fixture(false); request.document.blocks['-2,3,10'].rotation = 90;
  request.scope = 'selection'; request.selection = { pos1: { x: -4, y: 2, z: 7 }, pos2: { x: -4, y: 2, z: 7 } };
  assert.equal(ready(request).excludedByScope, 1, 'Only an explicit valid scope may exclude unsupported outside content');
});

test('unknown/freeform policy, bad source identity and noncanonical tokens fail without a plan', () => {
  const free = fixture(); delete free.document.targetPolicy; free.document.schemaVersion = 1; rejected(free, /Java target/);
  const unknown = fixture(); (unknown.document.targetPolicy as any).policyVersion = 99; rejected(unknown, /policy/);
  for (const sourceToken of ['{}', 'null', 'not JSON', ' '.repeat(4097), fixture().sourceToken.replace('session-fixture', 'invalid session'), fixture().sourceToken.replace('project-fixture', 'wrong-project'), fixture().sourceToken.replace('"editRevision":12', '"editRevision":12,"editRevision":12')]) rejected({ ...fixture(), sourceToken });
});

test('invalid anchors, missing/fractional selection, huge dense bounds and invalid names fail before encoding', () => {
  for (const anchor of [{ x: NaN, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 1_000_001, y: 0, z: 0 }]) rejected({ ...fixture(), anchor });
  rejected({ ...fixture(), scope: 'selection' });
  rejected({ ...fixture(), scope: 'selection', selection: { pos1: { x: 0.5, y: 0, z: 0 }, pos2: { x: 1, y: 1, z: 1 } } });
  rejected({ ...fixture(), scope: 'selection', selection: { pos1: { x: 0, y: 0, z: 0 }, pos2: { x: 1000, y: 1000, z: 1000 } } }, /budget/);
  for (const name of ['', 'bad\nname', '\ud800', 'x'.repeat(257)]) rejected({ ...fixture(), name });
});

test('request accessors and unknown fields reject without evaluating the accessor', () => {
  const request = fixture(); let reads = 0;
  Object.defineProperty(request, 'anchor', { enumerable: true, get() { reads++; return { x: 0, y: 0, z: 0 }; } }); rejected(request); assert.equal(reads, 0);
  rejected({ ...fixture(), unknown: 'not admitted' });
});

test('an immutable review survives caller mutations and encoding returns an immutable blob with matching SHA256 report', async () => {
  const request = fixture(), plan = ready(request); request.document.blocks['-4,2,7'].rotation = 90; assert.equal(Reflect.set(request.anchor, 'x', 99), true);
  const artifact = await encodeStudioJavaExport(plan); const bytes = Buffer.from(await artifact.blob.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [31, 139, 8]); assert.ok(gunzipSync(bytes).includes(Buffer.from('Schematic')));
  assert.equal(artifact.receipt.binarySha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(artifact.receipt.mappingSha256, createHash('sha256').update(plan.mapping.bindingIdentity).digest('hex'));
  assert.equal(artifact.receipt.gzipBytes, bytes.length); assert.deepEqual(artifact.receipt.schematic.anchor, { x: 1, y: -5, z: 10 });
  assert.equal(artifact.receipt.nativeQualification, 'not-run'); assert.ok(artifact.receipt.omitted.some(x => x.includes('Entities')));
  assert.match(artifact.filename, /edit12\.candidate\.schem$/); assert.ok(Object.isFrozen(artifact.receipt.materials));
});

test('cloned/unreviewed plans and cancellation cannot produce an artifact', async () => {
  const plan = ready(); await assert.rejects(encodeStudioJavaExport(structuredClone(plan)), /Review/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(encodeStudioJavaExport(plan, controller.signal), error => error instanceof DOMException && error.name === 'AbortError');
  const later = new AbortController(), pending = encodeStudioJavaExport(plan, later.signal); later.abort(); await assert.rejects(pending);
});

test('export review and encoding leave both actual editor history directions and authored data untouched', async () => {
  const request = fixture(), session = new StudioEditorSession(request.document); session.setWritable(true);
  session.setWorldField('description', 'first edit'); const undoPayload = session.getDocument().world.description;
  session.setWorldField('description', 'second edit'); session.undo();
  const before = session.getSnapshot(), prepared = ready({ ...request, document: session.getDocument(), sourceToken: JSON.stringify(session.getToken()) });
  await encodeStudioJavaExport(prepared);
  assert.equal(session.getSnapshot(), before); assert.equal(session.getSnapshot().canUndo, true); assert.equal(session.getSnapshot().canRedo, true);
  session.redo(); assert.equal(session.getDocument().world.description, 'second edit'); session.undo(); assert.equal(session.getDocument().world.description, undoPayload);
});
