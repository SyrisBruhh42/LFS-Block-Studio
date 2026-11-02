const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const results = [];
const record = value => { results.push(value); console.log(JSON.stringify(value)); };
const errors = [];
let bundleAssets = [];
let diagnosticPage;
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174';
async function makeContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
  await context.addInitScript(() => {
    window.__studioQaRead = (store, key) => new Promise((resolve, reject) => {
      const open = indexedDB.open('lfs_studio_documents_v1');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction(store, 'readonly');
        const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
        let value; request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });
  context.on('page', page => page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack, url: page.url() })));
  return context;
}
const ready = page => page.getByRole('region', { name: 'Project saving and recovery' }).getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
const save = async page => { await page.getByRole('region', { name: 'Project saving and recovery' }).getByRole('button', { name: 'Save', exact: true }).click(); };
const readActive = page => page.evaluate(async () => { const token = await window.__studioQaRead('metadata', 'active'); const stored = await window.__studioQaRead('revisions', [token.documentId, token.revision]); return JSON.parse(stored.json); });
async function edit(page, x) {
  const input = page.locator('input[placeholder^="Press /"]');
  for (const command of [`//pos1 ${x} 2 20`, `//pos2 ${x} 2 20`, '//set cobble_brick']) { await input.fill(command); await input.press('Enter'); }
}
try {
  const context = await makeContext();
  context.setDefaultTimeout(15000);
  const a = await context.newPage(); diagnosticPage = a; await a.goto(origin); await ready(a);
  bundleAssets = await a.locator('script[src], link[rel=stylesheet]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') || node.getAttribute('href')));
  const original = await readActive(a);
  const incoming = structuredClone(original);
  incoming.world.worldName = 'Complete imported fixture'; incoming.world.description = 'Retain metadata';
  incoming.customBlocks.cobble_brick.color = '#123456';
  incoming.patternConfig = { ...incoming.patternConfig, enabled: true, autoEvolveLoop: true, evolveSpeed: 2, evolutionPhase: 1.25 };
  incoming.extensions = { auditFixture: { retained: true, version: 1 } };
  delete incoming.lightingConfig;
  await a.getByLabel('Open a project file as a copy').setInputFiles({ name: 'complete.lfsproj.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await a.waitForFunction(() => document.body.innerText.includes('Complete imported fixture'));
  await ready(a);
  const imported = await readActive(a);
  assert.notEqual(imported.documentId, original.documentId);
  for (const field of ['world','blocks','customBlocks','blueprints','chunkConfig','patternConfig','extensions']) assert.deepEqual(imported[field], incoming[field]);
  assert.equal(imported.lightingConfig, undefined);
  await a.reload(); await ready(a);
  assert.deepEqual(await readActive(a), imported);
  record({ name: 'file restore as copy preserves complete authored data and absent lighting across reload', ok: true });
  await a.waitForTimeout(750);
  assert.equal(await a.getByRole('region', { name: 'Project saving and recovery' }).getByRole('status').filter({ hasText: 'Saved locally' }).count(), 1);
  const patternDownloadWaiting = a.waitForEvent('download');
  await a.getByRole('region', { name: 'Project saving and recovery' }).getByRole('button', { name: 'Project backup', exact: true }).click();
  const patternDownload = await patternDownloadWaiting;
  const animatedBackup = JSON.parse(await readFile(await patternDownload.path(), 'utf8'));
  assert.deepEqual(animatedBackup.patternConfig, imported.patternConfig);
  assert.deepEqual(await readActive(a), imported);
  record({ name: 'animated pattern preview leaves authored settings and saved status unchanged', ok: true });


  const beforeInvalid = await readActive(a);
  await a.getByLabel('Open a project file as a copy').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...incoming, schemaVersion: 999 })) });
  await a.getByRole('alert').filter({ hasText: /schema|version/i }).waitFor();
  assert.deepEqual(await readActive(a), beforeInvalid);
  record({ name: 'unknown schema import leaves current saved project intact', ok: true });

  await a.getByRole('button', { name: 'Projects & Reset', exact: true }).click();
  await a.getByLabel('Project Name', { exact: true }).fill('Named checkpoint fixture');
  await a.getByLabel('Notes / Description', { exact: true }).fill('Immutable saved copy');
  await a.getByRole('button', { name: 'Save named copy', exact: true }).click();
  await a.getByRole('heading', { name: 'Named checkpoint fixture', exact: true }).waitFor();
  assert.deepEqual(await readActive(a), beforeInvalid);
  const card = a.getByRole('heading', { name: 'Named checkpoint fixture', exact: true }).locator('xpath=../../..');
  const downloadPromise = a.waitForEvent('download');
  await a.getByRole('button', { name: 'Download project copy Named checkpoint fixture', exact: true }).click();
  const download = await downloadPromise;
  const named = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(named.format, 'lfs-studio-project'); assert.equal(named.world.description, 'Immutable saved copy');
  assert.deepEqual(named.customBlocks, imported.customBlocks);
  await card.getByRole('button', { name: 'Open copy', exact: true }).click();
  await a.getByTestId('main-menu-project-modal').waitFor({ state: 'hidden' }); await ready(a);
  assert.equal((await readActive(a)).world.worldName, 'Named checkpoint fixture');
  record({ name: 'named copy saves/exports a complete document without changing active; explicit open activates a copy', ok: true });

  const b = await context.newPage(); await b.goto(origin); await ready(b);
  await edit(a, 30); await save(a); await ready(a);
  const firstWriter = await readActive(a);
  await edit(b, 31); await save(b);
  await b.getByRole('alert').filter({ hasText: 'Another tab or operation' }).waitFor();
  assert.deepEqual(await readActive(b), firstWriter);
  const recoveryDownloadPromise = b.waitForEvent('download');
  await b.getByRole('button', { name: 'Download unsaved work', exact: true }).click();
  const unsavedDownload = await recoveryDownloadPromise;
  const unsaved = JSON.parse(await readFile(await unsavedDownload.path(), 'utf8'));
  assert.ok(unsaved.blocks['31,2,20']); assert.equal(unsaved.blocks['30,2,20'], undefined);
  await b.getByRole('button', { name: 'Keep my work as a separate project', exact: true }).click(); await ready(b);
  const forked = await readActive(b);
  assert.notEqual(forked.documentId, firstWriter.documentId); assert.ok(forked.blocks['31,2,20']);
  const retainedFirstWriter = await b.evaluate(async ({ id, revision }) => JSON.parse((await window.__studioQaRead('revisions', [id, revision])).json), { id: firstWriter.documentId, revision: firstWriter.revision });
  assert.deepEqual(retainedFirstWriter, firstWriter);
  record({ name: 'two-tab conflict never overwrites first writer; unsaved download and separate fork preserve both', ok: true });
  await a.close();

  await b.evaluate(() => { const originalAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(...args) { if (this.name === 'revisions') throw new DOMException('Injected test quota', 'QuotaExceededError'); return originalAdd.apply(this,args); }; });
  await edit(b, 32); await save(b);
  await b.getByRole('alert').filter({ hasText: 'Browser storage is full' }).waitFor();
  assert.deepEqual(await readActive(b), forked);
  record({ name: 'injected quota failure stays visible and retains previous saved revision', ok: true });
  console.log('closing first context'); await context.close(); console.log('closed first context');

  const localBlockedContext = await makeContext();
  const c = await localBlockedContext.newPage(); await c.goto(origin); await ready(c);
  const cBefore = await readActive(c); console.log('localstorage reload starting');
  await c.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Test blocked localStorage', 'SecurityError'); } }));
  await c.reload(); console.log('localstorage reloaded'); await ready(c); assert.deepEqual(await readActive(c), cBefore);
  record({ name: 'existing IndexedDB document opens with localStorage unavailable', ok: true });
  await localBlockedContext.close();

  const recoveryContext = await makeContext();
  await recoveryContext.addInitScript(({ origin }) => { if (location.origin === origin) localStorage.setItem('brickforge_autosave_snapshots_v1', '{broken original'); }, { origin });
  const d = await recoveryContext.newPage(); await d.goto(origin);
  await d.getByRole('dialog', { name: 'Recover your work' }).waitFor();
  assert.equal(await d.locator('input[placeholder^="Press /"]').evaluate(el => !!el.closest('[inert]')), true);
  await d.getByRole('button', { name: 'Start a separate project', exact: true }).click(); await ready(d);
  assert.equal(await d.evaluate(() => localStorage.getItem('brickforge_autosave_snapshots_v1')), '{broken original');
  const preserved = await d.evaluate(async () => (await window.__studioQaRead('candidates')).flatMap(item => item.legacySources));
  assert.ok(preserved.some(item => item.raw === '{broken original'));
  record({ name: 'corrupt legacy data blocks editing and remains byte-preserved when starting separate project', ok: true });
  await recoveryContext.close();
  assert.deepEqual(errors, []);
} catch (error) { console.error(error.stack); if (diagnosticPage && !diagnosticPage.isClosed()) console.error((await diagnosticPage.locator('body').innerText()).slice(0,4000)); process.exitCode = 1; }
finally { await browser.close(); await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-app-recovery-results.json', JSON.stringify({ testedAt: new Date().toISOString(), bundleAssets, results, errors }, null, 2)); console.log(JSON.stringify({ testedAt: new Date().toISOString(), bundleAssets, results, errors }, null, 2)); }
