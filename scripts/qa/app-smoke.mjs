const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor({ timeout: 30000 });
  const readActive = () => page.evaluate(async () => {
    const { StudioDocumentStore } = await import('/src/lib/studioDocumentStore.ts');
    const store = new StudioDocumentStore(); const loaded = await store.loadActive(); store.close();
    if (!loaded.ok || !loaded.value) throw new Error('Active project unavailable');
    return loaded.value.document;
  });
  const initial = await readActive();
  console.log(JSON.stringify({ startup: true, initialBlocks: Object.keys(initial.blocks).length, initialDefinitions: Object.keys(initial.customBlocks).length, errors }));
  for (const name of ['Pan', 'Orbit', 'Top', 'Front', 'Side', 'Frame all', 'Home', 'Previous']) {
    await page.getByRole('region', { name: 'Camera navigation' }).getByRole('button', { name, exact: true }).click();
  }
  const canvas = page.locator('canvas').first();
  const beforeCamera = await readActive();
  if (JSON.stringify(initial) !== JSON.stringify(beforeCamera)) throw new Error('Camera actions changed the authored document');
  const input = page.locator('input[placeholder^="Press /"]');
  for (const command of ['//pos1 20 2 20', '//pos2 20 2 20', '//set cobble_brick']) {
    await input.fill(command); await input.press('Enter');
  }
  await page.getByRole('region', { name: 'Project saving and recovery' }).getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor();
  const edited = await readActive();
  if (!edited.blocks['20,2,20']) { console.error((await page.locator('body').innerText()).slice(-5000)); throw new Error('Command edit was not durably saved'); }
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'Saved locally' }).waitFor();
  const reloaded = await readActive();
  if (JSON.stringify(edited) !== JSON.stringify(reloaded)) throw new Error('Complete document changed on reload');
  await page.screenshot({ path: '/tmp/lfs-studio-foundation-desktop.png', fullPage: true });
  await writeFile('/tmp/lfs-studio-smoke-dom.txt', await page.locator('body').innerText());
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(JSON.stringify({ navigationWithoutMutation: true, editSaved: true, completeReloadEquality: true, canvas: await canvas.count(), screenshot: '/tmp/lfs-studio-foundation-desktop.png' }));
} catch (error) {
  console.error(error.message);
  console.error(JSON.stringify({ errors })); process.exitCode = 1;
} finally { await browser.close(); }
