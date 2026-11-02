import type { BlueprintPrefab, CustomBlockDefinition } from '../engine/types';
import { DEFAULT_CHUNK_CONFIG, DEFAULT_SMART_PATTERN_CONFIG } from '../engine/chunkAndPatternEngine';
import { sameBlueprintData } from '../engine/placementContent';
import { createStudioId, validateStudioDocument, type StudioDocument, type JsonValue } from './studioDocument';
import type { LegacyDocumentSource } from './studioDocumentStore';
import { parseStudioResourceJson } from './studioResourceImport';
import { readStudioKitZip, writeStudioKitZip, STUDIO_KIT_ZIP_LIMITS } from './studioKitZip';

export const STUDIO_KIT_LIMITS = Object.freeze({ definitions: 256, blueprints: 64, blocks: 10000, provenance: 32, textBytes: 65536, sourceEnvelopeBytes: 6 * 1024 * 1024 });
export type StudioKitLicense = 'MIT' | 'Unlicense' | 'CC0-1.0';
export interface StudioKitMetadata { id: string; name: string; description: string; author: string; license: StudioKitLicense; sourceUrl: string }
export interface StudioKitProvenance {
  archiveSha256: string; name: string; author: string; license: StudioKitLicense; sourceUrl: string;
  licenseText: string; notices: string; definitionIds: string[]; blueprintIds: string[];
}
export interface StudioKitResources {
  format: 'lfs-studio-kit-resources'; version: 1; definitions: CustomBlockDefinition[]; blueprints: BlueprintPrefab[]; provenance: StudioKitProvenance[];
}
export interface StudioKitManifest extends StudioKitMetadata {
  format: 'lfs-studio-kit'; version: 1; units: 'studio-studs-plates'; axes: 'x-right-y-up-z-forward';
  files: { path: string; bytes: number; sha256: string }[];
}
export interface StudioKit { manifest: StudioKitManifest; resources: StudioKitResources; licenseText: string; notices: string; archiveSha256: string; bytes: Uint8Array<ArrayBuffer> }
export interface StudioKitImportReport {
  sourceToken: string; name: string; author: string; license: StudioKitLicense; sourceUrl: string; archiveSha256: string; archiveBytes: number;
  addedDefinitions: string[]; retainedDefinitions: string[]; addedBlueprints: string[]; retainedBlueprints: string[]; addedProvenance: number; updatedProvenance: number;
  definitions: { id: string; name: string }[]; blueprints: { id: string; name: string; cells: number }[]; noop: boolean;
}
export interface StudioKitImportProposal { sourceToken: string; document: StudioDocument; archivalDocument: StudioDocument; legacySources: LegacyDocumentSource[]; report: StudioKitImportReport; kit: StudioKit }
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const resourcePaths = ['resources.json', 'LICENSE.txt', 'NOTICES.txt'];
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const extensionKey = 'lfsStudioKits';
const admitted = new WeakMap<StudioKit, Uint8Array<ArrayBuffer>>();
function freezeData<T>(value: T): T {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freezeData(item); Object.freeze(value); }
  return value;
}
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, keys: string[], label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
  const out: Record<string, any> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || unsafe.has(key) || !keys.includes(key)) fail(`${label} has an unsupported or unsafe field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} requires data fields.`);
    out[key] = descriptor.value;
  }
  for (const key of keys) if (!Object.hasOwn(out, key)) fail(`${label}.${key} is required.`);
  return out;
}
function text(value: unknown, label: string, max: number, min = 0): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || encoder.encode(value).length > max) fail(`${label} is missing, too large or contains unsupported control characters.`);
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail(`${label} contains malformed UTF-16; its Unicode text was not replaced.`); }
    else if (unit >= 0xdc00 && unit <= 0xdfff) fail(`${label} contains malformed UTF-16; its Unicode text was not replaced.`);
  }
  return value;
}
function list(value: unknown, label: string, max: number): any[] {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail(`${label} must be a dense, bounded data list.`);
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !d.enumerable || !('value' in d)) fail(`${label} must be a dense data list.`); }
  return value;
}
function identifier(value: unknown): string { if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(value) || unsafe.has(value)) fail('Kit contains an invalid identifier.'); return value; }
function ids(value: unknown, label: string, max: number): string[] { const result = list(value, label, max).map(identifier); if (new Set(result).size !== result.length) fail(`${label} contains duplicate identifiers.`); return result; }
function license(value: unknown): StudioKitLicense { if (!['MIT', 'Unlicense', 'CC0-1.0'].includes(value as string)) fail('Kit must declare MIT, Unlicense or CC0-1.0; absence of a license is not the Unlicense.'); return value as StudioKitLicense; }
function sourceUrl(value: unknown): string {
  const url = text(value, 'Source URL', 1000);
  if (url) { let parsed: URL; try { parsed = new URL(url); } catch { fail('Kit source URL must be an absolute HTTP(S) reference or empty.'); } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('Kit source URL must be an HTTP(S) reference without credentials.'); }
  return url;
}
function hashText(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Kit has an invalid SHA-256 value.'); return value; }
export async function studioKitSha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) fail('Kit integrity checks need a secure local browser context. Nothing was imported.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function metadata(value: unknown): StudioKitMetadata {
  const v = object(value, ['id', 'name', 'description', 'author', 'license', 'sourceUrl'], 'Kit metadata');
  return { id: identifier(v.id), name: text(v.name, 'Kit name', 120, 1), description: text(v.description, 'Kit description', 2000), author: text(v.author, 'Kit author', 256, 1), license: license(v.license), sourceUrl: sourceUrl(v.sourceUrl) };
}
function provenance(value: unknown): StudioKitProvenance[] {
  const entries = list(value, 'Kit provenance', STUDIO_KIT_LIMITS.provenance).map(item => {
    const v = object(item, ['archiveSha256', 'name', 'author', 'license', 'sourceUrl', 'licenseText', 'notices', 'definitionIds', 'blueprintIds'], 'Kit provenance record');
    return { archiveSha256: hashText(v.archiveSha256), name: text(v.name, 'Provenance name', 120, 1), author: text(v.author, 'Provenance author', 256, 1), license: license(v.license), sourceUrl: sourceUrl(v.sourceUrl), licenseText: text(v.licenseText, 'Original license text', STUDIO_KIT_LIMITS.textBytes, 1), notices: text(v.notices, 'Original notices', STUDIO_KIT_LIMITS.textBytes), definitionIds: ids(v.definitionIds, 'Provenance definitions', STUDIO_KIT_LIMITS.definitions), blueprintIds: ids(v.blueprintIds, 'Provenance blueprints', STUDIO_KIT_LIMITS.blueprints) };
  });
  if (new Set(entries.map(v => v.archiveSha256)).size !== entries.length) fail('Duplicate kit provenance records.');
  return entries;
}
function document(value: unknown): StudioDocument { const v = validateStudioDocument(value); if (!v.ok) fail(`Kit cannot enter this project: ${v.error.issues[0]?.path ?? '$'}: ${v.error.message}`); return v.value; }
function envelope(definitions: CustomBlockDefinition[], blueprints: BlueprintPrefab[]): StudioDocument {
  return document({ format: 'lfs-studio-project', schemaVersion: 1, documentId: 'kit-validation', revision: 0, historyEpoch: 'kit-validation', savedAt: '2026-11-01T00:00:00.000Z', world: { worldId: 'kit-validation', worldName: 'Kit recovery', roomCode: '', isPublicWorld: false }, blocks: {}, customBlocks: Object.fromEntries(definitions.map(d => [d.id, d])), blueprints, chunkConfig: DEFAULT_CHUNK_CONFIG, patternConfig: DEFAULT_SMART_PATTERN_CONFIG });
}
function resources(value: unknown): StudioKitResources {
  const v = object(value, ['format', 'version', 'definitions', 'blueprints', 'provenance'], 'Kit resources');
  if (v.format !== 'lfs-studio-kit-resources' || v.version !== 1) fail('Unsupported kit resource version. Keep the original for a compatible app.');
  const defs = list(v.definitions, 'Kit definitions', STUDIO_KIT_LIMITS.definitions);
  const blueprints = list(v.blueprints, 'Kit blueprints', STUDIO_KIT_LIMITS.blueprints);
  if (!defs.length && !blueprints.length) fail('Choose at least one block definition or blueprint for a kit.');
  const definitionIds = defs.map(d => identifier(Object.getOwnPropertyDescriptor(d ?? {}, 'id')?.value));
  if (new Set(definitionIds).size !== definitionIds.length) fail('Duplicate kit definition IDs.');
  let count = 0;
  for (const bp of blueprints) {
    const blocks = Object.getOwnPropertyDescriptor(bp ?? {}, 'blocks')?.value;
    count += list(blocks, 'Kit blueprint cells', STUDIO_KIT_LIMITS.blocks).length;
    if (count > STUDIO_KIT_LIMITS.blocks) fail('Kit blueprints exceed 10,000 total cells.');
  }
  const checked = envelope(defs, blueprints), registry = checked.customBlocks;
  for (const bp of checked.blueprints) {
    if (bp.isPublic) fail('Portable kit blueprints must be local/private copies.');
    for (const def of bp.customBlockDefs) if (!Object.hasOwn(registry, def.id) || !sameBlueprintData(registry[def.id], def)) fail(`Blueprint "${bp.name}" has a conflicting or unlisted definition "${def.id}".`);
    const anchors = new Set<string>();
    for (const block of bp.blocks) {
      if (!Object.hasOwn(registry, block.blockDefId)) fail(`Kit omits required definition "${block.blockDefId}". No current-project fallback is used.`);
      const key = `${Math.round(block.position.x)},${Math.round(block.position.y)},${Math.round(block.position.z)}`;
      if (anchors.has(key)) fail(`Blueprint "${bp.name}" contains conflicting placement anchors.`); anchors.add(key);
    }
  }
  const records = provenance(v.provenance), bpIds = new Set(checked.blueprints.map(b => b.id));
  for (const record of records) if (record.definitionIds.some(id => !Object.hasOwn(registry, id)) || record.blueprintIds.some(id => !bpIds.has(id))) fail('Kit provenance references a missing resource.');
  return { format: 'lfs-studio-kit-resources', version: 1, definitions: Object.values(registry), blueprints: checked.blueprints, provenance: records };
}
export function readStudioKitProjectProvenance(current: StudioDocument): StudioKitProvenance[] {
  if (!current.extensions || !Object.hasOwn(current.extensions, extensionKey)) return [];
  const value = object(current.extensions[extensionKey], ['version', 'records'], 'Project kit provenance');
  if (value.version !== 1) fail('This project has a future kit-provenance version. It was retained; import/export requires a compatible app.');
  return provenance(value.records);
}
function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
/** Exact ZIP in a versioned text envelope works with the existing original-source recovery store. */
export function studioKitSourceEnvelope(kit: StudioKit, filename: string): string {
  const bytes = studioKitOriginalBytes(kit);
  return JSON.stringify({ format: 'lfs-studio-kit-source', version: 1, filename: text(filename, 'Kit filename', 256, 1), encoding: 'base64', bytes: bytes.length, sha256: kit.archiveSha256, data: base64(bytes) });
}
export function studioKitOriginalBytes(kit: StudioKit): Uint8Array<ArrayBuffer> { const bytes = admitted.get(kit); if (!bytes) fail('This kit was not admitted by the archive reader.'); return new Uint8Array(bytes); }
export async function readStudioKitSource(input: Uint8Array, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (signal?.aborted) fail('Kit operation cancelled.');
  if (!(input instanceof Uint8Array) || input.length > STUDIO_KIT_LIMITS.sourceEnvelopeBytes) fail('Kit source input exceeds 6 MiB.');
  if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) return new Uint8Array(input);
  const raw = decoder.decode(input), v = object(parseStudioResourceJson(raw, '$', STUDIO_KIT_LIMITS.sourceEnvelopeBytes), ['format', 'version', 'filename', 'encoding', 'bytes', 'sha256', 'data'], 'Recovered kit source');
  if (v.format !== 'lfs-studio-kit-source' || v.version !== 1 || v.encoding !== 'base64' || !Number.isInteger(v.bytes) || v.bytes < 22 || v.bytes > STUDIO_KIT_ZIP_LIMITS.archiveBytes || typeof v.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.data)) fail('Recovered kit source is unsupported or malformed.');
  text(v.filename, 'Recovered filename', 256, 1); hashText(v.sha256);
  const bytes = Uint8Array.from(atob(v.data), c => c.charCodeAt(0));
  if (bytes.length !== v.bytes || await studioKitSha256(bytes) !== v.sha256 || base64(bytes) !== v.data) fail('Recovered kit bytes or SHA-256 do not match.');
  if (signal?.aborted) fail('Kit operation cancelled.');
  return bytes;
}
export async function readStudioKit(input: Uint8Array, signal?: AbortSignal): Promise<StudioKit> {
  const bytes = await readStudioKitSource(input, signal), files = await readStudioKitZip(bytes, signal);
  if (files.size !== 4 || !['manifest.json', ...resourcePaths].every(path => files.has(path))) fail('Kit v1 needs exactly manifest.json, resources.json, LICENSE.txt and NOTICES.txt. External assets and scripts are unsupported.');
  const v = object(parseStudioResourceJson(decoder.decode(files.get('manifest.json')!)), ['format', 'version', 'id', 'name', 'description', 'author', 'license', 'sourceUrl', 'units', 'axes', 'files'], 'Kit manifest');
  if (v.format !== 'lfs-studio-kit' || v.version !== 1) fail('Unsupported studio kit version. Keep the original for a compatible app.');
  if (v.units !== 'studio-studs-plates' || v.axes !== 'x-right-y-up-z-forward') fail('Kit uses unsupported units or axes; no geometry conversion was applied.');
  const meta = metadata(Object.fromEntries(['id', 'name', 'description', 'author', 'license', 'sourceUrl'].map(key => [key, v[key]])));
  const records = list(v.files, 'Kit file manifest', 3).map(item => {
    const f = object(item, ['path', 'bytes', 'sha256'], 'Kit file record');
    if (!resourcePaths.includes(f.path) || !Number.isInteger(f.bytes) || f.bytes < 0 || f.bytes > STUDIO_KIT_ZIP_LIMITS.entryBytes) fail('Kit manifest has an invalid file record.');
    return { path: f.path as string, bytes: f.bytes as number, sha256: hashText(f.sha256) };
  });
  if (records.length !== 3 || new Set(records.map(f => f.path)).size !== 3) fail('Kit manifest must list all three payload files exactly once.');
  for (const record of records) {
    const data = files.get(record.path)!;
    if (data.length !== record.bytes || await studioKitSha256(data) !== record.sha256) fail(`Kit manifest integrity failed for ${record.path}. Nothing was imported.`);
    if (signal?.aborted) fail('Kit operation cancelled.');
  }
  const licenseText = text(decoder.decode(files.get('LICENSE.txt')!), 'Kit license text', STUDIO_KIT_LIMITS.textBytes, 1);
  const notices = text(decoder.decode(files.get('NOTICES.txt')!), 'Kit notices', STUDIO_KIT_LIMITS.textBytes);
  const kit: StudioKit = { manifest: freezeData({ ...meta, format: 'lfs-studio-kit' as const, version: 1 as const, units: 'studio-studs-plates' as const, axes: 'x-right-y-up-z-forward' as const, files: records }), resources: freezeData(resources(parseStudioResourceJson(decoder.decode(files.get('resources.json')!)))), licenseText, notices, archiveSha256: await studioKitSha256(bytes), bytes: new Uint8Array(bytes) };
  admitted.set(kit, new Uint8Array(bytes)); Object.freeze(kit); return kit;
}
export async function writeStudioKit(meta: StudioKitMetadata, payload: StudioKitResources, licenseText: string, notices: string): Promise<Uint8Array<ArrayBuffer>> {
  const checkedMeta = metadata(meta), checked = resources(payload);
  const files = new Map<string, Uint8Array>([
    ['resources.json', encoder.encode(JSON.stringify(checked))], ['LICENSE.txt', encoder.encode(text(licenseText, 'Kit license text', STUDIO_KIT_LIMITS.textBytes, 1))], ['NOTICES.txt', encoder.encode(text(notices, 'Kit notices', STUDIO_KIT_LIMITS.textBytes))],
  ]);
  const records = [];
  for (const [path, data] of files) records.push({ path, bytes: data.length, sha256: await studioKitSha256(data) });
  files.set('manifest.json', encoder.encode(JSON.stringify({ ...checkedMeta, format: 'lfs-studio-kit', version: 1, units: 'studio-studs-plates', axes: 'x-right-y-up-z-forward', files: records })));
  return writeStudioKitZip(files);
}
export function prepareStudioKitImport(current: StudioDocument, sourceToken: string, kit: StudioKit, filename: string): StudioKitImportProposal {
  if (!admitted.has(kit)) fail('Read and verify the complete kit archive before preparing an import.');
  // Revalidate admitted structures at the proposal boundary; callers cannot smuggle a forged library through a report.
  const payload = resources(kit.resources), known = readStudioKitProjectProvenance(current);
  const definitions = { ...current.customBlocks }, blueprints = [...current.blueprints], byId = new Map(blueprints.map(bp => [bp.id, bp]));
  const addedDefinitions: string[] = [], retainedDefinitions: string[] = [], addedBlueprints: string[] = [], retainedBlueprints: string[] = [];
  for (const def of payload.definitions) {
    if (Object.hasOwn(definitions, def.id)) { if (!sameBlueprintData(definitions[def.id], def)) fail(`Block definition "${def.id}" conflicts with this project. No existing content was replaced.`); retainedDefinitions.push(def.id); }
    else { definitions[def.id] = def; addedDefinitions.push(def.id); }
  }
  for (const bp of payload.blueprints) {
    const old = byId.get(bp.id);
    if (old) { if (!sameBlueprintData(old, bp)) fail(`Blueprint "${bp.id}" conflicts with this project. No existing entry was replaced.`); retainedBlueprints.push(bp.id); }
    else { blueprints.push(bp); addedBlueprints.push(bp.id); }
  }
  const incoming: StudioKitProvenance[] = [...payload.provenance, { archiveSha256: kit.archiveSha256, name: kit.manifest.name, author: kit.manifest.author, license: kit.manifest.license, sourceUrl: kit.manifest.sourceUrl, licenseText: kit.licenseText, notices: kit.notices, definitionIds: payload.definitions.map(d => d.id), blueprintIds: payload.blueprints.map(b => b.id) }];
  const merged = new Map(known.map(v => [v.archiveSha256, v])); let addedProvenance = 0, updatedProvenance = 0;
  for (const record of provenance(incoming)) {
    const old = merged.get(record.archiveSha256);
    if (old) {
      const { definitionIds: oldDefs, blueprintIds: oldBps, ...oldMeta } = old;
      const { definitionIds: newDefs, blueprintIds: newBps, ...newMeta } = record;
      if (!sameBlueprintData(oldMeta, newMeta)) fail('A kit provenance identity conflicts with the existing record. Nothing was replaced.');
      const updated = { ...old, definitionIds: [...new Set([...oldDefs, ...newDefs])], blueprintIds: [...new Set([...oldBps, ...newBps])] };
      if (!sameBlueprintData(old, updated)) { merged.set(record.archiveSha256, updated); updatedProvenance++; }
    }
    else { merged.set(record.archiveSha256, record); addedProvenance++; }
  }
  if (merged.size > STUDIO_KIT_LIMITS.provenance) fail('This project already holds the maximum 32 kit provenance records. Keep a project backup and import into a separate project.');
  provenance([...merged.values()]);
  const next = document({ ...current, customBlocks: definitions, blueprints, extensions: { ...current.extensions, [extensionKey]: { version: 1, records: [...merged.values()] } as unknown as JsonValue } });
  const original = studioKitSourceEnvelope(kit, filename);
  const base = envelope(payload.definitions, payload.blueprints);
  const archivalDocument = document({ ...base, documentId: createStudioId('resource'), historyEpoch: createStudioId('history'), world: { ...base.world, worldId: createStudioId('world'), worldName: `${kit.manifest.name} recovery` }, extensions: { [extensionKey]: { version: 1, records: incoming } as unknown as JsonValue } });
  const report: StudioKitImportReport = { sourceToken, name: kit.manifest.name, author: kit.manifest.author, license: kit.manifest.license, sourceUrl: kit.manifest.sourceUrl, archiveSha256: kit.archiveSha256, archiveBytes: studioKitOriginalBytes(kit).length, addedDefinitions, retainedDefinitions, addedBlueprints, retainedBlueprints, addedProvenance, updatedProvenance, definitions: payload.definitions.map(d => ({ id: d.id, name: d.name })), blueprints: payload.blueprints.map(b => ({ id: b.id, name: b.name, cells: b.blocks.length })), noop: !addedDefinitions.length && !addedBlueprints.length && !addedProvenance && !updatedProvenance };
  return { sourceToken, document: next, archivalDocument, legacySources: [{ sourceId: `studio-kit:${kit.archiveSha256}:zip-base64-v1`, raw: original }], report, kit };
}
export function collectStudioKitResources(current: StudioDocument, definitionIds: string[], blueprintIds: string[]): StudioKitResources {
  document(current);
  const selectedDefs = new Set(ids(definitionIds, 'Selected definitions', STUDIO_KIT_LIMITS.definitions));
  const selectedBps = ids(blueprintIds, 'Selected blueprints', STUDIO_KIT_LIMITS.blueprints), blueprints: BlueprintPrefab[] = [];
  const closure = { ...current.customBlocks };
  const byId = new Map(current.blueprints.map(b => [b.id, b]));
  for (const id of selectedBps) {
    const bp = byId.get(id); if (!bp) fail('A selected blueprint no longer exists.');
    for (const def of bp.customBlockDefs) {
      if (Object.hasOwn(closure, def.id) && !sameBlueprintData(closure[def.id], def)) fail(`Blueprint "${bp.name}" needs a conflicting project definition. Resolve its IDs before packaging.`);
      closure[def.id] = def;
    }
    for (const b of bp.blocks) selectedDefs.add(b.blockDefId);
    for (const def of bp.customBlockDefs) selectedDefs.add(def.id);
    blueprints.push({ ...bp, isPublic: false });
  }
  const definitions = [...selectedDefs].map(id => closure[id] ?? fail('A required definition is missing.'));
  const bpSet = new Set(selectedBps);
  const records = readStudioKitProjectProvenance(current).map(record => ({ ...record, definitionIds: record.definitionIds.filter(id => selectedDefs.has(id)), blueprintIds: record.blueprintIds.filter(id => bpSet.has(id)) })).filter(record => record.definitionIds.length || record.blueprintIds.length);
  return resources({ format: 'lfs-studio-kit-resources', version: 1, definitions, blueprints, provenance: records });
}
