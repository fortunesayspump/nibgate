import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './content-test-harness.mjs';
const source = readFileSync(fileURLToPath(new URL('../src/content/tip-card.ts', import.meta.url)), 'utf8');
const prose = (n) => Array.from({ length: n }, (_, i) => `evidence${i}`).join(' ');
const article = (words = 360) => `<main><article><h1>A practical tutorial</h1><p>${prose(words)}</p><p>Follow the steps carefully and check the results before publishing your work.</p></article></main>`;


for (const [name, body, head] of [
  ['short creator tutorial', article(130), '<meta name="author" content="A creator">'],
  ['company blog with organization metadata and hydration payload', `<header><nav><a>Pricing</a><a>Careers</a></nav></header>${article()}<footer>Example Company Inc</footer>`, `<meta property="og:type" content="article"><script type="application/ld+json">{"@type":"Organization"}</script><script>${prose(6000)}</script>`],
  ['documentation with heading permalinks', `<main><h1>A practical tutorial</h1>${Array.from({ length: 6 }, (_, i) => `<h2><a href="#step-${i}">Step ${i}</a></h2><p>${prose(65)}</p>`).join('')}</main>`, ''],
  ['photo-only published work', '<main><div class="h-entry"><h1>A practical tutorial</h1><figure><img src="/photo.jpg" width="1200" height="800"><figcaption>Morning light</figcaption></figure></div></main>', '<meta name="author" content="A photographer">'],
  ['short audio post', '<main class="h-entry"><h1>A practical tutorial</h1><audio controls src="/recording.mp3"></audio><p>My new recording.</p></main>', '<meta name="author" content="A musician">'],
  ['short video post', '<main class="h-entry"><h1>A practical tutorial</h1><iframe src="https://www.youtube-nocookie.com/embed/example"></iframe><p>My latest film.</p></main>', '<meta name="author" content="A filmmaker">'],
  ['Next.js app-root article', `<div id="__next">${article()}</div>`, ''],
  ['Ghost taxonomy classes on a post', `<main><article class="post tag-personal"><h1>A practical tutorial</h1><p>${prose(400)}</p></article></main>`, ''],
  ['Blogger line-break post without paragraphs', `<div class="widget Blog" id="Blog1"><main><div class="post hentry"><h1>A practical tutorial</h1><div class="post-body">${prose(350)}<br>${prose(50)}</div></div></main></div>`, '<meta property="og:type" content="article">'],
  ['short dated creator post', `<main><article><h1>A practical tutorial</h1><time datetime="2026-10-14">Today</time><a rel="author">A creator</a><p>${prose(55)}</p></article></main>`, ''],
  ['Chinese post without spaces', `<main><article><h1>A practical tutorial</h1><p>${'摄影是观察世界的方式。每天记录光线和生活的变化。'.repeat(45)}</p></article></main>`, ''],
  ['integrated individual photography story', `<main class="gallery-page"><section class="gallery-story" aria-labelledby="gallery-title"><h2 id="gallery-title">Wedding of Sara and Mark</h2><p>A quiet documentary story of the day and its people.</p><p>Portraits, details, and candid moments in sequence.</p></section><div class="gallery-masonry" aria-label="Sara and Mark wedding photographs">${Array.from({length:8},(_,i)=>`<img src="/photo-${i}.jpg" width="1200" alt="Sara and Mark wedding photograph ${i+1}">`).join('')}</div></main>`, '<script data-nibgate-site="site-123" data-nibgate-api="https://api.nibgate.xyz"></script>'],
]) {
  test(`detects ${name}`, async () => {
    const f = fixture(body, head);
    try { await f.tick(0); assert.ok(f.host(), f.window.document.documentElement.getAttribute('data-nibgate-reason')); }
    finally { f.close(); }
  });
}

for (const [name, body, head] of [
  ['feed previews', `<main>${Array.from({ length: 5 }, (_, i) => `<article><h2><a href="/post-${i}">Interesting story ${i}</a></h2><p>${prose(65)}</p><a href="/post-${i}">Read more</a></article>`).join('')}</main>`, ''],
  ['company landing page', `<header><nav><a>Pricing</a><a>Services</a></nav></header><main><h1>Our company</h1><p>${prose(180)}</p></main><footer>Example Inc</footer>`, '<script type="application/ld+json">{"@type":"Organization"}</script>'],
  ['control-heavy app', `<main><h1>Dashboard</h1><p>${prose(40)}</p>${'<input><button>Save</button>'.repeat(20)}</main>`, ''],
  ['marketing hero image without a published creator work', '<main><h1>Our service</h1><img width="1200" src="/hero.jpg"><p>Start your trial today.</p></main>', ''],
  ['product gallery', '<main class="h-entry"><h1>A practical tutorial</h1><figure><img width="1200" src="/product.jpg"></figure></main>', '<meta name="author" content="Shop owner"><script type="application/ld+json">{"@type":"Product"}</script>'],
  ['multi-project photography index', `<main><h1>Wedding galleries</h1><section class="gallery-masonry" aria-label="Photo gallery">${Array.from({length:8},(_,i)=>`<a href="/wedding-${i}"><img src="/cover-${i}.jpg" width="1200" alt="Wedding project ${i+1}"></a>`).join('')}</section><section class="gallery-story"><p>Explore recent celebrations.</p><p>Choose a gallery to continue.</p></section></main>`, '<meta name="author" content="A photographer">'],
]) {
  test(`does not show a creator button on ${name}`, async () => {
    const f = fixture(body, head);
    try { await f.tick(11000); assert.equal(f.host(), null); }
    finally { f.close(); }
  });
}

