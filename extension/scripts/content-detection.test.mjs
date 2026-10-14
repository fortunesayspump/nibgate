import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './content-test-harness.mjs';
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
