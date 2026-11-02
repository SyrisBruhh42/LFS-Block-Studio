import type { CustomBlockDefinition, PlacedBlock } from './types';

/** Budgets for the existing draft exporters, not a game compatibility profile. */
export const LEGACY_EXPORT_LIMITS = Object.freeze({ blocks: 100_000, volume: 100_000, coordinate: 1_000_000, bytes: 16 * 1024 * 1024 });

function plain(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Export requires plain project data.');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Export cannot read unsafe project properties.');
  }
}

/** Check before coordinate spreads, dense allocation, mapping or text generation. */
export function preflightLegacyExport(blocks: Record<string, PlacedBlock>, options: { integerGrid?: boolean; dense?: boolean; definitions?: Record<string, CustomBlockDefinition> } = {}) {
  plain(blocks);
  const keys = Object.keys(blocks);
  if (keys.length > LEGACY_EXPORT_LIMITS.blocks) throw new Error(`Draft export supports at most ${LEGACY_EXPORT_LIMITS.blocks.toLocaleString()} placed blocks.`);
  if (options.definitions) plain(options.definitions);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const occupied = new Set<string>();
  for (const key of keys) {
    const block = blocks[key]; plain(block); plain(block.position);
    if (typeof block.blockDefId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(block.blockDefId) || ['__proto__', 'constructor', 'prototype'].includes(block.blockDefId)) throw new Error('A placed block has an invalid definition ID.');
    if (![0, 90, 180, 270].includes(block.rotation)) throw new Error('A placed block has an unsupported rotation.');
    if (options.definitions && !Object.hasOwn(options.definitions, block.blockDefId)) throw new Error(`Missing definition for ${block.blockDefId}. Preserve a project backup and repair the reference first.`);
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = block.position[axis];
      if (!Number.isFinite(value) || Math.abs(value) > LEGACY_EXPORT_LIMITS.coordinate || (options.integerGrid && !Number.isSafeInteger(value))) throw new Error(options.integerGrid ? 'Minecraft draft export requires bounded whole-cell coordinates. No rounding was applied.' : 'Export coordinates are invalid or exceed the supported bounds.');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    const coordinate = `${block.position.x},${block.position.y},${block.position.z}`;
    if (occupied.has(coordinate)) throw new Error('Multiple placed blocks occupy the same anchor; export would lose data.');
    occupied.add(coordinate);
  }
  if (!keys.length) { min.x = min.y = min.z = 0; max.x = max.y = max.z = 0; }
  const width = max.x - min.x + 1, height = max.y - min.y + 1, length = max.z - min.z + 1;
  const volume = width * height * length;
  if (options.dense && (!Number.isSafeInteger(volume) || volume > LEGACY_EXPORT_LIMITS.volume)) throw new Error(`The bounding box exceeds safe memory allocation threshold (${LEGACY_EXPORT_LIMITS.volume.toLocaleString()} cells). Reduce its size or use a project backup.`);
  return { placedList: keys.map(key => blocks[key]), min, max, width, height, length, volume };
}

export function boundLegacyExportText(value: string): string {
  if (new TextEncoder().encode(value).byteLength > LEGACY_EXPORT_LIMITS.bytes) throw new Error('The draft export exceeds the text budget. Preserve the complete project backup.');
  return value;
}

/** Names in text formats are comments, never additional generated commands. */
export function exportCommentName(name: string): string {
  if (typeof name !== 'string' || name.length > 512) throw new Error('The export name is invalid.');
  return name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
}
