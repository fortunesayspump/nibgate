import { arrowIconDataUri, siteImagePlaceholder, placeholderAvatar } from '../shared/placeholders.js';

const featureAsset = (name) => (
  name === 'arrowhead-right.svg'
    ? arrowIconDataUri('right')
    : siteImagePlaceholder(`features/${name}`)
);
const creatorAsset = (name) => placeholderAvatar(name, { size: 420 });
const exploreOrigin = '/explore';

function offsetAnchor(label, href = exploreOrigin) {
  return `<a class="nibgate-soft-cta" href="${href}">${label}</a>`;
}

function featureIntro({ eyebrow, title, copy }) {
  return `<div class="px-8 pb-24 pt-20 md:px-12 md:pb-32 md:pt-24">
  <div class="mx-auto max-w-5xl">
    <div class="flex flex-col items-start gap-7 text-left md:items-center md:text-center">
      <div class="text-lg font-medium lg:text-xl">${eyebrow}</div>
      <h2 class="text-5xl font-medium md:text-6xl lg:text-7xl xl:text-8xl">${title}</h2>
      <div class="max-w-3xl text-lg md:text-2xl lg:leading-10 xl:text-3xl">${copy}</div>
    </div>
  </div>
</div>`;
}

function featureTextItems(items, color) {
  return `<div class="max-w-2xl space-y-12 md:space-y-16">
  ${items
    .map(
      ([title, copy]) => `<div class="space-y-4">
    <h3 class="text-3xl font-medium ${color} lg:text-4xl xl:text-5xl">${title}</h3>
    <p class="text-lg lg:text-xl xl:text-2xl">${copy}</p>
  </div>`
    )
    .join('')}
</div>`;
}

function splitBand({ image, imageAlt, imageBg, textItems, titleColor, reverse = false, border = 'border-t', extras = '' }) {
  const imageOrder = reverse ? 'lg:order-2' : '';
  return `<div class="flex flex-col overflow-hidden lg:flex-row">
  <div class="flex items-center justify-center ${imageBg} p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 ${imageOrder} xl:p-32">
    <div class="relative max-w-xl">
      <img class="h-auto w-full" data-parallax="true" alt="${imageAlt}" src="${featureAsset(image)}" />
      ${extras}
    </div>
  </div>
  <div class="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
    ${featureTextItems(textItems, titleColor)}
  </div>
</div>`;
}

function creatorSlide({ image, handle, quote, caption }) {
  return `<div class="flex w-full flex-none">
  <div class="w-full flex flex-col bg-gray py-16 lg:flex-row">
    <div class="flex items-center justify-center mb-16 lg:mb-0 lg:w-1/2">
      <div class="relative flex flex-col items-center justify-center">
        <img src="${creatorAsset(image)}" alt="${handle} portrait" class="w-full max-w-xs lg:max-w-sm xl:max-w-xl">
        <a href="${exploreOrigin}" class="nibgate-creator-pill bottom-4 -left-2 md:bottom-8 md:-left-4 lg:bottom-10 lg:left-4 xl:bottom-16 xl:left-12 pl-1 pr-3 py-1">
          <img src="/assets/nibgate/images/logo-g.svg" alt="Nibgate icon" class="w-9 h-9">
          <span class="text-lg font-medium">${handle}</span>
        </a>
      </div>
    </div>
    <div class="px-8 text-left mx-auto flex items-center justify-start md:px-24 md:text-center lg:w-1/2 lg:text-left">
      <div class="max-w-xl grid gap-y-10! md:max-w-2xl lg:max-w-3xl">
        <h2 class="text-2xl md:text-3xl lg:text-4xl">"${quote}"</h2>
        <div class="text-xl font-bold">${caption}</div>
      </div>
    </div>
  </div>
</div>`;
}

