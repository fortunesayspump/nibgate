import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatch } from '../policy-creator-writing.mjs';

for (const network of ['mainnet','testnet']) {
  test(`${network} creator manifest stays tenant-bound`, async () => {
    const root=new URL(`../cloudflare/creator/${network}/`,import.meta.url);
    const {readerProxy}=await import(new URL('reader-proxy.mjs',root));
    const source=await readFile(new URL('worker.mjs',root),'utf8');
    const hosts=JSON.parse(await readFile(new URL('../cloudflare/creator/mainnet/hosts.json',import.meta.url)));
    const host=network==='mainnet'?'goldenhour.nibgate.xyz':'jeff.testnet.nibgate.xyz';
    const code=source.replace(/^import .*;\n/gm,'').replace(/^export \{.*\n/gm,'').replace('export class RenderObject','class RenderObject').replace('export default','const worker =');
    let sent=0;
    const upstream=async(url,opts)=>{sent++;assert.equal(new URL(url).hostname,'api-subblogs.nibgate.xyz');assert.equal(opts.headers.get('x-site-subdomain'),'goldenhour');return Response.json({content:[{title:'PUBLIC_PAID'}]});};
    const worker=new Function('DurableObject','hosts','app','adminProxy','readerProxy',`${code}\nreturn worker;`)(class {},hosts,{},()=>assert.fail('unexpected admin'),(req,cfg)=>readerProxy(req,cfg,upstream));
    const response=await worker.fetch(new Request(`https://${host}/api/nibgate/manifest`,{headers:{'x-site-subdomain':'other'}}),{});
    assert.equal(response.status,network==='mainnet'?200:404);
    assert.equal(sent,network==='mainnet'?1:0);
    if(network==='mainnet'){assert.match(await response.text(),/PUBLIC_PAID/);assert.match(response.headers.get('cache-control'),/no-store/);}
    else for(const path of ['/nibgate.json','/.well-known/nibgate.json']) assert.equal((await worker.fetch(new Request(`https://${host}${path}`),{})).status,404);
  });
}
test('public site manifests reach the mainnet renderer without cache',async()=>{
  for(const path of ['/nibgate.json','/.well-known/nibgate.json']) {
    const response=await dispatch(new Request('https://goldenhour.nibgate.xyz'+path),'creator',{fetch:async()=>Response.json({content:[]})},{},{});
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  }
});
