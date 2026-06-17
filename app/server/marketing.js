import { escapeHtml } from '../../cli/packages/shared/html.js';

export function marketingPage({ cssHref = '/assets/styles.css' }) {
  const platforms = ['Ghost', 'WordPress', 'Immich', 'Jellyfin', 'Navidrome', 'PeerTube', 'Owncast'];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nibgate | Paid access for the open web</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
</head>
<body class="site-shell site-shell-marketing">
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">N</span>
      <span>Nibgate</span>
    </a>
    <nav>
      <a class="active" href="/">Home</a>
      <a href="/app">App</a>
      <a href="/demo/ghost/the-agent-economy">Demo</a>
      <a href="/.well-known/nibgate.json">Agent Metadata</a>
    </nav>
  </header>
  <main class="marketing-page">
    <section class="marketing-hero">
      <div class="marketing-copy">
        <p class="eyebrow">Open web payments</p>
        <h1>Charge per article, stream, file, or API call.</h1>
        <p class="marketing-lede">Nibgate gives creators and developers a clean paid-access layer for normal websites and agent traffic. Protect routes with the CLI, publish offers in the app, and accept real x402-compatible payments.</p>
        <div class="command-line">$ npx nibgate init</div>
        <div class="marketing-actions">
          <a class="button primary" href="/app">Open the app</a>
          <a class="button secondary" href="/demo/ghost/the-agent-economy">Try the live demo</a>
        </div>
      </div>
      <div class="marketing-preview">
        <div class="preview-row"><span>Route</span><strong>/premium/article</strong></div>
        <div class="preview-row"><span>Price</span><strong>0.005 USDC</strong></div>
        <div class="preview-row"><span>Checkout</span><strong>Browser wallet</strong></div>
        <div class="preview-row"><span>Agent access</span><strong>x402 ready</strong></div>
      </div>
    </section>

    <section class="marketing-grid" aria-label="How it works">
      <article>
        <strong>01</strong>
        <h2>Protect routes</h2>
        <p>Use the CLI to define payable pages, feeds, media endpoints, and APIs without hardcoding a fake flow.</p>
      </article>
      <article>
        <strong>02</strong>
        <h2>Publish offers</h2>
        <p>The app becomes the public surface where people discover what exists, what it costs, and what license they get.</p>
      </article>
      <article>
        <strong>03</strong>
        <h2>Get paid directly</h2>
        <p>Readers and agents can pay tiny amounts for just the resource they need instead of being pushed into a subscription.</p>
      </article>
    </section>

    <section class="platform-strip" aria-label="Supported platform examples">
      ${platforms.map((platform) => `<span>${escapeHtml(platform)}</span>`).join('')}
    </section>
  </main>
</body>
</html>`;
}
