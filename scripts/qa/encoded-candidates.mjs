// Actual IndexedDB encoded-candidate qualification in a disposable browser. No App/provider.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4173').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Encoded candidate QA requires a disposable loopback origin.');
const root = fileURLToPath(new URL('../../', import.meta.url));
const sources = [
  'src/lib/studioEncodedCandidate.browser-tests.ts', 'src/lib/studioDocumentStore.ts', 'src/lib/studioDocument.ts',
  'src/lib/studioTargetPolicy.ts', 'src/lib/studioDocument.test-fixtures.ts', 'src/engine/javaCellMapping.ts',
  'src/engine/javaProfile.ts', 'src/engine/worldEditEngine.ts', 'src/engine/chunkAndPatternEngine.ts',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(new URL(path, `file://${root}`)))])));
const report = {
  startedAt: new Date().toISOString(), origin, browser: '', results: [], pageErrors: [], blockedRequests: [], loadedModules: [],
  sourceBefore: await snapshot(), sourceAfter: {}, sourceStable: false,
  limitations: ['Real Chromium IndexedDB encoded-candidate readback, final-activation conflicts, raw byte/text rescue and disposable unique databases.',
    'No application UI, controller/hook, cross-browser, hardware, provider, native Minecraft, release or deployment qualification.',
    'Single-record IndexedDB cloning is browser-owned; application parsing/envelope output and key pages are bounded. No retention deletion.'],
};
let browser, timeout;
const moduleReads = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
    timeout: 20000, args: process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
  report.browser = browser.version();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) { report.blockedRequests.push(`${url.origin}${url.pathname}`); return route.abort(); }
    if (url.pathname === '/__encoded_candidate_test__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><title>Disposable encoded candidate tests</title><body></body></html>' });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith('/src/')) moduleReads.push((async () => {
      try { report.loadedModules.push({ path: `${url.pathname}${url.search}`, status: response.status(), sha256: hash(await response.body()) }); }
      catch (error) { report.loadedModules.push({ path: url.pathname, error: String(error) }); }
    })());
  });
  await page.goto(`${origin}/__encoded_candidate_test__`, { timeout: 15000 });
  report.results = await Promise.race([
    page.evaluate(async () => {
      const { runStudioEncodedCandidateBrowserTests } = await import('/src/lib/studioEncodedCandidate.browser-tests.ts');
      return runStudioEncodedCandidateBrowserTests();
    }),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Encoded candidate suite exceeded 60 seconds.')), 60000); }),
  ]);
  await Promise.all(moduleReads);
} catch (error) { report.results.push({ name: 'runner', ok: false, error: String(error) }); }
finally {
  clearTimeout(timeout);
  if (browser) await browser.close();
  report.sourceAfter = await snapshot();
  report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  if (!report.sourceStable) report.results.push({ name: 'source remained unchanged during browser run', ok: false, error: 'Relevant source changed; rerun against a frozen candidate.' });
  report.finishedAt = new Date().toISOString();
  await writeFile(process.env.QA_RESULTS ?? '/tmp/studio-encoded-candidate-results.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ results: report.results, sourceStable: report.sourceStable, pageErrors: report.pageErrors }));
  if (report.pageErrors.length || report.results.some(result => !result.ok)) process.exitCode = 1;
}
