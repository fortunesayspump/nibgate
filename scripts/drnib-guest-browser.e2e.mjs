/** Actual ResearchNewPage rendered with explicitly synthetic test-only boundaries.
 * No OAuth, wallet, payment or research service is contacted.
 * Run: node --test scripts/drnib-guest-browser.e2e.mjs
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
const mock=path.join(root,'scripts/fixtures/drnib-guest/mocks.tsx');
const mocked=new Set(['@/lib/dr-nib-private-records','@/lib/dr-nib-api','@/lib/useNibgateConnect','@/components/dr-nib/SourceManager','@/components/dr-nib/EscrowDeposit','next/link','next/navigation','@/lib/dr-nib-private-actions','@/lib/dr-nib-guest-planning']);
let server,browser,directory,url;
test.before(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),'drnib-signin-ui-'));
 await build({entryPoints:[path.join(root,'scripts/fixtures/drnib-guest/entry.tsx')],bundle:true,outfile:path.join(directory,'app.js'),platform:'browser',jsx:'automatic',nodePaths:modules?[modules]:[],define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},plugins:[{name:'synthetic-boundaries',setup(b){b.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:reactRequire.resolve(args.path)}));b.onResolve({filter:/.*/},args=>mocked.has(args.path)?{path:mock}:undefined);}}]});
 server=createServer(async(req,res)=>{if(req.url==='/test.css'&&process.env.SIGNIN_TEST_CSS){res.setHeader('content-type','text/css');res.end(await readFile(process.env.SIGNIN_TEST_CSS));}else if(req.url?.startsWith('/fonts/')&&!req.url.includes('..')){try{res.end(await readFile(path.join(root,'frontend/public',req.url)));}catch{res.writeHead(404);res.end();}}else if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(await readFile(path.join(directory,'app.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en" data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test-only DrNib sign-in</title><link rel="stylesheet" href="/test.css"><body class="group/body" data-default-theme="light"><div class="nibgate-site-surface block text-black text-base font-normal leading-relaxed tracking-tight"><main class="min-h-screen" style="background:var(--nib-page-bg);color:var(--nib-page-fg)"><div class="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8" id="root"></div></main></div><script src="/app.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(directory)await rm(directory,{recursive:true,force:true});});
async function setup(width=1280,initial={}){
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(8000);page.on('pageerror',error=>console.error(error));
 await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 await page.addInitScript(value=>{window.__guestInitial=value;},initial);await page.goto(url);await page.getByRole('textbox',{name:'Research question'}).waitFor();return page;
}
const snapshot=page=>page.evaluate(()=>({opens:window.__signinTest.opens,creates:window.__signinTest.creates,requests:window.__guestTest.requests,adoptions:window.__guestTest.adoptions,funding:window.__guestTest.funding,approvals:window.__guestTest.approvals,escrowReads:window.__guestTest.escrowReads,draft:window.__guestTest.draft,run:window.__guestTest.run}));
async function toConfigure(page){
 await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic guest research question');
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByText('Synthetic guest scope question',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Just plan it/}).click();
 await page.getByRole('heading',{name:'Configure the run'}).waitFor();
}
async function toReview(page){await toConfigure(page);await page.getByRole('button',{name:'Plan run',exact:true}).click();await page.getByRole('heading',{name:'Review the plan'}).waitFor();}
for(const width of [1280,390]){
 test(`guest ${width}px: text-only planning precedes sign-in, private files and funding`,async()=>{
  const page=await setup(width);try{
   await toReview(page);if(process.env.SIGNIN_TEST_SCREENSHOTS){await mkdir(process.env.SIGNIN_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SIGNIN_TEST_SCREENSHOTS,`guest-plan-${width}.png`),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));}const value=await snapshot(page);
   assert.equal(value.opens,0);assert.deepEqual(value.creates,[]);
   assert.deepEqual(value.requests,['intake','finish-intake','configure']);
   assert.equal(value.funding,0);assert.equal(value.approvals,0);assert.equal(value.escrowReads,0);
   await page.getByText('Synthetic worker-generated plan step',{exact:true}).waitFor();
   assert.equal(await page.getByText('Authenticated private upload control',{exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Test-only explicit fund'}).count(),0);
  }finally{await page.close();}
 });
}
for(const width of [1280,390]){
 test(`guest ${width}px: cancelled sign-in keeps plan; retry adopts once without funding`,async()=>{
  const page=await setup(width);try{
   await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();
   await page.getByRole('button',{name:'Cancel sign-in'}).click();
   await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).waitFor();
   assert.equal((await snapshot(page)).adoptions,0);await page.getByText('Synthetic worker-generated plan step',{exact:true}).waitFor();
   const retry=page.getByRole('button',{name:'Sign in to save this plan',exact:true});await retry.focus();assert.equal(await retry.evaluate(el=>el===document.activeElement),true);await retry.press('Enter');
   await page.getByRole('button',{name:'Continue with Google'}).click();
   await page.getByRole('button',{name:'Test-only explicit fund'}).waitFor();
   const value=await snapshot(page);assert.equal(value.adoptions,1);assert.equal(value.funding,0);assert.equal(value.approvals,0);
   assert.equal(await page.getByRole('button',{name:'Approve & run',exact:true}).isDisabled(),true);
  }finally{await page.close();}
 });
}
test('guest: answered intake and configuration are sent to the mocked worker path',async()=>{
 const page=await setup();try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic answered question');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Synthetic guest scope question',{exact:true}).waitFor();await page.getByPlaceholder('Type your answer').fill('Synthetic answer');
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('heading',{name:'Configure the run'}).waitFor();await page.getByLabel('Depth',{exact:true}).selectOption('deep');
  await page.getByRole('button',{name:'Plan run',exact:true}).click();await page.getByRole('heading',{name:'Review the plan'}).waitFor();
  const value=await snapshot(page);assert.deepEqual(value.requests,['intake','answers','configure']);assert.equal(value.run.brief.depth,'deep');assert.equal(value.opens,0);
 }finally{await page.close();}
});
test('guest: private file controls appear only after explicit sign-in and adoption',async()=>{
 const page=await setup();try{
  await toConfigure(page);assert.equal(await page.getByText('Authenticated private upload control',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Sign in to add private files',exact:true}).click();assert.equal(await page.getByText('Authenticated private upload control',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByText('Authenticated private upload control',{exact:true}).waitFor();
  const value=await snapshot(page);assert.equal(value.adoptions,1);assert.equal(value.funding,0);assert.equal(value.approvals,0);
 }finally{await page.close();}
});
for(const [flag,label] of [['stale','expired'],['unknownValidation','missing validation']]){
 test(`guest: ${label} plan is blocked from escrow until explicit review/replan`,async()=>{
  const page=await setup(1280,{[flag]:true});try{
   await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('button',{name:'Continue with Google'}).click();
   await page.getByRole('heading',{name:'Configure the run'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Test-only explicit fund'}).count(),0);
   const value=await snapshot(page);assert.equal(value.escrowReads,0);assert.equal(value.funding,0);assert.deepEqual(value.requests,['intake','finish-intake','configure']);
  }finally{await page.close();}
 });
}
test('guest: failed adoption retains review and makes a safe explicit retry possible',async()=>{
 const page=await setup(1280,{adoptionFails:true});try{
  await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByText('Adoption could not be confirmed. Your guest draft is retained.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Test-only explicit fund'}).count(),0);assert.ok((await snapshot(page)).draft);
  await page.evaluate(()=>{window.__guestTest.adoptionFails=false;});await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();
  await page.getByRole('button',{name:'Test-only explicit fund'}).waitFor();const value=await snapshot(page);assert.equal(value.opens,1);assert.equal(value.funding,0);
 }finally{await page.close();}
});
test('guest: autosaved review restores after reload without rerunning inference',async()=>{
 const page=await setup();try{
  await toReview(page);await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.phase==='review');const value=await snapshot(page);
  await page.addInitScript(saved=>{window.__guestInitial={draft:saved.draft,run:saved.run};},value);await page.reload();
  await page.getByRole('heading',{name:'Review the plan'}).waitFor();await page.getByText('Synthetic worker-generated plan step',{exact:true}).waitFor();
  const restored=await snapshot(page);assert.deepEqual(restored.requests,[]);assert.equal(restored.opens,0);assert.equal(restored.funding,0);
 }finally{await page.close();}
});
test('guest: storage failure blocks starting an unsaved draft',async()=>{
 const page=await setup(1280,{storageFails:true});try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Unsaved synthetic draft');await page.waitForTimeout(350);
  assert.equal(await page.getByRole('button',{name:'Send',exact:true}).isDisabled(),true);assert.deepEqual((await snapshot(page)).requests,[]);
  await page.getByRole('button',{name:'Retry saving draft'}).waitFor();
 }finally{await page.close();}
});
test('guest: failed account verification never adopts or opens escrow',async()=>{
 const page=await setup();try{
  await toReview(page);await page.evaluate(()=>{window.__signinTest.expired=true;});await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).waitFor();const value=await snapshot(page);assert.equal(value.adoptions,0);assert.equal(value.escrowReads,0);assert.equal(value.funding,0);assert.ok(value.draft);
 }finally{await page.close();}
});
test('guest: repeated adoption clicks keep one sign-in/adoption intent',async()=>{
 const page=await setup();try{
  await toReview(page);const button=page.getByRole('button',{name:'Sign in to save this plan',exact:true});await button.evaluate(el=>{el.click();el.click();});
  await page.getByRole('dialog').waitFor();assert.equal((await snapshot(page)).opens,1);await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByRole('button',{name:'Test-only explicit fund'}).waitFor();const value=await snapshot(page);assert.equal(value.adoptions,1);assert.equal(value.funding,0);assert.equal(value.approvals,0);
 }finally{await page.close();}
});
test('guest: unsent draft autosaves and returns after reload with no service action',async()=>{
 const page=await setup();try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Unsent synthetic question');await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.topic==='Unsent synthetic question');const value=await snapshot(page);
  await page.addInitScript(saved=>{window.__guestInitial={draft:saved.draft};},value);await page.reload();
  assert.equal(await page.getByRole('textbox',{name:'Research question'}).inputValue(),'Unsent synthetic question');const restored=await snapshot(page);assert.deepEqual(restored.requests,[]);assert.equal(restored.opens,0);
 }finally{await page.close();}
});
test('guest: server restore failure retains draft but blocks replay and adoption',async()=>{
 const page=await setup();try{
  await toReview(page);await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.phase==='review');const value=await snapshot(page);
  await page.addInitScript(saved=>{window.__guestInitial={draft:saved.draft,run:saved.run,restoreFails:true};},value);await page.reload();
  await page.getByRole('button',{name:'Reconnect saved draft'}).waitFor();assert.equal(await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).isDisabled(),true);
  assert.deepEqual((await snapshot(page)).requests,[]);assert.equal((await snapshot(page)).adoptions,0);assert.equal(await page.getByRole('button',{name:'Test-only explicit fund'}).count(),0);
 }finally{await page.close();}
});
test('guest: authenticated redirect return resumes only persisted adoption, never funding',async()=>{
 const page=await setup();try{
  await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.pendingAdoption==='plan');const value=await snapshot(page);
  await page.addInitScript(saved=>{window.__guestInitial={draft:saved.draft,run:saved.run,authenticated:true};},value);await page.reload();
  await page.getByRole('button',{name:'Test-only explicit fund'}).waitFor();const restored=await snapshot(page);assert.equal(restored.adoptions,1);assert.equal(restored.opens,0);assert.equal(restored.funding,0);assert.equal(restored.approvals,0);assert.deepEqual(restored.requests,[]);
 }finally{await page.close();}
});
test('guest: cancelling sign-in clears persisted adoption intent before a later account login',async()=>{
 const page=await setup();try{
  await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('button',{name:'Cancel sign-in'}).click();
  await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.pendingAdoption==null);const value=await snapshot(page);
  await page.addInitScript(saved=>{window.__guestInitial={draft:saved.draft,run:saved.run,authenticated:true};},value);await page.reload();
  await page.getByRole('heading',{name:'Review the plan'}).waitFor();assert.equal((await snapshot(page)).adoptions,0);assert.equal(await page.getByRole('button',{name:'Test-only explicit fund'}).count(),0);
 }finally{await page.close();}
});
// Bounded visual-state coverage: production page/CSS with synthetic deferred
// boundaries. Screenshots do not portray a real model, sign-in, or payment.
async function captureGuestState(page,name,width){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow');
 const value=await snapshot(page);assert.equal(value.funding,0);assert.equal(value.approvals,0);
 if(process.env.SIGNIN_TEST_SCREENSHOTS){await mkdir(process.env.SIGNIN_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SIGNIN_TEST_SCREENSHOTS,`guest-${name}-${width}.png`),fullPage:true,animations:'disabled'});}
}
for(const width of [1280,390]){
 test(`guest visual ${width}px: intake loading retains the submitted question`,async()=>{
  const page=await setup(width,{delayIntake:true});try{
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic loading-state question');await page.getByRole('button',{name:'Send',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Preparing your questions…'}).waitFor();await page.getByText('Synthetic loading-state question',{exact:true}).waitFor();
   await captureGuestState(page,'intake-loading',width);assert.deepEqual((await snapshot(page)).requests,['intake']);
  }finally{await page.close();}
 });
 test(`guest visual ${width}px: planning loading disables the plan action`,async()=>{
  const page=await setup(width,{delayPlan:true});try{
   await toConfigure(page);await page.getByRole('button',{name:'Plan run',exact:true}).click();
   const pending=page.getByRole('button',{name:'Planning…',exact:true});await pending.waitFor();assert.equal(await pending.isDisabled(),true);assert.equal(await page.getByLabel('Depth',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Budget cap (USDC)',{exact:true}).isDisabled(),true);await captureGuestState(page,'plan-loading',width);
  }finally{await page.close();}
 });
 test(`guest visual ${width}px: intake error keeps draft and offers another explicit send`,async()=>{
  const page=await setup(width,{intakeFails:true,intakeFailsWithRun:true});try{
   const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Synthetic retained error-state question');await page.getByRole('button',{name:'Send',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Guest planning is temporarily unavailable.'}).waitFor();assert.equal(await input.inputValue(),'Synthetic retained error-state question');
   assert.equal(await page.getByRole('button',{name:'Send',exact:true}).isDisabled(),false);await captureGuestState(page,'intake-error',width);
  }finally{await page.close();}
 });
 test(`guest visual ${width}px: cancellation keeps the plan and accessible retry`,async()=>{
  const page=await setup(width);try{
   await toReview(page);await page.getByRole('button',{name:'Sign in to save this plan',exact:true}).click();await page.getByRole('button',{name:'Cancel sign-in'}).click();
   const retry=page.getByRole('button',{name:'Sign in to save this plan',exact:true});await retry.waitFor();assert.equal(await retry.isDisabled(),false);await retry.focus();assert.equal(await retry.evaluate(el=>el===document.activeElement),true);
   await captureGuestState(page,'signin-cancelled',width);assert.equal((await snapshot(page)).adoptions,0);
  }finally{await page.close();}
 });
 test(`guest visual ${width}px: storage failure keeps text with safe recovery`,async()=>{
  const page=await setup(width,{storageFails:true});try{
   const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Synthetic unsaved storage-error question');await page.getByRole('button',{name:'Retry saving draft'}).waitFor();
   assert.equal(await input.inputValue(),'Synthetic unsaved storage-error question');assert.equal(await page.getByRole('button',{name:'Send',exact:true}).isDisabled(),true);
   await captureGuestState(page,'storage-error',width);assert.deepEqual((await snapshot(page)).requests,[]);
  }finally{await page.close();}
 });
}
test('guest polish: a single existing plan step can be edited and submitted',async()=>{
 const page=await setup();try{
  await toReview(page);await page.getByRole('button',{name:'Edit step 1',exact:true}).click();await page.getByRole('textbox',{name:'Edit step 1',exact:true}).fill('Synthetic edited single plan step');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Synthetic edited single plan step',{exact:true}).waitFor();const value=await snapshot(page);assert.equal(value.requests.filter(x=>x==='edit-plan').length,1);assert.deepEqual(value.run.plan.sub_questions,['Synthetic edited single plan step']);
 }finally{await page.close();}
});
for(const type of ['pick_one','pick_any']){
 test(`guest polish: native ${type} choices support keyboard and Other answers`,async()=>{
  const question={seq:0,key:'scope',type,prompt:'Synthetic choice question',allowOther:true,options:[{id:'first',label:'First synthetic option'},{id:'second',label:'Second synthetic option'}]};
  const page=await setup(1280,{question});try{
   await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic keyboard question');await page.getByRole('button',{name:'Send',exact:true}).click();
   const role=type==='pick_one'?'radio':'checkbox';const first=page.getByRole(role,{name:'First synthetic option',exact:true}),second=page.getByRole(role,{name:'Second synthetic option',exact:true}),other=page.getByRole(role,{name:'Another answer…',exact:true});
   await first.focus();if(type==='pick_one'){
    await first.press('ArrowDown');assert.equal(await second.isChecked(),true);await second.press('ArrowDown');assert.equal(await other.isChecked(),true);assert.equal(await other.evaluate(el=>el===document.activeElement),true);await other.press('Tab');assert.equal(await page.getByRole('textbox',{name:'Another answer: Synthetic choice question'}).evaluate(el=>el===document.activeElement),true);
   }else{await first.press('Space');await other.check();assert.equal(await first.isChecked(),true);assert.equal(await other.isChecked(),true);}
   await page.getByRole('textbox',{name:'Another answer: Synthetic choice question'}).fill('Synthetic alternative');await page.getByRole('button',{name:'Submit answer',exact:true}).click();
   await page.getByRole('button',{name:'Next',exact:true}).waitFor();const answers=await page.evaluate(()=>window.__guestTest.answers);assert.equal(answers[0].answer.text,'Synthetic alternative');assert.deepEqual(answers[0].answer.optionIds,type==='pick_one'?[]:['first']);
  }finally{await page.close();}
 });
}
test('guest polish: report length native radio arrows and output pressed states',async()=>{
 const page=await setup();try{
  await toConfigure(page);const standard=page.getByRole('radio',{name:/Standard · 4,000/}),comprehensive=page.getByRole('radio',{name:/Comprehensive · 12,000/});await standard.focus();await standard.press('ArrowDown');assert.equal(await comprehensive.isChecked(),true);await comprehensive.press('ArrowDown');assert.equal(await page.getByRole('radio',{name:'Custom…',exact:true}).isChecked(),true);await page.getByLabel('Words',{exact:true}).fill('5000');
  const pdf=page.getByRole('button',{name:'pdf',exact:true}),word=page.getByRole('button',{name:'word',exact:true});assert.equal(await pdf.getAttribute('aria-pressed'),'true');await word.click();assert.equal(await word.getAttribute('aria-pressed'),'true');
 }finally{await page.close();}
});
test('guest polish: failed browser storage offers account sign-in with the same question',async()=>{
 const page=await setup(1280,{storageFails:true});try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic account-storage fallback question');await page.getByRole('button',{name:'Sign in and use account storage',exact:true}).click();await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByText('Test-only scope question',{exact:true}).waitFor();await page.waitForTimeout(350);assert.equal(await page.getByRole('alert').filter({hasText:'encrypted draft'}).count(),0);const value=await snapshot(page);assert.deepEqual(value.requests,[]);assert.deepEqual(value.creates,['Synthetic account-storage fallback question']);assert.equal(value.opens,1);assert.equal(value.funding,0);assert.equal(value.approvals,0);
 }finally{await page.close();}
});
test('guest polish: expired restore has an explicit account path, not an endless reconnect loop',async()=>{
 const page=await setup();try{
  await toReview(page);await page.waitForFunction(()=>window.__guestTest.draft?.snapshot?.phase==='review');const value=await snapshot(page);const expiresAt=new Date(Date.now()-60000).toISOString();
  await page.addInitScript(({saved,expiresAt})=>{window.__guestInitial={draft:{...saved.draft,expiresAt,planningExpired:true},run:saved.run,expiresAt,restoreFails:true,restoreErrorCode:'GUEST_SESSION_EXPIRED'};},{saved:value,expiresAt});await page.reload();
  await page.getByRole('button',{name:'Sign in to continue',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reconnect saved draft',exact:true}).count(),0);assert.deepEqual((await snapshot(page)).requests,[]);assert.equal((await snapshot(page)).adoptions,0);assert.equal((await snapshot(page)).funding,0);
 }finally{await page.close();}
});
test('guest polish: saved status is removed immediately after editing until that revision is persisted',async()=>{
 const page=await setup();try{
  const input=page.getByRole('textbox',{name:'Research question'});await input.fill('Synthetic saved revision');await page.getByText('Encrypted draft saved on this device.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.__guestTest.delaySave=true;});await input.fill('Synthetic pending revision');await page.getByText('Saving encrypted draft…',{exact:true}).waitFor();assert.equal(await page.getByText('Encrypted draft saved on this device.',{exact:true}).count(),0);
  await page.waitForFunction(()=>typeof window.__guestTest.resolveSave==='function');await page.evaluate(()=>{window.__guestTest.delaySave=false;window.__guestTest.resolveSave();});await page.getByText('Encrypted draft saved on this device.',{exact:true}).waitFor();assert.equal((await snapshot(page)).draft.snapshot.topic,'Synthetic pending revision');
 }finally{await page.close();}
});
test('guest polish: retained intake failure offers explicit retry without creating another guest run',async()=>{
 const page=await setup(1280,{intakeFails:true,intakeFailsWithRun:true});try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic retained intake question');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Retry questions',exact:true}).waitFor();assert.deepEqual((await snapshot(page)).requests,['intake']);
  await page.getByRole('button',{name:'Retry questions',exact:true}).click();await page.getByText('Synthetic guest scope question',{exact:true}).waitFor();assert.deepEqual((await snapshot(page)).requests,['intake','intake-retry']);assert.equal((await snapshot(page)).opens,0);
 }finally{await page.close();}
});
test('guest polish: mobile native choice selection remains readable with Other text',async()=>{
 const question={seq:0,key:'scope',type:'pick_one',prompt:'Synthetic mobile choice question',allowOther:true,options:[{id:'first',label:'First synthetic option'},{id:'second',label:'Second synthetic option'}]};
 const page=await setup(390,{question});try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic mobile selection');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('radio',{name:'Another answer…',exact:true}).check();await page.getByRole('textbox',{name:'Another answer: Synthetic mobile choice question'}).fill('Synthetic alternative answer');
  assert.equal(await page.getByRole('button',{name:'Submit answer',exact:true}).isDisabled(),false);await captureGuestState(page,'choice-selection',390);
 }finally{await page.close();}
});
test('guest polish: blank plan edit retains editor and previous step without a request',async()=>{
 const page=await setup();try{
  await toReview(page);await page.getByRole('button',{name:'Edit step 1',exact:true}).click();await page.getByRole('textbox',{name:'Edit step 1',exact:true}).fill('   ');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Enter a plan step before saving.'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Edit step 1',exact:true}).count(),1);const value=await snapshot(page);assert.equal(value.requests.includes('edit-plan'),false);assert.deepEqual(value.run.plan.sub_questions,['Synthetic worker-generated plan step']);
 }finally{await page.close();}
});
test('guest polish: thinking-to-next-question transition focuses the new phase heading',async()=>{
 const page=await setup(1280,{moreQuestions:true});try{
  await page.getByRole('textbox',{name:'Research question'}).fill('Synthetic focus transition');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('textbox',{name:'Synthetic guest scope question',exact:true}).fill('Synthetic answer');await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('textbox',{name:'Synthetic follow-up question',exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement?.matches('[data-phase-heading]'));assert.equal(await page.getByRole('textbox',{name:'Synthetic follow-up question',exact:true}).evaluate(el=>el===document.activeElement),false);
 }finally{await page.close();}
});
