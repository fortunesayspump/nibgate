import test from 'node:test';
import assert from 'node:assert/strict';
import {centralSitemapIndex,mainnetTenant} from '../frontend/src/lib/central-sitemap.ts';
import {creatorSitemap,sitemapPosts} from '../subblogs/frontend/src/lib/creator-sitemap.ts';
const post={status:'published',publicAccess:true,type:'article',slug:'hello',updatedAt:'2026-11-16T00:00:00Z'};
test('central index includes leaf Hub/docs/real mainnet creators only, once',()=>{
 const xml=centralSitemapIndex({success:true,sites:['writer.nibgate.xyz','writer.nibgate.xyz','writer.testnet.nibgate.xyz','www.nibgate.xyz','private-drnib.nibgate.xyz','evil.nibgate.xyz.evil.com','testnet-api.nibgate.xyz']});
 assert.equal((xml.match(/<sitemap>/g)||[]).length,3);assert.match(xml,/<sitemapindex /);assert.match(xml,/https:\/\/nibgate.xyz\/sitemap.xml/);assert.match(xml,/https:\/\/docs.nibgate.xyz\/sitemap.xml/);assert.doesNotMatch(xml,/testnet|private-drnib|all-content/);
});
test('invalid feed fails; valid empty feed still includes platform sitemaps',()=>{
 for(const data of [null,{}, {success:false,sites:[]},{success:true,sites:'x'}]) assert.throws(()=>centralSitemapIndex(data));
 assert.equal((centralSitemapIndex({success:true,sites:[]}).match(/<sitemap>/g)||[]).length,2);
 assert.equal(mainnetTenant('writer.nibgate.xyz:443'),null);
 assert.throws(()=>centralSitemapIndex({success:true,sites:Array.from({length:50000},(_,i)=>`site-${i}.nibgate.xyz`)}),/sharding/);
});
test('public paid/free teasers included, private/draft/unknown excluded; dates safe',()=>{
 const xml=creatorSitemap('https://writer.nibgate.xyz',[post,{...post,slug:'paid',price:'10'},{...post,slug:'private',publicAccess:false},{...post,slug:'draft',status:'draft'},{...post,slug:'unknown',publicAccess:undefined},{...post,slug:'../secret'},{...post,slug:'invalid-date',updatedAt:'invalid'}]);
 assert.match(xml,/\/writing\/hello/);assert.match(xml,/\/writing\/paid/);assert.match(xml,/\/writing\/invalid-date<\/loc><\/url>/);assert.doesNotMatch(xml,/private|draft|unknown|secret|NaN/);assert.match(xml,/\/docs<\/loc>/);
});
test('pagination complete including exact full page and empty site',async()=>{
 let calls=0;
 assert.equal((await sitemapPosts(async page=>{calls++;return {success:true,total:50,page,posts:Array.from({length:50},(_,i)=>({...post,slug:`post-${i}`}))}})).length,50);assert.equal(calls,1);
 assert.deepEqual(await sitemapPosts(async page=>({success:true,total:0,page,posts:[]})),[]);
 assert.equal((await sitemapPosts(async page=>({success:true,total:51,page,posts:page===1?Array.from({length:50},(_,i)=>({...post,slug:`post-${i}`})):[post]}))).length,51);
});
test('partial or changing pagination and errors fail closed',async()=>{
 for(const data of [{success:false},{success:true,total:100,page:1,posts:[post]},{success:true,total:1,page:2,posts:[post]}]) await assert.rejects(()=>sitemapPosts(async()=>data));
 await assert.rejects(()=>sitemapPosts(async page=>({success:true,total:page===1?51:52,page,posts:page===1?Array.from({length:50},(_,i)=>({...post,slug:`post-${i}`})):[post,post]})));
});

test('repeated identities and over-budget leaf feeds fail before unbounded work',async()=>{
 await assert.rejects(()=>sitemapPosts(async page=>({success:true,total:50,page,posts:Array(50).fill(post)})),/Duplicate/);
 await assert.rejects(()=>sitemapPosts(async page=>({success:true,total:2001,page,posts:[]})),/sharding/);
});
