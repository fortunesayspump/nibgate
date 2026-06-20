import { escapeHtml } from '../../packages/cli/src/shared/html.js';
import { exploreHeader } from './components/header.js';
import { exploreRouteContent } from './router.js';
import { footerSection } from '../server/marketing/sections/footer.js';

export function explorePage({ cssHref = '/assets/styles.css', marketingOrigin, path = '/' } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nibgate Explore</title>
    <meta name="description" content="Explore paid resources, routes, and creator-owned products on Nibgate." />
    <link rel="icon" href="/assets/nibgate/images/logo-g.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${escapeHtml(cssHref)}" />
  </head>
  <body class="explore-body" data-default-theme="dark">
    ${exploreHeader()}
    <main class="explore-main">
      ${exploreRouteContent(path)}
    </main>
    ${footerSection({ marketingOrigin, showThemeToggle: true })}
    <script>
      (() => {
        const root = document.documentElement;
        const body = document.body;
        const themeToggle = document.getElementById('nibgate-theme');

        const applyTheme = (theme) => {
          root.dataset.theme = theme;
          body.dataset.theme = theme;
          localStorage.setItem('nibgate-theme', theme);

          if (themeToggle) {
            const isLight = theme === 'light';
            themeToggle.setAttribute('aria-pressed', String(isLight));
            themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
          }
        };

        const savedTheme = localStorage.getItem('nibgate-theme');
        const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
          ? savedTheme
          : body.dataset.defaultTheme || 'dark';

        applyTheme(initialTheme);

        const closeAll = (except) => {
          document.querySelectorAll('.explore-category-wrap.is-open').forEach((item) => {
            if (item === except) return;
            item.classList.remove('is-open');
            item.querySelector('.explore-category')?.setAttribute('aria-expanded', 'false');
          });
        };

        const openItem = (item) => {
          closeAll(item);
          item.classList.add('is-open');
          item.querySelector('.explore-category')?.setAttribute('aria-expanded', 'true');
        };

        const closeItem = (item) => {
          item.classList.remove('is-open');
          item.querySelector('.explore-category')?.setAttribute('aria-expanded', 'false');
        };

        document.querySelectorAll('.explore-category-wrap').forEach((item) => {
          const trigger = item.querySelector('.explore-category');
          const hasMenu = item.querySelector('.explore-category-menu');
          if (!hasMenu) return;

          trigger?.addEventListener('click', (event) => {
            event.preventDefault();
            openItem(item);
          });
          item.addEventListener('pointerenter', () => openItem(item));
          item.addEventListener('focusin', () => openItem(item));
        });

        document.addEventListener('pointerdown', (event) => {
          if (!event.target.closest('.explore-category-wrap')) closeAll();
        });

        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') closeAll();
        });

        document.querySelectorAll('[data-footer-menu-toggle]').forEach((toggle) => {
          toggle.addEventListener('click', () => {
            const column = toggle.closest('[data-footer-menu-column]');
            const isOpen = column?.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
          });
        });

        themeToggle?.addEventListener('click', () => {
          const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
          applyTheme(nextTheme);
        });
      })();
    </script>
  </body>
</html>`;
}
