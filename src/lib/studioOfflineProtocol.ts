/** Static application-copy metadata. This is never project, policy or write authority. */
export const STUDIO_OFFLINE_APP = 'lfs-block-studio';
export const STUDIO_OFFLINE_LIMITS = Object.freeze({ files: 256, fileBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 });
export interface StudioOfflineEntry { path: string; bytes: number; sha256: string }
export interface StudioOfflineManifest {
  format: 'lfs-studio-offline'; version: 1; appId: typeof STUDIO_OFFLINE_APP; dataProtocol: 1; scope: '/'; entryPoint: 'index.html';
  entries: StudioOfflineEntry[]; buildId: string;
}
export interface StudioOfflineInfo {
  format: 'lfs-studio-offline-status'; version: 1; manifest: StudioOfflineManifest; ready: boolean; verifiedAt: string;
  missing: string[]; invalid: string[]; totalBytes: number;
}
const safeHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fields(value: unknown, keys: string[], label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be plain data.`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length) throw new Error(`${label} has missing or unsupported fields.`);
  const out: Record<string, unknown> = {};
  for (const key of own) {
    if (typeof key !== 'string' || !keys.includes(key)) throw new Error(`${label} has an unsupported field.`);
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (!d.enumerable || !('value' in d)) throw new Error(`${label} requires data fields.`);
    out[key] = d.value;
  }
  return out;
}
function list(value: unknown): any[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > STUDIO_OFFLINE_LIMITS.files || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Offline file list exceeds its budget or is not dense.');
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !d.enumerable || !('value' in d)) throw new Error('Offline file list requires dense data.'); }
  return value;
}
export function isStudioOfflinePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 240 && (['index.html', 'manifest.webmanifest', 'icon.svg'].includes(path) || /^assets\/[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..'));
}
export function readStudioOfflineEntries(value: unknown): StudioOfflineEntry[] {
  let total = 0;
  const entries = list(value).map(item => {
    const d = fields(item, ['path', 'bytes', 'sha256'], 'Offline file');
    if (!isStudioOfflinePath(d.path) || !Number.isSafeInteger(d.bytes) || d.bytes < 0 || d.bytes > STUDIO_OFFLINE_LIMITS.fileBytes || !safeHash(d.sha256)) throw new Error('Offline file path, size or hash is unsupported.');
    total += d.bytes; return { path: d.path as string, bytes: d.bytes as number, sha256: d.sha256 as string };
  });
  if (total > STUDIO_OFFLINE_LIMITS.totalBytes || new Set(entries.map(v => v.path)).size !== entries.length || !entries.some(v => v.path === 'index.html') || !entries.some(v => v.path.startsWith('assets/') && v.path.endsWith('.js'))) throw new Error('Offline copy is oversized, duplicated or missing its application entry.');
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function studioOfflinePayload(entries: StudioOfflineEntry[]): Omit<StudioOfflineManifest, 'buildId'> {
  return { format: 'lfs-studio-offline' as const, version: 1 as const, appId: STUDIO_OFFLINE_APP, dataProtocol: 1 as const, scope: '/' as const, entryPoint: 'index.html' as const, entries: readStudioOfflineEntries(entries) };
}
export function readStudioOfflineManifest(value: unknown): StudioOfflineManifest {
  const d = fields(value, ['format', 'version', 'appId', 'dataProtocol', 'scope', 'entryPoint', 'entries', 'buildId'], 'Offline manifest');
  if (d.format !== 'lfs-studio-offline' || d.version !== 1 || d.appId !== STUDIO_OFFLINE_APP || d.dataProtocol !== 1 || d.scope !== '/' || d.entryPoint !== 'index.html' || !safeHash(d.buildId)) throw new Error('This offline-copy format/protocol is unsupported.');
  return { ...studioOfflinePayload(d.entries), buildId: d.buildId };
}
export async function studioOfflineSha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Offline integrity checks need a secure browser context.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function verifyStudioOfflineManifest(value: unknown): Promise<StudioOfflineManifest> {
  const manifest = readStudioOfflineManifest(value);
  const id = await studioOfflineSha256(new TextEncoder().encode(JSON.stringify(studioOfflinePayload(manifest.entries))));
  if (id !== manifest.buildId) throw new Error('Offline manifest identity does not match its complete file list.');
  return manifest;
}
export function readStudioOfflineInfo(value: unknown): StudioOfflineInfo {
  const d = fields(value, ['format', 'version', 'manifest', 'ready', 'verifiedAt', 'missing', 'invalid', 'totalBytes'], 'Offline status');
  if (d.format !== 'lfs-studio-offline-status' || d.version !== 1 || typeof d.ready !== 'boolean' || typeof d.verifiedAt !== 'string' || d.verifiedAt.length > 40 || !Number.isFinite(Date.parse(d.verifiedAt))) throw new Error('Unsupported offline status.');
  const manifest = readStudioOfflineManifest(d.manifest), paths = new Set(manifest.entries.map(e => e.path));
  const missing = list(d.missing), invalid = list(d.invalid);
  if ([...missing, ...invalid].some(p => typeof p !== 'string' || !paths.has(p)) || new Set([...missing, ...invalid]).size !== missing.length + invalid.length || d.totalBytes !== manifest.entries.reduce((n, e) => n + e.bytes, 0) || d.ready !== (missing.length === 0 && invalid.length === 0)) throw new Error('Offline status does not match its complete file list.');
  return { format: 'lfs-studio-offline-status', version: 1, manifest, ready: d.ready, verifiedAt: d.verifiedAt, missing, invalid, totalBytes: d.totalBytes };
}
export function studioOfflineMatchesAssets(info: StudioOfflineInfo | null, paths: readonly string[]): boolean {
  return Boolean(info && paths.length > 0 && paths.some(p => p.endsWith('.js')) && paths.every(p => info.manifest.entries.some(e => e.path === p)));
}
