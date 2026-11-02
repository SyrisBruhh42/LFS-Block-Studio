import { JAVA_SCHEMATIC_PROFILE, type CandidateJavaBlockState } from './javaProfile';

export interface JavaCellPosition { readonly x: number; readonly y: number; readonly z: number }
export interface JavaSchematicCell extends JavaCellPosition { readonly blockState: CandidateJavaBlockState }
export interface JavaSchematicInput {
  /** Sparse map entries, not editor anchors. Duplicate positions are errors. */
  readonly cells: readonly JavaSchematicCell[];
  readonly bounds: { readonly min: JavaCellPosition; readonly max: JavaCellPosition };
  readonly anchor: JavaCellPosition;
  readonly name: string;
  /** Caller identity, not proof that its document was validated or remained current. */
  readonly source: { readonly documentId: string; readonly revision: number; readonly historyEpoch: string };
}
export interface JavaSchematicReport {
  readonly encoder: 'lfs-sponge3-static-cubes-v1';
  readonly profile: typeof JAVA_SCHEMATIC_PROFILE;
  readonly source: JavaSchematicInput['source'];
  readonly sourceIdentityKind: 'caller-supplied';
  readonly name: string;
  readonly bounds: JavaSchematicInput['bounds'];
  readonly anchor: JavaCellPosition;
  readonly offset: JavaCellPosition;
  readonly dimensions: { readonly width: number; readonly height: number; readonly length: number };
  readonly volume: number;
  readonly providedCells: number;
  readonly nonAirCells: number;
  readonly explicitAirCells: number;
  readonly implicitAirCells: number;
  /** Every absent position inside the selected bounds is deliberately exported as air. */
  readonly airPolicy: 'fill-missing-with-air';
  readonly palette: readonly { readonly blockState: CandidateJavaBlockState; readonly id: number; readonly cells: number }[];
  readonly nbtByteLength: number;
}
export type JavaSchematicErrorCode = 'invalid-input' | 'unsupported-platform' | 'compression-failed';
export class JavaSchematicError extends Error {
  constructor(readonly code: JavaSchematicErrorCode, readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'JavaSchematicError';
  }
}
export type JavaSchematicValidation = { readonly ok: true; readonly report: JavaSchematicReport } | {
  readonly ok: false; readonly error: { readonly code: JavaSchematicErrorCode; readonly path: string; readonly message: string };
};

const PROFILE = JAVA_SCHEMATIC_PROFILE;
const AXES = ['x', 'y', 'z'] as const;
const AIR = 'minecraft:air';
const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;
const ENCODER = 'lfs-sponge3-static-cubes-v1';

function invalid(path: string, message: string): never { throw new JavaSchematicError('invalid-input', path, message); }
function checkAbort(signal?: AbortSignal): void { signal?.throwIfAborted(); }

/** Reject unsupported fields and getters rather than silently discard their content. */
function record(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(path, 'Expected a plain object.');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) invalid(path, 'Missing or unsupported fields.');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || !fields.includes(key)) invalid(path, 'Unsupported field.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) invalid(`${path}.${key}`, 'Expected an enumerable data field.');
    result[key] = descriptor.value;
  }
  return result;
}
function integer(value: unknown, path: string, min = INT_MIN, max = INT_MAX): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(path, `Expected an integer from ${min} through ${max}.`);
  }
  return value === 0 ? 0 : value; // Normalize negative zero in the report.
}
function position(value: unknown, path: string): JavaCellPosition {
  const p = record(value, path, AXES);
  return { x: integer(p.x, `${path}.x`), y: integer(p.y, `${path}.y`), z: integer(p.z, `${path}.z`) };
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    invalid(path, 'Expected an identifier of 1–200 ASCII letters, digits, dots, underscores, colons or hyphens.');
  }
  return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || !value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    invalid('$.name', 'Expected a nonblank name of at most 256 UTF-16 code units without control characters.');
  }
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid('$.name', 'Unpaired Unicode surrogate.');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid('$.name', 'Unpaired Unicode surrogate.');
  }
  return value;
}

