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
    { label: 'Discover', href: exploreOrigin },
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
        <a class="nibgate-header-login" href="/signin">Sign in</a>
        <a class="nibgate-header-cta" href="/get-started">Start selling</a>
        <button class="nibgate-header-menu" type="button" data-toggle="mobile-menu" aria-label="Open menu" aria-expanded="false">
          <span data-menu-line="1"></span>
          <span data-menu-line="2"></span>
        </button>
      </div>
    </div>

    <nav class="nibgate-header-mobile" id="mobile-menu" aria-label="Mobile navigation">
      ${navList(activePath)}
      <a class="nibgate-header-mobile-login" href="/signin">Sign in</a>
      <a class="nibgate-header-mobile-cta" href="/get-started">Start selling</a>
    </nav>
  </header>`;
}
