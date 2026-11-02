// Large editable-project and self-reopening backup tasks on a frozen disposable App.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Require a frozen disposable loopback build.');
const limit = 32 * 1024 * 1024, hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...content }) => content;
const report = { startedAt: new Date().toISOString(), origin, caseFilter: process.env.QA_CASE ?? null, assets: [], results: [], errors: [], storageErrors: [], limitations: ['Disposable Chromium/software WebGL, with external/API traffic and service workers blocked. No user storage, provider or native game operation.', 'Named large-JSON correctness fixtures only. Does not qualify rendering capacity, latency, JavaScript/RAM usage, durable storage guarantees or other browsers.', 'Session Undo has a change-data/count allowance and is not persisted; a saved project/backup does not contain this live history.'] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--disable-background-networking', '--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context, page, stage = 'startup';
const record = extra => { report.results.push({ name: stage, ok: true, ...extra }); console.log(JSON.stringify(report.results.at(-1))); };
async function download(button) { const pending = page.waitForEvent('download'); await button.click(); const file = await pending, stream = await file.createReadStream(), chunks = []; for await (const part of stream) chunks.push(part); return Buffer.concat(chunks); }
async function fixture() {
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: true }); context.setDefaultTimeout(30000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
  await context.addInitScript(() => {
    window.__capacityStorageErrors = [];
    for (const method of ['add', 'put', 'get', 'getAllKeys']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) {
        try { const request = original.apply(this, args), store = this.name; request.addEventListener('error', () => window.__capacityStorageErrors.push({ store, method, name: request.error?.name, message: request.error?.message })); return request; }
        catch (error) { window.__capacityStorageErrors.push({ store: this.name, method, name: error.name, message: error.message }); throw error; }
      };
    }
    const record = (operation, error) => window.__capacityStorageErrors.push({ operation, name: error?.name, message: error?.message });
    const stringify = JSON.stringify;
    JSON.stringify = function(...args) { try { return stringify.apply(this, args); } catch (error) { record('JSON.stringify', error); throw error; } };
    const clone = window.structuredClone;
    window.structuredClone = function(...args) { try { return clone.apply(this, args); } catch (error) { record('structuredClone', error); throw error; } };
    const encode = TextEncoder.prototype.encode;
    TextEncoder.prototype.encode = function(...args) { try { return encode.apply(this, args); } catch (error) { record('TextEncoder.encode', error); throw error; } };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) { try { const tx = transaction.apply(this, args); tx.addEventListener('abort', () => record('transaction.abort', tx.error)); return tx; } catch (error) { record('transaction.open', error); throw error; } };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(...args) { try { const request = open.apply(this, args); request.addEventListener('error', () => record('database.open', request.error)); return request; } catch (error) { record('database.open', error); throw error; } };
  });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto(origin);
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 60000 }); await ready();
  const assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(n => n.src || n.href));
  assert.ok(assets.some(s => s.endsWith('/' + process.env.QA_EXPECTED_JS))); report.assets.push(assets);
  const backup = () => download(saving.getByRole('button', { name: 'Project backup', exact: true }));
  const live = async () => JSON.parse((await backup()).toString('utf8'));
  const open = async (document, name) => {
    const bytes = Buffer.isBuffer(document) ? document : Buffer.from(JSON.stringify(document));
    await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'capacity.lfsproj.json', mimeType: 'application/json', buffer: bytes });
    await Promise.race([
      saving.getByText(name, { exact: true }).waitFor({ timeout: 60000 }),
      saving.getByRole('alert').first().waitFor({ timeout: 60000 }).then(async () => { throw new Error('Visible import error: ' + await saving.getByRole('alert').allTextContents()); }),
    ]); await ready();
  };
  const command = async text => { const input = page.getByLabel('WorldEdit Command Input', { exact: true }); await input.fill(text); await input.press('Enter'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  const history = async () => {
    await page.getByRole('button', { name: 'Find studio actions', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Your workspace', exact: true }); await menu.getByRole('button', { name: 'Project details', exact: true }).click();
    const details = menu.locator('details[aria-label="Project and Undo capacity"]');
    const summary = details.locator('summary');
    if (!await details.evaluate(node => node.open)) { await summary.focus(); await summary.press('Enter'); }
    assert.ok((await summary.boundingBox()).height >= 36);
    await menu.getByTestId('studio-history-steps').waitFor();
    const text = await menu.getByTestId('studio-history-steps').innerText(), bytes = Number((await menu.getByTestId('studio-history-bytes').innerText()).split(' bytes')[0].replaceAll(',', ''));
    const counts = text.match(/(\d+) Undo steps · (\d+) Redo steps/); assert.ok(counts, text);
    await menu.getByRole('button', { name: 'Close studio menu', exact: true }).click(); return { undo: Number(counts[1]), redo: Number(counts[2]), bytes };
  };
  return { saving, ready, live, backup, open, command, history };
}
try {
  let f;
  if (process.env.QA_CASE !== 'near') {
  f = await fixture();
  const doc = await f.live(), definition = doc.customBlocks.cobble_brick;
  assert.ok(definition); doc.schemaVersion = 1; delete doc.targetPolicy;
  doc.world.worldName = 'Large editable project Ω'; doc.blocks = {}; doc.blueprints = []; doc.customBlocks = { cobble_brick: definition };
  doc.extensions = { retained: 'x'.repeat(20 * 1024 * 1024), structured: [false, null, { original: 'Ω🌿' }] };
  stage = 'a project larger than the history allowance opens, makes small edits and reports bounded retained changes';
  await f.open(doc, doc.world.worldName); const original = await f.live(), initial = await f.history(); assert.deepEqual(initial, { undo: 0, redo: 0, bytes: 0 });
  await f.command('//pos1 -7 2 9'); await f.command('//pos2 -7 2 9'); await f.command('//set cobble_brick');
  const changed = await f.live(); assert.equal(changed.blocks['-7,2,9'].blockDefId, 'cobble_brick'); assert.equal(hash(changed.extensions), hash(doc.extensions));
  const usage = await f.history(); assert.equal(usage.undo, 3); assert.equal(usage.redo, 0); assert.ok(usage.bytes > 0 && usage.bytes < 16384, JSON.stringify(usage)); record({ projectBytes: Buffer.byteLength(JSON.stringify(original)), history: usage });

  stage = 'large-project actual Undo and Redo restore full payloads with stable retained change accounting';
  await f.command('//undo'); assert.equal(hash(authored(await f.live())), hash(authored(original))); const undone = await f.history(); assert.equal(undone.undo, 2); assert.equal(undone.redo, 1); assert.equal(undone.bytes, usage.bytes);
  await f.command('//redo'); assert.equal(hash(authored(await f.live())), hash(authored(changed))); assert.deepEqual(await f.history(), usage); record({ originalHash: hash(authored(original)), changedHash: hash(authored(changed)) });

  stage = 'complete large project and independent compact backup survive save and reload while live history restarts';
  await f.saving.getByRole('button', { name: 'Save', exact: true }).click(); await f.ready(); const bytes = await f.backup();
  assert.ok(bytes.length > 16 * 1024 * 1024 && bytes.length < limit); assert.equal(bytes.toString('utf8'), JSON.stringify(JSON.parse(bytes.toString('utf8'))));
  await page.reload(); await f.ready(); assert.equal(hash(authored(await f.live())), hash(authored(changed))); assert.deepEqual(await f.history(), { undo: 0, redo: 0, bytes: 0 }); record({ backupBytes: bytes.length, backupSha256: hash(bytes) });
  await context.close(); context = undefined;
  }

  stage = 'near-limit admitted project downloads inside its own opening limit and reopens as an independent copy';
  f = await fixture(); const near = await f.live(); near.world.worldName = 'Near-limit backup Ω'; near.extensions = { preserved: '' };
  const targetBytes = limit - 2048; near.extensions.preserved = 'y'.repeat(targetBytes - Buffer.byteLength(JSON.stringify(near)));
  const input = Buffer.from(JSON.stringify(near)); assert.equal(input.length, targetBytes);
  const oldPrettyBytes = Buffer.byteLength(JSON.stringify(near, null, 2)); assert.ok(oldPrettyBytes > limit, 'The fixture must demonstrate the former backup inflation defect.');
  await f.open(input, near.world.worldName); const first = await f.live(), backup = await f.backup(); assert.ok(backup.length < limit); assert.equal(hash(authored(JSON.parse(backup.toString('utf8')))), hash(authored(near)));
  // A fresh visible import of the actual downloaded bytes must activate another identity.
  await f.open(backup, near.world.worldName);
  await page.waitForFunction(async previousId => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('lfs_studio_documents_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise(resolve => { const tx = db.transaction('metadata', 'readonly'), request = tx.objectStore('metadata').get('active'); tx.oncomplete = () => resolve(typeof request.result?.documentId === 'string' && request.result.documentId !== previousId); }); } finally { db.close(); }
  }, first.documentId, { timeout: 60000 });
  await f.ready(); const reopened = await f.live(); assert.notEqual(reopened.documentId, first.documentId); assert.equal(hash(authored(reopened)), hash(authored(first)));
  assert.deepEqual(await f.history(), { undo: 0, redo: 0, bytes: 0 }); record({ compactInputBytes: input.length, formerPrettyBytes: oldPrettyBytes, actualBackupBytes: backup.length, backupSha256: hash(backup), independentCopy: true });
  assert.deepEqual(report.errors, []);
} catch (error) { report.error = error.stack ?? String(error); report.results.push({ name: stage, ok: false, error: report.error }); if (page) { const ui = await page.locator('body').innerText().catch(() => ''); report.failureUi = ui.slice(0, 6000) + '\n[remainder omitted]\n' + ui.slice(-2000); report.visibleAlerts = await page.getByRole('alert').allTextContents().catch(() => []); } }
finally { if (page) report.storageErrors = await page.evaluate(() => window.__capacityStorageErrors).catch(() => []); await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString(); report.ok = !report.error && !report.errors.length; await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-project-capacity-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, error: report.error, storageErrors: report.storageErrors })); if (!report.ok) process.exitCode = 1; }
