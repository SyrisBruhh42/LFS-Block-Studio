// Actual local catalogue workflow, complete backup/downloads and read-only IndexedDB.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Use a frozen disposable loopback preview and QA_EXPECTED_JS.');
const report = { startedAt: new Date().toISOString(), origin, bundleAssets: [], results: [], errors: [], limitations: ['Desktop Chromium with software WebGL; local procedural catalogue, no provider/download-license or physical-device qualification.'] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let page, context, stage = 'startup';
const record = (name, extra = {}) => { const result = { name, ok: true, ...extra }; report.results.push(result); console.log(JSON.stringify(result)); };
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...value }) => value;
try {
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.abort());
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin);
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const market = page.getByTestId('block-market-modal');
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const live = async () => {
    const pending = page.waitForEvent('download'); await saving.getByRole('button', { name: 'Project backup', exact: true }).click();
    const stream = await (await pending).createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const stored = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('lfs_studio_documents_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readonly');
      const active = tx.objectStore('metadata').get('active'), revisions = tx.objectStore('revisions').getAll(), candidates = tx.objectStore('candidates').getAll();
      tx.oncomplete = () => resolve({ token: active.result, revisions: revisions.result, candidates: candidates.result }); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  const save = async () => { await settle(); await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); return stored(); };
  const command = async text => { const input = page.getByLabel('WorldEdit Command Input', { exact: true }); await input.fill(text); await input.press('Enter'); await settle(); };
  const open = async () => { await page.getByTestId('ribbon-block-market-btn').click(); await market.waitFor(); };
  const close = async () => { await market.getByRole('button', { name: /^Close / }).click(); await market.waitFor({ state: 'hidden' }); };
  const card = name => market.locator('[draggable="true"]').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await ready(); report.bundleAssets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  assert.ok(report.bundleAssets.some(url => url.endsWith('/' + process.env.QA_EXPECTED_JS)));
  stage = 'project fixture contains an already-used conflicting catalogue definition';
  const fixture = await live();
  fixture.world.worldName = 'Catalogue collision fixture';
  fixture.blocks = { '2,0,-3': { id: 'existing-basalt-instance', blockDefId: 'ph_basalt_ashlar', position: { x: 2, y: 0, z: -3 }, rotation: 0 } };
  fixture.customBlocks.ph_basalt_ashlar = { id: 'ph_basalt_ashlar', name: 'Existing personal basalt', shape: 'cube', width: 2, depth: 1, heightPlates: 3, color: '#ABCDEF', texturePattern: 'smooth_abs', materialFinish: 'glass', hasStuds: false, isCustom: true };
  await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'catalogue-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await saving.getByText(fixture.world.worldName, { exact: true }).waitFor(); await ready(); record(stage);
  await command('//pos1 10 0 0'); await command('//pos2 10 0 0');
  const historyBase = authored(await live());
  await command('//set cobble_brick'); const undoPayload = authored(await live());
  await command('//set oak_plank'); const redoPayload = authored(await live());
  await command('//undo');
  const before = await save();
  stage = 'individual catalogue ID collision rejects without retargeting placed blocks or clearing history';
  await open();
  assert.equal(await market.getByText('CC0 1.0 Public Domain', { exact: true }).count(), 0);
  assert.ok((await market.innerText()).includes('Built-in procedural presets with unverified provenance'));
  const collision = card('Basalt Ashlar Stone');
  assert.ok((await collision.innerText()).includes('Definition ID conflict'));
  await collision.getByRole('button', { name: 'Add to Library', exact: true }).click();
  await market.getByRole('alert').filter({ hasText: 'conflicts with this project' }).waitFor();
  await close(); assert.deepEqual(await save(), before); assert.deepEqual(authored(await live()), undoPayload);
  await command('//redo'); assert.deepEqual(authored(await live()), redoPayload);
  await command('//undo'); assert.deepEqual(authored(await live()), undoPayload);
  await command('//undo'); assert.deepEqual(authored(await live()), historyBase);
  await command('//redo'); assert.deepEqual(authored(await live()), undoPayload); record(stage);
  stage = 'mixed catalogue batch rejects atomically when one definition conflicts';
  const beforeBatch = await save(), beforeBatchDocument = authored(await live());
  await open(); await market.getByTestId('market-install-all-btn').click();
  await market.getByRole('alert').filter({ hasText: 'conflicts with this project' }).waitFor();
  await close(); assert.deepEqual(await save(), beforeBatch); assert.deepEqual(authored(await live()), beforeBatchDocument); record(stage);
  stage = 'new catalogue definition adds once and complete Undo/Redo preserves existing definitions and world';
  await open(); await card('Castle Limestone').getByRole('button', { name: 'Add to Library', exact: true }).click();
  await market.getByRole('status').filter({ hasText: 'Added to your library' }).waitFor(); await close();
  const added = authored(await live()); assert.ok(added.customBlocks.ph_castle_limestone);
  const { ph_castle_limestone: addedDefinition, ...previousDefinitions } = added.customBlocks;
  assert.deepEqual({ ...added, customBlocks: previousDefinitions }, beforeBatchDocument);
  await command('//undo'); assert.deepEqual(authored(await live()), beforeBatchDocument);
  await command('//redo'); assert.deepEqual(authored(await live()), added); await save(); record(stage, { definitionId: addedDefinition.id });
  stage = 'identical catalogue install is a no-op preserving actual pending Redo';
  await command('//set oak_plank'); const duplicateRedo = authored(await live()); await command('//undo');
  const beforeNoop = await save();
  await open(); await market.getByPlaceholder('Search basalt, marble, timber, copper, shoji, arch...').fill('Castle Limestone');
  await market.getByTestId('market-install-all-btn').click();
  await market.getByRole('status').filter({ hasText: 'already in your library' }).waitFor(); await close();
  assert.deepEqual(await save(), beforeNoop); await command('//redo'); assert.deepEqual(authored(await live()), duplicateRedo); record(stage);
  stage = 'catalogue content and original used definition survive durable save and reload';
  const final = authored(await live()), durable = await save(); await page.reload(); await ready();
  assert.deepEqual(authored(await live()), final); assert.deepEqual(await stored(), durable);
  assert.deepEqual(final.customBlocks.ph_basalt_ashlar, fixture.customBlocks.ph_basalt_ashlar); assert.deepEqual(report.errors, []); record(stage);
} catch (error) { report.results.push({ name: stage, ok: false, error: error.message }); if (page) report.failureUi = (await page.locator('body').innerText().catch(() => '')).slice(-5000); }
finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.ok = report.results.length > 0 && report.results.every(row => row.ok) && !report.errors.length;
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-catalogue-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report)); if (!report.ok) process.exitCode = 1;
}
