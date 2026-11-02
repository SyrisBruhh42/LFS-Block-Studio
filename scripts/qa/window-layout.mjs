// Mounted layout/input tasks in disposable Chromium. No application/provider/native acceptance.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a disposable loopback fixture.');
const paths = ['../../src/components/DraggableWindow.tsx', '../../src/engine/windowLayoutEngine.ts', '../../src/index.css', './window-layout.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(await readFile(new URL(p, import.meta.url))).digest('hex')])));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--disable-background-networking', '--no-first-run', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const report = { startedAt: new Date().toISOString(), browser: browser.version(), sourceBefore: await hashes(), results: [], pageErrors: [], limitations: ['Mounted real window/HUD components and real mouse/keyboard tasks; selected cancellation/secondary-pointer events are synthetic. No physical touch/pen, assistive-technology or full accessibility acceptance.', 'App project/history/export invariants are qualified separately on a frozen application build. No provider requests or normal browser/user storage.'] };
async function fixture(options = {}) {
 const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, serviceWorkers: 'block' });
 await context.route('**/*', route => {
  const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
  if (url.pathname === '/__window-layout__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root" style="height:100vh"></div></body></html>' });
  return route.continue();
 });
 const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => report.pageErrors.push(error.message));
 await page.goto(`${origin}/__window-layout__`);
 await page.evaluate(async options => {
  await import('/src/index.css');
  const rm = await import('/node_modules/.vite/deps/react.js'), React = rm.default ?? rm;
  const dm = await import('/node_modules/.vite/deps/react-dom_client.js'), { createRoot } = dm.default ?? dm;
  const { DraggableWindow, DraggableHudOverlay, triggerResetAllStudioWindows } = await import('/src/components/DraggableWindow.tsx');
  localStorage.setItem('qa-project-sentinel', JSON.stringify({ id: 'authored-example', cells: [{ x: -3, y: 2, z: 4 }] }));
  if (options.future) localStorage.setItem('lfs_studio_window_rects_v1', JSON.stringify({ schemaVersion: 7, untouched: 'future source' }));
  if (options.denied) {
   const set = Storage.prototype.setItem;
   Storage.prototype.setItem = function(key, value) { if (key.startsWith('lfs_studio_')) throw new DOMException('Quota fixture', 'QuotaExceededError'); return set.call(this, key, value); };
  }
  const state = window.__layoutFixture = { clicks: 0, reset: triggerResetAllStudioWindows };
  function Harness() {
   const [open, setOpen] = React.useState(true), [clicks, setClicks] = React.useState(0);
   state.hide = () => setOpen(false); state.show = () => setOpen(true);
   return React.createElement(React.Fragment, null,
    React.createElement(DraggableWindow, { windowId: 'layout-a', title: 'Window A', isOpen: open, testId: 'layout-a', defaultWidth: 520, defaultHeight: 520, defaultX: 30, defaultY: 45, defaultPinnedFloating: false, onClose: () => setOpen(false) }, React.createElement('p', null, 'Window A content')),
    options.two ? React.createElement(DraggableWindow, { windowId: 'layout-b', title: 'Window B', testId: 'layout-b', defaultWidth: 470, defaultHeight: 520, defaultX: 700, defaultY: 45 }, React.createElement('p', null, 'Window B content')) : null,
    React.createElement(DraggableHudOverlay, { hudId: 'sample', label: 'Sample toolbar', testId: 'sample-hud', defaultXPercent: 50, defaultYPercent: 84 }, React.createElement('button', { type: 'button', onClick: () => { state.clicks++; setClicks(state.clicks); } }, 'Toolbar action ' + clicks)));
  }
  createRoot(document.getElementById('root')).render(React.createElement(Harness));
 }, options);
 await page.getByTestId('layout-a').waitFor();
 const close = context.close.bind(context);
 context.close = async () => {
  report.lastFixture = await page.evaluate(() => ({
   text: document.body.innerText.slice(0, 5000),
   fields: [...document.querySelectorAll('input')].map(node => ({ name: node.getAttribute('aria-label'), value: node.value, valid: node.checkValidity(), validationMessage: node.validationMessage })),
   statuses: [...document.querySelectorAll('[role="status"]')].map(node => node.textContent),
   disclosures: [...document.querySelectorAll('details')].map(node => ({ open: node.open })),
  })).catch(() => null);
  return close();
 };
 return { page, context, root: page.locator('[data-window-id="layout-a"]') };
}
async function layout(f, keyboard = false) {
 const summary = f.root.locator('summary[aria-label="Window layout for Window A"]');
 // Select the native disclosure by its explicit accessible label; the outer test ID includes the backdrop.
 if (keyboard) { await summary.focus(); await summary.press('Enter'); } else await summary.click();
 return f.root.getByRole('form', { name: 'Window layout controls for Window A' });
}
const box = root => root.boundingBox();
async function apply(form, values) { for (const [name, value] of Object.entries(values)) await form.getByRole('spinbutton', { name: 'Window ' + name, exact: true }).fill(String(value)); await form.getByRole('button', { name: 'Apply window layout', exact: true }).click(); }
async function run(name, task) { const start = Date.now(); await task(); report.results.push({ name, ok: true, elapsedMs: Date.now() - start }); console.log(JSON.stringify(report.results.at(-1))); }
try {
 await run('numeric position/size fields work without drag and persist exact layout', async () => {
  const f = await fixture(); try {
   const form = await layout(f, true); await apply(form, { x: 130, y: 100, width: 580, height: 590 });
   await form.getByRole('status').filter({ hasText: 'applied and saved' }).waitFor();
   await f.page.waitForFunction(() => Math.abs(document.querySelector('[data-window-id="layout-a"]').getBoundingClientRect().height - 590) < 0.5);
   const actual = await box(f.root); assert.equal(actual.x, 130); assert.equal(actual.y, 100); assert.equal(actual.width, 580); assert.equal(actual.height, 590);
   const stored = await f.page.evaluate(() => JSON.parse(localStorage.getItem('lfs_studio_window_rects_v1'))['layout-a']); assert.deepEqual(stored, { x: 130, y: 100, width: 580, height: 590 });
  } finally { await f.context.close(); }
 });
 await run('invalid dimensions retain the draft and do not write preferences', async () => {
  const f = await fixture(); try { const before = await box(f.root), form = await layout(f); await apply(form, { width: -1 }); await form.getByRole('status').filter({ hasText: 'positive dimensions' }).waitFor(); assert.deepEqual(await box(f.root), before); assert.equal(await f.page.evaluate(() => localStorage.getItem('lfs_studio_window_rects_v1')), null); assert.equal(await form.getByRole('spinbutton', { name: 'Window width', exact: true }).inputValue(), '-1'); } finally { await f.context.close(); }
 });
 await run('off-screen layout is clamped and centering remains reachable', async () => {
  const f = await fixture(); try { const form = await layout(f); await apply(form, { x: 90000, y: -90000 }); let b = await box(f.root); assert.ok(b.x >= 8 && b.x + b.width <= 1192 && b.y >= 8 && b.y + b.height <= 942); await form.getByRole('button', { name: 'Center and restore size' }).click(); b = await box(f.root); assert.ok(b.x > 100 && b.x < 600 && b.y >= 8); } finally { await f.context.close(); }
 });
 await run('future preference data is retained and session-only feedback is honest', async () => {
  const f = await fixture({ future: true }); try { const raw = await f.page.evaluate(() => localStorage.getItem('lfs_studio_window_rects_v1')), form = await layout(f); await apply(form, { x: 150 }); await form.getByRole('status').filter({ hasText: 'could not be saved' }).waitFor(); assert.equal(await f.page.evaluate(() => localStorage.getItem('lfs_studio_window_rects_v1')), raw); assert.equal((await box(f.root)).x, 150); } finally { await f.context.close(); }
 });
 await run('snap mode alternates and synchronizes while browser writes are denied', async () => {
  const f = await fixture({ denied: true, two: true }); try { const a = f.root.getByRole('button', { name: 'Panel snapping', exact: true }), b = f.page.getByTestId('layout-b').getByRole('button', { name: 'Panel snapping', exact: true }); assert.equal(await a.getAttribute('aria-pressed'), 'true'); await a.click(); assert.equal(await a.getAttribute('aria-pressed'), 'false'); assert.equal(await b.getAttribute('aria-pressed'), 'false'); await a.click(); assert.equal(await a.getAttribute('aria-pressed'), 'true'); assert.equal(await b.getAttribute('aria-pressed'), 'true'); } finally { await f.context.close(); }
 });
 await run('secondary pointers cannot acquire or move a window', async () => {
  const f = await fixture(); try { const before = await box(f.root), header = f.root.locator('[data-studio-window-header]'); await header.dispatchEvent('pointerdown', { pointerId: 77, isPrimary: false, button: 0, clientX: 70, clientY: 60 }); await header.dispatchEvent('pointermove', { pointerId: 77, isPrimary: false, buttons: 1, clientX: 350, clientY: 260 }); assert.deepEqual(await box(f.root), before); } finally { await f.context.close(); }
 });
 await run('actual mouse drag stops after pointer cancellation and blur', async () => {
  for (const reason of ['cancel', 'blur']) { const f = await fixture(); try { const header = f.root.locator('[data-studio-window-header]'), bounds = await header.boundingBox(), initial = await box(f.root); await f.page.mouse.move(bounds.x + 18, bounds.y + 14); await f.page.mouse.down(); await f.page.mouse.move(bounds.x + 100, bounds.y + 70, { steps: 4 }); const firstMove = await box(f.root); assert.notDeepEqual(firstMove, initial, 'The actual mouse did not move the window'); await header.dispatchEvent('pointermove', { pointerId: 77, isPrimary: false, buttons: 1, clientX: 900, clientY: 700 }); assert.deepEqual(await box(f.root), firstMove); await header.dispatchEvent('pointerup', { pointerId: 77, isPrimary: false }); await f.page.mouse.move(bounds.x + 140, bounds.y + 100, { steps: 2 }); const moved = await box(f.root); assert.notDeepEqual(moved, firstMove, 'A secondary pointer ended the primary drag'); if (reason === 'cancel') await header.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true }); else await f.page.evaluate(() => window.dispatchEvent(new Event('blur'))); await f.page.mouse.move(bounds.x + 220, bounds.y + 160, { steps: 3 }); assert.deepEqual(await box(f.root), moved); await f.page.mouse.up(); } finally { await f.context.close(); } }
 });
 await run('ordinary toolbar buttons click without repositioning the toolbar', async () => {
  const f = await fixture(); try { await f.root.getByRole('button', { name: 'Close Window A', exact: true }).click(); await f.root.waitFor({ state: 'hidden' }); const hud = f.page.getByTestId('sample-hud'), before = await box(hud); await hud.getByRole('button', { name: 'Toolbar action 0', exact: true }).click(); await hud.getByRole('button', { name: 'Toolbar action 1', exact: true }).waitFor(); assert.deepEqual(await box(hud), before); } finally { await f.context.close(); }
 });
 await run('layout reset leaves unrelated stored project data intact', async () => {
  const f = await fixture(); try { const raw = await f.page.evaluate(() => localStorage.getItem('qa-project-sentinel')), form = await layout(f); await apply(form, { x: 150 }); await f.page.evaluate(() => window.__layoutFixture.reset()); assert.equal(await f.page.evaluate(() => localStorage.getItem('qa-project-sentinel')), raw); const b = await box(f.root); assert.ok(b.x >= 8 && b.y >= 8); } finally { await f.context.close(); }
 });
 assert.deepEqual(report.pageErrors, []);
} catch (error) { report.error = error.stack ?? String(error); console.error(report.error); process.exitCode = 1; }
finally { report.sourceAfter = await hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); if (!report.sourceStable) process.exitCode = 1; report.finishedAt = new Date().toISOString(); report.ok = !report.error && report.sourceStable && report.pageErrors.length === 0; await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-window-layout.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ ok: report.ok, cases: report.results.length, sourceStable: report.sourceStable })); }
