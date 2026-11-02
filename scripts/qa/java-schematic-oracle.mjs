// Test-only independent reader of the fixed Sponge3 candidate. No production codec helpers.
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';

export function readCandidateSchematic(gzip) {
  const packed = Buffer.from(gzip); assert.deepEqual([...packed.subarray(0, 3)], [31, 139, 8]);
  assert.ok(packed.length <= 256 * 1024);
  const raw = gunzipSync(packed, { maxOutputLength: 128 * 1024 });
  let cursor = 0;
  const take = count => { assert.ok(Number.isInteger(count) && count >= 0 && cursor + count <= raw.length, 'Truncated NBT'); const at = cursor; cursor += count; return at; };
  const byte = () => raw[take(1)], short = () => raw.readInt16BE(take(2)), int = () => raw.readInt32BE(take(4));
  const string = () => {
    const length = raw.readUInt16BE(take(2)), end = cursor + length; assert.ok(end <= raw.length);
    let output = '';
    const continuation = () => { assert.ok(cursor < end); const b = byte(); assert.equal(b & 192, 128); return b & 63; };
    while (cursor < end) {
      const b = byte();
      if (b < 128) output += String.fromCharCode(b);
      else if ((b & 224) === 192) output += String.fromCharCode(((b & 31) << 6) | continuation());
      else { assert.equal(b & 240, 224, 'Expected Java modified UTF8'); output += String.fromCharCode(((b & 15) << 12) | (continuation() << 6) | continuation()); }
    }
    assert.equal(cursor, end); return output;
  };
  let nodes = 0;
  const payload = (type, depth = 0) => {
    assert.ok(++nodes < 200_000 && depth <= 16, 'NBT work limit');
    if (type === 2) return { type, value: short() };
    if (type === 3) return { type, value: int() };
    if (type === 7) { const size = int(); return { type, value: raw.subarray(take(size), cursor) }; }
    if (type === 8) return { type, value: string() };
    if (type === 9) { const elementType = byte(), length = int(); assert.ok(length >= 0 && length <= 100_000); return { type, elementType, value: Array.from({ length }, () => payload(elementType, depth + 1)) }; }
    if (type === 10) {
      const value = Object.create(null);
      while (true) { const next = byte(); if (!next) break; const key = string(); assert.equal(Object.hasOwn(value, key), false); value[key] = payload(next, depth + 1); }
      return { type, value };
    }
    if (type === 11) { const length = int(); assert.ok(length >= 0 && length <= 100_000); return { type, value: Array.from({ length }, int) }; }
    assert.fail(`Unsupported NBT type ${type}`);
  };
  assert.equal(byte(), 10); assert.equal(string(), ''); const root = payload(10).value;
  assert.equal(cursor, raw.length); assert.deepEqual(Object.keys(root), ['Schematic']); assert.equal(root.Schematic.type, 10);
  const schematic = root.Schematic.value;
  assert.deepEqual(Object.keys(schematic).sort(), ['Blocks', 'DataVersion', 'Height', 'Length', 'Metadata', 'Offset', 'Version', 'Width']);
  assert.equal(schematic.Version.type, 3); assert.equal(schematic.Version.value, 3);
  assert.equal(schematic.DataVersion.type, 3); assert.equal(schematic.DataVersion.value, 3955);
  const dimensions = ['Width', 'Height', 'Length'].map(name => { assert.equal(schematic[name].type, 2); const size = schematic[name].value & 65535; assert.ok(size > 0); return size; });
  const [width, height, length] = dimensions, volume = width * height * length; assert.ok(volume <= 100_000);
  assert.equal(schematic.Offset.type, 11); assert.equal(schematic.Offset.value.length, 3);
  const offset = schematic.Offset.value; assert.equal(schematic.Blocks.type, 10); const blocks = schematic.Blocks.value;
  assert.deepEqual(Object.keys(blocks).sort(), ['BlockEntities', 'Data', 'Palette']);
  assert.equal(blocks.BlockEntities.type, 9); assert.equal(blocks.BlockEntities.elementType, 10); assert.deepEqual(blocks.BlockEntities.value, []);
  assert.equal(blocks.Palette.type, 10); assert.equal(blocks.Data.type, 7);
  const states = new Map();
  for (const [state, tag] of Object.entries(blocks.Palette.value)) { assert.equal(tag.type, 3); assert.ok(['minecraft:air', 'minecraft:stone', 'minecraft:cobblestone', 'minecraft:oak_planks'].includes(state)); assert.equal(states.has(tag.value), false); states.set(tag.value, state); }
  assert.ok(states.size >= 1 && states.size <= 4, 'The file palette contains the used subset, not every admitted state');
  assert.deepEqual([...states.keys()].sort((a, b) => a - b), Array.from({ length: states.size }, (_, index) => index));
  const data = blocks.Data.value, cells = []; let at = 0;
  // Y/Z/X nesting is deliberately independent of the writer's index implementation.
  for (let y = 0; y < height; y++) for (let z = 0; z < length; z++) for (let x = 0; x < width; x++) {
    let id = 0, shift = 0, current;
    do { assert.ok(at < data.length && shift < 35, 'Truncated palette varint'); current = data[at++]; id += (current & 127) * 2 ** shift; shift += 7; } while (current & 128);
    assert.ok(states.has(id)); cells.push({ x: x + offset[0], y: y + offset[1], z: z + offset[2], blockState: states.get(id) });
  }
  assert.equal(at, data.length);
  assert.equal(schematic.Metadata.type, 10); assert.deepEqual(Object.keys(schematic.Metadata.value), ['Name']); assert.equal(schematic.Metadata.value.Name.type, 8);
  return { dimensions, offset, volume, cells, name: schematic.Metadata.value.Name.value, nbtBytes: raw.length, palette: Object.fromEntries(states) };
}
