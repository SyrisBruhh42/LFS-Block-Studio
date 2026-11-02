// Real export component with controlled async producer. Not full-App/native qualification.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use disposable loopback component fixtures.');
const paths = ['../../src/components/DraggableWindow.tsx', '../../src/engine/windowLayoutEngine.ts', '../../src/components/StudioJavaExportModal.tsx', '../../src/components/StudioJavaExportModal.css', '../../src/components/SchematicExportModal.tsx', '../../src/lib/studioJavaExport.ts', './java-export-ui.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')])));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--disable-background-networking', '--no-first-run', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const report = { startedAt: new Date().toISOString(), browser: browser.version(), sourceBefore: await hashes(), results: [], pageErrors: [], limitations: ['Mounted components and controlled encode completion in disposable Chromium. Generated Blob downloads observed; no OS file saving, provider or native game operation.', 'App/download semantic qualification has a separate runner. Not full accessibility, other browsers, hardware or release acceptance.'] };
async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__java-export-ui__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div></body></html>` });
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => report.pageErrors.push(error.message)); await page.goto(`${origin}/__java-export-ui__`);
  await page.evaluate(async options => {
    const rm = await import('/node_modules/.vite/deps/react.js'), React = rm.default ?? rm;
    const cm = await import('/node_modules/.vite/deps/react-dom_client.js'), { createRoot } = cm.default ?? cm;
    const [{ StudioJavaExportModal }, { SchematicExportModal }, { makeStudioDocument }, { captureJavaDefinitionBinding }, { candidateJavaTarget }, { encodeStudioJavaExport }] = await Promise.all([
      import('/src/components/StudioJavaExportModal.tsx'), import('/src/components/SchematicExportModal.tsx'), import('/src/lib/studioDocument.test-fixtures.ts'), import('/src/engine/javaCellMapping.ts'), import('/src/lib/studioTargetPolicy.ts'), import('/src/lib/studioJavaExport.ts'),
    ]);
    const document = makeStudioDocument(); const base = document.customBlocks.cobble_brick;
    document.schemaVersion = 2; document.revision = 1; document.blocks = {}; document.customBlocks = {}; document.blueprints = [];
    const bindings = [];
    for (let i = 0; i < (options.count ?? 1); i++) {
      const id = `qa-${i}`, definition = { ...base, id, name: `Fixture block ${i}` };
      document.customBlocks[id] = definition; document.blocks[`${i},0,0`] = { id: `instance-${i}`, blockDefId: id, position: { x: i, y: 0, z: 0 }, rotation: 0 };
      const captured = captureJavaDefinitionBinding(definition, 'minecraft:cobblestone'); if (!captured.ok) throw new Error('Bad fixture mapping'); bindings.push(captured.binding);
    }
    document.targetPolicy = { policyVersion: 1, checkpoint: { documentId: document.documentId, revision: 0, historyEpoch: 'before' }, target: candidateJavaTarget(bindings, options.locked !== false) };
    const state = window.__javaExportFixture = { calls: [], downloads: [], sequence: 0, closed: 0, encodeMode: options.immediate ? 'immediate' : 'deferred' };
    const token = () => JSON.stringify({ documentId: document.documentId, historyEpoch: document.historyEpoch, sessionId: 'ui-session', editRevision: state.sequence });
    state.actualToken = token();
    const blobs = new Map(); let urlId = 0;
    URL.createObjectURL = blob => { const url = `blob:${location.origin}/java-fixture-${++urlId}`; blobs.set(url, blob); return url; };
    URL.revokeObjectURL = url => { blobs.delete(url); };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (!this.download) return originalClick.call(this); const blob = blobs.get(this.href); if (!blob) throw new Error('Missing download blob'); state.downloads.push({ name: this.download, size: blob.size, type: blob.type }); };
    function Harness() {
      const [open, setOpen] = React.useState(false), [source, setSource] = React.useState({ document, sourceToken: state.actualToken });
      state.open = () => setOpen(true); state.hide = () => setOpen(false);
      state.denyWithoutRender = () => { state.actualToken = 'source-changed-before-render'; };
      state.advance = () => { state.sequence++; state.actualToken = token(); setSource(previous => ({ document: { ...previous.document, world: { ...previous.document.world, description: `revision-${state.sequence}` } }, sourceToken: state.actualToken })); };
      state.lock = locked => { state.sequence++; state.actualToken = token(); setSource(previous => ({ document: { ...previous.document, targetPolicy: { ...previous.document.targetPolicy, target: { ...previous.document.targetPolicy.target, locked } } }, sourceToken: state.actualToken })); };
      const common = { isOpen: open, onClose() { state.closed++; setOpen(false); }, sourceToken: source.sourceToken, isCurrentSource: value => value === state.actualToken, selection: null };
      const component = options.wrapper ? React.createElement(SchematicExportModal, { ...common, studioDocument: source.document, worldName: source.document.world.worldName, blocks: source.document.blocks, customBlocks: source.document.customBlocks })
        : React.createElement(StudioJavaExportModal, { ...common, document: source.document,
          onEncode(plan, signal) {
            const call = { plan, signal }; state.calls.push(call);
            if (state.encodeMode === 'immediate') return encodeStudioJavaExport(plan, signal);
            if (state.encodeMode === 'fail') return Promise.reject(new Error('Fixture compression failure.'));
            return new Promise((resolve, reject) => { call.resolve = async () => resolve(await encodeStudioJavaExport(plan)); call.reject = () => reject(new Error('Late fixture failure.')); });
          },
        });
      return React.createElement(React.Fragment, null, React.createElement('button', { onClick: () => setOpen(true) }, 'Open export fixture'), component);
    }
    const root = createRoot(window.document.getElementById('root')); state.unmount = () => root.unmount(); root.render(React.createElement(Harness));
  }, options);
  await page.getByRole('button', { name: 'Open export fixture', exact: true }).click(); await page.getByRole('dialog', { name: 'Java schematic export', exact: true }).waitFor();
  return { page, context };
}
async function run(name, options, test) {
  if (process.env.QA_CASE && !name.includes(process.env.QA_CASE)) return;
  const { page, context } = await fixture(options);
  try { await test(page); report.results.push({ name, ok: true }); }
  catch (error) { report.results.push({ name, ok: false, error: error.message }); }
  finally { console.log(JSON.stringify(report.results.at(-1))); await context.close(); }
}
const panel = page => page.getByRole('dialog', { name: 'Java schematic export', exact: true });
const reviewed = page => panel(page).getByRole('region', { name: 'Reviewed schematic export', exact: true });
const reviewButton = page => panel(page).getByRole('button', { name: 'Review schematic export', exact: true });
const prepareButton = page => panel(page).getByRole('button', { name: 'Download experimental .schem', exact: true });
const acknowledgement = page => panel(page).getByRole('checkbox', { name: 'I reviewed the scope, paste anchor, mapped states and air cells.', exact: true });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const state = page => page.evaluate(() => ({ calls: window.__javaExportFixture.calls.map(call => ({ name: call.plan.input.name, id: call.plan.id, token: call.plan.sourceToken, aborted: call.signal.aborted })), downloads: window.__javaExportFixture.downloads }));
async function review(page, name = 'Submitted A') {
  await panel(page).getByLabel('Schematic name', { exact: true }).fill(name); await panel(page).getByRole('button', { name: 'Use world origin as paste anchor', exact: true }).click();
  await reviewButton(page).click(); await reviewed(page).waitFor();
}
async function acknowledged(page, name) { await review(page, name); await acknowledgement(page).check(); }
async function resolve(page, index = 0) { await page.evaluate(async i => { await window.__javaExportFixture.calls[i].resolve(); }, index); await settle(page); }
try {
  await run('explicit anchor and acknowledgement are required; reviewed mappings are readonly', {}, async page => {
    assert.equal(await panel(page).getByLabel('Paste anchor X', { exact: true }).inputValue(), ''); await reviewButton(page).click(); await panel(page).getByRole('alert').filter({ hasText: 'Choose a paste anchor explicitly' }).waitFor();
    await review(page); assert.equal(await prepareButton(page).isEnabled(), false); assert.equal(await panel(page).locator('[data-testid^="block-map-select-"]').count(), 0);
    assert.ok((await reviewed(page).innerText()).includes('minecraft:cobblestone')); await acknowledgement(page).check(); assert.equal(await prepareButton(page).isEnabled(), true);
  });
  await run('rapid duplicate submits call the producer once and downloads retain exact reviewed identity', {}, async page => {
    await acknowledged(page); await prepareButton(page).evaluate(button => { button.click(); button.click(); }); assert.equal((await state(page)).calls.length, 1);
    await resolve(page); const result = await state(page); assert.equal(result.downloads.length, 1); assert.ok(result.downloads[0].size > 0); assert.match(result.downloads[0].name, /submitted_a.*\.schem$/);
    await panel(page).getByRole('button', { name: 'Download export report', exact: true }).click(); assert.equal((await state(page)).downloads.length, 2);
  });
  await run('editing the draft cancels pending work and late success cannot erase the new settings', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await panel(page).getByLabel('Schematic name', { exact: true }).fill('New draft B');
    assert.equal((await state(page)).calls[0].aborted, true); await resolve(page); assert.equal((await state(page)).downloads.length, 0);
    assert.equal(await panel(page).getByLabel('Schematic name', { exact: true }).inputValue(), 'New draft B'); assert.equal(await reviewed(page).count(), 0);
  });
  await run('old completion cannot clear a newer pending export', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await acknowledged(page, 'New submitted B'); await prepareButton(page).click(); assert.equal((await state(page)).calls.length, 2);
    await resolve(page, 0); assert.equal((await state(page)).downloads.length, 0); assert.equal(await panel(page).getByRole('button', { name: 'Preparing schematic…', exact: true }).isDisabled(), true);
    await resolve(page, 1); assert.equal((await state(page)).downloads.length, 1); assert.match((await state(page)).downloads[0].name, /new_submitted_b/);
  });
  await run('closing and reopening rotates export generation; dismissed completion downloads nothing', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await panel(page).getByRole('button', { name: 'Close Java schematic export', exact: true }).click();
    await page.getByRole('button', { name: 'Open export fixture', exact: true }).click(); await panel(page).getByLabel('Schematic name', { exact: true }).fill('Reopened C');
    await resolve(page); assert.equal((await state(page)).downloads.length, 0); assert.equal(await panel(page).getByLabel('Schematic name', { exact: true }).inputValue(), 'Reopened C'); assert.equal(await reviewed(page).count(), 0);
  });
  await run('source change aborts and invalidates pending export while preserving chosen settings', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await page.evaluate(() => window.__javaExportFixture.advance());
    await panel(page).getByRole('status').filter({ hasText: 'project or selection changed' }).waitFor(); await resolve(page);
    assert.equal((await state(page)).calls[0].aborted, true); assert.equal((await state(page)).downloads.length, 0); assert.equal(await panel(page).getByLabel('Schematic name', { exact: true }).inputValue(), 'Submitted A'); assert.equal(await reviewed(page).count(), 0);
  });
  await run('live session getter prevents submission even before React receives changed props', {}, async page => {
    await acknowledged(page); await page.evaluate(() => window.__javaExportFixture.denyWithoutRender()); await prepareButton(page).click();
    await panel(page).getByRole('alert').filter({ hasText: 'no longer identifies the active source' }).waitFor(); assert.equal((await state(page)).calls.length, 0); assert.equal((await state(page)).downloads.length, 0);
  });
  await run('Cancel releases the pending producer; late success and rejection cannot publish', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await panel(page).getByRole('button', { name: 'Cancel export', exact: true }).click();
    assert.equal((await state(page)).calls[0].aborted, true); await resolve(page); assert.equal((await state(page)).downloads.length, 0);
    await prepareButton(page).click(); await panel(page).getByRole('button', { name: 'Cancel export', exact: true }).click(); await page.evaluate(() => window.__javaExportFixture.calls[1].reject()); await settle(page);
    assert.equal((await state(page)).downloads.length, 0); assert.equal(await prepareButton(page).isEnabled(), true);
  });
  await run('encode failure retains reviewed inputs for explicit retry', {}, async page => {
    await acknowledged(page); await page.evaluate(() => { window.__javaExportFixture.encodeMode = 'fail'; }); await prepareButton(page).click();
    await panel(page).getByRole('alert').filter({ hasText: 'Fixture compression failure.' }).waitFor(); assert.equal(await panel(page).getByLabel('Schematic name', { exact: true }).inputValue(), 'Submitted A'); assert.equal(await acknowledgement(page).isChecked(), true);
    await page.evaluate(() => { window.__javaExportFixture.encodeMode = 'deferred'; }); await prepareButton(page).click(); await resolve(page, 1); assert.equal((await state(page)).downloads.length, 1);
  });
  await run('prepared report cannot download after the actual source changes without a render', { immediate: true }, async page => {
    await acknowledged(page); await prepareButton(page).click(); await panel(page).getByRole('button', { name: 'Download export report', exact: true }).waitFor();
    assert.equal((await state(page)).downloads.length, 1); await page.evaluate(() => window.__javaExportFixture.denyWithoutRender()); await panel(page).getByRole('button', { name: 'Download export report', exact: true }).click();
    await panel(page).getByRole('alert').filter({ hasText: 'source changed' }).waitFor(); assert.equal((await state(page)).downloads.length, 1);
  });
  await run('25 reviewed material mappings page without changing approval or the prepared scope', { count: 25 }, async page => {
    await acknowledged(page); assert.equal(await reviewed(page).locator('.studio-java-export__materials li').count(), 20);
    await reviewed(page).getByRole('button', { name: 'Next mappings', exact: true }).click(); assert.equal(await reviewed(page).locator('.studio-java-export__materials li').count(), 5); assert.equal(await acknowledgement(page).isChecked(), true); assert.equal(await prepareButton(page).isEnabled(), true);
  });
  await run('unmount aborts work and the old producer cannot start a download', {}, async page => {
    await acknowledged(page); await prepareButton(page).click(); await page.evaluate(() => window.__javaExportFixture.unmount()); await resolve(page);
    assert.equal((await state(page)).calls[0].aborted, true); assert.equal((await state(page)).downloads.length, 0);
  });
  await run('wrapper offers heuristic drafts only while Java is unlocked and immediately removes them on lock', { wrapper: true, locked: false }, async page => {
    await panel(page).getByRole('button', { name: 'Other draft formats (unlocked)', exact: true }).click(); const legacy = page.getByRole('dialog', { name: 'Export drafts & mapping preview', exact: true }); await legacy.waitFor();
    assert.ok((await legacy.innerText()).includes('Java profile is unlocked')); assert.equal(await legacy.getByTestId('ai-evaluate-blocks-btn').count(), 1);
    await page.evaluate(() => window.__javaExportFixture.lock(true)); await panel(page).waitFor(); assert.equal(await legacy.count(), 0); assert.equal(await panel(page).getByRole('button', { name: 'Other draft formats (unlocked)', exact: true }).count(), 0); assert.equal(await page.getByTestId('ai-evaluate-blocks-btn').count(), 0);
  });
} finally {
  report.sourceAfter = await hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); report.finishedAt = new Date().toISOString(); await browser.close();
  report.ok = report.sourceStable && report.results.length > 0 && report.results.every(row => row.ok) && !report.pageErrors.length;
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-java-export-ui-results.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ ok: report.ok, tests: report.results.length, sourceStable: report.sourceStable, pageErrors: report.pageErrors })); if (!report.ok) process.exitCode = 1;
}
