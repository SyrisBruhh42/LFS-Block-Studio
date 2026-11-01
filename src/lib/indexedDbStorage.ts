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
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openStudioDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openStudioDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbClearAll(): Promise<boolean> {
  const db = await openStudioDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
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
  usageBytes: number;
  quotaBytes: number;
  usageFormatted: string;
  quotaFormatted: string;
  engineLabel: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.2 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function estimateStudioStorageQuota(): Promise<StorageQuotaEstimate> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const est = await navigator.storage.estimate();
      const usageBytes = est.usage || 256 * 1024;
      const quotaBytes = est.quota || 1024 * 1024 * 1024;
      return {
        usageBytes,
        quotaBytes,
        usageFormatted: formatBytes(usageBytes),
        quotaFormatted: formatBytes(quotaBytes),
        engineLabel: 'IndexedDB High-Capacity Engine (lfs_studio_db)',
      };
    }
  } catch {
    // Fallback below
  }
  return {
    usageBytes: 512 * 1024,
    quotaBytes: 512 * 1024 * 1024,
    usageFormatted: '0.5 MB',
    quotaFormatted: '512.0 MB',
    engineLabel: 'IndexedDB High-Capacity Engine (lfs_studio_db)',
  };
}
