// Actual component outcome contracts, with fake callbacks in disposable local contexts.
// This qualifies result handling, not App/controller, storage, provider or native export behavior.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Component QA requires a disposable loopback origin.');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const sourceHashes = Object.fromEntries(await Promise.all([
  '../../src/components/BlockWorkshopModal.tsx', '../../src/components/MainMenuProjectModal.tsx',
  '../../src/components/BlueprintsModal.tsx', './action-outcomes.mjs',
].map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')])));
const report = { startedAt: new Date().toISOString(), origin, browser: browser.version(), sourceHashes, results: [], pageErrors: [], limitations: ['Actual React components with controlled callbacks; no application integration, persistence, cloud publication, native game, accessibility or hardware qualification.', 'Range, color and wheel cases dispatch DOM events to actual mounted controls. They verify React result handling, not physical input hardware.'] };
async function fixture(kind) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__studio-action-outcomes__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div></body></html>` });
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push({ kind, message: error.message }));
  await page.goto(`${origin}/__studio-action-outcomes__`);
  await page.evaluate(async kind => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = clientModule.default ?? clientModule;
    const [{ MainMenuProjectModal }, { BlockWorkshopModal }, { BlueprintsModal }, { makeStudioDocument }] = await Promise.all([
      import('/src/components/MainMenuProjectModal.tsx'), import('/src/components/BlockWorkshopModal.tsx'),
      import('/src/components/BlueprintsModal.tsx'), import('/src/lib/studioDocument.test-fixtures.ts'), import('/src/index.css'),
    ]);
    const doc = makeStudioDocument();
    const state = window.__actionOutcomeFixture = { mode: 'rejected', calls: [], rawCalls: [], closed: 0, resolve: null, reject: null };
    const reset = (...args) => { state.calls.push(args); return { status: state.mode, message: state.mode === 'rejected' ? 'Fixture edit is blocked.' : undefined }; };
    const asyncResult = (...args) => {
      state.calls.push(structuredClone(args));
      state.rawCalls.push(args);
      if (state.mode === 'sync-true') return true;
      if (state.mode === 'sync-false') return false;
      if (state.mode === 'deferred') return new Promise((resolve, reject) => { state.resolve = resolve; state.reject = reject; });
      if (state.mode === 'throw') return Promise.reject(new Error('Fixture operation failed.'));
      return Promise.resolve(state.mode === 'true');
    };
    function Harness() {
      const [open, setOpen] = React.useState(true);
      state.reopen = () => setOpen(true);
      state.hide = () => setOpen(false);
      const onClose = () => { state.closed++; setOpen(false); };
      if (kind === 'reset') return React.createElement(MainMenuProjectModal, {
        isOpen: open, onClose, worldName: doc.world.worldName, onChangeWorldName() {}, blocks: doc.blocks, customBlocks: doc.customBlocks,
        chunkConfig: doc.chunkConfig, savedProjects: [], onSaveProjectSlot: async () => false, onLoadProjectSlot: async () => false,
        onImportProjectJson: async () => false, onResetEntireWorld: reset, onResetSpecificChunk: reset,
        onOpenDriveBackupModal() {}, onOpenBlockMarketModal() {},
      });
      if (kind === 'workshop') return React.createElement(BlockWorkshopModal, { isOpen: open, onClose, onSaveCustomBlock: asyncResult });
      return React.createElement(BlueprintsModal, {
        isOpen: open, onClose, blueprints: [doc.blueprints[0]], pos1: null, pos2: null, blocks: doc.blocks,
        onSaveSelectionBlueprint: () => false, onEquipBlueprintStamp() {}, onPlaceBlueprintAtPos1() {}, onLoadBlueprintIntoNewWorld: asyncResult,
        onDeleteBlueprint() {}, onImportBlueprintJson: kind === 'blueprint_import' ? asyncResult : () => false, onRefreshCloudBlueprints() {}, isLoadingCloud: false,
      });
    }
    createRoot(document.getElementById('root')).render(React.createElement(Harness));
  }, kind);
  return { context, page };
}
async function run(name, kind, callback) {
  const { context, page } = await fixture(kind);
  try { await callback(page); report.results.push({ name, ok: true }); console.log(JSON.stringify(report.results.at(-1))); }
  catch (error) { report.results.push({ name, ok: false, error: String(error) }); console.log(JSON.stringify(report.results.at(-1))); }
  finally { await context.close(); }
}
const saveButton = page => page.getByRole('button', { name: 'Save Custom Block Blueprint', exact: true });
const fixtureState = page => page.evaluate(() => ({ calls: window.__actionOutcomeFixture.calls, rawCalls: window.__actionOutcomeFixture.rawCalls, closed: window.__actionOutcomeFixture.closed }));
async function beginWorkshopSave(page) {
  await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'deferred'; });
  await saveButton(page).click();
  await page.getByRole('button', { name: 'Saving block…', exact: true }).waitFor();
  return (await fixtureState(page)).calls[0];
}
async function setInput(page, selector, value) {
  await page.locator(selector).evaluate((input, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
}
const microShape = page => page.getByRole('button', { name: /8×8×8 Chiseled Block/ }).click();
async function preservesLaterEdit(label, mutate, verify, prepare = async () => {}) {
  await run(`pending workshop success retains ${label}`, 'workshop', async page => {
    await prepare(page);
    const submitted = await beginWorkshopSave(page);
    await mutate(page);
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await page.getByRole('status').filter({ hasText: 'Newer edits are still unsaved' }).waitFor();
    assert.equal((await fixtureState(page)).closed, 0);
    assert.equal(await saveButton(page).isEnabled(), true);
    assert.deepEqual((await fixtureState(page)).rawCalls[0], submitted, 'Later form edits mutated the submitted payload');
    // Read the retained draft through the next real submit, not private component state.
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'false'; });
    await saveButton(page).click();
    await page.getByRole('alert').filter({ hasText: 'The block was not saved.' }).waitFor();
    const state = await fixtureState(page);
    assert.equal(state.calls.length, 2);
    verify(state.calls[1], submitted);
    assert.deepEqual(state.rawCalls[0], submitted);
  });
}
const importButton = page => page.getByRole('button', { name: 'Import Blueprint', exact: true });
const importText = page => page.getByRole('textbox', { name: 'Blueprint JSON', exact: true });
async function openImport(page, text = '{"name":"Submitted blueprint"}') {
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await importText(page).fill(text);
}
async function beginImport(page) {
  await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'deferred'; });
  await importButton(page).click();
  await page.getByRole('button', { name: 'Importing blueprint…', exact: true }).waitFor();
}
try {
  await run('world and chunk resets distinguish rejected, unchanged and applied outcomes', 'reset', async page => {
    await page.getByTestId('main-menu-tab-reset').click();
    for (const target of ['reset-world-template-empty_void', 'reset-chunk-clear-air-btn']) {
      await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'rejected'; }); await page.getByTestId(target).click();
      await page.getByRole('alert').filter({ hasText: 'Fixture edit is blocked.' }).waitFor();
      await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'noop'; }); await page.getByTestId(target).click();
      await page.getByRole('status').filter({ hasText: 'No changes were needed. Your current build is unchanged.' }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'applied'; }); await page.getByTestId(target).click();
      await page.getByRole('status').filter({ hasText: target.includes('world') ? 'Reset world to Clean Void' : 'Cleared Chunk (0, 0)' }).waitFor();
    }
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.calls.length), 6);
  });
  await run('workshop false and thrown outcomes retain the draft; true closes after completion', 'workshop', async page => {
    const name = page.locator('#custom-block-name'); await name.fill('Retained workshop design');
    await page.locator('#custom-block-desc').fill('Keep these notes');
    const save = page.getByRole('button', { name: 'Save Custom Block Blueprint', exact: true });
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'false'; }); await save.click();
    await page.getByRole('alert').filter({ hasText: 'The block was not saved.' }).waitFor();
    assert.equal(await name.inputValue(), 'Retained workshop design'); assert.equal(await page.locator('#custom-block-desc').inputValue(), 'Keep these notes');
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 0);
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'throw'; }); await save.click();
    await page.getByRole('alert').filter({ hasText: 'Fixture operation failed.' }).waitFor();
    assert.equal(await name.inputValue(), 'Retained workshop design');
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'deferred'; }); await save.click();
    await page.getByRole('button', { name: 'Saving block…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Saving block…', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 0);
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await page.getByRole('button', { name: 'Save Custom Block Blueprint', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 1);
  });
  await run('blueprint false and thrown outcomes retain library; true closes after completion', 'blueprint', async page => {
    const load = page.getByRole('button', { name: 'Load in New World', exact: true });
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'false'; }); await load.click();
    await page.getByRole('alert').filter({ hasText: 'The blueprint was not loaded.' }).waitFor();
    assert.equal(await load.count(), 1); assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 0);
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'throw'; }); await load.click();
    await page.getByRole('alert').filter({ hasText: 'Fixture operation failed.' }).waitFor();
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'deferred'; }); await load.click();
    await page.getByRole('button', { name: 'Loading blueprint…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Loading blueprint…', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 0);
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true)); await load.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 1);
  });
  await run('pending workshop save does not discard edits made after the submitted draft', 'workshop', async page => {
    const name = page.locator('#custom-block-name'); await name.fill('Submitted draft');
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'deferred'; });
    await page.getByRole('button', { name: 'Save Custom Block Blueprint', exact: true }).click();
    await page.getByRole('button', { name: 'Saving block…', exact: true }).waitFor();
    assert.equal(await name.isEnabled(), true);
    await name.fill('New unsaved draft'); await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await page.getByRole('status').filter({ hasText: 'Saved the submitted version of “Submitted draft”. Newer edits are still unsaved' }).waitFor();
    assert.equal(await page.evaluate(() => window.__actionOutcomeFixture.closed), 0, 'Save completion closed newer unsaved form changes');
    assert.equal(await name.inputValue(), 'New unsaved draft');
    assert.equal((await fixtureState(page)).calls[0][0].name, 'Submitted draft');
  });
  await run('same-turn edit and save completion retain the new draft and track the saved version', 'workshop', async page => {
    await page.locator('#custom-block-name').fill('Saved version');
    await beginWorkshopSave(page);
    await page.evaluate(() => {
      const input = document.getElementById('custom-block-name');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Same-turn unsaved version');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__actionOutcomeFixture.resolve(true);
    });
    await page.getByRole('status').filter({ hasText: 'Newer edits are still unsaved' }).waitFor();
    assert.equal((await fixtureState(page)).closed, 0);
    assert.equal(await page.locator('#custom-block-name').inputValue(), 'Same-turn unsaved version');
    await page.locator('#custom-block-name').fill('Saved version');
    await page.getByRole('status').filter({ hasText: 'Your current draft matches that saved version.' }).waitFor();
    assert.equal((await fixtureState(page)).calls.length, 1);
    await page.locator('#custom-block-desc').fill('A later unsaved note');
    await page.getByRole('status').filter({ hasText: 'Newer edits are still unsaved' }).waitFor();
  });
  await preservesLaterEdit('blueprint notes', p => p.locator('#custom-block-desc').fill('Newer notes'), args => assert.equal(args[2], 'Newer notes'));
  await preservesLaterEdit('publish choice', p => p.getByRole('checkbox', { name: 'Also save to Blueprint Library & Community Gallery' }).uncheck(), args => assert.equal(args[1], false));
  await preservesLaterEdit('shape changes', p => p.getByRole('button', { name: /Half Slab \/ Trim/ }).click(), args => { assert.equal(args[0].shape, 'plate'); assert.equal(args[0].heightPlates, 1); });
  for (const [field, selector, next] of [['width', '#block-width-range', 2], ['depth', '#block-depth-range', 2], ['heightPlates', '#block-height-range', 4]]) {
    await preservesLaterEdit(`${field} slider`, p => setInput(p, selector, next), args => assert.equal(args[0][field], next));
  }
  await preservesLaterEdit('Shift+wheel dimensions', p => p.getByTitle('Hold Shift + Scroll Mouse Wheel to resize block footprint live').dispatchEvent('wheel', { shiftKey: true, deltaY: -100 }), args => { assert.equal(args[0].width, 2); assert.equal(args[0].depth, 2); });
  await preservesLaterEdit('snap-mode geometry rounding', p => p.getByRole('button', { name: 'Snap Grid', exact: true }).click(), args => { assert.equal(args[0].width, 1); assert.equal(args[0].depth, 2); assert.equal(args[0].heightPlates, 3); }, async p => {
    await p.getByRole('button', { name: 'Free Fine (0.25)', exact: true }).click();
    await setInput(p, '#block-width-range', 1.25); await setInput(p, '#block-depth-range', 1.75); await setInput(p, '#block-height-range', 3.25);
  });
  await preservesLaterEdit('architectural template', p => p.getByRole('button', { name: /Castle Ashlar 2×2/ }).click(), args => { assert.equal(args[0].name, 'Castle Ashlar Wall 2×2'); assert.equal(args[0].width, 2); assert.equal(args[0].heightPlates, 6); });
  await preservesLaterEdit('texture', p => p.getByRole('button', { name: 'Long Timber (4×4)', exact: true }).click(), args => assert.equal(args[0].texturePattern, 'oak_planks'));
  await preservesLaterEdit('material finish', p => p.getByRole('button', { name: 'Tempered Glass', exact: true }).click(), args => assert.equal(args[0].materialFinish, 'glass'));
  await preservesLaterEdit('palette color', p => p.getByRole('button', { name: 'Color Cobalt Tile', exact: true }).click(), args => assert.equal(args[0].color, '#3B82F6'));
  await preservesLaterEdit('custom color', p => setInput(p, 'input[type="color"]', '#123456'), args => assert.equal(args[0].color, '#123456'));
  await preservesLaterEdit('mirrored voxel draw', p => p.getByRole('button', { name: 'Voxel 0,2,0', exact: true }).click(), args => { assert.equal(args[0].voxels.length, 68); assert.ok(args[0].voxels.some(v => v.x === 7 && v.y === 2 && v.z === 7)); }, microShape);
  await preservesLaterEdit('mirrored voxel erase', async p => { await p.getByRole('button', { name: 'Erase', exact: true }).click(); await p.getByRole('button', { name: 'Voxel 2,2,2', exact: true }).click(); }, args => assert.equal(args[0].voxels.length, 60), microShape);
  await preservesLaterEdit('voxel recolor', async p => { await p.getByRole('button', { name: 'Brush Emerald Leaf', exact: true }).click(); await p.getByRole('button', { name: 'Voxel 2,2,2', exact: true }).click(); }, args => assert.equal(args[0].voxels.find(v => v.x === 2 && v.y === 2 && v.z === 2).color, '#10B981'), microShape);
  await preservesLaterEdit('voxel fill layer', p => p.getByRole('button', { name: 'Fill Layer', exact: true }).click(), args => assert.equal(args[0].voxels.length, 112), microShape);
  await preservesLaterEdit('voxel clear layer', p => p.getByRole('button', { name: 'Clear Layer', exact: true }).click(), args => assert.equal(args[0].voxels.length, 48), microShape);
  await run('unchanged authored values and view-only preview actions still close after success', 'workshop', async page => {
    const name = page.locator('#custom-block-name'); const originalName = await name.inputValue();
    await beginWorkshopSave(page);
    await name.fill('Temporary name'); await name.fill(originalName);
    await page.getByRole('button', { name: '2×2 Connected Spritemap View', exact: true }).click();
    await page.getByRole('button', { name: '16×', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate R', exact: true }).click();
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await name.waitFor({ state: 'hidden' });
    assert.equal((await fixtureState(page)).closed, 1);
  });
  await run('invalid newer draft survives successful earlier save and validates before retry', 'workshop', async page => {
    await beginWorkshopSave(page); await page.locator('#custom-block-name').fill('');
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await page.getByRole('status').filter({ hasText: 'Newer edits are still unsaved' }).waitFor();
    await saveButton(page).click(); await page.getByRole('alert').filter({ hasText: 'Please enter a name' }).waitFor();
    assert.equal((await fixtureState(page)).calls.length, 1); assert.equal((await fixtureState(page)).closed, 0);
  });
  await run('pending failure preserves later values and retry submits them once', 'workshop', async page => {
    await beginWorkshopSave(page); await page.locator('#custom-block-name').fill('Retry this new draft');
    await page.evaluate(() => window.__actionOutcomeFixture.reject(new Error('Deferred save failed.')));
    await page.getByRole('alert').filter({ hasText: 'Deferred save failed.' }).waitFor();
    assert.equal(await page.locator('#custom-block-name').inputValue(), 'Retry this new draft');
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'true'; }); await saveButton(page).click();
    await saveButton(page).waitFor({ state: 'hidden' });
    assert.equal((await fixtureState(page)).calls[1][0].name, 'Retry this new draft'); assert.equal((await fixtureState(page)).closed, 1);
  });
  for (const closeMethod of ['cancel', 'prop']) {
    await run(`close/reopen via ${closeMethod} fences stale success even with identical values`, 'workshop', async page => {
      await beginWorkshopSave(page);
      // Submit events can still be fired while a button is disabled: the handler owns exclusion.
      await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      assert.equal((await fixtureState(page)).calls.length, 1);
      if (closeMethod === 'cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      else await page.evaluate(() => window.__actionOutcomeFixture.hide());
      await page.locator('#custom-block-name').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.__actionOutcomeFixture.reopen()); await page.locator('#custom-block-name').waitFor();
      await page.locator('form').evaluate(form => form.requestSubmit());
      assert.equal((await fixtureState(page)).calls.length, 1);
      const closedBefore = (await fixtureState(page)).closed;
      await page.evaluate(() => window.__actionOutcomeFixture.resolve(true)); await saveButton(page).waitFor();
      assert.equal((await fixtureState(page)).closed, closedBefore);
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal(await page.getByRole('status').count(), 0);
      assert.equal(await saveButton(page).isEnabled(), true);
      await page.locator('#custom-block-name').fill('Reopened draft');
      await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'true'; }); await saveButton(page).click();
      await saveButton(page).waitFor({ state: 'hidden' }); assert.equal((await fixtureState(page)).calls.length, 2);
    });
  }
  await run('stale failure after close/reopen cannot replace the new draft notice', 'workshop', async page => {
    await beginWorkshopSave(page); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => window.__actionOutcomeFixture.reopen()); await page.locator('#custom-block-name').fill('New open session');
    await page.evaluate(() => window.__actionOutcomeFixture.reject(new Error('Obsolete error.'))); await saveButton(page).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0); assert.equal(await page.locator('#custom-block-name').inputValue(), 'New open session');
    assert.equal((await fixtureState(page)).closed, 1);
  });
  await run('blueprint import awaits true, prevents duplicate submissions, and retains false/error drafts', 'blueprint_import', async page => {
    const raw = '  {"name":"Keep original bytes"}\n';
    await openImport(page, raw);
    for (const mode of ['false', 'throw']) {
      await page.evaluate(mode => { window.__actionOutcomeFixture.mode = mode; }, mode);
      await importButton(page).click();
      await page.getByRole('alert').filter({ hasText: mode === 'false' ? 'The blueprint was not imported.' : 'Fixture operation failed.' }).waitFor();
      assert.equal(await importText(page).inputValue(), raw);
      assert.equal(await importButton(page).isEnabled(), true);
    }
    await beginImport(page);
    assert.equal(await importText(page).inputValue(), raw);
    assert.equal(await page.getByRole('button', { name: 'Importing blueprint…', exact: true }).isDisabled(), true);
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal((await fixtureState(page)).calls.length, 3);
    assert.deepEqual((await fixtureState(page)).calls, [[raw], [raw], [raw]]);
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    await page.getByRole('status').filter({ hasText: 'Imported blueprint into your library!' }).waitFor();
    await importText(page).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    assert.equal(await importText(page).inputValue(), '');
  });
  await run('blueprint import preserves newer text on same-turn success and retries exact newer bytes', 'blueprint_import', async page => {
    const next = ' {"name":"Newer import draft"}\n';
    await openImport(page); await beginImport(page);
    await page.evaluate(next => {
      const input = document.querySelector('textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__actionOutcomeFixture.resolve(true);
    }, next);
    await page.getByRole('status').filter({ hasText: 'Newer pasted text has not been imported' }).waitFor();
    assert.equal(await importText(page).inputValue(), next);
    assert.deepEqual((await fixtureState(page)).calls, [['{"name":"Submitted blueprint"}']]);
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'false'; }); await importButton(page).click();
    await page.getByRole('alert').filter({ hasText: 'The blueprint was not imported.' }).waitFor();
    assert.deepEqual((await fixtureState(page)).calls[1], [next]);
    assert.equal(await importText(page).inputValue(), next);
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'true'; }); await importButton(page).click();
    await importText(page).waitFor({ state: 'hidden' });
  });
  await run('blueprint import completion preserves another active tab and its local draft', 'blueprint_import', async page => {
    await openImport(page); await beginImport(page);
    await page.getByRole('button', { name: '+ Save Selection as Blueprint', exact: true }).click();
    await page.locator('#new-blueprint-name').fill('Unrelated selection draft');
    await page.evaluate(() => window.__actionOutcomeFixture.resolve(true));
    // Revisit import after resolution without letting its completion select a tab.
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#new-blueprint-name').inputValue(), 'Unrelated selection draft');
    assert.equal(await importText(page).count(), 0);
    assert.equal(await page.getByRole('status').count(), 0);
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    assert.equal(await importText(page).inputValue(), '{"name":"Submitted blueprint"}');
    await page.getByRole('status').filter({ hasText: 'This import draft remains available.' }).waitFor();
  });
  for (const closeMethod of ['close', 'prop']) {
    await run(`blueprint import ${closeMethod}/reopen fences stale success without duplicate writes`, 'blueprint_import', async page => {
      await openImport(page); await beginImport(page);
      if (closeMethod === 'close') await page.getByRole('button', { name: 'Close Blueprints Library & Structure Prefabs', exact: true }).click();
      else await page.evaluate(() => window.__actionOutcomeFixture.hide());
      await importText(page).waitFor({ state: 'hidden' });
      await page.evaluate(() => window.__actionOutcomeFixture.reopen()); await importText(page).waitFor();
      await page.locator('form').evaluate(form => form.requestSubmit());
      assert.equal((await fixtureState(page)).calls.length, 1);
      const before = (await fixtureState(page)).closed;
      await page.evaluate(() => window.__actionOutcomeFixture.resolve(true)); await importButton(page).waitFor();
      assert.equal(await importText(page).inputValue(), '{"name":"Submitted blueprint"}');
      assert.equal((await fixtureState(page)).closed, before);
      assert.equal(await page.getByRole('status').count(), 0);
      assert.equal(await page.getByRole('alert').count(), 0);
      await importText(page).fill('{"name":"New open session"}');
      await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'true'; }); await importButton(page).click();
      await importText(page).waitFor({ state: 'hidden' });
      assert.deepEqual((await fixtureState(page)).calls[1], ['{"name":"New open session"}']);
    });
  }
  await run('blueprint import ignores stale rejection after reopen and preserves a new draft', 'blueprint_import', async page => {
    await openImport(page); await beginImport(page);
    await page.getByRole('button', { name: 'Close Blueprints Library & Structure Prefabs', exact: true }).click();
    await page.evaluate(() => window.__actionOutcomeFixture.reopen()); await importText(page).fill('New incomplete draft');
    await page.evaluate(() => window.__actionOutcomeFixture.reject(new Error('Stale import error.'))); await importButton(page).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await importText(page).inputValue(), 'New incomplete draft');
  });
  await run('blueprint import reports a pending rejection against the submitted text without losing later edits', 'blueprint_import', async page => {
    await openImport(page); await beginImport(page);
    await importText(page).fill('{"name":"Retry newer text"}');
    await page.evaluate(() => window.__actionOutcomeFixture.reject(new Error('Original source preservation failed.')));
    await page.getByRole('alert').filter({ hasText: 'Original source preservation failed.' }).waitFor();
    assert.equal(await importText(page).inputValue(), '{"name":"Retry newer text"}');
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'true'; }); await importButton(page).click();
    await importText(page).waitFor({ state: 'hidden' });
    assert.deepEqual((await fixtureState(page)).calls[1], ['{"name":"Retry newer text"}']);
  });
  await run('blueprint import preserves synchronous boolean callback compatibility', 'blueprint_import', async page => {
    await openImport(page);
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'sync-false'; }); await importButton(page).click();
    await page.getByRole('alert').filter({ hasText: 'The blueprint was not imported.' }).waitFor();
    assert.equal(await importText(page).inputValue(), '{"name":"Submitted blueprint"}');
    await page.evaluate(() => { window.__actionOutcomeFixture.mode = 'sync-true'; }); await importButton(page).click();
    await importText(page).waitFor({ state: 'hidden' });
    assert.equal((await fixtureState(page)).calls.length, 2);
  });
} catch (error) {
  report.results.push({ name: 'component harness startup', ok: false, error: String(error) });
  console.log(JSON.stringify(report.results.at(-1)));
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.ok = report.results.every(result => result.ok) && report.pageErrors.length === 0;
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-action-outcomes-draft-results.json', JSON.stringify(report, null, 2));
}
if (report.results.some(result => !result.ok) || report.pageErrors.length) process.exitCode = 1;
