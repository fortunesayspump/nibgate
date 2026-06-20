import express from 'express';

const app = express();
const port = Number(process.env.PORT || 4100);

function page({ title, body, active = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | The Ledger Field</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="nav-row">
      <a class="brand" href="/">
        <span class="brand-mark">LF</span>
        <span>The Ledger Field</span>
      </a>
      <nav>
        <a class="${active === 'notes' ? 'active' : ''}" href="/articles/open-note">Notes</a>
        <a class="${active === 'premium' ? 'active' : ''}" href="/articles/premium-agent-economy">Premium</a>
        <a href="http://localhost:3000">Nibgate</a>
      </nav>
    </div>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

app.use('/styles.css', (_req, res) => {
  res.type('text/css').send(`
    :root {
      --ink: #171514;
      --muted: #706b64;
      --line: #ded7ce;
      --paper: #f7f2e9;
      --panel: #fffdf8;
      --accent: #0a7770;
      --accent-2: #ad6a28;
      --soft: #e8f2ee;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; text-decoration: none; }
    .site-header {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--line);
      background: rgba(247, 242, 233, 0.94);
      backdrop-filter: blur(14px);
    }
    .nav-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      max-width: 1180px;
      min-height: 72px;
      margin: 0 auto;
      padding: 0 28px;
    }
    .brand, nav { display: flex; align-items: center; gap: 12px; }
    .brand { font-weight: 900; }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 7px;
      color: #fff;
      background: var(--ink);
      font-size: 13px;
      letter-spacing: 0;
    }
    nav { flex-wrap: wrap; justify-content: flex-end; }
    nav a {
      padding: 8px 10px;
      border-radius: 6px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
    }
    nav a.active, nav a:hover { color: var(--ink); background: #ece5dc; }
    main { max-width: 1180px; margin: 0 auto; padding: 46px 28px 72px; }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
      gap: 28px;
      align-items: stretch;
      padding-bottom: 26px;
      border-bottom: 1px solid var(--line);
    }
    .hero-copy {
      min-height: 460px;
      padding: 30px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .hero h1 {
      max-width: 760px;
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 72px;
      line-height: 0.98;
      letter-spacing: 0;
    }
    .lede {
      max-width: 720px;
      color: var(--muted);
      font-size: 20px;
      line-height: 1.6;
    }
    .issue-panel {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 22px;
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #171514;
      color: #fffaf1;
    }
    .issue-panel p { color: #d7cfc2; }
    .issue-panel strong {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 42px;
      line-height: 1.05;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 15px;
      border-radius: 7px;
      color: #fff;
      background: var(--accent);
      font-weight: 900;
    }
    .button:hover { background: #075e59; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 26px;
    }
    .post-card {
      min-height: 260px;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .post-card h2 {
      margin: 36px 0 10px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 30px;
      line-height: 1.08;
      letter-spacing: 0;
    }
    .post-card p, .article p, .issue-panel p {
      font-size: 17px;
      line-height: 1.65;
    }
    .post-card p { color: var(--muted); }
    .tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag {
      display: inline-flex;
      padding: 6px 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .tag.paid { color: #6a3f16; background: #f5dec3; border-color: #e1bd91; }
    .article-wrap {
      display: grid;
      grid-template-columns: minmax(0, 760px) minmax(260px, 340px);
      gap: 34px;
      align-items: start;
    }
    .article h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 64px;
      line-height: 1;
      letter-spacing: 0;
    }
    .article-meta {
      margin: 16px 0 30px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
    }
    .article p {
      color: #3e3a35;
      font-size: 20px;
      line-height: 1.78;
    }
    .aside {
      position: sticky;
      top: 96px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .aside h2 { margin: 0 0 10px; font-size: 18px; }
    .aside p { margin: 0; color: var(--muted); line-height: 1.55; }
    @media (max-width: 860px) {
      .nav-row { align-items: flex-start; flex-direction: column; padding: 16px 18px; }
      main { padding: 30px 18px 52px; }
      .hero, .grid, .article-wrap { grid-template-columns: 1fr; }
      .hero-copy { min-height: auto; padding: 22px; }
      .hero h1, .article h1 { font-size: 42px; }
      .issue-panel strong { font-size: 32px; }
      .aside { position: static; }
    }
  `);
});

app.get('/', (_req, res) => {
  res.send(page({
    title: 'Home',
    body: `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Independent technology publication</p>
          <h1>Notes on software, markets, and the agent economy.</h1>
          <p class="lede">A polished demo publication for testing Nibgate against a real-looking WordPress or Ghost-style creator site.</p>
          <a class="button" href="/articles/premium-agent-economy">Read premium brief</a>
        </div>
        <aside class="issue-panel">
          <div>
            <p class="eyebrow">Current issue</p>
            <strong>What happens when every useful page can price itself?</strong>
          </div>
          <p>Articles, APIs, music, images, videos, and datasets become directly payable by readers, fans, and agents.</p>
        </aside>
      </section>
      <section class="grid" aria-label="Latest articles">
        <article class="post-card">
          <div class="tag-row"><span class="tag">Open</span><span class="tag">Notes</span></div>
          <h2><a href="/articles/open-note">A public note on paid web primitives</a></h2>
          <p>Why one-off paid access can coexist with open publishing.</p>
        </article>
        <article class="post-card">
          <div class="tag-row"><span class="tag paid">Premium</span><span class="tag">Agents</span></div>
          <h2><a href="/articles/premium-agent-economy">The agent economy needs native payments</a></h2>
          <p>A paid article that Nibgate protects through the external demo route.</p>
        </article>
        <article class="post-card">
          <div class="tag-row"><span class="tag">Media</span><span class="tag paid">Soon</span></div>
          <h2>What per-listen music payments unlock</h2>
          <p>A placeholder for the next demo: self-hosted audio and creator splits.</p>
        </article>
      </section>`
  }));
});

app.get('/articles/open-note', (_req, res) => {
  res.send(page({
    title: 'A public note on paid web primitives',
    active: 'notes',
    body: `
      <section class="article-wrap">
        <article class="article">
          <p class="eyebrow">Free article</p>
          <h1>A public note on paid web primitives.</h1>
          <p class="article-meta">By Mara Vale · Open access · 4 min read</p>
          <p>Not every page should be paid. The better pattern is selective access: leave discovery and public notes open, then price deeper work, media, downloads, and agent-readable source material.</p>
          <p>That is why a local payment panel matters. The creator keeps their own site, their own design, and their own audience relationship.</p>
        </article>
        <aside class="aside">
          <h2>Test purpose</h2>
          <p>This route confirms the demo blog works without Nibgate protection.</p>
        </aside>
      </section>`
  }));
});

app.get('/articles/premium-agent-economy', (_req, res) => {
  res.send(page({
    title: 'The agent economy needs native payments',
    active: 'premium',
    body: `
      <section class="article-wrap">
        <article class="article">
          <p class="eyebrow">Premium article origin</p>
          <h1>The agent economy needs native payments.</h1>
          <p class="article-meta">By Mara Vale · Premium brief · $0.005 via Nibgate</p>
          <p>This is origin content from a separate demo website. Nibgate can sit in front of this route, return a payment challenge, and stream the article after payment verification.</p>
          <p>Creators should be able to charge tiny amounts for articles, music, images, videos, APIs, and citation access without giving up their own site.</p>
          <p>Agents make this more urgent. A research agent should be able to discover a price, check a user budget, pay the origin publisher, and cite the source with payment proof.</p>
        </article>
        <aside class="aside">
          <h2>Protected by Nibgate</h2>
          <p>Use the Panel route at <strong>localhost:3000</strong> to test the paid version of this article.</p>
        </aside>
      </section>`
  }));
});

app.listen(port, () => {
  console.log(`Demo blog running at http://localhost:${port}`);
});
