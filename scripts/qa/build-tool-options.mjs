// Actual form keyboard/reflow tasks. No private component/App state or provider use.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.TEST_ORIGIN ?? 'http://127.0.0.1:4174').origin;
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname) || !process.env.QA_EXPECTED_JS) throw new Error('Require a frozen disposable loopback candidate.');
const report = { startedAt: new Date().toISOString(), assets: [], results: [], errors: [], screenshots: [], limitations: ['Actual App native Tab/forms in disposable desktop Chromium/software WebGL at1600 and390 CSS pixels. Not browser/OS zoom, physical/coarse devices, assistive technology, whole-app accessibility or conformance.', 'The control geometry assertions cover the new brush/mirror form only. External/API and service workers blocked; no user profile or native game.'] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--enable-unsafe-swiftshader', ...(process.env.QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
const comparable = ({ savedAt, ...value }) => value;
try {
  for (const width of [1600,390]) {
    const context = await browser.newContext({ viewport: { width, height: width===390?844:1100 }, serviceWorkers:'block', acceptDownloads:true });
    try {
      await context.route('**/*', route => { const u=new URL(route.request().url());return u.origin===origin&&!u.pathname.startsWith('/api/')?route.continue():route.abort(); });
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin);
      const saving=page.getByRole('region',{name:'Project saving and recovery',exact:true});await saving.getByRole('status').filter({hasText:'Saved locally'}).waitFor({timeout:30000});
      const assets=await page.locator('script[src],link[rel=stylesheet]').evaluateAll(ns=>ns.map(n=>n.src||n.href));report.assets.push(assets);assert.ok(assets.some(u=>u.endsWith('/'+process.env.QA_EXPECTED_JS)));
      const live=async()=>{const pending=page.waitForEvent('download');await saving.getByRole('button',{name:'Project backup',exact:true}).click();const stream=await(await pending).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
      const before=await live();const details=page.locator('[data-studio-coordinate-editor]');await details.locator(':scope > summary').click();await details.locator('details > summary').click();
      const form=page.getByRole('form',{name:'Brush and mirror settings',exact:true});
      const controls=[form.getByLabel('Brush shape',{exact:true}),form.getByLabel('Brush radius',{exact:true}),form.getByLabel('Cylinder height',{exact:true}),form.getByLabel('Mirror mode',{exact:true}),form.getByLabel('Mirror pivot X',{exact:true}),form.getByLabel('Mirror pivot Z',{exact:true}),form.getByRole('checkbox',{name:'Hollow brush',exact:true}),form.getByRole('checkbox',{name:'Place in empty cells only',exact:true}),form.getByRole('button',{name:'Apply tool settings',exact:true}),form.getByRole('button',{name:'Reload current tool settings',exact:true})];
      await controls[0].focus();
      for(let i=0;i<controls.length;i++){
        assert.equal(await controls[i].evaluate(n=>n===document.activeElement),true,'Unexpected Tab order at control'+i);
        const box=await controls[i].boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1&&box.y>=-1&&box.y+box.height<=(width===390?844:1100)+1,'Focused form control is clipped: '+i+' '+JSON.stringify(box));
        if(i<controls.length-1)await page.keyboard.press('Tab');
      }
      await controls[1].focus();await page.keyboard.press('ArrowDown');await controls[8].focus();await page.keyboard.press('Enter');await form.getByRole('status').filter({hasText:'Tool settings applied'}).waitFor();
      assert.deepEqual(comparable(await live()),comparable(before));
      if(width===390){const path=process.env.QA_SCREENSHOT??'/tmp/studio-brush-options-narrow.png';await details.screenshot({path});report.screenshots.push(path);}
      report.results.push({name:`keyboard brush/mirror form at${width} CSS pixels preserves source and keeps focused controls visible`,ok:true,controls:controls.length,width});
    }catch(error){report.results.push({name:`keyboard/reflow at${width}`,ok:false,error:error.stack??String(error)});}finally{await context.close();}
  }
}finally{await browser.close();report.finishedAt=new Date().toISOString();report.ok=report.results.every(r=>r.ok)&&!report.errors.length;await writeFile(process.env.QA_RESULTS??'/tmp/studio-build-tool-options.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;}
