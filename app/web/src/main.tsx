import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type RouteConfig = {
  id: string;
  path: string;
  originUrl?: string;
  title: string;
  type: string;
  price: string;
  agentPrice?: string;
  currency: string;
  unit?: string;
  network: string;
  license: string;
};

type Payment = {
  id: string;
  title: string;
  actor: string;
  amount: string;
  currency: string;
  provider: string;
  txHash: string;
  createdAt: string;
};

type AppState = {
  site: {
    name: string;
    origin: string;
    platformFeeBps: number;
  };
  provider: {
    mode: string;
    displayName: string;
    sellerAddress: string;
    networks: string[];
    facilitatorUrl: string;
    buyerConfigured: boolean;
    buyerChain: string;
  };
  routes: RouteConfig[];
  payments: Payment[];
  totals: {
    unlocks: number;
    earnings: number;
  };
};

function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6
  });
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/app/state')
      .then((response) => {
        if (!response.ok) throw new Error(`App API returned ${response.status}`);
        return response.json();
      })
      .then(setState)
      .catch((err) => setError(err.message));
  }, []);

  const routesByType = useMemo(() => {
    if (!state) return [];
    const counts = state.routes.reduce<Record<string, number>>((acc, route) => {
      acc[route.type] = (acc[route.type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([type, count]) => `${count} ${type}`);
  }, [state]);

  if (error) {
    return (
      <main className="dashboard">
        <section className="empty-state">
          <p className="eyebrow">App unavailable</p>
          <h1>Could not load the Nibgate app.</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="dashboard">
        <section className="empty-state">
          <p className="eyebrow">Loading</p>
          <h1>Opening the Nibgate app...</h1>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">N</span>
          <span>Nibgate</span>
        </a>
        <nav>
          <a className="active" href="/">App</a>
          <a href="/demo/ghost/the-agent-economy">Demo Article</a>
          <a href="http://localhost:3001">Marketing</a>
          <a href="/.well-known/nibgate.json">Agent Metadata</a>
        </nav>
      </header>

      <main className="dashboard">
        <section className="panel-hero">
          <div>
            <p className="eyebrow">Nibgate app</p>
            <h1>Discover, publish, and monetize paid resources.</h1>
            <p className="panel-copy">
              Nibgate is becoming the product surface for creators, readers, and agents.
              The CLI protects origin routes, while the app becomes the network layer around them.
            </p>
            <div className="command-line">$ npx nibgate dev</div>
          </div>
          <div className="hero-stats">
            <div className="earnings">
              <span>Total earned</span>
              <strong>${formatMoney(state.totals.earnings)}</strong>
            </div>
            <div className="mini-stat">
              <strong>{state.routes.length}</strong>
              <span>paid routes</span>
            </div>
            <div className="mini-stat">
              <strong>{state.provider.mode}</strong>
              <span>payment mode</span>
            </div>
          </div>
        </section>

        <section className="panel-links" aria-label="Quick actions">
          <a className="button primary" href="/demo/ghost/the-agent-economy">Test Article Unlock</a>
          <a className="button secondary" href="/protected/demo-blog/premium-agent-economy">Test Demo Blog Gate</a>
          <a className="button secondary" href="/.well-known/nibgate.json">Agent Metadata</a>
        </section>

        <section className="metrics" aria-label="App metrics">
          <div><span>Unlocks</span><strong>{state.totals.unlocks}</strong></div>
          <div><span>Payment mode</span><strong>{state.provider.mode}</strong></div>
          <div><span>Routes</span><strong>{state.routes.length}</strong></div>
        </section>

        <section className="status-grid">
          <article>
            <p className="eyebrow">Provider</p>
            <h2>{state.provider.displayName}</h2>
            <p>{state.provider.sellerAddress || 'Demo settlement is active. Set NIBGATE_SELLER_ADDRESS for Circle Gateway mode.'}</p>
          </article>
          <article>
            <p className="eyebrow">Accepted networks</p>
            <h2>{state.provider.networks.join(', ')}</h2>
            <p>{state.provider.facilitatorUrl}</p>
          </article>
          <article>
            <p className="eyebrow">Buyer flow</p>
            <h2>{state.provider.buyerConfigured ? 'Configured' : 'Needs buyer key'}</h2>
            <p>{state.provider.buyerConfigured ? `Server buyer chain: ${state.provider.buyerChain}` : 'Set NIBGATE_BUYER_PRIVATE_KEY to make browser unlocks execute a real x402 payment.'}</p>
          </article>
        </section>

        <section className="status-grid">
          <article>
            <p className="eyebrow">Protected surface</p>
            <h2>{routesByType.join(', ')}</h2>
            <p>{state.site.name}</p>
          </article>
        </section>

        <section className="routes-grid">
          {state.routes.map((route) => (
            <article className="route-card" key={route.id}>
              <div>
                <p className="eyebrow">{route.type}{route.unit ? ` / ${route.unit}` : ''}</p>
                <h2>{route.title}</h2>
                <p>{route.path}</p>
                {route.originUrl ? <p className="origin">Origin: {route.originUrl}</p> : null}
              </div>
              <div className="route-price">
                <strong>{route.price} {route.currency}</strong>
                <span>{route.agentPrice || route.price} {route.currency} agent</span>
              </div>
              <div className="route-actions">
                <a className="button secondary" href={`/api/content/${route.id}/price`}>x402 JSON</a>
                <a className="button primary" href={route.path}>Open</a>
              </div>
            </article>
          ))}
        </section>

        <section className="table-section">
          <h2>Recent Payments</h2>
          {state.payments.length ? (
            <table>
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Content</th><th>Amount</th><th>Tx</th></tr>
              </thead>
              <tbody>
                {state.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.createdAt).toLocaleTimeString()}</td>
                    <td>{payment.actor}</td>
                    <td>{payment.title}</td>
                    <td>{payment.amount} {payment.currency}</td>
                    <td><code>{payment.txHash}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No payments yet. Unlock a demo article or run an agent purchase endpoint.</p>
          )}
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
