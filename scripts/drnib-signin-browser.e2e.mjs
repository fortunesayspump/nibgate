/** Actual ResearchNewPage rendered with explicitly synthetic test-only boundaries.
 * No OAuth, wallet, payment or research service is contacted.
 * Run: node --test scripts/drnib-signin-browser.e2e.mjs
 * Optional: SIGNIN_TEST_NODE_MODULES=/path/to/node_modules, CHROMIUM_PATH=/path/to/chromium
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const modules=process.env.SIGNIN_TEST_NODE_MODULES;
const require=createRequire(modules?path.join(modules,'_signin_test.cjs'):path.join(root,'scripts/fixtures/drnib-signin/package.json'));
const reactRequire=createRequire(path.join(root,'frontend/package.json'));
const {build}=require('esbuild');
const {chromium}=require('playwright');
const mock=path.join(root,'scripts/fixtures/drnib-signin/mocks.tsx');
const mocked=new Set(['@/lib/dr-nib-private-records','@/lib/dr-nib-api','@/lib/useNibgateConnect','@/components/dr-nib/SourceManager','@/components/dr-nib/EscrowDeposit','next/link','next/navigation','lucide-react','@/lib/dr-nib-private-actions','@/lib/dr-nib-guest-planning']);
let server,browser,directory,url;
test.before(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),'drnib-signin-ui-'));
 await build({entryPoints:[path.join(root,'scripts/fixtures/drnib-signin/entry.tsx')],bundle:true,outfile:path.join(directory,'app.js'),platform:'browser',jsx:'automatic',nodePaths:modules?[modules]:[],define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'synthetic-boundaries',setup(b){b.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:reactRequire.resolve(args.path)}));b.onResolve({filter:/.*/},args=>mocked.has(args.path)?{path:mock}:undefined);}}]});
 server=createServer(async(req,res)=>{if(req.url==='/test.css'&&process.env.SIGNIN_TEST_CSS){res.setHeader('content-type','text/css');res.end(await readFile(process.env.SIGNIN_TEST_CSS));}else if(req.url?.startsWith('/fonts/')&&!req.url.includes('..')){try{res.end(await readFile(path.join(root,'frontend/public',req.url)));}catch{res.writeHead(404);res.end();}}else if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(await readFile(path.join(directory,'app.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en" data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test-only DrNib sign-in</title><link rel="stylesheet" href="/test.css"><body class="group/body" data-default-theme="light"><div class="nibgate-site-surface block text-black text-base font-normal leading-relaxed tracking-tight"><main class="min-h-screen" style="background:var(--nib-page-bg);color:var(--nib-page-fg)"><div class="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8" id="root"></div></main></div><script src="/app.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(directory)await rm(directory,{recursive:true,force:true});});
async function setup(width=1280){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 await page.goto(url);await page.getByRole('textbox',{name:'Research question'}).waitFor();return page;
}
const state=page=>page.evaluate(()=>({opens:window.__signinTest.opens,creates:window.__signinTest.creates,checks:window.__signinTest.checks}));
for(const width of [1280,390]){
 test(`actual composer, ${width}px: Google choice resumes exactly once and preserves question`,async()=>{
  const page=await setup(width);try{
   const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Synthetic test question');
   await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await input.inputValue(),'Synthetic test question');
   assert.deepEqual((await state(page)).creates,[]);
   await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByText('Test-only scope question',{exact:true}).waitFor();
   assert.deepEqual((await state(page)).creates,['Synthetic test question']);assert.equal((await state(page)).opens,1);
  }finally{await page.close();}
 });
 test(`actual composer, ${width}px: cancelled dialog offers keyboard-accessible retry`,async()=>{
  const page=await setup(width);try{
   const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Retained after cancellation');await input.press('Enter');
   await page.getByRole('button',{name:'Cancel sign-in'}).click();const retry=page.getByRole('button',{name:'Sign in to continue',exact:true});await retry.waitFor();
   if(process.env.SIGNIN_TEST_SCREENSHOTS){await mkdir(process.env.SIGNIN_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SIGNIN_TEST_SCREENSHOTS,`research-signin-${width}.png`),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow');}assert.equal(await input.inputValue(),'Retained after cancellation');assert.deepEqual((await state(page)).creates,[]);
   await retry.focus();assert.equal(await retry.evaluate(el=>el===document.activeElement),true);await retry.press('Enter');
   await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByText('Test-only scope question',{exact:true}).waitFor();
   assert.deepEqual((await state(page)).creates,['Retained after cancellation']);
  }finally{await page.close();}
 });
}
test('actual composer: edit during open dialog never submits old or new question automatically',async()=>{
 const page=await setup();try{const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Old question');await input.press('Enter');await page.getByRole('dialog').waitFor();await input.fill('New question');await page.getByRole('button',{name:'Continue with Google'}).click();await page.waitForTimeout(100);assert.deepEqual((await state(page)).creates,[]);await input.press('Enter');await page.getByText('Test-only scope question',{exact:true}).waitFor();assert.deepEqual((await state(page)).creates,['New question']);}finally{await page.close();}
});
test('actual composer: expired authentication after dialog never loops',async()=>{
 const page=await setup();try{await page.evaluate(()=>{window.__signinTest.expired=true;});await page.getByRole('textbox',{name:'Research question'}).fill('Expired session question');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Sign in to continue',exact:true}).waitFor();assert.deepEqual((await state(page)).creates,[]);assert.equal((await state(page)).opens,1);}finally{await page.close();}
});
test('actual composer: signed-in visitor bypasses dialog; mutation 401 is not replayed',async()=>{
 const page=await setup();try{await page.evaluate(()=>{window.__signinTest.authenticated=true;window.__signinTest.failCreate=true;});await page.getByRole('textbox',{name:'Research question'}).fill('No automatic mutation retry');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Sign in to continue',exact:true}).waitFor();assert.deepEqual((await state(page)).creates,['No automatic mutation retry']);assert.equal((await state(page)).opens,0);}finally{await page.close();}
});
test('actual composer: repeated Enter while dialog is open creates one auth intent',async()=>{
 const page=await setup();try{const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Single intent');await input.press('Enter');await page.getByRole('dialog').waitFor();await input.press('Enter');await input.press('Enter');assert.equal((await state(page)).opens,1);await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByText('Test-only scope question',{exact:true}).waitFor();assert.deepEqual((await state(page)).creates,['Single intent']);}finally{await page.close();}
});
test('actual composer: navigation/unmount while dialog is open prevents late submission',async()=>{
 const page=await setup();try{await page.getByRole('textbox',{name:'Research question'}).fill('Abandoned intent');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('dialog').waitFor();await page.evaluate(()=>window.__unmountResearch());await page.getByRole('button',{name:'Continue with Google'}).click();await page.waitForTimeout(100);assert.deepEqual((await state(page)).creates,[]);}finally{await page.close();}
});
