import {
  AdaptivePatternArchiveState,
  CustomBlockDefinition,
  GitCommitNode,
  SavedStudioProject,
} from '../engine/types';
import { LocalAutosaveSnapshot } from './googleDrive';

const DB_NAME = 'lfs_studio_db_v1';
const DB_VERSION = 1;
const STORE_KV = 'studio_kv';

export interface StudioUserProgressState {
  xp: number;
  claimedContractIds: string[];
  claimedDailyDates: string[];
  streakDays: number;
  lastBuildDate: string | null;
  onboardingCompleted: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  batterySaver30Fps: boolean;
  reportedWorldIds: string[];
  blockedOwnerIds: string[];
}

export const DEFAULT_USER_PROGRESS_STATE: StudioUserProgressState = {
  xp: 150,
  claimedContractIds: [],
  claimedDailyDates: [],
  streakDays: 1,
  lastBuildDate: new Date().toISOString().slice(0, 10),
  onboardingCompleted: false,
  soundEnabled: true,
  hapticsEnabled: true,
  batterySaver30Fps: false,
  reportedWorldIds: [],
  blockedOwnerIds: [],
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openStudioDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const unavailable = () => { if (!settled) { settled = true; resolve(null); } };
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_KV)) req.result.createObjectStore(STORE_KV);
      };
      req.onsuccess = () => {
        const db = req.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); if (dbPromise === opening) dbPromise = null; };
        db.onclose = () => { if (dbPromise === opening) dbPromise = null; };
        resolve(db);
      };
      req.onerror = unavailable;
      req.onblocked = unavailable;
    } catch { unavailable(); }
  });
  dbPromise = opening;
  void opening.then(db => { if (!db && dbPromise === opening) dbPromise = null; });
  return opening;
}

/** Missing key returns null; unavailable/failed/aborted reads reject, never masquerade as an empty project. */
export async function idbGetStrict<T>(key: string): Promise<T | null> {
  const db = await openStudioDb();
  if (!db) throw new DOMException('Legacy browser storage could not be opened.', 'InvalidStateError');
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const req = tx.objectStore(STORE_KV).get(key);
      let value: T | null = null;
      req.onsuccess = () => { value = (req.result as T) ?? null; };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new DOMException('Legacy read aborted.', 'AbortError'));
      tx.onerror = () => { /* Default IndexedDB error propagation aborts the transaction. */ };
    } catch (error) { reject(error); }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try { return await idbGetStrict<T>(key); } catch { return null; }
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openStudioDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => { /* A failed request aborts; never acknowledge request success alone. */ };
      tx.objectStore(STORE_KV).put(value, key);
    } catch { resolve(false); }
  });
}

export async function idbClearAll(): Promise<boolean> {
  const db = await openStudioDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => { /* Settle only when the transaction commits or aborts. */ };
      tx.objectStore(STORE_KV).clear();
    } catch { resolve(false); }
  });
}

export interface StudioHydratedStorageBundle {
  savedProjects: SavedStudioProject[] | null;
  localSnapshots: LocalAutosaveSnapshot[] | null;
  gitCommits: GitCommitNode[] | null;
  patternArchive: AdaptivePatternArchiveState | null;
  customBlocks: CustomBlockDefinition[] | null;
  userProgress: StudioUserProgressState | null;
}

/**
 * Hydrates studio data from IndexedDB and transparently migrates any existing
 * legacy localStorage keys on first launch.
 */
export async function hydrateAndMigrateStudioStorage(legacyKeys: {
  projectsKey: string;
  snapshotsKey: string;
  gitCommitsKey: string;
  archiveKey: string;
  customBlocksKey: string;
  userProgressKey: string;
}): Promise<StudioHydratedStorageBundle> {
  const [
    idbProjects,
    idbSnapshots,
    idbCommits,
    idbArchive,
    idbCustomBlocks,
    idbProgress,
  ] = await Promise.all([
    idbGet<SavedStudioProject[]>('saved_projects'),
    idbGet<LocalAutosaveSnapshot[]>('autosave_snapshots'),
    idbGet<GitCommitNode[]>('git_commits'),
    idbGet<AdaptivePatternArchiveState>('copilot_archive'),
    idbGet<CustomBlockDefinition[]>('custom_blocks'),
    idbGet<StudioUserProgressState>('user_progress'),
  ]);

  const tryParseLocal = <T>(k: string): T | null => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };

  const savedProjects =
    idbProjects ?? tryParseLocal<SavedStudioProject[]>(legacyKeys.projectsKey);
  if (!idbProjects && savedProjects) {
    await idbSet('saved_projects', savedProjects);
  }

  const localSnapshots =
    idbSnapshots ??
    tryParseLocal<LocalAutosaveSnapshot[]>(legacyKeys.snapshotsKey);
  if (!idbSnapshots && localSnapshots) {
    await idbSet('autosave_snapshots', localSnapshots);
  }

  const gitCommits =
    idbCommits ?? tryParseLocal<GitCommitNode[]>(legacyKeys.gitCommitsKey);
  if (!idbCommits && gitCommits) {
    await idbSet('git_commits', gitCommits);
  }

  const patternArchive =
    idbArchive ??
    tryParseLocal<AdaptivePatternArchiveState>(legacyKeys.archiveKey);
  if (!idbArchive && patternArchive) {
    await idbSet('copilot_archive', patternArchive);
  }

  const customBlocks =
    idbCustomBlocks ??
    tryParseLocal<CustomBlockDefinition[]>(legacyKeys.customBlocksKey);
  if (!idbCustomBlocks && customBlocks) {
    await idbSet('custom_blocks', customBlocks);
  }

  const userProgress =
    idbProgress ??
    tryParseLocal<StudioUserProgressState>(legacyKeys.userProgressKey);
  if (!idbProgress && userProgress) {
    await idbSet('user_progress', userProgress);
  }

  return {
    savedProjects,
    localSnapshots,
    gitCommits,
    patternArchive,
    customBlocks,
    userProgress,
  };
}

export interface StorageQuotaEstimate {
  usageBytes: number | null;
  quotaBytes: number | null;
  usageFormatted: string;
  quotaFormatted: string;
  engineLabel: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unavailable';
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function estimateStudioStorageQuota(): Promise<StorageQuotaEstimate> {
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.estimate === 'function') {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number' && Number.isFinite(est.usage) && est.usage >= 0) usageBytes = est.usage;
      if (typeof est.quota === 'number' && Number.isFinite(est.quota) && est.quota >= 0) quotaBytes = est.quota;
    }
  } catch { /* An unavailable estimate is unknown, never an invented capacity. */ }
  return {
    usageBytes, quotaBytes,
    usageFormatted: formatBytes(usageBytes), quotaFormatted: formatBytes(quotaBytes),
    engineLabel: usageBytes === null && quotaBytes === null ? 'Browser storage estimate unavailable' : 'Browser origin storage (estimate)',
  };
}
