import { arrowIconDataUri, marketingImagePlaceholder, placeholderAvatar } from '../shared/placeholders.js';

const featureAsset = (name) => (
  name === 'arrowhead-right.svg'
    ? arrowIconDataUri('right')
    : marketingImagePlaceholder(`features/${name}`)
);
const creatorAsset = (name) => placeholderAvatar(name, { size: 420 });
const exploreOrigin = process.env.EXPLORE_ORIGIN || 'http://localhost:3001';

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
  <div class="w-full flex flex-col bg-pink py-16 lg:flex-row">
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
  return `<header class="relative flex flex-col items-center justify-center h-auto bg-yellow text-center gap-20 px-8 pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-28 lg:pb-36">
  <div class="flex flex-col max-w-2xl gap-8 lg:gap-10 lg:max-w-3xl">
    <div class="text-xl md:text-2xl">Product features</div>
    <h1 class="text-5xl font-medium md:text-6xl md:leading-[0.9] lg:text-8xl">Built for new beginnings</h1>
    <div class="text-xl md:text-2xl">Nibgate is a powerful, simple toolkit that puts paid content, verification, and discovery tools at your fingertips.</div>
  </div>

  <div class="override hidden relative mx-auto h-96 w-full max-w-6xl overflow-hidden bg-pink p-8 rounded-full border lg:block">
    <div class="relative z-10 flex h-full flex-col justify-between border border-black bg-pink rounded-full px-8">
      <div class="-mt-3 justify-between px-32 flex">
        ${['Open Account', 'Add Product', 'Start Selling']
          .map((label) => `<div class="flex h-6 items-center bg-pink pr-6 gap-x-3"><img class="h-6 w-6 -translate-x-3 -translate-y-px" src="${featureAsset('arrowhead-right.svg')}" /><div class="text-xl xl:text-2xl">${label}</div></div>`)
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
          .map((label) => `<div class="flex h-6 items-center bg-pink pl-6 gap-x-3"><div class="text-xl xl:text-2xl">${label}</div><img class="h-6 w-6 translate-x-3 translate-y-px rotate-180" alt="" src="${featureAsset('arrowhead-right.svg')}" /></div>`)
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
  imageBg: 'bg-orange',
  titleColor: 'text-orange',
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
      ['motionbynick.png', 'motionbynick', 'I like to move fast and test new ideas. Nibgate lets me experiment without managing a complicated store.', 'Nick sells motion design tutorials'],
      ['stephsmithio.png', 'stephsmithio', 'Nibgate lets creators be creators. It handles unlocks, visibility, and payment flow so you can stick to what you know best.', 'Steph sells informational courses'],
      ['dvassallo.png', 'dvassallo', 'I upload the work, set a price, and start selling on the internet. The product stays simple.', 'Daniel sells entrepreneurial courses and tools'],
      ['boringbotlab.png', 'boringbotlab', 'Nibgate makes it easier to sell digital products online and gives sellers the surface they need to grow.', 'Setu sells Cinema4D material packs']
    ].map(([image, handle, quote, caption]) => creatorSlide({ image, handle, quote, caption })).join('')}
  </div>
</div>

${featureIntro({
  eyebrow: 'Payment Integrations',
  title: 'Money, incoming',
  copy: "Once you get set up, it's easy to ring the register. Here's how you can sell and get paid, fast."
})}

${splitBand({
  image: 'features-3.svg',
  imageAlt: 'Illustration showing payment integrations',
  imageBg: 'bg-purple',
  titleColor: 'text-purple',
  textItems: [
    ['Create simple memberships', "Give customers access to paid content for as long as they're subscribed."],
    ['Set up subscriptions', 'Let customers pay over time with recurring access.'],
    ["The sky's the limit", 'Give your audience the chance to pay for the work they value.']
  ]
})}

${splitBand({
  image: 'features-4.svg',
  imageAlt: 'Illustration showing payment integrations',
  imageBg: 'bg-purple',
  titleColor: 'text-purple',
  reverse: true,
  textItems: [
    ['Say yes to different currencies', 'Increase opportunities by accepting payments from a broader audience.'],
    ["Don't sweat verification", 'Use manifests and site verification so the hub can trust what is live.']
  ]
})}

${splitBand({
  image: 'features-5.svg',
  imageAlt: 'Illustration showing license keys',
  imageBg: 'bg-purple',
  titleColor: 'text-purple',
  border: 'border-y',
  textItems: [
    ['Generate access', 'Selling software or private routes? Nibgate can protect what buyers unlock.'],
    ['Sell multiple versions', 'Offer different paid formats, tiers, or route bundles.'],
    ['Protect your work', 'Keep paid content behind a real unlock flow and make access auditable.']
  ]
})}

${featureIntro({
  eyebrow: 'Comprehensive Platform',
  title: 'From start to finesse',
  copy: 'A package, app, examples, and discovery layer so you can start selling in seconds.'
})}

${splitBand({
  image: 'features-6.svg',
  imageAlt: 'Illustration showing various creator tools and features',
  imageBg: 'bg-orange',
  titleColor: 'text-orange',
  extras: `<img alt="Easy sticker with handwritten text" class="absolute -right-10 -top-10 w-32 transform-gpu md:w-36" data-parallax="true" src="${featureAsset('easy.svg')}" /><img alt="Decorative price tag sticker" class="absolute -bottom-10 -left-10 w-40 transform-gpu md:w-48" data-parallax="true" src="${featureAsset('price-tag.svg')}" />`,
  textItems: [
    ['Tools to get going fast', 'Create paid routes quickly or embed the Nibgate package onto an existing site.'],
    ['Sell anything', "We don't limit your ideas. Articles, files, tools, APIs, or memberships can all fit."],
    ['Bring your friends', 'Route your existing audience to a familiar domain and let the hub amplify what is public.']
  ]
})}

${splitBand({
  image: 'sales-graph.svg',
  imageAlt: 'Interactive graph showing sales analytics and growth metrics',
  imageBg: 'bg-yellow',
  titleColor: 'text-orange',
  reverse: true,
  extras: `<img alt="Decorative clapping hands sticker" class="absolute -bottom-24 -right-8 w-32 transform-gpu sm:-bottom-20 sm:-right-20 sm:w-52 md:-bottom-24 md:-right-24 lg:-bottom-24 lg:-right-24" data-parallax="true" src="${featureAsset('clapping.svg')}" />`,
  textItems: [
    ['Be ready when they are', 'Customers can unlock the thing they came for without weird detours.'],
    ['Make decisions with your data', 'See routes, views, unlocks, and public discovery signals in one place.'],
    ['Grow your audience', 'Publish updates, surface paid routes, and connect people back to creator-owned work.']
  ]
})}

<div class="flex flex-col items-center justify-center text-center bg-pink gap-8 px-8 py-16 lg:px-[4vw] lg:py-24 lg:gap-16">
  <h2 class="text-4xl font-medium sm:text-5xl lg:text-7xl">
    Share your work. <br> Someone out there needs it.
  </h2>
  ${offsetAnchor('Start selling')}
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
  return `<a href="/blog" class="group no-underline text-black border border-black bg-white hover:bg-pink transition-colors ${featured ? 'lg:col-span-2' : ''}">
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
  return `<section class="bg-yellow px-8 py-16 md:py-24 lg:px-[4vw]">
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
