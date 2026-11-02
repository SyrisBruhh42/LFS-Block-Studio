import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudioDocument, STUDIO_DOCUMENT_LIMITS, validateStudioDocument } from './studioDocument';
import { makeStudioDocument } from './studioDocument.test-fixtures';

function rejects(value: unknown, message: RegExp) {
  const result = validateStudioDocument(value);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, message);
}

test('actual initial engine, all starter blueprints and authored defaults round-trip completely', () => {
  const document = makeStudioDocument();
  const result = validateStudioDocument(document);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.deepEqual(result.value, document);
  const reparsed = parseStudioDocument(JSON.stringify(document));
  assert.deepEqual(reparsed, result);
});

test('edited built-ins, custom scales, chunks, pattern, lighting and opaque extensions survive independently', () => {
  const document = makeStudioDocument();
  const definition = Object.values(document.customBlocks)[0];
  definition.color = '#abcdef'; definition.name = 'Edited built-in'; definition.isCustom = false;
  const block = Object.values(document.blocks)[0];
  block.customScale = { x: 1.25, y: 2.5, z: 0.5 };
  document.chunkConfig.unlockedChunks.push('-2,3'); document.chunkConfig.activeChunks['-2,3'] = false;
  document.patternConfig.seed = 151; document.lightingConfig!.fogDensity = 0.32;
  document.extensions = { 'target-reference': { profileId: 'future:reference', data: [1, false, null] } };
  const result = validateStudioDocument(document);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.deepEqual(result.value, document);
    definition.color = '#000000';
    assert.equal(result.value.customBlocks[definition.id].color, '#abcdef');
  }
});

test('missing definitions and inconsistent dictionary keys are rejected without repair', () => {
  const document = makeStudioDocument();
  const [key, first] = Object.entries(document.blocks)[0];
  first.blockDefId = 'missing-definition'; rejects(document, /Missing block definition/);
  const second = makeStudioDocument(); second.blocks['999,0,0'] = second.blocks[key]; delete second.blocks[key];
  rejects(second, /key must match/);
});

test('invalid positions, rotations, scales and duplicate identities are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, STUDIO_DOCUMENT_LIMITS.maxCoordinate + 1]) {
    const document = makeStudioDocument(); Object.values(document.blocks)[0].position.x = value;
    assert.equal(validateStudioDocument(document).ok, false);
  }
  const scale = makeStudioDocument(); Object.values(scale.blocks)[0].customScale = { x: 0, y: 1, z: 1 }; rejects(scale, /finite number/);
  const duplicate = makeStudioDocument(); const blocks = Object.values(duplicate.blocks); blocks[1].id = blocks[0].id; rejects(duplicate, /Duplicate block ID/);
  const rotation = makeStudioDocument(); (Object.values(rotation.blocks)[0] as any).rotation = 45; rejects(rotation, /Unsupported value/);
});

test('unknown fields, versions and unsafe JSON retain originals by rejection instead of stripping', () => {
  const unknown = { ...makeStudioDocument(), extraAuthoredData: { important: true } };
  const raw = JSON.stringify(unknown); rejects(unknown, /Unknown field/); assert.equal(JSON.stringify(unknown), raw);
  const future = { ...makeStudioDocument(), schemaVersion: 99 };
  const result = validateStudioDocument(future); assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'unsupported-schema');
  const poison = JSON.parse(JSON.stringify(makeStudioDocument()).replace('"world":{', '"world":{"__proto__":{"polluted":true},'));
  rejects(poison, /Unsafe object key/); assert.equal(({} as any).polluted, undefined);
});

test('cyclic, accessor, sparse and oversized inputs fail before unsafe serialization', () => {
  const cyclic: any = makeStudioDocument(); cyclic.extensions = { cycle: cyclic }; rejects(cyclic, /Cyclic/);
  let invoked = false; const accessor: any = makeStudioDocument();
  Object.defineProperty(accessor, 'extensions', { enumerable: true, get: () => { invoked = true; return {}; } });
  rejects(accessor, /Accessors/); assert.equal(invoked, false);
  const hidden: any = makeStudioDocument(); Object.defineProperty(hidden, 'hiddenAuthoredField', { value: true }); rejects(hidden, /Non-enumerable/);
  const sparse = makeStudioDocument(); sparse.extensions = { data: new Array(2) }; rejects(sparse, /Sparse/);
  const result = parseStudioDocument(' '.repeat(STUDIO_DOCUMENT_LIMITS.maxBytes + 1));
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'size-limit');
});
