import { useCallback, useEffect, useRef, useState } from 'react';
import { createStudioId, STUDIO_DOCUMENT_LIMITS, validateStudioDocument, type StudioDocument } from './studioDocument';
import { StudioDocumentStore, encodeStudioRecoverySourceEnvelope, type ActiveStudioDocument, type LegacyDocumentSource, type RecoveryRecordRef, type RecoveryRecordPage, type RawRecoveryRecord } from './studioDocumentStore';
import { idbGetStrict } from './indexedDbStorage';
import { downloadStudioJson, importStudioCandidate, studioContentKey } from './legacyStudioImport';
import type { StudioTarget } from './studioTargetPolicy';

export type StudioAuthoredContent = Pick<StudioDocument, 'world' | 'blocks' | 'customBlocks' | 'blueprints' | 'chunkConfig' | 'patternConfig' | 'lightingConfig' | 'extensions'>;
/** Synchronous editor authority. onRestore must replace its content/session before returning. */
export interface StudioEditAuthority {
  readContent(): StudioAuthoredContent;
  /** Changes on every accepted edit/undo and session/history-epoch replacement, including ABA edits. */
  getToken(): string;
  setWritable(writable: boolean): void;
  /** Lock is independent of writability; releasing it must not reopen a non-writable session. */
  acquireLock(): (() => void) | null;
  /** Advance durable metadata only; preserve newer authored edits/history and the live edit token. */
  acknowledgeSaved?(document: StudioDocument, sourceToken: string): void;
}
export interface RecoveryChoice { id: string; label: string; document: StudioDocument; sources: LegacyDocumentSource[] }
export type SavePhase = 'loading' | 'saved' | 'dirty' | 'saving' | 'failed';
const LEGACY_KEYS = {
  snapshots: 'brickforge_autosave_snapshots_v1', definitions: 'brickforge_custom_blocks_v1',
  projects: 'brickforge_saved_projects_v1', blueprints: 'brickforge_saved_blueprints_v1',
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string; code?: string } }): T {
  if (result.ok === false) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.value;
}
function message(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }
function isConflict(reason: unknown): boolean { return !!reason && typeof reason === 'object' && 'code' in reason && reason.code === 'conflict'; }
function authored(document: StudioDocument): StudioAuthoredContent {
  const { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions } = document;
  return { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions };
}
function freshDocument(content: StudioAuthoredContent): StudioDocument {
  // Clone now: subsequent engine edits must not change the separate-project baseline.
  return structuredClone({
    format: 'lfs-studio-project', schemaVersion: 1, documentId: createStudioId(),
    revision: 0, historyEpoch: createStudioId('history'), savedAt: new Date().toISOString(), ...content,
  });
}
function asCopy(document: StudioDocument): StudioDocument {
  return unwrap(validateStudioDocument({ ...document, documentId: createStudioId(), revision: 0, historyEpoch: createStudioId('history'), savedAt: new Date().toISOString() }));
}

