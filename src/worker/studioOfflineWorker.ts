import { readStudioOfflineManifest, verifyStudioOfflineManifest, studioOfflineSha256, type StudioOfflineManifest, type StudioOfflineEntry, type StudioOfflineInfo } from '../lib/studioOfflineProtocol';
declare const __STUDIO_OFFLINE_BUILD__: unknown;
interface WorkerEnvironment {
  location: Location; registration: { scope: string };
  addEventListener(type: string, handler: (event: any) => void): void;
}
const worker = globalThis as unknown as WorkerEnvironment;
const BUILD: StudioOfflineManifest = readStudioOfflineManifest(__STUDIO_OFFLINE_BUILD__);
const CACHE_NAME = `lfs-block-studio.offline.v1.${BUILD.buildId}`;
const root = new URL(worker.registration.scope);
if (root.origin !== worker.location.origin || root.pathname !== '/') throw new Error('This offline build requires its declared root scope.');
const urlFor = (path: string) => new URL(path, root).href;
const marker = urlFor(`__lfs_offline_copy__/${BUILD.buildId}`);
const byUrl = new Map(BUILD.entries.map(entry => [urlFor(entry.path), entry]));
let copying: Promise<void> | null = null;

function contentTypeOk(response: Response, path: string) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (path.endsWith('.html')) return type === 'text/html';
  if (path.endsWith('.js')) return type === 'text/javascript' || type === 'application/javascript';
  if (path.endsWith('.css')) return type === 'text/css';
  if (path.endsWith('.svg')) return type === 'image/svg+xml';
  if (path.endsWith('.webmanifest')) return type === 'application/manifest+json' || type === 'application/json';
  return Boolean(type && type !== 'text/html');
}
interface VerifiedFile { data: Uint8Array<ArrayBuffer>; headers: Headers }
async function validResponse(response: Response | undefined, entry: StudioOfflineEntry): Promise<VerifiedFile | null> {
  if (!response || response.status !== 200 || !['basic', 'default'].includes(response.type) || !contentTypeOk(response, entry.path) || !response.body) return null;
  // Consume one branch. Early cancellation of a tee/clone can otherwise wait on an unread branch.
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > entry.bytes) return null; parts.push(item.value); }
    if (bytes !== entry.bytes) return null;
    const data = new Uint8Array(bytes); let at = 0; for (const part of parts) { data.set(part, at); at += part.length; }
    if (await studioOfflineSha256(data) !== entry.sha256) return null;
    const headers = new Headers(response.headers); headers.delete('content-encoding'); headers.delete('content-length'); headers.delete('transfer-encoding');
    return { data, headers };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function responseFor(file: VerifiedFile): Response { return new Response(file.data, { status: 200, headers: file.headers }); }
async function inspect(): Promise<StudioOfflineInfo> {
  const cache = await caches.open(CACHE_NAME), missing: string[] = [], invalid: string[] = [];
  for (const entry of BUILD.entries) {
    const response = await cache.match(urlFor(entry.path));
    if (!response) missing.push(entry.path); else if (!await validResponse(response, entry)) invalid.push(entry.path);
  }
  return { format: 'lfs-studio-offline-status', version: 1, manifest: BUILD, ready: !missing.length && !invalid.length, verifiedAt: new Date().toISOString(), missing, invalid, totalBytes: BUILD.entries.reduce((n, e) => n + e.bytes, 0) };
}
async function fetchEntry(entry: StudioOfflineEntry, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(urlFor(entry.path), { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
    const checked = await validResponse(response, entry); if (!checked) throw new Error(`Offline file integrity failed: ${entry.path}`);
    return responseFor(checked);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function copy(repairOnly: boolean): Promise<void> {
  if (copying) return copying;
  copying = (async () => {
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 45000);
    try {
      await verifyStudioOfflineManifest(BUILD);
      const cache = await caches.open(CACHE_NAME);
      for (const entry of BUILD.entries) {
        if (deadline.signal.aborted) throw new Error('Offline copy preparation timed out.');
        if (repairOnly && await validResponse(await cache.match(urlFor(entry.path)), entry)) continue;
        await cache.put(urlFor(entry.path), await fetchEntry(entry, deadline.signal));
      }
      const info = await inspect(); if (!info.ready || deadline.signal.aborted) throw new Error('The complete offline copy could not be read back.');
      await cache.put(marker, new Response(JSON.stringify({ format: 'lfs-studio-offline-copy', version: 1, buildId: BUILD.buildId, verifiedAt: info.verifiedAt }), { headers: { 'content-type': 'application/json' } }));
    } finally { clearTimeout(timer); }
  })();
  try { await copying; } finally { copying = null; }
}
function diagnostic(): Response {
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reopen LFS Studio</title><h1>The offline app copy is incomplete</h1><p>Your saved projects have not been cleared. Reconnect and reopen Studio to repair this app copy. If an update was waiting, close the other Studio tabs before reopening.</p><p><a href="/">Try reopening Studio</a></p></html>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; base-uri 'none'" } });
}
worker.addEventListener('install', event => { event.waitUntil(copy(false)); });
// Native waiting semantics protect open clients. No forced activation, takeover or cache pruning.
worker.addEventListener('activate', event => { event.waitUntil(Promise.resolve()); });
worker.addEventListener('fetch', event => {
  const request: Request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url); if (url.origin !== root.origin) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      let info = await inspect();
      if (!info.ready) { try { await copy(true); info = await inspect(); } catch { return diagnostic(); } }
      return info.ready ? (await (await caches.open(CACHE_NAME)).match(urlFor('index.html')))! : diagnostic();
    })()); return;
  }
  const entry = byUrl.get(url.href); if (!entry) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME), cached = await cache.match(url.href);
    const checked = await validResponse(cached, entry); if (checked) return responseFor(checked);
    try { const response = await fetchEntry(entry); await cache.put(url.href, response.clone()); return response; }
    catch { return Response.error(); }
  })());
});
worker.addEventListener('message', event => {
  const data = event.data, port: MessagePort | undefined = event.ports?.[0];
  if (!port || !data || data.format !== 'lfs-studio-offline-request' || data.version !== 1 || !['STATUS', 'REPAIR'].includes(data.type)) return;
  const source = event.source;
  try { const url = new URL(source?.url); if (url.origin !== root.origin || !['/', '/index.html'].includes(url.pathname)) return; } catch { return; }
  event.waitUntil((async () => {
    try { if (data.type === 'REPAIR') await copy(true); port.postMessage(await inspect()); }
    catch { port.postMessage({ format: 'lfs-studio-offline-error', version: 1, message: 'The offline app copy could not be verified or repaired. Your saved project was not cleared.' }); }
    finally { port.close(); }
  })());
});