interface Prepared { report: JavaSchematicReport; cells: Map<number, CandidateJavaBlockState> }
function prepare(input: unknown, signal?: AbortSignal): Prepared {
  checkAbort(signal);
  const root = record(input, '$', ['cells', 'bounds', 'anchor', 'name', 'source']);
  const selected = record(root.bounds, '$.bounds', ['min', 'max']);
  const min = position(selected.min, '$.bounds.min');
  const max = position(selected.max, '$.bounds.max');
  const anchor = position(root.anchor, '$.anchor');
  const offset = { x: 0, y: 0, z: 0 };
  const sizes: number[] = [];
  let volume = 1;
  for (const axis of AXES) {
    const size = max[axis] - min[axis] + 1;
    if (size < 1 || size > PROFILE.limits.maxDimension) invalid('$.bounds', 'Bounds must be ordered and each inclusive dimension must be 1–65535.');
    if (size > Math.floor(PROFILE.limits.maxVolume / volume)) invalid('$.bounds', 'Selected dense volume exceeds the 100000-cell work budget.');
    volume *= size;
    sizes.push(size);
    offset[axis] = integer(min[axis] - anchor[axis], `$.offset.${axis}`);
    // With omitted WorldEdit origin metadata, the clipboard spans Offset through
    // Offset + dimension - 1. Its far edge must not wrap an importer's Int32 cells.
    integer(max[axis] - anchor[axis], `$.relativeMaximum.${axis}`);
  }
  const [width, height, length] = sizes;
  const source = record(root.source, '$.source', ['documentId', 'revision', 'historyEpoch']);
  const sourceIdentity = {
    documentId: identifier(source.documentId, '$.source.documentId'),
    revision: integer(source.revision, '$.source.revision', 0, Number.MAX_SAFE_INTEGER),
    historyEpoch: identifier(source.historyEpoch, '$.source.historyEpoch'),
  };
  const exportName = name(root.name);
  if (!Array.isArray(root.cells) || root.cells.length > volume) invalid('$.cells', 'Expected a cell entry array no larger than the selected volume.');
  const entries = root.cells;
  // Bound length first, then check holes, decorators, symbols and accessors without invoking them.
  const keys = Reflect.ownKeys(entries);
  if (keys.length !== entries.length + 1 || keys.some(key => key !== 'length'
    && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= entries.length))) {
    invalid('$.cells', 'Sparse or decorated cell arrays are unsupported.');
  }
  const cells = new Map<number, CandidateJavaBlockState>();
  const counts = new Map<CandidateJavaBlockState, number>();
  let explicitAirCells = 0;
  for (let i = 0; i < entries.length; i++) {
    if (i % 1024 === 0) checkAbort(signal);
    const descriptor = Object.getOwnPropertyDescriptor(entries, String(i))!;
    if (!descriptor.enumerable || !('value' in descriptor)) invalid(`$.cells[${i}]`, 'Expected a cell data entry.');
    const cell = record(descriptor.value, `$.cells[${i}]`, ['x', 'y', 'z', 'blockState']);
    const x = integer(cell.x, `$.cells[${i}].x`), y = integer(cell.y, `$.cells[${i}].y`), z = integer(cell.z, `$.cells[${i}].z`);
    if (x < min.x || x > max.x || y < min.y || y > max.y || z < min.z || z > max.z) invalid(`$.cells[${i}]`, 'Cell lies outside the selected bounds.');
    if (!PROFILE.blockStates.includes(cell.blockState as CandidateJavaBlockState)) invalid(`$.cells[${i}].blockState`, 'Blockstate is not in the candidate whitelist. No substitution is allowed.');
    const state = cell.blockState as CandidateJavaBlockState;
    const index = x - min.x + (z - min.z) * width + (y - min.y) * width * length;
    if (cells.has(index)) invalid(`$.cells[${i}]`, 'Duplicate cell coordinates.');
    cells.set(index, state);
    counts.set(state, (counts.get(state) ?? 0) + 1);
    if (state === AIR) explicitAirCells++;
  }
  const implicitAirCells = volume - cells.size;
  counts.set(AIR, explicitAirCells + implicitAirCells);
  const palette = PROFILE.blockStates.filter(state => state === AIR || counts.has(state))
    .map((blockState, id) => ({ blockState, id, cells: counts.get(blockState) ?? 0 }));
  const report: JavaSchematicReport = {
    encoder: ENCODER, profile: PROFILE, source: sourceIdentity, sourceIdentityKind: 'caller-supplied',
    name: exportName, bounds: { min, max }, anchor, offset, dimensions: { width, height, length }, volume,
    providedCells: cells.size, nonAirCells: cells.size - explicitAirCells, explicitAirCells, implicitAirCells,
    airPolicy: 'fill-missing-with-air', palette, nbtByteLength: 0,
  };
  const measured = new NbtWriter();
  writeSchematic(measured, { report, cells }, signal);
  if (measured.offset > PROFILE.limits.maxNbtBytes) invalid('$', 'Encoded NBT exceeds the byte work budget.');
  checkAbort(signal);
  return { report: { ...report, nbtByteLength: measured.offset }, cells };
}

/** Local structure validation only. Does not enable a profile or establish native compatibility. */
export function validateJavaSchematicInput(input: unknown): JavaSchematicValidation {
  try { return { ok: true, report: prepare(input).report }; }
  catch (error) {
    if (!(error instanceof JavaSchematicError)) throw error;
    return { ok: false, error: { code: error.code, path: error.path, message: error.message } };
  }
}

