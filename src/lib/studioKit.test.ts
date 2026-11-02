import test from 'node:test';
import assert from 'node:assert/strict';
import { courtyardStarterKit, courtyardStarterResources, COURTYARD_KIT_LICENSE, COURTYARD_KIT_NOTICES } from '../resources/kits/courtyardStarter';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { StudioEditorSession } from './studioEditorSession';
import { readStudioKit, writeStudioKit, prepareStudioKitImport, collectStudioKitResources, readStudioKitProjectProvenance, studioKitSourceEnvelope, studioKitOriginalBytes, studioKitSha256, readStudioKitSource, type StudioKitImportProposal } from './studioKit';
import { readStudioKitZip, writeStudioKitZip } from './studioKitZip';
import { candidateJavaTarget } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';
import { prepareStudioPrefabPlacement } from './studioPrefabPlacement';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const metadata = { id: 'roundtrip-kit', name: 'Roundtrip fixture', description: 'All local data', author: 'Fixture author', license: 'MIT' as const, sourceUrl: '' };
function document(locked = false) {
  const d = makeStudioDocument('kit-fixture'), unit = { ...d.customBlocks.cobble_brick, id: 'unit', name: 'Original unit', shape: 'cube' as const, width: 1, depth: 1, heightPlates: 3, hasStuds: false }; delete unit.defaultScale; delete unit.voxels;
  d.blocks = { '1,1,1': { id: 'original-cell', blockDefId: 'unit', position: { x: 1, y: 1, z: 1 }, rotation: 0 } }; d.customBlocks = { unit }; d.blueprints = []; d.extensions = { untouched: ['all', 'metadata'] }; d.chunkConfig.activeChunks = { '0,0': true }; d.chunkConfig.unlockedChunks = ['0,0'];
  if (locked) { const binding = captureJavaDefinitionBinding(unit, 'minecraft:stone'); assert.ok(binding.ok); d.schemaVersion = 2; d.revision = 1; d.historyEpoch = 'locked-epoch'; d.targetPolicy = { policyVersion: 1, checkpoint: { documentId: d.documentId, revision: 0, historyEpoch: 'epoch-fixture' }, target: candidateJavaTarget([binding.binding]) }; }
  return d;
}
function session(locked = false, maxBytes = 16 * 1048576) { const s = new StudioEditorSession(document(locked), { maxBytes, maxEntries: 30 }); s.setWritable(true); return s; }
const token = (s: StudioEditorSession) => JSON.stringify(s.getToken());
const stable = (s: StudioEditorSession) => JSON.stringify({ document: s.getDocument(), workspace: s.getSnapshot().workspace, history: s.getHistoryUsage(), token: s.getToken() });
const commit = (s: StudioEditorSession, p: StudioKitImportProposal) => s.transaction('Import kit', () => { s.setDocumentField('customBlocks', p.document.customBlocks); s.setDocumentField('blueprints', p.document.blueprints); s.setDocumentField('extensions', p.document.extensions); }, JSON.parse(p.sourceToken));
async function repack(edit: (files: Map<string, Uint8Array>, manifest: any) => void | Promise<void>) {
  const files = await readStudioKitZip(await courtyardStarterKit()), manifest = JSON.parse(decoder.decode(files.get('manifest.json')));
  await edit(files, manifest);
  for (const row of manifest.files) { const data = files.get(row.path); if (data) { row.bytes = data.length; row.sha256 = await studioKitSha256(data); } }
  files.set('manifest.json', encoder.encode(JSON.stringify(manifest))); return writeStudioKitZip(files);
}
async function changedResources(edit: (r: any) => void) { return repack(files => { const r = JSON.parse(decoder.decode(files.get('resources.json'))); edit(r); files.set('resources.json', encoder.encode(JSON.stringify(r))); }); }

