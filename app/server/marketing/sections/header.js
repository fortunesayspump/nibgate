import { exploreOrigin } from '../data.js';

const githubIcon = `<svg viewBox="0 0 98 96" aria-hidden="true">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
</svg>`;

const arrowIcon = `<svg class="nibgate-header-arrow" viewBox="0 0 16 16" aria-hidden="true">
  <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z"></path>
</svg>`;

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
          <img loading="lazy" alt="" src="/assets/nibgate/images/logo.svg" />
        </a>
      </div>

      <a class="nibgate-header-github" target="_blank" rel="noopener noreferrer" aria-label="Visit Nibgate on GitHub" href="https://github.com/fortunesayspump/nibgate">
        ${githubIcon}
        <span>9.2K</span>
      </a>

      <nav class="nibgate-header-nav nibgate-header-nav-desktop" aria-label="Primary navigation">
        ${navList(activePath)}
      </nav>

      <div class="nibgate-header-actions">
        <a class="nibgate-header-login" href="/signin">Sign in</a>
        <a class="nibgate-header-cta" href="/get-started">
          <span>Start selling</span>
          ${arrowIcon}
        </a>
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
