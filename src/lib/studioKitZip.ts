/** Small ZIP adapter for portable data kits. No extraction to a filesystem or URLs. */
export const STUDIO_KIT_ZIP_LIMITS = Object.freeze({ archiveBytes: 4 * 1024 * 1024, expandedBytes: 8 * 1024 * 1024, entryBytes: 4 * 1024 * 1024, entries: 8 });
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function studioKitCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new Error('Kit operation cancelled. Nothing was imported.'); }
function pathBytes(path: string): Uint8Array<ArrayBuffer> {
  if (typeof path !== 'string' || path.length > 120 || !/^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(path) || path.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Kit ZIP contains an unsafe or unsupported path.');
  }
  return textEncoder.encode(path);
}
function extras(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length;) {
    if (i + 4 > bytes.length) throw new Error('Kit ZIP extra fields are truncated.');
    const tag = view.getUint16(i, true), count = view.getUint16(i + 2, true);
    if ([1, 0x9901, 0x7075].includes(tag)) throw new Error('ZIP64, encrypted or alternative-path kit entries are unsupported.');
    i += 4 + count;
    if (i > bytes.length) throw new Error('Kit ZIP extra fields are truncated.');
  }
}
interface ZipEntry { name: string; method: number; flags: number; crc: number; size: number; compressed: number; local: number; start: number; end: number }

async function inflate(bytes: Uint8Array<ArrayBuffer>, expected: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  let stream: DecompressionStream;
  try { stream = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('This browser cannot open compressed kits. Use a browser with raw DEFLATE support, or an uncompressed studio kit ZIP.'); }
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = []; let count = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      checkAbort(signal);
      const item = await reader.read();
      checkAbort(signal);
      if (item.done) break;
      count += item.value.byteLength;
      if (count > expected || count > STUDIO_KIT_ZIP_LIMITS.entryBytes) throw new Error('Expanded kit entry exceeds its declared or allowed size.');
      parts.push(item.value);
    }
    if (count !== expected) throw new Error('Expanded kit entry size does not match its ZIP record.');
    const out = new Uint8Array(count); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** STORE and DEFLATE, optional data descriptors. Reject ambiguous records before inflation. */
export async function readStudioKitZip(input: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  checkAbort(signal);
  if (!(input instanceof Uint8Array) || input.byteLength < 22 || input.byteLength > STUDIO_KIT_ZIP_LIMITS.archiveBytes) throw new Error('Kit ZIP must be at most 4 MiB and contain a complete archive.');
  const bytes = new Uint8Array(input), view = new DataView(bytes.buffer);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0) throw new Error('Kit ZIP end record is missing or truncated.');
  const count = view.getUint16(end + 10, true), centralBytes = view.getUint32(end + 12, true), central = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count < 1 || count > STUDIO_KIT_ZIP_LIMITS.entries || central + centralBytes !== end) {
    throw new Error('Kit ZIP requires a single disk, 1–8 files and one complete central directory.');
  }
  let at = central, expanded = 0;
  const entries: ZipEntry[] = [], names = new Set<string>();
  for (let index = 0; index < count; index++) {
    checkAbort(signal);
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('Kit ZIP central directory is invalid.');
    const needed = view.getUint16(at + 6, true), flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true), compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const mode = view.getUint32(at + 38, true) >>> 16, local = view.getUint32(at + 42, true), next = at + 46 + nameLength + extraLength + commentLength;
    if (needed > 20 || (flags & ~0x080e) || (method !== 0 && method !== 8) || (method === 0 && (flags & 6)) || view.getUint16(at + 34, true) || (mode & 0xf000) && (mode & 0xf000) !== 0x8000 || next > end) {
      throw new Error('Kit ZIP uses unsupported compression, encryption, file types or record fields.');
    }
    const name = textDecoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)); pathBytes(name);
    if (names.has(name)) throw new Error('Kit ZIP contains duplicate file paths.'); names.add(name);
    extras(bytes.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength));
    expanded += size;
    if (size > STUDIO_KIT_ZIP_LIMITS.entryBytes || expanded > STUDIO_KIT_ZIP_LIMITS.expandedBytes || compressed > bytes.length || local + 30 > central || view.getUint32(local, true) !== 0x04034b50) throw new Error('Kit ZIP entries exceed bounds or have an invalid local header.');
    const localNameLength = view.getUint16(local + 26, true), localExtraLength = view.getUint16(local + 28, true), start = local + 30 + localNameLength + localExtraLength;
    if (start > central || view.getUint16(local + 4, true) !== needed || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || textDecoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name || start + compressed > central) throw new Error('Kit ZIP local and central records disagree.');
    extras(bytes.subarray(local + 30 + localNameLength, start));
    for (const [offset, expected] of [[14, crc], [18, compressed], [22, size]]) {
      const actual = view.getUint32(local + offset, true);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) throw new Error('Kit ZIP local checksum or sizes disagree.');
    }
    let stop = start + compressed;
    if (flags & 8) {
      if (stop + 12 > central) throw new Error('Kit ZIP data descriptor is missing.');
      if (view.getUint32(stop, true) === 0x08074b50) stop += 4;
      if (stop + 12 > central || view.getUint32(stop, true) !== crc || view.getUint32(stop + 4, true) !== compressed || view.getUint32(stop + 8, true) !== size) throw new Error('Kit ZIP data descriptor disagrees.');
      stop += 12;
    }
    if (method === 0 && compressed !== size) throw new Error('Stored kit entries have inconsistent sizes.');
    entries.push({ name, method, flags, crc, size, compressed, local, start, end: stop }); at = next;
  }
  if (at !== end) throw new Error('Kit ZIP has extra central directory data.');
  const ordered = [...entries].sort((a, b) => a.local - b.local); let boundary = 0;
  for (const entry of ordered) { if (entry.local !== boundary) throw new Error('Kit ZIP has overlapping, hidden or prefixed local records.'); boundary = entry.end; }
  if (boundary !== central) throw new Error('Kit ZIP local records do not end at the central directory.');
  const out = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const entry of entries) {
    checkAbort(signal);
    const compressed = bytes.slice(entry.start, entry.start + entry.compressed);
    const data = entry.method === 0 ? compressed : await inflate(compressed, entry.size, signal);
    checkAbort(signal);
    if (studioKitCrc32(data) !== entry.crc) throw new Error(`Kit ZIP checksum failed for ${entry.name}. Nothing was imported.`);
    out.set(entry.name, data);
  }
  return out;
}

