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
  return {id:entry.id,title:entry.title,description:entry.summary,url:entry.url,manifestUrl:`${origin}/api/nibgate/manifest?path=${encodeURIComponent(entry.path)}`,currency:'USDC',price,contentType:'article'};
}

export async function currentPublicArticles(site,{fetcher=fetch,now=Date.now}={}) {
  const origin=creatorOrigin(site);if(!origin)throw fail();
  const signal=AbortSignal.timeout(10000);
  const initial=await readManifest(origin,fetcher,signal);
  const final=await readManifest(origin,fetcher,signal);const receivedAt=now();
  const latest=new Map();
  for(const entry of final){const item=project(entry,origin);if(!item)continue;if(latest.has(item.id))throw fail();latest.set(item.id,item)}
  const seen=new Set(),result=[];
  for(const entry of initial){const item=project(entry,origin);if(!item)continue;if(seen.has(item.id))throw fail();seen.add(item.id);const fresh=latest.get(item.id);if(fresh&&JSON.stringify(item)===JSON.stringify(fresh))result.push(item);if(result.length===20)break}
  if(signal.aborted || now()-receivedAt>2000)throw fail();
  return {content:result,observedAt:receivedAt,scope:'current-public-creator-articles',perSiteLimit:20,snapshot:'two-public-manifests',historyAvailable:false};
}

// This is a bounded sample, not a popularity ranking or a complete catalog.
// Site records are selected and rechecked by the server, never supplied by a caller.
export async function getPublicDiscovery(db,args={},options={}) {
  const {network='testnet',fetcher=fetch,now=Date.now}=options;
  if(network!=='mainnet') throw fail();
  const q=String(args.q||'').trim().toLowerCase(),type=String(args.type||'').trim().toLowerCase(),sort=String(args.sort||'site-order').trim().toLowerCase();
  const limit=Math.min(Math.max(Number.parseInt(args.limit||'100',10)||100,1),500),skip=Math.max(Number.parseInt(args.skip||'0',10)||0,0);
  if(q.length>200||skip>10000||!['','all','article','music','video','image','document'].includes(type)||sort!=='site-order')throw Object.assign(new Error('Unsupported discovery filters'),{status:400});
  const eligible={deletedAt:null,isVerified:true,verificationStatus:'verified',domain:{endsWith:'.nibgate.xyz',mode:'insensitive'},NOT:[{domain:{endsWith:'.testnet.nibgate.xyz',mode:'insensitive'}},{domain:{startsWith:'testnet-',mode:'insensitive'}}]};
  const select={id:true,domain:true,name:true,deletedAt:true,isVerified:true,verificationStatus:true};
  const candidates=await db.website.findMany({where:eligible,select,orderBy:{domain:'asc'},take:21});
  const sources=candidates.slice(0,20).filter(creatorOrigin);
  const started=now();
  const snapshots=await Promise.all(sources.map(async site=>({site,...await currentPublicArticles(site,{fetcher,now})})));
  if(now()-started>10000 || snapshots.some(s=>now()-s.observedAt>2000))throw fail();
  const fresh=await db.website.findMany({where:{...eligible,id:{in:sources.map(s=>s.id)}},select});
  const current=new Map(fresh.map(s=>[s.id,s]));
  if(snapshots.some(s=>now()-s.observedAt>2000))throw fail();
  const content=snapshots.flatMap(s=>{const site=current.get(s.site.id);if(!site||site.domain!==s.site.domain||!creatorOrigin(site))return [];return s.content.map(item=>({...item,identityScope:'creator-publication',websiteName:site.name||site.domain,websiteDomain:site.domain,imageUrl:'',tags:'',tagList:[],createdAt:null,views:null,unlocks:null,revenue:null,ratings:null,reputationScore:null,reputationStars:null}))}).filter(item=>(!type||type==='all'||type===item.contentType)&&(!q||[item.title,item.description,item.websiteName,item.websiteDomain].some(x=>x.toLowerCase().includes(q))));
  return {success:true,scope:'current-public-creator-articles',sort:'site-order',historyStatus:'unavailable-no-event-visibility-proof',content:content.slice(skip,skip+limit),total:content.length,limit,skip,coverage:{siteLimit:20,perSiteLimit:20,sitesTruncated:candidates.length>20,checkedSites:sources.length,source:'public-creator-manifest',snapshot:'bounded-distributed'}};
}
