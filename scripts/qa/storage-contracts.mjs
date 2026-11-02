const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sourcePaths=['src/lib/studioDocumentStore.browser-tests.ts','src/lib/studioDocumentStore.ts','src/lib/studioDocument.ts','src/lib/studioId.ts','src/lib/studioTargetPolicy.ts','src/lib/studioEditorSession.ts','src/engine/worldEditEngine.ts','src/engine/placementContent.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(new URL(`../../${path}`,import.meta.url))).digest('hex')])));
const sourceBefore=await hashes(),results=[];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173' || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/__storage_test__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><title>Disposable storage test</title><body></body></html>' });
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/__storage_test__');
  const returned = await page.evaluate(async () => {
    const { runStudioDocumentStoreBrowserTests } = await import('/src/lib/studioDocumentStore.browser-tests.ts');
    return runStudioDocumentStoreBrowserTests();
  });
  results.push(...returned);
} catch(error) { results.push({name:'store runner',ok:false,error:String(error)}); }
finally {
  await browser.close();const sourceAfter=await hashes(),sourceStable=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter);
  if(!sourceStable)results.push({name:'source stable',ok:false,error:'Source changed during the browser checks.'});
  const receipt={testedAt:new Date().toISOString(),sourceBefore,sourceAfter,sourceStable,results,limitations:['Disposable IndexedDB harness; external/API and service workers blocked. Not full App, provider, native, physical/assistive or performance acceptance.']};
  if(process.env.QA_RESULTS)await writeFile(process.env.QA_RESULTS,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));if(results.some(result=>!result.ok))process.exitCode=1;
}
