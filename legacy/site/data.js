export const exploreOrigin = '/explore';

export const navItems = [
  ['Explore', exploreOrigin],
  ['Blog', '/blog'],
  ['Features', '/features'],
  ['About', '/about']
];

export const siteRoutes = {
  '/blog': {
    title: 'Nibgate Blog',
    eyebrow: 'Blog',
    heading: 'Notes on content, payments, and agent-native publishing.',
    copy:
      'Product updates, implementation notes, and essays about wallet-native paid work on your own domain.',
    cards: [
      ['Launching the hub', 'How installed widgets can make independent sites discoverable.'],
      ['x402 in normal UX', 'What a user should see when a paid route asks for a payment.'],
      ['Creator analytics', 'How we think about public discovery without swallowing creator data.']
    ]
  },
  '/features': {
    title: 'Nibgate Features',
    eyebrow: 'Features',
    heading: 'Everything needed to unlock protected content from your own site.',
    copy:
      'Install the package, define paid routes, verify your site, and let the hub reflect what is live.',
    cards: [
      ['Drop-in widget', 'A tiny script announces the site, records public popularity signals, and points readers to paid routes.'],
      ['Payment gateway', 'x402-compatible unlocks backed by the configured payment provider.'],
      ['Creator hub', 'A centralized place to discover, compare, and route traffic back to creator-owned sites.']
    ]
  },
  '/get-started': {
    title: 'Get Started with Nibgate',
    eyebrow: 'Get started',
    heading: 'Install Nibgate, connect your wallet, and publish your first paid route.',
    copy:
      'Start with the package, define the content you want to gate, then connect your site to the discovery layer when it is ready.',
    cards: [
      ['Install the package', 'Run npm install nibgate in the project that owns your content.'],
      ['Define paid routes', 'Choose writing, media, downloads, or agent-readable endpoints and set the price.'],
      ['Go live', 'Publish from your own domain while Nibgate handles wallet unlocks and discovery signals.']
    ]
  },
  '/signin': {
    title: 'Connect wallet to Nibgate',
    eyebrow: 'Connect wallet',
    heading: 'Manage creator-owned paid routes from your wallet.',
    copy:
      'Connect your wallet, site manifest, Arc testnet payment setup, route analytics, and Explore presence.'
  },
  '/dashboard': {
    title: 'Creator Dashboard - Nibgate',
    eyebrow: 'Dashboard',
    heading: 'Manage your profile and wallet.',
    copy: 'View your connected wallet identity, balances, and registered sites.'
  }
};

export const categoryItems = [
  ['animation.svg', 'blender'],
  ['audio.svg', 'meditation'],
  ['comics.svg', 'comic'],
  ['software.svg', 'notion template'],
  ['design.svg', 'textures'],
  ['drawing.svg', 'procreate'],
  ['animation.svg', '3d model'],
  ['audio.svg', 'hypnosis'],
  ['comics.svg', 'manga'],
  ['software.svg', 'investing'],
  ['design.svg', 'mockup'],
  ['drawing.svg', 'brushes'],
  ['film.svg', 'after effects'],
  ['education.svg', 'education'],
  ['sports.svg', 'fitness'],
  ['writing.svg', 'sci-fi'],
  ['games.svg', 'vrchat'],
  ['music.svg', 'ableton']
];

export const testimonials = [
  {
    name: 'Mira Pages',
    role: 'Sells Procreate brush packs',
    image: 'max-full.png',
    quote:
      'I launched MaxPacks as an experimental side gig; but within 2 years those Procreate brushes were earning more than my 6-figure salary in CG. Leaving in favor of Nibgate enabled me to explore other aspects of my art, develop new hobbies, and finally prioritize my personal life.'
  },
  {
    name: 'Northstar API',
    role: 'Sells content tutorials',
    image: 'steph-full.png',
    quote:
      'For years, I had a goal to develop passive income streams, but struggled to make that a reality. Last year, I started publishing informational products on Nibgate and since then have made $10k+ per month building products that I love.'
  },
  {
    name: 'trendsvc',
    role: 'Sells business insights and expertise',
    image: 'dru-full.png',
    quote:
      'Originally, I took pre-orders for my Trend Reports on Nibgate. But I received... exactly $0. So I changed tactics: I made half of my report free, and the other half paid. Today, 99% of Nibgate revenue is recurring in the form of annual and quarterly subscriptions.'
  },
  {
    name: 'Daniel Vassallo',
    role: 'Sells business insights and expertise',
    image: 'daniel-full.png',
    quote:
      'I love Nibgate because it cannot be any simpler. I upload a file, set a price, and people unlock it from my site. The money I make from my paid routes lands directly in my wallet.'
  }
];
