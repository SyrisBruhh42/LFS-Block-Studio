// Actual App brush/mirror/history workflows. Disposable loopback storage only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Require a frozen disposable loopback candidate.');
const report = { startedAt: new Date().toISOString(), origin, browser: '', assets: [], results: [], errors: [], screenshots: [], limitations: [
  'Actual App controls, project downloads and native mouse clicks; disposable Chromium/software WebGL with external/API traffic and service workers blocked.',
  'Read-only localStorage observes usage/learning effects. No App globals, React internals, hidden controller access or storage writes construct outcomes.',
  'Pointer target is the visible XYZ readout, not independent renderer/geometry/native acceptance. No physical pen/touch, assistive technology, other browser, performance or provider qualification.',
  'Native Minecraft/WorldEdit is NOT_RUN — skipped by user. Exact current directionless candidate only; no directional/multipart state support inferred.',
] };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, targetPolicy, ...value }) => value;
const comparable = ({ savedAt, ...value }) => value;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-networking', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context, page, stage = 'startup';
const record = extra => { report.results.push({ name: stage, ok: true, ...extra }); console.log(JSON.stringify(report.results.at(-1))); };
try {
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true }); context.setDefaultTimeout(15000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin);
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 }); await ready();
  report.assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  assert.ok(report.assets.some(url => url.endsWith('/' + process.env.QA_EXPECTED_JS)));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const live = async () => { const pending = page.waitForEvent('download'); await saving.getByRole('button', { name: 'Project backup', exact: true }).click(); const stream = await (await pending).createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString('utf8')); };
  const command = async value => { const input = page.getByLabel('WorldEdit Command Input', { exact: true }); await input.fill(value); await input.press('Enter'); await settle(); };
  const coordinateDetails = page.locator('[data-studio-coordinate-editor]');
  const optionsForm = page.getByRole('form', { name: 'Brush and mirror settings', exact: true });
  const ensureCoordinate = async () => { if (await coordinateDetails.getAttribute('open') === null) await coordinateDetails.locator(':scope > summary').click(); };
  const ensureOptions = async () => { await ensureCoordinate(); const details = coordinateDetails.locator('details'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); };
  const configure = async ({ mirror = 'off', x = '0', z = '0', shape = 'cube', radius = '1', height = '2', hollow = false, airOnly = false } = {}) => {
    await ensureOptions();
    await optionsForm.getByLabel('Brush shape', { exact: true }).selectOption(shape); await optionsForm.getByLabel('Brush radius', { exact: true }).selectOption(radius);
    await optionsForm.getByLabel('Cylinder height', { exact: true }).selectOption(height); await optionsForm.getByLabel('Mirror mode', { exact: true }).selectOption(mirror);
    await optionsForm.getByLabel('Mirror pivot X', { exact: true }).fill(x); await optionsForm.getByLabel('Mirror pivot Z', { exact: true }).fill(z);
    await optionsForm.getByRole('checkbox', { name: 'Hollow brush', exact: true }).setChecked(hollow); await optionsForm.getByRole('checkbox', { name: 'Place in empty cells only', exact: true }).setChecked(airOnly);
    await optionsForm.getByRole('button', { name: 'Apply tool settings', exact: true }).click(); await optionsForm.getByRole('status').filter({ hasText: 'Tool settings applied' }).waitFor(); await settle();
  };
  const numeric = async (action, coordinate) => {
    await ensureCoordinate(); const form = page.getByRole('form', { name: 'Coordinate editor', exact: true });
    for (const [axis, value] of Object.entries(coordinate)) await form.getByLabel(`Coordinate ${axis.toUpperCase()}`, { exact: true }).fill(String(value));
    await form.getByLabel('Coordinate action', { exact: true }).selectOption(action); await form.getByRole('button', { name: 'Apply coordinate action', exact: true }).click(); await settle();
  };
  const menu = page.getByRole('dialog', { name: 'Your workspace', exact: true });
  const openMenu = async () => { await page.getByRole('button', { name: 'Find studio actions', exact: true }).click(); await menu.waitFor(); };
  const closeMenu = async () => { await menu.getByRole('button', { name: 'Close studio menu', exact: true }).click(); await menu.waitFor({ state: 'hidden' }); };
  const history = async () => {
    await openMenu(); await menu.getByRole('button', { name: 'Project details', exact: true }).click();
    const details = menu.locator('details[aria-label="Project and Undo capacity"]'); if (await details.getAttribute('open') === null) await details.locator('summary').click();
    const result = { steps: await menu.getByTestId('studio-history-steps').innerText(), bytes: await menu.getByTestId('studio-history-bytes').innerText() }; await closeMenu(); return result;
  };
  const rename = async value => { await openMenu(); await menu.getByRole('button', { name: 'Project details', exact: true }).click(); await menu.getByLabel('Local project name', { exact: true }).fill(value); await menu.getByRole('button', { name: 'Apply project name', exact: true }).click(); await closeMenu(); };
  const effects = () => page.evaluate(() => ({ usage: JSON.parse(localStorage.getItem('brickforge_modular_hud_v1') || '{}').usageCounts?.unit ?? 0, archive: localStorage.getItem('brickforge_copilot_archive_v1') }));
  const base = await live(); base.schemaVersion = 1; delete base.targetPolicy; base.blocks = {}; base.blueprints = [];
  base.customBlocks = { unit: { id: 'unit', name: 'Brush unit', shape: 'cube', width: 1, depth: 1, heightPlates: 3, color: '#778899', texturePattern: 'smooth_abs', materialFinish: 'matte', hasStuds: false, isCustom: true } };
  base.blocks['0,0,0'] = { id: 'brush-seed', blockDefId: 'unit', position: { x: 0, y: 0, z: 0 }, rotation: 0 };
  base.chunkConfig = { ...base.chunkConfig, activeChunks: { '0,0': true }, unlockedChunks: ['0,0'] }; base.patternConfig.smartPlacementPrediction = false;
  base.extensions = { brushFixture: { preserve: ['all', 'authored', 'fields'], nested: { zero: 0, false: false, null: null } } };
  let index = 0;
  const install = async () => {
    const value = structuredClone(base); value.world.worldName = `Brush workflow fixture ${++index}`;
    await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'brush-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await saving.getByText(value.world.worldName, { exact: true }).waitFor(); await ready();
    await openMenu(); await menu.getByRole('button', { name: 'Scene & inspect', exact: true }).click(); await menu.getByRole('button', { name: 'Inspect Brush unit at 0, 0, 0', exact: true }).click(); await menu.getByRole('button', { name: 'Use this block', exact: true }).click(); await closeMenu(); return live();
  };
  let baseline = await install();

  stage = 'numeric brush/mirror options are source-neutral preferences with no project/history changes';
  const initialHistory = await history(); await configure({ mirror: 'quad_xz' });
  assert.deepEqual(comparable(await live()), comparable(baseline)); assert.deepEqual(await history(), initialHistory); record();

  stage = 'four mirrored volume placements change108 cells and chunks in one exact Undo/Redo step';
  const center = { x: 18, y: 8, z: 18 }; await numeric('brush_place', center); const placed = await live();
  const expected = new Set(['0,0,0']); for (const x of [18, -18]) for (const z of [18, -18]) for (let dx = -1; dx <= 1; dx++) for (let y = 7; y <= 9; y++) for (let dz = -1; dz <= 1; dz++) expected.add(`${x + dx},${y},${z + dz}`);
  assert.deepEqual(new Set(Object.keys(placed.blocks)), expected); assert.equal(new Set(Object.values(placed.blocks).map(b => b.id)).size, 109);
  for (const [key, b] of Object.entries(placed.blocks)) { assert.equal(key, `${b.position.x},${b.position.y},${b.position.z}`); assert.equal(b.blockDefId, 'unit'); assert.equal(b.rotation, b.position.z < 0 ? 180 : 0); }
  for (const key of ['1,1','-1,1','1,-1','-1,-1']) assert.equal(placed.chunkConfig.activeChunks[key], true);
  const expectedContent = authored(baseline); expectedContent.blocks = placed.blocks; expectedContent.chunkConfig = placed.chunkConfig; assert.deepEqual(authored(placed), expectedContent);
  assert.match((await history()).steps, /^1 Undo steps · 0 Redo steps$/);
  await command('//undo'); assert.deepEqual(authored(await live()), authored(baseline)); await command('//redo'); assert.deepEqual(authored(await live()), authored(placed)); record({ changedCells: 108, fullAuthoredHash: hash(authored(placed)) });

  stage = 'an identical brush preserves complete content, cell IDs, usage/learning effects and pending Redo';
  await rename('Pending brush Redo'); await command('//undo'); const beforeNoop = await live(), beforeHistory = await history(), beforeEffects = await effects();
  await numeric('brush_place', center); assert.deepEqual(comparable(await live()), comparable(beforeNoop)); assert.deepEqual(await history(), beforeHistory); assert.deepEqual(await effects(), beforeEffects);
  await command('//redo'); assert.equal((await live()).world.worldName, 'Pending brush Redo'); await command('//undo'); record();

  stage = 'volume erasure removes every mirrored cell once and exact Undo restores IDs and chunk visibility';
  const beforeErase = await live(); await numeric('brush_erase', center); const erased = await live(); const expectedErased = authored(beforeErase); expectedErased.blocks = baseline.blocks;
  assert.deepEqual(authored(erased), expectedErased); await command('//undo'); assert.deepEqual(authored(await live()), authored(beforeErase)); record({ erasedCells: 108 });

  stage = 'overlapping brush cells are counted once and empty-only repeats do not clear Redo';
  baseline = await install(); await configure({ mirror: 'quad_xz' }); const overlapCenter = { x: 1, y: 5, z: 1 }; const beforeUsage = (await effects()).usage;
  await numeric('brush_place', overlapCenter); const overlapped = await live(); assert.equal(Object.keys(overlapped.blocks).length, 76); assert.equal((await effects()).usage - beforeUsage, 75);
  await rename('Overlap pending Redo'); await command('//undo'); const overlapBefore = await live(), overlapHistory = await history(); await configure({ mirror: 'quad_xz', airOnly: true });
  await numeric('brush_place', overlapCenter); assert.deepEqual(comparable(await live()), comparable(overlapBefore)); assert.deepEqual(await history(), overlapHistory); await command('//redo'); assert.equal((await live()).world.worldName, 'Overlap pending Redo'); record({ uniqueChangedCells: 75 });

  stage = 'last mirrored extent rejection preserves all authored data, history and feedback';
  baseline = await install(); await configure({ mirror: 'mirror_x', x: '500000' }); const beforeFailure = await live(), failureHistory = await history(), failureEffects = await effects();
  await numeric('brush_place', { x: 0, y: 5, z: 0 }); assert.deepEqual(comparable(await live()), comparable(beforeFailure)); assert.deepEqual(await history(), failureHistory); assert.deepEqual(await effects(), failureEffects);
  await coordinateDetails.getByRole('status').filter({ hasText: /Coordinates|budget|within|bound/ }).first().waitFor(); record();

  stage = 'numeric negative-coordinate brush retains all27 cells across the old hidden floor';
  await configure(); await numeric('brush_place', { x: -4, y: -16, z: -4 }); const below = await live();
  for (const y of [-17,-16,-15]) assert.equal(Object.values(below.blocks).filter(b => b.position.y === y).length, 9);
  await command('//undo'); assert.deepEqual(authored(await live()), authored(baseline)); record({ layers: [-17,-16,-15] });

  stage = 'dirty tool preferences retain their draft and reject overwrite after another control changes';
  await ensureOptions(); await optionsForm.getByLabel('Brush radius', { exact: true }).selectOption('2'); await page.getByTestId('viewport-symmetry-toggle').click();
  await optionsForm.getByRole('alert').waitFor(); assert.equal(await optionsForm.getByRole('button', { name: 'Apply tool settings', exact: true }).isDisabled(), true); assert.equal(await optionsForm.getByLabel('Brush radius', { exact: true }).inputValue(), '2');
  await optionsForm.getByRole('button', { name: 'Reload current tool settings', exact: true }).click(); assert.equal(await optionsForm.getByRole('button', { name: 'Apply tool settings', exact: true }).isEnabled(), true); assert.deepEqual(authored(await live()), authored(baseline)); record();

  stage = 'half-cell mirror pivot uses exact integer reflected cells and a quarter-cell draft cannot apply';
  await configure({ mirror: 'mirror_x', x: '0.5', radius: '0' }); await numeric('place', { x: -2, y: 4, z: 3 }); const half = await live();
  assert.ok(half.blocks['-2,4,3'] && half.blocks['3,4,3']); assert.equal(Object.keys(half.blocks).length, 3);
  await ensureOptions(); await optionsForm.getByLabel('Mirror pivot X', { exact: true }).fill('0.25'); assert.equal(await optionsForm.getByLabel('Mirror pivot X', { exact: true }).evaluate(node => node.validity.stepMismatch), true);
  const halfHistory = await history(); await optionsForm.getByRole('button', { name: 'Apply tool settings', exact: true }).click(); assert.deepEqual(authored(await live()), authored(half)); assert.deepEqual(await history(), halfHistory);
  await optionsForm.getByRole('button', { name: 'Reload current tool settings', exact: true }).click(); record();

  stage = 'native canvas brush click uses the displayed coordinate and shares actual numeric/history semantics';
  baseline = await install(); await configure({ radius: '0' }); await coordinateDetails.locator(':scope > summary').click();
  await page.getByRole('button', { name: '3D Brush+ (Y)', exact: true }).click(); const canvas = page.getByTestId('skyblock-3d-canvas').locator('canvas');
  await page.getByRole('region', { name: 'Camera navigation', exact: true }).getByRole('button', { name: 'Top', exact: true }).click(); await settle(); await canvas.focus();
  const box = await canvas.boundingBox(); assert.ok(box && box.height > 80); const point = { x: box.x + box.width * .72, y: box.y + box.height * .62 };
  await page.mouse.move(point.x, point.y); await settle();
  const label = await page.locator('[title="3D Cursor Grid Coordinates"]').innerText(), values = label.match(/XYZ: \((-?\d+), (-?\d+), (-?\d+)\)/); assert.ok(values, label);
  const position = { x: Number(values[1]), y: Number(values[2]), z: Number(values[3]) };
  const hit = await page.evaluate(({ x,y }) => document.elementFromPoint(x,y)?.tagName, point); assert.equal(hit, 'CANVAS');
  await page.mouse.down(); await page.mouse.up(); await settle(); const pointer = await live(); assert.ok(pointer.blocks[`${position.x},${position.y},${position.z}`]); assert.equal(Object.keys(pointer.blocks).length, 2);
  await command('//undo'); assert.deepEqual(authored(await live()), authored(baseline)); await command('//redo'); assert.deepEqual(authored(await live()), authored(pointer)); record({ displayedTarget: position, pointerEvent: 'native mouse' });

  stage = 'an unfinished native pointer gesture cannot edit a newly activated project';
  await canvas.focus(); await page.mouse.move(point.x, point.y); await page.mouse.down(); baseline = await install(); await page.mouse.up(); await settle(); assert.deepEqual(authored(await live()), authored(baseline)); assert.match((await history()).steps, /^0 Undo steps · 0 Redo steps$/); record({ pointerEvent: 'native mouse down, actual file restore, late mouse up' });

  stage = 'locked Java X/Z mirrors preserve mapped states and canonical zero rotations through one Undo';
  const compatibility = page.getByRole('dialog', { name: 'Game compatibility', exact: true }); await page.getByRole('button', { name: 'Review game compatibility', exact: true }).click();
  await compatibility.getByRole('combobox', { name: 'Native state for Brush unit (unit)', exact: true }).selectOption('minecraft:stone');
  await compatibility.getByRole('checkbox', { name: 'Game compatibility lock after Apply', exact: true }).check(); await compatibility.getByRole('button', { name: 'Review proposed change', exact: true }).click();
  await compatibility.getByRole('checkbox', { name: 'I reviewed the exact mappings and accept the native appearance substitutions.', exact: true }).check(); await compatibility.getByRole('checkbox', { name: 'I understand the checkpoint and new Undo-history consequence.', exact: true }).check(); await compatibility.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await page.getByRole('region', { name: 'Game target and compatibility', exact: true }).getByText('Java candidate · Locked', { exact: true }).waitFor(); await compatibility.getByRole('button', { name: 'Dismiss', exact: true }).click(); await ready();
  const locked = await live(); await configure({ mirror: 'quad_xz' }); await numeric('brush_place', center); const java = await live();
  assert.equal(Object.keys(java.blocks).length, 109); assert.deepEqual(java.targetPolicy, locked.targetPolicy); assert.ok(Object.values(java.blocks).every(b => b.rotation === 0 && !b.customScale && !b.colorOverride && !b.textureOverride && !b.materialOverride));
  assert.match((await history()).steps, /^1 Undo steps · 0 Redo steps$/); await command('//undo'); assert.deepEqual(authored(await live()), authored(locked)); await command('//redo'); assert.deepEqual(authored(await live()), authored(java)); record({ mappedState: 'minecraft:stone', nativeQualification: 'NOT_RUN' });

  stage = 'complete brush content, policy and definitions survive explicit save/reload';
  await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); const saved = await live(); await page.reload(); await ready(); const reopened = await live();
  assert.deepEqual(comparable(reopened), comparable(saved)); assert.match((await history()).steps, /^0 Undo steps · 0 Redo steps$/); record({ completeHash: hash(comparable(reopened)) });
  await ensureOptions(); const screenshot = process.env.QA_SCREENSHOT ?? '/tmp/studio-brush-options.png'; await coordinateDetails.screenshot({ path: screenshot }); report.screenshots.push(screenshot);
  assert.deepEqual(report.errors, []);
} catch (error) { report.results.push({ name: stage, ok: false, error: error.stack ?? String(error) }); if (page) report.failureUi = (await page.locator('body').innerText().catch(() => '')).slice(-8500); }
finally { await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString(); report.ok = report.results.length > 0 && report.results.every(row => row.ok) && report.errors.length === 0; await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-brush-workflow.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, cases: report.results.length, failures: report.results.filter(r => !r.ok).map(r => r.name) })); if (!report.ok) process.exitCode = 1; }
