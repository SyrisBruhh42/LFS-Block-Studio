// Actual menu, scene selection and preferences in disposable production-preview contexts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Require a frozen disposable loopback build.');
const preferenceKey = 'lfs_studio_workspace_prefs_v1';
const report = { startedAt: new Date().toISOString(), origin, assets: [], results: [], pageErrors: [], screenshots: [], limitations: ['Desktop Chromium/software WebGL and emulated coarse pointer only. No physical touch/pen, screen-reader, other browser, provider, native game or release acceptance.', '60-cell paged scene fixture; no supported capacity or performance claim.', 'Themes and independent comfort controls cover the new menu; existing studio panels are not restyled by this slice.'] };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...value }) => value;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--disable-background-networking', '--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let page, context, stage = 'startup';
const record = extra => { report.results.push({ name: stage, ok: true, ...extra }); console.log(JSON.stringify(report.results.at(-1))); };
async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true, ...options.device });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
  if (options.future || options.denied) await context.addInitScript(({ preferenceKey, future, denied }) => {
    if (future) localStorage.setItem(preferenceKey, JSON.stringify({ schemaVersion: 9, untouched: 'future preferences' }));
    if (denied) { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === preferenceKey) throw new DOMException('Quota fixture', 'QuotaExceededError'); return original.call(this, key, value); }; }
  }, { preferenceKey, future: options.future, denied: options.denied });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message)); await page.goto(origin);
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 }); await ready();
  const menu = page.getByRole('dialog', { name: 'Your workspace', exact: true });
  const opener = page.getByRole('button', { name: 'Find studio actions', exact: true });
  const open = async () => { await opener.click(); await menu.waitFor(); };
  const close = async () => { await menu.getByRole('button', { name: 'Close studio menu', exact: true }).click(); await menu.waitFor({ state: 'hidden' }); };
  return { context, page, saving, ready, menu, opener, open, close };
}
async function download(page, button) { const pending = page.waitForEvent('download'); await button.click(); const file = await pending, stream = await file.createReadStream(), parts = []; for await (const part of stream) parts.push(part); return Buffer.concat(parts); }
const contrast = (a, b) => {
  const l = color => { const c = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
  const [x, y] = [l(a), l(b)].sort((a, b) => a - b); return (y + .05) / (x + .05);
};
try {
  const f = await fixture(); ({ page, context } = f);
  const { saving, ready, menu, opener, open, close } = f;
  report.assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  assert.ok(report.assets.some(url => url.endsWith('/' + process.env.QA_EXPECTED_JS)));
  const live = async () => JSON.parse((await download(page, saving.getByRole('button', { name: 'Project backup', exact: true }))).toString('utf8'));
  const storage = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('lfs_studio_documents_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readonly'), requests = ['metadata', 'revisions', 'candidates'].map(name => tx.objectStore(name).getAll()); tx.oncomplete = () => resolve(requests.map(r => r.result)); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const command = async text => { const input = page.getByLabel('WorldEdit Command Input', { exact: true }); await input.fill(text); await input.press('Enter'); await settle(); };
  const fixtureDocument = await live(); delete fixtureDocument.targetPolicy; fixtureDocument.schemaVersion = 1; fixtureDocument.world.worldName = 'Workspace menu fixture'; fixtureDocument.blueprints = [];
  const base = Object.values(fixtureDocument.customBlocks)[0];
  fixtureDocument.customBlocks = { qa_scene_cube: { ...base, id: 'qa_scene_cube', name: 'Oasis marker Ω — scene cell with a long readable label', shape: 'cube', width: 1, depth: 1, heightPlates: 3, isCustom: true } };
  fixtureDocument.customBlocks.qa_scene_alt = { ...fixtureDocument.customBlocks.qa_scene_cube, id: 'qa_scene_alt', name: 'Alternate scene marker', color: '#008800' };
  fixtureDocument.blocks = Object.fromEntries(Array.from({ length: 60 }, (_, i) => { const p = { x: i * 2 - 20, y: 2, z: 7 }; return [`${p.x},${p.y},${p.z}`, { id: `scene-${i}`, blockDefId: 'qa_scene_cube', position: p, rotation: 0 }]; }));
  await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'workspace-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixtureDocument)) });
  await saving.getByText('Workspace menu fixture', { exact: true }).waitFor(); await ready();
  const baseline = authored(await live()), storedBefore = await storage(), canvas = await page.locator('canvas').first().elementHandle();
  const unchanged = async () => { assert.deepEqual(authored(await live()), baseline); assert.equal(await canvas.evaluate(node => node.isConnected && node === document.querySelector('canvas')), true); };

  stage = 'native menu focus, search and keyboard activation preserve the canvas and authored source';
  await opener.focus(); await opener.press('Enter'); await menu.waitFor();
  assert.equal(await menu.getByRole('searchbox', { name: 'Find studio actions', exact: true }).evaluate(node => node === document.activeElement), true);
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.equal(await menu.evaluate(node => node.contains(document.activeElement)), true); }
  const actionSearch = menu.getByRole('searchbox', { name: 'Find studio actions', exact: true });
  await actionSearch.fill('no matching action zzz'); await menu.getByText('No matching action.', { exact: false }).waitFor();
  await menu.getByRole('button', { name: 'Clear action search', exact: true }).click();
  await actionSearch.fill('Pan camera'); await actionSearch.press('Enter'); assert.equal(await menu.isVisible(), true);
  await page.keyboard.press('Enter'); await menu.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('[aria-label="Camera navigation"] button[aria-pressed="true"]')?.textContent === 'Pan');
  assert.equal(await page.getByRole('region', { name: 'Camera navigation', exact: true }).getByRole('button', { name: 'Pan', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await opener.evaluate(node => node === document.activeElement), true);
  await unchanged(); assert.deepEqual(await storage(), storedBefore); record();

  stage = 'opening an existing review from search survives native menu close and does not change the build';
  await open(); await actionSearch.fill('compatibility lock'); await menu.getByRole('button', { name: 'Target Review game compatibility lock', exact: true }).click();
  const compatibility = page.getByRole('dialog', { name: 'Game compatibility', exact: true }); await compatibility.waitFor(); await settle(); assert.equal(await compatibility.isVisible(), true);
  await compatibility.getByRole('button', { name: 'Dismiss', exact: true }).click(); await unchanged(); record();

  stage = 'paged scene discovery and inspection are read-only; explicit cell selection shares actual Undo and Redo';
  await open(); await menu.getByRole('button', { name: 'Scene & inspect', exact: true }).click();
  assert.equal(await menu.getByRole('list', { name: 'Scene cells', exact: true }).getByRole('button').count(), 25);
  await menu.getByRole('button', { name: 'Next cells', exact: true }).click(); await menu.getByRole('button', { name: 'Next cells', exact: true }).click();
  await menu.getByRole('button', { name: /Inspect .* at 98, 2, 7$/ }).click();
  const inspector = menu.getByRole('region', { name: 'Cell inspector', exact: true }); await inspector.getByText('98, 2, 7', { exact: true }).waitFor();
  await close(); await unchanged(); assert.deepEqual(await storage(), storedBefore);
  await open(); await menu.getByRole('button', { name: 'Scene & inspect', exact: true }).click(); await inspector.getByRole('button', { name: 'Select this cell', exact: true }).click();
  const selectionState = async selected => page.getByTestId('scene-telemetry-hud').getByText(selected ? /Sel:\s*1×1×1\s*\(1\)/ : 'Sel: None', { exact: !selected }).waitFor();
  await close(); await selectionState(true);
  await command('//set qa_scene_alt');
  const changed = authored(await live()); assert.equal(changed.blocks['98,2,7'].blockDefId, 'qa_scene_alt');
  for (const [key, cell] of Object.entries(changed.blocks)) if (key !== '98,2,7') assert.deepEqual(cell, baseline.blocks[key]);
  await command('//undo'); await unchanged(); await command('//undo'); await selectionState(false); await command('//redo'); await selectionState(true); await command('//undo'); await selectionState(false);
  await unchanged(); record({ selectedCell: [98, 2, 7], actualHistoryDirections: true });

  stage = 'menu themes, text, targets and width are independent, source-neutral and use readable token pairs';
  await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); const beforeComfort = await storage();
  await open(); await menu.getByRole('button', { name: 'Menu comfort', exact: true }).click();
  const text = menu.getByLabel('Menu text size', { exact: true }), targets = menu.getByLabel('Menu control size', { exact: true }), theme = menu.getByLabel('Menu theme', { exact: true });
  const metrics = () => theme.evaluate(node => { const s = getComputedStyle(node); return { font: parseFloat(s.fontSize), target: s.minHeight, foreground: s.color, background: s.backgroundColor, border: s.borderTopColor }; });
  await targets.selectOption('56'); const initial = await metrics(); await text.selectOption('200'); const large = await metrics(); assert.equal(large.font, initial.font * 2); assert.equal(large.target, initial.target);
  await targets.selectOption('36'); const compact = await metrics(); assert.equal(compact.font, large.font); assert.notEqual(compact.target, large.target);
  const colors = [];
  for (const id of ['evergreen-dark', 'evergreen-light', 'high-contrast', 'calm']) { await theme.selectOption(id); const m = await metrics(); const pair = { theme: id, textContrast: contrast(m.foreground, m.background), boundaryContrast: contrast(m.border, m.background) }; assert.ok(pair.textContrast >= 4.5, JSON.stringify(pair)); assert.ok(pair.boundaryContrast >= 3, JSON.stringify(pair)); colors.push(pair); }
  await text.selectOption('100'); await theme.selectOption('evergreen-light'); await menu.getByLabel('Menu width', { exact: true }).selectOption('1120');
  const screenshot = process.env.QA_SCREENSHOT ?? '/tmp/studio-oasis-menu.png'; await menu.screenshot({ path: screenshot }); report.screenshots.push(screenshot);
  await close(); await unchanged(); assert.deepEqual(await storage(), beforeComfort);
  await command('//redo'); await selectionState(true); await command('//undo'); await selectionState(false); record({ colors, preferencesPreservedPendingRedo: true });

  stage = '200 percent menu text reflows at 320 CSS pixels without horizontal loss of controls';
  await page.setViewportSize({ width: 320, height: 900 }); await open(); await menu.getByRole('button', { name: 'Menu comfort', exact: true }).click();
  await text.selectOption('200'); await targets.selectOption('56'); await theme.selectOption('high-contrast'); await menu.getByLabel('Menu motion', { exact: true }).selectOption('reduced');
  const reflow = await menu.evaluate(root => ({ client: root.clientWidth, scroll: root.scrollWidth, viewport: innerWidth, width: root.getBoundingClientRect().width, controls: [...root.querySelectorAll('button,input,select')].filter(node => node.getClientRects().length).map(node => ({ label: node.getAttribute('aria-label') ?? node.textContent, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })) }));
  assert.ok(reflow.scroll <= reflow.client + 1, JSON.stringify(reflow)); assert.ok(reflow.width <= 304.5);
  for (const item of reflow.controls) assert.ok(item.left >= 7 && item.right <= 313, JSON.stringify(item));
  await menu.getByRole('button', { name: 'Scene & inspect', exact: true }).click();
  await menu.getByRole('searchbox', { name: 'Search scene cells', exact: true }).fill('98, 2, 7');
  await menu.getByRole('button', { name: /Inspect .* at 98, 2, 7$/ }).click(); assert.equal(await menu.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  const narrow = screenshot.replace(/\.png$/, '-narrow.png'); await menu.screenshot({ path: narrow }); report.screenshots.push(narrow);
  await close(); await unchanged(); record({ viewportCssPixels: 320, textPercent: 200 });

  stage = 'preferences survive reload while local project naming remains one undoable authored edit';
  await page.reload(); await ready(); await open(); await menu.getByRole('button', { name: 'Menu comfort', exact: true }).click(); assert.equal(await text.inputValue(), '200'); assert.equal(await targets.inputValue(), '56'); assert.equal(await theme.inputValue(), 'high-contrast');
  await menu.getByRole('button', { name: 'Project details', exact: true }).click(); await menu.getByLabel('Local project name', { exact: true }).fill('A locally named build Ω'); await menu.getByRole('button', { name: 'Apply project name', exact: true }).click();
  await menu.getByRole('status').filter({ hasText: 'Project renamed' }).waitFor(); await close(); assert.equal((await live()).world.worldName, 'A locally named build Ω');
  await command('//undo'); assert.deepEqual(authored(await live()), baseline); await command('//redo'); assert.equal((await live()).world.worldName, 'A locally named build Ω');
  await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); await page.reload(); await ready(); assert.equal((await live()).world.worldName, 'A locally named build Ω'); record();
  await context.close(); context = undefined;

  for (const scenario of ['future', 'denied']) {
    stage = `${scenario} preference storage preserves originals and gives honest session-only feedback`;
    const f = await fixture({ [scenario]: true }); ({ page, context } = f); await f.open(); await f.menu.getByRole('button', { name: 'Menu comfort', exact: true }).click();
    const original = await page.evaluate(key => localStorage.getItem(key), preferenceKey); await f.menu.getByLabel('Menu text size', { exact: true }).selectOption('150');
    await f.menu.getByRole('status').filter({ hasText: 'session' }).waitFor(); assert.equal(await f.menu.getByLabel('Menu text size', { exact: true }).inputValue(), '150'); assert.equal(await page.evaluate(key => localStorage.getItem(key), preferenceKey), original); record(); await context.close(); context = undefined;
  }
  stage = 'emulated coarse-pointer menu controls retain at least 48 CSS-pixel targets';
  const touch = await fixture({ device: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }); ({ page, context } = touch); await touch.open();
  const dimensions = await touch.menu.locator('button,input,select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, text: node.textContent })));
  assert.ok(dimensions.length > 10); for (const d of dimensions) assert.ok(d.width >= 48 && d.height >= 48, JSON.stringify(d)); record({ controls: dimensions.length, physicalDeviceQualification: 'NOT_RUN' });
  assert.deepEqual(report.pageErrors, []);
} catch (error) { report.error = error.stack ?? String(error); report.results.push({ name: stage, ok: false, error: report.error }); if (page) report.failureUi = (await page.locator('body').innerText().catch(() => '')).slice(-6500); }
finally { await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString(); report.ok = !report.error && report.pageErrors.length === 0; await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-workspace-menu-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, error: report.error })); if (!report.ok) process.exitCode = 1; }