test('hydrated content gets one floating control, one tip request, and stays dismissed until navigation', async () => {
  const f = fixture('<main><h1>Loading</h1></main>');
  try {
    await f.tick(0);
    assert.equal(f.host(), null);
    f.window.document.body.innerHTML = article();
    await f.tick(1100);
    const host = f.host();
    assert.ok(host);
    assert.equal(host.parentElement, f.window.document.documentElement);
    assert.match(host.shadowRoot.querySelector('style').textContent, /position:fixed !important/);
    host.shadowRoot.querySelector('[data-open-tip]').click();
    await f.tick(1600);
    assert.equal(f.messages.filter((m) => m.type === 'TIP_OPEN').length, 1);
    host.shadowRoot.querySelector('[data-dismiss-tip]').click();
    const inline = f.window.document.querySelector('[data-nibgate-widget="inline"]');
    assert.ok(inline, 'inline reminder survives dismissal');
    inline.shadowRoot.querySelector('[data-open-tip]').click();
    await f.tick(1600);
    assert.equal(f.messages.filter((m) => m.type === 'TIP_OPEN').length, 2);
    assert.match(inline.shadowRoot.textContent, /Tip the creator/);
    f.window.document.body.appendChild(f.window.document.createElement('p'));
    await f.tick(11000);
    assert.equal(f.host(), null);
    f.reinject();
    await f.tick(0);
    assert.equal(f.host(), null, 'reinjection must respect dismissal');
    f.window.history.pushState({}, '', '/another-tutorial');
    f.window.document.body.innerHTML = article();
    await f.tick(2100);
    assert.ok(f.host(), 'SPA navigation should reassess the new page');
    assert.equal(f.window.document.querySelectorAll('[data-nibgate-widget]').length, 2);
  } finally { f.close(); }
});

test('WordPress sidebar layout class on body does not suppress an article', async () => {
  const f = fixture(article());
  f.window.document.body.className = 'single-post right-sidebar';
  try { await f.tick(0); assert.ok(f.host()); }
  finally { f.close(); }
});

test('late creator metadata triggers reassessment without changing article text', async () => {
  const f = fixture(`<main><article><h1>A practical tutorial</h1><time datetime="2026-10-14">Today</time><p>${prose(55)}</p></article></main>`);
  try {
    await f.tick(0);
    assert.equal(f.host(), null);
    const author = f.window.document.createElement('meta');
    author.name = 'author'; author.content = 'A creator';
    f.window.document.head.appendChild(author);
    await f.tick(1100);
    assert.ok(f.host());
  } finally { f.close(); }
});

for(const url of ['https://nibgate.xyz/explore','https://testnet.nibgate.xyz/explore','https://docs.nibgate.xyz/guide','http://localhost:3001/explore','http://127.0.0.1:3001/dr-nib/research','http://[::1]:3001/explore']){
 test(`automatic controls and assessment stay off first-party app ${url}`,async()=>{
  const f=fixture(article(),'',url);try{await f.tick(11000);assert.equal(f.host(),null);assert.equal(f.messages.length,0)}finally{f.close()}
 });
}
test('a similarly named external creator is not treated as Nibgate',async()=>{
 const f=fixture(article(),'','https://nibgate.xyz.creator.example/tutorial');try{await f.tick(0);assert.ok(f.host())}finally{f.close()}
});

for (const url of [
  'https://x.com/home', 'https://twitter.com/search?q=nibgate',
  'https://www.youtube.com/', 'https://www.youtube.com/feed/subscriptions', 'https://www.youtube.com/@creator/videos',
  'https://discord.com/channels/123/456', 'https://discord.com/settings/account',
  'https://tweetdeck.twitter.com/', 'https://music.youtube.com/watch?v=AbCdEf12345',
  'https://studio.youtube.com/channel/abc', 'https://canary.discord.com/channels/123/456',
  'https://ptb.discord.com/channels/123/456',
  'https://www.instagram.com/creator/p/example/',
  'https://www.tiktok.com/@creator/video/123456789',
  'https://www.reddit.com/r/creators/comments/example/post/',
  'https://www.linkedin.com/posts/creator_example/',
  'https://www.threads.net/@creator/post/example',
  'https://bsky.app/profile/creator.example/post/example',
  'https://www.twitch.tv/creator/videos/123456789',
]) {
  test(`social app/listing route stays off: ${url}`, async () => {
    const f = fixture(article(), '<meta name="author" content="A creator">', url);
    try { await f.tick(11000); assert.equal(f.host(), null); assert.equal(f.messages.length, 0); }
    finally { f.close(); }
  });
}

