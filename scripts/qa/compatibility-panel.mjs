// Actual compatibility panel with controlled callbacks. No App/store/native qualification.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Component QA requires loopback.');
const paths = ['../../src/components/StudioCompatibilityPanel.tsx', '../../src/components/StudioCompatibilityPanel.css', './compatibility-panel.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')])));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const report = { startedAt: new Date().toISOString(), origin, browser: browser.version(), sourceHashes: await hashes(), results: [], pageErrors: [], limitations: ['Actual mounted React component with controlled callbacks. Does not qualify App integration, authoritative policy validation, persistence atomicity, native exports, assistive technology or physical devices.', 'Keyboard focus and narrow-layout checks cover this isolated Chromium fixture only.'] };
async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__compatibility-panel__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div></body></html>` });
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(`${origin}/__compatibility-panel__`);
  await page.evaluate(async options => {
    const rm = await import('/node_modules/.vite/deps/react.js'); const React = rm.default ?? rm;
    const cm = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = cm.default ?? cm;
    const [{ StudioCompatibilityPanel }, { candidateJavaTarget }] = await Promise.all([import('/src/components/StudioCompatibilityPanel.tsx'), import('/src/lib/studioTargetPolicy.ts')]);
    const definitions = Array.from({ length: options.count ?? 3 }, (_, n) => ({ id: n === 2 ? 'toString' : `definition-${n}`, name: `Block ${n}`, instances: n === 0 ? 25 : 0, summary: '1 × 1 × 1; cube; red; no studs' }));
    const bindings = [{ definitionId: 'definition-0', definitionSignature: 'fixture-only', blockState: 'minecraft:stone' }];
    const state = window.__compatibility = { reviews: [], applies: [], closed: 0, reviewMode: 'success', applyMode: 'deferred', issues: [], truncated: false, allowed: true, seq: 0 };
    const makeReport = draft => Object.freeze({ id: `review-${state.reviews.length}`, sourceToken: draft.sourceToken, target: candidateJavaTarget(bindings, draft.locked), mappings: draft.assignments.map(row => ({ ...row, name: definitions.find(def => def.id === row.definitionId)?.name ?? row.definitionId, instances: row.definitionId === 'definition-0' ? 25 : 0, appearanceSummary: `Red studio block → ${row.blockState}` })), issues: state.issues, issuesTruncated: state.truncated, canApply: state.allowed, summary: 'Controlled review of exact choices. Native qualification has not run.' });
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const [disabled, setDisabled] = React.useState(!!options.disabled);
      const [source, setSource] = React.useState({ token: 'source-0', projectName: 'Fixture project', target: options.java ? candidateJavaTarget(bindings, options.locked !== false) : null, definitions });
      state.hide = () => setOpen(false); state.reopen = () => setOpen(true); state.disable = setDisabled;
      state.advance = () => setSource(previous => ({ ...previous, token: `source-${++state.seq}` }));
      return React.createElement(React.Fragment, null,
        React.createElement('button', { id: 'open-panel', onClick: () => setOpen(true) }, 'Open compatibility'),
        React.createElement(StudioCompatibilityPanel, { isOpen: open, onClose: () => { state.closed++; setOpen(false); }, source, disabled,
          onReview(draft) {
            state.reviews.push(structuredClone(draft));
            const result = state.lastReport = makeReport(draft);
            if (state.reviewMode === 'throw') throw new Error('Fixture review error.');
            if (state.reviewMode === 'deferred') return new Promise((resolve, reject) => { state.resolveReview = () => resolve(result); state.rejectReview = reject; });
            return result;
          },
          onApply(review, acknowledgement) {
            state.applies.push({ sameReport: review === state.lastReport, report: structuredClone(review), acknowledgement });
            if (state.applyMode === 'throw') return Promise.reject(new Error('Fixture Apply error.'));
            if (state.applyMode === 'rejected' || state.applyMode === 'stale') return Promise.resolve({ status: state.applyMode, message: `Fixture ${state.applyMode}; no change applied.` });
            if (state.applyMode === 'success') return Promise.resolve({ status: 'applied', message: 'Fixture reviewed change applied.' });
            return new Promise((resolve, reject) => { state.resolveApply = resolve; state.rejectApply = reject; });
          },
        }));
    }
    const root = createRoot(document.getElementById('root')); state.unmount = () => root.unmount();
    root.render(React.createElement(Harness));
  }, options);
  await page.getByRole('button', { name: 'Open compatibility', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  return { page, context };
}
async function run(name, options, callback) {
  if (process.env.QA_CASE && !name.includes(process.env.QA_CASE)) return;
  const { page, context } = await fixture(options);
  try { await callback(page); report.results.push({ name, ok: true }); }
  catch (error) { report.results.push({ name, ok: false, error: String(error), stack: error.stack }); }
  finally { console.log(JSON.stringify(report.results.at(-1))); await context.close(); }
}
const reviewButton = page => page.getByRole('button', { name: 'Review proposed change', exact: true });
const applyButton = page => page.getByRole('button', { name: 'Apply reviewed change', exact: true });
const mapping = (page, n = 0) => page.getByRole('combobox', { name: `Native state for Block ${n} (${n === 2 ? 'toString' : `definition-${n}`})`, exact: true });
const appearance = page => page.getByRole('checkbox', { name: 'I reviewed the exact mappings and accept the native appearance substitutions.', exact: true });
const history = page => page.getByRole('checkbox', { name: 'I understand the checkpoint and new Undo-history consequence.', exact: true });
const state = page => page.evaluate(() => ({ reviews: window.__compatibility.reviews, applies: window.__compatibility.applies, closed: window.__compatibility.closed }));
async function settledRender(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function reviewed(page) { await mapping(page).selectOption('minecraft:stone'); await reviewButton(page).click(); await page.getByRole('heading', { name: 'Review before Apply', exact: true }).waitFor(); }
async function acknowledged(page) { await reviewed(page); await appearance(page).check(); await history(page).check(); }
try {
  await run('no default or air mappings; exact target and native hold visible', {}, async page => {
    assert.equal(await mapping(page).inputValue(), ''); assert.equal(await mapping(page, 2).inputValue(), '');
    assert.equal(await page.locator('select option[value="minecraft:air"]').count(), 0);
    await page.getByText('Native export not qualified.', { exact: true }).waitFor();
    assert.match(await page.getByRole('region', { name: 'Current compatibility target' }).innerText(), /Freeform.*Off/s);
    await reviewButton(page).click();
    assert.deepEqual((await state(page)).reviews[0].assignments, []);
    assert.equal(await applyButton(page).isDisabled(), true);
  });
  await run('4096 definitions page and search without losing offscreen explicit choices', { count: 4096 }, async page => {
    assert.equal(await page.getByRole('combobox').count(), 20);
    await mapping(page).selectOption('minecraft:stone');
    await page.getByRole('button', { name: 'Next definitions', exact: true }).click();
    await mapping(page, 20).selectOption('minecraft:cobblestone');
    await page.getByRole('searchbox', { name: 'Find a definition', exact: true }).fill('Block 4095');
    assert.equal(await page.getByRole('combobox').count(), 1);
    await mapping(page, 4095).selectOption('minecraft:oak_planks');
    await page.getByRole('searchbox').fill('');
    assert.equal(await mapping(page).inputValue(), 'minecraft:stone');
    await reviewButton(page).click();
    assert.deepEqual((await state(page)).reviews[0].assignments, [{ definitionId: 'definition-0', blockState: 'minecraft:stone' }, { definitionId: 'definition-20', blockState: 'minecraft:cobblestone' }, { definitionId: 'definition-4095', blockState: 'minecraft:oak_planks' }]);
  });
  await run('Apply requires both explicit acknowledgements and passes exact reviewed object once', {}, async page => {
    await reviewed(page); assert.equal(await applyButton(page).isDisabled(), true);
    await appearance(page).check(); assert.equal(await applyButton(page).isDisabled(), true);
    await history(page).check();
    await applyButton(page).evaluate(button => { button.click(); button.click(); });
    assert.equal((await state(page)).applies.length, 1);
    assert.equal((await state(page)).applies[0].sameReport, true);
    assert.deepEqual((await state(page)).applies[0].acknowledgement, { appearanceSubstitution: true, newHistoryEpoch: true });
    await page.getByRole('status').filter({ hasText: 'Dismissing this panel does not cancel the operation.' }).waitFor();
    await page.evaluate(() => window.__compatibility.resolveApply({ status: 'applied', message: 'Submitted change applied.' }));
    await page.getByRole('status').filter({ hasText: 'Submitted change applied.' }).waitFor();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
  });
  await run('grouped issues expose paths counts and sampled IDs; truncated report blocks Apply', {}, async page => {
    await page.evaluate(() => { const s = window.__compatibility; s.truncated = true; s.allowed = false; s.issues = [{ code: 'missing-binding', path: '$.blocks.0,0,0', message: 'Choose a valid mapping.', affectedInstanceIds: ['block-1'], affectedInstances: 25 }, { code: 'missing-binding', path: '$.blocks.1,0,0', message: 'Another unmapped block.', affectedInstanceIds: [], affectedInstances: 1 }]; });
    await reviewed(page);
    const group = page.getByRole('region', { name: 'missing-binding issues' });
    assert.match(await group.innerText(), /missing-binding \(2\)/); assert.match(await group.innerText(), /25 affected instances/);
    await group.getByText('Show sampled instance IDs (1)', { exact: true }).click(); await group.getByText('block-1', { exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'issue list is truncated' }).waitFor();
    await appearance(page).check(); await history(page).check(); assert.equal(await applyButton(page).isDisabled(), true);
  });
  await run('changing a mapping discards review and acknowledgements while retaining the new choice', {}, async page => {
    await acknowledged(page); await mapping(page).selectOption('minecraft:oak_planks');
    assert.equal(await applyButton(page).count(), 0);
    await reviewButton(page).click(); assert.equal(await appearance(page).isChecked(), false); assert.equal(await history(page).isChecked(), false);
    assert.equal((await state(page)).reviews.at(-1).assignments[0].blockState, 'minecraft:oak_planks');
  });
  await run('opaque source-token change invalidates review even when visible content is equal', {}, async page => {
    await acknowledged(page); await page.evaluate(() => window.__compatibility.advance());
    await page.getByRole('alert').filter({ hasText: 'This review is stale.' }).waitFor();
    assert.equal(await applyButton(page).isDisabled(), true); assert.equal(await appearance(page).isChecked(), false);
    assert.equal((await state(page)).applies.length, 0);
  });
  await run('async review cannot apply after a source change', {}, async page => {
    await page.evaluate(() => { window.__compatibility.reviewMode = 'deferred'; });
    await mapping(page).selectOption('minecraft:stone'); await reviewButton(page).click();
    await page.evaluate(() => window.__compatibility.advance()); await settledRender(page);
    await page.evaluate(() => window.__compatibility.resolveReview());
    await page.getByRole('alert').filter({ hasText: 'review is stale because' }).waitFor();
    assert.equal(await applyButton(page).count(), 0);
  });
  await run('async review result is discarded when choices change', {}, async page => {
    await page.evaluate(() => { window.__compatibility.reviewMode = 'deferred'; });
    await mapping(page).selectOption('minecraft:stone'); await reviewButton(page).click();
    await mapping(page).selectOption('minecraft:cobblestone'); await page.evaluate(() => window.__compatibility.resolveReview());
    assert.equal(await applyButton(page).count(), 0); assert.equal(await reviewButton(page).isEnabled(), true);
    assert.equal(await mapping(page).inputValue(), 'minecraft:cobblestone');
  });
  await run('dismiss and reopen fences old review results and errors', {}, async page => {
    await page.evaluate(() => { window.__compatibility.reviewMode = 'deferred'; }); await reviewButton(page).click();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click(); await page.getByRole('button', { name: 'Open compatibility', exact: true }).click();
    await page.evaluate(() => window.__compatibility.rejectReview(new Error('Old closed review error')));
    assert.equal(await page.getByRole('alert').count(), 0); assert.equal(await applyButton(page).count(), 0);
    assert.equal(await reviewButton(page).isEnabled(), true);
  });
  for (const outcome of ['rejected', 'stale', 'throw']) {
    await run(`${outcome} Apply preserves choices and requires fresh review`, {}, async page => {
      await page.evaluate(mode => { window.__compatibility.applyMode = mode; }, outcome);
      await acknowledged(page); await applyButton(page).click(); await page.getByRole('alert').waitFor();
      assert.equal(await mapping(page).inputValue(), 'minecraft:stone'); assert.equal(await applyButton(page).count(), 0);
      assert.equal(await reviewButton(page).isEnabled(), true); assert.equal((await state(page)).closed, 0);
    });
  }
  await run('pending Apply stays exclusive across close/reopen; late success cannot replace the new session', {}, async page => {
    await acknowledged(page); await applyButton(page).click();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click(); await page.getByRole('button', { name: 'Open compatibility', exact: true }).click();
    assert.equal(await reviewButton(page).isDisabled(), true);
    await page.evaluate(() => window.__compatibility.resolveApply({ status: 'applied', message: 'Old session success' }));
    await settledRender(page); assert.equal(await reviewButton(page).isEnabled(), true);
    assert.equal(await page.getByText('Old session success', { exact: true }).count(), 0); assert.equal((await state(page)).closed, 1);
  });
  await run('unmounted callback settlement does not produce a React error', {}, async page => {
    await acknowledged(page); await applyButton(page).click();
    await page.evaluate(() => { const s = window.__compatibility; s.unmount(); s.rejectApply(new Error('Late unmounted error')); });
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
  for (const locked of [true, false]) {
    await run(`existing Java ${locked ? 'locked' : 'unlocked'} mappings are readonly and only opposite lock is reviewed`, { java: true, locked }, async page => {
      assert.equal(await page.getByRole('combobox').count(), 0);
      const toggle = page.getByRole('checkbox', { name: 'Game compatibility lock after Apply', exact: true });
      assert.equal(await toggle.isChecked(), !locked);
      assert.equal(await page.getByRole('button', { name: 'Remap or convert as a copy', exact: true }).isDisabled(), true);
      await reviewButton(page).click();
      assert.deepEqual((await state(page)).reviews[0].assignments, [{ definitionId: 'definition-0', blockState: 'minecraft:stone' }]);
      assert.equal((await state(page)).reviews[0].locked, !locked);
      await toggle.setChecked(locked); assert.equal(await reviewButton(page).isDisabled(), true);
    });
  }
  await run('parent disabled gate blocks review and Apply while allowing inspection', { disabled: true }, async page => {
    assert.equal(await reviewButton(page).isDisabled(), true); assert.equal(await mapping(page).isDisabled(), true);
    await page.evaluate(() => window.__compatibility.disable(false)); await acknowledged(page);
    await page.evaluate(() => window.__compatibility.disable(true)); await settledRender(page); assert.equal(await applyButton(page).isDisabled(), true);
    assert.equal((await state(page)).applies.length, 0);
  });
  await run('discard review preserves choices and causes no Apply', {}, async page => {
    await acknowledged(page); await page.getByRole('button', { name: 'Discard review', exact: true }).click();
    assert.equal(await applyButton(page).count(), 0); assert.equal(await mapping(page).inputValue(), 'minecraft:stone');
    assert.equal((await state(page)).applies.length, 0);
  });
  await run('native dialog enters focus, keeps Tab inside, and Escape restores trigger focus', {}, async page => {
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Game compatibility');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Dismiss');
    for (let n = 0; n < 15; n++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true); }
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-panel');
  });
  await run('narrow viewport keeps labeled controls within the dialog width', {}, async page => {
    await page.setViewportSize({ width: 360, height: 780 });
    assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    assert.equal(await page.getByRole('combobox').first().evaluate(element => element.getBoundingClientRect().width > 100), true);
  });
} finally {
  report.finalSourceHashes = await hashes(); report.sourcesUnchanged = JSON.stringify(report.sourceHashes) === JSON.stringify(report.finalSourceHashes);
  report.finishedAt = new Date().toISOString();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-compatibility-panel-results.json', JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.results.some(result => !result.ok) || report.pageErrors.length || !report.sourcesUnchanged) process.exitCode = 1;
