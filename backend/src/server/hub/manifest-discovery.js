// Consume the existing public creator-host manifest.
// No tenant headers, credentials, arbitrary hosts, redirects, or historical data.
const reserved = new Set('www api api-subblogs testnet testnet-api testnet-api-subblogs drnib private-drnib admin app blog dev staging test mail smtp pop imap webmail email help support docs status forum auth login signin register signup dashboard hub explore discover cdn static assets media files root home index main console manage management operator pay payment payments checkout webhook webhooks hook hooks ssl dns ns1 ns2 mx'.split(' '));
const fail = () => Object.assign(new Error('Public creator manifest unavailable'), {status:503});

export function creatorOrigin(site) {
  if (!site || site.deletedAt !== null || site.isVerified !== true || site.verificationStatus !== 'verified') return null;
  const domain = String(site.domain || '').toLowerCase();
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/.exec(domain);
  if (!match || reserved.has(match[1]) || match[1].startsWith('testnet-')) return null;
  return `https://${domain}`;
}

async function readManifest(origin, fetcher, signal) {
  let response;
  try { response = await fetcher(`${origin}/api/nibgate/manifest`, {method:'GET',redirect:'error',cache:'no-store',signal,headers:{accept:'application/json'}}); } catch { throw fail(); }
  if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json') || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control')||'')) throw fail();
  const reader = response.body?.getReader(); if (!reader) throw fail();
  let size=0; const chunks=[];
  try { for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>1048576){await reader.cancel();throw fail()} chunks.push(value); } } catch { throw fail(); } finally {reader.releaseLock()}
  let data;try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw fail()}
  if (data?.origin !== origin || !Array.isArray(data.content)) throw fail();
  return data.content;
}

function project(entry, origin) {
  if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length>200 || entry.type !== 'article') return null;
  if (typeof entry.path !== 'string' || !/^\/writing\/[A-Za-z0-9_-]{1,200}$/.test(entry.path) || entry.url !== `${origin}${entry.path}`) return null;
  if (typeof entry.title !== 'string' || typeof entry.summary !== 'string' || entry.currency !== 'USDC') return null;
  // The creator backend treats only null and the literal string '0' as free.
  // Other zero spellings and malformed values cannot be safely labelled free.
  const raw=entry.price;
  const price=raw === null || raw === '0' ? 0 : typeof raw === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(raw) && Number(raw)>0 ? Number(raw) : NaN;
  if (!Number.isFinite(price) || price<0) return null;
  let imageUrl='';
  if (typeof entry.imageUrl === 'string' && entry.imageUrl.length <= 2048) {
    try { const image=new URL(entry.imageUrl, origin); if(image.protocol==='https:' && !image.username && !image.password) imageUrl=image.href; } catch {}
  }
  return {id:entry.id,title:entry.title,description:entry.summary,url:entry.url,manifestUrl:`${origin}/api/nibgate/manifest?path=${encodeURIComponent(entry.path)}`,currency:'USDC',price,contentType:'article',imageUrl};
}

export async function currentPublicArticles(site,{fetcher=fetch,now=Date.now,signal=AbortSignal.timeout(10000)}={}) {
  const origin=creatorOrigin(site);if(!origin)throw fail();
  const initial=await readManifest(origin,fetcher,signal);
  const final=await readManifest(origin,fetcher,signal);const receivedAt=now();
  const latest=new Map();
  for(const entry of final){const item=project(entry,origin);if(!item)continue;if(latest.has(item.id))throw fail();latest.set(item.id,item)}
  const seen=new Set(),result=[];
  for(const entry of initial){const item=project(entry,origin);if(!item)continue;if(seen.has(item.id))throw fail();seen.add(item.id);const fresh=latest.get(item.id);if(fresh&&JSON.stringify(item)===JSON.stringify(fresh))result.push(item)}
  if(signal.aborted || now()-receivedAt>2000)throw fail();
  return {content:result,observedAt:receivedAt,scope:'current-public-creator-articles',perSiteLimit:null,snapshot:'two-public-manifests',historyAvailable:false};
}