for (const url of [
  'https://x.com/creator/status/1234567890',
  'https://mobile.twitter.com/creator/status/1234567890',
  'https://www.youtube.com/watch?v=AbCdEf12345',
  'https://www.youtube.com/shorts/AbCdEf12345',
]) {
  test(`social-media content route stays off: ${url}`, async () => {
    const f = fixture(article(), '<meta name="author" content="A creator">', url);
    try { await f.tick(11000); assert.equal(f.host(), null); assert.equal(f.messages.length, 0); }
    finally { f.close(); }
  });
}

for (const url of [
  'https://creator.example/', 'https://creator.example/blog', 'https://creator.example/posts/',
  'https://creator.example/archive', 'https://creator.example/search?q=post', 'https://creator.example/about',
]) {
  test(`independent-site non-post route stays off: ${url}`, async () => {
    const f = fixture(article(), '<meta name="author" content="A creator">', url);
    try { await f.tick(11000); assert.equal(f.host(), null); assert.equal(f.messages.length, 0); }
    finally { f.close(); }
  });
}

test('SPA navigation removes an independent-site control synchronously on a landing route', async () => {
  const f = fixture(article(), '<meta name="author" content="A creator">', 'https://creator.example/tutorial');
  try {
    await f.tick(0);
    assert.ok(f.host());
    f.window.document.body.innerHTML = '<main><h1>Creator home</h1><p>Browse the latest independent posts.</p></main>';
    f.window.history.pushState({}, '', '/home');
    assert.equal(f.host(), null);
    assert.equal(f.window.document.documentElement.getAttribute('data-nibgate-kind'), null);
    await f.tick(1100);
    assert.equal(f.host(), null);
  } finally { f.close(); }
});

test('unknown-page fallback requires high-confidence creator-content classification', () => {
  assert.match(source, /probability >= 0\.8/);
  assert.match(source, /await jevApprovesPage\(map\)/);
  assert.match(source, /hasIndependentPostEvidence\(true\)/);
});

test('JEV is the final judge for an otherwise eligible independent article', async () => {
  const f = fixture(article(), '<meta name="author" content="A creator">', 'https://creator.example/tutorial', 0.79);
  try {
    await f.tick(0);
    assert.equal(f.host(), null);
    assert.equal(f.messages.filter((message) => message.type === 'JEV_CLASSIFY').length, 1);
    assert.equal(f.messages.some((message) => message.type === 'ASSESS'), false);
  } finally { f.close(); }
});

test('JEV receives declared gallery evidence without waiting for image loads', async () => {
  const gallery = `<main class="gallery-page"><section class="gallery-story" aria-labelledby="gallery-title"><h2 id="gallery-title">Wedding of Sara and Mark</h2><p>A quiet documentary story of the day and its people.</p><p>Portraits, details, and candid moments in sequence.</p></section><div class="gallery-masonry" aria-label="Sara and Mark wedding photographs">${Array.from({length:8},(_,i)=>`<img src="/lazy-${i}.jpg" alt="Sara and Mark wedding photograph ${i+1}">`).join('')}</div></main>`;
  const f = fixture(gallery, '<script data-nibgate-site="site-123" data-nibgate-api="https://api.nibgate.xyz"></script>');
  await f.tick(0);
  const request = f.messages.find((message) => message.type === 'JEV_CLASSIFY');
  assert.ok(request);
  assert.match(request.state, /Creator integration: yes/);
  assert.match(request.state, /Coherent gallery story: yes/);
  assert.match(request.state, /Content images declared in DOM: 8/);
  assert.match(request.instructions, /photography, video, or audio work can be the content/i);
  f.close();
});

test('deterministic content classification cannot bypass strict independent-post evidence', () => {
  assert.match(source, /map\.kind === 'content' && eligible && hasIndependentPostEvidence\(true\)/);
});

test('high fallback confidence alone cannot leak onto a prose-heavy listing', async () => {
  const body = `<main><h1>All posts</h1><p>${prose(220)}</p><p>${prose(220)}</p>${Array.from({length:6},(_,i)=>`<section><h2><a href="/post-${i}">Post ${i}</a></h2></section>`).join('')}</main>`;
  const f = fixture(body, '', 'https://creator.example/newsletter');
  try { await f.tick(11000); assert.equal(f.host(), null); }
  finally { f.close(); }
});
