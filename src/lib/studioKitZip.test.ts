import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readStudioKitZip, writeStudioKitZip, studioKitCrc32 } from './studioKitZip';
const fixtures = JSON.parse(readFileSync(new URL('../../scripts/qa/fixtures/kit-zip-interop.json', import.meta.url), 'utf8')).fixtures as { method: number; descriptor: boolean; base64: string }[];
const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const basic = () => writeStudioKitZip(new Map([['a.txt', encode('first data')], ['b.txt', encode('second data')]]));
function central(bytes: Uint8Array) { const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), rows = []; let at = v.getUint32(bytes.length - 6, true); for (let i = 0; i < v.getUint16(bytes.length - 12, true); i++) { rows.push({ at, local: v.getUint32(at + 42, true) }); at += 46 + v.getUint16(at + 28, true) + v.getUint16(at + 30, true) + v.getUint16(at + 32, true); } return rows; }
for (const fixture of fixtures) test(`independent Python ZIP fixture: ${fixture.method === 8 ? 'DEFLATE' : 'STORE'}, descriptor=${fixture.descriptor}`, async () => {
  const files = await readStudioKitZip(Uint8Array.from(Buffer.from(fixture.base64, 'base64')));
  assert.equal(decode(files.get('manifest.json')!), '{"fixture":"python-zipfile"}'); assert.equal(decode(files.get('folder/data.txt')!), 'courtyard '.repeat(100));
});
test('writer produces complete STORE files with known CRC-32 and returns detached reader bytes', async () => {
  assert.equal(studioKitCrc32(encode('123456789')), 0xcbf43926);
  const bytes = basic(), files = await readStudioKitZip(bytes); bytes.fill(0); assert.equal(decode(files.get('b.txt')!), 'second data');
});
test('writer rejects unsafe paths, empty/oversized archives and excess entries instead of truncating', () => {
  for (const name of ['../bad', '/absolute', 'folder\\bad', 'a//b', '.hidden', 'a/..', 'http://host', 'x\u0000y']) assert.throws(() => writeStudioKitZip(new Map([[name, encode('x')]])), /path/);
  assert.throws(() => writeStudioKitZip(new Map()), /1–8/); assert.throws(() => writeStudioKitZip(new Map(Array.from({ length: 9 }, (_, i) => [`file${i}`, encode('x')]))), /1–8/);
  assert.throws(() => writeStudioKitZip(new Map([['x', new Uint8Array(4 * 1048576)]])), /complete kit exceeds/);
});
test('bad payload checksum, truncated end and trailing bytes cannot be read', async () => {
  const bytes = basic(); bytes[35] ^= 1; await assert.rejects(readStudioKitZip(bytes), /checksum/);
  await assert.rejects(readStudioKitZip(basic().slice(0, -1)), /end record/); await assert.rejects(readStudioKitZip(Uint8Array.from([...basic(), 0])), /end record/);
});
test('local and central path disagreement and duplicate paths reject before extraction', async () => {
  let bytes = basic(); bytes[30] = 120; await assert.rejects(readStudioKitZip(bytes), /disagree/);
  bytes = basic(); const [first, second] = central(bytes); bytes[second.local + 30] = bytes[first.local + 30]; bytes[second.at + 46] = bytes[first.at + 46]; await assert.rejects(readStudioKitZip(bytes), /duplicate/);
});
test('encrypted, symbolic-link and ZIP64 records reject', async () => {
  for (const mode of ['encrypted', 'symlink', 'zip64']) {
    const bytes = basic(), v = new DataView(bytes.buffer), [row] = central(bytes);
    if (mode === 'encrypted') { v.setUint16(row.at + 8, 1, true); v.setUint16(row.local + 6, 1, true); }
    if (mode === 'symlink') v.setUint32(row.at + 38, (0xa1ff << 16) >>> 0, true);
    if (mode === 'zip64') { v.setUint16(row.at + 6, 45, true); v.setUint16(row.local + 4, 45, true); }
    await assert.rejects(readStudioKitZip(bytes), /unsupported/);
  }
});
test('reader refuses prefixed local records, central gaps, bad disk and excess entry counts', async () => {
  const old = basic(), bytes = Uint8Array.from([0, 0, 0, 0, ...old]), view = new DataView(bytes.buffer);
  const end = bytes.length - 22, oldCentral = view.getUint32(end + 16, true); view.setUint32(end + 16, oldCentral + 4, true);
  let at = oldCentral + 4; for (let i = 0; i < 2; i++) { view.setUint32(at + 42, view.getUint32(at + 42, true) + 4, true); at += 46 + view.getUint16(at + 28, true); }
  await assert.rejects(readStudioKitZip(bytes), /prefixed/);
  for (const field of [4, 8, 10, 12]) { const data = basic(), v = new DataView(data.buffer), stop = data.length - 22; if (field === 12) v.setUint32(stop + field, 1, true); else v.setUint16(stop + field, 9, true); await assert.rejects(readStudioKitZip(data)); }
});
test('a forged small DEFLATE expansion size is stopped and descriptor corruption rejects', async () => {
  let bytes = Uint8Array.from(Buffer.from(fixtures.find(f => f.method === 8 && !f.descriptor)!.base64, 'base64')); let view = new DataView(bytes.buffer); let row = central(bytes)[1]; view.setUint32(row.at + 24, 1, true); view.setUint32(row.local + 22, 1, true);
  await assert.rejects(readStudioKitZip(bytes), /exceeds its declared/);
  bytes = Uint8Array.from(Buffer.from(fixtures.find(f => f.method === 8 && f.descriptor)!.base64, 'base64')); view = new DataView(bytes.buffer); row = central(bytes)[0]; const start = row.local + 30 + view.getUint16(row.local + 26, true), descriptor = start + view.getUint32(row.at + 20, true); bytes[descriptor + 4] ^= 1; await assert.rejects(readStudioKitZip(bytes), /descriptor disagrees/);
});
test('declared per-entry and aggregate expansion budgets reject before inflation', async () => {
  let bytes = basic(), view = new DataView(bytes.buffer), row = central(bytes)[0]; view.setUint32(row.at + 24, 4 * 1048576 + 1, true); await assert.rejects(readStudioKitZip(bytes), /exceed bounds/);
  bytes = writeStudioKitZip(new Map([['a', encode('x')], ['b', encode('y')], ['c', encode('z')]])); view = new DataView(bytes.buffer);
  for (const r of central(bytes)) { view.setUint16(r.at + 10, 8, true); view.setUint16(r.local + 8, 8, true); view.setUint32(r.at + 24, 4 * 1048576, true); view.setUint32(r.local + 22, 4 * 1048576, true); }
  await assert.rejects(readStudioKitZip(bytes), /exceed bounds/);
});
test('cancellation before or during native decompression rejects without returning partial files', async () => {
  const first = new AbortController(); first.abort(); await assert.rejects(readStudioKitZip(basic(), first.signal), /cancelled/);
  const controller = new AbortController(), pending = readStudioKitZip(Uint8Array.from(Buffer.from(fixtures.find(f => f.method === 8)!.base64, 'base64')), controller.signal); controller.abort(); await assert.rejects(pending, /cancelled/);
});
