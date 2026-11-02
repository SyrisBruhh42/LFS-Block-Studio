import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultBlockRegistry } from '../engine/worldEditEngine';
import { DEFAULT_CHUNK_CONFIG, DEFAULT_SMART_PATTERN_CONFIG } from '../engine/chunkAndPatternEngine';
import type { BlueprintPrefab, PlacedBlock } from '../engine/types';
import { validateStudioDocument } from './studioDocument';
import {
  prepareBlueprintImport, prepareCloudSnapshotImport, STUDIO_RESOURCE_IMPORT_LIMITS,
  type ResourceImportResult,
} from './studioResourceImport';

const definition = () => structuredClone(getDefaultBlockRegistry().grass_brick);
const block = (id = 'import-block', x = 0): PlacedBlock => ({ id, blockDefId: 'grass_brick', position: { x, y: 0, z: 0 }, rotation: 0 });
const blueprint = () => ({ blocks: [block()] });
const cloud = <T extends Record<string, unknown> = {}>(extra: T = {} as T) => ({ sourceId: 'cloud:fixture', name: 'Imported world', blocksData: JSON.stringify({ '0,0,0': block() }), ...extra });
function value<T>(result: ResourceImportResult<T>): T {
  if (!result.ok) assert.fail(result.error.message);
  return result.value;
}
function rejected<T>(result: ResourceImportResult<T>, match?: RegExp) {
  assert.equal(result.ok, false);
  if (result.ok) assert.fail('Expected rejection');
  if (match) assert.match(result.error.message, match);
  return result;
}

test('minimal blueprint uses documented defaults and retains exact text before creating a private archival candidate', () => {
  const raw = ` \n${JSON.stringify(blueprint(), null, 2)}\n `;
  const prepared = value(prepareBlueprintImport(raw, { sourceId: 'file:blueprint.json', authorId: 'local-user', authorName: 'Builder' }));
  assert.deepEqual(prepared.legacySources, [{ sourceId: 'file:blueprint.json', raw }]);
  assert.equal(prepared.blueprint.name, 'Imported Blueprint');
  assert.equal(prepared.blueprint.description, 'Imported blueprint');
  assert.equal(prepared.blueprint.blueprintType, 'structure_blueprint');
  assert.deepEqual(prepared.blueprint.size, { lx: 3, ly: 3, lz: 3 });
  assert.equal(prepared.blueprint.authorId, 'local-user');
  assert.equal(prepared.blueprint.authorName, 'Builder');
  assert.equal(prepared.blueprint.isPublic, false);
  assert.deepEqual(prepared.document.blocks, {});
  assert.deepEqual(prepared.document.blueprints, [prepared.blueprint]);
  assert.equal(prepared.document.schemaVersion, 1);
  assert.equal(validateStudioDocument(prepared.document).ok, true);
});

test('supplied blueprint metadata is validated before explicit local identity/private reassignment', () => {
  const imported: BlueprintPrefab = {
    ...blueprint(), id: 'remote-blueprint', name: 'Original name', description: 'Original description',
    authorId: 'remote-owner', authorName: 'Original creator', blueprintType: 'custom_block', isPublic: true,
    size: { lx: 1, ly: 1, lz: 1 }, customBlockDefs: [], createdAt: '2025-01-01T00:00:00Z',
  };
  const raw = JSON.stringify(imported);
  const prepared = value(prepareBlueprintImport(raw));
  assert.notEqual(prepared.blueprint.id, imported.id);
  assert.equal(prepared.blueprint.authorId, 'local_builder');
  assert.equal(prepared.blueprint.isPublic, false);
  for (const key of ['name', 'description', 'blueprintType', 'size', 'blocks', 'createdAt'] as const) assert.deepEqual(prepared.blueprint[key], imported[key]);
  assert.equal(prepared.legacySources[0].raw, raw);
  for (const field of ['id', 'name', 'description', 'authorId', 'authorName', 'blueprintType', 'isPublic', 'size', 'blocks', 'customBlockDefs', 'createdAt']) {
    rejected(prepareBlueprintImport(JSON.stringify({ ...imported, [field]: null })), undefined);
  }
  rejected(prepareBlueprintImport(JSON.stringify({ ...imported, id: '__proto__' })), /identifier/);
  rejected(prepareBlueprintImport(raw, { authorName: null as any }), /text/);
});

test('unknown blueprint and nested fields reject without stripping originals', () => {
  for (const data of [
    { ...blueprint(), target: 'unrecognized' },
    { ...blueprint(), format: 'newer-blueprint' },
    { ...blueprint(), size: { lx: 1, ly: 1, lz: 1, units: 'meters' } },
    { blocks: [{ ...block(), hidden: true }] },
    { ...blueprint(), customBlockDefs: [{ ...definition(), sourceUrl: 'unknown-field' }] },
  ]) {
    const raw = JSON.stringify(data);
    const result = rejected(prepareBlueprintImport(raw), /Unknown|unknown/);
    assert.equal(result.legacySources[0].raw, raw);
  }
});

