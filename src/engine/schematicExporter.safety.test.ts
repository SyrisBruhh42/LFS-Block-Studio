import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialEngineState } from './worldEditEngine';
import { preflightLegacyExport, exportCommentName } from './exportPreflight';
import { computeInitialBlockMappings, exportSpongeSchematicJson, exportMinecraftFunction, validateMappingSuggestions, evaluateBlockMappingsWithAI } from './schematicExporter';
import { generateGodotGdScript } from './godotExporter';

const block = (x = 0, y = 0, z = 0) => ({ id: `block-${x}-${y}-${z}`, blockDefId: 'cobble_brick', position: { x, y, z }, rotation: 0 as const });
const mapping = { cobble_brick: 'minecraft:cobblestone' };

test('sparse diagnostic bounds reject before attempting a dense export', () => {
  const blocks = { a: block(-1_000_000), b: block(1_000_000) };
  assert.throws(() => exportSpongeSchematicJson('Sparse', blocks, mapping), /bounding box exceeds/);
  assert.equal(Object.keys(blocks).length, 2);
});

test('draft Minecraft exports reject fractional, nonfinite and overlapping coordinates', () => {
  for (const x of [0.25, NaN, Infinity, 1_000_001]) {
    assert.throws(() => exportSpongeSchematicJson('Invalid', { a: block(x) }, mapping), /whole-cell/);
    assert.throws(() => exportMinecraftFunction('Invalid', { a: block(x) }, mapping), /whole-cell/);
  }
  assert.throws(() => preflightLegacyExport({ a: block(), b: block() }), /same anchor/);
});

test('draft mappings reject missing IDs, inherited IDs and injected commands without fallback', () => {
  for (const targets of [{}, Object.create(mapping), { cobble_brick: 'minecraft:stone\nkill @e' }, { cobble_brick: 'minecraft:nonexistent' }]) {
    assert.throws(() => exportSpongeSchematicJson('Invalid', { a: block() }, targets), /No fallback/);
    assert.throws(() => exportMinecraftFunction('Invalid', { a: block() }, targets), /No fallback/);
  }
});

test('source accessors are rejected without invoking them and missing definitions stay explicit', () => {
  let called = false;
  const blocks = Object.defineProperty({}, 'a', { enumerable: true, get() { called = true; return block(); } });
  assert.throws(() => preflightLegacyExport(blocks), /unsafe/);
  assert.equal(called, false);
  assert.throws(() => preflightLegacyExport({ a: block() }, { definitions: {} }), /Missing definition/);
});

test('negative asymmetric diagnostic region keeps its index order and clearly declares its limits', () => {
  const json = JSON.parse(exportSpongeSchematicJson('Axis fixture', { a: block(-3, 2, 5), b: block(-1, 3, 6) }, mapping));
  assert.deepEqual([json.Width, json.Height, json.Length], [3, 2, 2]);
  assert.equal(json.BlockData.length, 12);
  assert.equal(json.BlockData[0], 1);
  assert.equal(json.BlockData[11], 1);
  assert.equal(json.BlockData.filter((value: number) => value !== 0).length, 2);
  assert.match(json.Format, /not a native schematic/);
  assert.match(json.Limitations, /not preserved/);
});

test('world names cannot inject additional mcfunction commands', () => {
  const text = exportMinecraftFunction('Name\nkill @e\r\nsay injected', { a: block() }, mapping);
  assert.equal(text.split('\n').filter(line => line && !line.startsWith('#')).length, 1);
  assert.equal(exportCommentName('A\u2028B\u0000C'), 'A B C');
});

test('multiline imported project names cannot escape a generated Godot comment', () => {
  const text = generateGodotGdScript('Harmless title\nvar injected_marker = 123\r\n#\u2028func malicious(): pass', {}, {});
  assert.ok(text.includes('injected_marker'));
  assert.equal(text.split('\n').some(line => !line.startsWith('#') && /injected_marker|malicious/.test(line)), false);
  assert.match(text.split('\n')[0], /unqualified/);
  assert.doesNotMatch(text, /Renderer ready/);
});

function suggestionsFixture() {
  const state = createInitialEngineState();
  const rows = computeInitialBlockMappings(state.blocks, state.customBlocks);
  const value = { mappings: [{ sourceBlockId: rows[0].sourceBlockId, recommendedTargetId: 'minecraft:oak_planks', confidence: 5, reasoning: 'Color approximation only', alternatives: ['minecraft:cobblestone'] }] };
  return { rows, value };
}

test('AI mapping validation retains absent rows, admits low scores without inflation, and isolates arrays', () => {
  const { rows, value } = suggestionsFixture();
  const result = validateMappingSuggestions(rows, value);
  assert.equal(result[0].confidence, 5);
  assert.equal(result[0].selectedTargetId, 'minecraft:oak_planks');
  assert.deepEqual(result[1], rows[1]);
  result[0].alternatives.push('minecraft:glass');
  assert.equal(value.mappings[0].alternatives.length, 1);
});

test('unknown, duplicate, malformed and oversized AI suggestions reject the whole response', () => {
  const { rows, value } = suggestionsFixture();
  const baseline = structuredClone(rows);
  for (const patch of [{ recommendedTargetId: 'minecraft:unknown' }, { sourceBlockId: 'unknown' }, { confidence: NaN }, { confidence: 101 }, { reasoning: 'x'.repeat(2001) }, { alternatives: ['minecraft:unknown'] }]) {
    assert.throws(() => validateMappingSuggestions(rows, { mappings: [{ ...value.mappings[0], ...patch }] }));
  }
  assert.throws(() => validateMappingSuggestions(rows, { mappings: [value.mappings[0], value.mappings[0]] }));
  assert.throws(() => validateMappingSuggestions(rows, { mappings: Array(4097).fill(value.mappings[0]) }));
  assert.throws(() => validateMappingSuggestions(rows, {}));
  assert.deepEqual(rows, baseline);
});

test('AI transport bounds a streamed response and forwards cancellation without provider access', async () => {
  const originalFetch = globalThis.fetch;
  const { rows } = suggestionsFixture();
  let cancelled = false;
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }));
    await assert.rejects(evaluateBlockMappingsWithAI(rows), /size budget/);
    assert.equal(cancelled, true);
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async (_url, options) => { options?.signal?.throwIfAborted(); return new Response('{}'); };
    await assert.rejects(evaluateBlockMappingsWithAI(rows, 'draft', controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});
