import { useSyncExternalStore } from 'react';
import { readStudioOfflineInfo, studioOfflineMatchesAssets, type StudioOfflineInfo } from './studioOfflineProtocol';
export interface StudioOfflineSnapshot {
  phase: 'preview' | 'unsupported' | 'starting' | 'checking' | 'ready' | 'waiting' | 'incomplete' | 'unavailable' | 'foreign';
  checking: boolean; active: StudioOfflineInfo | null; waiting: StudioOfflineInfo | null; hasWaiting: boolean;
  ready: boolean; controlled: boolean; message: string; updateProblem: string;
}
type WorkerRequest = (worker: ServiceWorker, action: 'STATUS' | 'REPAIR') => Promise<StudioOfflineInfo>;
function requestWorker(worker: ServiceWorker, action: 'STATUS' | 'REPAIR'): Promise<StudioOfflineInfo> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel(), timeout = setTimeout(() => finish(new Error('Offline status did not respond.')), action === 'REPAIR' ? 65000 : 4000);
    const finish = (error?: Error, value?: StudioOfflineInfo) => { clearTimeout(timeout); channel.port1.close(); channel.port2.close(); error ? reject(error) : resolve(value!); };
    channel.port1.onmessage = event => { try { finish(undefined, readStudioOfflineInfo(event.data)); } catch { finish(new Error('This app copy could not be inspected.')); } };
    channel.port1.onmessageerror = () => finish(new Error('This app copy could not be inspected.'));
    try { worker.postMessage({ format: 'lfs-studio-offline-request', version: 1, type: action }, [channel.port2]); } catch { finish(new Error('Offline status is unavailable in this context.')); }
  });
}
export function captureStudioOfflineAssets(document: Document, origin: string): string[] {
  const values = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type="module"][src],link[rel="stylesheet"][href]')].map(node => 'src' in node ? node.src : node.href);
  const paths: string[] = [];
  for (const value of values) { const url = new URL(value, origin); if (url.origin !== origin || !url.pathname.startsWith('/assets/') || url.search) return []; paths.push(url.pathname.slice(1)); }
  return [...new Set(paths)].sort();
}
/** Read-only native registration/cache state; it cannot reload, activate early, or edit a project. */
export class StudioOfflineClient {
  private snapshot: StudioOfflineSnapshot;
  private listeners = new Set<() => void>();
  private registration: ServiceWorkerRegistration | null = null;
  private started = false;
  private generation = 0;
  private disposed = false;
  private setupProblem = '';
  private cleanup: (() => void)[] = [];
  private watched = new WeakSet<ServiceWorker>();
  constructor(private readonly options: { enabled: boolean; container: ServiceWorkerContainer | null; origin: string; assets: readonly string[]; request?: WorkerRequest }) {
    this.snapshot = Object.freeze({ phase: !options.enabled ? 'preview' : !options.container ? 'unsupported' : 'starting', checking: false, active: null, waiting: null, hasWaiting: false, ready: false, controlled: Boolean(options.container?.controller), message: !options.enabled ? 'Offline app setup is available in the built app; this preview keeps its existing behavior.' : !options.container ? 'This browser context cannot store an offline app copy. Project downloads remain available.' : 'Checking the local app copy.', updateProblem: '' });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<StudioOfflineSnapshot>) { if (this.disposed) return; this.snapshot = Object.freeze({ ...this.snapshot, ...patch }); for (const listener of this.listeners) listener(); }
  private owns(registration: ServiceWorkerRegistration) {
    try {
      const scope = new URL(registration.scope); if (scope.origin !== this.options.origin || scope.pathname !== '/') return false;
      return [registration.active, registration.waiting, registration.installing].filter(Boolean).every(worker => { const url = new URL(worker!.scriptURL); return url.origin === this.options.origin && url.pathname === '/sw.js' && !url.search; });
    } catch { return false; }
  }
  private watchWorker(worker: ServiceWorker | null) {
    if (!worker || this.watched.has(worker)) return; this.watched.add(worker);
    const changed = () => { if (worker.state === 'redundant') this.setupProblem = 'An app-copy setup did not finish. The open project was not cleared.'; void this.refresh(false); };
    worker.addEventListener('statechange', changed); this.cleanup.push(() => worker.removeEventListener('statechange', changed));
  }
  start = async (): Promise<void> => {
    if (this.started || this.disposed || !this.options.enabled || !this.options.container) return;
    this.started = true; const generation = ++this.generation, container = this.options.container;
    this.publish({ phase: 'starting', checking: true });
    try {
      let registration = await container.getRegistration(this.options.origin + '/');
      if (this.disposed || generation !== this.generation) return;
      if (registration && !this.owns(registration)) { this.publish({ phase: 'foreign', checking: false, message: 'Another app manages offline pages at this address. Studio has not replaced it; use a dedicated app address for offline setup.' }); return; }
      if (!registration || ![registration.active, registration.waiting, registration.installing].some(Boolean)) registration = await container.register(this.options.origin + '/sw.js', { scope: '/', updateViaCache: 'none' });
      if (this.disposed || generation !== this.generation) return;
      if (!this.owns(registration)) throw new Error('Offline registration differs from this app address.');
      this.registration = registration;
      const update = () => { this.watchWorker(registration!.installing); void this.refresh(false); };
      const control = () => { void this.refresh(false); };
      registration.addEventListener('updatefound', update); container.addEventListener('controllerchange', control);
      this.cleanup.push(() => registration!.removeEventListener('updatefound', update), () => container.removeEventListener('controllerchange', control));
      this.watchWorker(registration.installing); await this.refresh(false);
    } catch { if (!this.disposed && generation === this.generation) { this.started = false; this.publish({ phase: 'unavailable', checking: false, message: 'The offline app copy could not be set up. Your project and downloads remain available; reconnect and check again.' }); } }
  };
  refresh = async (checkUpdate = true): Promise<void> => {
    if (this.disposed) return;
    if (!this.registration) { if (!this.snapshot.checking) { this.started = false; await this.start(); } return; }
    const registration = this.registration, generation = ++this.generation;
    if (checkUpdate) this.setupProblem = '';
    this.publish({ checking: true, phase: 'checking', updateProblem: this.setupProblem });
    let updateProblem = '';
    if (checkUpdate) { try { await registration.update(); } catch { updateProblem = 'Updates could not be checked. The stored copy can still be verified.'; } }
    if (this.disposed || generation !== this.generation) return;
    const activeWorker = registration.active, waitingWorker = registration.waiting, rpc = this.options.request ?? requestWorker;
    const read = async (worker: ServiceWorker | null) => { if (!worker) return null; try { return await rpc(worker, 'STATUS'); } catch { return null; } };
    const [active, waiting] = await Promise.all([read(activeWorker), read(waitingWorker)]);
    if (this.disposed || generation !== this.generation) return;
    if (registration.active !== activeWorker || registration.waiting !== waitingWorker) { void this.refresh(false); return; }
    const hasWaiting = Boolean(waitingWorker), ready = Boolean(active?.ready && studioOfflineMatchesAssets(active, this.options.assets));
    const phase = ready ? 'ready' : hasWaiting ? 'waiting' : registration.installing ? 'starting' : active && !active.ready ? 'incomplete' : 'unavailable';
    const message = ready ? 'The app copy is verified for offline reopening.' : hasWaiting ? 'A new app copy is waiting. Save work in each Studio tab, then close all Studio tabs and reopen.' : registration.installing ? 'Storing and checking the complete app copy. Keep this tab open until setup finishes.' : active && !active.ready ? 'The stored app copy is incomplete. Reconnect and repair it before relying on offline reopening.' : 'Offline reopening could not be verified for this tab. Keep an independent project download and check again when connected.';
    this.publish({ phase, checking: false, active, waiting, hasWaiting, ready, controlled: Boolean(this.options.container?.controller), message, updateProblem: updateProblem || this.setupProblem });
  };
  repair = async (): Promise<void> => {
    const registration = this.registration, worker = registration?.active;
    if (this.disposed || !registration || !worker || !this.snapshot.active || this.snapshot.checking) return;
    const generation = ++this.generation; this.publish({ checking: true, phase: 'checking', message: 'Repairing this app copy from its exact original files. Project data is unchanged.', updateProblem: '' });
    try { await (this.options.request ?? requestWorker)(worker, 'REPAIR'); this.setupProblem = ''; }
    catch { if (!this.disposed && generation === this.generation) this.setupProblem = 'Repair did not finish. The open project was not cleared.'; }
    if (!this.disposed && generation === this.generation && registration.active === worker) await this.refresh(false);
  };
  dispose = () => { this.disposed = true; this.generation++; for (const close of this.cleanup) close(); this.cleanup = []; this.listeners.clear(); };
}
let nativeClient: StudioOfflineClient | null = null;
export function getStudioOfflineClient(): StudioOfflineClient {
  if (!nativeClient) {
    const browser = typeof window !== 'undefined';
    nativeClient = new StudioOfflineClient({ enabled: Boolean(import.meta.env?.PROD), container: browser && 'serviceWorker' in navigator ? navigator.serviceWorker : null, origin: browser ? location.origin : 'http://localhost', assets: browser ? captureStudioOfflineAssets(document, location.origin) : [] });
  }
  return nativeClient;
}
export function useStudioOffline() { const client = getStudioOfflineClient(); return { client, snapshot: useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot) }; }
