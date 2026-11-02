const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sourcePaths = ['src/lib/useStudioPersistence.browser-tests.tsx', 'src/lib/useStudioPersistence.ts', 'src/lib/studioDocumentStore.ts', 'src/lib/studioEditorSession.ts', 'src/lib/studioHistoryDelta.ts', 'src/lib/legacyStudioImport.ts', 'src/lib/studioDocument.ts', 'src/lib/studioTargetPolicy.ts'];
const snapshot = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(new URL(`../../${path}`, import.meta.url))).digest('hex')])));
const sourceBefore = await snapshot();
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: [...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
const results = [];
const contexts = [];
async function pageForTest() {
  const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
  await context.addInitScript(() => { globalThis.__STUDIO_TEST_DISPOSABLE_CONTEXT__ = true; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__studio-hook-contract-tests__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body></body></html>` });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${origin}/__studio-hook-contract-tests__`);
  return { context, page, errors };
}
try {
  const discovery = await pageForTest();
  const names = await discovery.page.evaluate(async () => (await import('/src/lib/useStudioPersistence.browser-tests.tsx')).studioPersistenceBrowserCaseNames);
  await discovery.context.close();
  for (const name of names) {
    const { context, page, errors } = await pageForTest();
    try {
      const result = await page.evaluate(async name => (await import('/src/lib/useStudioPersistence.browser-tests.tsx')).runStudioPersistenceBrowserTest(name), name);
      if (errors.length) result.pageErrors = errors;
      results.push(result); console.log(JSON.stringify(result));
    } catch (reason) { const result = { name, ok: false, error: String(reason), pageErrors: errors }; results.push(result); console.log(JSON.stringify(result)); }
    finally { await context.close(); }
  }
} finally {
  const browserVersion = browser.version(); await browser.close();
  const sourceAfter = await snapshot(), sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
  if (!sourceStable) results.push({ name: 'source stable', ok: false, error: 'Relevant source changed during the run.' });
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-hook-race-results.json', JSON.stringify({ testedAt: new Date().toISOString(), browser: browserVersion, sourceBefore, sourceAfter, sourceStable, results }, null, 2));
}
if (results.some(result => !result.ok || result.pageErrors?.length)) process.exitCode = 1;
