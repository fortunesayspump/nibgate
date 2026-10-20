import {parentPort} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
import {mapPage} from './creator-page-model.generated.js';
// One public assessment at a time. No page scripts, resource loading, cookies,
// extension APIs, service environment or external network capability is exposed.
parentPort.on('message',input=>{
 let dom;
 try{
  dom=new JSDOM(input.html,{url:input.url});globalThis.window=dom.window;globalThis.document=dom.window.document;
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){const clone=this.cloneNode(true);clone.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"]').forEach(el=>el.remove());return clone.textContent;}});
  const page=mapPage(dom.window.document);
  const root=page.root?.cloneNode(true);
  root?.querySelectorAll('nav,header,footer,aside,script,style,template,form,[hidden],[aria-hidden="true"]').forEach(el=>el.remove());
  root?.querySelectorAll('p,div,section,article,h1,h2,h3,h4,li,pre,blockquote,tr').forEach(el=>{el.prepend('\n');el.append('\n');});
  const readableText=String(root?.textContent??'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,24000);
  parentPort.postMessage({readableText,source:'extension-page-model',kind:page.kind,eligible:page.kind==='content'&&page.eligibility?.kind==='select'&&page.eligibility.optionId==='render',contentType:page.contentType,author:page.author.slice(0,200),canonical:page.canonical.slice(0,2000),wordCount:page.wordCount,confidence:Math.max(0,Math.min(1,Number(page.eligibility?.value)||0)),trace:page.trace.slice(0,4000)});
 }catch{parentPort.postMessage({source:'extension-page-model',eligible:false,kind:'unknown',unavailable:true});}
 finally{dom?.window.close();delete globalThis.window;delete globalThis.document;}
});
parentPort.postMessage({ready:true});