export function featuresRouteContent() {
  return `<header class="relative flex flex-col items-center justify-center h-auto bg-gray text-center gap-20 px-8 pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-28 lg:pb-36">
  <div class="flex flex-col max-w-2xl gap-8 lg:gap-10 lg:max-w-3xl">
    <div class="text-xl md:text-2xl">Product features</div>
    <h1 class="text-5xl font-medium md:text-6xl md:leading-[0.9] lg:text-8xl">Built for new beginnings</h1>
    <div class="text-xl md:text-2xl">Nibgate is a powerful, simple toolkit that puts paid content, verification, and discovery tools at your fingertips.</div>
  </div>

  <div class="override hidden relative mx-auto h-96 w-full max-w-6xl overflow-hidden bg-gray p-8 rounded-full border lg:block">
    <div class="relative z-10 flex h-full flex-col justify-between border border-dark-gray/50 bg-gray rounded-full px-8">
      <div class="-mt-3 justify-between px-32 flex">
        ${['Connect Wallet', 'Connect Site', 'Publish Route']
          .map((label) => `<div class="flex h-6 items-center bg-gray pr-6 gap-x-3"><img class="h-6 w-6 -translate-x-3 -translate-y-px" src="${featureAsset('arrowhead-right.svg')}" /><div class="text-xl xl:text-2xl">${label}</div></div>`)
          .join('')}
      </div>
      <div class="flex justify-around space-x-4">
        <img src="${featureAsset('drawing-and-painting.svg')}" />
        <img src="${featureAsset('design-and-tech.svg')}" />
        <img src="${featureAsset('books-and-writing.svg')}" />
        <img src="${featureAsset('games.svg')}" />
      </div>
      <div class="-mb-3 justify-between px-32 flex">
        ${['Repeat', 'Get paid']
          .map((label) => `<div class="flex h-6 items-center bg-gray pl-6 gap-x-3"><div class="text-xl xl:text-2xl">${label}</div><img class="h-6 w-6 translate-x-3 translate-y-px rotate-180" alt="" src="${featureAsset('arrowhead-right.svg')}" /></div>`)
          .join('')}
      </div>
    </div>
  </div>
  <div class="pointer-events-none absolute inset-0 overflow-visible z-10">
    ${['feature-receipt-1.svg', 'feature-receipt-2.svg', 'feature-receipt-3.svg', 'feature-receipt-11.svg', 'feature-receipt-5.svg', 'feature-receipt-4.svg']
      .map((file, index) => `<img class="absolute ${['-left-16 top-0 h-32 w-32 lg:left-24 lg:top-32 lg:h-56 lg:w-56', 'override hidden top-1/2 -left-12 h-56 w-56 lg:block', '-left-24 bottom-0 h-32 w-32 lg:left-20 lg:-bottom-24 lg:h-56 lg:w-56', '-right-24 bottom-0 h-32 w-32 lg:right-64 lg:-bottom-24 lg:h-48 lg:w-48', 'override hidden top-1/2 right-16 h-48 w-48 lg:block', '-right-20 top-0 h-32 w-32 lg:right-32 lg:top-32 lg:h-48 lg:w-48'][index]}" alt="Feature receipt illustration" src="${featureAsset(file)}" />`)
      .join('')}
  </div>
</header>

${featureIntro({
  eyebrow: 'Customizable Options',
  title: 'Your store, your way',
  copy: 'Nibgate plays well with others. Set up your paid routes on our platform, or easily embed them on your existing site.'
})}

${splitBand({
  image: 'home-feature-4.svg',
  imageAlt: 'Illustration showing customizable store options',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  reverse: true,
  extras: `<img class="absolute -bottom-28 -left-10 w-24 transform-gpu md:-bottom-24 md:-left-32 md:w-44" data-parallax="true" alt="Thumbs up icon" src="${featureAsset('thumbsup.svg')}" />`,
  border: 'border-y',
  textItems: [
    ['Create a home here', 'No site? No problem. Publish gated routes and build a storefront around your work.'],
    ['Use your own website, too', 'Already have a site? Add the package, verify your domain, and keep ownership.'],
    ['Power-up your page', 'Embed unlock flows, paid links, and discovery signals from your existing stack.']
  ]
})}

<div class="relative overflow-hidden">
  <div class="flex transition-transform duration-300 ease-in-out">
    ${[
      ['motionbynick.png', 'motionbynick', 'I like to move fast and test new ideas. Nibgate lets me experiment without managing a complicated store.', 'Nick publishes motion design tutorials'],
      ['stephsmithio.png', 'stephsmithio', 'Nibgate lets creators be creators. It handles unlocks, visibility, and payment flow so you can stick to what you know best.', 'Steph publishes informational courses'],
      ['dvassallo.png', 'dvassallo', 'I upload the work, set a price, and let wallets unlock it from my site. The product stays simple.', 'Daniel publishes entrepreneurial courses and tools'],
      ['boringbotlab.png', 'boringbotlab', 'Nibgate makes it easier to publish digital products online and gives creators the surface they need to grow.', 'Setu publishes Cinema4D material packs']
    ].map(([image, handle, quote, caption]) => creatorSlide({ image, handle, quote, caption })).join('')}
  </div>
</div>

${featureIntro({
  eyebrow: 'Payment Integrations',
  title: 'Money, incoming',
  copy: "Once your wallet and site are connected, paid routes can unlock with normal crypto-native checkout."
})}

${splitBand({
  image: 'features-3.svg',
  imageAlt: 'Illustration showing payment integrations',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  textItems: [
    ['Create simple memberships', "Give customers access to paid content for as long as they're subscribed."],
    ['Set up subscriptions', 'Let customers pay over time with recurring access.'],
    ["The sky's the limit", 'Give your audience the chance to pay for the work they value.']
  ]
})}

${splitBand({
  image: 'features-4.svg',
  imageAlt: 'Illustration showing payment integrations',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  reverse: true,
  textItems: [
    ['Say yes to different currencies', 'Increase opportunities by accepting payments from a broader audience.'],
    ["Don't sweat verification", 'Use manifests and site verification so the hub can trust what is live.']
  ]
})}

${splitBand({
  image: 'features-5.svg',
  imageAlt: 'Illustration showing license keys',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  border: 'border-y',
  textItems: [
    ['Generate access', 'Publishing software or private routes? Nibgate can protect what buyers unlock.'],
    ['Offer multiple versions', 'Offer different paid formats, tiers, or route bundles.'],
    ['Protect your work', 'Keep paid content behind a real unlock flow and make access auditable.']
  ]
})}

${featureIntro({
  eyebrow: 'Comprehensive Platform',
  title: 'From start to finesse',
  copy: 'A package, app, examples, and discovery layer so you can connect a wallet and publish paid routes quickly.'
})}

${splitBand({
  image: 'features-6.svg',
  imageAlt: 'Illustration showing various creator tools and features',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  extras: `<img alt="Easy sticker with handwritten text" class="absolute -right-10 -top-10 w-32 transform-gpu md:w-36" data-parallax="true" src="${featureAsset('easy.svg')}" /><img alt="Decorative price tag sticker" class="absolute -bottom-10 -left-10 w-40 transform-gpu md:w-48" data-parallax="true" src="${featureAsset('price-tag.svg')}" />`,
  textItems: [
    ['Tools to get going fast', 'Create paid routes quickly or embed the Nibgate package onto an existing site.'],
    ['Publish anything', "We don't limit your ideas. Articles, files, tools, APIs, or memberships can all fit."],
    ['Bring your friends', 'Route your existing audience to a familiar domain and let the hub amplify what is public.']
  ]
})}

${splitBand({
  image: 'sales-graph.svg',
  imageAlt: 'Interactive graph showing sales analytics and growth metrics',
  imageBg: 'bg-gray',
  titleColor: 'text-white',
  reverse: true,
  extras: `<img alt="Decorative clapping hands sticker" class="absolute -bottom-24 -right-8 w-32 transform-gpu sm:-bottom-20 sm:-right-20 sm:w-52 md:-bottom-24 md:-right-24 lg:-bottom-24 lg:-right-24" data-parallax="true" src="${featureAsset('clapping.svg')}" />`,
  textItems: [
    ['Be ready when they are', 'Customers can unlock the thing they came for without weird detours.'],
    ['Make decisions with your data', 'See routes, views, unlocks, and public discovery signals in one place.'],
    ['Grow your audience', 'Publish updates, surface paid routes, and connect people back to creator-owned work.']
  ]
})}

<div class="flex flex-col items-center justify-center text-center bg-gray gap-8 px-8 py-16 lg:px-[4vw] lg:py-24 lg:gap-16">
  <h2 class="text-4xl font-medium sm:text-5xl lg:text-7xl">
    Share your work. <br> Someone out there needs it.
  </h2>
  ${offsetAnchor('Connect your site', '/get-started')}
</div>`;
}

