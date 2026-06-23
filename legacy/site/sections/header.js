import { exploreOrigin } from '../data.js';

function navItem({ label, href, activePath }) {
  const isActive = href === activePath;
  const activeClass = isActive ? ' is-active' : '';

  return `<li class="nibgate-primary-nav-item">
    <a class="nibgate-primary-nav-link${activeClass}" href="${href}">${label}</a>
  </li>`;
}

function navList(activePath = '/') {
  const items = [
    { label: 'Explore', href: exploreOrigin },
    { label: 'Blog', href: '/blog' },
    { label: 'Features', href: '/features' },
    { label: 'About', href: '/about' }
  ];

  return `<ul class="nibgate-primary-nav">${items.map((item) => navItem({ ...item, activePath })).join('')}</ul>`;
}

export function headerSection({ activePath = '/' } = {}) {
  return `<header class="nibgate-site-header">
    <div class="nibgate-header-inner">
      <div class="nibgate-header-identity">
        <a class="nibgate-header-logo" href="/" aria-label="Nibgate home">
          <span>nibgate</span>
        </a>
      </div>

      <div class="nibgate-header-actions">
        <nav class="nibgate-header-nav nibgate-header-nav-desktop" aria-label="Primary navigation">
          ${navList(activePath)}
        </nav>
        
        <div class="nibgate-wallet-container" data-balance-container>
          <button type="button" class="nibgate-header-login" data-balance-text>0.00 USDC</button>
          <div class="hidden-dropdown" data-balance-dropdown style="display: none;"></div>
        </div>
        
        <div class="nibgate-wallet-container" data-wallet-container>
          <button class="nibgate-header-cta" type="button" data-wallet-connect>Connect wallet</button>
          <div class="nibgate-wallet-dropdown" data-wallet-dropdown style="display: none;">
            <a href="/dashboard" class="dropdown-item">Dashboard</a>
            <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          </div>
        </div>

        <button class="nibgate-header-menu" type="button" data-toggle="mobile-menu" aria-label="Open menu" aria-expanded="false">
          <span data-menu-line="1"></span>
          <span data-menu-line="2"></span>
        </button>
      </div>
    </div>

    <nav class="nibgate-header-mobile" id="mobile-menu" aria-label="Mobile navigation">
      ${navList(activePath)}
      
      <div class="nibgate-wallet-container" data-balance-container style="width: 100%;">
        <button type="button" class="nibgate-header-mobile-login" style="width: 100%; display: flex; align-items: center; justify-content: center;" data-balance-text>0.00 USDC</button>
        <div class="hidden-dropdown mobile-dropdown" data-balance-dropdown style="display: none;"></div>
      </div>
      
      <div class="nibgate-wallet-container" data-wallet-container style="width: 100%;">
        <button class="nibgate-header-mobile-cta" style="width: 100%;" type="button" data-wallet-connect>Connect wallet</button>
        <div class="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style="display: none;">
          <a href="/dashboard" class="dropdown-item">Dashboard</a>
          <button type="button" class="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
        </div>
      </div>
    </nav>
  </header>`;
}