/** Ordinary uncompressed ZIP output, readable by standard ZIP tools; deterministic headers. */
export function writeStudioKitZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  if (!(files instanceof Map) || files.size < 1 || files.size > STUDIO_KIT_ZIP_LIMITS.entries) throw new Error('A kit ZIP needs 1–8 files.');
  const rows = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, input]) => {
    if (!(input instanceof Uint8Array) || input.byteLength > STUDIO_KIT_ZIP_LIMITS.entryBytes) throw new Error('Kit entry exceeds 4 MiB.');
    return { name: pathBytes(name), data: input, crc: studioKitCrc32(input) };
  });
  const expanded = rows.reduce((sum, r) => sum + r.data.length, 0);
  const size = rows.reduce((sum, r) => sum + 76 + r.name.length * 2 + r.data.length, 22);
  if (expanded > STUDIO_KIT_ZIP_LIMITS.expandedBytes || size > STUDIO_KIT_ZIP_LIMITS.archiveBytes) throw new Error('The complete kit exceeds 4 MiB; choose fewer resources. Nothing was truncated.');
  const out = new Uint8Array(size), view = new DataView(out.buffer); let at = 0;
  const offsets: number[] = [];
  for (const row of rows) {
    offsets.push(at); view.setUint32(at, 0x04034b50, true); view.setUint16(at + 4, 20, true); view.setUint16(at + 6, 0x0800, true); view.setUint16(at + 12, 33, true);
    view.setUint32(at + 14, row.crc, true); view.setUint32(at + 18, row.data.length, true); view.setUint32(at + 22, row.data.length, true); view.setUint16(at + 26, row.name.length, true);
    out.set(row.name, at + 30); out.set(row.data, at + 30 + row.name.length); at += 30 + row.name.length + row.data.length;
  }
  const central = at;
  rows.forEach((row, index) => {
    view.setUint32(at, 0x02014b50, true); view.setUint16(at + 4, 20, true); view.setUint16(at + 6, 20, true); view.setUint16(at + 8, 0x0800, true); view.setUint16(at + 14, 33, true);
    view.setUint32(at + 16, row.crc, true); view.setUint32(at + 20, row.data.length, true); view.setUint32(at + 24, row.data.length, true); view.setUint16(at + 28, row.name.length, true); view.setUint32(at + 42, offsets[index], true);
    out.set(row.name, at + 46); at += 46 + row.name.length;
  });
  view.setUint32(at, 0x06054b50, true); view.setUint16(at + 8, rows.length, true); view.setUint16(at + 10, rows.length, true); view.setUint32(at + 12, at - central, true); view.setUint32(at + 16, central, true);
  return out;
}
