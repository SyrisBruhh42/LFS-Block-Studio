import test from 'node:test';
import assert from 'node:assert/strict';
import { importStudioCandidate, studioContentKey } from './legacyStudioImport';
import { STUDIO_DOCUMENT_LIMITS, type StudioDocument, type DocumentResult } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';

function value(result: DocumentResult<StudioDocument>): StudioDocument {
  if (result.ok === false) assert.fail(result.error.message);
  return result.value;
}
function rejects(data: unknown, pattern?: RegExp) {
  const result = importStudioCandidate(JSON.stringify(data), makeStudioDocument());
  assert.equal(result.ok, false);
  if (!result.ok && pattern) assert.match(result.error.message, pattern);
}
function legacy(document = makeStudioDocument()) {
  return {
    version: '1.0', savedAt: document.savedAt, ...document.world,
    blocks: document.blocks, customBlocks: Object.values(document.customBlocks),
    blueprints: document.blueprints, chunkConfig: document.chunkConfig,
    patternConfig: document.patternConfig, lightingConfig: document.lightingConfig,
  };
}

test('full project and completeDocument wrapper preserve all authored content and identity', () => {
  const document = makeStudioDocument();
  const first = Object.values(document.customBlocks)[0];
  first.color = '#abcdef'; first.name = 'Edited built-in';
  document.extensions = { target: { profile: 'future-profile', permitted: false, opaque: [null, 2] } };
  const raw = JSON.stringify(document);
  const direct = value(importStudioCandidate(raw, makeStudioDocument('unrelated')));
  assert.deepEqual(direct, document);
  const wrapped = value(importStudioCandidate(JSON.stringify({ ...legacy(), name: 'Wrong wrapper name', blocks: {}, completeDocument: document }), makeStudioDocument('unrelated')));
  assert.deepEqual(wrapped, document);
  assert.equal(JSON.stringify(document), raw);
});

test('invalid or unsupported completeDocument never falls back to valid-looking legacy fields', () => {
  rejects({ ...legacy(), completeDocument: null });
  rejects({ ...legacy(), completeDocument: { ...makeStudioDocument(), schemaVersion: 99 } }, /Unsupported/);
  const invalid = makeStudioDocument(); Object.values(invalid.blocks)[0].blockDefId = 'missing';
  rejects({ ...legacy(), completeDocument: invalid }, /Missing block definition/);
});

test('legacy complete export preserves edited built-ins, all configs and world metadata as a new candidate', () => {
  const original = makeStudioDocument();
  const first = Object.values(original.customBlocks)[0]; first.color = '#fefefe'; first.isCustom = false;
  original.world.description = 'Authored description'; original.world.roomCode = 'OLD-ROOM'; original.world.isPublicWorld = true;
  const data = { ...legacy(original), extensions: { note: 'retained JSON only' } };
  const result = value(importStudioCandidate(JSON.stringify(data), makeStudioDocument('defaults')));
  assert.notEqual(result.documentId, original.documentId);
  assert.notEqual(result.historyEpoch, original.historyEpoch);
  assert.equal(result.revision, 0);
  assert.deepEqual(result.world, original.world);
  assert.deepEqual(result.customBlocks, original.customBlocks);
  assert.deepEqual(result.blocks, original.blocks);
  assert.deepEqual(result.blueprints, original.blueprints);
  assert.deepEqual(result.chunkConfig, original.chunkConfig);
  assert.deepEqual(result.patternConfig, original.patternConfig);
  assert.deepEqual(result.lightingConfig, original.lightingConfig);
  assert.deepEqual(result.extensions, data.extensions);
});

test('duplicate legacy definition IDs reject instead of silently selecting the last definition', () => {
  const document = makeStudioDocument(); const first = Object.values(document.customBlocks)[0];
  rejects({ ...legacy(document), customBlocks: [first, { ...first, color: '#000000' }] }, /Duplicate block definition/);
  rejects({ ...legacy(document), customBlocks: [first, first] }, /Duplicate block definition/);
  const result = value(importStudioCandidate(JSON.stringify({ ...legacy(document), customBlocks: [{ ...first, color: '#123456' }] }), document));
  assert.equal(result.customBlocks[first.id].color, '#123456'); // One intentional built-in override is valid.
});