export function useStudioPersistence(options: {
  content: StudioAuthoredContent;
  onRestore: (document: StudioDocument) => void;
  autosaveEnabled: boolean;
  autosaveIntervalSec: number;
  editAuthority?: StudioEditAuthority;
}) {
  const [store] = useState(() => new StudioDocumentStore());
  const [phase, setPhase] = useState<SavePhase>('loading');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<RecoveryChoice[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryKind, setRecoveryKind] = useState<'revision' | 'candidate'>('revision');
  const [recoveryPage, setRecoveryPage] = useState<RecoveryRecordPage | null>(null);
  const [recoverySelected, setRecoverySelected] = useState<RawRecoveryRecord | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryCursors, setRecoveryCursors] = useState<(IDBValidKey | null)[]>([null]);
  const recoveryController = useRef<AbortController | null>(null);
  const active = useRef<ActiveStudioDocument | null>(null);
  const content = useRef(options.content);
  const editAuthority = useRef(options.editAuthority);
  const onRestore = useRef(options.onRestore);
  const initial = useRef<StudioDocument | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const hydrationController = useRef<AbortController | null>(null);
  const exclusiveController = useRef<AbortController | null>(null);
  const sources = useRef<LegacyDocumentSource[]>([]);
  const committedContent = useRef<string | null>(null);
  const blocked = useRef(false);
  content.current = options.content;
  editAuthority.current = options.editAuthority;
  onRestore.current = options.onRestore;
  if (!initial.current) initial.current = freshDocument(options.editAuthority?.readContent() ?? options.content);

  const currentDocument = useCallback((): StudioDocument => {
    const baseline = active.current?.document ?? initial.current!;
    const live = editAuthority.current?.readContent() ?? content.current;
    // Authority supplies the whole authored document. Undefined optional fields
    // are intentional absence; only legacy partial React capture needs fallback.
    if (editAuthority.current) return { ...baseline, ...live, lightingConfig: live.lightingConfig, extensions: live.extensions, savedAt: new Date().toISOString() };
    return {
      ...baseline, ...live, world: {
        ...baseline.world, ...live.world,
        description: live.world.description === undefined ? baseline.world.description : live.world.description,
      },
      // Absent optional UI fields do not erase document-only metadata. Explicit edits
      // should supply their authored values; imports/replacements establish a new baseline.
      lightingConfig: live.lightingConfig === undefined ? baseline.lightingConfig : live.lightingConfig,
      extensions: live.extensions === undefined ? baseline.extensions : live.extensions,
      savedAt: new Date().toISOString(),
    };
  }, []);
  const importDefaults = useCallback(() => structuredClone(initial.current!), []);

  const acceptActive = useCallback((value: ActiveStudioDocument) => {
    recoveryController.current?.abort(); recoveryController.current = null;
    setRecoveryOpen(false); setRecoveryBusy(false); setRecoverySelected(null); setRecoveryPage(null); setRecoveryError(null);
    active.current = value;
    committedContent.current = studioContentKey(value.document);
    const restored = structuredClone(value.document);
    content.current = authored(restored);
    onRestore.current(restored);
    editAuthority.current?.setWritable(true);
    readyRef.current = true;
    blocked.current = false;
    setReady(true); setPhase('saved'); setSavedAt(value.document.savedAt);
    setError(null); setChoices([]);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const session = ++generation.current;
    const controller = new AbortController();
    hydrationController.current = controller;
    const alive = () => !controller.signal.aborted && mounted.current && generation.current === session;
    readyRef.current = false;
    editAuthority.current?.setWritable(false);
    busyRef.current = false;
    setReady(false); setBusy(false); setPhase('loading'); setError(null); setChoices([]);
    setRecoveryBusy(false); setRecoveryOpen(false); setRecoverySelected(null); setRecoveryPage(null); setRecoveryError(null);
    (async () => {
      // React StrictMode may clean up its first effect synchronously. Do not leave
      // a closing IndexedDB open request cached for the second effect to inherit.
      await Promise.resolve();
      if (!alive()) return;
      const originals: LegacyDocumentSource[] = [];
      const found: RecoveryChoice[] = [];
      const problems: string[] = [];
      const local: Record<string, any> = {};
      // Retain every readable local original even if any later storage read fails.
      for (const [name, key] of Object.entries(LEGACY_KEYS)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw === null) continue;
          originals.push({ sourceId: `localStorage:${key}`, raw });
          sources.current = [...originals];
          if (raw.length > STUDIO_DOCUMENT_LIMITS.maxBytes || new TextEncoder().encode(raw).byteLength > STUDIO_DOCUMENT_LIMITS.maxBytes) {
            problems.push(`The ${name} local-storage source exceeds the import limit.`); continue;
          }
          try { local[name] = JSON.parse(raw); } catch { problems.push(`The ${name} local-storage file is incomplete JSON.`); }
        } catch { problems.push(`The ${name} local-storage source could not be read. It was not treated as empty.`); }
      }
      const loaded = unwrap(await store.loadActive({ signal: controller.signal }));
      if (!alive()) return;
      if (loaded) { acceptActive(loaded); return; }
      const idbNames = ['snapshots', 'definitions', 'projects'] as const;
      const idbResults = await Promise.allSettled([
        idbGetStrict<unknown>('autosave_snapshots'), idbGetStrict<unknown>('custom_blocks'), idbGetStrict<unknown>('saved_projects'),
      ]);
      if (!alive()) return;
      const idb: Record<string, unknown> = {};
      idbResults.forEach((result, index) => {
        const name = idbNames[index];
        if (result.status === 'rejected') {
          problems.push(`The IndexedDB ${name} source could not be read. It was not treated as empty.`); return;
        }
        idb[name] = result.value;
        if (result.value !== null) {
          try { originals.push({ sourceId: `IndexedDB:${name}`, raw: JSON.stringify(result.value) }); }
          catch { problems.push(`The IndexedDB ${name} source could not be preserved as JSON.`); }
        }
      });
      sources.current = [...originals];
      const addSnapshots = (value: unknown, label: string, looseDefinitions: unknown) => {
        if (value == null) return;
        if (!Array.isArray(value)) { problems.push(`${label} is not a snapshot list.`); return; }
        for (const item of value.slice(0, 20)) {
          if (!item?.backup || typeof item.backup !== 'object' || Array.isArray(item.backup)) { problems.push(`${label} has a snapshot without its project.`); continue; }
          const backup = { ...item.backup };
          if (backup.customBlocks === undefined && Array.isArray(looseDefinitions)) backup.customBlocks = looseDefinitions;
          const result = importStudioCandidate(JSON.stringify(backup), initial.current!);
          if (result.ok === false) { problems.push(`${label}: ${result.error.message}`); continue; }
          const key = studioContentKey(result.value);
          if (!found.some(candidate => studioContentKey(candidate.document) === key)) {
            found.push({ id: createStudioId('recovery'), label: `${label} · ${item.savedAt || 'date unknown'}`, document: result.value, sources: originals });
          }
        }
        if (value.length > 20) problems.push(`${label} has more than 20 snapshots; originals are preserved for manual recovery.`);
      };
      addSnapshots(idb.snapshots, 'IndexedDB snapshot', idb.definitions);
      addSnapshots(local.snapshots, 'Local-storage snapshot', local.definitions);
      // Named projects are candidates, never an authority inferred from timestamps.
      if (!found.length) {
        for (const [label, list] of [['IndexedDB project', idb.projects], ['Local-storage project', local.projects]] as const) {
          if (list == null) continue;
          if (!Array.isArray(list)) { problems.push(`${label} list is invalid.`); continue; }
          for (const item of list.slice(0, 20)) {
            const result = importStudioCandidate(JSON.stringify(item), initial.current!);
            if (result.ok === false) { problems.push(`${label}: ${result.error.message}`); continue; }
            found.push({ id: createStudioId('recovery'), label, document: result.value, sources: originals });
          }
          if (list.length > 20) problems.push(`${label} has more than 20 projects; originals are preserved for manual recovery.`);
        }
      }
      if (originals.length && !found.length) problems.push('Saved resources exist without a complete active project. Choose recovery or start a separate project after preserving the originals.');
      if (found.length > 1 || problems.length) {
        setChoices(found); setError(problems.join(' ') || 'Saved copies differ. Choose the project to recover; timestamps alone cannot determine which is correct.');
        setPhase('failed'); return;
      }
      const candidate = unwrap(await store.stageCandidate(found[0]?.document ?? initial.current!, originals, { signal: controller.signal }));
      if (!alive()) return;
      const promoted = unwrap(await store.promoteCandidate(candidate.candidateId, null, { signal: controller.signal }));
      if (alive()) acceptActive(promoted);
    })().catch(reason => {
      if (alive()) { setError(message(reason, 'Project recovery failed.')); setPhase('failed'); }
    }).finally(() => { if (hydrationController.current === controller) hydrationController.current = null; });
    return () => {
      controller.abort(); saveController.current?.abort(); exclusiveController.current?.abort(); recoveryController.current?.abort();
      editAuthority.current?.setWritable(false);
      mounted.current = false; generation.current++; store.close();
    };
  }, [store, acceptActive, attempt]);

  useEffect(() => {
    if (!ready || busy || blocked.current) return;
    const unchanged = studioContentKey(currentDocument()) === committedContent.current;
    setPhase(previous => previous === 'saving' || previous === 'failed' ? previous : unchanged ? 'saved' : 'dirty');
  }, [options.content, ready, busy, currentDocument]);

  const saveInternal = useCallback(async function saveLatest(allowBusy = false): Promise<boolean> {
    if (!mounted.current || !readyRef.current || blocked.current || (busyRef.current && !allowBusy)) return false;
    const session = generation.current;
    const alive = () => mounted.current && generation.current === session;
    if (saving.current) {
      const succeeded = await saving.current;
      if (!succeeded || !alive()) return false;
      return saveLatest(allowBusy);
    }
    const expected = active.current;
    if (!expected) return false;
    let operation: Promise<boolean>;
    const controller = new AbortController();
    saveController.current = controller;
    operation = (async () => {
      try {
        const authority = editAuthority.current;
        const sourceToken = authority?.getToken();
        const snapshot = currentDocument();
        if (studioContentKey(snapshot) === committedContent.current) { setPhase('saved'); setError(null); return true; }
        const validated = unwrap(validateStudioDocument({ ...snapshot, revision: expected.token.revision + 1 }));
        setPhase('saving'); setError(null);
        const result = unwrap(await store.save(validated, expected.token, { signal: controller.signal }));
        if (!alive()) return false;
        active.current = result;
        committedContent.current = studioContentKey(result.document);
        try { authority?.acknowledgeSaved?.(result.document, sourceToken!); }
        catch (reason) {
          // Storage already committed. Keep current memory and prohibit a save
          // using an editor session that declined this durable acknowledgement.
          blocked.current = true;
          throw new Error(`The project was saved, but the editor could not accept its save receipt. Current edits remain open. ${message(reason, 'Recover or keep a separate project before saving again.')}`);
        }
        setSavedAt(result.document.savedAt);
        setPhase(studioContentKey(currentDocument()) === committedContent.current ? 'saved' : 'dirty');
        return true;
      } catch (reason) {
        if (alive()) {
          if (isConflict(reason)) blocked.current = true;
          setError(message(reason, 'Save did not complete. Keep this project open and download a recovery copy.')); setPhase('failed');
        }
        return false;
      }
    })();
    saving.current = operation;
    try { return await operation; }
    finally {
      if (saving.current === operation) saving.current = null;
      if (saveController.current === controller) saveController.current = null;
    }
  }, [store, currentDocument]);
  const save = useCallback(() => saveInternal(), [saveInternal]);

  useEffect(() => {
    if (!ready || busy || !options.autosaveEnabled || phase !== 'dirty') return;
    const timer = window.setTimeout(() => { void save(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [options.content, options.autosaveEnabled, ready, busy, phase, save]);
  useEffect(() => {
    if (!ready || busy || !options.autosaveEnabled) return;
    const timer = window.setInterval(() => { if (!blocked.current && !error) void save(); }, Math.max(15, options.autosaveIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [ready, busy, options.autosaveEnabled, options.autosaveIntervalSec, error, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (readyRef.current && studioContentKey(currentDocument()) !== committedContent.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [currentDocument]);

  // Synchronous mutex: two clicks in one render cannot start two replacements.
  const beginExclusive = useCallback((replacing = false) => {
    if (!mounted.current || busyRef.current) return null;
    if (!replacing && hydrationController.current) return null;
    const authority = editAuthority.current;
    const release = authority?.acquireLock();
    if (authority && !release) return null;
    if (replacing && !readyRef.current) { hydrationController.current?.abort(); generation.current++; }
    else if (hydrationController.current) { release?.(); return null; }
    const session = generation.current;
    const controller = new AbortController();
    exclusiveController.current = controller;
    busyRef.current = true; setBusy(true);
    return {
      signal: controller.signal,
      alive: () => mounted.current && generation.current === session && !controller.signal.aborted,
      finish: () => {
        release?.();
        if (exclusiveController.current !== controller) return;
        exclusiveController.current = null;
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      },
    };
  }, []);

  const activateCopy = useCallback(async (document: StudioDocument | null, originals: LegacyDocumentSource[], fork: boolean): Promise<boolean> => {
    if (fork && !readyRef.current) return false;
    const operation = beginExclusive(true);
    if (!operation) return false;
    const sourceToken = editAuthority.current?.getToken();
    const sameAuthorityToken = () => editAuthority.current?.getToken() === sourceToken;
    try {
      // Fork deliberately preserves local unsaved content after a conflict. Ordinary
      // replacement first saves current work, and stops if that preservation fails.
      if (fork) { if (saving.current) await saving.current; }
      else if (readyRef.current && !await saveInternal(true)) throw new Error('Save the current work or keep it as a separate project before restoring another project.');
      if (!operation.alive()) return false;
      if (!sameAuthorityToken()) throw new Error('The editor changed while the current project was saving. The current work remains open; retry the restore.');
      if (!fork && readyRef.current && studioContentKey(currentDocument()) !== committedContent.current) {
        throw new Error('New edits arrived while the current project was saving. They remain open and unsaved; save them and retry the restore.');
      }
      const sourceKey = studioContentKey(currentDocument());
      const copy = asCopy(fork ? currentDocument() : document!);
      const expected = fork ? unwrap(await store.loadActive())?.token ?? null : active.current?.token ?? null;
      if (!operation.alive()) return false;
      const candidate = unwrap(await store.stageCandidate(copy, originals, { signal: operation.signal }));
      if (!operation.alive()) return false;
      if (!sameAuthorityToken() || studioContentKey(currentDocument()) !== sourceKey) throw new Error('The project changed while the copy was prepared. The prepared copy is retained; review the newer work and retry.');
      const promoted = unwrap(await store.promoteCandidate(candidate.candidateId, expected, { signal: operation.signal }));
      if (!operation.alive()) return false;
      if (!sameAuthorityToken() || studioContentKey(currentDocument()) !== sourceKey) {
        // Commit already completed: do not roll it back or overwrite newer memory.
        // A fresh-token fork can now preserve this later work as another project.
        blocked.current = true;
        throw new Error('The copy was saved, but newer edits arrived during activation. Those edits remain open and unsaved. Keep them as a separate project or download them before leaving.');
      }
      generation.current++;
      // onRestore intentionally rotates editor authority. All stale-source
      // checks occur before it; the new token is not a stale predecessor.
      acceptActive(promoted);
      return true;
    } catch (reason) {
      if (operation.alive()) {
        if (isConflict(reason)) blocked.current = true;
        setError(message(reason, 'The project copy could not be activated.')); setPhase('failed');
      }
      return false;
    } finally { operation.finish(); }
  }, [store, beginExclusive, saveInternal, currentDocument, acceptActive]);
  const restoreCopy = useCallback((document: StudioDocument, originals: LegacyDocumentSource[] = []) => activateCopy(document, originals, false), [activateCopy]);
  const forkCurrent = useCallback(() => activateCopy(null, [], true), [activateCopy]);

  /** Preserve exact resource input in a verified independent candidate before a library edit. */
  const preserveResourceCandidate = useCallback(async (document: StudioDocument, originals: LegacyDocumentSource[], expectedSourceToken: string): Promise<boolean> => {
    if (!readyRef.current || blocked.current || !editAuthority.current || editAuthority.current.getToken() !== expectedSourceToken) return false;
    const operation = beginExclusive();
    if (!operation) return false;
    try {
      const copy = asCopy(document);
      unwrap(await store.stageCandidate(copy, originals, { signal: operation.signal }));
      if (!operation.alive()) return false;
      if (editAuthority.current?.getToken() !== expectedSourceToken) throw new Error('The editor changed while the resource was preserved. Its original remains recoverable; review and import again.');
      return true;
    } catch (reason) {
      if (operation.alive()) setError(message(reason, 'Original resource could not be preserved. Nothing was imported.'));
      return false;
    } finally { operation.finish(); }
  }, [store, beginExclusive]);

  /** No UI should invoke this until its compatibility report has been reviewed. */
  const transitionTarget = useCallback(async (target: StudioTarget, expectedSourceToken: string): Promise<boolean> => {
    if (!readyRef.current || blocked.current || !editAuthority.current || editAuthority.current.getToken() !== expectedSourceToken) return false;
    // Capture before awaiting; later caller changes cannot alter the reviewed proposal.
    let selected: StudioTarget;
    try {
      const current = currentDocument();
      const checked = unwrap(validateStudioDocument({ ...current, schemaVersion: 2, targetPolicy: {
        policyVersion: 1, checkpoint: { documentId: current.documentId, revision: current.revision, historyEpoch: current.historyEpoch }, target,
      } }));
      selected = checked.targetPolicy!.target;
    } catch (reason) { setError(message(reason, 'The target proposal is invalid.')); return false; }
    const operation = beginExclusive();
    if (!operation) return false;
    const sameSource = () => editAuthority.current?.getToken() === expectedSourceToken;
    try {
      if (!await saveInternal(true)) throw new Error('Save or recover current work before changing the target policy.');
      if (!operation.alive()) return false;
      if (!sameSource()) throw new Error('The build changed before target activation. Review the proposal again.');
      const previous = active.current;
      if (!previous || studioContentKey(currentDocument()) !== committedContent.current) throw new Error('The current build has not been fully preserved.');
      const candidate = unwrap(validateStudioDocument({ ...previous.document, schemaVersion: 2,
        revision: previous.token.revision + 1, savedAt: new Date().toISOString(), historyEpoch: createStudioId('history'),
        targetPolicy: { policyVersion: 1, checkpoint: { documentId: previous.document.documentId,
          revision: previous.document.revision, historyEpoch: previous.document.historyEpoch }, target: selected },
      }));
      const committed = unwrap(await store.transitionPolicy(candidate, previous.token, { signal: operation.signal, isSourceCurrent: sameSource }));
      if (!operation.alive()) return false;
      if (!sameSource()) {
        blocked.current = true;
        throw new Error('The target policy was saved, but the live editor changed during activation. Preserve these unsaved edits as a copy before continuing.');
      }
      generation.current++;
      acceptActive(committed);
      return true;
    } catch (reason) {
      if (operation.alive()) {
        if (isConflict(reason)) blocked.current = true;
        setError(message(reason, 'The target policy was not activated.')); setPhase('failed');
      }
      return false;
    } finally { operation.finish(); }
  }, [store, beginExclusive, saveInternal, currentDocument, acceptActive]);

  const saveNamedCopy = useCallback(async (name: string, description: string): Promise<boolean> => {
    if (!readyRef.current) return false;
    const operation = beginExclusive();
    if (!operation) return false;
    try {
      const snapshot = currentDocument();
      const copy = asCopy({ ...snapshot, world: { ...snapshot.world, worldName: name, description } });
      unwrap(await store.stageCandidate(copy, [], { signal: operation.signal }));
      // Saving a named snapshot does not move the active pointer or mark its edits saved.
      return operation.alive();
    } catch (reason) {
      if (operation.alive()) setError(message(reason, 'The named project copy could not be saved.'));
      return false;
    } finally { operation.finish(); }
  }, [store, beginExclusive, currentDocument]);

  const readCandidates = useCallback(async (alive: () => boolean, limit: number, verifiedOnly = false): Promise<RecoveryChoice[]> => {
    const found: RecoveryChoice[] = [];
    const items = unwrap(await store.listCandidates(limit));
    for (const item of items) {
      if (!alive()) return [];
      if (verifiedOnly && item.state === 'staged') continue;
      const candidate = unwrap(await store.loadCandidate(item.candidateId));
      if (!alive()) return [];
      found.push({ id: item.candidateId, label: `${candidate.document.world.worldName} · ${item.createdAt}`, document: candidate.document, sources: candidate.legacySources });
    }
    return found;
  }, [store]);
  const listNamedCopies = useCallback(async (): Promise<RecoveryChoice[]> => {
    const session = generation.current;
    const alive = () => mounted.current && generation.current === session;
    try { return await readCandidates(alive, 100, true); }
    catch (reason) { if (alive()) setError(message(reason, 'Saved project copies are unavailable.')); return []; }
  }, [readCandidates]);

  // Browsing is read-only and does not acquire the mutation mutex. A separate
  // cancellation generation prevents old page/selection reads replacing a new one.
  const beginRecoveryRead = useCallback(() => {
    recoveryController.current?.abort();
    const controller = new AbortController();
    recoveryController.current = controller;
    const session = generation.current;
    setRecoveryOpen(true); setRecoveryBusy(true); setRecoveryError(null);
    return {
      signal: controller.signal,
      alive: () => mounted.current && generation.current === session && !controller.signal.aborted && recoveryController.current === controller,
      finish: () => {
        if (recoveryController.current !== controller) return;
        recoveryController.current = null;
        if (mounted.current && generation.current === session) setRecoveryBusy(false);
      },
    };
  }, []);
  const browseRecovery = useCallback(async (kind: 'revision' | 'candidate', cursors: (IDBValidKey | null)[] = [null]) => {
    if (!mounted.current) return;
    const operation = beginRecoveryRead();
    setRecoveryKind(kind); setRecoveryPage(null); setRecoverySelected(null);
    try {
      const page = unwrap(await store.listRecoveryPage({ kind, after: cursors.at(-1) }, { signal: operation.signal }));
      if (operation.alive()) { setRecoveryPage(page); setRecoveryCursors(cursors); }
    } catch (reason) { if (operation.alive()) setRecoveryError(message(reason, 'Recovery records could not be listed. They were not treated as empty.')); }
    finally { operation.finish(); }
  }, [store, beginRecoveryRead]);
  const selectRecovery = useCallback(async (ref: RecoveryRecordRef) => {
    if (!mounted.current) return;
    const operation = beginRecoveryRead();
    setRecoverySelected(null);
    try {
      const selected = unwrap(await store.readRecoveryRecord(ref, { signal: operation.signal }));
      if (operation.alive()) setRecoverySelected(selected);
    } catch (reason) { if (operation.alive()) setRecoveryError(message(reason, 'That record could not be read. No empty project was substituted.')); }
    finally { operation.finish(); }
  }, [store, beginRecoveryRead]);
  const openRecovery = useCallback(() => browseRecovery('revision'), [browseRecovery]);
  const nextRecoveryPage = useCallback(() => recoveryPage?.nextCursor != null
    ? browseRecovery(recoveryKind, [...recoveryCursors, recoveryPage.nextCursor]) : Promise.resolve(), [browseRecovery, recoveryKind, recoveryPage, recoveryCursors]);
  const previousRecoveryPage = useCallback(() => recoveryCursors.length > 1
    ? browseRecovery(recoveryKind, recoveryCursors.slice(0, -1)) : Promise.resolve(), [browseRecovery, recoveryKind, recoveryCursors]);
  const dismissRecovery = useCallback(() => {
    recoveryController.current?.abort(); recoveryController.current = null;
    setRecoveryOpen(false); setRecoveryBusy(false); setRecoveryPage(null); setRecoverySelected(null); setRecoveryError(null); setChoices([]);
  }, []);
  const restoreSelectedRecovery = useCallback(() => recoverySelected?.document
    ? restoreCopy(recoverySelected.document, recoverySelected.sources) : Promise.resolve(false), [recoverySelected, restoreCopy]);
  const downloadRecovery = useCallback((part: 'document' | 'envelope' | 'pointer' | 'source' | 'encoded-document' | 'source-envelope', sourceIndex = 0) => {
    if (!mounted.current || recoveryController.current || !recoverySelected) return;
    if (part === 'source-envelope') {
      try { downloadStudioJson(encodeStudioRecoverySourceEnvelope(recoverySelected.sources[sourceIndex]), `LFS-recovery-source-${sourceIndex + 1}-envelope.json`); }
      catch (reason) { setRecoveryError(message(reason, 'The original-source envelope could not be downloaded. The stored source is unchanged.')); }
      return;
    }
    if (part === 'encoded-document') {
      const bytes = recoverySelected.encodedDocumentBytes;
      if (!bytes) { setRecoveryError('Stored document bytes are unavailable. No empty file was substituted.'); return; }
      try {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
        const link = document.createElement('a'); link.href = url; link.download = 'LFS-recovery-encoded-document.bin';
        link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (reason) { setRecoveryError(message(reason, 'Stored bytes could not be downloaded. The record is unchanged.')); }
      return;
    }
    if (recoverySelected.unsafeTextParts.includes(part === 'source' ? `source:${sourceIndex}` : part)) {
      setRecoveryError('Direct UTF-8 download would alter damaged text. Download its JSON envelope to preserve escaped code units, when available.'); return;
    }
    const raw = part === 'document' ? recoverySelected.json : part === 'envelope' ? recoverySelected.envelopeJson
      : part === 'pointer' ? recoverySelected.activePointerJson : recoverySelected.sources[sourceIndex]?.raw;
    if (raw == null) { setRecoveryError('That text part is unavailable; no empty download was substituted.'); return; }
    try {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `LFS-recovery-${part}${part === 'source' ? `-${sourceIndex + 1}` : ''}.json`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setRecoveryError(message(reason, 'Recovery download could not be started. The stored record remains unchanged.')); }
  }, [recoverySelected]);
  const choose = useCallback((id: string) => {
    const choice = choices.find(item => item.id === id);
    return choice ? restoreCopy(choice.document, choice.sources) : Promise.resolve(false);
  }, [choices, restoreCopy]);
  const download = (value: unknown, filename: string) => {
    try { downloadStudioJson(value, filename); }
    catch (reason) { setError(message(reason, 'The recovery download could not be started. Keep this project open.')); }
  };
  return {
    ready, busy, phase, error, choices, savedAt, save, restoreCopy, forkCurrent, saveNamedCopy, listNamedCopies, choose, openRecovery,
    recoveryOpen, recoveryKind, recoveryPage, recoverySelected, recoveryError, recoveryBusy,
    recoveryPageNumber: recoveryCursors.length, browseRecovery, selectRecovery, nextRecoveryPage, previousRecoveryPage,
    restoreSelectedRecovery, downloadRecovery,
    currentDocument, preserveResourceCandidate, transitionTarget,
    importDefaults,
    retry: () => {
      if (busyRef.current) return;
      if (readyRef.current) {
        if (blocked.current) setError('Another writer changed the saved project. Keep these unsaved edits as a separate project or download them before opening another copy.');
        else void save();
      } else {
        editAuthority.current?.setWritable(false);
        hydrationController.current?.abort();
        setAttempt(value => value + 1);
      }
    },
    dismissRecovery,
    downloadCurrent: () => download(currentDocument(), 'LFS-Block-Studio-recovery.lfsproj.json'),
    downloadOriginals: () => download({ format: 'lfs-legacy-recovery', sources: sources.current }, 'LFS-Block-Studio-originals.json'),
    startSeparate: () => restoreCopy(initial.current!, sources.current),
  };
}
