import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const EXPLORE_PATH = '/explore';

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
  hub: {
    apiBaseUrl: string;
    siteId: string;
    verifyToken: string;
    lastSyncAt: string;
    lastEventAt: string;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('nibgate-theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');

  useEffect(() => {
    fetch('/api/app/state')
      .then((response) => {
        if (!response.ok) throw new Error(`App API returned ${response.status}`);
        return response.json();
      })
      .then(setState)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
    localStorage.setItem('nibgate-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const routeTypes = useMemo(() => {
    if (!state) return ['All'];
    const types = new Set<string>();
    state.routes.forEach(r => {
      if (r.type) types.add(r.type);
    });
    return ['All', ...Array.from(types)];
  }, [state]);

  const filteredRoutes = useMemo(() => {
    if (!state) return [];
    return state.routes.filter(route => {
      const matchesSearch = 
        route.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        route.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (route.type && route.type.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = selectedType === 'All' || route.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [state, searchQuery, selectedType]);

  const routesByType = useMemo(() => {
    if (!state) return [];
    const counts = state.routes.reduce<Record<string, number>>((acc, route) => {
      acc[route.type] = (acc[route.type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([type, count]) => `${count} ${type}`);
  }, [state]);

  const featuredRoute = state?.routes[0] || null;
  const recentRoutes = state?.routes.slice(0, 3) || [];

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
        <div className="loader-container">
          <div className="spinner"></div>
          <p className="eyebrow">Loading</p>
          <h1>Opening the Nibgate app...</h1>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <a className="brand brand-wordmark" href="/" aria-label="Nibgate home">NIBGATE</a>
          <span className="hub-badge">HUB</span>
        </div>
        <nav>
          <a href="/">Home</a>
          <a className="active" href={EXPLORE_PATH}>Explore</a>
          <a href="/api/nibgate/status">Site Status</a>
          <a href="/.well-known/nibgate.json">Agent Metadata</a>
          <button onClick={toggleTheme} className="theme-toggle-btn" aria-label="Toggle visual theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </nav>
      </header>

      <main className="dashboard">
        <section className="app-hero">
          <div className="app-hero-copy">
            <p className="eyebrow">Nibgate network</p>
            <h1>Explore, publish, and monetize paid resources.</h1>
            <p className="panel-copy">
              Nibgate is the product surface around creator-owned routes. The package protects the origin. The app turns those routes into a readable network for people and agents.
            </p>
            <div className="panel-links" aria-label="Quick actions">
              {featuredRoute ? <a className="button primary" href={featuredRoute.path}>Open featured resource</a> : null}
              <a className="button secondary" href="/api/nibgate/status">Site status</a>
              <a className="button secondary" href="/.well-known/nibgate.json">Agent metadata</a>
            </div>
          </div>
          <div className="app-hero-meta">
            <div className="hero-meta-item">
              <span>Total earned</span>
              <strong className="gradient-text">${formatMoney(state.totals.earnings)}</strong>
            </div>
            <div className="hero-meta-item">
              <span>Protected surface</span>
              <strong>{routesByType.join(', ')}</strong>
            </div>
          </div>
        </section>

        <section className="app-columns">
          <section className="feed-column">
            <header className="feed-heading">
              <div className="feed-title-area">
                <h2>Published routes</h2>
                <span className="creator-site-pill">{state.site.name}</span>
              </div>
              <p className="creator-sub-text">Showing resources configured at {state.site.origin}</p>
              
              <div className="search-filter-controls">
                <input 
                  type="text" 
                  placeholder="Search paid resources by title or path..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="filter-pills">
                  {routeTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`filter-pill-btn ${selectedType === type ? 'active' : ''}`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <section className="media-grid">
              {filteredRoutes.length > 0 ? (
                filteredRoutes.map((route) => (
                  <article className="media-card" key={route.id} onClick={() => window.location.href = route.path}>
                    <img className="media-thumbnail" src={`https://picsum.photos/seed/${route.id}/800/600`} alt={route.title} />
                    
                    <div className="media-play-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>

                    <div className="media-overlay">
                      <div className="media-badges">
                        <span className="media-badge">{route.type.toUpperCase()}</span>
                        <div className="media-actions">
                          <button className="media-action-btn" aria-label="Like" onClick={(e) => { e.stopPropagation(); }}>♡</button>
                          <button className="media-action-btn" aria-label="Bookmark" onClick={(e) => { e.stopPropagation(); }}>⚑</button>
                        </div>
                      </div>
                      
                      <div className="media-footer">
                        <div className="media-creator">
                          <img className="media-avatar" src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${route.id}`} alt="Creator" />
                          <span className="media-title">{route.title}</span>
                        </div>
                        <span className="media-badge">{route.price} {route.currency}</span>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="no-routes-match">
                  <p>No resources match your search or filter criteria.</p>
                  <button onClick={() => { setSearchQuery(''); setSelectedType('All'); }} className="button secondary">Clear filters</button>
                </div>
              )}
            </section>

            <section className="table-section">
              <div className="section-title-row">
                <h2>Recent Payments</h2>
                <span className="ledger-badge">Ledger</span>
              </div>
              {state.payments.length ? (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Time</th><th>Actor</th><th>Content</th><th>Amount</th><th>Tx Hash</th></tr>
                    </thead>
                    <tbody>
                      {state.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="time-col">{new Date(payment.createdAt).toLocaleTimeString()}</td>
                          <td>
                            <span className="actor-pill">{payment.actor}</span>
                          </td>
                          <td className="serif-title">{payment.title}</td>
                          <td className="amount-col">
                            <strong>{payment.amount} {payment.currency}</strong>
                          </td>
                          <td>
                            <code className="tx-hash-badge" title={payment.txHash}>
                              {payment.txHash.slice(0, 10)}...{payment.txHash.slice(-6)}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-ledger">
                  <p>No payments detected. Unlock an example resource or run an agent purchase endpoint to generate transactions.</p>
                </div>
              )}
            </section>
          </section>

          <aside className="app-sidebar">
            <section className="sidebar-block">
              <h2>Overview</h2>
              <dl className="sidebar-list">
                <div><dt>Unlocks</dt><dd>{state.totals.unlocks}</dd></div>
                <div><dt>Total Routes</dt><dd>{state.routes.length}</dd></div>
                <div><dt>Settlement</dt><dd className="mode-badge">{state.provider.mode}</dd></div>
              </dl>
            </section>

            <section className="sidebar-block">
              <h2>Provider Details</h2>
              <p className="provider-name">{state.provider.displayName}</p>
              <div className="provider-address-block">
                <span className="address-title">Settlement Address</span>
                <code className="address-code">
                  {state.provider.sellerAddress || 'Example settlement active (Demo Mode)'}
                </code>
              </div>
            </section>

            <section className="sidebar-block">
              <h2>Hub Integration</h2>
              <div className="hub-status-box">
                {state.hub.siteId ? (
                  <>
                    <div className="status-indicator success">
                      <span className="status-dot"></span>
                      <span>Connected as <strong>{state.hub.siteId}</strong></span>
                    </div>
                    {state.hub.lastSyncAt && (
                      <p className="status-sync-time">
                        Last synced: <br />
                        <strong>{new Date(state.hub.lastSyncAt).toLocaleString()}</strong>
                      </p>
                    )}
                  </>
                ) : (
                  <div className="status-indicator warning">
                    <span className="status-dot"></span>
                    <span>Not connected yet. Run <code>nibgate connect</code>.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="sidebar-block">
              <h2>Recent Resources</h2>
              <ul className="sidebar-routes">
                {recentRoutes.map((route) => (
                  <li key={route.id}>
                    <a href={route.path} className="sidebar-route-link">
                      <span className="link-arrow">→</span>
                      <span className="link-title">{route.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <a className="site-footer-wordmark" href="/">NIBGATE</a>
          <div className="site-footer-links">
            <a href={EXPLORE_PATH}>Explore</a>
            <a href={`${EXPLORE_PATH}/products`}>Products</a>
            <a href="/.well-known/nibgate.json">Manifest</a>
            <a href="/api/nibgate/status">Status</a>
          </div>
        </div>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
