// Actual UI -> binary download -> independent NBT readback, using disposable local storage only.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readCandidateSchematic } from './java-schematic-oracle.mjs';
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Use a frozen disposable loopback preview and QA_EXPECTED_JS.');
const report = { startedAt: new Date().toISOString(), origin, bundleAssets: [], results: [], errors: [], nativeQualification: 'NOT_RUN', limitations: ['Desktop Chromium/software WebGL; no physical-device, assistive technology or performance qualification.', 'Independent test-only NBT reader; no native Minecraft/WorldEdit paste, persistence or export-back.', 'External/provider requests blocked; only product UI, downloads and read-only IndexedDB observations.'] };
const hash = value => createHash('sha256').update(value).digest('hex');
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...value }) => value;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let page, context, stage = 'startup';
const record = extra => { report.results.push({ name: stage, ok: true, ...extra }); console.log(JSON.stringify(report.results.at(-1))); };
try {
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true }); context.setDefaultTimeout(15000);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.abort());
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto(origin);
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const compat = page.getByRole('dialog', { name: 'Game compatibility', exact: true });
  const panel = page.getByRole('dialog', { name: 'Java schematic export', exact: true });
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const download = async button => { const pending = page.waitForEvent('download'); await button.click(); const file = await pending, stream = await file.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk); return { filename: file.suggestedFilename(), bytes: Buffer.concat(chunks) }; };
  const live = async () => JSON.parse((await download(saving.getByRole('button', { name: 'Project backup', exact: true }))).bytes.toString('utf8'));
  const storage = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('lfs_studio_documents_v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readonly'), active = tx.objectStore('metadata').get('active'), revisions = tx.objectStore('revisions').getAll(), candidates = tx.objectStore('candidates').getAll();
      tx.oncomplete = () => resolve({ active: active.result, revisions: revisions.result, candidates: candidates.result }); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  const save = async () => { await settle(); await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); return storage(); };
  const command = async text => { const input = page.getByLabel('WorldEdit Command Input', { exact: true }); await input.fill(text); await input.press('Enter'); await settle(); };
  const openExport = async () => { await page.getByRole('button', { name: 'Export drafts', exact: true }).first().click(); await page.getByRole('button', { name: 'Open export drafts & approximate block mapping', exact: true }).click(); await panel.waitFor(); };
  const selectionUnavailable = async () => {
    const scope = panel.getByLabel('Export scope', { exact: true });
    // Check the native option property and user keyboard behavior. The automation
    // isDisabled/selectOption helpers do not establish native option availability.
    assert.equal(await scope.locator('option[value="selection"]').evaluate(option => option.disabled), true);
    await scope.focus(); await scope.press('Home'); await scope.press('ArrowDown'); await scope.press('Enter');
    assert.equal(await scope.inputValue(), 'world');
  };
  const closeExport = async () => { await panel.getByRole('button', { name: 'Close Java schematic export', exact: true }).click(); await panel.waitFor({ state: 'hidden' }); };
  const review = async (scope = 'world', anchor = { x: 1, y: -5, z: 10 }) => {
    await panel.getByLabel('Schematic name', { exact: true }).fill('Actual exported Ω🌿');
    await panel.getByLabel('Export scope', { exact: true }).selectOption(scope);
    for (const axis of ['x', 'y', 'z']) await panel.getByLabel(`Paste anchor ${axis.toUpperCase()}`, { exact: true }).fill(String(anchor[axis]));
    await panel.getByRole('button', { name: 'Review schematic export', exact: true }).click();
    await panel.getByRole('region', { name: 'Reviewed schematic export', exact: true }).waitFor();
    const button = panel.getByRole('button', { name: 'Download experimental .schem', exact: true }); assert.equal(await button.isEnabled(), false);
    await panel.getByRole('checkbox', { name: 'I reviewed the scope, paste anchor, mapped states and air cells.', exact: true }).check(); assert.equal(await button.isEnabled(), true);
    return button;
  };
  await ready(); report.bundleAssets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href)); assert.ok(report.bundleAssets.some(url => url.endsWith('/' + process.env.QA_EXPECTED_JS)));
  stage = 'real project import and explicit game compatibility review establish the source';
  const fixture = await live(); delete fixture.targetPolicy; fixture.schemaVersion = 1; fixture.world.worldName = 'Actual binary export fixture'; fixture.blueprints = []; fixture.extensions = { exportFixture: { retained: true } };
  const unit = (id, name, color) => ({ id, name, color, shape: 'cube', width: 1, depth: 1, heightPlates: 3, texturePattern: 'smooth_abs', materialFinish: 'matte', hasStuds: false, isCustom: true });
  fixture.customBlocks = { cobble_brick: unit('cobble_brick', 'Bright red explicit cobble', '#ff0000'), oak_plank: unit('oak_plank', 'Blue explicit oak', '#0000ff'), qa_stone: unit('qa_stone', 'Green explicit stone', '#00ff00') };
  fixture.blocks = Object.fromEntries([[-4, 2, 7, 'cobble_brick'], [-2, 2, 7, 'oak_plank'], [-4, 2, 10, 'cobble_brick'], [-3, 3, 9, 'qa_stone']].map(([x, y, z, blockDefId], i) => [`${x},${y},${z}`, { id: `marker-${i}`, blockDefId, position: { x, y, z }, rotation: 0 }]));
  await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'java-export-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) }); await saving.getByText(fixture.world.worldName, { exact: true }).waitFor(); await ready();
  await page.getByRole('button', { name: 'Review game compatibility', exact: true }).click(); await compat.waitFor();
  for (const [id, native] of [['cobble_brick', 'minecraft:cobblestone'], ['oak_plank', 'minecraft:oak_planks'], ['qa_stone', 'minecraft:stone']]) await compat.getByRole('combobox', { name: `Native state for ${fixture.customBlocks[id].name} (${id})`, exact: true }).selectOption(native);
  await compat.getByRole('button', { name: 'Review proposed change', exact: true }).click();
  await compat.getByRole('checkbox', { name: 'I reviewed the exact mappings and accept the native appearance substitutions.', exact: true }).check();
  await compat.getByRole('checkbox', { name: 'I understand the checkpoint and new Undo-history consequence.', exact: true }).check();
  await compat.getByRole('button', { name: 'Apply reviewed change', exact: true }).click(); await page.getByText('Java candidate · Locked', { exact: true }).waitFor();
  await compat.getByRole('button', { name: 'Dismiss', exact: true }).click(); await ready(); record({ mappingsAreDeliberatelyDifferentFromAppearance: true });

  await command('//pos1 -4 2 7'); await command('//pos2 -4 2 7'); const historyBase = authored(await live());
  await command('//set oak_plank'); const undoPayload = authored(await live()); await command('//set cobble_brick'); const redoPayload = authored(await live()); await command('//undo');
  const before = await save();
  stage = 'locked export mounts the typed binary path and requires an explicit anchor and review';
  await openExport(); assert.equal(await page.getByRole('dialog', { name: 'Export drafts & mapping preview', exact: true }).count(), 0);
  assert.equal(await panel.getByRole('button', { name: 'Other draft formats (unlocked)', exact: true }).count(), 0); assert.equal(await panel.getByTestId('ai-evaluate-blocks-btn').count(), 0); assert.equal(await panel.locator('[data-testid^="block-map-select-"]').count(), 0);
  await panel.getByRole('button', { name: 'Review schematic export', exact: true }).click(); await panel.getByRole('alert').filter({ hasText: 'Choose a paste anchor explicitly' }).waitFor(); record();

  stage = 'numeric window layout preserves the mounted canvas, project and reviewed export inputs';
  const canvasBefore = await page.locator('canvas').first().elementHandle();
  const schematicName = await panel.getByLabel('Schematic name', { exact: true }).inputValue();
  const layoutSummary = panel.locator('summary[aria-label="Window layout for Java schematic export"]');
  await layoutSummary.click();
  const layoutForm = panel.getByRole('form', { name: 'Window layout controls for Java schematic export', exact: true });
  for (const [key, value] of Object.entries({ x: 80, y: 80, width: 1040, height: 790 })) await layoutForm.getByRole('spinbutton', { name: 'Window ' + key, exact: true }).fill(String(value));
  await layoutForm.getByRole('button', { name: 'Apply window layout', exact: true }).click();
  await page.waitForFunction(() => Math.abs(document.querySelector('[data-window-id="java_schematic_export"]').getBoundingClientRect().height - 790) < 0.5);
  await layoutSummary.click();
  assert.equal(await canvasBefore.evaluate(node => node.isConnected && node === document.querySelector('canvas')), true);
  assert.equal(await panel.getByLabel('Schematic name', { exact: true }).inputValue(), schematicName);
  assert.deepEqual(await storage(), before); record();

  stage = 'downloaded world .schem independently decodes exact axes, offsets, states, air and Unicode name';
  const binary = await download(await review()); const decoded = readCandidateSchematic(binary.bytes);
  assert.match(binary.filename, /\.candidate\.schem$/); assert.equal(decoded.name, 'Actual exported Ω🌿'); assert.deepEqual(decoded.dimensions, [3, 2, 4]); assert.deepEqual(decoded.offset, [-5, 7, -3]); assert.equal(decoded.volume, 24);
  assert.deepEqual(decoded.cells.filter(cell => cell.blockState !== 'minecraft:air'), [
    { x: -5, y: 7, z: -3, blockState: 'minecraft:oak_planks' }, { x: -3, y: 7, z: -3, blockState: 'minecraft:oak_planks' },
    { x: -5, y: 7, z: 0, blockState: 'minecraft:cobblestone' }, { x: -4, y: 8, z: -1, blockState: 'minecraft:stone' },
  ]); assert.equal(decoded.cells.filter(cell => cell.blockState === 'minecraft:air').length, 20); record({ sha256: hash(binary.bytes), dimensions: decoded.dimensions, offset: decoded.offset });
  stage = 'separate export report identifies the exact downloaded bytes and captured source without modifying storage';
  const fileReport = JSON.parse((await download(panel.getByRole('button', { name: 'Download export report', exact: true }))).bytes.toString('utf8'));
  assert.equal(fileReport.binarySha256, hash(binary.bytes)); assert.equal(fileReport.nativeQualification, 'not-run'); assert.equal(fileReport.schematic.nbtByteLength, decoded.nbtBytes); assert.equal(fileReport.excludedByScope, 0); assert.equal(fileReport.totalBlocks, 4); assert.equal(fileReport.source.documentId, before.active.documentId); assert.equal(fileReport.source.capturedDurableRevision, before.active.revision); assert.equal(fileReport.schematic.source.revision, before.active.revision); assert.equal(fileReport.schematic.profile.dataVersion, 3955);
  assert.deepEqual(await storage(), before); await closeExport(); assert.deepEqual(authored(await live()), undoPayload); record({ reportSha256: hash(JSON.stringify(fileReport)) });
  stage = 'export leaves both real Undo and Redo payloads available';
  await command('//redo'); assert.deepEqual(authored(await live()), redoPayload); await command('//undo'); assert.deepEqual(authored(await live()), undoPayload); await command('//undo'); assert.deepEqual(authored(await live()), historyBase); await command('//redo'); assert.deepEqual(authored(await live()), undoPayload); record();

  stage = 'selection export excludes only explicit outside scope and preserves selected air';
  await command('//pos1 -4 2 7'); await command('//pos2 -3 2 8'); const selectedBefore = await save(); await openExport();
  const selectedFile = await download(await review('selection')); const selected = readCandidateSchematic(selectedFile.bytes);
  assert.deepEqual(selected.dimensions, [2, 1, 2]); assert.deepEqual(selected.offset, [-5, 7, -3]); assert.equal(selected.volume, 4);
  assert.deepEqual(selected.cells.filter(cell => cell.blockState !== 'minecraft:air'), [{ x: -5, y: 7, z: -3, blockState: 'minecraft:oak_planks' }]);
  const selectedReport = JSON.parse((await download(panel.getByRole('button', { name: 'Download export report', exact: true }))).bytes.toString('utf8')); assert.equal(selectedReport.scope, 'selection'); assert.equal(selectedReport.excludedByScope, 3); assert.equal(selectedReport.schematic.implicitAirCells, 3); assert.deepEqual(await storage(), selectedBefore); await closeExport(); record();

  stage = 'explicit empty selection exports an air-only region and parameter edits invalidate review';
  await command('//pos1 10 2 7'); await command('//pos2 11 2 7'); await save(); await openExport();
  await review('selection', { x: 0, y: 0, z: 0 }); await panel.getByLabel('Paste anchor X', { exact: true }).fill('2');
  assert.equal(await panel.getByRole('button', { name: 'Download experimental .schem', exact: true }).count(), 0, 'Changed parameter retained an approved download');
  const air = readCandidateSchematic((await download(await review('selection', { x: 0, y: 0, z: 0 }))).bytes);
  assert.equal(air.volume, 2); assert.ok(air.cells.every(cell => cell.blockState === 'minecraft:air')); await closeExport(); record();
  stage = 'clear selection is undoable and never invents a region for a later edit';
  const clearBefore = authored(await live());
  await page.getByText('Coordinate tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await openExport();
  await page.waitForFunction(() => document.querySelector('[aria-label="Export scope"] option[value="selection"]')?.disabled === true);
  await selectionUnavailable();
  await closeExport(); await command('//undo'); await openExport();
  const restoredSelection = readCandidateSchematic((await download(await review('selection', { x: 0, y: 0, z: 0 }))).bytes);
  assert.equal(restoredSelection.volume, 2); assert.deepEqual(restoredSelection.offset, [10, 2, 7]); assert.ok(restoredSelection.cells.every(cell => cell.blockState === 'minecraft:air'));
  await closeExport(); await command('//redo'); await openExport();
  await page.waitForFunction(() => document.querySelector('[aria-label="Export scope"] option[value="selection"]')?.disabled === true);
  await selectionUnavailable();
  await closeExport(); await command('//set cobble_brick');
  assert.deepEqual(authored(await live()), clearBefore); record();

  stage = 'exported project and typed mappings survive save and reload';
  const final = authored(await live()), saved = await save(); await page.reload(); await ready(); assert.deepEqual(authored(await live()), final); assert.deepEqual(await storage(), saved); assert.deepEqual(report.errors, []); record();
} catch (error) { report.results.push({ name: stage, ok: false, error: error.stack ?? error.message }); if (page) report.failureUi = (await page.locator('body').innerText().catch(() => '')).slice(-6000); }
finally { await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString(); report.ok = report.results.length > 0 && report.results.every(row => row.ok) && !report.errors.length; await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-java-export-app-results.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ ok: report.ok, results: report.results, errors: report.errors })); if (!report.ok) process.exitCode = 1; }
