import { exploreOrigin } from '../data.js';

const footerMenus = [
  {
    id: 'project-menu',
    title: 'Project',
    links: [
      ['Why Nibgate?', '/about'],
      ['Features', '/features'],
      ['Get started', '/get-started'],
      ['Payments', '/features'],
      ['Discovery', exploreOrigin],
      ['Security', '/features'],
      ['Manifest', '/.well-known/nibgate.json'],
      ['Status', '/api/nibgate/status']
    ]
  },
  {
    id: 'explore-menu',
    title: 'Explore',
    links: [
      ['Explore hub', exploreOrigin],
      ['Writing', `${exploreOrigin}?type=writing`],
      ['Articles', `${exploreOrigin}?type=articles`],
      ['Images', `${exploreOrigin}?type=image`],
      ['Music', `${exploreOrigin}?type=music`],
      ['Video', `${exploreOrigin}?type=video`],
      ['Creators', exploreOrigin],
      ['Best sellers', exploreOrigin],
      ['Hot & new', exploreOrigin],
      ['Agent routes', exploreOrigin]
    ]
  },
  {
    id: 'developers-menu',
    title: 'Developers',
    links: [
      ['Documentation', '/get-started'],
      ['Quick start', '/get-started'],
      ['GitHub', 'https://github.com/fortunesayspump/nibgate'],
      ['Install package', '/get-started'],
      ['Route manifest', '/.well-known/nibgate.json'],
      ['Status API', '/api/nibgate/status']
    ]
  },
  {
    id: 'community-menu',
    title: 'Community',
    links: [
      ['Blog', '/blog'],
      ['Newsletter', '#newsletter'],
      ['GitHub discussions', 'https://github.com/fortunesayspump/nibgate'],
      ['Contribute', 'https://github.com/fortunesayspump/nibgate'],
      ['Creators', exploreOrigin],
      ['Examples', '/features'],
      ['Roadmap', '/blog'],
      ['Sponsor', 'https://github.com/fortunesayspump/nibgate']
    ]
  },
  {
    id: 'support-menu',
    title: 'Support',
    links: [
      ['Get help', 'mailto:hello@nibgate.xyz'],
      ['Creator guide', '/get-started'],
      ['Developer support', 'mailto:hello@nibgate.xyz'],
      ['FAQs', '/blog'],
      ['Cookie policy', '/privacy'],
      ['Privacy policy', '/privacy'],
      ['Terms', '/terms'],
      ['Contact', 'mailto:hello@nibgate.xyz']
    ]
  }
];

function linkAttrs(href) {
  return href.startsWith('http') || href.startsWith('mailto:')
    ? ' target="_blank" rel="noopener noreferrer"'
    : '';
}

function resolveHref(href, siteOrigin = '') {
  if (!siteOrigin || !href.startsWith('/')) return href;
  return `${siteOrigin.replace(/\/$/, '')}${href}`;
}

function menuColumn({ id, title, links }, siteOrigin = '') {
  const items = links
    .map(([label, href]) => {
      const resolvedHref = resolveHref(href, siteOrigin);
      return `<li class="footer-menu__item">
      <a class="footer-menu__link" href="${resolvedHref}"${linkAttrs(resolvedHref)}>${label}</a>
    </li>`;
    })
    .join('');

  return `<div class="footer-menu__column" data-footer-menu-column>
    <div class="footer-menu__column-header">
      <button class="footer-menu__toggle" aria-label="Open the ${title} menu" aria-expanded="false" aria-controls="${id}" data-footer-menu-toggle>
        <svg class="footer-menu__icon footer-menu__icon--open" aria-hidden="true" data-footer-menu-open-icon>
          <use xlink:href="#plus-in-circle"></use>
        </svg>
        <svg class="footer-menu__icon footer-menu__icon--close" aria-hidden="true" data-footer-menu-close-icon>
          <use xlink:href="#minus-in-circle"></use>
        </svg>
        <span class="footer-menu__column-heading footer-menu__column-heading--collapsible">${title}</span>
      </button>

      <p class="footer-menu__column-heading">${title}</p>
    </div>

    <ul class="footer-menu__list" id="${id}" data-footer-menu-list>
      ${items}
    </ul>
  </div>`;
}