test('blueprint duplicate definitions, unsafe IDs, missing references and conflicting anchors reject', () => {
  for (const defs of [[definition(), definition()], [definition(), { ...definition(), color: '#abcdef' }]]) {
    rejected(prepareBlueprintImport(JSON.stringify({ ...blueprint(), customBlockDefs: defs })), /Duplicate block definition/);
  }
  for (const id of ['__proto__', 'constructor', 'prototype', 'invalid id', '', 'a'.repeat(201)]) {
    rejected(prepareBlueprintImport(JSON.stringify({ ...blueprint(), customBlockDefs: [{ ...definition(), id }] })), /identifier/);
  }
  rejected(prepareBlueprintImport(JSON.stringify({ blocks: [{ ...block(), blockDefId: 'unrelated-project-only' }] })), /Missing block definition/);
  rejected(prepareBlueprintImport(JSON.stringify({ blocks: [block(), block()] })), /Duplicate blueprint block ID/);
  rejected(prepareBlueprintImport(JSON.stringify({ blocks: [block(), block('second')] })), /Conflicting blueprint anchors/);
  rejected(prepareBlueprintImport(JSON.stringify({ blocks: [block(), block('second', 0.2)] })), /Conflicting blueprint anchors/);
});

test('embedded blueprint built-in overrides remain scoped; preparation never changes global defaults', () => {
  const canonical = getDefaultBlockRegistry();
  const raw = JSON.stringify({ ...blueprint(), customBlockDefs: [{ ...definition(), color: '#123456', isCustom: false }] });
  const prepared = value(prepareBlueprintImport(raw));
  assert.equal(prepared.blueprint.customBlockDefs[0].color, '#123456');
  assert.deepEqual(prepared.document.customBlocks, canonical);
  prepared.blueprint.customBlockDefs[0].color = '#ffffff';
  assert.deepEqual(getDefaultBlockRegistry(), canonical);
  assert.equal(prepared.legacySources[0].raw, raw);
});

test('cloud candidate uses fresh canonical settings and empty library without inherited identity/sharing/profile', () => {
  const prepared = value(prepareCloudSnapshotImport(cloud()));
  const document = prepared.document;
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.revision, 0);
  assert.equal(document.world.worldName, 'Imported world');
  assert.equal(document.world.roomCode, '');
  assert.equal(document.world.isPublicWorld, false);
  assert.equal(document.world.description, undefined);
  assert.equal(document.extensions, undefined);
  assert.equal(document.lightingConfig, undefined);
  assert.deepEqual(document.blueprints, []);
  assert.deepEqual(document.customBlocks, getDefaultBlockRegistry());
  assert.deepEqual(document.chunkConfig, DEFAULT_CHUNK_CONFIG);
  assert.deepEqual(document.patternConfig, DEFAULT_SMART_PATTERN_CONFIG);
  const again = value(prepareCloudSnapshotImport(cloud())).document;
  assert.notEqual(document.documentId, again.documentId);
  assert.notEqual(document.historyEpoch, again.historyEpoch);
  assert.notEqual(document.world.worldId, again.world.worldId);
  document.chunkConfig.unlockedChunks.push('99,99'); document.patternConfig.seed = 100;
  assert.deepEqual(again.chunkConfig, DEFAULT_CHUNK_CONFIG);
  assert.deepEqual(again.patternConfig, DEFAULT_SMART_PATTERN_CONFIG);
  rejected(prepareCloudSnapshotImport(cloud({ extensions: { target: 'unrelated' } }) as any), /Unknown/);
});

test('cloud definitions preserve one explicit edited built-in and all original source formatting', () => {
  const edited = { ...definition(), color: '#abcdef', isCustom: false };
  const custom = { ...definition(), id: 'standalone-custom', name: 'Independent custom' };
  const blocksData = `\n {"0,0,0": ${JSON.stringify({ ...block(), blockDefId: custom.id })}} \n`;
  const customBlocksData = ` [\n${JSON.stringify(edited)}, ${JSON.stringify(custom)}\n] `;
  const input = cloud({ blocksData, customBlocksData });
  const before = JSON.stringify(input);
  const prepared = value(prepareCloudSnapshotImport(input));
  assert.equal(prepared.document.customBlocks.grass_brick.color, '#abcdef');
  assert.equal(prepared.document.blocks['0,0,0'].blockDefId, custom.id);
  assert.deepEqual(prepared.legacySources, [
    { sourceId: 'cloud:fixture:blocksData', raw: blocksData },
    { sourceId: 'cloud:fixture:customBlocksData', raw: customBlocksData },
  ]);
  assert.equal(JSON.stringify(input), before);
  prepared.document.customBlocks.grass_brick.color = '#000000';
  assert.equal(input.customBlocksData, customBlocksData);
});

test('cloud duplicate/unsafe definitions reject before map construction, retaining both originals', () => {
  for (const defs of [
    [definition(), definition()], [definition(), { ...definition(), color: '#abcdef' }],
    [{ ...definition(), id: '__proto__' }], [{ ...definition(), id: 'constructor' }],
  ]) {
    const input = cloud({ customBlocksData: JSON.stringify(defs) });
    const result = rejected(prepareCloudSnapshotImport(input), /Duplicate|identifier/);
    assert.deepEqual(result.legacySources.map(source => source.raw), [input.blocksData, input.customBlocksData]);
  }
  assert.equal(({} as any).polluted, undefined);
});

