import { escapeHtml } from '../../packages/cli/src/shared/html.js';
import { exploreControls } from './components/controls.js';
import { exploreRouteContent } from './router.js';
import { headerSection } from '../server/site/sections/header.js';
import { footerSection } from '../server/site/sections/footer.js';

export function explorePage({ cssHref = '/assets/styles.css', siteOrigin, path = '/', basePath = '/explore' } = {}) {
  const localCss = cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}" />` : '';
  const nibgateCss = '<link rel="stylesheet" href="/assets/nibgate/vite/assets/entrypoints/design-BqOKWsBS.css" />';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nibgate Explore</title>
    <meta name="description" content="Explore paid resources, routes, and creator-owned products on Nibgate." />
    <link rel="icon" href="/assets/nibgate/images/logo-g.svg" type="image/svg+xml" />
    <script>
      (() => {
        try {
          const savedTheme = localStorage.getItem('nibgate-theme');
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const theme = savedTheme === 'light' || savedTheme === 'dark'
            ? savedTheme
            : (prefersDark ? 'dark' : 'light');
          document.documentElement.dataset.theme = theme;
        } catch {}
      })();
    </script>
    ${localCss}
    ${nibgateCss}
  </head>
  <body class="group/body" data-default-theme="light">
    <div id="design-settings" data-settings="{&quot;font&quot;:{&quot;name&quot;:&quot;ABC Favorit&quot;,&quot;url&quot;:&quot;/assets/nibgate/fonts/ABCFavorit-Regular.woff2&quot;}}" style="display: none;"></div>
    <div class="flex flex-col lg:flex-row min-h-screen">
      <main class="flex-1 flex flex-col">
        <div class="flex-1 flex flex-col">
          <div class="nibgate-site-surface block bg-white text-black text-base font-normal leading-relaxed tracking-tight">
            ${headerSection({ activePath: '/explore' })}
            <div class="overflow-hidden">
              <div class="explore-body explore-main" role="main">
                ${exploreControls({ basePath })}
                ${exploreRouteContent(path)}
              </div>
              ${footerSection({ siteOrigin, showThemeToggle: true })}
            </div>
          </div>
        </div>
      </main>
    </div>
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
          : root.dataset.theme || body.dataset.defaultTheme || 'light';

        applyTheme(initialTheme);

        const mobileMenuToggle = document.querySelector('[data-toggle="mobile-menu"]');
        const mobileMenu = document.querySelector('#mobile-menu');

        mobileMenuToggle?.addEventListener('click', () => {
          const isOpen = mobileMenu?.classList.toggle('is-visible');
          mobileMenuToggle.classList.toggle('is-open', Boolean(isOpen));
          mobileMenuToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
        });

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
          item.addEventListener('pointerleave', () => closeItem(item));
          item.addEventListener('focusin', () => openItem(item));
          item.addEventListener('focusout', () => {
            window.setTimeout(() => {
              if (!item.contains(document.activeElement)) closeItem(item);
            }, 0);
          });
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