const footerSprite = `<svg class="footer-svg-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <symbol id="plus-in-circle" viewBox="0 0 20 20"><path d="M10.844 10.844v-1h-1v1h1zm0-1.688h-1v1h1v-1zm-1.688 0v1h1v-1h-1zm0 1.688h1v-1h-1v1zM2 10c0-4.407 3.563-8 8-8V0C4.453 0 0 4.493 0 10h2zm8-8c4.405 0 8 3.595 8 8h2c0-5.51-4.49-10-10-10v2zm8 8c0 4.437-3.593 8-8 8v2c5.507 0 10-4.453 10-10h-2zm-8 8c-4.44 0-8-3.56-8-8H0c0 5.545 4.455 10 10 10v-2zm0-3.063c.982 0 1.844-.772 1.844-1.843h-2c0-.01.002-.029.012-.052a.182.182 0 0 1 .04-.06.152.152 0 0 1 .104-.045v2zm1.844-1.843v-2.25h-2v2.25h2zm-1-1.25h2.25v-2h-2.25v2zm2.25 0c.982 0 1.844-.772 1.844-1.844h-2a.14.14 0 0 1 .011-.051.184.184 0 0 1 .041-.06.152.152 0 0 1 .104-.045v2zM14.938 10c0-1.01-.835-1.844-1.844-1.844v2a.16.16 0 0 1-.114-.042.16.16 0 0 1-.042-.114h2zm-1.844-1.844h-2.25v2h2.25v-2zm-1.25 1v-2.25h-2v2.25h2zm0-2.25c0-1.01-.835-1.843-1.844-1.843v2a.16.16 0 0 1-.114-.043.16.16 0 0 1-.042-.114h2zM10 5.063a1.833 1.833 0 0 0-1.844 1.843h2c0 .03-.012.07-.045.104a.184.184 0 0 1-.06.04.14.14 0 0 1-.051.013v-2zM8.156 6.905v2.25h2v-2.25h-2zm1 1.25h-2.25v2h2.25v-2zm-2.25 0A1.833 1.833 0 0 0 5.063 10h2c0 .03-.013.07-.046.103a.182.182 0 0 1-.06.041.137.137 0 0 1-.05.012v-2zM5.063 10c0 1.044.799 1.844 1.843 1.844v-2c-.001 0 .049.003.1.055.053.053.056.103.056.101h-2zm1.843 1.844h2.25v-2h-2.25v2zm1.25-1v2.25h2v-2.25h-2zm0 2.25c0 1.044.8 1.844 1.844 1.844v-2c-.002 0 .048.003.1.055.053.052.056.102.056.1h-2z"/></symbol>
  <symbol id="minus-in-circle" viewBox="0 0 20 20"><path d="M2 10c0-4.407 3.563-8 8-8V0C4.453 0 0 4.493 0 10h2zm8-8c4.405 0 8 3.595 8 8h2c0-5.51-4.49-10-10-10v2zm8 8c0 4.437-3.593 8-8 8v2c5.507 0 10-4.453 10-10h-2zm-8 8c-4.44 0-8-3.56-8-8H0c0 5.544 4.456 10 10 10v-2zM6.906 8.156A1.833 1.833 0 0 0 5.063 10h2c0 .03-.013.069-.046.104a.173.173 0 0 1-.11.052v-2h-.001zM5.063 10c0 1.044.799 1.844 1.843 1.844v-2c-.001 0 .049.003.1.055.053.053.056.102.056.101h-2 .001zm1.843 1.844h6.188v-2H6.906v2zm6.188 0c.981 0 1.843-.772 1.843-1.844h-2a.186.186 0 0 1 .053-.111.152.152 0 0 1 .104-.045v2zM14.937 10a1.856 1.856 0 0 0-1.843-1.844v2a.161.161 0 0 1-.114-.042.159.159 0 0 1-.042-.114h2-.001zm-1.843-1.844H6.906v2h6.188v-2z"/></symbol>
  <symbol id="money" viewBox="0 0 256 256"><path d="M150.75 71.125h-45.5L88.4 45.851C85.878 42.048 88.579 37 93.129 37h69.743c4.55 0 7.252 5.048 4.728 8.851L150.75 71.125ZM105.25 82.5h45.5c1.351.889 2.879 1.884 4.621 2.986C175.526 98.389 219 126.187 219 184.875c0 18.84-15.285 34.125-34.125 34.125H71.125C52.285 219 37 203.715 37 184.875c0-58.688 43.474-86.486 63.629-99.39 1.706-1.101 3.27-2.096 4.621-2.985Zm29.895 34.125a7.145 7.145 0 0 0-14.29 0v2.133a29.116 29.116 0 0 0-5.652 1.813c-5.332 2.417-9.917 6.896-11.055 13.401-.64 3.626-.284 7.109 1.209 10.308 1.493 3.129 3.803 5.332 6.149 6.932 4.124 2.808 9.562 4.443 13.721 5.688l.782.248c4.941 1.493 8.318 2.631 10.416 4.159.888.64 1.208 1.138 1.35 1.458.107.284.32.924.071 2.381-.213 1.245-.888 2.275-2.843 3.129-2.169.924-5.688 1.386-10.238.675-2.133-.355-5.936-1.635-9.313-2.808a41.375 41.375 0 0 0-2.24-.747c-3.732-1.244-7.749.782-8.993 4.515-1.244 3.732.782 7.749 4.515 8.993.426.142.959.32 1.564.533 2.808.96 7.216 2.453 10.593 3.235v2.204a7.145 7.145 0 0 0 14.289 0v-1.955a25.708 25.708 0 0 0 5.475-1.635c5.581-2.382 10.095-7.003 11.233-13.757.639-3.697.355-7.216-1.067-10.451-1.386-3.199-3.626-5.545-6.007-7.287-4.337-3.128-10.06-4.87-14.361-6.185l-.285-.071c-5.047-1.529-8.46-2.595-10.628-4.052-.924-.64-1.209-1.067-1.28-1.245-.071-.106-.249-.568-.035-1.777.106-.675.675-1.848 2.914-2.879 2.275-1.031 5.83-1.6 10.167-.924 1.528.248 6.363 1.173 7.714 1.528a7.134 7.134 0 0 0 8.709-5.047c1.03-3.804-1.245-7.679-5.048-8.709-1.564-.427-5.119-1.138-7.465-1.565v-2.239h-.071Z"/></symbol>
  <symbol id="code-file" viewBox="0 0 256 256"><path d="M82.333 37C69.74 37 59.5 47.202 59.5 59.75v136.5c0 12.548 10.24 22.75 22.833 22.75h91.334c12.594 0 22.833-10.202 22.833-22.75V93.875h-45.667c-6.315 0-11.416-5.083-11.416-11.375V37H82.333Zm68.5 0v45.5H196.5L150.833 37Zm-36.747 102.73-11.06 11.02 11.06 11.02c3.354 3.341 3.354 8.744 0 12.05-3.354 3.306-8.777 3.341-12.095 0l-17.16-17.027c-3.354-3.341-3.354-8.745 0-12.05l17.125-17.063c3.353-3.341 8.776-3.341 12.094 0 3.318 3.341 3.354 8.745 0 12.05h.036Zm39.958-12.085 17.125 17.062c3.354 3.341 3.354 8.745 0 12.05l-17.125 17.063c-3.353 3.341-8.776 3.341-12.094 0-3.318-3.341-3.354-8.745 0-12.05l11.06-11.02-11.06-11.02c-3.354-3.341-3.354-8.744 0-12.05 3.353-3.306 8.776-3.341 12.094 0v-.035Z"/></symbol>
  <symbol id="github" viewBox="0 0 98 96"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></symbol>
  <symbol id="twitter" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></symbol>
  <symbol id="envelope" viewBox="0 0 256 256"><path d="M59.75 110.973 128 60.425l68.25 50.548v16.849l-56.342 41.768c-3.448 2.559-7.607 3.91-11.908 3.91-4.301 0-8.46-1.386-11.908-3.91L59.75 127.822v-16.849ZM128 37c-4.301 0-8.46 1.386-11.908 3.91L46.207 92.702A22.729 22.729 0 0 0 37 110.973v85.277C37 208.798 47.202 219 59.75 219h136.5c12.548 0 22.75-10.202 22.75-22.75v-85.277c0-7.216-3.412-14.005-9.207-18.271L139.908 40.91A20.155 20.155 0 0 0 128 37Z"/></symbol>
  <symbol id="arrow" fill="currentColor" viewBox="0 0 256 256"><path d="M204.164 136.034c4.436-4.444 4.436-11.66 0-16.103l-56.786-56.875c-4.436-4.444-11.641-4.444-16.077 0-4.437 4.443-4.437 11.66 0 16.103l37.443 37.466H59.857c-6.282 0-11.357 5.083-11.357 11.375s5.075 11.375 11.357 11.375h108.851l-37.372 37.466c-4.436 4.444-4.436 11.66 0 16.103 4.437 4.444 11.641 4.444 16.078 0l56.785-56.875-.035-.035Z"/></symbol>
  <symbol id="copy" viewBox="0 0 24 24"><path d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v1H8V7Z"></path><path d="M6 9h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H6Z"></path></symbol>
</svg>`;

