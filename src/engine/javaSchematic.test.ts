import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { JAVA_SCHEMATIC_PROFILE } from './javaProfile';
import { encodeJavaSchematic, JavaSchematicError, validateJavaSchematicInput, type JavaSchematicInput } from './javaSchematic';

// Test-only structural oracle. No production NBT/index/offset helpers are reused.
// This is NOT a Minecraft or WorldEdit native-qualification test.
interface NbtTag { type: number; value: any; elementType?: number }
function readNbt(bytes: Uint8Array): Record<string, NbtTag> {
  const data = Buffer.from(bytes);
  let cursor = 0;
  const take = (size: number) => {
    assert.ok(Number.isSafeInteger(size) && size >= 0 && cursor + size <= data.length, 'truncated NBT');
    const start = cursor; cursor += size; return start;
  };
  const byte = () => data.readUInt8(take(1));
  const uint16 = () => data.readUInt16BE(take(2));
  const int32 = () => data.readInt32BE(take(4));
  const string = () => {
    const size = uint16();
    const end = cursor + size;
    assert.ok(end <= data.length, 'truncated NBT string');
    let text = '';
    while (cursor < end) {
      const first = byte();
      if ((first & 0x80) === 0) text += String.fromCharCode(first);
      else {
        const continuation = () => { assert.ok(cursor < end); const n = byte(); assert.equal(n & 0xc0, 0x80); return n & 0x3f; };
        if ((first & 0xe0) === 0xc0) text += String.fromCharCode(((first & 0x1f) << 6) + continuation());
        else { assert.equal(first & 0xf0, 0xe0, 'expected modified UTF-8'); text += String.fromCharCode(((first & 15) << 12) + (continuation() << 6) + continuation()); }
      }
    }
    assert.equal(cursor, end);
    return text;
  };
  const payload = (type: number): NbtTag => {
    switch (type) {
      case 2: return { type, value: data.readInt16BE(take(2)) };
      case 3: return { type, value: int32() };
      case 7: { const length = int32(); return { type, value: data.subarray(take(length), cursor) }; }
      case 8: return { type, value: string() };
      case 9: {
        const elementType = byte(), length = int32();
        assert.ok(length >= 0 && length <= 100_000);
        return { type, elementType, value: Array.from({ length }, () => payload(elementType)) };
      }
      case 10: {
        const value: Record<string, NbtTag> = Object.create(null);
        while (true) {
          const nextType = byte();
          if (nextType === 0) break;
          const key = string();
          assert.equal(Object.hasOwn(value, key), false, 'duplicate NBT tag');
          value[key] = payload(nextType);
        }
        return { type, value };
      }
      case 11: { const length = int32(); assert.ok(length >= 0 && length <= 100_000); return { type, value: Array.from({ length }, int32) }; }
      default: assert.fail(`Unexpected tag type ${type}`);
    }
  };
  assert.equal(byte(), 10, 'root must be a compound');
  assert.equal(string(), '', 'root must be unnamed');
  const root = payload(10).value;
  assert.equal(cursor, data.length, 'trailing NBT bytes');
  assert.deepEqual(Object.keys(root), ['Schematic']);
  assert.equal(root.Schematic.type, 10);
  return root.Schematic.value;
}

function decodeIds(data: Uint8Array, palette: Record<string, NbtTag>, volume: number): number[] {
  const known = new Set(Object.values(palette).map(tag => { assert.equal(tag.type, 3); return tag.value; }));
  const result: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    let value = 0, shift = 0, current: number;
    do {
      assert.ok(offset < data.length && shift < 35, 'invalid or truncated varint');
      current = data[offset++];
      value += (current & 127) * 2 ** shift;
      shift += 7;
    } while (current & 128);
    assert.ok(known.has(value), 'unknown palette ID');
    result.push(value);
    assert.ok(result.length <= volume, 'excess block data');
  }
  assert.equal(result.length, volume, 'missing block data');
  return result;
}
function decode(bytes: Uint8Array) {
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0x1f, 0x8b, 8]);
  const raw = gunzipSync(bytes);
  const schematic = readNbt(raw);
  for (const key of ['Version', 'DataVersion']) assert.equal(schematic[key].type, 3);
  for (const key of ['Width', 'Height', 'Length']) assert.equal(schematic[key].type, 2);
  assert.equal(schematic.Offset.type, 11); assert.equal(schematic.Offset.value.length, 3);
  assert.equal(schematic.Blocks.type, 10);
  const blocks = schematic.Blocks.value;
  assert.equal(blocks.Palette.type, 10); assert.equal(blocks.Data.type, 7);
  assert.equal(blocks.BlockEntities.type, 9); assert.equal(blocks.BlockEntities.elementType, 10);
  assert.deepEqual(blocks.BlockEntities.value, []);
  const dimensions = [schematic.Width.value & 65535, schematic.Height.value & 65535, schematic.Length.value & 65535];
  const ids = decodeIds(blocks.Data.value, blocks.Palette.value, dimensions.reduce((a, b) => a * b, 1));
  return { raw, schematic, blocks, dimensions, ids };
}