// Site records are selected and rechecked by the server, never supplied by a caller.
// Failed or expired sources are reported in coverage; they are not a complete catalog.
export async function getPublicDiscovery(db,args={},options={}) {
  const {network='testnet',fetcher=fetch,now=Date.now}=options;
  if(network!=='mainnet') throw fail();
  const q=String(args.q||'').trim().toLowerCase(),type=String(args.type||'').trim().toLowerCase(),sort=String(args.sort||'site-order').trim().toLowerCase();
  const limit=Math.min(Math.max(Number.parseInt(args.limit||'100',10)||100,1),500),skip=Math.max(Number.parseInt(args.skip||'0',10)||0,0);
  let cursor=null;
  if(args.cursor!==undefined) {
    try {cursor=JSON.parse(String(args.cursor))} catch {throw Object.assign(new Error('Invalid cursor'),{status:400})}
    if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||typeof cursor[1]!=='string'||cursor[0].length>253||!cursor[1]||cursor[1].length>200||skip)throw Object.assign(new Error('Invalid cursor'),{status:400});
  }
  if(q.length>200||skip>10000||!['','all','article','music','video','image','document'].includes(type)||sort!=='site-order')throw Object.assign(new Error('Unsupported discovery filters'),{status:400});
  const eligible={deletedAt:null,isVerified:true,verificationStatus:'verified',domain:{endsWith:'.nibgate.xyz',mode:'insensitive'},NOT:[{domain:{endsWith:'.testnet.nibgate.xyz',mode:'insensitive'}},{domain:{startsWith:'testnet-',mode:'insensitive'}}]};
  const select={id:true,domain:true,name:true,deletedAt:true,isVerified:true,verificationStatus:true};
  const candidates=await db.website.findMany({where:eligible,select,orderBy:{domain:'asc'}});
  const sources=candidates.filter(creatorOrigin);
  const started=now();
  // One slow source must not make every other source stale before the response.
  const results=new Array(sources.length);
  let next=0;
  async function readNext() {
    while(next<sources.length) {
      const index=next++,site=sources[index];
      if(now()-started>8000) {results[index]={status:'rejected'};continue}
      try {results[index]={status:'fulfilled',value:{site,...await currentPublicArticles(site,{fetcher,now,signal:AbortSignal.timeout(1500)})}}}
      catch {results[index]={status:'rejected'}}
    }
  }
  await Promise.all(Array.from({length:Math.min(sources.length,24)},readNext));
  if(now()-started>10000)throw fail();
  let snapshots=results.filter(r=>r.status==='fulfilled').map(r=>r.value).filter(s=>now()-s.observedAt<=2000);
  if(sources.length && !snapshots.length)throw fail();
  const fresh=await db.website.findMany({where:{...eligible,id:{in:sources.map(s=>s.id)}},select});
  const current=new Map(fresh.map(s=>[s.id,s]));
  snapshots=snapshots.filter(s=>now()-s.observedAt<=2000);
  if(sources.length && !snapshots.length)throw fail();
  const content=snapshots.flatMap(s=>{const site=current.get(s.site.id);if(!site||site.domain!==s.site.domain||!creatorOrigin(site))return [];return s.content.map(item=>({...item,identityScope:'creator-publication',websiteName:site.name||site.domain,websiteDomain:site.domain,tags:'',tagList:[],createdAt:null,views:null,unlocks:null,revenue:null,ratings:null,reputationScore:null,reputationStars:null}))}).filter(item=>(!type||type==='all'||type===item.contentType)&&(!q||[item.title,item.description,item.websiteName,item.websiteDomain].some(x=>x.toLowerCase().includes(q))));
  content.sort((a,b)=>a.websiteDomain<b.websiteDomain?-1:a.websiteDomain>b.websiteDomain?1:a.id<b.id?-1:a.id>b.id?1:0);
  const after=cursor?content.filter(item=>item.websiteDomain>cursor[0]||(item.websiteDomain===cursor[0]&&item.id>cursor[1])):content;
  const page=after.slice(skip,skip+limit),last=page.at(-1);
  const nextCursor=last&&after.length>skip+limit?JSON.stringify([last.websiteDomain,last.id]):null;
  return {success:true,scope:'current-public-creator-articles',sort:'site-order',historyStatus:'unavailable-no-event-visibility-proof',pagination:'keyset-v1',nextCursor,content:page,total:content.length,limit,skip,coverage:{siteLimit:null,perSiteLimit:null,sitesTruncated:false,checkedSites:snapshots.length,unavailableSites:sources.length-snapshots.length,source:'public-creator-manifest',snapshot:'bounded-distributed'}};
}