/** Original, minimal NBT writer from the public format contract; no importer implementation is reused. */
class NbtWriter {
  offset = 0;
  private readonly view?: DataView;
  constructor(private readonly bytes?: Uint8Array<ArrayBuffer>) { if (bytes) this.view = new DataView(bytes.buffer); }
  byte(value: number): void { this.view?.setUint8(this.offset, value); this.offset++; }
  short(value: number): void { this.view?.setUint16(this.offset, value, false); this.offset += 2; }
  int(value: number): void { this.view?.setInt32(this.offset, value, false); this.offset += 4; }
  // Java DataOutput.writeUTF: unsigned byte length followed by modified UTF-8 code units.
  // https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/DataOutput.html#writeUTF(java.lang.String)
  string(value: string): void {
    let size = 0;
    for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); size += c > 0 && c < 128 ? 1 : c < 2048 ? 2 : 3; }
    if (size > 65_535) invalid('$', 'NBT string exceeds its encoded byte limit.');
    this.short(size);
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c > 0 && c < 128) this.byte(c);
      else if (c < 2048) { this.byte(0xc0 | c >> 6); this.byte(0x80 | c & 0x3f); }
      else { this.byte(0xe0 | c >> 12); this.byte(0x80 | c >> 6 & 0x3f); this.byte(0x80 | c & 0x3f); }
    }
  }
  tag(type: number, name: string): void { this.byte(type); this.string(name); }
  blockData(volume: number, cells: Map<number, CandidateJavaBlockState>, palette: JavaSchematicReport['palette'], signal?: AbortSignal): void {
    // This deliberately supports only the four-state profile: IDs 0..3 are single-byte varints.
    // Expanding the profile beyond 128 entries requires a separately tested multibyte encoder.
    if (palette.length > 128) invalid('$', 'Profile exceeds the supported one-byte palette.');
    this.tag(7, 'Data'); this.int(volume);
    if (!this.bytes) { this.offset += volume; return; }
    const ids = new Map(palette.map(item => [item.blockState, item.id]));
    // The pre-zeroed array encodes all implicit air as palette ID zero.
    const start = this.offset;
    for (const [index, state] of cells) { checkAbort(signal); this.bytes[start + index] = ids.get(state)!; }
    this.offset += volume;
  }
}
function writeSchematic(writer: NbtWriter, prepared: Prepared, signal?: AbortSignal): void {
  const r = prepared.report;
  writer.tag(10, ''); writer.tag(10, 'Schematic');
  writer.tag(3, 'Version'); writer.int(PROFILE.schematicVersion);
  writer.tag(3, 'DataVersion'); writer.int(PROFILE.dataVersion);
  writer.tag(2, 'Width'); writer.short(r.dimensions.width);
  writer.tag(2, 'Height'); writer.short(r.dimensions.height);
  writer.tag(2, 'Length'); writer.short(r.dimensions.length);
  writer.tag(11, 'Offset'); writer.int(3); for (const axis of AXES) writer.int(r.offset[axis]);
  writer.tag(10, 'Metadata'); writer.tag(8, 'Name'); writer.string(r.name); writer.byte(0);
  writer.tag(10, 'Blocks'); writer.tag(10, 'Palette');
  for (const item of r.palette) { writer.tag(3, item.blockState); writer.int(item.id); }
  writer.byte(0);
  writer.blockData(r.volume, prepared.cells, r.palette, signal);
  writer.tag(9, 'BlockEntities'); writer.byte(10); writer.int(0);
  writer.byte(0); writer.byte(0); writer.byte(0); // Blocks, Schematic, unnamed root.
}

async function gzip(bytes: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  checkAbort(signal);
  if (typeof CompressionStream === 'undefined') throw new JavaSchematicError('unsupported-platform', '$', 'This platform does not provide gzip CompressionStream.');
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'), { signal });
    reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      checkAbort(signal);
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > PROFILE.limits.maxGzipBytes) throw new JavaSchematicError('compression-failed', '$', 'Compressed output exceeds the byte work budget.');
      chunks.push(next.value);
    }
    checkAbort(signal);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    checkAbort(signal);
    if (error instanceof JavaSchematicError) throw error;
    throw new JavaSchematicError('compression-failed', '$', 'Gzip compression failed; no schematic was produced.');
  } finally { reader?.releaseLock(); }
}

/**
 * Encodes only canonical cells. Missing cells inside explicit bounds become air; invalid states
 * never do. All-air selections are allowed. No geometry conversion, UI download or native claim.
 * Work is bounded, but synchronous validation/encoding is not a worker or a responsiveness claim.
 */
export async function encodeJavaSchematic(input: JavaSchematicInput, options: { readonly signal?: AbortSignal } = {}): Promise<{ bytes: Uint8Array<ArrayBuffer>; report: JavaSchematicReport }> {
  const signal = options.signal;
  checkAbort(signal);
  const prepared = prepare(input, signal); // Copies caller values before the first asynchronous step.
  checkAbort(signal);
  const nbt = new Uint8Array(prepared.report.nbtByteLength);
  const writer = new NbtWriter(nbt);
  writeSchematic(writer, prepared, signal);
  if (writer.offset !== nbt.byteLength) throw new JavaSchematicError('compression-failed', '$', 'NBT byte count mismatch.');
  checkAbort(signal);
  const bytes = await gzip(nbt, signal);
  checkAbort(signal);
  return { bytes, report: prepared.report };
}
