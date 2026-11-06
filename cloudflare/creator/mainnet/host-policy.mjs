// Reserved-host route exclusions must remain in place for wildcard routing.
const reserved = new Set([
  'www','api','api-subblogs','testnet','testnet-api','testnet-api-subblogs',
  'drnib','private-drnib','admin','app','blog','dev','staging','test','mail',
  'smtp','pop','imap','webmail','email','help','support','docs','status','forum',
  'auth','login','signin','register','signup','dashboard','hub','explore',
  'discover','cdn','static','assets','media','files','root','home','index',
  'main','console','manage','management','operator','pay','payment','payments',
  'checkout','webhook','webhooks','hook','hooks','ssl','dns','ns1','ns2','mx'
]);
export function tenantFromHost(host) {
  const match=/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/.exec(host);
  if(!match || reserved.has(match[1]) || match[1].startsWith('testnet-')) return null;
  return match[1];
}
export async function publicSite(host, fetcher=fetch) {
  const tenant=tenantFromHost(host);
  if (!tenant) return null;
  try {
    const response=await fetcher('https://api-subblogs.nibgate.xyz/blog/public-site-v2',{
      method:'GET',headers:{'x-site-subdomain':tenant,'x-forwarded-host':host,accept:'application/json'},
      redirect:'manual',signal:AbortSignal.timeout(10000),cf:{cacheTtl:0,cacheEverything:false}
    });
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')) return false;
    const payload=await response.json();
    if (payload?.success!==true || payload?.site?.subdomain!==tenant) return null;
    return {name: typeof payload.site.name==='string'?payload.site.name:'', description: typeof payload.site.description==='string'?payload.site.description:'', subdomain:tenant, recipientWallet: typeof payload.site.recipientWallet==='string' && /^0x[0-9a-fA-F]{40}$/.test(payload.site.recipientWallet) ? payload.site.recipientWallet : ''};
  } catch { return null; }
}
