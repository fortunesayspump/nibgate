import { escapeHtml } from '../../../cli/packages/shared/html.js';

function shell({ title, body, active = 'demo', cssHref = '/assets/styles.css' }) {
  const unlockClientSrc = process.env.NIBGATE_PANEL_DEV === 'true'
    ? 'http://localhost:5173/src/unlock-client.ts'
    : '/assets/unlock-client.js';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">N</span>
      <span>Nibgate</span>
    </a>
    <nav>
      <a href="/">Home</a>
      <a href="/app">App</a>
      <a class="${active === 'demo' ? 'active' : ''}" href="/demo/ghost/the-agent-economy">Demo Article</a>
      <a href="/.well-known/nibgate.json">Agent Metadata</a>
    </nav>
  </header>
  <main>${body}</main>
  <script type="module" src="${unlockClientSrc}"></script>
</body>
</html>`;
}

function unlockAction(route, gateway) {
  if (gateway.paymentProvider.isLive) {
    return `
      <div class="paywall">
        <div>
          <h2>Continue reading</h2>
          <p>Pay from your own Arc Testnet wallet and Gateway balance. This is the real reader flow.</p>
        </div>
        <form data-wallet-unlock data-route-id="${escapeHtml(route.id)}" data-route-path="${escapeHtml(route.path)}">
          <button class="button primary" type="submit">Pay ${escapeHtml(route.price)} ${escapeHtml(route.currency)} with your wallet</button>
          <p class="wallet-note">Use Arc Testnet and make sure this wallet already has Gateway balance.</p>
          <p class="unlock-message" data-unlock-message data-tone="neutral"></p>
        </form>
      </div>`;
  }

  return `
    <div class="paywall">
      <div>
        <h2>Continue reading</h2>
        <p>This route is in demo mode. Switch to Circle Gateway mode to use a live x402 payment instead of local simulation.</p>
      </div>
      <form method="post" action="/api/content/${escapeHtml(route.id)}/unlock">
        <button class="button primary" type="submit">Unlock for ${escapeHtml(route.price)} ${escapeHtml(route.currency)}</button>
      </form>
    </div>`;
}

function creatorTools(route, gateway) {
  if (!gateway.paymentProvider.isLive || !gateway.paymentProvider.buyerConfigured) return '';

  return `
    <div class="creator-tools">
      <h3>Creator Quick Test</h3>
      <p>This path uses the local server-side buyer wallet for fast demo resets and judging. It is not the normal reader checkout.</p>
      <form method="post" action="/api/content/${escapeHtml(route.id)}/unlock">
        <button class="button secondary" type="submit">Run creator-side test unlock</button>
      </form>
    </div>`;
}

export function articlePage({ req, route, gateway, assets }) {
  const unlock = gateway.getUnlock(req, route.id);
  const isUnlocked = Boolean(unlock);

  return shell({
    title: route.title,
    cssHref: assets.cssHref,
    body: `
      <section class="article-layout">
        <article class="article">
          <p class="eyebrow">Ghost-style paid article</p>
          <h1>${escapeHtml(route.title)}</h1>
          <p class="article-meta">By Ada Sol · ${escapeHtml(route.price)} ${escapeHtml(route.currency)} human unlock · ${escapeHtml(route.agentPrice)} ${escapeHtml(route.currency)} agent citation</p>
          <p>The web was built around open reads and blunt subscriptions. Agents change the math. They need to buy small, licensed slices of context without a human approving every click.</p>
          <p>Nibgate makes that transaction native to the route itself. A protected page can say what it costs, which network it accepts, what license the buyer receives, and who gets paid.</p>
          ${
            isUnlocked
              ? `<div class="unlock-banner">Unlocked via ${escapeHtml(unlock.actor)} payment. Session expires in 12 hours.</div>
                <p>For creators, this means one article can earn from readers, researchers, curators, and autonomous agents without bundling everything into a monthly subscription. For consumers, it means no more paying ten dollars for one paragraph they actually needed.</p>
                <p>For agents, it creates a cleaner economy: discover price, check budget, pay origin, cite source, preserve provenance. The creator gets paid because the content was useful, not because a platform captured the relationship.</p>
                <p>The first version can be a reverse proxy. The long-term version becomes a shared payment and access layer across the self-hosted creator stack.</p>`
              : `${unlockAction(route, gateway)}${creatorTools(route, gateway)}`
          }
        </article>
        <aside class="side-panel">
          <h2>Payment Metadata</h2>
          <dl>
            <dt>Network</dt>
            <dd>${escapeHtml(route.network)}</dd>
            <dt>Content ID</dt>
            <dd>${escapeHtml(route.id)}</dd>
            <dt>License</dt>
            <dd>${escapeHtml(route.license)}</dd>
            <dt>Reader checkout</dt>
            <dd>${gateway.paymentProvider.isLive ? 'Browser wallet + Gateway balance' : 'Local demo mode'}</dd>
          </dl>
          <a class="button secondary full" href="/api/content/${escapeHtml(route.id)}/price">View Price JSON</a>
        </aside>
      </section>`
  });
}

export function protectedRoutePage({ route, gateway, assets }) {
  return shell({
    title: route.title,
    cssHref: assets.cssHref,
    body: `
      <section class="article-layout">
        <article class="article">
          <p class="eyebrow">${escapeHtml(route.type)} route</p>
          <h1>${escapeHtml(route.title)}</h1>
          <p class="article-meta">${escapeHtml(route.price)} ${escapeHtml(route.currency)} unlock</p>
          ${unlockAction(route, gateway)}${creatorTools(route, gateway)}
        </article>
      </section>`
  });
}

export function audioPage({ route, assets }) {
  return shell({
    title: route.title,
    cssHref: assets.cssHref,
    body: `
      <section class="article-layout">
        <article class="article">
          <p class="eyebrow">Navidrome-style metered media</p>
          <h1>${escapeHtml(route.title)}</h1>
          <p class="article-meta">${escapeHtml(route.price)} ${escapeHtml(route.currency)} per ${escapeHtml(route.unit)} · simulated streaming route</p>
          <div class="paywall">
            <div>
              <h2>Metered streaming placeholder</h2>
              <p>This route shows how the same config can price media by time. The hackathon MVP should finish article unlock first, then add live metering here.</p>
            </div>
            <a class="button primary" href="/api/content/${escapeHtml(route.id)}/price">View x402 Challenge</a>
          </div>
        </article>
      </section>`
  });
}
