// Disposable local production-preview check. No normal browser profile or provider requests.
// PLAYWRIGHT_MODULE / CHROME_PATH select already-installed test tools; no dependencies are installed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Navigation QA requires an isolated loopback test origin.');
const report = {
  startedAt: new Date().toISOString(), origin, browser: '', assets: [], results: [], pageErrors: [], blockedExternalOrigins: [],
  limitations: ['Disposable desktop Chromium context with software WebGL; no native touch, pen, trackpad, gamepad, screen-reader or OS shortcut qualification.', 'Composition and coalesced Alt events include synthetic DOM fixtures, not a real IME device.', 'Camera matrices are observed through pass-through WebGL uniform instrumentation; no production source/test seam is added.', 'External requests and service workers are blocked; cloud/provider behavior is not exercised.'],
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cameraTolerance = 1e-6;
const assertCameraNear = (actual, expected) => {
  let maxDifference = 0;
  for (const name of ['viewMatrix', 'projectionMatrix', ...(expected.modelViewMatrix ? ['modelViewMatrix'] : [])]) {
    assert.equal(actual[name]?.length, 16, `${name} was not observable`);
    assert.equal(expected[name]?.length, 16, `${name} reference was not observable`);
    for (let index = 0; index < 16; index++) {
      assert.ok(Number.isFinite(actual[name][index]) && Number.isFinite(expected[name][index]), `${name}[${index}] must be finite`);
      maxDifference = Math.max(maxDifference, Math.abs(actual[name][index] - expected[name][index]));
    }
  }
  if (expected.cameraPosition) {
    assert.equal(actual.cameraPosition?.length, 3, 'Rendered cameraPosition was not observable');
    for (let index = 0; index < 3; index++) maxDifference = Math.max(maxDifference, Math.abs(actual.cameraPosition[index] - expected.cameraPosition[index]));
  }
  assert.ok(maxDifference <= cameraTolerance, `Camera matrix delta ${maxDifference} exceeds tolerance ${cameraTolerance}`);
  return maxDifference;
};
report.cameraMatrixAbsoluteTolerance = cameraTolerance;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
let context;
let page;
let baseline;
const externalOrigins = new Set();
const record = value => { report.results.push(value); console.log(JSON.stringify(value)); };

try {
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
  context.setDefaultTimeout(12000);
  await context.route('**/*', route => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === origin && !new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
    externalOrigins.add(requestOrigin);
    return route.abort();
  });
  await context.addInitScript(() => {
    window.__navigationQaMatrices = {};
    window.__navigationQaDraws = 0;
    // Observe the real rendered camera without exposing or modifying React/Three internals.
    for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Constructor) continue;
      const prototype = Constructor.prototype;
      for (const method of ['drawElements', 'drawArrays']) {
        const original = prototype[method];
        prototype[method] = function(...args) { window.__navigationQaDraws++; return original.apply(this, args); };
      }
      const locations = new WeakMap();
      const originalLocation = prototype.getUniformLocation;
      const originalMatrix = prototype.uniformMatrix4fv;
      prototype.getUniformLocation = function(...args) {
        const location = originalLocation.apply(this, args);
        if (location && ['viewMatrix', 'projectionMatrix', 'modelViewMatrix', 'cameraPosition'].includes(args[1])) locations.set(location, args[1]);
        return location;
      };
      prototype.uniformMatrix4fv = function(...args) {
        const name = locations.get(args[0]);
        if (name) window.__navigationQaMatrices[name] = Array.from(args[2]).slice(args[3] ?? 0, (args[3] ?? 0) + 16);
        return originalMatrix.apply(this, args);
      };
      for (const method of ['uniform3f', 'uniform3fv']) {
        const original = prototype[method];
        prototype[method] = function(...args) {
          if (locations.get(args[0]) === 'cameraPosition') window.__navigationQaMatrices.cameraPosition = method === 'uniform3f' ? args.slice(1, 4) : Array.from(args[1]).slice(args[2] ?? 0, (args[2] ?? 0) + 3);
          return original.apply(this, args);
        };
      }
    }
    window.__navigationQaReadActive = async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('lfs_studio_documents_v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const read = (store, key) => new Promise((resolve, reject) => {
          const transaction = db.transaction(store, 'readonly');
          const request = transaction.objectStore(store).get(key);
          let value;
          request.onsuccess = () => { value = request.result; };
          transaction.oncomplete = () => resolve(value);
          transaction.onabort = () => reject(transaction.error);
        });
        const token = await read('metadata', 'active');
        if (!token) throw new Error('No active project token');
        return JSON.parse((await read('revisions', [token.documentId, token.revision])).json);
      } finally { db.close(); }
    };
  });
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin);
  const saveRegion = page.getByRole('region', { name: 'Project saving and recovery' });
  const toolbar = page.getByRole('region', { name: 'Camera navigation' });
  const canvas = page.getByTestId('skyblock-3d-canvas').locator('canvas');
  const ready = () => saveRegion.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  await ready();
  report.assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href).filter(Boolean));
  if (process.env.QA_EXPECTED_JS) assert.ok(report.assets.some(url => url.endsWith(`/${process.env.QA_EXPECTED_JS}`)), 'Preview is not the required frozen bundle');
  baseline = await page.evaluate(() => window.__navigationQaReadActive());
  report.initialDocumentHash = hash(baseline);

  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const camera = async () => { await settle(); return page.evaluate(() => structuredClone(window.__navigationQaMatrices)); };
  const choose = async action => { await toolbar.getByRole('button', { name: action, exact: true }).click(); await settle(); };
  // Software WebGL queues GPU completion and another draw beyond two animation frames.
  // Wait for an observed real draw instead of treating a requested view as rendered.
  const draws = () => page.evaluate(() => window.__navigationQaDraws);
  const drawnAfter = async count => page.waitForFunction(before => window.__navigationQaDraws > before, count);
  const chooseRendered = async action => { const before = await draws(); await choose(action); await drawnAfter(before); };
  const restoredCamera = async expected => {
    await page.waitForFunction(({ expected, tolerance }) => ['viewMatrix', 'projectionMatrix', ...(expected.modelViewMatrix ? ['modelViewMatrix'] : []), ...(expected.cameraPosition ? ['cameraPosition'] : [])].every(name => {
      const current = window.__navigationQaMatrices[name];
      return current?.length === expected[name]?.length && current.every((value, index) => Number.isFinite(value) && Math.abs(value - expected[name][index]) <= tolerance);
    }), { expected, tolerance: cameraTolerance });
    return camera();
  };
  const pixels = () => canvas.evaluate(element => element.toDataURL('image/png'));
  const waitPixels = async (expected, equal) => page.waitForFunction(({ expected, equal }) => {
    const image = document.querySelector('[data-testid="skyblock-3d-canvas"] canvas')?.toDataURL('image/png');
    return image && (equal ? image === expected : image !== expected);
  }, { expected, equal });
  const mode = async (name, projection = 'Perspective') => {
    await page.waitForFunction(({ name, projection }) => {
      const region = document.querySelector('[aria-label="Camera navigation"]');
      return region?.querySelector('.studio-navigation__state')?.textContent.includes(projection)
        && [...region.querySelectorAll('button')].find(button => button.textContent === name)?.getAttribute('aria-pressed') === 'true';
    }, { name, projection });
  };
  const orthographic = async () => {
    await page.waitForFunction(() => document.querySelector('.studio-navigation__state')?.textContent.includes('Orthographic'));
    assert.equal(await toolbar.getByRole('button', { name: 'Fly', exact: true }).getAttribute('aria-pressed'), 'false');
  };
  const press = async key => { await canvas.focus(); await page.keyboard.press(key); await settle(); };
  const assertNoAuthoredChanges = async () => {
    await saveRegion.getByRole('button', { name: 'Save', exact: true }).click();
    await ready();
    const current = await page.evaluate(() => window.__navigationQaReadActive());
    assert.deepEqual(current, baseline, 'Camera/input-only actions changed the complete saved authored document');
    return hash(current);
  };
  const check = async (name, run) => {
    try { const observations = await run(); record({ name, ok: true, ...observations }); }
    catch (error) {
      record({ name, ok: false, error: error.message });
      const close = page.locator('[role="dialog"] button[aria-label^="Close "]');
      if (await close.count()) await close.last().click().catch(() => {});
    } finally {
      await page.keyboard.up('Alt'); await page.keyboard.up('w'); await page.mouse.up();
    }
  };
  const closeHotkeys = async () => {
    await page.getByRole('button', { name: 'Close Controls, Mouse Free-Look & Hotkey Mapping', exact: true }).click();
    await page.getByRole('dialog', { name: 'Controls, Mouse Free-Look & Hotkey Mapping', exact: true }).waitFor({ state: 'hidden' });
  };

  await check('Orbit/Fly/C/F/Home and legacy ribbon labels share one mode', async () => {
    await choose('Orbit'); await mode('Orbit');
    assert.equal(await page.getByRole('button', { name: 'WASD Fly: OFF', exact: true }).count(), 1);
    await choose('Fly'); await mode('Fly');
    assert.equal(await page.getByRole('button', { name: 'WASD Fly: ON', exact: true }).count(), 1);
    await press('c'); await mode('Orbit');
    await press('c'); await mode('Fly');
    await press('f'); await mode('Orbit');
    await press('f'); await mode('Fly');
    await press('Home'); await mode('Orbit');
    await page.getByRole('button', { name: 'WASD Fly: OFF', exact: true }).click(); await mode('Fly');
    await page.getByRole('button', { name: 'WASD Fly: ON', exact: true }).click(); await mode('Orbit');
    return { authoredHash: await assertNoAuthoredChanges() };
  });

  await check('temporary Alt look restores the orthographic camera after flight movement', async () => {
    await choose('Top'); await orthographic();
    const before = await camera();
    assert.equal(before.viewMatrix?.length, 16, 'Rendered view matrix was not observable');
    assert.equal(before.projectionMatrix?.length, 16, 'Rendered projection matrix was not observable');
    await canvas.focus(); await page.keyboard.down('Alt'); await mode('Fly');
    const temporary = await camera();
    assert.notDeepEqual(temporary.projectionMatrix, before.projectionMatrix);
    await page.keyboard.down('w'); await page.waitForTimeout(140); await page.keyboard.up('w');
    await page.keyboard.up('Alt'); await orthographic();
    const restored = await camera();
    const maxCameraMatrixDifference = assertCameraNear(restored, before);
    return { referenceCameraHash: hash(before), restoredCameraHash: hash(restored), maxCameraMatrixDifference, authoredHash: await assertNoAuthoredChanges() };
  });

  await check('ordinary navigation cancels temporary look; stale and coalesced releases are harmless', async () => {
    await choose('Top'); await canvas.focus(); await page.keyboard.down('Alt'); await mode('Fly');
    await choose('Front'); await orthographic(); const front = await camera();
    await page.keyboard.up('Alt'); await settle(); assertCameraNear(await camera(), front);
    await canvas.evaluate(element => {
      element.focus();
      for (const type of ['keydown', 'keyup']) element.dispatchEvent(new KeyboardEvent(type, { code: 'AltLeft', key: 'Alt', bubbles: true, cancelable: true, altKey: type === 'keydown' }));
    });
    await settle(); await orthographic(); assertCameraNear(await camera(), front);
    return { authoredHash: await assertNoAuthoredChanges() };
  });

  await check('Pan, frame/view$HOME actions preserve authored content', async () => {
    for (const action of ['Pan', 'Orbit', 'Frame all', 'Home', 'Top', 'Front', 'Side', 'Previous']) await choose(action);
    await choose('Pan');
    const box = await canvas.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.65 + 75, box.y + box.height * 0.65 + 40, { steps: 5 }); await page.mouse.up();
    await choose('Home'); await mode('Orbit');
    return { authoredHash: await assertNoAuthoredChanges() };
  });

  await check('native Tab traverses controls without accepting ghosts or changing camera', async () => {
    await choose('Orbit'); const before = await camera();
    const orbit = toolbar.getByRole('button', { name: 'Orbit', exact: true }); await orbit.focus();
    await page.keyboard.press('Tab');
    assert.equal(await toolbar.getByRole('button', { name: 'Pan', exact: true }).evaluate(element => element === document.activeElement), true);
    assertCameraNear(await camera(), before);
    return { authoredHash: await assertNoAuthoredChanges() };
  });

  await check('project dialog text/shortcuts and command drops cannot fly or mutate authored content', async () => {
    // A valid one-cell selection makes //clear a meaningful mutation if the drop guard fails.
    const selected = Object.values(baseline.blocks)[0].position;
    const commandInput = page.getByLabel('WorldEdit Command Input', { exact: true });
    for (const command of [`//pos1 ${selected.x} ${selected.y} ${selected.z}`, `//pos2 ${selected.x} ${selected.y} ${selected.z}`]) {
      await commandInput.fill(command); await commandInput.press('Enter');
    }
    await choose('Fly'); const before = await camera();
    await page.getByRole('button', { name: 'Projects & Reset', exact: true }).click();
    const input = page.getByLabel('Project Name', { exact: true });
    await input.fill(''); await input.pressSequentially('wasdcf'); await input.press('Home');
    await page.getByTestId('skyblock-3d-canvas').evaluate(element => {
      const transfer = new DataTransfer(); transfer.setData('text/plain', JSON.stringify({ type: 'command', targetId: '//clear' }));
      element.parentElement.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await settle(); await mode('Fly'); assertCameraNear(await camera(), before);
    await page.getByRole('button', { name: 'Close LFS Block Studio — Projects & Settings', exact: true }).click();
    await choose('Home');
    return { authoredHash: await assertNoAuthoredChanges(), dropFixture: 'synthetic command drop while actual project dialog is open' };
  });

  await check('hotkey capture preserves Tab, stops for composition and does not survive close', async () => {
    await choose('Orbit'); await press('m');
    const original = await page.evaluate(() => localStorage.getItem('brickforge_hotkeys_v1'));
    const badge = page.getByTestId('hotkey-bind-moveForward');
    await badge.click(); await page.keyboard.press('Tab');
    await page.getByRole('status').filter({ hasText: 'Tab is reserved for moving focus' }).waitFor();
    assert.equal(await badge.evaluate(element => document.activeElement === element), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('brickforge_hotkeys_v1')), original);
    await badge.click();
    await badge.dispatchEvent('compositionstart', { data: '' });
    await page.getByRole('status').filter({ hasText: 'Key capture stopped for text composition' }).waitFor();
    await page.keyboard.press('w');
    assert.equal(await page.evaluate(() => localStorage.getItem('brickforge_hotkeys_v1')), original);
    await badge.click(); await closeHotkeys();
    await press('c'); await mode('Fly');
    assert.equal(await page.evaluate(() => localStorage.getItem('brickforge_hotkeys_v1')), original);
    await choose('Home');
    return { authoredHash: await assertNoAuthoredChanges() };
  });

  await check('single-click camera steps change perspective and orthographic views, Previous restores each, and authored state stays equal', async () => {
    await toolbar.locator('summary').filter({ hasText: 'Move camera without dragging' }).click();
    const observations = [];
    for (const projection of ['perspective', 'orthographic']) {
      await chooseRendered(projection === 'perspective' ? 'Home' : 'Top');
      for (const action of ['Pan left', 'Pan right', 'Pan up', 'Pan down', 'Orbit left', 'Orbit right', 'Orbit up', 'Orbit down', 'Zoom in', 'Zoom out']) {
        const before = await pixels(); await chooseRendered(action); await waitPixels(before, false);
        const moved = await pixels(); assert.notEqual(moved, before, `${projection} ${action} did not change the visible canvas`);
        await chooseRendered('Previous'); await waitPixels(before, true);
        observations.push({ projection, action, previousImageExact: true, beforeImageHash: hash(before), movedImageHash: hash(moved) });
      }
    }
    await choose('Home');
    return { steps: observations, authoredHash: await assertNoAuthoredChanges() };
  });
  await check('native keyboard activation of step controls moves the camera without triggering edits or flight', async () => {
    await chooseRendered('Home'); const before = await pixels(), beforeDraw = await draws();
    const pan = toolbar.getByRole('button', { name: 'Pan left', exact: true }); await pan.focus(); await page.keyboard.press('Space');
    await drawnAfter(beforeDraw); await waitPixels(before, false); const moved = await pixels(); assert.notEqual(moved, before); await mode('Orbit');
    assert.equal(await pan.evaluate(element => element === document.activeElement), true);
    await chooseRendered('Previous'); await waitPixels(before, true);
    return { authoredHash: await assertNoAuthoredChanges() };
  });
  report.finalDocumentHash = await assertNoAuthoredChanges();
  if (report.pageErrors.length) record({ name: 'no uncaught browser exceptions', ok: false, error: report.pageErrors.join('; ') });
} catch (error) {
  record({ name: 'navigation harness setup/finalization', ok: false, error: error.message });
} finally {
  report.blockedExternalOrigins = [...externalOrigins];
  report.finishedAt = new Date().toISOString();
  report.ok = report.results.length > 0 && report.results.every(result => result.ok) && report.pageErrors.length === 0;
  await context?.close(); await browser.close();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/lfs-navigation-results.json', JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  console.log(JSON.stringify({ ok: report.ok, checks: report.results.length, failures: report.results.filter(result => !result.ok).map(result => result.name), assets: report.assets }));
}