const posts = [
  ['You can now unlock creator work with one click', 'June 18, 2026', 'Product'],
  ['Shoppers now see paid routes in their local context', 'June 4, 2026', 'Explore'],
  ['How we use verification to keep the hub trustworthy', 'April 1, 2026', 'Engineering'],
  ["What we shipped, what's next, and our 2026 roadmap", 'March 3, 2026', 'Company'],
  ['New Feature: Creator analytics for better membership insights', 'February 4, 2026', 'Product'],
  ['Automatically apply launch discounts to paid drops', 'January 31, 2026', 'Growth'],
  ['Customizable receipts and post-unlock messages', 'January 13, 2026', 'Product'],
  ['Introducing: Nibgate Tax Center', 'December 22, 2025', 'Company'],
  ['Featuring launch deals on the Nibgate hub', 'November 27, 2025', 'Explore'],
  ['Creator spotlight: how a side project became paid content', 'April 23, 2025', 'Creators'],
  ['Nibgate is open source', 'April 4, 2025', 'Company'],
  ['A trip down Nibgate: the road ahead', 'March 27, 2025', 'Company']
];

function blogPost([title, date, tag], index) {
  const featured = index === 0;
  return `<a href="/blog" class="group no-underline text-black border border-dark-gray/50 bg-white hover:bg-gray transition-colors ${featured ? 'lg:col-span-2' : ''}">
  <article class="flex h-full flex-col justify-between gap-10 p-6 md:p-8 ${featured ? 'min-h-[28rem]' : 'min-h-72'}">
    <div class="flex items-center justify-between gap-4 text-base">
      <span>${tag}</span>
      <span>${date}</span>
    </div>
    <h2 class="${featured ? 'text-5xl md:text-6xl lg:text-7xl' : 'text-3xl md:text-4xl'} font-medium leading-none text-balance">${title}</h2>
    <div class="flex items-center gap-2 text-xl font-medium">
      <span>Read post</span>
      <span class="transition-transform group-hover:translate-x-1">→</span>
    </div>
  </article>
</a>`;
}

