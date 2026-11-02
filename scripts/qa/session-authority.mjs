// Full-App shared editing authority regression. Run only against a frozen local preview.
// Uses native UI, project downloads and read-only IndexedDB; no App globals or internal controller access.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Session authority QA requires a disposable loopback origin.');
const report = {
  startedAt: new Date().toISOString(), origin, browser: '', bundleAssets: [], results: [], pageErrors: [], reactErrors: [], blockedRequests: [],
  limitations: [
    'Disposable desktop Chromium with software WebGL; no hardware, assistive-technology, multi-browser, provider or native game qualification.',
    'Invalid-command counters are checked through durable document revision/historyEpoch/savedAt and visible Undo/Redo availability. The private live edit counter is not exposed by the UI and is not inspected.',
    'Command and numeric placement compare visible block semantics; generated IDs and procedural appearance need not be identical between input routes.',
  ],
};
const authoredKeys = ['world', 'blocks', 'customBlocks', 'blueprints', 'chunkConfig', 'patternConfig', 'lightingConfig', 'extensions'];
const authored = document => Object.fromEntries(authoredKeys.filter(key => Object.hasOwn(document, key)).map(key => [key, document[key]]));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context, page, stage = 'startup';
const record = value => { report.results.push(value); console.log(JSON.stringify(value)); };
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
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
  const redo = page.getByRole('button', { name: 'Redo', exact: true }).first();
  const commandInput = page.getByLabel('WorldEdit Command Input', { exact: true });
  const ready = () => saveRegion.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const assets = () => page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href).filter(Boolean));
  const readActive = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lfs_studio_documents_v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const read = (store, key) => new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly'), request = tx.objectStore(store).get(key); let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
      });
      const token = await read('metadata', 'active');
      if (!token) throw new Error('No active saved document');
      return JSON.parse((await read('revisions', [token.documentId, token.revision])).json);
    } finally { db.close(); }
  });
  const save = async () => { await settle(); await saveRegion.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); return readActive(); };
  const command = async value => { await commandInput.fill(value); await commandInput.press('Enter'); await settle(); };
  const historyAvailability = async () => ({ canUndo: await undo.isEnabled(), canRedo: await redo.isEnabled() });
  const lightPreset = async name => {
    await page.getByRole('navigation', { name: 'Studio Ribbon Tabs', exact: true }).getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click(); await settle();
  };
  await ready();
  report.bundleAssets = await assets();
  if (process.env.QA_EXPECTED_JS) assert.ok(report.bundleAssets.some(url => url.endsWith(`/${process.env.QA_EXPECTED_JS}`)), 'Preview does not serve the requested frozen JS bundle');
  const initial = await readActive(); report.initialDocumentHash = hash(initial);

  stage = 'command and toolbar history cover complete world metadata and authored lighting';
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click();
  await page.getByLabel('Skyblock World Name', { exact: true }).fill('Shared authority fixture');
  await page.getByRole('button', { name: 'Close Firebase Cloud Worlds & Live Co-Building', exact: true }).click();
  await lightPreset('Dawn (06:30)');
  const changed = await save();
  const expectedMetadata = authored(initial); expectedMetadata.world = { ...expectedMetadata.world, worldName: 'Shared authority fixture' };
  const expectedLighting = structuredClone(expectedMetadata); expectedLighting.lightingConfig = { ...initial.lightingConfig, timeOfDay: 6.5 };
  assert.deepEqual(authored(changed), expectedLighting, 'Metadata/lighting UI changed unexpected authored fields');
  await command('//undo'); assert.deepEqual(authored(await save()), expectedMetadata, 'Command Undo failed to restore complete lighting');
  await command('//undo'); assert.deepEqual(authored(await save()), authored(initial), 'Command Undo failed to restore world metadata');
  await command('//redo'); assert.deepEqual(authored(await save()), expectedMetadata, 'Command Redo failed to restore world metadata');
  await command('//redo'); assert.deepEqual(authored(await save()), expectedLighting, 'Command Redo failed to restore lighting');
  await undo.click(); await settle(); assert.deepEqual(authored(await save()), expectedMetadata, 'Toolbar Undo used different history');
  await redo.click(); await settle(); assert.deepEqual(authored(await save()), expectedLighting, 'Toolbar Redo used different history');
  record({ name: stage, ok: true, authoredHash: hash(expectedLighting) });

  stage = 'no-op and invalid commands preserve durable content, revision and redo availability';
  await command('//undo'); const beforeNoOp = await save(); const beforeHistory = await historyAvailability();
  assert.equal(beforeHistory.canRedo, true, 'Fixture did not establish redo history');
  for (const value of ['//help', '//pos1 NaN 0 0', '//sphere cobble_brick 1000000', '//not-a-real-command']) {
    await command(value);
    assert.deepEqual(await historyAvailability(), beforeHistory, `${value} changed visible history availability`);
    assert.deepEqual(await save(), beforeNoOp, `${value} changed saved content, revision or timestamp`);
  }
  await command('//redo'); assert.deepEqual(authored(await save()), expectedLighting, 'No-op/invalid command cleared the redo payload');
  record({ name: stage, ok: true, revision: beforeNoOp.revision, historyEpoch: beforeNoOp.historyEpoch, commands: ['//help', '//pos1 NaN 0 0', '//sphere cobble_brick 1000000', '//not-a-real-command'] });

  stage = 'command block edit and Undo preserve the rest of the complete document';
  const beforeBlock = await save();
  const selectedBlockId = (await commandInput.getAttribute('placeholder'))?.match(/\/\/set ([a-zA-Z0-9_.:-]+)/)?.[1];
  assert.ok(selectedBlockId && beforeBlock.customBlocks[selectedBlockId], 'Visible command placeholder did not identify a known selected block');
  const coordinate = { x: 0, y: 20, z: 0 }, coordinateKey = '0,20,0';
  assert.equal(beforeBlock.blocks[coordinateKey], undefined, 'Block fixture anchor is already occupied');
  for (const value of ['//pos1 0 20 0', '//pos2 0 20 0', `//set ${selectedBlockId}`]) await command(value);
  const commandBlock = await save();
  assert.equal(commandBlock.blocks[coordinateKey]?.blockDefId, selectedBlockId, 'Visible command failed to place the fixture block');
  assert.deepEqual(commandBlock.blocks[coordinateKey].position, coordinate);
  const expectedCommand = authored(beforeBlock); expectedCommand.blocks = { ...expectedCommand.blocks, [coordinateKey]: commandBlock.blocks[coordinateKey] };
  assert.deepEqual(authored(commandBlock), expectedCommand, 'Command placement modified unrelated authored fields');
  await command('//undo'); assert.deepEqual(authored(await save()), authored(beforeBlock), 'Command placement did not undo atomically');
  record({ name: stage, ok: true, coordinate, blockDefId: selectedBlockId });

  // Numeric controls are a product surface, not a test seam. Absence is an
  // explicit coverage hold rather than a reason to reach into component state.
  stage = 'numeric placement and command history share the same edit authority';
  const numericX = page.getByLabel(process.env.QA_COORDINATE_X_LABEL ?? 'Coordinate X', { exact: true });
  if (await numericX.count()) {
    await page.locator('summary').filter({ hasText: 'Coordinate tools' }).click();
    const coordinateLabels = [process.env.QA_COORDINATE_X_LABEL ?? 'Coordinate X', process.env.QA_COORDINATE_Y_LABEL ?? 'Coordinate Y', process.env.QA_COORDINATE_Z_LABEL ?? 'Coordinate Z'];
    for (const [index, value] of ['0', '20', '0'].entries()) await page.getByLabel(coordinateLabels[index], { exact: true }).fill(value);
    await page.getByLabel('Coordinate action', { exact: true }).selectOption('place');
    await page.getByRole('button', { name: process.env.QA_COORDINATE_PLACE_LABEL ?? 'Apply coordinate action', exact: true }).click();
    const numeric = await save();
    assert.equal(numeric.blocks[coordinateKey]?.blockDefId, commandBlock.blocks[coordinateKey].blockDefId, 'Numeric and command routes selected different block types');
    assert.deepEqual(numeric.blocks[coordinateKey].position, coordinate);
    assert.equal(numeric.blocks[coordinateKey].rotation, commandBlock.blocks[coordinateKey].rotation);
    await command('//undo'); assert.deepEqual(authored(await save()), authored(beforeBlock), 'Numeric placement was not one complete undoable edit');
    await redo.click(); await settle(); assert.deepEqual(authored(await save()), authored(numeric), 'Toolbar Redo failed to restore numeric placement');
    record({ name: stage, ok: true, coordinate, authoredHash: hash(authored(numeric)) });

    stage = 'numeric paint is undoable and repeated identical paint preserves redo and saved counters';
    await page.getByLabel('Coordinate action', { exact: true }).selectOption('paint');
    const applyCoordinate = page.getByRole('button', { name: process.env.QA_COORDINATE_PLACE_LABEL ?? 'Apply coordinate action', exact: true });
    await applyCoordinate.click(); const painted = await save();
    assert.equal(painted.blocks[coordinateKey].materialOverride, painted.customBlocks[selectedBlockId].materialFinish);
    assert.equal(painted.blocks[coordinateKey].colorOverride, painted.customBlocks[selectedBlockId].color);
    await command('//undo'); assert.deepEqual(authored(await save()), authored(numeric), 'Paint Undo lost the prior complete block state');
    await command('//redo'); assert.deepEqual(authored(await save()), authored(painted), 'Paint Redo did not restore the complete block state');
    await lightPreset('Night (22:30)'); await command('//undo');
    const beforeRepeatedPaint = await save(); const paintHistory = await historyAvailability();
    assert.equal(paintHistory.canRedo, true, 'Fixture did not establish redo before no-op paint');
    await applyCoordinate.click();
    assert.deepEqual(await save(), beforeRepeatedPaint, 'Repeated identical paint changed saved content or counters');
    assert.deepEqual(await historyAvailability(), paintHistory, 'Repeated identical paint cleared redo');
    await command('//redo'); assert.equal((await save()).lightingConfig.timeOfDay, 22.5, 'Repeated paint lost the redo payload');
    await command('//undo'); assert.deepEqual(authored(await save()), authored(painted));
    await page.locator('summary').filter({ hasText: 'Coordinate tools' }).click();
    record({ name: stage, ok: true, coordinate, unchangedRevision: beforeRepeatedPaint.revision });
  } else {
    record({ name: stage, ok: false, notRun: true, error: 'Numeric coordinate product controls were not present in this frozen build.' });
    await command('//redo'); // Keep a command-created block for save/reload coverage.
  }

  stage = 'complete authored project and durable envelope survive explicit save and reload';
  const saved = await save();
  assert.equal(saved.world.worldName, 'Shared authority fixture'); assert.equal(saved.lightingConfig.timeOfDay, 6.5);
  assert.ok(saved.blocks[coordinateKey]);
  await page.reload(); await ready(); assert.deepEqual(await assets(), report.bundleAssets, 'Preview bundle changed during the run');
  assert.deepEqual(await readActive(), saved, 'Reload changed the complete durable document');
  record({ name: stage, ok: true, documentHash: hash(saved), revision: saved.revision });

  stage = 'project replacement rotates identity and invalidates earlier Undo and Redo';
  await lightPreset('Night (22:30)'); await lightPreset('Noon (13:00)'); await command('//undo');
  assert.deepEqual(await historyAvailability(), { canUndo: true, canRedo: true }, 'Replacement fixture lacks both Undo and Redo history');
  const replacement = structuredClone(saved); replacement.world.worldName = 'Replacement history boundary';
  replacement.extensions = { ...replacement.extensions, authorityFixture: { source: 'visible file import', retained: true } };
  await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'session-replacement.lfsproj.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
  await saveRegion.getByText('Replacement history boundary', { exact: true }).waitFor(); await ready();
  const replaced = await readActive();
  assert.notEqual(replaced.documentId, saved.documentId); assert.notEqual(replaced.historyEpoch, saved.historyEpoch); assert.equal(replaced.revision, 0);
  assert.deepEqual(authored(replaced), authored(replacement));
  assert.deepEqual(await historyAvailability(), { canUndo: false, canRedo: false }, 'Replacement inherited predecessor history');
  for (const value of ['//undo', '//redo']) { await command(value); assert.deepEqual(await save(), replaced, `${value} escaped the replacement history boundary`); }
  record({ name: stage, ok: true, previousDocumentId: saved.documentId, replacementDocumentId: replaced.documentId, replacementEpoch: replaced.historyEpoch });
  await settle();
  assert.deepEqual(report.pageErrors, [], 'App emitted uncaught browser exceptions');
  assert.deepEqual(report.reactErrors, [], 'App emitted React update/render failures');
  record({ name: 'no uncaught App exceptions or React update-depth errors', ok: true });
} catch (error) {
  record({ name: stage, ok: false, error: error.message });
  if (page && !page.isClosed()) report.failureUiExcerpt = (await page.locator('body').innerText().catch(() => '')).slice(-4000);
} finally {
  report.finishedAt = new Date().toISOString();
  report.ok = report.results.length > 0 && report.results.every(result => result.ok) && !report.pageErrors.length && !report.reactErrors.length;
  await context?.close(); await browser.close();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-session-authority-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, failures: report.results.filter(result => !result.ok).map(result => result.name), bundleAssets: report.bundleAssets }));
  if (!report.ok) process.exitCode = 1;
}