function fixture(): JavaSchematicInput {
  return {
    name: 'Asymmetric fixture', source: { documentId: 'fixture-1', revision: 7, historyEpoch: 'epoch-2' },
    bounds: { min: { x: -4, y: -2, z: 7 }, max: { x: -2, y: -1, z: 10 } },
    anchor: { x: 1, y: -5, z: 10 },
    cells: [
      { x: -4, y: -2, z: 7, blockState: 'minecraft:stone' },
      { x: -2, y: -2, z: 7, blockState: 'minecraft:cobblestone' },
      { x: -4, y: -2, z: 10, blockState: 'minecraft:oak_planks' },
      { x: -3, y: -1, z: 9, blockState: 'minecraft:stone' },
    ],
  };
}
function airBox(width = 1, height = 1, length = 1): JavaSchematicInput {
  return { ...fixture(), cells: [], anchor: { x: 0, y: 0, z: 0 },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: width - 1, y: height - 1, z: length - 1 } } };
}
function rejected(value: unknown, pattern?: RegExp): void {
  const result = validateJavaSchematicInput(value);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.error.code, 'invalid-input'); if (pattern) assert.match(result.error.message, pattern); }
}

test('candidate profile pins DataVersion rather than protocol and cannot claim native qualification', () => {
  assert.equal(JAVA_SCHEMATIC_PROFILE.gameVersion, '1.21.1');
  assert.equal(JAVA_SCHEMATIC_PROFILE.dataVersion, 3955);
  assert.equal(JAVA_SCHEMATIC_PROFILE.worldEditVersion, '7.3.8');
  assert.equal(JAVA_SCHEMATIC_PROFILE.nativeQualification, 'not-run');
  assert.deepEqual(JAVA_SCHEMATIC_PROFILE.blockStates, ['minecraft:air', 'minecraft:stone', 'minecraft:cobblestone', 'minecraft:oak_planks']);
  assert.ok(Object.isFrozen(JAVA_SCHEMATIC_PROFILE));
  assert.ok(Object.isFrozen(JAVA_SCHEMATIC_PROFILE.blockStates));
  assert.ok(Object.isFrozen(JAVA_SCHEMATIC_PROFILE.limits));
});