export function blogRouteContent() {
  return `<section class="bg-gray px-8 py-16 md:py-24 lg:px-[4vw]">
  <div class="mx-auto max-w-6xl">
    <h1 class="text-6xl font-medium leading-none md:text-8xl lg:text-[11rem]">Blog</h1>
  </div>
</section>
<section class="bg-gray px-4 py-8 md:px-8 md:py-12 lg:px-[4vw]">
  <div class="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2">
    ${posts.map(blogPost).join('')}
  </div>
</section>`;
}

export function getStartedRouteContent() {
  return `<section class="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
  <div class="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
    <div class="space-y-8">
      <div class="text-xl font-medium">Connect your site</div>
      <h1 class="max-w-3xl text-6xl font-medium leading-none md:text-7xl lg:text-8xl">Install the package, protect a route, and publish to Explore.</h1>
      <p class="max-w-2xl text-xl leading-8 md:text-2xl md:leading-9">Nibgate starts on your own domain. Connect a wallet, expose a route manifest, and let people unlock paid content without moving your work into a marketplace.</p>
      <div class="flex flex-wrap gap-4">
        <button type="button" data-wallet-connect class="nibgate-soft-cta border-none cursor-pointer">Connect wallet</button>
        <a href="/features" class="nibgate-soft-cta nibgate-soft-cta-secondary">View features</a>
      </div>
    </div>
    <div class="grid gap-4">
      ${[
        ['1', 'Install Nibgate', 'Run npm install nibgate in the project that owns your content.'],
        ['2', 'Define paid routes', 'Choose writing, media, downloads, or agent-readable endpoints and set the price.'],
        ['3', 'Verify ownership', 'Publish the manifest and verification file from your own domain.'],
        ['4', 'Appear in Explore', 'Send signed popularity and unlock events so the public hub can reflect what is live.']
      ].map(([step, title, copy]) => `<article class="bg-white p-6 md:p-8">
        <div class="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white text-lg font-medium text-black">${step}</div>
        <h2 class="mb-3 text-3xl font-medium md:text-4xl">${title}</h2>
        <p class="text-lg leading-8">${copy}</p>
      </article>`).join('')}
    </div>
  </div>
</section>`;
}

