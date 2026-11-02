// Partial G2 qualification through the actual App UI and read-only persisted data.
// Requires an exact frozen loopback preview. No App globals, provider calls or native-game claims.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Compatibility QA requires a disposable loopback origin.');
if (!process.env.QA_EXPECTED_JS) throw new Error('QA_EXPECTED_JS must identify the frozen preview bundle.');
const report = {
  startedAt: new Date().toISOString(), origin, browser: '', bundleAssets: [], results: [], pageErrors: [], reactErrors: [], blockedRequests: [],
  limitations: [
    'Partial G2 desktop Chromium workflow coverage using software WebGL. Not every mutation route, browser, device or assistive technology is qualified.',
    'Native Minecraft Java/WorldEdit import, post-tick behavior and native export qualification have not run. Candidate policy validation is not native proof.',
    'External/API requests are blocked. UI actions and complete project backup downloads are observed; IndexedDB is inspected read-only.',
    'Unknown command block aliases exercise parser rejection. Unsupported and rotated blueprint stamps exercise the actual locked-document commit boundary.',
    'Generated savedAt in a live backup is excluded from live comparisons. Durable records and retained checkpoints are compared without exclusions.',
  ],
};
const authored = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, targetPolicy, ...content }) => content;
const liveComparable = ({ savedAt, ...document }) => document;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const record = result => { report.results.push(result); console.log(JSON.stringify(result)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context, page, stage = 'startup';
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
  const saving = page.getByRole('region', { name: 'Project saving and recovery', exact: true });
  const compatibility = page.getByRole('dialog', { name: 'Game compatibility', exact: true });
  const targetStatus = page.getByRole('region', { name: 'Game target and compatibility', exact: true });
  const library = page.getByRole('dialog', { name: 'Blueprints Library & Structure Prefabs', exact: true });
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
  const redo = page.getByRole('button', { name: 'Redo', exact: true }).first();
  const commandInput = page.getByLabel('WorldEdit Command Input', { exact: true });
  const ready = () => saving.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const assets = () => page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href).filter(Boolean));
  const history = async () => ({ canUndo: await undo.isEnabled(), canRedo: await redo.isEnabled() });
  const readStorage = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lfs_studio_documents_v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['metadata', 'revisions', 'candidates'], 'readonly');
        const active = tx.objectStore('metadata').get('active'), revisions = tx.objectStore('revisions').getAll(), candidates = tx.objectStore('candidates').getAll();
        tx.oncomplete = () => {
          const token = active.result, stored = revisions.result.find(row => row.documentId === token?.documentId && row.revision === token?.revision);
          if (!stored) { reject(new Error('Active document record is missing')); return; }
          resolve({ token, document: JSON.parse(stored.json), revisions: revisions.result, candidates: candidates.result });
        };
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  const save = async () => { await settle(); await saving.getByRole('button', { name: 'Save', exact: true }).click(); await ready(); return readStorage(); };
  const liveDocument = async () => {
    const pending = page.waitForEvent('download'); await saving.getByRole('button', { name: 'Project backup', exact: true }).click();
    const stream = await (await pending).createReadStream(); assert.ok(stream);
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const command = async value => { await commandInput.fill(value); await commandInput.press('Enter'); await settle(); };
  const openCompatibility = async () => { await page.getByRole('button', { name: 'Review game compatibility', exact: true }).click(); await compatibility.waitFor(); };
  const dismissCompatibility = async () => { await compatibility.getByRole('button', { name: 'Dismiss', exact: true }).click(); await compatibility.waitFor({ state: 'hidden' }); };
  const reviewAndApply = async locked => {
    await compatibility.getByRole('checkbox', { name: 'Game compatibility lock after Apply', exact: true }).setChecked(locked);
    await compatibility.getByRole('button', { name: 'Review proposed change', exact: true }).click();
    await compatibility.getByRole('heading', { name: 'Review before Apply', exact: true }).waitFor();
    const apply = compatibility.getByRole('button', { name: 'Apply reviewed change', exact: true });
    assert.equal(await apply.isEnabled(), false, 'Apply must require both explicit acknowledgements');
    await compatibility.getByRole('checkbox', { name: 'I reviewed the exact mappings and accept the native appearance substitutions.', exact: true }).check();
    assert.equal(await apply.isEnabled(), false, 'One acknowledgement must not authorize Apply');
    await compatibility.getByRole('checkbox', { name: 'I understand the checkpoint and new Undo-history consequence.', exact: true }).check();
    assert.equal(await apply.isEnabled(), true, 'Valid reviewed mappings should be applicable after both acknowledgements');
    await apply.click();
    await targetStatus.getByText(`Java candidate · ${locked ? 'Locked' : 'Unlocked'}`, { exact: true }).waitFor();
    await dismissCompatibility(); await ready(); return readStorage();
  };
  const assertTransition = async (before, after, locked) => {
    const a = after.document, b = before.document;
    assert.equal(a.schemaVersion, 2); assert.equal(a.documentId, b.documentId); assert.equal(a.revision, b.revision + 1); assert.notEqual(a.historyEpoch, b.historyEpoch);
    assert.deepEqual(a.targetPolicy.checkpoint, { documentId: b.documentId, revision: b.revision, historyEpoch: b.historyEpoch });
    assert.equal(a.targetPolicy.policyVersion, 1); assert.equal(a.targetPolicy.target.kind, 'minecraft-java'); assert.equal(a.targetPolicy.target.locked, locked);
    assert.equal(a.targetPolicy.target.profileId, 'minecraft-java-1.21.1-worldedit-7.3.8-fabric-0.15.11-sponge3-candidate1');
    assert.deepEqual(authored(a), authored(b), 'Policy transition converted authored content');
    const checkpoint = after.revisions.find(row => row.documentId === b.documentId && row.revision === b.revision);
    assert.ok(checkpoint, 'Durable predecessor checkpoint was not retained'); assert.deepEqual(JSON.parse(checkpoint.json), b);
    assert.deepEqual(await history(), { canUndo: false, canRedo: false }, 'Policy transition did not clear both history directions');
    // Exercise the commands too: disabled buttons alone cannot prove old payloads are gone.
    for (const value of ['//undo', '//redo']) {
      await command(value);
      assert.deepEqual(liveComparable(await liveDocument()), liveComparable(a), `${value} crossed the policy history boundary`);
      assert.deepEqual(await readStorage(), after, `${value} changed the durable transition`);
    }
    assert.ok((await targetStatus.innerText()).includes('Native Minecraft export is not qualified.'));
    assert.deepEqual(liveComparable(await liveDocument()), liveComparable(a));
  };
  const numeric = async (action, coordinate) => {
    const details = page.locator('details').filter({ has: page.getByRole('form', { name: 'Coordinate editor', exact: true, includeHidden: true }) });
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
    for (const [axis, value] of Object.entries(coordinate)) await page.getByLabel(`Coordinate ${axis.toUpperCase()}`, { exact: true }).fill(String(value));
    await page.getByLabel('Coordinate action', { exact: true }).selectOption(action);
    await page.getByRole('button', { name: 'Apply coordinate action', exact: true }).click(); await settle();
  };
  const openLibrary = async () => {
    await page.getByRole('navigation', { name: 'Studio Ribbon Tabs', exact: true }).getByRole('button', { name: /^Blueprints \(/ }).click();
    await page.getByRole('button', { name: /^Open Blueprints Library \(/ }).click(); await library.waitFor();
  };
  const closeLibrary = async () => { await library.getByRole('button', { name: 'Close Blueprints Library & Structure Prefabs', exact: true }).click(); await library.waitFor({ state: 'hidden' }); };
  const importBlueprint = async source => {
    await openLibrary(); await library.getByRole('button', { name: 'Import JSON', exact: true }).click();
    const raw = JSON.stringify(source, null, 2);
    await library.getByRole('textbox', { name: 'Blueprint JSON', exact: true }).fill(raw);
    await library.getByRole('button', { name: 'Import Blueprint', exact: true }).click();
    await library.getByRole('status').filter({ hasText: 'Imported blueprint into your library!' }).waitFor();
    await library.getByRole('heading', { name: source.name, exact: true }).waitFor(); await closeLibrary();
    return raw;
  };
  const seedHistory = async coordinate => {
    const base = authored(await liveDocument());
    await command(`//pos1 ${coordinate.x} ${coordinate.y} ${coordinate.z}`);
    await command(`//pos2 ${coordinate.x} ${coordinate.y} ${coordinate.z}`);
    await command('//set cobble_brick'); const undoPayload = authored(await liveDocument());
    await command('//set oak_plank'); const redoPayload = authored(await liveDocument());
    assert.notDeepEqual(undoPayload, base); assert.notDeepEqual(redoPayload, undoPayload);
    await command('//undo'); assert.deepEqual(authored(await liveDocument()), undoPayload);
    assert.deepEqual(await history(), { canUndo: true, canRedo: true }, 'Fixture must seed both real history directions');
    return { base, undoPayload, redoPayload };
  };

  await ready(); report.bundleAssets = await assets();
  assert.ok(report.bundleAssets.some(url => url.endsWith(`/${process.env.QA_EXPECTED_JS}`)), 'Preview is not serving the required frozen bundle');
  stage = 'visible project import establishes a minimal complete Freeform fixture';
  const initial = await readStorage(), fixture = structuredClone(initial.document);
  delete fixture.targetPolicy; fixture.schemaVersion = 1;
  fixture.world = { worldId: 'compatibility-fixture-world', worldName: 'Compatibility workflow fixture', description: 'Complete authored fixture must survive policy transitions.', roomCode: '', isPublicWorld: false };
  const unit = (id, name, color, texturePattern) => ({ id, name, shape: 'cube', width: 1, depth: 1, heightPlates: 3, color, texturePattern, materialFinish: 'matte', hasStuds: false, isCustom: true });
  fixture.customBlocks = { cobble_brick: unit('cobble_brick', 'QA Cobble Unit', '#778899', 'cobblestone'), oak_plank: unit('oak_plank', 'QA Oak Unit', '#AA8855', 'oak_planks') };
  fixture.blocks = { '1,0,-2': { id: 'initial-unit', blockDefId: 'cobble_brick', position: { x: 1, y: 0, z: -2 }, rotation: 0 } };
  fixture.blueprints = []; fixture.extensions = { compatibilityFixture: { preserve: ['complete', 'authored', 'data'] } };
  await page.getByLabel('Open a project file as a copy', { exact: true }).setInputFiles({ name: 'compatibility-freeform.lfsproj.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await saving.getByText(fixture.world.worldName, { exact: true }).waitFor(); await ready();
  const imported = await readStorage(); assert.deepEqual(authored(imported.document), authored(fixture)); assert.notEqual(imported.document.documentId, initial.document.documentId);
  assert.equal(imported.document.schemaVersion, 1); assert.equal(imported.document.targetPolicy, undefined);
  record({ name: stage, ok: true, documentId: imported.document.documentId, contentHash: hash(authored(imported.document)) });

  stage = 'explicit mappings and acknowledged Apply persist candidate lock with retained checkpoint and new history';
  await seedHistory({ x: 12, y: 3, z: -8 });
  const beforeLock = await save(); await openCompatibility();
  assert.ok((await compatibility.innerText()).includes('Native export not qualified.'));
  await compatibility.getByRole('combobox', { name: 'Native state for QA Cobble Unit (cobble_brick)', exact: true }).selectOption('minecraft:cobblestone');
  await compatibility.getByRole('combobox', { name: 'Native state for QA Oak Unit (oak_plank)', exact: true }).selectOption('minecraft:oak_planks');
  const locked = await reviewAndApply(true); await assertTransition(beforeLock, locked, true);
  const policy = locked.document.targetPolicy;
  assert.deepEqual(policy.target.bindings.map(({ definitionId, blockState }) => ({ definitionId, blockState })), [
    { definitionId: 'cobble_brick', blockState: 'minecraft:cobblestone' }, { definitionId: 'oak_plank', blockState: 'minecraft:oak_planks' },
  ]);
  assert.ok(policy.target.bindings.every(binding => binding.definitionSignature.startsWith('lfs-java-definition-v1:')));
  assert.deepEqual(await page.getByRole('combobox', { name: 'Active mapped block', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value)), ['cobble_brick', 'oak_plank']);
  record({ name: stage, ok: true, revision: locked.document.revision, epoch: locked.document.historyEpoch, checkpoint: policy.checkpoint, profileId: policy.target.profileId });

  stage = 'numeric mapped placement is atomic and command Undo/Redo preserve the policy';
  const coordinate = { x: -3, y: 2, z: 4 }, key = '-3,2,4';
  await page.getByRole('combobox', { name: 'Active mapped block', exact: true }).selectOption('cobble_brick');
  await numeric('place', coordinate); const placed = (await save()).document;
  assert.equal(placed.blocks[key]?.blockDefId, 'cobble_brick'); assert.equal(placed.blocks[key].rotation, 0);
  assert.equal(placed.blocks[key].colorOverride, undefined); assert.equal(placed.blocks[key].textureOverride, undefined); assert.equal(placed.blocks[key].materialOverride, undefined);
  assert.deepEqual(authored(placed), { ...authored(locked.document), blocks: { ...locked.document.blocks, [key]: placed.blocks[key] } });
  assert.deepEqual(placed.targetPolicy, policy);
  await command('//undo'); const undonePlace = (await save()).document; assert.deepEqual(authored(undonePlace), authored(locked.document)); assert.deepEqual(undonePlace.targetPolicy, policy);
  await command('//redo'); assert.deepEqual(authored((await save()).document), authored(placed));
  record({ name: stage, ok: true, coordinate, blockId: placed.blocks[key].id });

  stage = 'locked numeric paint replaces mapped type without overrides and erase shares complete history';
  await page.getByRole('combobox', { name: 'Active mapped block', exact: true }).selectOption('oak_plank');
  await numeric('paint', coordinate); const painted = (await save()).document;
  assert.deepEqual(painted.blocks[key], { ...placed.blocks[key], blockDefId: 'oak_plank' });
  assert.deepEqual(authored(painted), { ...authored(placed), blocks: { ...placed.blocks, [key]: painted.blocks[key] } }); assert.deepEqual(painted.targetPolicy, policy);
  await command('//undo'); assert.deepEqual(authored((await save()).document), authored(placed));
  await command('//redo'); assert.deepEqual(authored((await save()).document), authored(painted));
  await numeric('erase', coordinate); const erased = (await save()).document;
  assert.deepEqual(authored(erased), authored(locked.document)); assert.deepEqual(erased.targetPolicy, policy);
  await command('//undo'); assert.deepEqual(authored((await save()).document), authored(painted));
  record({ name: stage, ok: true, paintedDefinition: 'oak_plank', instanceOverrides: false });

  stage = 'locked rotation control and rejected commands preserve complete state and history';
  const rejectedHistory = await seedHistory({ x: 20, y: 3, z: -8 });
  const beforeRejected = await save(), beforeRejectedHistory = await history();
  const rotate = page.getByTitle('Rotate Block 90° (Key R)', { exact: true });
  await rotate.click(); await page.getByRole('alert').filter({ hasText: 'supports unrotated unit blocks' }).waitFor();
  assert.equal((await rotate.innerText()).trim(), '0°'); assert.deepEqual(await save(), beforeRejected); assert.deepEqual(await history(), beforeRejectedHistory);
  for (const value of ['//island', '//set qa_unknown_block_state']) {
    await command(value); assert.deepEqual(await save(), beforeRejected, `${value} changed durable state`); assert.deepEqual(await history(), beforeRejectedHistory, `${value} changed history`);
  }
  assert.ok((await page.locator('body').innerText()).includes('qa_unknown_block_state'));
  await command('//redo'); assert.deepEqual(authored(await liveDocument()), rejectedHistory.redoPayload, 'Rejected edit lost the actual Redo payload');
  await command('//undo'); assert.deepEqual(authored(await liveDocument()), rejectedHistory.undoPayload);
  await command('//undo'); assert.deepEqual(authored(await liveDocument()), rejectedHistory.base, 'Rejected edit lost the actual Undo payload');
  await command('//redo'); assert.deepEqual(authored(await liveDocument()), rejectedHistory.undoPayload);
  record({ name: stage, ok: true, commands: ['//island', '//set qa_unknown_block_state'], note: 'Unknown block alias is parser rejection; rotation control rejection is the candidate constraint.' });

  stage = 'save and reload retain complete authored content, mappings and locked state';
  const beforeReload = await save(); await page.reload(); await ready();
  assert.deepEqual(await assets(), report.bundleAssets); assert.deepEqual(await readStorage(), beforeReload);
  assert.deepEqual(liveComparable(await liveDocument()), liveComparable(beforeReload.document));
  await targetStatus.getByText('Java candidate · Locked', { exact: true }).waitFor();
  record({ name: stage, ok: true, documentHash: hash(beforeReload.document) });

  for (const lock of [false, true]) {
    stage = `${lock ? 'relock' : 'unlock'} retains read-only mappings, complete content and a new durable checkpoint`;
    if (lock) {
      stage = 'unsupported unlocked edit blocks relock and preserves its fixed mappings and actual history';
      const validUnlocked = await save();
      const rotation = page.getByTitle('Rotate Block 90° (Key R)', { exact: true });
      await rotation.click();
      await numeric('place', { x: 40, y: 3, z: -8 });
      const invalidUnlocked = await save();
      assert.equal(invalidUnlocked.document.blocks['40,3,-8'].rotation, 90);
      assert.equal(invalidUnlocked.document.targetPolicy.target.locked, false);
      const invalidHistory = await history();
      await openCompatibility();
      await compatibility.getByRole('checkbox', { name: 'Game compatibility lock after Apply', exact: true }).check();
      await compatibility.getByRole('button', { name: 'Review proposed change', exact: true }).click();
      await compatibility.getByText('This proposal cannot be applied. Resolve the reported issues and review again.', { exact: true }).waitFor();
      await compatibility.getByRole('checkbox', { name: 'I reviewed the exact mappings and accept the native appearance substitutions.', exact: true }).check();
      await compatibility.getByRole('checkbox', { name: 'I understand the checkpoint and new Undo-history consequence.', exact: true }).check();
      assert.equal(await compatibility.getByRole('button', { name: 'Apply reviewed change', exact: true }).isEnabled(), false);
      assert.ok((await compatibility.innerText()).includes('requires zero rotation'));
      await dismissCompatibility();
      assert.deepEqual(await save(), invalidUnlocked); assert.deepEqual(await history(), invalidHistory);
      await command('//undo'); assert.deepEqual(authored(await liveDocument()), authored(validUnlocked.document));
      await command('//redo'); assert.deepEqual(authored(await liveDocument()), authored(invalidUnlocked.document));
      await command('//undo'); assert.deepEqual(authored(await liveDocument()), authored(validUnlocked.document));
      for (let i = 0; i < 3; i++) await rotation.click();
      record({ name: stage, ok: true, invalidCoordinate: '40,3,-8', recoveredByActualUndoRedo: true });
    }
    stage = `${lock ? 'relock' : 'unlock'} retains read-only mappings, complete content and a new durable checkpoint`;
    await seedHistory({ x: lock ? 24 : 22, y: 3, z: -8 });
    const before = await save(); await openCompatibility();
    assert.equal(await compatibility.getByRole('combobox').count(), 0, 'Existing mappings must not become editable while unlocking or relocking');
    assert.ok((await compatibility.innerText()).includes('Mappings are fixed within this project'));
    const next = await reviewAndApply(lock); await assertTransition(before, next, lock);
    const { locked: _previousLock, ...previousIdentity } = before.document.targetPolicy.target;
    const { locked: _nextLock, ...nextIdentity } = next.document.targetPolicy.target;
    assert.deepEqual(nextIdentity, previousIdentity);
    record({ name: stage, ok: true, revision: next.document.revision, epoch: next.document.historyEpoch, checkpoint: next.document.targetPolicy.checkpoint });
  }

  const blueprint = (id, name, definition, rotation = 0) => ({
    id, name, description: 'The imported source stays a library resource. Placement must respect the current project.',
    authorId: 'external-fixture', authorName: 'Fixture Author', blueprintType: 'structure_blueprint', isPublic: false,
    size: { lx: 2, ly: 1, lz: 1 }, blocks: [{ id: `${id}-block`, blockDefId: definition.id, position: { x: 0, y: 0, z: 0 }, rotation }],
    customBlockDefs: [definition], createdAt: '2026-11-01T12:00:00.000Z',
  });
  const resources = [
    ['unmapped Freeform definition', blueprint('qa-unmapped', 'QA Unmapped Freeform Resource', { ...fixture.customBlocks.cobble_brick, id: 'qa_unmapped_slope', name: 'Unmapped slope', shape: 'slope', width: 2 })],
    ['rotated mapped instance', blueprint('qa-rotated', 'QA Rotated Mapped Resource', fixture.customBlocks.cobble_brick, 90)],
    ['conflicting shared definition', blueprint('qa-collision', 'QA Conflicting Shared Resource', { ...fixture.customBlocks.cobble_brick, color: '#123456' })],
  ];
  for (const [label, source] of resources) {
    stage = `library preserves ${label}, but actual stamp rejects without changing authored data or history`;
    const beforeImport = await save(), raw = await importBlueprint(source), afterImport = await save();
    const importedResource = afterImport.document.blueprints.find(item => item.name === source.name); assert.ok(importedResource);
    assert.deepEqual(authored(afterImport.document), { ...authored(beforeImport.document), blueprints: [importedResource, ...beforeImport.document.blueprints] });
    assert.deepEqual(afterImport.document.targetPolicy, beforeImport.document.targetPolicy);
    const preserved = afterImport.candidates.filter(candidate => !beforeImport.candidates.some(item => item.candidateId === candidate.candidateId));
    assert.equal(preserved.length, 1); assert.equal(preserved[0].state, 'verified'); assert.deepEqual(preserved[0].legacySources, [{ sourceId: 'blueprint:import', raw }]);
    const beforeStampHistory = await history(); await openLibrary();
    const card = library.getByRole('heading', { name: source.name, exact: true }).locator('..').locator('..').locator('..');
    await card.getByRole('button', { name: 'Place at Pos1', exact: true }).click(); await library.waitFor({ state: 'hidden' });
    await page.getByRole('alert').filter({ hasText: /Game compatibility lock|conflicts with this project's existing definition/ }).waitFor();
    assert.deepEqual(await save(), afterImport, 'Rejected stamp changed active document, revisions or originals');
    assert.deepEqual(await history(), beforeStampHistory, 'Rejected stamp changed history');
    assert.deepEqual(liveComparable(await liveDocument()), liveComparable(afterImport.document));
    record({ name: stage, ok: true, blueprintId: importedResource.id, sourceHash: hash(raw), candidateId: preserved[0].candidateId });
  }
  stage = 'actual recovery UI downloads the locked active record and its policy checkpoint without mutation';
  const beforeRecovery = await save();
  const recovery = page.getByRole('dialog', { name: 'Recover your work', exact: true });
  const selectedRecovery = recovery.getByRole('region', { name: 'Selected recovery record', exact: true });
  const downloadRecoveryText = async name => {
    const pending = page.waitForEvent('download'); await recovery.getByRole('button', { name, exact: true }).click();
    const stream = await (await pending).createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  };
  await saving.getByRole('button', { name: 'Recovery', exact: true }).click(); await recovery.waitFor();
  await recovery.getByRole('button', { name: 'Inspect active record', exact: true }).click(); await selectedRecovery.waitFor();
  const activeStored = beforeRecovery.revisions.find(row => row.documentId === beforeRecovery.token.documentId && row.revision === beforeRecovery.token.revision);
  assert.equal(await downloadRecoveryText('Download original document text'), activeStored.json);
  assert.deepEqual(JSON.parse(await downloadRecoveryText('Download active pointer')), beforeRecovery.token);
  await recovery.getByRole('button', { name: 'Inspect referenced policy checkpoint', exact: true }).click();
  const checkpointRef = beforeRecovery.document.targetPolicy.checkpoint;
  const checkpointStored = beforeRecovery.revisions.find(row => row.documentId === checkpointRef.documentId && row.revision === checkpointRef.revision);
  assert.ok(checkpointStored);
  await selectedRecovery.getByLabel('Inspected revision', { exact: true }).filter({ hasText: `Revision ${checkpointRef.revision} ·` }).waitFor();
  await selectedRecovery.getByRole('button', { name: 'Download original document text', exact: true }).waitFor();
  assert.equal(await downloadRecoveryText('Download original document text'), checkpointStored.json);
  assert.deepEqual(await readStorage(), beforeRecovery, 'Inspecting/downloading recovery mutated storage');
  await recovery.getByRole('button', { name: 'Close recovery', exact: true }).click(); await recovery.waitFor({ state: 'hidden' });
  assert.deepEqual(liveComparable(await liveDocument()), liveComparable(beforeRecovery.document));
  record({ name: stage, ok: true, checkpoint: checkpointRef, activeAndCheckpointTextExact: true });
  stage = 'locked library resources and original checkpoints survive final save and reload';
  const final = await save(); await page.reload(); await ready();
  assert.deepEqual(await assets(), report.bundleAssets); assert.deepEqual(await readStorage(), final);
  assert.deepEqual(liveComparable(await liveDocument()), liveComparable(final.document));
  assert.equal(final.document.targetPolicy.target.locked, true); assert.equal(final.document.blueprints.length, 3);
  record({ name: stage, ok: true, documentHash: hash(final.document), checkpointCount: final.revisions.filter(row => row.documentId === final.document.documentId).length });
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.reactErrors, []);
  record({ name: 'no uncaught App exceptions or React update errors', ok: true });
} catch (error) {
  record({ name: stage, ok: false, error: error.message });
  if (page && !page.isClosed()) report.failureUiExcerpt = (await page.locator('body').innerText().catch(() => '')).slice(-6000);
} finally {
  report.finishedAt = new Date().toISOString();
  report.ok = report.results.length > 0 && report.results.every(result => result.ok) && !report.pageErrors.length && !report.reactErrors.length;
  await context?.close(); await browser.close();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-compatibility-workflow-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, failures: report.results.filter(result => !result.ok).map(result => result.name), bundleAssets: report.bundleAssets }));
  if (!report.ok) process.exitCode = 1;
}
