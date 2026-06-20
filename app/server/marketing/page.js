import { marketingRoutes } from './data.js';
import { featureSection } from './sections/features.js';
import { footerSection } from './sections/footer.js';
import { headerSection } from './sections/header.js';
import { heroSection } from './sections/hero.js';
import { blogRouteContent, featuresRouteContent } from './route-pages.js';
import { testimonialsSection, possibilitiesSection } from './sections/social-proof.js';
import { statSection, waySection } from './sections/way.js';

function homepageContent() {
  return `${heroSection()}
${featureSection()}
${waySection()}
${statSection()}
${testimonialsSection()}
${possibilitiesSection()}`;
}

export function marketingRoutePage({ cssHref, path }) {
  const route = marketingRoutes[path];
  if (!route) return null;

  const routeContent = {
    '/blog': blogRouteContent,
    '/features': featuresRouteContent
  }[path];

  return renderMarketingDocument({
    cssHref,
    activePath: path,
    title: `${route.title} - Nibgate`,
    description: route.copy,
    content: routeContent ? routeContent() : ''
  });
}

export function marketingPage({ cssHref, activePath = '/' } = {}) {
  return renderMarketingDocument({
    cssHref,
    activePath,
    title: 'Nibgate - earn from gated content',
    description:
      'Nibgate helps creators sell gated content from their own websites and publish paid routes into a public discovery hub.',
    content: homepageContent()
  });
}

function renderMarketingDocument({ cssHref, activePath, title, description, content }) {
  const localCss = cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : '';
  const nibgateCss = '<link rel="stylesheet" href="/assets/nibgate/vite/assets/entrypoints/design-BqOKWsBS.css" />';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    ${localCss}
    ${nibgateCss}
  </head>
  <body class="group/body">
    <div id="design-settings" data-settings="{&quot;font&quot;:{&quot;name&quot;:&quot;ABC Favorit&quot;,&quot;url&quot;:&quot;/assets/nibgate/fonts/ABCFavorit-Regular.woff2&quot;}}" style="display: none;"></div>
    <div class="flex flex-col lg:flex-row min-h-screen">
      <main class="flex-1 flex flex-col">
        <div class="flex-1 flex flex-col">
          <div class="block bg-white text-black font-['ABC_Favorit'] text-base font-normal leading-relaxed tracking-tight">
            ${headerSection({ activePath })}
            <div class="overflow-hidden">
              <div class="bg-gray min-h-screen">
                ${content}
                ${footerSection({ showThemeToggle: false })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    <script>
      function addInteractivity() {
        if (window._nibgateHomepageInteractivityAdded) return;

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
