import {assessPublicCreatorPage} from './public-creator-detection.js';
import {randomUUID} from 'node:crypto';
import {directExtract} from '../retrieval/providers/direct.js';
import {publicFetch} from '../tools/http.js';

// One ordinary public-tools process reuses the existing retrieval registry,
// its configured SearXNG and circuit breakers. No detector runs in Phala.
import {searchAll} from '../retrieval/index.js';
const SEARCHERS=Object.freeze([async({query,preferCreators=false})=>{
 const result=await searchAll({query,maxResults:preferCreators?12:8,includePaid:false,preferCreators},{deadlineMs:5000});
 if(result.costUsd!==0)throw Error('PUBLIC_SEARCH_COST_INVALID');
 const buckets=new Map();for(const row of result.results){const key=row.provider??'public-web';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);}
 const preferred=preferCreators?['nibgate-hub','mwmbl','searxng','hn','stackexchange']:[];
 const order=[...preferred.filter(p=>buckets.has(p)),...[...buckets.keys()].filter(p=>!preferred.includes(p))],mixed=[];
 for(let rank=0;rank<12;rank++)for(const provider of order){const row=buckets.get(provider)[rank];if(row)mixed.push(row);}
 return {...result,results:mixed.slice(0,12)};
}]);
const UA='DrNibResearch/1.0 (+https://nibgate.xyz; public research)';
function httpsUrl(raw){try{const u=new URL(raw),host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&host.includes('.')&&!host.includes(':')&&!/^\d+\.\d+\.\d+\.\d+$/.test(host)&&!/(?:^|\.)(localhost|local|internal|invalid|test)$/.test(host)?u.href:null}catch{return null}}
/** Ordinary public-tools port. Its entire input is the user-approved search brief;
 * it has no reference to uploads, project keys, chat history or the Hub DB.
 * Keyless search avoids an unmetered paid API or ordinary model fallback. */
export function createPrivatePublicRetrieval({searchers=SEARCHERS,extract=directExtract,fetchPublic=publicFetch,deadlineMs=15000}={}){
    if(!Array.isArray(searchers)||searchers.length<1||searchers.length>12||searchers.some(s=>typeof s!=='function')||typeof extract!=='function'||typeof fetchPublic!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<100||deadlineMs>15000)throw Error('PRIVATE_WEB_CONFIG_INVALID');
    return async input=>{
        if(!input||Object.keys(input).some(k=>!['brief','preferCreators'].includes(k))||input.preferCreators!==undefined&&typeof input.preferCreators!=='boolean'||typeof input.brief!=='string'||input.brief.trim().length<3||input.brief.length>400)throw Error('PRIVATE_TOOL_INPUT_INVALID');
        const query=input.brief.trim().replace(/\s+/g,' ');
        const controller=new AbortController(),signal=controller.signal;
        const timer=setTimeout(()=>controller.abort(),deadlineMs);
        const within=(promise,fallback,timeout=deadlineMs)=>new Promise(resolve=>{
            if(signal.aborted){resolve(fallback);return}
            let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(localTimer);signal.removeEventListener('abort',aborted);resolve(value);};
            const aborted=()=>finish(fallback),localTimer=setTimeout(()=>finish(fallback),Math.min(timeout,deadlineMs));signal.addEventListener('abort',aborted,{once:true});
            Promise.resolve(promise).then(finish,()=>finish(fallback));
        });
        try{
        const fetchImpl=(url,options={})=>{
            if(options.method&&options.method!=='GET')throw Error('PRIVATE_WEB_METHOD_DENIED');
            return fetchPublic(url,{...options,method:'GET',headers:{accept:'application/json,text/html,text/plain,application/pdf','user-agent':UA},signal:AbortSignal.any([signal,AbortSignal.timeout(5000),...(options.signal?[options.signal]:[])])});
        };
        const settled=Array(searchers.length).fill(null);
        await within(Promise.allSettled(searchers.map(async(search,index)=>{settled[index]=await search({query,maxResults:4,...(input.preferCreators?{preferCreators:true}:{})},{fetchImpl})})),null,6000);
        const candidates=new Map();
        // Round-robin the providers: completion speed must not rank evidence.
        for(let rank=0;rank<12;rank++){for(const item of settled){const r=item?.results?.[rank];if(!r)continue;const url=httpsUrl(r?.url);if(!url||!r.title||candidates.has(url))continue;candidates.set(url,{url,title:String(r.title).slice(0,300),snippet:String(r.snippet??r.content??'').slice(0,2000),provider:String(r.provider??'public-web').slice(0,40)});}}
        // Rank only these already public bytes before spending the bounded
        // extraction slots. Provider diversity remains the stable tie-break;
        // JEV still judges evidence relevance and credibility inside Phala.
        const terms=[...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g)??[])].filter(t=>!['the','and','for','with','how','what'].includes(t));
        const coverage=row=>terms.reduce((n,t)=>n+Number((row.title+' '+row.snippet).toLowerCase().includes(t)),0);
        const mixed=[...candidates.values()].sort((a,b)=>coverage(b)-coverage(a)||(input.preferCreators?Number(b.provider==='nibgate-hub')-Number(a.provider==='nibgate-hub'):0));
        const selected=mixed.slice(0,input.preferCreators?12:Math.max(6,searchers.length));
        if(!selected.length)throw Error('PRIVATE_WEB_UNAVAILABLE');
        let extracted=[];const completedPages=new Map();
        if(!signal.aborted){extracted=(await within(Promise.resolve().then(()=>extract({urls:selected.slice(0,input.preferCreators?6:4).map(r=>r.url),maxChars:12000,timeoutMs:6000},{fetchImpl,assessPage:assessPublicCreatorPage,onDocument:doc=>completedPages.set(doc.url,doc)})),{documents:[]})).documents??[]}
        const docs=selected.map(r=>{const doc=completedPages.get(r.url)??extracted.find(d=>d.url===r.url&&typeof d.text==='string'&&d.text.trim());const text=String(doc?.text??r.snippet).slice(0,12000);return {id:randomUUID(),url:r.url,title:r.title,text,provider:'public-web',searchProvider:r.provider,evidenceKind:doc?'page-text':'search-excerpt',...(doc?.creatorAssessment?{creatorAssessment:doc.creatorAssessment}:{}),trust:null}}).filter(d=>d.text.trim().length>=30);
        if(!docs.length)throw Error('PRIVATE_WEB_UNAVAILABLE');
        return input.preferCreators?docs.sort((a,b)=>Number(b.creatorAssessment?.eligible===true)-Number(a.creatorAssessment?.eligible===true)):docs;
        }finally{clearTimeout(timer);controller.abort()}
    };
}
