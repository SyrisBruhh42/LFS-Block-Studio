const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const results = [], errors = [];
let bundleAssets = [];
const record = name => { results.push({ name, ok: true }); console.log(name); };
let page, stage = 'startup';
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  bundleAssets = await page.locator('script[src], link[rel=stylesheet]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') || node.getAttribute('href')));
  const ready = () => page.getByRole('region', { name: 'Project saving and recovery' }).getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  await ready();
  const readActive = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('lfs_studio_documents_v1'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(['metadata', 'revisions'], 'readonly');
      let value; const pointer = tx.objectStore('metadata').get('active');
      pointer.onsuccess = () => { const token = pointer.result; const r = tx.objectStore('revisions').get([token.documentId, token.revision]); r.onsuccess = () => { value = JSON.parse(r.result.json); }; };
      tx.oncomplete = () => { db.close(); resolve(value); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  const original = await readActive();
  const openExport = async () => {
    await page.getByRole('button', { name: 'Export drafts', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open export drafts & approximate block mapping', exact: true }).click();
    await page.getByRole('dialog', { name: 'Export drafts & mapping preview', exact: true }).waitFor();
  };
  const dialog = page.getByRole('dialog', { name: 'Export drafts & mapping preview', exact: true });
  const download = async () => {
    const waiting = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download draft', exact: true }).click();
    const file = await waiting; return { name: file.suggestedFilename(), data: JSON.parse(await readFile(await file.path(), 'utf8')) };
  };
  stage = 'truthful format labels and draft bytes';
  await openExport();
  await dialog.getByRole('status').filter({ hasText: 'Diagnostic JSON only' }).waitFor();
  const diagnostic = await download();
  assert.match(diagnostic.name, /\.schematic-draft\.json$/); assert.match(diagnostic.data.Format, /not a native schematic/);
  await dialog.getByRole('button', { name: 'Layout JSON (no mesh)', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Layout metadata only' }).waitFor();
  const layout = await download(); assert.match(layout.name, /\.layout\.gltf\.json$/); assert.equal(layout.data.meshes, undefined);
  assert.deepEqual(await readActive(), original);
  record(stage);

  stage = 'clipboard denial is visible and never claims copied';
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Fixture denied', 'NotAllowedError'); } } }); });
  await dialog.getByRole('button', { name: 'Copy draft', exact: true }).click();
  await dialog.getByText('Copy failed. Use Download draft or select the preview text.', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('Copied!', { exact: true }).count(), 0);
  record(stage);

  stage = 'unknown AI target rejects without changing mappings (mock service only)';
  let submitted;
  await context.route(`${origin}/api/ai/block-mapping`, async route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { mappings: [{ sourceBlockId: submitted.blocks[0].id, recommendedTargetId: 'minecraft:unknown', confidence: 99, reasoning: 'Invalid fixture', alternatives: [] }] } });
  });
  const select = dialog.locator('select').first(), selected = await select.inputValue();
  await dialog.getByRole('button', { name: 'Request AI suggestions', exact: true }).click();
  await dialog.getByText(/An AI suggestion has an unknown block/).waitFor(); assert.equal(await select.inputValue(), selected);
  assert.ok(submitted.blocks.length > 0); record(stage);

  stage = 'manual mapping cancels and discards a late suggestion (mock service only)';
  await context.unroute(`${origin}/api/ai/block-mapping`);
  let release, pending;
  await context.route(`${origin}/api/ai/block-mapping`, async route => {
    pending = route.request().postDataJSON(); await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { mappings: [{ sourceBlockId: pending.blocks[0].id, recommendedTargetId: 'minecraft:oak_planks', confidence: 98, reasoning: 'Late fixture', alternatives: [] }] } }).catch(() => {});
  });
  await dialog.getByRole('button', { name: 'Request AI suggestions', exact: true }).click();
  for (let i = 0; i < 100 && !release; i++) await page.waitForTimeout(10);
  assert.ok(release); await select.selectOption('minecraft:glass'); release();
  await page.waitForTimeout(150); assert.equal(await select.inputValue(), 'minecraft:glass');
  assert.deepEqual(await readActive(), original); record(stage);

  stage = 'oversized sparse draft shows a recoverable error and disables download';
  await dialog.getByRole('button', { name: 'Close Export drafts & mapping preview', exact: true }).click();
  const sparse = structuredClone(original); sparse.world.worldName = 'Sparse export fixture\nvar injected_marker = 123\n#';
  const base = structuredClone(Object.values(sparse.blocks)[0]);
  sparse.blocks = { '-1000000,0,0': { ...base, id: 'fixture-left', position: { x: -1000000, y: 0, z: 0 } }, '1000000,0,0': { ...base, id: 'fixture-right', position: { x: 1000000, y: 0, z: 0 } } };
  await page.getByLabel('Open a project file as a copy').setInputFiles({ name: 'sparse.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sparse)) });
  await page.waitForFunction(() => document.body.innerText.includes('Sparse export fixture')); await ready();
  await openExport(); await dialog.getByRole('button', { name: 'Schematic JSON draft', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'bounding box exceeds' }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Download draft', exact: true }).isDisabled(), true);
  assert.equal(Object.keys((await readActive()).blocks).length, 2); record(stage);

  stage = 'Godot draft keeps a multiline imported project name inside comments';
  await dialog.getByRole('button', { name: 'GDScript 4 (.gd)', exact: true }).click();
  const scriptWaiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download draft', exact: true }).click();
  const scriptFile = await scriptWaiting, scriptText = await readFile(await scriptFile.path(), 'utf8');
  assert.match(scriptFile.suggestedFilename(), /_builder\.gd$/);
  assert.ok(scriptText.includes('injected_marker'));
  assert.equal(scriptText.split('\n').some(line => !line.startsWith('#') && line.includes('injected_marker')), false);
  assert.match(scriptText.split('\n')[0], /unqualified/);
  record(stage);

  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ name: stage, ok: false, error: String(error) });
  console.error(error); if (page) console.error((await page.locator('body').innerText()).slice(-4500)); process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-export-drafts-results.json', JSON.stringify({ testedAt: new Date().toISOString(), bundleAssets, results, errors, providerRequests: 'intercepted locally; no provider execution', nativeImport: 'NOT_RUN' }, null, 2));
}
