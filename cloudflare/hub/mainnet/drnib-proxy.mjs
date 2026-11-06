const destinations = new Map([
  ['/drnib-private-funding-api','https://nibgate-drnib-funding-mainnet-production.up.railway.app'],
  ['/drnib-private-api','https://drnib.nibgate.xyz'],
  ['/drnib-api','https://drnib.nibgate.xyz'],
]);
export async function drnibProxy(request, fetcher=fetch) {
  const url = new URL(request.url);
  const prefix = [...destinations.keys()].find(p => url.pathname===p || url.pathname.startsWith(p+'/'));
  if (!prefix) return null;
  if (!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, POST, PUT, PATCH, DELETE','cache-control':'no-store'}});
  if (url.pathname.includes('%') || url.pathname.includes('\\') || url.pathname.includes('//')) return new Response('Invalid path',{status:400,headers:{'cache-control':'no-store'}});
  const origin=request.headers.get('origin');
  if (!['GET','HEAD'].includes(request.method) && origin && origin!=='https://nibgate.xyz') return new Response('Forbidden',{status:403,headers:{'cache-control':'no-store'}});
  const target=new URL(url.pathname.slice(prefix.length)||'/',destinations.get(prefix));target.search=url.search;
  const headers=new Headers(request.headers);
  for(const name of ['host','cf-connecting-ip','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip','x-site-subdomain'])headers.delete(name);
  const opts={method:request.method,headers,redirect:'manual',...(request.method==='GET'||request.method==='HEAD'?{}:{body:request.body,duplex:'half'})};
  try { const response=await fetcher(new Request(target,opts));const out=new Response(response.body,response);out.headers.set('cache-control','private, no-store, no-transform');return out; }
  catch {return new Response('Service temporarily unavailable',{status:503,headers:{'cache-control':'private, no-store'}});}
}
