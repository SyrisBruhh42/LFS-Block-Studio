const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sourcePaths = ['src/lib/studioRecoveryUi.browser-tests.tsx', 'src/lib/useStudioPersistence.ts', 'src/lib/studioDocumentStore.ts', 'src/components/StudioRecoveryPanel.tsx', 'src/lib/studioDocument.ts', 'src/lib/studioTargetPolicy.ts'];
const snapshot = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(new URL(`../../${path}`, import.meta.url))).digest('hex')])));
const sourceBefore = await snapshot();
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Disposable recovery UI QA requires loopback.');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: [...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
const results = [];
const contexts = [];
async function pageForTest() {
  const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
  await context.addInitScript(() => { globalThis.__STUDIO_TEST_DISPOSABLE_CONTEXT__ = true; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__studio-recovery-ui-tests__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body></body></html>` });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${origin}/__studio-recovery-ui-tests__`);
  return { context, page, errors };
}
try {
  const discovery = await pageForTest();
  const names = await discovery.page.evaluate(async () => (await import('/src/lib/studioRecoveryUi.browser-tests.tsx')).studioRecoveryUiCaseNames);
  await discovery.context.close();
  for (const name of names) {
    const { context, page, errors } = await pageForTest();
    let timer;
    try {
      const result = await Promise.race([page.evaluate(async name => (await import('/src/lib/studioRecoveryUi.browser-tests.tsx')).runStudioRecoveryUiCase(name), name), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Case exceeded15 seconds')), 15000); })]);
      if (errors.length) result.pageErrors = errors;
      results.push(result); console.log(JSON.stringify(result));
    } catch (reason) { const result = { name, ok: false, error: String(reason), pageErrors: errors }; results.push(result); console.log(JSON.stringify(result)); }
    finally { clearTimeout(timer); await context.close(); }
  }
} finally {
  const browserVersion = browser.version(); await browser.close();
  const sourceAfter = await snapshot(); const sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
  if (!sourceStable) results.push({ name: 'source stable', ok: false, error: 'Source changed during test; rerun.' });
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-recovery-ui-results.json', JSON.stringify({ testedAt: new Date().toISOString(), browser: browserVersion, sourceBefore, sourceAfter, sourceStable, results, limitations: ['Mounted React hook and recovery panel in disposable Chromium; all API/external requests blocked.', 'Download bytes captured from the generated Blob; OS file save interaction is not qualified.', 'Not full App, cross-browser, assistive technology, provider, hardware or deployment qualification.'] }, null, 2));
}
if (results.some(result => !result.ok || result.pageErrors?.length)) process.exitCode = 1;