test('duplicate JSON keys and escaped equivalent keys cannot silently select one value', () => {
  const duplicateBlocks = `{"0,0,0":${JSON.stringify(block())},"0,0,0":${JSON.stringify(block('second'))}}`;
  const escapedBlockKey = `{"0,0,0":${JSON.stringify(block())},"\\u0030,0,0":${JSON.stringify(block('second'))}}`;
  for (const blocksData of [duplicateBlocks, escapedBlockKey]) {
    rejected(prepareCloudSnapshotImport(cloud({ blocksData })), /Duplicate JSON object key/);
  }
  rejected(prepareBlueprintImport('{"blocks":[],"bl\\u006fcks":[]}'), /Duplicate JSON object key/);
  rejected(prepareBlueprintImport('{"blocks":[],"size":{"lx":1,"ly":1,"lz":1,"lx":2}}'), /Duplicate JSON object key/);
  rejected(prepareBlueprintImport('{"blocks":[],"__pr\\u006fto__":{}}'), /Unsafe JSON object key/);
});

test('cloud malformed/unknown fields do not discard either intact raw source or accept missing references', () => {
  for (const blocksData of ['{"0,0,0":', '[]', JSON.stringify({ '0,0,0': { ...block(), blockDefId: 'not-present' } }), JSON.stringify({ '0,0,0': { ...block(), unknown: 1 } })]) {
    const input = cloud({ blocksData, customBlocksData: ' []\n' });
    const result = rejected(prepareCloudSnapshotImport(input));
    assert.deepEqual(result.legacySources.map(source => source.raw), [blocksData, input.customBlocksData]);
  }
  const wrongEnvelope = cloud({ unknown: 'must reject', customBlocksData: '[]' });
  const result = rejected(prepareCloudSnapshotImport(wrongEnvelope as any), /Unknown/);
  assert.deepEqual(result.legacySources.map(source => source.raw), [wrongEnvelope.blocksData, '[]']);
  rejected(prepareCloudSnapshotImport(cloud({ customBlocksData: 'null' })), /list/);
  rejected(prepareCloudSnapshotImport(cloud({ name: null })), /text/);
  rejected(prepareCloudSnapshotImport({ blocksData: '{}' } as any), /Required/);
});

test('UTF-8 byte and nesting limits reject before normalization while other bounded originals remain recoverable', () => {
  const tooLarge = ' '.repeat(STUDIO_RESOURCE_IMPORT_LIMITS.maxSourceBytes + 1);
  const tooManyBytes = `"${'é'.repeat(STUDIO_RESOURCE_IMPORT_LIMITS.maxSourceBytes / 2)}"`;
  for (const raw of [tooLarge, tooManyBytes]) {
    const blueprintResult = rejected(prepareBlueprintImport(raw));
    assert.equal(blueprintResult.error.code, 'size-limit');
    assert.deepEqual(blueprintResult.legacySources, []);
    const cloudResult = rejected(prepareCloudSnapshotImport(cloud({ blocksData: raw, customBlocksData: ' [] ' })));
    assert.equal(cloudResult.error.code, 'size-limit');
    assert.deepEqual(cloudResult.legacySources.map(source => source.raw), [' [] ']);
  }
  const deeplyNested = '['.repeat(25) + '0' + ']'.repeat(25);
  const result = rejected(prepareBlueprintImport(deeplyNested), /nesting limit/);
  assert.equal(result.error.code, 'size-limit');
  assert.equal(result.legacySources[0].raw, deeplyNested);
});

test('definition-count limits are enforced before any ID map is constructed', () => {
  const defs = Array.from({ length: 4097 }, (_, i) => ({ ...definition(), id: `def-${i}` }));
  const result = rejected(prepareCloudSnapshotImport(cloud({ customBlocksData: JSON.stringify(defs) })), /Too many/);
  assert.equal(result.error.code, 'size-limit');
  assert.equal(result.legacySources.length, 2);
});

test('structured options/envelopes do not execute accessors or accept unknown input fields', () => {
  let accessed = false;
  const options = { get authorName() { accessed = true; return 'bad'; } };
  const raw = JSON.stringify(blueprint());
  const result = rejected(prepareBlueprintImport(raw, options), /data fields/);
  assert.equal(accessed, false);
  assert.equal(result.legacySources[0].raw, raw);
  const input = { ...cloud(), get customBlocksData() { accessed = true; return '[]'; } };
  rejected(prepareCloudSnapshotImport(input), /data fields/);
  assert.equal(accessed, false);
});

test('escaped JSON string punctuation and nested arrays do not confuse duplicate-key scanning', () => {
  const data = { ...blueprint(), name: 'A \\"quoted\\" : { key, } [name]', description: 'same : key, { and } repeated words: key' };
  const prepared = value(prepareBlueprintImport(JSON.stringify(data)));
  assert.equal(prepared.blueprint.name, data.name);
  assert.equal(prepared.blueprint.description, data.description);
});