test('independent NBT oracle verifies v3 structure, exact cell order and hand-calculated negative offset fixture', async () => {
  const { bytes, report } = await encodeJavaSchematic(fixture());
  const { raw, schematic, blocks, dimensions, ids } = decode(bytes);
  assert.equal(schematic.Version.value, 3); assert.equal(schematic.DataVersion.value, 3955);
  assert.deepEqual(dimensions, [3, 2, 4]);
  assert.deepEqual(schematic.Offset.value, [-5, 3, -3]);
  assert.deepEqual(Object.keys(schematic).sort(), ['Blocks', 'DataVersion', 'Height', 'Length', 'Metadata', 'Offset', 'Version', 'Width']);
  assert.deepEqual(Object.keys(schematic.Metadata.value), ['Name']);
  assert.equal(schematic.Metadata.value.Name.type, 8);
  assert.equal(schematic.Metadata.value.Name.value, 'Asymmetric fixture');
  assert.deepEqual(Object.entries(blocks.Palette.value as Record<string, NbtTag>).map(([state, tag]) => [state, tag.value]),
    [['minecraft:air', 0], ['minecraft:stone', 1], ['minecraft:cobblestone', 2], ['minecraft:oak_planks', 3]]);
  assert.deepEqual(ids, [1, 0, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  // Native placement expectation derived independently from literal positions, not writer helpers.
  const paste = [100, 64, -20];
  const markerLocals = [[0, 0, 0], [2, 0, 0], [0, 0, 3], [1, 1, 2]];
  assert.deepEqual(markerLocals.map(local => local.map((n, axis) => n + paste[axis] + schematic.Offset.value[axis])),
    [[95, 67, -23], [97, 67, -23], [95, 67, -20], [96, 68, -21]]);
  assert.equal(report.nbtByteLength, raw.length);
  assert.equal(report.volume, 24); assert.equal(report.nonAirCells, 4);
  assert.equal(report.explicitAirCells, 0); assert.equal(report.implicitAirCells, 20);
  assert.equal(report.sourceIdentityKind, 'caller-supplied');
  assert.equal(report.profile.nativeQualification, 'not-run');
});

test('source entry order does not change canonical NBT or deterministic report', async () => {
  const a = fixture(), b = { ...a, cells: [...a.cells].reverse() };
  const first = await encodeJavaSchematic(a), second = await encodeJavaSchematic(b);
  assert.deepEqual(first.report, second.report);
  assert.deepEqual(gunzipSync(first.bytes), gunzipSync(second.bytes));
  assert.deepEqual(validateJavaSchematicInput(a), { ok: true, report: first.report });
});

test('explicit and absent air are both encoded, while an all-air selected region is allowed', async () => {
  const input = { ...airBox(3), cells: [
    { x: 0, y: 0, z: 0, blockState: 'minecraft:air' as const },
    { x: 1, y: 0, z: 0, blockState: 'minecraft:oak_planks' as const },
  ] };
  const { bytes, report } = await encodeJavaSchematic(input);
  assert.deepEqual(decode(bytes).ids, [0, 1, 0]);
  assert.deepEqual(report.palette, [
    { blockState: 'minecraft:air', id: 0, cells: 2 }, { blockState: 'minecraft:oak_planks', id: 1, cells: 1 },
  ]);
  assert.equal(report.explicitAirCells, 1); assert.equal(report.implicitAirCells, 1);
  const empty = await encodeJavaSchematic(airBox());
  assert.deepEqual(decode(empty.bytes).ids, [0]);
  assert.deepEqual(empty.report.palette, [{ blockState: 'minecraft:air', id: 0, cells: 1 }]);
});

test('dense budget accepts 100000 cells, rejects large sparse bounds, and checks before reading cells', async () => {
  const valid = await encodeJavaSchematic(airBox(50_000, 2));
  assert.equal(decode(valid.bytes).ids.length, 100_000);
  rejected(airBox(50_001, 2), /work budget/);
  rejected(airBox(65_535, 65_535, 65_535), /work budget/);
  let invoked = false;
  const cells: unknown[] = [];
  Object.defineProperty(cells, '0', { get() { invoked = true; throw new Error('must not run'); }, enumerable: true });
  rejected({ ...airBox(50_001, 2), cells }, /work budget/);
  assert.equal(invoked, false);
});

test('NBT Shorts preserve unsigned dimensions 32768 and 65535 without accepting 65536', async () => {
  for (const width of [32_768, 65_535]) {
    const decoded = decode((await encodeJavaSchematic(airBox(width))).bytes);
    assert.equal(decoded.dimensions[0], width);
    assert.equal(decoded.schematic.Width.value, width - 65_536);
  }
  rejected(airBox(65_536), /1–65535/);
  rejected(airBox(0), /ordered/);
});

test('coordinates and derived offsets are signed Int32 values without coercion or rounding', async () => {
  const negative = { x: -2_147_483_648, y: 0, z: 0 };
  const result = await encodeJavaSchematic({ ...airBox(), bounds: { min: negative, max: negative } });
  assert.deepEqual(decode(result.bytes).schematic.Offset.value, [-2_147_483_648, 0, 0]);
  const positive = await encodeJavaSchematic({ ...airBox(), anchor: { x: -2_147_483_647, y: 0, z: 0 } });
  assert.deepEqual(decode(positive.bytes).schematic.Offset.value, [2_147_483_647, 0, 0]);
  rejected({ ...airBox(), anchor: negative }, /offset/);
  rejected({ ...airBox(), bounds: { min: negative, max: negative }, anchor: { x: 1, y: 0, z: 0 } }, /offset/);
  for (const x of [NaN, Infinity, -Infinity, 0.5, 2_147_483_648, -2_147_483_649]) {
    rejected({ ...airBox(), anchor: { x, y: 0, z: 0 } });
    rejected({ ...airBox(), bounds: { min: { x, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } });
    rejected({ ...airBox(), cells: [{ x, y: 0, z: 0, blockState: 'minecraft:stone' }] });
  }
});

test('an individually valid offset cannot let the clipboard far edge wrap signed Int32', async () => {
  const atEdge = { ...airBox(2), anchor: { x: -2_147_483_646, y: 0, z: 0 } };
  assert.deepEqual(decode((await encodeJavaSchematic(atEdge)).bytes).schematic.Offset.value, [2_147_483_646, 0, 0]);
  rejected({ ...airBox(2), anchor: { x: -2_147_483_647, y: 0, z: 0 } }, /relativeMaximum/);
  rejected({ ...airBox(1, 2), anchor: { x: 0, y: -2_147_483_647, z: 0 } }, /relativeMaximum/);
  rejected({ ...airBox(1, 1, 2), anchor: { x: 0, y: 0, z: -2_147_483_647 } }, /relativeMaximum/);
});

test('duplicate positions, out-of-scope cells and unsupported states reject the entire export', async () => {
  const cell = { x: 0, y: 0, z: 0, blockState: 'minecraft:stone' as const };
  rejected({ ...airBox(2), cells: [cell, { ...cell }] }, /Duplicate/);
  rejected({ ...airBox(2), cells: [cell, { ...cell, x: -0 }] }, /Duplicate/);
  rejected({ ...airBox(), cells: [{ ...cell, x: 1 }] }, /outside/);
  for (const blockState of ['stone', 'minecraft:stone[]', 'minecraft:stone[axis=y]', 'minecraft:water', 'minecraft:chest', 'mod:stone', '', null]) {
    const input = { ...airBox(), cells: [{ ...cell, blockState }] };
    rejected(input, /whitelist/);
    await assert.rejects(encodeJavaSchematic(input as JavaSchematicInput), error => error instanceof JavaSchematicError && error.code === 'invalid-input');
  }
});

test('unsupported payloads, geometry and fields are rejected at every admitted object level', () => {
  for (const field of ['entities', 'blockEntities', 'biomes', 'metadata', 'profile', 'rotation']) rejected({ ...airBox(), [field]: [] });
  rejected({ ...airBox(), cells: [{ x: 0, y: 0, z: 0, blockState: 'minecraft:stone', scale: 2 }] });
  rejected({ ...airBox(), bounds: { ...airBox().bounds, hidden: true } });
  rejected({ ...airBox(), anchor: { x: 0, y: 0, z: 0, w: 1 } });
  rejected({ ...airBox(), source: { ...fixture().source, revision: 1.5 } });
  rejected({ ...airBox(), source: { ...fixture().source, nativeQualification: 'passed' } });
  rejected({ ...airBox(), source: { documentId: '', revision: 0, historyEpoch: 'epoch' } });
  rejected({ ...airBox(), source: { ...fixture().source, revision: -1 } });
  rejected({ ...airBox(), source: { ...fixture().source, revision: Infinity } });
});

test('malformed objects, array holes, accessors and decorators do not become silent content loss', () => {
  for (const value of [null, {}, [], 'schematic']) rejected(value);
  rejected({ ...airBox(), cells: [undefined] });
  rejected({ ...airBox(), cells: new Array(1) });
  rejected({ ...airBox(), cells: Object.assign([], { extra: true }) });
  rejected({ ...airBox(), cells: Object.assign([], { [Symbol('extra')]: true }) });
  rejected({ ...airBox(), cells: new Array(100_001) }, /no larger/);
  rejected(Object.create(fixture()));
  let invoked = false;
  const input = { ...airBox() };
  Object.defineProperty(input, 'name', { get() { invoked = true; return 'name'; }, enumerable: true });
  rejected(input); assert.equal(invoked, false);
  const cells: unknown[] = [];
  Object.defineProperty(cells, '0', { get() { invoked = true; return {}; }, enumerable: true });
  rejected({ ...airBox(), cells }); assert.equal(invoked, false);
});

test('Unicode name uses Java modified UTF-8 with a literal emoji byte oracle', async () => {
  const { bytes } = await encodeJavaSchematic({ ...airBox(), name: 'Aé中\u{1F600}' });
  const { raw, schematic } = decode(bytes);
  assert.equal(schematic.Metadata.value.Name.value, 'Aé中\u{1F600}');
  // TAG_String Name: 12 encoded bytes; supplementary character encoded as two surrogate triples.
  assert.ok(raw.includes(Buffer.from('0800044e616d65000c41c3a9e4b8adeda0bdedb880', 'hex')));
  for (const name of ['', ' ', 'a\0b', 'line\nbreak', '\ud800', '\udc00', '\ud800x', 'x'.repeat(257)]) rejected({ ...airBox(), name });
});

test('encoder snapshots caller data before compression and never mutates input', async () => {
  const input = fixture();
  const before = structuredClone(input);
  await encodeJavaSchematic(input);
  assert.deepEqual(input, before);
  const pending = encodeJavaSchematic(input);
  (input.cells[0] as { blockState: string }).blockState = 'minecraft:water';
  (input.source as { revision: number }).revision = 99;
  (input.bounds.min as { x: number }).x = 123;
  const result = await pending;
  assert.equal(decode(result.bytes).ids[0], 1);
  assert.equal(result.report.source.revision, 7);
  assert.equal(result.report.bounds.min.x, -4);
});

test('pre-aborted and aborted compression requests reject without a successful result', async () => {
  const before = new AbortController();
  const reason = new DOMException('Stopped fixture', 'AbortError');
  before.abort(reason);
  await assert.rejects(encodeJavaSchematic(null as unknown as JavaSchematicInput, { signal: before.signal }), error => error === reason);
  const during = new AbortController();
  const pending = encodeJavaSchematic(airBox(50_000, 2), { signal: during.signal });
  during.abort(reason);
  await assert.rejects(pending, error => error === reason);
});

test('missing or failing platform compression rejects instead of returning mislabeled NBT', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream')!;
  try {
    Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value: undefined });
    await assert.rejects(encodeJavaSchematic(airBox()), error => error instanceof JavaSchematicError && error.code === 'unsupported-platform');
    Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value: class { constructor() { throw new Error('compressor failed'); } } });
    await assert.rejects(encodeJavaSchematic(airBox()), error => error instanceof JavaSchematicError && error.code === 'compression-failed');
  } finally { Object.defineProperty(globalThis, 'CompressionStream', descriptor); }
});

