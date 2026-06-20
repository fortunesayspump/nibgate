import { siteRoutes } from './data.js';
import { featureSection } from './sections/features.js';
import { footerSection } from './sections/footer.js';
import { headerSection } from './sections/header.js';
import { heroSection } from './sections/hero.js';
import { blogRouteContent, featuresRouteContent, signinRouteContent } from './route-pages.js';

function homepageContent() {
  return `${heroSection()}
${featureSection()}`;
}

export function siteRoutePage({ cssHref, path }) {
  const route = siteRoutes[path];
  if (!route) return null;

  const routeContent = {
    '/blog': blogRouteContent,
    '/features': featuresRouteContent,
    '/signin': signinRouteContent
  }[path];

  return renderSiteDocument({
    cssHref,
    activePath: path,
    title: `${route.title} - Nibgate`,
    description: route.copy,
    content: routeContent ? routeContent() : ''
  });
}

export function sitePage({ cssHref, activePath = '/' } = {}) {
  return renderSiteDocument({
    cssHref,
    activePath,
    title: 'Nibgate - earn from gated content',
    description:
      'Nibgate helps creators sell gated content from their own websites and publish paid routes into a public discovery hub.',
    content: homepageContent()
  });
}

function renderSiteDocument({ cssHref, activePath, title, description, content }) {
  const localCss = cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : '';
  const nibgateCss = '<link rel="stylesheet" href="/assets/nibgate/vite/assets/entrypoints/design-BqOKWsBS.css" />';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
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
            ${headerSection({ activePath })}
            <div class="overflow-hidden">
              <div class="bg-gray min-h-screen">
                ${content}
                ${footerSection({ showThemeToggle: true })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    <script>
      function addInteractivity() {
        if (window._nibgateHomepageInteractivityAdded) return;
        const root = document.documentElement;
        const body = document.body;
        const themeToggle = document.getElementById('nibgate-theme');

        function applyTheme(theme) {
          root.dataset.theme = theme;
          body.dataset.theme = theme;
          try {
            localStorage.setItem('nibgate-theme', theme);
          } catch {}

          if (themeToggle) {
            const isLight = theme === 'light';
            themeToggle.setAttribute('aria-pressed', String(isLight));
            themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
          }
        }

        let savedTheme = null;
        try {
          savedTheme = localStorage.getItem('nibgate-theme');
        } catch {}
        const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
          ? savedTheme
          : root.dataset.theme || body.dataset.defaultTheme || 'light';

        applyTheme(initialTheme);

        const mobileMenuToggle = document.querySelector('[data-toggle="mobile-menu"]');
        const mobileMenu = document.querySelector('#mobile-menu');

        mobileMenuToggle?.addEventListener('click', function() {
          const isOpen = mobileMenu?.classList.toggle('is-visible');
          mobileMenuToggle.classList.toggle('is-open', Boolean(isOpen));
          mobileMenuToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
        });

        document.querySelectorAll('[data-footer-menu-toggle]').forEach(function(toggle) {
          toggle.addEventListener('click', function() {
            const column = toggle.closest('[data-footer-menu-column]');
            const isOpen = column?.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
          });
        });

        document.querySelectorAll('[data-code-snippet]').forEach(function(snippet) {
          const button = snippet.querySelector('[data-copy-code-button]');
          const code = snippet.querySelector('[data-code-to-copy]')?.textContent?.trim();

          button?.addEventListener('click', async function() {
            if (!code) return;

            try {
              await navigator.clipboard.writeText(code);
              snippet.classList.add('has-copied');
              window.setTimeout(function() {
                snippet.classList.remove('has-copied');
              }, 1200);
            } catch (error) {
              snippet.classList.remove('has-copied');
            }
          });
        });

        themeToggle?.addEventListener('click', function() {
          applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
        });

        window._nibgateHomepageInteractivityAdded = true;
      }

      if (document.readyState === 'loading') {
        window.addEventListener('load', addInteractivity);
      } else {
        addInteractivity();
      }
    </script>
  </body>
</html>`;
}
