/** Mounted recovery UI contracts; a new disposable browser context is required per case. */
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { StudioRecoveryPanel } from '../components/StudioRecoveryPanel';
import { useStudioPersistence, type StudioAuthoredContent } from './useStudioPersistence';
import { StudioDocumentStore, STUDIO_DOCUMENT_DB } from './studioDocumentStore';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import type { StudioDocument } from './studioDocument';

function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => unknown, label: string) { const end = performance.now() + 6000; while (!test()) { if (performance.now() > end) throw new Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 10)); } }
function authored(d: StudioDocument): StudioAuthoredContent { const { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions } = d; return { world, blocks, customBlocks, blueprints, chunkConfig, patternConfig, lightingConfig, extensions }; }
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function fixture(raw: string, candidates: any[] = []) {
  const store = new StudioDocumentStore(); const result = await store.loadActive(); expect(result.ok, 'Fixture namespace could not initialize.'); store.close();
  const db = await request(indexedDB.open(STUDIO_DOCUMENT_DB));
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    tx.objectStore('metadata').put({ documentId: 'rescue', revision: 0, activationId: 'rescue-active' }, 'active');
    tx.objectStore('revisions').put({ documentId: 'rescue', revision: 0, json: raw });
    for (const value of candidates) tx.objectStore('candidates').put(value);
  }); } finally { db.close(); }
}
function mount() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  let api: ReturnType<typeof useStudioPersistence>;
  function Harness() {
    const [content, setContent] = useState(() => authored(makeStudioDocument()));
    const value = useStudioPersistence({ content, onRestore: d => setContent(authored(d)), autosaveEnabled: false, autosaveIntervalSec: 30 });
    useLayoutEffect(() => { api = value; });
    return <StudioRecoveryPanel persistence={value} />;
  }
  flushSync(() => root.render(<Harness />));
  return { get api() { return api!; }, host, unmount() { flushSync(() => root.unmount()); host.remove(); } };
}
function button(host: HTMLElement, label: string): HTMLButtonElement { const b = [...host.querySelectorAll('button')].find(x => x.textContent === label); expect(b, `Missing button: ${label}`); return b; }
function futureRaw() { return ` \n${JSON.stringify({ ...makeStudioDocument('rescue'), schemaVersion: 99 }, null, 2)}\r\n`; }
function captureDownloads() {
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, click = HTMLAnchorElement.prototype.click;
  const blobs = new Map<string, Blob>(), captured: { name: string; bytes: Promise<Uint8Array> }[] = []; let id = 0;
  URL.createObjectURL = value => { expect(value instanceof Blob, 'Download is not a Blob.'); const key = `blob:${location.origin}/fixture-${++id}`; blobs.set(key, value); return key; };
  URL.revokeObjectURL = url => { blobs.delete(url); };
  HTMLAnchorElement.prototype.click = function () { if (!this.download) return click.call(this); const blob = blobs.get(this.href); expect(blob, 'Download URL missing.'); captured.push({ name: this.download, bytes: blob.arrayBuffer().then(b => new Uint8Array(b)) }); };
  return { captured, restore() { URL.createObjectURL = create; URL.revokeObjectURL = revoke; HTMLAnchorElement.prototype.click = click; } };
}
function bytesEqual(actual: Uint8Array, text: string) { const expected = new TextEncoder().encode(text); expect(actual.length === expected.length && actual.every((v, i) => v === expected[i]), 'Downloaded bytes changed.'); }
const cases: Record<string, () => Promise<void>> = {
  'failed future-schema hydration exposes raw download without activation or writes': async () => {
    const raw = futureRaw(); await fixture(raw);
    const tx = IDBDatabase.prototype.transaction; let writes = 0;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) { if (this.name === STUDIO_DOCUMENT_DB && args[1] && args[1] !== 'readonly') writes++; return tx.apply(this, args); };
    const h = mount(), downloads = captureDownloads();
    try {
      await until(() => h.api.phase === 'failed' && h.host.querySelector('dialog')?.open, 'visible failed-hydration recovery'); expect(!h.api.ready, 'Failed hydration became writable.');
      button(h.host, 'Inspect active record').click(); await until(() => h.api.recoverySelected !== null, 'raw active record');
      expect(!h.api.recoverySelected!.document && !h.api.ready, 'Future policy was opened/downgraded.');
      button(h.host, 'Download original document text').click(); await until(() => downloads.captured.length === 1, 'download');
      bytesEqual(await downloads.captured[0].bytes, raw);
      expect(writes === 0 && h.api.phase === 'failed', 'Raw rescue wrote or reported hydration success.');
    } finally { downloads.restore(); h.unmount(); IDBDatabase.prototype.transaction = tx; }
  },
  'failed hydration can independently download preserved candidate originals including BOM and whitespace': async () => {
    const originals = [{ sourceId: 'file:original', raw: '\ufeff  {"café":"🌱"}\r\n' }, { sourceId: 'cloud:blocksData', raw: '{ malformed\n' }];
    await fixture(futureRaw(), [{ candidateId: 'candidate-original', json: 'not valid JSON', legacySources: originals }]);
    const h = mount(), downloads = captureDownloads();
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration'); button(h.host, 'Browse saved candidates').click();
      await until(() => h.api.recoveryPage?.items.length === 1, 'candidate page'); button(h.host, 'Inspect record').click();
      await until(() => h.api.recoverySelected?.sources.length === 2, 'preserved sources');
      button(h.host, 'Download original source 1').click(); button(h.host, 'Download original source 2').click();
      await until(() => downloads.captured.length === 2, 'independent source downloads');
      bytesEqual(await downloads.captured[0].bytes, originals[0].raw); bytesEqual(await downloads.captured[1].bytes, originals[1].raw);
      expect(!h.api.ready && !h.api.recoverySelected?.document, 'Malformed candidate unexpectedly opened.');
    } finally { downloads.restore(); h.unmount(); }
  },
  'mounted recovery browses127 candidates with bounded pages and reversible navigation': async () => {
    await fixture(futureRaw(), Array.from({ length: 127 }, (_, i) => ({ candidateId: `candidate-${String(i).padStart(3, '0')}`, json: '{}' })));
    const h = mount();
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration'); button(h.host, 'Browse saved candidates').click(); await until(() => h.api.recoveryPage?.items.length === 25, 'first page');
      const found = new Set<string>();
      for (let page = 1; page <= 6; page++) {
        await until(() => !h.api.recoveryBusy && h.api.recoveryPageNumber === page && !!h.api.recoveryPage, `page ${page}`);
        expect(h.host.querySelectorAll('[aria-label="Recovery record page"] li').length <= 25, 'UI page is unbounded.');
        h.api.recoveryPage!.items.forEach(item => found.add(item.label));
        const next = button(h.host, 'Next page');
        if (page < 6) { expect(!next.disabled, 'Records beyond current page inaccessible.'); next.click(); }
        else expect(next.disabled, 'End of list is not explicit.');
      }
      expect(found.size === 127, 'UI cannot discover records after100.');
      button(h.host, 'Previous page').click(); await until(() => h.api.recoveryPageNumber === 5 && !h.api.recoveryBusy, 'previous page');
      expect(h.api.recoveryPage!.items.length === 25, 'Previous page lost cursor.');
    } finally { h.unmount(); }
  },
  'mounted recovery distinguishes unavailable reads from an empty list and can retry': async () => {
    await fixture(futureRaw()); const h = mount(), original = StudioDocumentStore.prototype.listRecoveryPage;
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration');
      StudioDocumentStore.prototype.listRecoveryPage = async () => ({ ok: false, error: { code: 'unavailable', message: 'Recovery temporarily unavailable; not empty.' } });
      button(h.host, 'Browse saved candidates').click(); await until(() => !!h.api.recoveryError, 'visible failure');
      expect(h.host.textContent?.includes('Recovery temporarily unavailable; not empty.') && !h.host.textContent?.includes('This page contains no stored records.'), 'Failure rendered as empty.');
      StudioDocumentStore.prototype.listRecoveryPage = original;
      button(h.host, 'Browse saved candidates').click(); await until(() => h.api.recoveryPage !== null && !h.api.recoveryBusy, 'retry');
      expect(!h.api.recoveryError && h.host.textContent?.includes('This page contains no stored records.'), 'Successful empty page not distinguished.');
    } finally { StudioDocumentStore.prototype.listRecoveryPage = original; h.unmount(); }
  },
  'damaged surrogate text cannot be downloaded lossily and has a lossless envelope alternative': async () => {
    await fixture(futureRaw(), [{ candidateId: 'damaged-source', json: '\ud800', legacySources: [{ sourceId: 'damaged', raw: '\udfff' }] }]);
    const h = mount(), downloads = captureDownloads();
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration'); button(h.host, 'Browse saved candidates').click();
      await until(() => h.api.recoveryPage?.items.length === 1, 'candidate page'); button(h.host, 'Inspect record').click();
      await until(() => h.api.recoverySelected !== null, 'damaged record');
      expect(button(h.host, 'Download original document text').disabled && button(h.host, 'Download original source 1').disabled, 'Lossy downloads enabled.');
      h.api.downloadRecovery('source', 0); await until(() => !!h.api.recoveryError, 'programmatic lossy download rejected');
      expect(downloads.captured.length === 0, 'Programmatic raw download bypassed fidelity guard.');
      button(h.host, 'Download record envelope').click(); await until(() => downloads.captured.length === 1, 'envelope download');
      const envelope = JSON.parse(new TextDecoder().decode(await downloads.captured[0].bytes));
      expect(envelope.json.charCodeAt(0) === 0xd800 && envelope.legacySources[0].raw.charCodeAt(0) === 0xdfff, 'Envelope changed damaged code units.');
    } finally { downloads.restore(); h.unmount(); }
  },
  'encoded candidate has exact byte/text downloads and a lossless original-source envelope': async () => {
    const d = makeStudioDocument('encoded-source'), json = JSON.stringify(d), encoded = new TextEncoder().encode(json), original = '\udfff';
    await fixture(futureRaw(), [{ candidateId: 'encoded-source', documentId: d.documentId, revision: d.revision, json: encoded, jsonEncoding: 'utf8-json-v1', legacySources: [{ sourceId: 'damaged-original', raw: original }], state: 'verified' }]);
    const h = mount(), downloads = captureDownloads();
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration'); button(h.host, 'Browse saved candidates').click(); await until(() => h.api.recoveryPage?.items.length === 1, 'candidate page'); button(h.host, 'Inspect record').click();
      await until(() => h.api.recoverySelected?.document !== undefined, 'encoded candidate');
      expect(button(h.host, 'Download record envelope').disabled && button(h.host, 'Download original source 1').disabled, 'Lossy binary/source JSON envelope admitted.');
      button(h.host, 'Download original document text').click(); button(h.host, 'Download stored document bytes').click(); button(h.host, 'Download source 1 as JSON envelope').click();
      await until(() => downloads.captured.length === 3, 'separate recovery downloads');
      bytesEqual(await downloads.captured[0].bytes, json); const stored = await downloads.captured[1].bytes;
      expect(stored.length === encoded.length && stored.every((v, i) => v === encoded[i]), 'Stored binary bytes changed.');
      expect(JSON.parse(new TextDecoder().decode(await downloads.captured[2].bytes)).raw.charCodeAt(0) === original.charCodeAt(0), 'Original-source envelope lost a code unit.');
      expect(!h.api.ready, 'Inspection activated a project.');
    } finally { downloads.restore(); h.unmount(); }
  },
  'invalid UTF-8 candidate retains byte rescue while opening remains unavailable': async () => {
    const encoded = new Uint8Array([0xc3, 0x28]);
    await fixture(futureRaw(), [{ candidateId: 'broken-encoded', documentId: 'broken-encoded', revision: 0, json: encoded, jsonEncoding: 'utf8-json-v1', legacySources: [], state: 'verified' }]);
    const h = mount(), downloads = captureDownloads();
    try {
      await until(() => h.api.phase === 'failed', 'failed hydration'); button(h.host, 'Browse saved candidates').click(); await until(() => h.api.recoveryPage?.items.length === 1, 'candidate page'); button(h.host, 'Inspect record').click(); await until(() => h.api.recoverySelected !== null, 'broken candidate');
      expect(!h.api.recoverySelected!.document && button(h.host, 'Download original document text').disabled, 'Damaged candidate became valid text or a project.');
      button(h.host, 'Download stored document bytes').click(); await until(() => downloads.captured.length === 1, 'raw byte rescue');
      const actual = await downloads.captured[0].bytes; expect(actual.length === 2 && actual[0] === 0xc3 && actual[1] === 0x28, 'Damaged bytes were replaced.');
      expect(!h.api.ready, 'Byte rescue activated damaged content.');
    } finally { downloads.restore(); h.unmount(); }
  },

};
export const studioRecoveryUiCaseNames = Object.keys(cases);
export async function runStudioRecoveryUiCase(name: string) {
  try {
    expect((globalThis as any).__STUDIO_TEST_DISPOSABLE_CONTEXT__ === true, 'Disposable context marker required.');
    expect(['localhost', '127.0.0.1'].includes(location.hostname) && location.pathname === '/__studio-recovery-ui-tests__', 'Use dedicated loopback runner.');
    expect(!(await indexedDB.databases()).some(db => db.name === STUDIO_DOCUMENT_DB), 'A fresh browser context is required.');
    expect(Object.hasOwn(cases, name), 'Unknown case.'); await cases[name](); return { name, ok: true };
  } catch (error) { return { name, ok: false, error: String(error) }; }
}