test('compression stream failures and excessive output do not return a partial schematic', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream')!;
  try {
    Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value: class extends TransformStream {
      constructor() { super({ transform(_chunk, controller) { controller.enqueue(Uint8Array.of(0x1f, 0x8b)); controller.error(new Error('mid-stream failure')); } }); }
    } });
    await assert.rejects(encodeJavaSchematic(airBox()), error => error instanceof JavaSchematicError && error.code === 'compression-failed');
    Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value: class extends TransformStream {
      constructor() { super({ transform(_chunk, controller) { controller.enqueue(new Uint8Array(JAVA_SCHEMATIC_PROFILE.limits.maxGzipBytes + 1)); } }); }
    } });
    await assert.rejects(encodeJavaSchematic(airBox()), error => error instanceof JavaSchematicError && error.code === 'compression-failed');
  } finally { Object.defineProperty(globalThis, 'CompressionStream', descriptor); }
});

test('independent oracle detects truncated gzip/NBT and invalid palette data; no native claim', async () => {
  const result = await encodeJavaSchematic(fixture());
  assert.throws(() => gunzipSync(result.bytes.slice(0, -4)));
  const { raw, blocks } = decode(result.bytes);
  assert.throws(() => readNbt(raw.subarray(0, -1)));
  assert.throws(() => readNbt(Buffer.concat([raw, Buffer.from([0])])));
  assert.throws(() => decodeIds(Uint8Array.of(128), blocks.Palette.value, 1));
  assert.throws(() => decodeIds(Uint8Array.of(4), blocks.Palette.value, 1));
  assert.throws(() => decodeIds(Uint8Array.of(0, 0), blocks.Palette.value, 1));
  assert.throws(() => decodeIds(Uint8Array.of(0), blocks.Palette.value, 2));
  assert.equal(result.report.profile.nativeQualification, 'not-run');
});
