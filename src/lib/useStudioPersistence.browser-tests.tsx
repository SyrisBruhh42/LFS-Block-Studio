import { candidateJavaTarget } from './studioTargetPolicy';
/** React/IndexedDB race contracts. Run each named case in a NEW disposable browser
 * context at /__studio-hook-contract-tests__ with __STUDIO_TEST_DISPOSABLE_CONTEXT__
 * set true by the runner. Never run this harness in a user's application profile.
 * Deferred wrappers pause real store calls; no fake storage or production injection.
 */
import React, { StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useStudioPersistence, type StudioAuthoredContent, type StudioEditAuthority } from './useStudioPersistence';
import { StudioDocumentStore, STUDIO_DOCUMENT_DB, type StoreResult } from './studioDocumentStore';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import type { StudioDocument } from './studioDocument';
import { StudioEditorSession, type StudioEditorResult } from './studioEditorSession';

export interface HookBrowserResult { name: string; ok: boolean; error?: string }
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function unbox<T>(value: StoreResult<T>): T { if (!value.ok) throw new Error(value.error.message); return value.value; }
function authored(d: StudioDocument): StudioAuthoredContent {
  const { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions } = d;
  return { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions };
}
async function bounded<T>(promise: Promise<T>, label: string, timeout = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeout); })]); }
  finally { clearTimeout(timer!); }
}
async function until(check: () => unknown, label: string): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error(`Timeout: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
type Hook = ReturnType<typeof useStudioPersistence>;
function mount(strict = false) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  let latest: Hook;
  let change: React.Dispatch<React.SetStateAction<StudioAuthoredContent>>;
  let restores = 0;
  let unmounted = false;
  function Harness() {
    const [content, setContent] = useState(() => authored(makeStudioDocument()));
    change = setContent;
    latest = useStudioPersistence({ content, onRestore: d => { restores++; setContent(authored(d)); }, autosaveEnabled: false, autosaveIntervalSec: 30 });
    return null;
  }
  flushSync(() => root.render(strict ? <StrictMode><Harness /></StrictMode> : <Harness />));
  return {
    get api() { return latest!; }, get restores() { return restores; },
    async ready() { await until(() => latest?.ready || latest?.phase === 'failed', 'hook hydration'); expect(latest.ready, latest.error ?? 'Hydration failed.'); },
    edit(name: string) { flushSync(() => change(current => ({ ...current, world: { ...current.world, worldName: name } }))); },
    change(fn: (current: StudioAuthoredContent) => StudioAuthoredContent) { flushSync(() => change(fn)); },
    unmount() { if (!unmounted) { unmounted = true; flushSync(() => root.unmount()); host.remove(); } },
  };
}
/** Deliberately separates synchronous editor state from React publication. */
function mountAuthority(strict = false) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  let current = authored(makeStudioDocument());
  let token = 0, restores = 0;
  let writable = false, locked = false, unmounted = false;
  let latest: Hook;
  let publish: React.Dispatch<React.SetStateAction<StudioAuthoredContent>>;
  const authority: StudioEditAuthority = {
    readContent: () => current,
    getToken: () => `session-edit-epoch:${token}`,
    setWritable: value => { writable = value; },
    acquireLock: () => {
      if (locked) return null;
      locked = true;
      let released = false;
      return () => { if (!released) { released = true; locked = false; } };
    },
  };
  function Harness() {
    const [content, setContent] = useState(current);
    publish = setContent;
    latest = useStudioPersistence({
      content, editAuthority: authority,
      onRestore: d => { restores++; token++; current = authored(d); setContent(current); },
      autosaveEnabled: false, autosaveIntervalSec: 30,
    });
    return null;
  }
  flushSync(() => root.render(strict ? <StrictMode><Harness /></StrictMode> : <Harness />));
  const changeName = (name: string, publishNow: boolean) => {
    current = { ...current, world: { ...current.world, worldName: name } }; token++;
    if (publishNow) flushSync(() => publish(current));
  };
  return {
    get api() { return latest!; }, get restores() { return restores; },
    get writable() { return writable; }, get locked() { return locked; },
    get token() { return authority.getToken(); },
    async ready() { await until(() => latest?.ready || latest?.phase === 'failed', 'authority hydration'); expect(latest.ready, latest.error ?? 'Hydration failed.'); },
    edit(name: string, publishNow = true) { if (!writable || locked) return false; changeName(name, publishNow); return true; },
    // Simulates a broken/legacy mutation route. The token remains honest even
    // when content returns to its original value and no React render occurs.
    forceName(name: string) { changeName(name, false); },
    removeOptionalFields() {
      if (!writable || locked) return false;
      const { description: _description, ...world } = current.world;
      current = { ...current, world, extensions: undefined, lightingConfig: undefined }; token++; return true;
    },
    unmount() { if (!unmounted) { unmounted = true; flushSync(() => root.unmount()); host.remove(); } },
  };
}
function accepted(result: StudioEditorResult): void {
  if (result.status === 'rejected') throw new Error(result.message ?? 'Editor authority rejected the operation.');
}
/** Real controller, real hook, real IndexedDB. Only store timing is deferred by cases. */
function mountEditor(strict = false) {
  const editor = new StudioEditorSession(makeStudioDocument());
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  let latest: Hook, restores = 0, acknowledgements = 0, unmounted = false;
  const authority: StudioEditAuthority = {
    readContent: () => authored(editor.getDocument()),
    getToken: () => JSON.stringify(editor.getToken()),
    setWritable: editor.setWritable,
    acquireLock: () => {
      const handle = editor.beginExclusive();
      return handle ? () => { editor.endExclusive(handle); } : null;
    },
    acknowledgeSaved: (document, sourceToken) => {
      accepted(editor.acknowledgeDurable(document, JSON.parse(sourceToken))); acknowledgements++;
    },
  };
  function Harness() {
    const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
    latest = useStudioPersistence({
      content: authored(snapshot.document), editAuthority: authority,
      onRestore: document => { accepted(editor.installVerifiedDocument(document)); restores++; },
      autosaveEnabled: false, autosaveIntervalSec: 30,
    });
    return null;
  }
  flushSync(() => root.render(strict ? <StrictMode><Harness /></StrictMode> : <Harness />));
  return {
    editor, get api() { return latest!; }, get restores() { return restores; }, get acknowledgements() { return acknowledgements; },
    async ready() { await until(() => latest?.ready || latest?.phase === 'failed', 'real editor hydration'); expect(latest.ready, latest.error ?? 'Hydration failed.'); },
    unmount() { if (!unmounted) { unmounted = true; flushSync(() => root.unmount()); host.remove(); } },
  };
}
function deferMethod(name: 'save' | 'stageCandidate' | 'loadCandidate' | 'promoteCandidate' | 'transitionPolicy' | 'listRecoveryPage' | 'readRecoveryRecord', timing: 'before' | 'after' = 'before') {
  const prototype = StudioDocumentStore.prototype as any;
  const original = prototype[name];
  let enteredResolve!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolve => { enteredResolve = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  let armed = true; let capturedArgs: any[] = [];
  prototype[name] = async function (...args: any[]) {
    if (!armed) return original.apply(this, args);
    armed = false; capturedArgs = args;
    const result = timing === 'after' ? await original.apply(this, args) : undefined;
    enteredResolve(); await released;
    return timing === 'after' ? result : original.apply(this, args);
  };
  return { entered: () => bounded(entered, `enter ${name}`), release, get args() { return capturedArgs; }, restore() { release(); prototype[name] = original; } };
}
function target(name = 'Restored target') { const d = makeStudioDocument('target'); d.world.worldName = name; return d; }
const cases: Record<string, () => Promise<void>> = {
  'StrictMode hydrates once and initializes one verified project': async () => {
    const h = mount(true); const inspect = new StudioDocumentStore();
    try {
      await h.ready();
      expect(h.restores === 1, `Restored ${h.restores} times.`);
      expect(h.api.phase === 'saved' && !h.api.error, 'Fresh hydration was not saved.');
      expect(unbox(await inspect.listCandidates()).length === 1, 'StrictMode staged multiple initial projects.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture', 'Wrong active project.');
    } finally { h.unmount(); inspect.close(); }
  },
  'double restore submission activates exactly one copy': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('stageCandidate');
      const api = h.api; const first = api.restoreCopy(target()); const second = api.restoreCopy(target('Second click'));
      expect(await bounded(second, 'second restore') === false, 'Second submission was accepted.');
      await deferred.entered(); deferred.release();
      expect(await bounded(first, 'first restore'), 'First restore failed.');
      expect(unbox(await inspect.listCandidates()).length === 2, 'More than one replacement was staged.');
      expect(h.api.currentDocument().world.worldName === 'Restored target', 'Wrong copy opened.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'edits during prerequisite save stop replacement and remain open': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); h.edit('Saved earlier edit'); deferred = deferMethod('save');
      const pending = h.api.restoreCopy(target()); await deferred.entered(); h.edit('Newer unsaved edit'); deferred.release();
      expect(await bounded(pending, 'restore after save') === false, 'Restore discarded edits arriving during save.');
      expect(h.api.currentDocument().world.worldName === 'Newer unsaved edit', 'Newer edit was lost.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Saved earlier edit', 'Prerequisite save did not preserve its captured content.');
      expect(unbox(await inspect.listCandidates()).length === 1, 'Replacement was staged despite newer unsaved content.');
      await until(() => h.api.phase === 'failed', 'visible unsaved failure');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'edits during candidate verification retain candidate without activating it': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('loadCandidate');
      const pending = h.api.restoreCopy(target()); await deferred.entered(); h.edit('Edit during verification'); deferred.release();
      expect(await bounded(pending, 'restore after verification') === false, 'Stale candidate replaced newer edits.');
      expect(h.api.currentDocument().world.worldName === 'Edit during verification', 'Edit was replaced.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture', 'Candidate became active.');
      expect(unbox(await inspect.listCandidates()).some(c => c.worldName === 'Restored target' && c.state === 'verified'), 'Prepared copy was not retained.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'edits while promotion awaits completion stay open and can fork from fresh authority': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); const first = unbox(await inspect.loadActive())!;
      deferred = deferMethod('promoteCandidate', 'after');
      const pending = h.api.restoreCopy(target()); await deferred.entered();
      const promoted = unbox(await inspect.loadActive())!; expect(promoted.document.world.worldName === 'Restored target', 'Fixture did not reach actual committed promotion.');
      h.edit('Late local edit'); deferred.release();
      expect(await bounded(pending, 'late promotion response') === false, 'Late callback replaced newer edits.');
      expect(h.api.currentDocument().world.worldName === 'Late local edit', 'Local edit lost.');
      expect(await h.api.save() === false, 'Stale authority was allowed to save.');
      deferred.restore(); deferred = undefined;
      expect(await bounded(h.api.forkCurrent(), 'fork late edit'), 'Fresh-token fork failed.');
      const fork = unbox(await inspect.loadActive())!;
      expect(fork.document.world.worldName === 'Late local edit', 'Fork did not preserve late edit.');
      expect(fork.document.documentId !== first.document.documentId && fork.document.documentId !== promoted.document.documentId, 'Fork reused an existing project ID.');
      expect((await inspect.loadRevision(first.document.documentId, 0)).ok && (await inspect.loadRevision(promoted.document.documentId, 0)).ok, 'Prior saved records disappeared.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'cross-writer conflict preserves unsaved work and fork saves it separately': async () => {
    const h = mount(); const other = new StudioDocumentStore();
    try {
      await h.ready(); const initial = unbox(await other.loadActive())!;
      const otherDocument = structuredClone(initial.document); otherDocument.revision++; otherDocument.world.worldName = 'Other writer';
      unbox(await other.save(otherDocument, initial.token)); h.edit('My unsaved work');
      expect(await h.api.save() === false, 'Stale save was accepted.');
      await until(() => h.api.phase === 'failed', 'conflict failure');
      expect(h.api.currentDocument().world.worldName === 'My unsaved work', 'Conflict changed local content.');
      expect(await h.api.forkCurrent(), 'Fork did not recover from conflict.');
      const fork = unbox(await other.loadActive())!;
      expect(fork.document.world.worldName === 'My unsaved work' && fork.document.documentId !== initial.document.documentId, 'Fork did not use a separate ID.');
      expect(unbox(await other.loadRevision(initial.document.documentId, 1)).world.worldName === 'Other writer', 'Other writer record was overwritten.');
    } finally { h.unmount(); other.close(); }
  },
  'unmount aborts pending save and ignores its callback': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); h.edit('Must remain unsaved'); deferred = deferMethod('save');
      const pending = h.api.save(); await deferred.entered(); const signal = deferred.args[2]?.signal;
      h.unmount(); expect(signal?.aborted === true, 'Unmount did not cancel save signal.'); deferred.release();
      expect(await bounded(pending, 'unmounted save') === false, 'Unmounted save reported success.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture', 'Aborted save changed active document.');
      expect(h.restores === 1, 'Unmounted callback restored content.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'retry cancels old hydration and stale candidate cannot activate': async () => {
    const deferred = deferMethod('stageCandidate'); const h = mount(); const inspect = new StudioDocumentStore();
    try {
      await deferred.entered(); const signal = deferred.args[2]?.signal;
      flushSync(() => h.api.retry());
      expect(signal?.aborted === true, 'Retry did not cancel prior hydration.');
      await h.ready(); deferred.release();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(h.restores === 1, 'Stale hydration callback applied.');
      expect(unbox(await inspect.listCandidates()).length === 1, 'Cancelled hydration wrote a candidate.');
      expect(h.api.phase === 'saved' && !h.api.error, 'Stale hydration changed current status.');
    } finally { deferred.restore(); h.unmount(); inspect.close(); }
  },
  'unmount after committed promotion cannot restore into the old component': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('promoteCandidate', 'after');
      const pending = h.api.restoreCopy(target()); await deferred.entered(); h.unmount(); deferred.release();
      expect(await bounded(pending, 'unmounted promotion') === false, 'Unmounted replacement claimed UI acceptance.');
      expect(h.restores === 1, 'Late callback restored into unmounted component.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Restored target', 'Completed transaction was incorrectly rolled back.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'failed and unexpectedly rejected saves never claim saved or enable replacement': async () => {
    const h = mount(); const inspect = new StudioDocumentStore(); const original = StudioDocumentStore.prototype.save;
    try {
      await h.ready(); const savedAt = h.api.savedAt; h.edit('Unsaved after failure');
      StudioDocumentStore.prototype.save = async () => ({ ok: false, error: { code: 'quota', message: 'Fixture quota refusal.' } });
      expect(await h.api.save() === false, 'Quota failure claimed success.'); await until(() => h.api.phase === 'failed', 'quota failure');
      expect(h.api.savedAt === savedAt, 'Quota failure updated save receipt.');
      expect(await h.api.restoreCopy(target()) === false, 'Replacement bypassed failed prerequisite save.');
      StudioDocumentStore.prototype.save = async () => { throw new Error('Unexpected rejected save.'); };
      expect(await h.api.save() === false, 'Unexpected rejection escaped or claimed success.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture', 'Failed save changed active document.');
      expect(h.api.currentDocument().world.worldName === 'Unsaved after failure', 'Failure lost local work.');
    } finally { StudioDocumentStore.prototype.save = original; h.unmount(); inspect.close(); }
  },
  'named copy preserves all fields without moving active pointer or save receipt': async () => {
    const h = mount(); const inspect = new StudioDocumentStore();
    try {
      await h.ready(); const initial = unbox(await inspect.loadActive())!; const receipt = h.api.savedAt;
      h.change(c => ({ ...c, world: { ...c.world, worldName: 'Unsaved scene' }, extensions: { opaque: { keep: true } } }));
      await until(() => h.api.phase === 'dirty', 'dirty state');
      expect(await h.api.saveNamedCopy('Named full copy', 'Named description'), 'Named copy failed.');
      expect(unbox(await inspect.loadActive())?.token.activationId === initial.token.activationId, 'Named copy changed active pointer.');
      expect(h.api.savedAt === receipt && h.api.phase === 'dirty', 'Named copy falsely marked current project saved.');
      const copies = await h.api.listNamedCopies(); const named = copies.find(c => c.document.world.worldName === 'Named full copy');
      expect(named?.document.world.description === 'Named description', 'Named description missing.');
      expect(JSON.stringify(named.document.extensions) === JSON.stringify({ opaque: { keep: true } }), 'Named copy lost opaque fields.');
      expect(named.document.documentId !== initial.document.documentId, 'Named copy reused active identity.');
    } finally { h.unmount(); inspect.close(); }
  },
  'document-only properties survive partial UI capture and reset on explicit replacement': async () => {
    const h = mount(); const inspect = new StudioDocumentStore();
    try {
      await h.ready(); const defaultsFunction = h.api.importDefaults; const defaults = h.api.importDefaults(); defaults.world.worldName = 'Mutated external default';
      const full = target(); full.world.description = 'Hidden description'; full.extensions = { target: { keep: true } };
      expect(await h.api.restoreCopy(full), 'Metadata fixture failed to restore.');
      h.change(c => { const { description, ...world } = c.world; return { ...c, world: { ...world, worldName: 'Changed by partial UI' }, extensions: undefined }; });
      expect(h.api.importDefaults === defaultsFunction, 'importDefaults reference changed.');
      expect(h.api.importDefaults().world.worldName === 'Fixture', 'Fresh defaults were mutated by caller or replacement.');
      expect(await h.api.save(), 'Partial UI capture failed to save.');
      const saved = unbox(await inspect.loadActive())!.document;
      expect(saved.world.description === 'Hidden description' && !!saved.extensions?.target, 'Partial UI capture erased document properties.');
      const clean = target('Clean legacy copy'); delete clean.world.description; delete clean.extensions; delete clean.lightingConfig;
      expect(await h.api.restoreCopy(clean), 'Clean copy failed to restore.');
      const current = h.api.currentDocument();
      expect(current.world.description === undefined && current.extensions === undefined && current.lightingConfig === undefined, 'Replacement inherited old optional properties.');
    } finally { h.unmount(); inspect.close(); }
  },
  'authority stays nonwritable through hydration and retry, then opens only the accepted session': async () => {
    const deferred = deferMethod('stageCandidate'); const h = mountAuthority(true);
    try {
      expect(!h.writable && !h.edit('Forbidden during hydration'), 'Hydration admitted an edit.');
      await deferred.entered(); const signal = deferred.args[2]?.signal;
      flushSync(() => h.api.retry());
      expect(signal?.aborted && !h.writable, 'Retry did not synchronously cancel and gate the old hydration.');
      await h.ready(); deferred.release();
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(h.restores === 1 && h.writable && h.edit('Accepted session edit'), 'Verified restore did not open exactly one writable session.');
      h.unmount(); expect(!h.writable && !h.edit('Forbidden after unmount'), 'Unmount left editor authority writable.');
    } finally { deferred.restore(); h.unmount(); }
  },
  'authority supplies synchronous content before React publishes it and allows intentional metadata removal': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore();
    try {
      await h.ready(); const apiBeforeRender = h.api;
      expect(h.edit('Synchronous edit before render', false), 'Initial edit was blocked.');
      expect(apiBeforeRender.currentDocument().world.worldName === 'Synchronous edit before render', 'Capture used stale React content.');
      expect(await apiBeforeRender.save(), 'Synchronous edit failed to save.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Synchronous edit before render', 'Store saved stale React content.');
      expect(h.removeOptionalFields(), 'Metadata edit was blocked.');
      const live = h.api.currentDocument();
      expect(live.world.description === undefined && live.lightingConfig === undefined && live.extensions === undefined, 'Authority absence inherited old metadata.');
      expect(await h.api.save(), 'Authoritative metadata removal failed to save.');
      const saved = unbox(await inspect.loadActive())!.document;
      expect(saved.world.description === undefined && saved.lightingConfig === undefined, 'Removed metadata reappeared in durable content.');
    } finally { h.unmount(); inspect.close(); }
  },
  'ordinary authority saves permit later edits and never overwrite them on completion': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); expect(h.edit('Captured save', false), 'Initial edit was blocked.'); deferred = deferMethod('save');
      const pending = h.api.save(); await deferred.entered();
      expect(!h.locked && h.edit('Later synchronous edit', false), 'Ordinary save locked out later edits.');
      deferred.release(); expect(await bounded(pending, 'authority ordinary save'), 'Save was rejected solely because a later edit changed the token.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Captured save', 'Save did not retain its captured snapshot.');
      expect(h.api.currentDocument().world.worldName === 'Later synchronous edit', 'Save response overwrote newer authority content.');
      await until(() => h.api.phase === 'dirty', 'newer authoritative edit remains dirty');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'replacement locks authority synchronously through prerequisite save and accepts restore token rotation': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); expect(h.edit('Preserve first'), 'Initial edit was blocked.'); const token = h.token;
      deferred = deferMethod('save'); const pending = h.api.restoreCopy(target());
      expect(h.locked && !h.edit('Blocked same-stack edit', false), 'Replacement lock was delayed until React rendered.');
      await deferred.entered(); expect(!h.edit('Blocked while saving'), 'Prerequisite save lost the replacement lock.');
      deferred.release(); expect(await bounded(pending, 'authority replacement'), 'Intentional restore token rotation was treated as stale.');
      expect(h.restores === 2 && h.token !== token && !h.locked && h.writable, 'Accepted replacement did not release its lock into the new session.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Restored target', 'Wrong replacement was saved.');
      expect(h.edit('New session edit'), 'Newly accepted session remained locked.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'named authority copies hold an exclusion and release it on success and storage failure': async () => {
    const h = mountAuthority(); let deferred: ReturnType<typeof deferMethod> | undefined;
    const original = StudioDocumentStore.prototype.stageCandidate;
    try {
      await h.ready(); deferred = deferMethod('stageCandidate'); const pending = h.api.saveNamedCopy('Named authority snapshot', '');
      expect(h.locked && !h.edit('Blocked named copy'), 'Named copy did not lock synchronously.');
      expect(await h.api.saveNamedCopy('Duplicate click', '') === false, 'Second named copy bypassed exclusion.');
      await deferred.entered(); deferred.release(); expect(await bounded(pending, 'named authority copy'), 'Named copy failed.');
      expect(!h.locked && h.writable, 'Successful named copy retained its lock.');
      deferred.restore(); deferred = undefined;
      StudioDocumentStore.prototype.stageCandidate = async () => { throw new Error('Fixture named-copy failure.'); };
      expect(await h.api.saveNamedCopy('Failure copy', '') === false, 'Failed copy claimed success.');
      expect(!h.locked && h.writable && h.edit('Edit after failed copy'), 'Failed named copy stranded editor authority.');
    } finally { deferred?.restore(); StudioDocumentStore.prototype.stageCandidate = original; h.unmount(); }
  },
  'equal-content ABA during authority candidate verification prevents activation': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); const token = h.token; deferred = deferMethod('loadCandidate');
      const pending = h.api.restoreCopy(target()); await deferred.entered();
      h.forceName('Transient bypass edit'); h.forceName('Fixture');
      expect(h.token !== token && h.api.currentDocument().world.worldName === 'Fixture', 'Fixture did not create equal-content ABA.');
      deferred.release(); expect(await bounded(pending, 'authority pre-promotion ABA') === false, 'Equal content hid the changed edit token.');
      expect(h.restores === 1 && !h.locked && h.writable, 'Stale replacement applied or stranded lock.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture', 'Stale prepared copy was promoted.');
      expect(unbox(await inspect.listCandidates()).some(c => c.worldName === 'Restored target' && c.state === 'verified'), 'Prepared recovery copy was lost.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'equal-content ABA after authority promotion preserves memory and requires a fresh fork': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('promoteCandidate', 'after');
      const pending = h.api.restoreCopy(target()); await deferred.entered();
      h.forceName('Transient post-commit edit'); h.forceName('Fixture'); deferred.release();
      expect(await bounded(pending, 'authority post-promotion ABA') === false, 'Equal content allowed a stale committed copy to replace live authority.');
      expect(h.restores === 1 && h.api.currentDocument().world.worldName === 'Fixture' && !h.locked, 'Late callback overwrote or locked live work.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Restored target', 'Committed promotion was rolled back.');
      expect(await h.api.save() === false, 'Stale persistence pointer could save after committed ABA.');
      deferred.restore(); deferred = undefined;
      expect(await h.api.forkCurrent(), 'Fresh fork could not preserve authority after stale activation.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Fixture' && h.writable && !h.locked, 'Fork did not establish the retained editor content.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'authority unmount aborts exclusion and release cannot reopen editing': async () => {
    const h = mountAuthority(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('stageCandidate'); const pending = h.api.saveNamedCopy('Pending copy', '');
      await deferred.entered(); const signal = deferred.args[2]?.signal;
      h.unmount(); expect(signal?.aborted && !h.writable, 'Unmount did not abort and gate the editor.');
      deferred.release(); expect(await bounded(pending, 'unmounted authority copy') === false, 'Unmounted copy reported success.');
      expect(!h.locked && !h.writable && !h.edit('Forbidden post-release edit'), 'Release reopened an unmounted editor.');
    } finally { deferred?.restore(); h.unmount(); }
  },
  'real editor hydration gates editing and recovery browsing preserves concurrent edits': async () => {
    let deferred: ReturnType<typeof deferMethod> | undefined = deferMethod('stageCandidate');
    const h = mountEditor(true); const inspect = new StudioDocumentStore();
    try {
      expect(!h.editor.getSnapshot().writable, 'Controller opened before hydration.');
      expect(h.editor.setWorldField('worldName', 'Too early').status === 'rejected', 'Controller accepted an edit before hydration.');
      await deferred.entered(); deferred.release(); await h.ready();
      expect(h.restores === 1 && h.editor.getSnapshot().writable, 'StrictMode did not install exactly one writable editor session.');
      const stored = unbox(await inspect.loadActive())!.document;
      expect(h.editor.getDocument().documentId === stored.documentId && h.editor.getDocument().savedAt === stored.savedAt, 'Controller did not receive the verified durable envelope.');
      deferred.restore(); deferred = deferMethod('listRecoveryPage');
      const pending = h.api.openRecovery(); await deferred.entered();
      expect(!h.editor.getSnapshot().exclusive, 'Read-only browsing unnecessarily excluded saving/editing.');
      accepted(h.editor.setWorldField('worldName', 'During recovery'));
      deferred.release(); await bounded(pending, 'real controller recovery listing');
      expect(!h.editor.getSnapshot().exclusive && h.editor.getSnapshot().writable, 'Read-only recovery changed editor writability.');
      expect(h.editor.getDocument().world.worldName === 'During recovery', 'Recovery browsing replaced concurrent content.');
      h.unmount(); expect(!h.editor.getSnapshot().writable, 'Real controller remained writable after unmount.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'real editor save receipt advances durable metadata without changing later edits, tokens or history': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Captured A'));
      deferred = deferMethod('save'); const pending = h.api.save(); await deferred.entered();
      accepted(h.editor.setWorldField('worldName', 'Transient B')); accepted(h.editor.undo());
      accepted(h.editor.setWorldField('worldName', 'Later C'));
      const token = JSON.stringify(h.editor.getToken());
      deferred.release(); expect(await bounded(pending, 'real controller save with later edits'), 'Save receipt rejected later edits in the same session.');
      const durable = unbox(await inspect.loadActive())!.document;
      expect(durable.world.worldName === 'Captured A' && durable.revision === 1, 'Store saved the wrong captured revision.');
      expect(h.acknowledgements === 1 && h.editor.getDocument().revision === durable.revision && h.editor.getDocument().savedAt === durable.savedAt, 'Controller durable envelope was not acknowledged.');
      expect(h.editor.getDocument().world.worldName === 'Later C' && JSON.stringify(h.editor.getToken()) === token, 'Receipt changed newer authored content or live token.');
      await until(() => h.api.phase === 'dirty', 'later controller content stays dirty');
      accepted(h.editor.undo()); expect(h.editor.getDocument().world.worldName === 'Captured A', 'Receipt lost the immediate Undo predecessor.');
      await until(() => h.api.phase === 'saved', 'Undo returned to committed content');
      accepted(h.editor.undo()); expect(h.editor.getDocument().world.worldName === 'Fixture', 'Receipt cleared older Undo history.');
      accepted(h.editor.redo()); accepted(h.editor.redo());
      expect(h.editor.getDocument().world.worldName === 'Later C' && h.editor.getDocument().revision === durable.revision && h.editor.getDocument().savedAt === durable.savedAt, 'History rewound durable metadata or lost Redo.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'real editor Undo during an ordinary save survives its receipt and Redo returns to saved content': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Pending edit'));
      deferred = deferMethod('save'); const pending = h.api.save(); await deferred.entered();
      accepted(h.editor.undo()); const token = JSON.stringify(h.editor.getToken());
      deferred.release(); expect(await bounded(pending, 'real controller save after Undo'), 'Undo incorrectly invalidated an ordinary save acknowledgement.');
      expect(h.editor.getDocument().world.worldName === 'Fixture' && JSON.stringify(h.editor.getToken()) === token && h.editor.getSnapshot().canRedo, 'Save receipt replaced Undo or cleared Redo.');
      expect(h.editor.getDocument().revision === unbox(await inspect.loadActive())!.document.revision, 'Undo state did not receive durable revision.');
      await until(() => h.api.phase === 'dirty', 'Undo content remains unsaved against captured edit');
      accepted(h.editor.redo()); await until(() => h.api.phase === 'saved', 'Redo content matches committed save');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'real editor failed replacements retain history and release locks before a successful transition': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore();
    const original = StudioDocumentStore.prototype.stageCandidate;
    let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Preserved work'));
      const session = h.editor.getSnapshot().sessionId;
      StudioDocumentStore.prototype.stageCandidate = async () => ({ ok: false, error: { code: 'quota', message: 'Fixture copy quota refusal.' } });
      expect(await h.api.restoreCopy(target()) === false, 'Failed candidate activated.');
      expect(h.editor.getDocument().world.worldName === 'Preserved work' && h.editor.getSnapshot().sessionId === session && h.editor.getSnapshot().canUndo, 'Failed replacement altered editor content/session/history.');
      expect(!h.editor.getSnapshot().exclusive && h.editor.getSnapshot().writable, 'Failed replacement stranded authority.');
      expect(h.editor.getDocument().revision === unbox(await inspect.loadActive())!.document.revision && h.acknowledgements === 1, 'Prerequisite save was not acknowledged independently of failed transition.');
      StudioDocumentStore.prototype.stageCandidate = original;
      const invalid = target(); invalid.world.worldName = '';
      expect(await h.api.restoreCopy(invalid) === false, 'Invalid replacement bypassed validation.');
      expect(!h.editor.getSnapshot().exclusive && h.editor.getSnapshot().sessionId === session, 'Invalid replacement changed authority.');
      deferred = deferMethod('promoteCandidate'); const pending = h.api.restoreCopy(target()); await deferred.entered();
      expect(h.editor.setWorldField('worldName', 'Forbidden during activation').status === 'rejected' && h.editor.undo().status === 'rejected', 'Real controller admitted authored edits/history movement during replacement.');
      deferred.release(); expect(await bounded(pending, 'real editor successful transition'), 'Verified replacement failed.');
      expect(h.editor.getDocument().world.worldName === 'Restored target' && h.editor.getSnapshot().sessionId !== session && !h.editor.getSnapshot().canUndo && !h.editor.getSnapshot().exclusive, 'Successful restore did not rotate and unlock the new session.');
    } finally { deferred?.restore(); StudioDocumentStore.prototype.stageCandidate = original; h.unmount(); inspect.close(); }
  },
  'real editor optional metadata survives save history and is absent after explicit removal or clean restore': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore();
    try {
      await h.ready(); const rich = target('Rich metadata'); rich.extensions = { opaque: { preserved: true } };
      expect(await h.api.restoreCopy(rich), 'Rich document did not install.');
      accepted(h.editor.transaction('Remove optional metadata', () => {
        h.editor.setWorldField('description', undefined);
        h.editor.setDocumentField('extensions', undefined);
        h.editor.setDocumentField('lightingConfig', undefined);
      }));
      const token = JSON.stringify(h.editor.getToken());
      expect(await h.api.save(), 'Optional-field removal did not save.');
      const saved = unbox(await inspect.loadActive())!.document;
      expect(saved.world.description === undefined && saved.extensions === undefined && saved.lightingConfig === undefined, 'Authority capture reintroduced removed fields.');
      expect(JSON.stringify(h.editor.getToken()) === token, 'Metadata receipt changed live edit identity.');
      accepted(h.editor.undo()); const undone = h.editor.getDocument();
      expect(!!undone.world.description && !!undone.extensions?.opaque && !!undone.lightingConfig && undone.revision === saved.revision, 'Undo lost optional fields or rewound durable revision.');
      const clean = target('Clean document'); delete clean.world.description; delete clean.extensions; delete clean.lightingConfig;
      expect(await h.api.restoreCopy(clean), 'Clean restore failed.');
      const current = h.editor.getDocument();
      expect(current.world.description === undefined && current.extensions === undefined && current.lightingConfig === undefined && current.revision === 0, 'Clean session inherited previous optional fields or revision.');
    } finally { h.unmount(); inspect.close(); }
  },
  'real editor rejected stale-session receipt preserves memory and allows a fresh recovery fork': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Committed old session'));
      deferred = deferMethod('save', 'after'); const pending = h.api.save(); await deferred.entered();
      // Simulate an incorrect external activation route while a completed save
      // awaits delivery. The controller must still reject the old receipt.
      h.editor.setWritable(false); accepted(h.editor.installVerifiedDocument(target('Newer in-memory session'))); h.editor.setWritable(true);
      const token = JSON.stringify(h.editor.getToken());
      deferred.release(); expect(await bounded(pending, 'stale real editor receipt') === false, 'Stale receipt was acknowledged by a different editor session.');
      await until(() => h.api.phase === 'failed', 'visible rejected acknowledgement');
      expect(h.api.error?.includes('could not accept its save receipt'), 'Failure did not distinguish committed storage from rejected editor acknowledgement.');
      expect(h.editor.getDocument().world.worldName === 'Newer in-memory session' && JSON.stringify(h.editor.getToken()) === token && h.acknowledgements === 0, 'Rejected receipt changed the new session.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Committed old session', 'Completed durable transaction was rolled back.');
      expect(await h.api.save() === false, 'Rejected session acknowledgement permitted another stale save.');
      deferred.restore(); deferred = undefined;
      expect(await h.api.forkCurrent(), 'Fresh fork did not recover the retained in-memory session.');
      expect(unbox(await inspect.loadActive())?.document.world.worldName === 'Newer in-memory session' && h.editor.getSnapshot().writable && !h.editor.getSnapshot().exclusive, 'Fresh fork lost retained work or stranded authority.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'real editor target transition checkpoints policy and clears history only after durable activation': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore();
    try {
      await h.ready(); accepted(h.editor.setEngineState(state => ({ ...state, blocks: {} })));
      const token = JSON.stringify(h.editor.getToken());
      expect(await h.api.transitionTarget(candidateJavaTarget([]), token), h.api.error ?? 'Target did not activate.');
      const locked = h.editor.getDocument();
      expect(locked.schemaVersion === 2 && locked.targetPolicy?.target.kind === 'minecraft-java' && locked.targetPolicy.target.locked, 'Typed locked policy was not installed.');
      expect(!h.editor.getSnapshot().canUndo && !h.editor.getSnapshot().canRedo && JSON.stringify(h.editor.getToken()) !== token, 'Policy transition retained an old history/session.');
      const checkpoint = locked.targetPolicy!.checkpoint;
      expect(unbox(await inspect.loadRevision(checkpoint.documentId, checkpoint.revision)).schemaVersion === 1, 'Prior policy checkpoint is missing.');
      expect(JSON.stringify(unbox(await inspect.loadActive())!.document) === JSON.stringify(locked), 'Live and durable policy differ.');
      accepted(h.editor.setWorldField('worldName', 'Named locked world'));
      expect(await h.api.save(), 'Ordinary locked save failed.');
      accepted(h.editor.undo()); expect(h.editor.getDocument().targetPolicy?.target.kind === 'minecraft-java', 'Undo dropped policy.');
      const target = structuredClone(locked.targetPolicy!.target); expect(target.kind === 'minecraft-java', 'Wrong target'); target.locked = false;
      expect(await h.api.transitionTarget(target, JSON.stringify(h.editor.getToken())), h.api.error ?? 'Unlock failed.');
      const unlocked = h.editor.getDocument();
      expect(unlocked.targetPolicy?.target.kind === 'minecraft-java' && !unlocked.targetPolicy.target.locked && unlocked.historyEpoch !== locked.historyEpoch, 'Unlock did not establish a fresh durable epoch.');
      h.unmount(); const reopened = mountEditor();
      try { await reopened.ready(); expect(JSON.stringify(reopened.editor.getDocument()) === JSON.stringify(unlocked), 'Reopen changed the policy/document.'); }
      finally { reopened.unmount(); }
    } finally { h.unmount(); inspect.close(); }
  },
  'target transition blocks stale ABA before activation and preserves the verified candidate': async () => {
    const h = mountAuthority(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); const original = unbox(await inspect.loadActive())!; const token = h.token;
      deferred = deferMethod('loadCandidate');
      const pending = h.api.transitionTarget({ kind: 'freeform' }, token); await deferred.entered();
      h.forceName('Transient'); h.forceName(original.document.world.worldName);
      deferred.release(); expect(await bounded(pending, 'stale policy activation') === false, 'Stale policy activated after ABA.');
      expect(JSON.stringify(unbox(await inspect.loadActive())) === JSON.stringify(original), 'Stale transition changed durable active policy.');
      expect(unbox(await inspect.listCandidates()).some(c => c.state === 'verified' && c.documentId === original.document.documentId), 'Verified transition candidate was not retained.');
      expect(!h.locked && h.writable, 'Stale transition stranded exclusion.');
      expect(await h.api.transitionTarget({ kind: 'freeform' }, token) === false, 'Old token was accepted on retry.');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'failed target checkpoint preserves current history and releases exclusion': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); const original = StudioDocumentStore.prototype.stageCandidate;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Must survive'));
      const token = JSON.stringify(h.editor.getToken());
      StudioDocumentStore.prototype.stageCandidate = async () => ({ ok: false, error: { code: 'quota', message: 'Injected checkpoint quota.' } });
      expect(await h.api.transitionTarget({ kind: 'freeform' }, token) === false, 'Failed checkpoint reported success.');
      expect(h.editor.getDocument().schemaVersion === 1 && h.editor.getDocument().world.worldName === 'Must survive' && h.editor.getSnapshot().canUndo, 'Failed transition changed content or history.');
      expect(JSON.stringify(h.editor.getToken()) === token && !h.editor.getSnapshot().exclusive, 'Failed transition rotated authority or retained lock.');
      expect(unbox(await inspect.loadActive())!.document.schemaVersion === 1, 'Failed transition changed durable policy.');
    } finally { StudioDocumentStore.prototype.stageCandidate = original; h.unmount(); inspect.close(); }
  },
  'resource archival readback preserves exact originals without activating or marking current edits saved': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); accepted(h.editor.setWorldField('worldName', 'Unsaved current build'));
      const token = JSON.stringify(h.editor.getToken()); const active = unbox(await inspect.loadActive())!;
      const raw = '{  "original": [1, 2], "unknown": true }\n';
      deferred = deferMethod('loadCandidate');
      const pending = h.api.preserveResourceCandidate(target('Imported resource'), [{ sourceId: 'resource:original', raw }], token);
      await deferred.entered(); expect(h.editor.setWorldField('worldName', 'During archive').status === 'rejected', 'Resource archival exclusion was bypassed.');
      deferred.release(); expect(await bounded(pending, 'resource archive'), 'Resource archive failed.');
      const row = unbox(await inspect.listCandidates()).find(c => c.worldName === 'Imported resource'); expect(row, 'Resource candidate missing.');
      expect(unbox(await inspect.loadCandidate(row.candidateId)).legacySources[0].raw === raw, 'Original bytes changed.');
      expect(JSON.stringify(unbox(await inspect.loadActive())) === JSON.stringify(active), 'Archive activated a project.');
      expect(h.editor.getDocument().world.worldName === 'Unsaved current build' && JSON.stringify(h.editor.getToken()) === token && h.editor.getSnapshot().canUndo, 'Archival changed current content/history.');
      await until(() => h.api.phase === 'dirty', 'current work remains dirty after independent archive');
    } finally { deferred?.restore(); h.unmount(); inspect.close(); }
  },
  'target proposal getters are rejected before invocation and no candidate is staged': async () => {
    const h = mountEditor(); const inspect = new StudioDocumentStore(); let invoked = 0;
    try {
      await h.ready(); const count = unbox(await inspect.listCandidates()).length;
      const target = Object.defineProperty({}, 'kind', { enumerable: true, get() { invoked++; return 'freeform'; } });
      expect(await h.api.transitionTarget(target as any, JSON.stringify(h.editor.getToken())) === false, 'Accessor target accepted.');
      expect(invoked === 0 && unbox(await inspect.listCandidates()).length === count && !h.editor.getSnapshot().exclusive, 'Accessor invoked or invalid proposal changed storage.');
    } finally { h.unmount(); inspect.close(); }
  },
  'recovery read after newer selection is cancelled and cannot replace its page': async () => {
    const h = mountEditor(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('readRecoveryRecord', 'after');
      const older = h.api.selectRecovery({ kind: 'active' }); await deferred.entered();
      const signal = deferred.args[1]?.signal;
      await h.api.browseRecovery('candidate');
      await until(() => h.api.recoveryPage?.items.length === 1, 'new recovery page');
      expect(signal?.aborted, 'New browse did not cancel old selection.');
      deferred.release(); await bounded(older, 'stale recovery read');
      expect(h.api.recoverySelected === null && h.api.recoveryKind === 'candidate', 'Old read replaced newer browsing.');
      expect(h.editor.getDocument().world.worldName === 'Fixture', 'Recovery selection mutated authored content.');
    } finally { deferred?.restore(); h.unmount(); }
  },
  'recovery dismissal aborts pending read and cannot reopen the dialog': async () => {
    const h = mountEditor(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('listRecoveryPage'); const pending = h.api.openRecovery(); await deferred.entered();
      const signal = deferred.args[1]?.signal;
      flushSync(() => h.api.dismissRecovery());
      expect(signal?.aborted && !h.api.recoveryOpen, 'Dismissal did not cancel recovery browsing.');
      deferred.release(); await bounded(pending, 'dismissed recovery read');
      expect(!h.api.recoveryOpen && !h.api.recoveryPage && !h.api.recoveryError, 'Late recovery reopened or populated dismissed UI.');
    } finally { deferred?.restore(); h.unmount(); }
  },
  'recovery unmount aborts storage read without replacing the editor': async () => {
    const h = mountEditor(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('readRecoveryRecord'); const pending = h.api.selectRecovery({ kind: 'active' }); await deferred.entered();
      const signal = deferred.args[1]?.signal, restores = h.restores;
      h.unmount(); expect(signal?.aborted, 'Unmount did not cancel rescue read.');
      deferred.release(); await bounded(pending, 'unmounted recovery read');
      expect(h.restores === restores && !h.editor.getSnapshot().writable, 'Unmounted read restored or reopened editor.');
    } finally { deferred?.restore(); h.unmount(); }
  },
  'recovery list failure is explicit and cannot masquerade as empty success': async () => {
    const h = mountEditor(); const original = StudioDocumentStore.prototype.listRecoveryPage;
    try {
      await h.ready(); StudioDocumentStore.prototype.listRecoveryPage = async () => ({ ok: false, error: { code: 'unavailable', message: 'Injected uncertain recovery read.' } });
      await h.api.openRecovery(); await until(() => !!h.api.recoveryError, 'visible recovery error');
      expect(h.api.recoveryPage === null && h.api.recoveryOpen && h.api.ready, 'Read failure became an empty page or affected active hydration.');
      expect(h.api.recoveryError === 'Injected uncertain recovery read.', 'Read failure was hidden.');
    } finally { StudioDocumentStore.prototype.listRecoveryPage = original; h.unmount(); }
  },
  'project replacement invalidates pending raw rescue without overwriting new document': async () => {
    const h = mountEditor(); let deferred: ReturnType<typeof deferMethod> | undefined;
    try {
      await h.ready(); deferred = deferMethod('readRecoveryRecord', 'after'); const pending = h.api.selectRecovery({ kind: 'active' }); await deferred.entered();
      expect(await h.api.restoreCopy(target('New session')), 'Project switch failed.');
      deferred.release(); await bounded(pending, 'old-session rescue');
      await until(() => h.editor.getDocument().world.worldName === 'New session', 'new document');
      expect(h.api.recoverySelected === null && !h.api.recoveryOpen, 'Previous-session read repopulated recovery state.');
    } finally { deferred?.restore(); h.unmount(); }
  },

};
export const studioPersistenceBrowserCaseNames = Object.keys(cases);
export async function runStudioPersistenceBrowserTest(name: string): Promise<HookBrowserResult> {
  try {
    expect((globalThis as any).__STUDIO_TEST_DISPOSABLE_CONTEXT__ === true, 'Runner must explicitly mark a disposable context.');
    expect(['localhost', '127.0.0.1'].includes(location.hostname) && location.pathname === '/__studio-hook-contract-tests__', 'Run only on the dedicated local test page.');
    expect(localStorage.length === 0 && !(await indexedDB.databases()).some(db => db.name === STUDIO_DOCUMENT_DB), 'Each case requires an empty, new browser context.');
    expect(Object.hasOwn(cases, name), 'Unknown case.');
    await bounded(cases[name](), name, 12000);
    return { name, ok: true };
  } catch (reason) { return { name, ok: false, error: String(reason) }; }
}