function icon(id, className) {
  return `<svg class="${className}" aria-hidden="true"><use xlink:href="#${id}"></use></svg>`;
}

export function footerSection({ siteOrigin = '', showThemeToggle = false } = {}) {
  return `<footer class="app__footer footer">
    ${footerSprite}
    <nav class="footer-menu" aria-label="Footer menu">
      <div class="footer-menu__grid grid">
        ${footerMenus.map((menu) => menuColumn(menu, siteOrigin)).join('')}
      </div>
    </nav>

    <div class="footer__base">
      <div class="grid">
        <ul class="footer__links-wrap">
          <li class="footer__link-item">
            <a class="footer__icon-link footer__icon-link--sponsor" href="${resolveHref('/get-started', siteOrigin)}">
              ${icon('money', 'footer__icon')}
              <div class="footer__icon-link-content">
                <h2 class="footer__icon-link-heading">Start with Nibgate</h2>
                <p class="mini-meta">Install the package, protect a route, and publish paid content from your own site.</p>
              </div>
            </a>
          </li>
          <li class="footer__link-item">
            <a class="footer__icon-link footer__icon-link--contribute" href="https://github.com/fortunesayspump/nibgate" target="_blank" rel="noopener noreferrer">
              ${icon('code-file', 'footer__icon')}
              <div class="footer__icon-link-content">
                <h2 class="footer__icon-link-heading">Contribute code</h2>
                <p class="mini-meta">Help shape the CLI, widget, and discovery layer.</p>
              </div>
            </a>
          </li>
        </ul>

        <div class="footer__sign-up">
          <div class="footer__sub-footer">
            <div class="footer__socials">
              <p class="footer__social-heading heading-four">Follow&nbsp;us</p>
              <ul class="footer__social-list">
                <li><a href="https://x.com/nibgate" target="_blank" rel="noopener noreferrer" aria-label="Follow Nibgate on X">${icon('twitter', 'footer__social-icon')}</a></li>
                <li><a href="https://github.com/fortunesayspump/nibgate" target="_blank" rel="noopener noreferrer" aria-label="Follow Nibgate on GitHub">${icon('github', 'footer__social-icon footer__social-icon--github')}</a></li>
                <li><a href="mailto:hello@nibgate.xyz" aria-label="Email Nibgate">${icon('envelope', 'footer__social-icon')}</a></li>
              </ul>
            </div>

            ${showThemeToggle ? `<div class="theme-toggle">
              <span class="theme-toggle__label tag-label">Dark</span>
              <button id="nibgate-theme" class="theme-toggle__button" type="button" aria-label="Switch theme"></button>
              <span class="theme-toggle__label tag-label">Light</span>
            </div>` : ''}
          </div>

          <div class="sign-up-form sign-up-form--footer" id="newsletter">
            <div class="sign-up-form__inner">
              <h2 class="sign-up-form__heading heading-three">This Week in Nibgate</h2>
              <p class="sign-up-form__sub-heading">Sign up for product notes, creator examples, and launch updates.</p>
              <form class="sign-up-form__container" action="mailto:hello@nibgate.xyz" method="post">
                <div>
                  <input class="sign-up-form__input" id="email" name="EMAIL" type="email" autocomplete="email" placeholder="Enter your email address" aria-label="Email" required />
                </div>
                <button class="button sign-up-form__button" type="submit">
                  <span class="button__text">Sign up</span>
                  ${icon('arrow', 'arrow')}
                </button>
              </form>
            </div>
          </div>
        </div>

        <p class="footer__credit">Nibgate is an independent project for creator-owned paid routes. <a class="footer__link" href="https://github.com/fortunesayspump/nibgate" target="_blank" rel="noopener noreferrer">View the repo</a>. &copy; 2026</p>
      </div>
    </div>
  </footer>`;
}