test('original MIT courtyard archive is self-contained: six definitions, three blueprints and exact file hashes', async () => {
  const bytes = await courtyardStarterKit(), kit = await readStudioKit(bytes), files = await readStudioKitZip(bytes);
  assert.equal(kit.resources.definitions.length, 6); assert.equal(kit.resources.blueprints.length, 3); assert.equal(kit.resources.blueprints.reduce((n, b) => n + b.blocks.length, 0), 103);
  assert.equal(kit.licenseText, COURTYARD_KIT_LICENSE); assert.equal(kit.notices, COURTYARD_KIT_NOTICES); assert.equal(kit.archiveSha256, await studioKitSha256(bytes)); assert.equal(files.size, 4);
  for (const record of kit.manifest.files) { const file = files.get(record.path)!; assert.equal(file.length, record.bytes); assert.equal(await studioKitSha256(file), record.sha256); }
});
test('admitted kit data is immutable and original bytes survive callers mutating the exposed byte copy', async () => {
  const bytes = await courtyardStarterKit(), kit = await readStudioKit(bytes); kit.bytes.fill(0); assert.deepEqual(studioKitOriginalBytes(kit), bytes);
  assert.throws(() => { kit.resources.definitions[0].name = 'Altered'; }, TypeError);
  const envelope = encoder.encode(studioKitSourceEnvelope(kit, 'starter.zip')); assert.deepEqual(await readStudioKitSource(envelope), bytes); assert.equal((await readStudioKit(envelope)).archiveSha256, kit.archiveSha256);
});
test('complete library import is detached, preserves unrelated fields and applies one full Undo/Redo', async () => {
  const s = session(), before = stable(s), kit = await readStudioKit(await courtyardStarterKit()), p = prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip'); assert.equal(stable(s), before);
  assert.equal(p.report.addedDefinitions.length, 6); assert.equal(p.report.addedBlueprints.length, 3); assert.equal(p.report.addedProvenance, 1); assert.equal(p.report.noop, false);
  assert.equal(commit(s, p).status, 'applied'); const after = structuredClone(s.getDocument()); assert.deepEqual(after.blocks, JSON.parse(before).document.blocks); assert.deepEqual(s.getSnapshot().workspace, JSON.parse(before).workspace); assert.deepEqual(after.extensions?.untouched, ['all', 'metadata']);
  assert.equal(readStudioKitProjectProvenance(after)[0].licenseText, COURTYARD_KIT_LICENSE); assert.equal(s.getHistoryUsage().undoEntries, 1);
  assert.equal(s.undo().status, 'applied'); assert.deepEqual(s.getDocument(), JSON.parse(before).document); assert.equal(s.redo().status, 'applied'); assert.deepEqual(s.getDocument(), after);
  const original = JSON.parse(p.legacySources[0].raw); assert.equal(original.sha256, kit.archiveSha256); assert.equal(Buffer.from(original.data, 'base64').equals(Buffer.from(studioKitOriginalBytes(kit))), true);
});
test('identical kit import is a true no-op that preserves source, IDs, history and pending Redo', async () => {
  const s = session(), kit = await readStudioKit(await courtyardStarterKit()); commit(s, prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip')); s.setWorldField('worldName', 'Redo fixture'); s.undo(); const before = stable(s);
  const p = prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip'); assert.equal(p.report.noop, true); assert.equal(commit(s, p).status, 'noop'); assert.equal(stable(s), before); assert.equal(s.redo().status, 'applied');
});
test('definition and blueprint collisions reject without overwriting even unused resources', async () => {
  const kit = await readStudioKit(await courtyardStarterKit());
  const d = document(); d.customBlocks[kit.resources.definitions[0].id] = { ...kit.resources.definitions[0], name: 'Conflicting local name' }; const before = JSON.stringify(d); assert.throws(() => prepareStudioKitImport(d, 'source', kit, 'kit.zip'), /definition.*conflicts/); assert.equal(JSON.stringify(d), before);
  const other = document(); other.blueprints = [{ ...kit.resources.blueprints[0], name: 'Different local blueprint' }]; assert.throws(() => prepareStudioKitImport(other, 'source', kit, 'kit.zip'), /Blueprint.*conflicts/);
});
test('kit closure never inherits missing definitions from the active project or embedded conflicts', async () => {
  await assert.rejects(readStudioKit(await changedResources(r => { r.definitions = r.definitions.slice(1); })), /missing|unlisted|unknown|reference/i);
  await assert.rejects(readStudioKit(await changedResources(r => { r.blueprints[0].customBlockDefs[0].color = '#123456'; })), /conflicting/);
});
test('duplicate resource IDs and conflicting placement anchors reject before building a map', async () => {
  await assert.rejects(readStudioKit(await changedResources(r => r.definitions.push(r.definitions[0]))), /Duplicate/);
  await assert.rejects(readStudioKit(await changedResources(r => r.blueprints.push(r.blueprints[0]))), /Duplicate/);
  await assert.rejects(readStudioKit(await changedResources(r => { const b = structuredClone(r.blueprints[0].blocks[0]); b.id = 'other-id'; r.blueprints[0].blocks.push(b); })), /conflicting placement anchors/);
});
test('missing or unlisted files, unknown version, units and rights declaration fail closed', async () => {
  for (const edit of [(_f: Map<string, Uint8Array>, m: any) => { m.version = 2; }, (_f: Map<string, Uint8Array>, m: any) => { m.units = 'meters'; }, (_f: Map<string, Uint8Array>, m: any) => { m.axes = 'z-up'; }, (_f: Map<string, Uint8Array>, m: any) => { m.license = 'unlicensed'; }, (f: Map<string, Uint8Array>) => { f.delete('NOTICES.txt'); }, (f: Map<string, Uint8Array>) => { f.set('run.js', encoder.encode('arbitrary script')); }]) await assert.rejects(readStudioKit(await repack(edit)));
});
test('duplicate JSON keys including escaped unsafe keys are rejected, not normalized away', async () => {
  let bytes = await repack(f => { f.set('resources.json', encoder.encode(decoder.decode(f.get('resources.json')).replace('"version":1', '"version":1,"version":2'))); }); await assert.rejects(readStudioKit(bytes), /Duplicate JSON/);
  bytes = await repack(f => { f.set('resources.json', encoder.encode(decoder.decode(f.get('resources.json')).replace('"version":1', '"version":1,"\\u005f_proto__":true'))); }); await assert.rejects(readStudioKit(bytes), /Unsafe JSON/);
  const files = await readStudioKitZip(await courtyardStarterKit()); files.set('manifest.json', encoder.encode(decoder.decode(files.get('manifest.json')).replace('"version":1', '"version":1,"version":2'))); await assert.rejects(readStudioKit(writeStudioKitZip(files)), /Duplicate JSON/);
});
test('valid ZIP checksums do not excuse a mismatched SHA-256 manifest', async () => {
  const files = await readStudioKitZip(await courtyardStarterKit()); files.set('NOTICES.txt', encoder.encode('Different source notice with valid ZIP CRC')); await assert.rejects(readStudioKit(writeStudioKitZip(files)), /manifest integrity/);
});
test('invalid UTF-8, oversized license text, public copies and excessive resource counts reject', async () => {
  await assert.rejects(readStudioKit(await repack(f => { f.set('LICENSE.txt', Uint8Array.from([0xc0, 0xaf])); })));
  await assert.rejects(readStudioKit(await repack(f => { f.set('LICENSE.txt', encoder.encode('x'.repeat(65537))); })), /too large/);
  await assert.rejects(readStudioKit(await changedResources(r => { r.blueprints[0].isPublic = true; })), /private copies/);
  await assert.rejects(readStudioKit(await changedResources(r => { r.definitions = Array.from({ length: 257 }, (_, n) => ({ ...r.definitions[0], id: `d${n}` })); })), /bounded/);
  await assert.rejects(readStudioKit(await changedResources(r => { r.blueprints[0].blocks = Array.from({ length: 10001 }, (_, n) => ({ ...r.blueprints[0].blocks[0], id: `b${n}` })); })), /bounded/);
});
test('exporting raw license/notices never silently replaces malformed UTF-16', async () => {
  await assert.rejects(writeStudioKit(metadata, courtyardStarterResources(), 'broken high surrogate \ud800', 'notice'), /Unicode|UTF-16/);
  await assert.rejects(writeStudioKit(metadata, courtyardStarterResources(), 'license', 'broken low surrogate \udfff'), /Unicode|UTF-16/);
});
test('resource source URLs cannot contain credentials or executable/file protocols', async () => {
  for (const url of ['https://user:secret@example.com/kit', 'javascript:alert(1)', 'file:///tmp/kit', 'relative/path']) await assert.rejects(writeStudioKit({ ...metadata, sourceUrl: url }, courtyardStarterResources(), 'license', 'notice'), /URL/);
});
test('source recovery above 4 MiB restores exact bytes within its separate 6 MiB allowance', async () => {
  const bytes = writeStudioKitZip(new Map([['large.txt', new Uint8Array(3200000)]]));
  const raw = encoder.encode(JSON.stringify({ format: 'lfs-studio-kit-source', version: 1, filename: 'large.zip', encoding: 'base64', bytes: bytes.length, sha256: await studioKitSha256(bytes), data: Buffer.from(bytes).toString('base64') }));
  assert.ok(raw.length > 4 * 1048576); assert.deepEqual(await readStudioKitSource(raw), bytes);
  const data = JSON.parse(decoder.decode(raw)); data.sha256 = '0'.repeat(64); await assert.rejects(readStudioKitSource(encoder.encode(JSON.stringify(data))), /SHA-256/);
});
test('unknown source-envelope versions, corrupt base64, false sizes and noncanonical bits reject', async () => {
  const kit = await readStudioKit(await courtyardStarterKit()), original = JSON.parse(studioKitSourceEnvelope(kit, 'starter.zip'));
  for (const patch of [{ version: 2 }, { bytes: 1 }, { data: '*not-base64*' }, { sha256: '0'.repeat(64) }]) await assert.rejects(readStudioKitSource(encoder.encode(JSON.stringify({ ...original, ...patch }))));
});
test('selective kit export includes embedded-only definitions and every reference without ambient dependencies', async () => {
  const current = document(), payload = courtyardStarterResources(); current.blueprints = [payload.blueprints[0]];
  const closure = collectStudioKitResources(current, [], [payload.blueprints[0].id]); assert.equal(closure.blueprints.length, 1); assert.equal(closure.definitions.length, 4);
  const kit = await readStudioKit(await writeStudioKit(metadata, closure, 'license', 'notices')); assert.equal(kit.resources.definitions.length, 4); assert.equal(kit.resources.blueprints[0].isPublic, false);
});
test('export refuses unresolved or conflicting shared/embedded definitions and missing selections', () => {
  const current = document(), payload = courtyardStarterResources(); current.blueprints = [payload.blueprints[0]]; const id = payload.blueprints[0].id;
  current.customBlocks[payload.definitions[0].id] = { ...payload.definitions[0], color: '#123456' }; assert.throws(() => collectStudioKitResources(current, [], [id]), /conflicting/);
  assert.throws(() => collectStudioKitResources(document(), ['missing'], []), /missing/); assert.throws(() => collectStudioKitResources(document(), [], ['missing']), /no longer exists/); assert.throws(() => collectStudioKitResources(document(), [], []), /at least one/);
});
test('selective re-export carries full notices and merges scoped provenance without losing prior associations', async () => {
  const a = await readStudioKit(await courtyardStarterKit()), first = prepareStudioKitImport(document(), 'first', a, 'starter.zip').document;
  const selected = collectStudioKitResources(first, [], ['courtyard_v1_garden']); assert.equal(selected.provenance[0].licenseText, COURTYARD_KIT_LICENSE); assert.equal(selected.provenance[0].definitionIds.length, 4);
  const b = await readStudioKit(await writeStudioKit(metadata, selected, 'Outer package license', 'Outer package notices'));
  const merged = prepareStudioKitImport(first, 'same-project', b, 'subset.zip'); assert.equal(merged.report.addedDefinitions.length, 0); assert.equal(merged.report.addedBlueprints.length, 0); assert.equal(merged.report.addedProvenance, 1);
  const sourceA = readStudioKitProjectProvenance(merged.document).find(p => p.archiveSha256 === a.archiveSha256)!; assert.equal(sourceA.definitionIds.length, 6); assert.equal(sourceA.blueprintIds.length, 3);
  const other = prepareStudioKitImport(document(), 'other-project', b, 'subset.zip'); assert.equal(other.report.addedDefinitions.length, 4); assert.equal(readStudioKitProjectProvenance(other.document).length, 2);
});
test('future provenance remains untouched and incompatible claimed source identity is rejected', async () => {
  const kit = await readStudioKit(await courtyardStarterKit()), current = document(); current.extensions!.lfsStudioKits = { version: 2, records: [] }; const raw = JSON.stringify(current);
  assert.throws(() => prepareStudioKitImport(current, 'source', kit, 'kit.zip'), /future/); assert.equal(JSON.stringify(current), raw);
  const next = prepareStudioKitImport(document(), 'source', kit, 'kit.zip').document, value = next.extensions!.lfsStudioKits as any; value.records[0].author = 'Conflicting author'; assert.throws(() => prepareStudioKitImport(next, 'source', kit, 'kit.zip'), /provenance identity conflicts/);
});
test('retained provenance ceiling rejects before losing records or importing resources', async () => {
  const kit = await readStudioKit(await courtyardStarterKit()), current = document(); current.extensions!.lfsStudioKits = { version: 1, records: Array.from({ length: 32 }, (_, n) => ({ archiveSha256: n.toString(16).padStart(64, '0'), name: 'Retained source', author: 'Source', license: 'MIT', sourceUrl: '', licenseText: 'License', notices: '', definitionIds: [], blueprintIds: [] })) };
  const before = JSON.stringify(current); assert.throws(() => prepareStudioKitImport(current, 'source', kit, 'kit.zip'), /maximum 32/); assert.equal(JSON.stringify(current), before);
});
test('locked Java accepts unused Freeform kit resources, rejects unbound placement and admits mapped unit placement', async () => {
  const s = session(true), kit = await readStudioKit(await courtyardStarterKit()), beforePolicy = structuredClone(s.getDocument().targetPolicy); assert.equal(commit(s, prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip')).status, 'applied');
  assert.deepEqual(s.getDocument().targetPolicy, beforePolicy); const before = stable(s); assert.throws(() => prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', { x: 18, y: 1, z: 18 }, 0), /No explicit reviewed assignment/); assert.equal(stable(s), before);
  const bp = { ...kit.resources.blueprints[0], id: 'mapped-unit-blueprint', name: 'Mapped unit blueprint', blocks: [{ id: 'blueprint-unit-cell', blockDefId: 'unit', position: { x: 0, y: 0, z: 0 }, rotation: 0 as const }], customBlockDefs: [s.getDocument().customBlocks.unit], size: { lx: 1, ly: 1, lz: 1 } };
  assert.equal(s.setDocumentField('blueprints', [...s.getDocument().blueprints, bp]).status, 'applied'); const mappedBefore = structuredClone(s.getDocument()); const p = prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), bp.id, { x: -18, y: 1, z: 18 }, 0);
  assert.equal(s.transaction('Mapped prefab', () => { s.setEngineState(p.state); s.setDocumentField('chunkConfig', p.chunkConfig); }, JSON.parse(p.sourceToken)).status, 'applied'); assert.equal(s.getDocument().blocks['-18,1,18'].blockDefId, 'unit'); assert.deepEqual(s.getDocument().targetPolicy, beforePolicy); s.undo(); assert.deepEqual(s.getDocument(), mappedBefore);
  assert.throws(() => prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), bp.id, { x: -18, y: 1, z: 18 }, 90), /rotation/i);
});
test('prefab review adds/replaces exact cells, reveals destination chunks and undoes once', async () => {
  const s = session(), kit = await readStudioKit(await courtyardStarterKit()); commit(s, prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip')); const before = stable(s);
  const p = prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', { x: -18, y: 1, z: 18 }, 0); assert.equal(stable(s), before); assert.equal(p.report.added, 57); assert.equal(p.report.replaced, 0); assert.ok(p.report.revealedChunks.length > 0);
  const r = s.transaction('Place reviewed prefab', () => { s.setEngineState(p.state); s.setDocumentField('chunkConfig', p.chunkConfig); }, JSON.parse(p.sourceToken)); assert.equal(r.status, 'applied'); const after = structuredClone(s.getDocument()); s.undo(); assert.deepEqual(s.getDocument(), JSON.parse(before).document); s.redo(); assert.deepEqual(s.getDocument(), after);
  const noop = prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', { x: -18, y: 1, z: 18 }, 0); assert.equal(noop.report.noop, true); assert.equal(noop.report.cells.length, 0);
});
test('prefab review preserves quarter turns and detects replacements, stale mixed sources and out-of-bounds drafts', async () => {
  const s = session(), kit = await readStudioKit(await courtyardStarterKit()); commit(s, prepareStudioKitImport(s.getDocument(), token(s), kit, 'starter.zip'));
  const p = prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', { x: 1, y: 1, z: 1 }, 90); assert.equal(p.report.replaced, 1); assert.equal(p.report.cells.find(c => c.key === '1,1,1')!.before!.id, 'original-cell'); assert.equal(p.report.cells.find(c => c.key === '1,1,1')!.after.id, 'original-cell');
  assert.throws(() => prepareStudioPrefabPlacement(s.getDocument(), { ...s.getEngineState(), blocks: {} }, token(s), 'courtyard_v1_garden', { x: 0, y: 1, z: 0 }, 0), /one current/);
  for (const point of [{ x: NaN, y: 1, z: 0 }, { x: 1000001, y: 1, z: 0 }]) assert.throws(() => prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', point, 0), /bounded finite/);
  assert.throws(() => prepareStudioPrefabPlacement(s.getDocument(), s.getEngineState(), token(s), 'courtyard_v1_garden', { x: 0, y: 1, z: 0 }, 42 as 0), /quarter-turn/);
});
test('archive admission is required before proposal creation; a forged typed object has no authority', async () => {
  const kit = await readStudioKit(await courtyardStarterKit()); assert.throws(() => prepareStudioKitImport(document(), 'source', { ...kit }, 'forged.zip'), /verify the complete/);
});