export function signinRouteContent() {
  return `<section class="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
  <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
    <div class="space-y-8">
      <div class="text-xl font-medium">Wallet identity</div>
      <h1 class="max-w-3xl text-6xl font-medium leading-none md:text-7xl lg:text-8xl">Connect a wallet to manage what people unlock.</h1>
      <p class="max-w-2xl text-xl leading-8 md:text-2xl md:leading-9">Nibgate will use your wallet as the creator identity for site manifests, Arc testnet payment setup, route analytics, and Explore presence.</p>
      <div class="flex flex-wrap gap-4">
        <a href="/get-started" class="nibgate-soft-cta">Connect your site</a>
        <a href="/explore" class="nibgate-soft-cta nibgate-soft-cta-secondary">Browse Explore</a>
      </div>
    </div>
    <div class="nibgate-signin-panel bg-graylack p-6 text-white md:p-8">
      <div class="nibgate-signin-panel-inner space-y-5 bg-white/10 p-6">
        <div class="space-y-2">
          <p class="text-sm font-medium uppercase tracking-[0.08em] text-white/70">Creator wallet</p>
          <p class="text-xl leading-8">Connect the wallet that should own your Nibgate creator profile.</p>
        </div>
        <button class="nibgate-signin-button w-full bg-black text-white px-5 py-4 text-lg font-medium text-black" type="button" data-wallet-connect>Connect wallet</button>
        <p class="text-sm leading-6 text-white/70" data-wallet-status>Use a wallet-enabled browser. Full creator dashboard actions will unlock after wallet identity is connected.</p>
      </div>
    </div>
  </div>
</section>`;
}

const navLinks = [
  { name: 'Profile', path: '#profile', id: 'profile' },
  { name: 'Sites', path: '#sites', id: 'sites' },
  { name: 'Contents', path: '#contents', id: 'contents' },
  { name: 'Analytics', path: '#analytics', id: 'analytics' },
  { name: 'Earnings', path: '#earnings', id: 'earnings' }
];

const bottomLinks = [];

