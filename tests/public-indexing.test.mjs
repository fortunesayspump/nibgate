import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { creatorPostRobots } from '../subblogs/frontend/src/lib/post-robots.ts';
const require = createRequire(import.meta.url);
const { publicPost } = require('../subblogs/backend/src/controllers/public-post.js');

test('mainnet published public free and paid teasers are indexable, all other post states are not', () => {
  for (const price of [null, '0', '5']) assert.deepEqual(creatorPostRobots({ status: 'published', publicAccess: true, type: 'article', price }, 'writing', 'mainnet'), { index: true, follow: true });
  for (const post of [undefined, {}, {status:'draft', publicAccess:true, type:'article'}, {status:'published', publicAccess:false, type:'article'}, {status:'published', type:'article'}, {status:'published', publicAccess:true, type:'document'}]) assert.deepEqual(creatorPostRobots(post, 'writing', 'mainnet'), {index:false,follow:false});
  const post={status:'published',publicAccess:true,type:'article'};
  assert.deepEqual(creatorPostRobots(post,'writing','testnet'),{index:false,follow:false});
  assert.deepEqual(creatorPostRobots(post,'writing'),{index:false,follow:false});
});

test('unchanged backend redaction preserves paid and invite-only body/key/media containment', () => {
  const original={status:'published',type:'article',title:'test title',excerpt:'public teaser',bodyMarkdown:'protected test body',body:'protected test body',contentKey:'test key',bodyStorageRef:'test storage',media:'test media',videoUrl:'test video',documentUrl:'test document',whitelist:['test wallet']};
  for(const policy of [{publicAccess:true,price:'5'},{publicAccess:false,price:null}]) {
    const output=publicPost({...original,...policy});
    for(const field of ['bodyMarkdown','body','contentKey','bodyStorageRef','media','videoUrl','documentUrl','whitelist']) assert.equal(Object.hasOwn(output,field),false,field);
    assert.equal(output.excerpt,'public teaser');
    assert.equal(creatorPostRobots(output,'writing','mainnet').index,policy.publicAccess);
  }
});

test('post metadata is wired fail-closed and testnet worker remains blanket noindex', () => {
  const page=readFileSync(new URL('../subblogs/frontend/src/app/[type]/[slug]/page.tsx',import.meta.url),'utf8');
  assert.match(page,/robots: creatorPostRobots\(post, type, process.env.NEXT_PUBLIC_NIBGATE_NETWORK/);
  assert.match(page,/if \(!post\) return \{ robots: creatorPostRobots\(undefined, type\)/);
  assert.match(page,/catch \{ return \{ robots: creatorPostRobots\(undefined, type\)/);
  const worker=readFileSync(new URL('../cloudflare/creator/testnet/worker.mjs',import.meta.url),'utf8');
  assert.match(worker,/out.headers.set\('x-robots-tag','noindex, nofollow'\)/);
  assert.equal(worker.includes('const publicResponse'),false);
});

test('actual homepage thumbnail helper handles redacted paid media without accessing protected content', () => {
  const page=readFileSync(new URL('../subblogs/frontend/src/app/page.tsx',import.meta.url),'utf8');
  const start=page.indexOf('function extractFirstImage(');
  const end=page.indexOf('\nfunction ThumbnailCard',start);
  const helper=page.slice(start,end).replace(/^function extractFirstImage[^\n]+/, 'function extractFirstImage(md, coverUrl, media) {');
  const extract=new Function(`${helper}; return extractFirstImage;`)();
  const teaser=publicPost({status:'published',publicAccess:true,price:'1.00',type:'video',slug:'how-a-pencil-sketch-becomes-a-shader',coverUrl:null,bodyMarkdown:'protected fixture',media:'protected fixture'});
  assert.equal(extract(teaser.bodyMarkdown,teaser.coverUrl,teaser.media),null);
  assert.equal(extract(undefined,'https://example.com/public-cover.png'), 'https://example.com/public-cover.png');
  assert.equal(extract('![public](https://example.com/image.png)',null,null),'https://example.com/image.png');
  assert.equal(extract(null,null,'not json'),null);
});
