// Full-App Blueprint Library import qualification against a frozen local preview.
// Product UI + read-only IndexedDB/download inspection only; no test globals or providers.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Resource import QA requires a disposable loopback origin.');
if (!process.env.QA_EXPECTED_JS) throw new Error('QA_EXPECTED_JS must identify the frozen preview bundle before this runner can execute.');
const report = {
  startedAt: new Date().toISOString(), origin, browser: '', bundleAssets: [], results: [], pageErrors: [], reactErrors: [], blockedRequests: [],
  limitations: [
    'Disposable desktop Chromium, software WebGL and actual App UI. No hardware, assistive technology, multi-browser or native-game qualification.',
    'All external/API traffic is blocked. These checks exercise local blueprint import, preservation and history, not cloud fetch/publication.',
    'Complete live document comparison uses the product backup download; its generated savedAt is excluded. Durable documents, active tokens and recovery candidates are compared without exclusions.',
  ],
};
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...content }) => content;
const liveComparable = ({ savedAt, ...document }) => document;
const record = value => { report.results.push(value); console.log(JSON.stringify(value)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context, page, stage = 'startup';
try {
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    report.blockedRequests.push(`${url.origin}${url.pathname}`); return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error' && /maximum update depth|too many re-renders|cannot update a component|react error|Minified React error/i.test(event.text())) report.reactErrors.push(event.text());
  });
  await page.goto(origin);
  const saveRegion = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const library = page.getByRole('dialog', { name: 'Blueprints Library & Structure Prefabs', exact: true });
  const ready = () => saveRegion.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const assets = () => page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href).filter(Boolean));
  const readStorage = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lfs_studio_documents_v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readonly');
        const active = tx.objectStore('metadata').get('active');
        const revisions = tx.objectStore('revisions').getAll();
        const candidates = tx.objectStore('candidates').getAll();
        tx.oncomplete = () => {
          const token = active.result;
          const stored = revisions.result.find(row => row.documentId === token?.documentId && row.revision === token?.revision);
          if (!stored) { reject(new Error('Active saved document is missing')); return; }
          resolve({ token, document: JSON.parse(stored.json), revisions: revisions.result, candidates: candidates.result });
        };
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  const save = async () => { await settle(); await saveRegion.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); return readStorage(); };
  const liveDocument = async () => {
    const pending = page.waitForEvent('download');
    await saveRegion.getByRole('button', { name: 'Project backup', exact: true }).click();
    const download = await pending;
    const stream = await download.createReadStream(); assert.ok(stream, 'Project backup download could not be read');
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const openLibrary = async () => {
    await page.getByRole('navigation', { name: 'Studio Ribbon Tabs', exact: true }).getByRole('button', { name: /^Blueprints \(/ }).click();
    await page.getByRole('button', { name: /^Open Blueprints Library \(/ }).click();
    await library.waitFor();
  };
  const closeLibrary = async () => { await library.getByRole('button', { name: 'Close Blueprints Library & Structure Prefabs', exact: true }).click(); await library.waitFor({ state: 'hidden' }); };
  const importText = async raw => {
    await library.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await library.getByRole('textbox', { name: 'Blueprint JSON', exact: true }).fill(raw);
    await library.getByRole('button', { name: 'Import Blueprint', exact: true }).click();
  };
  await ready();
  report.bundleAssets = await assets();
  assert.ok(report.bundleAssets.some(url => url.endsWith(`/${process.env.QA_EXPECTED_JS}`)), 'Preview is not serving the requested frozen bundle');
  const baseline = await readStorage();
  const baselineLive = await liveDocument();
  assert.deepEqual(liveComparable(baselineLive), liveComparable(baseline.document), 'Initial visible project and stored document differ');
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).first().isEnabled(), false, 'Fresh fixture unexpectedly has edit history');
  report.initialDocumentHash = hash(baseline.document);

  const sharedId = 'cobble_brick';
  assert.ok(baseline.document.customBlocks[sharedId], 'Fixture requires the shipped cobble definition');
  const editedBuiltin = { ...structuredClone(baseline.document.customBlocks[sharedId]), name: 'Imported private cobble appearance', color: '#113355' };
  const newDefinition = { id: 'qa_resource_unit', name: 'QA imported unit', shape: 'cube', width: 1, depth: 1, heightPlates: 3, color: '#88AA22', texturePattern: 'smooth_abs', materialFinish: 'matte', hasStuds: false, isCustom: true };
  const source = {
    id: 'qa_resource_source', name: 'QA Resource Import — Explicit Definitions', description: 'Preserve original whitespace and embedded definitions.',
    authorId: 'source_author', authorName: 'Source Author', blueprintType: 'structure_blueprint', isPublic: true,
    size: { lx: 2, ly: 2, lz: 3 },
    blocks: [
      { id: 'qa_import_a', blockDefId: sharedId, position: { x: 0, y: 0, z: 0 }, rotation: 0 },
      { id: 'qa_import_b', blockDefId: newDefinition.id, position: { x: 1, y: 1, z: 2 }, rotation: 0 },
    ],
    customBlockDefs: [editedBuiltin, newDefinition], createdAt: '2026-10-31T12:34:56.000Z',
  };
  const raw = `\n  ${JSON.stringify(source, null, 2)}\n\n`;
  report.sourceHash = hash(raw);

  stage = 'valid visible blueprint import adds only a private library item and retains exact original';
  await openLibrary(); await importText(raw);
  await library.getByRole('status').filter({ hasText: 'Imported blueprint into your library!' }).waitFor();
  await library.getByRole('heading', { name: source.name, exact: true }).waitFor();
  await closeLibrary();
  const importedLive = await liveDocument();
  const imported = importedLive.blueprints.find(blueprint => blueprint.name === source.name);
  assert.ok(imported, 'Imported blueprint missing from complete live document');
  assert.notEqual(imported.id, source.id); assert.equal(imported.isPublic, false);
  assert.equal(imported.authorId, 'local_builder'); assert.equal(imported.authorName, 'Local Builder');
  assert.deepEqual(imported, { ...source, id: imported.id, authorId: 'local_builder', authorName: 'Local Builder', isPublic: false });
  const expectedContent = { ...authored(baseline.document), blueprints: [imported, ...baseline.document.blueprints] };
  assert.deepEqual(authored(importedLive), expectedContent, 'Import changed authored fields outside library');
  for (const key of ['format', 'schemaVersion', 'documentId', 'historyEpoch']) assert.deepEqual(importedLive[key], baseline.document[key], `Import replaced ${key}`);
  const afterImport = await readStorage();
  assert.equal(afterImport.token.documentId, baseline.token.documentId); assert.equal(afterImport.token.activationId, baseline.token.activationId);
  const addedCandidates = afterImport.candidates.filter(candidate => !baseline.candidates.some(previous => previous.candidateId === candidate.candidateId));
  assert.equal(addedCandidates.length, 1, 'Import must retain exactly one new recovery candidate');
  const archive = addedCandidates[0];
  assert.equal(archive.state, 'verified'); assert.notEqual(archive.documentId, baseline.document.documentId);
  assert.deepEqual(archive.legacySources, [{ sourceId: 'blueprint:import', raw }]);
  const archiveDocument = JSON.parse(archive.json);
  assert.deepEqual(archiveDocument.blueprints, [imported]); assert.deepEqual(archiveDocument.blocks, {});
  assert.deepEqual(importedLive.customBlocks, baseline.document.customBlocks, 'Embedded definitions leaked into the shared registry');
  record({ name: stage, ok: true, blueprintId: imported.id, sourceHash: hash(raw), candidateId: archive.candidateId, activeDocumentId: importedLive.documentId });

  stage = 'one Undo removes imported library item without affecting original or shared definitions';
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click(); await settle();
  assert.deepEqual(authored(await liveDocument()), authored(baseline.document), 'One Undo did not restore complete authored predecessor');
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).first().isEnabled(), false, 'Import created more than one Undo entry');
  assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).first().isEnabled(), true);
  assert.deepEqual((await readStorage()).candidates.find(candidate => candidate.candidateId === archive.candidateId), archive, 'Undo changed retained original');
  record({ name: stage, ok: true, originalRetained: true });

  stage = 'Redo, explicit save and reload preserve imported library and unchanged world';
  await page.getByRole('button', { name: 'Redo', exact: true }).first().click(); await settle();
  assert.deepEqual(authored(await liveDocument()), expectedContent);
  const saved = await save(); assert.deepEqual(authored(saved.document), expectedContent);
  await page.reload(); await ready();
  assert.deepEqual(await assets(), report.bundleAssets, 'Preview bundle changed during QA');
  assert.deepEqual(await readStorage(), saved, 'Reload changed durable document or recovery originals');
  assert.deepEqual(authored(await liveDocument()), expectedContent);
  await openLibrary(); await library.getByRole('heading', { name: source.name, exact: true }).waitFor(); await closeLibrary();
  record({ name: stage, ok: true, documentHash: hash(saved.document), revision: saved.document.revision });

  const duplicateDefinition = { ...source, customBlockDefs: [editedBuiltin, { ...editedBuiltin, color: '#000000' }, newDefinition] };
  const duplicatePlacement = { ...source, blocks: [source.blocks[0], { ...source.blocks[1], id: source.blocks[0].id }] };
  const invalidSources = [
    ['duplicate definition IDs', JSON.stringify(duplicateDefinition)],
    ['duplicate placement IDs', JSON.stringify(duplicatePlacement)],
    ['duplicate JSON keys', JSON.stringify(source).replace('"name":', '"name":"discarded duplicate","name":')],
    ['unknown top-level field', JSON.stringify({ ...source, unsupportedPayload: { mustNotDisappear: true } })],
    ['unknown nested definition field', JSON.stringify({ ...source, customBlockDefs: [{ ...editedBuiltin, unsupportedShapeData: [1, 2] }, newDefinition] })],
  ];
  for (const [label, invalidRaw] of invalidSources) {
    stage = `invalid import (${label}) leaves complete document, history and storage unchanged`;
    const before = await readStorage(), beforeLive = await liveDocument();
    const history = { undo: await page.getByRole('button', { name: 'Undo', exact: true }).first().isEnabled(), redo: await page.getByRole('button', { name: 'Redo', exact: true }).first().isEnabled() };
    await openLibrary(); await importText(invalidRaw);
    await library.getByRole('alert').filter({ hasText: 'The blueprint was not imported.' }).waitFor();
    assert.equal(await library.getByRole('textbox', { name: 'Blueprint JSON', exact: true }).inputValue(), invalidRaw, 'Rejected import lost original pasted text');
    await closeLibrary();
    assert.deepEqual(liveComparable(await liveDocument()), liveComparable(beforeLive), 'Rejected import changed complete live document');
    assert.deepEqual(await save(), before, 'Rejected import changed active identity, durable content, revisions or candidates');
    assert.deepEqual({ undo: await page.getByRole('button', { name: 'Undo', exact: true }).first().isEnabled(), redo: await page.getByRole('button', { name: 'Redo', exact: true }).first().isEnabled() }, history);
    record({ name: stage, ok: true, sourceHash: hash(invalidRaw), unchangedDocumentHash: hash(before.document) });
  }
  assert.deepEqual(report.pageErrors, [], 'App emitted browser exceptions'); assert.deepEqual(report.reactErrors, [], 'App emitted React errors');
  record({ name: 'no uncaught App exceptions or React update errors', ok: true });
} catch (error) {
  record({ name: stage, ok: false, error: error.message });
  if (page && !page.isClosed()) report.failureUiExcerpt = (await page.locator('body').innerText().catch(() => '')).slice(-4500);
} finally {
  report.finishedAt = new Date().toISOString();
  report.ok = report.results.length > 0 && report.results.every(result => result.ok) && !report.pageErrors.length && !report.reactErrors.length;
  await context?.close(); await browser.close();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-resource-imports-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, failures: report.results.filter(result => !result.ok).map(result => result.name), bundleAssets: report.bundleAssets }));
  if (!report.ok) process.exitCode = 1;
}