export function dashboardRouteContent() {
  return `
  <style>
    /* Hide the global footer and lock window scroll for the app-like dashboard layout */
    .nibgate-site-footer { display: none !important; }
    body { overflow: hidden; }
  </style>
  <div class="flex flex-1 flex-col lg:flex-row h-[calc(100vh-80px)] border-t" style="background: var(--nib-page-bg); color: var(--nib-page-fg); border-color: var(--nib-border-soft);">
    <!-- Sidebar -->
    <nav aria-label="Main" class="flex flex-col dashboard-sidebar lg:w-48" style="background: var(--nib-page-bg);">
      ${[
        ...navLinks.map((link, index) => `
          <a title="${link.name}" href="${link.path}" class="dashboard-box box-${index} flex-1 no-underline w-full h-full" data-tab="${link.id}">
            <span>${link.name}</span>
          </a>
        `)
      ].join('')}
    </nav>

    <!-- Main Content -->
    <main class="flex flex-col overflow-y-auto dashboard-main-content" style="background: var(--nib-page-bg);">
      
      <!-- Sites Panel -->
      <div id="panel-sites" class="dashboard-panel active p-4 md:p-8 space-y-12">
        <section class="space-y-6">
          <h2 class="text-3xl font-medium">Register a New Website</h2>
          <div class="border p-8 rounded-2xl shadow-1" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
            <form id="register-site-form" class="space-y-4 max-w-xl">
              <div>
                <label class="block text-sm font-medium mb-1">Domain Name</label>
                <input type="text" id="site-domain" placeholder="e.g., photos.clinton.com" required class="w-full p-3 border rounded bg-transparent" style="border-color: var(--nib-border-soft); color: var(--nib-page-fg);">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Display Name</label>
                <input type="text" id="site-name" placeholder="e.g., Clinton's Portfolio" required class="w-full p-3 border rounded bg-transparent" style="border-color: var(--nib-border-soft); color: var(--nib-page-fg);">
              </div>
              <button type="submit" class="bg-black text-white px-6 py-3 font-medium cursor-pointer rounded">Register Website</button>
              <div id="register-error" class="text-red-500 text-sm mt-2 hidden"></div>
            </form>
          </div>
        </section>

        <section class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-3xl font-medium">Your Registered Sites</h2>
            <button onclick="loadSites()" class="font-medium hover:underline cursor-pointer border-none bg-transparent" style="color: var(--nib-page-fg);">Refresh</button>
          </div>
          <div id="sites-list" class="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
            <!-- Dynamic Content -->
            <p style="color: var(--nib-page-muted);">Loading your sites...</p>
          </div>
        </section>
      </div>

      <!-- Profile Panel -->
      <div id="panel-profile" class="dashboard-panel p-4 md:p-8 space-y-6 hidden">
        <div class="flex items-center justify-between">
          <h2 class="text-3xl font-medium">Creator Profile</h2>
          <button class="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer">Save Changes</button>
        </div>
        <div class="border p-8 rounded-2xl shadow-1 space-y-8" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
          <div class="flex items-center gap-6">
            <div class="w-24 h-24 rounded-full bg-gray-200 border-2 overflow-hidden flex items-center justify-center text-gray-500 text-sm">Avatar</div>
            <button class="px-4 py-2 border rounded font-medium hover:opacity-70 cursor-pointer" style="border-color: var(--nib-border-soft);">Upload New Avatar</button>
          </div>
          <div class="space-y-4 max-w-xl">
            <div>
              <label class="block text-sm font-medium mb-1">Display Name</label>
              <input type="text" value="Clinton" class="w-full p-3 border rounded bg-transparent" style="border-color: var(--nib-border-soft); color: var(--nib-page-fg);">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Bio</label>
              <textarea rows="3" class="w-full p-3 border rounded bg-transparent" placeholder="Tell your audience about yourself..." style="border-color: var(--nib-border-soft); color: var(--nib-page-fg);"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Connected Wallet</label>
              <input type="text" value="0x8f7b...3c2a" readonly class="w-full p-3 border rounded bg-transparent opacity-50" style="border-color: var(--nib-border-soft); color: var(--nib-page-fg);">
            </div>
          </div>
        </div>
      </div>

      <!-- Contents Panel -->
      <div id="panel-contents" class="dashboard-panel p-4 md:p-8 space-y-6 hidden">
        <div class="flex items-center justify-between">
          <h2 class="text-3xl font-medium">Your Contents</h2>
          <button class="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer">Sync Manifest</button>
        </div>
        <div class="border rounded-2xl shadow-1 overflow-hidden" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b text-sm opacity-80" style="border-color: var(--nib-border-soft);">
                <th class="p-4 font-medium">Item</th>
                <th class="p-4 font-medium">Type</th>
                <th class="p-4 font-medium">Price</th>
                <th class="p-4 font-medium text-right">Unlocks</th>
              </tr>
            </thead>
            <tbody class="text-base divide-y" style="border-color: var(--nib-border-soft);">
              <tr class="hover:opacity-70 transition-colors">
                <td class="p-4 font-medium">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gray-200 rounded"></div>
                    Advanced Photography Setup
                  </div>
                </td>
                <td class="p-4">Article</td>
                <td class="p-4">1.50 USDC</td>
                <td class="p-4 text-right">42</td>
              </tr>
              <tr class="hover:opacity-70 transition-colors">
                <td class="p-4 font-medium">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gray-200 rounded"></div>
                    Wedding Presets Vol 1
                  </div>
                </td>
                <td class="p-4">Download</td>
                <td class="p-4">15.00 USDC</td>
                <td class="p-4 text-right">128</td>
              </tr>
              <tr class="hover:opacity-70 transition-colors">
                <td class="p-4 font-medium">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gray-200 rounded"></div>
                    Behind the Scenes Video
                  </div>
                </td>
                <td class="p-4">Video</td>
                <td class="p-4">5.00 USDC</td>
                <td class="p-4 text-right">16</td>
              </tr>
            </tbody>
          </table>
          <div class="p-4 text-center text-sm opacity-60 border-t" style="border-color: var(--nib-border-soft);">
            These items are automatically synced from your verified websites.
          </div>
        </div>
      </div>

      <!-- Analytics Panel -->
      <div id="panel-analytics" class="dashboard-panel p-4 md:p-8 space-y-6 hidden">
        <h2 class="text-3xl font-medium">Deep Analytics</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="border p-6 rounded-2xl shadow-1" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
            <div class="text-sm opacity-70 mb-2 font-medium">Total Views</div>
            <div class="text-4xl font-bold">12,405</div>
            <div class="text-green-500 text-sm mt-2 font-medium">↑ 14% this week</div>
          </div>
          <div class="border p-6 rounded-2xl shadow-1" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
            <div class="text-sm opacity-70 mb-2 font-medium">Unlock Rate</div>
            <div class="text-4xl font-bold">4.2%</div>
            <div class="text-green-500 text-sm mt-2 font-medium">↑ 1.1% this week</div>
          </div>
          <div class="border p-6 rounded-2xl shadow-1" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
            <div class="text-sm opacity-70 mb-2 font-medium">Top Traffic Source</div>
            <div class="text-2xl font-bold mt-2">Explore Page</div>
            <div class="text-gray-500 text-sm mt-2 font-medium">68% of volume</div>
          </div>
        </div>
        <div class="border p-8 rounded-2xl shadow-1 h-64 flex items-center justify-center text-gray-400" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
          [ Interactive Chart Area Placeholder ]
        </div>
      </div>

      <!-- Earnings Panel -->
      <div id="panel-earnings" class="dashboard-panel p-4 md:p-8 space-y-6 hidden">
        <div class="flex items-center justify-between">
          <h2 class="text-3xl font-medium">Earnings & Payouts</h2>
          <button class="bg-black text-white px-6 py-2 font-medium rounded cursor-pointer shadow-md transform hover:-translate-y-px transition">Withdraw USDC</button>
        </div>
        <div class="border p-10 rounded-2xl shadow-1 text-center space-y-4" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
          <div class="text-sm font-medium uppercase tracking-widest opacity-60">Available Balance</div>
          <div class="text-6xl md:text-8xl font-bold tracking-tighter">2,053.00 <span class="text-3xl opacity-50">USDC</span></div>
          <div class="text-sm opacity-70">Ready to withdraw to your connected wallet instantly on X402 Network.</div>
        </div>
        <h3 class="text-xl font-medium pt-4">Recent Transactions</h3>
        <div class="border rounded-2xl shadow-1 overflow-hidden" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
          <div class="p-4 border-b flex justify-between items-center hover:opacity-70" style="border-color: var(--nib-border-soft);">
            <div>
              <div class="font-medium">Unlock: Wedding Presets Vol 1</div>
              <div class="text-sm opacity-60">Today, 2:45 PM</div>
            </div>
            <div class="font-medium text-green-600">+15.00 USDC</div>
          </div>
          <div class="p-4 border-b flex justify-between items-center hover:opacity-70" style="border-color: var(--nib-border-soft);">
            <div>
              <div class="font-medium">Unlock: Advanced Photography Setup</div>
              <div class="text-sm opacity-60">Today, 11:20 AM</div>
            </div>
            <div class="font-medium text-green-600">+1.50 USDC</div>
          </div>
          <div class="p-4 flex justify-between items-center hover:opacity-70">
            <div>
              <div class="font-medium">Withdrawal</div>
              <div class="text-sm opacity-60">Yesterday, 9:00 AM</div>
            </div>
            <div class="font-medium text-gray-500">-500.00 USDC</div>
          </div>
        </div>
      </div>

    </main>
  </div>
  <script>
    (function() {
      function switchTab() {
        const hash = window.location.hash || '#profile';
        const id = hash.replace('#', '');
        
        // Hide all panels
        document.querySelectorAll('.dashboard-panel').forEach(panel => {
          panel.classList.remove('active');
          panel.classList.add('hidden');
        });
        
        // Show target panel
        const targetPanel = document.getElementById('panel-' + id);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
          targetPanel.classList.add('active');
        }

        // Update active sidebar tab class
        document.querySelectorAll('.dashboard-sidebar a').forEach(tab => {
          if (tab.getAttribute('data-tab') === id) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });
      }

      window.addEventListener('hashchange', switchTab);
      switchTab();

      // Dashboard App Logic
      window.loadSites = async function() {
        const container = document.getElementById('sites-list');
        try {
          const res = await fetch('/api/hub/sites');
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Failed to load');
          
          if (data.websites.length === 0) {
            container.innerHTML = '<p>You have not registered any websites yet.</p>';
            return;
          }

          container.innerHTML = data.websites.map(site => \`
            <div class="border rounded-2xl shadow-1 overflow-hidden space-y-0" style="background: var(--nib-surface); border-color: var(--nib-border-soft);">
              
              \${site.ogImageUrl ? \`<div class="h-32 w-full bg-cover bg-center" style="background-image: url('\${site.ogImageUrl}')"></div>\` : \`<div class="h-16 w-full bg-gray-100 border-b"></div>\`}
              
              <div class="p-6 space-y-4">
                <div class="flex justify-between items-start">
                  <div class="flex items-center gap-3">
                    \${site.faviconUrl ? \`<img src="\${site.faviconUrl}" class="w-8 h-8 rounded bg-white shadow-sm" alt="favicon" />\` : ''}
                    <div>
                      <h3 class="text-2xl font-medium">\${site.name}</h3>
                      <a href="https://\${site.domain}" target="_blank" class="text-blue-500 hover:underline">\${site.domain}</a>
                    </div>
                  </div>
                  <span class="px-3 py-1 rounded-full text-sm font-medium \${site.isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    \${site.isVerified ? 'Verified' : 'Pending'}
                  </span>
                </div>
                
                \${site.description ? \`<p class="text-sm opacity-80 border-l-2 pl-3" style="border-color: var(--nib-border-soft);">\${site.description}</p>\` : ''}
                
                <div class="grid grid-cols-2 gap-4 pt-4 border-t" style="border-color: var(--nib-border-soft);">
                  <div>
                    <div class="text-sm font-medium opacity-70">Indexed Items</div>
                    <div class="text-xl font-medium">\${site._count.content || 0}</div>
                  </div>
                </div>

                \${!site.isVerified ? \`
                  <div class="bg-gray p-4 rounded mt-4 space-y-3">
                    <p class="text-sm font-medium">Action Required: Verify Domain</p>
                    <p class="text-sm opacity-80">1. Place the following text in a file on your server.</p>
                    <div class="bg-white p-2 border rounded font-mono text-xs break-all">\${site.verifyToken}</div>
                    <p class="text-sm opacity-80">2. Ensure it is accessible at:<br/><code>https://\${site.domain}/.well-known/nibgate-verify.txt</code></p>
                    <button onclick="verifySite('\${site.id}')" class="mt-2 bg-black text-white px-4 py-2 text-sm rounded w-full cursor-pointer hover:bg-gray-800">Verify Now</button>
                  </div>
                \` : \`
                  <div class="bg-gray p-4 rounded mt-4 space-y-2">
                    <p class="text-sm font-medium">API Site Token</p>
                    <p class="text-sm opacity-80">Use this Bearer token to authenticate sync requests.</p>
                    <div class="relative">
                      <input type="password" value="\${site.siteToken}" readonly class="w-full bg-white p-2 border rounded font-mono text-xs" />
                      <button onclick="this.previousElementSibling.type='text'" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-gray-200 px-2 py-1 rounded cursor-pointer">Reveal</button>
                    </div>
                  </div>
                \`}
              </div>
            </div>
          \`).join('');
        } catch (err) {
          container.innerHTML = \`<p class="text-red-500">Error: \${err.message}</p>\`;
        }
      };

      window.verifySite = async function(websiteId) {
        try {
          const res = await fetch('/api/hub/site/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ websiteId })
          });
          const data = await res.json();
          if (data.success) {
            alert('Domain verified successfully!');
            loadSites();
          } else {
            alert('Verification failed: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Network error during verification');
        }
      };

      const form = document.getElementById('register-site-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errDiv = document.getElementById('register-error');
          errDiv.classList.add('hidden');
          
          const payload = {
            domain: document.getElementById('site-domain').value,
            name: document.getElementById('site-name').value
          };
          
          try {
            const res = await fetch('/api/hub/site/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
              form.reset();
              loadSites();
            } else {
              errDiv.textContent = data.error || 'Failed to register';
              errDiv.classList.remove('hidden');
            }
          } catch (err) {
            errDiv.textContent = 'Network error';
            errDiv.classList.remove('hidden');
          }
        });
      }

      // Check if logged in before loading
      if (window.nibgateAuthenticated !== false) {
          setTimeout(loadSites, 500); // Wait for auth state to settle
      }
    })();
  </script>`;
}