test('explicit malformed legacy values reject rather than being replaced by defaults', () => {
  for (const field of ['worldId', 'worldName', 'roomCode', 'isPublicWorld', 'savedAt', 'description', 'customBlocks', 'blueprints', 'chunkConfig', 'patternConfig', 'lightingConfig', 'extensions']) {
    const result = importStudioCandidate(JSON.stringify({ ...legacy(), [field]: null }), makeStudioDocument());
    assert.equal(result.ok, false, `${field} must reject explicit null`);
  }
  rejects({ ...legacy(), worldId: 42 });
  rejects({ ...legacy(), isPublicWorld: 'false' });
  rejects({ ...legacy(), customBlocks: {} });
});

test('omitted fields use isolated defaults without inheriting unrelated identity, sharing or opaque profile', () => {
  const defaults = makeStudioDocument();
  defaults.world.worldName = 'Unrelated project'; defaults.world.roomCode = 'UNRELATED-ROOM'; defaults.world.isPublicWorld = true;
  defaults.extensions = { target: { privateProfile: 'unrelated' } };
  const original = JSON.stringify(defaults);
  const imported = value(importStudioCandidate(JSON.stringify({ name: 'Old named project', blocks: {}, updatedAt: '2026-10-01T12:00:00.000Z' }), defaults));
  assert.equal(imported.world.worldName, 'Old named project');
  assert.equal(imported.world.roomCode, '');
  assert.equal(imported.world.isPublicWorld, false);
  assert.equal(imported.world.description, undefined);
  assert.equal(imported.extensions, undefined);
  assert.notEqual(imported.world.worldId, defaults.world.worldId);
  assert.deepEqual(imported.blueprints, defaults.blueprints);
  assert.deepEqual(imported.chunkConfig, defaults.chunkConfig);
  assert.equal(imported.savedAt, '2026-10-01T12:00:00.000Z');
  Object.values(imported.customBlocks)[0].name = 'Changed afterwards';
  imported.blueprints.length = 0;
  imported.chunkConfig.unlockedChunks.push('200,200');
  assert.equal(JSON.stringify(defaults), original);
});

test('unsupported envelopes, damaged JSON, unsafe definitions and oversized input reject without repair', () => {
  for (const envelope of [{ format: 'different-format' }, { schemaVersion: 2 }, { version: '2.0' }, { version: null }]) {
    const result = importStudioCandidate(JSON.stringify({ ...legacy(), ...envelope }), makeStudioDocument());
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'unsupported-schema');
  }
  const unsafe = JSON.parse(JSON.stringify(legacy()).replace('"customBlocks":[{', '"customBlocks":[{"__proto__":{"polluted":true},'));
  rejects(unsafe, /Unsafe object key/); assert.equal(({} as any).polluted, undefined);
  rejects({ ...legacy(), customBlocks: [{ ...Object.values(makeStudioDocument().customBlocks)[0], id: '__proto__' }] }, /identifier/);
  assert.equal(importStudioCandidate('{"blocks":', makeStudioDocument()).ok, false);
  const oversized = importStudioCandidate(' '.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1), makeStudioDocument());
  assert.equal(oversized.ok, false); if (!oversized.ok) assert.equal(oversized.error.code, 'size-limit');
});

test('content equality excludes save metadata but includes document-only metadata and every authored field', () => {
  const document = makeStudioDocument();
  const copy = { ...document, documentId: 'copy', revision: 100, historyEpoch: 'new-history', savedAt: '2026-10-31T01:00:00Z' };
  assert.equal(studioContentKey(document), studioContentKey(copy));
  assert.notEqual(studioContentKey(document), studioContentKey({ ...copy, world: { ...copy.world, description: 'Changed' } }));
  assert.notEqual(studioContentKey(document), studioContentKey({ ...copy, extensions: { profile: 'changed' } }));
  assert.notEqual(studioContentKey(document), studioContentKey({ ...copy, lightingConfig: { ...copy.lightingConfig!, fogDensity: 0.1 } }));
});
