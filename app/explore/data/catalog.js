import { creatorAvatar, featuredArt, marketArt } from '../assets.js';

export const categories = [
  ['All'],
  ['Drawing & Painting', 'All Drawing & Painting', 'Artwork and Commissions', 'Digital Illustration', 'Traditional Art'],
  ['3D', 'All 3D', '3D Models', 'Textures', 'VRChat'],
  ['Design', 'All Design', 'Fonts', 'Mockups', 'UI Kits'],
  ['Music & Sound Design', 'All Music & Sound Design', 'Ableton', 'Sample Packs', 'Sound Effects'],
  ['Films', 'All Films', 'After Effects', 'LUTs', 'Stock Footage'],
  ['Self Improvement', 'All Self Improvement', 'Fitness', 'Meditation', 'Productivity'],
  ['Software Development', 'All Software Development', 'Apps', 'Code', 'Programming'],
  ['Education', 'All Education', 'Courses', 'Workbooks', 'Certification Exams'],
  ['Business & Money', 'All Business & Money', 'Investing', 'Growth', 'Templates'],
  ['More', 'Writing', 'Comics', 'Photography', 'Games']
];

export const sortTabs = ['Trending', 'Best Sellers', 'Hot & New'];

export const contentTypes = ['Articles', 'Music', 'Images', 'Video'];

const featuredProductSeeds = [
  {
    type: 'Article',
    title: 'Magic Monthly: Notes for Paid Publishing',
    summary: 'A monthly field guide on building a sharper paid publication without moving your audience off-site.',
    creator: 'Christian Grace',
    price: '£12.99 a month',
    meta: '8 min read',
    unlocks: '390 unlocks'
  },
  {
    type: 'Writing',
    title: 'Atravesando el Desierto',
    summary: 'A longform guide for readers moving through a difficult creative season with more clarity.',
    creator: 'Javier',
    price: '€14.99',
    meta: 'Private essay',
    unlocks: '86 unlocks'
  },
  {
    type: 'Music',
    title: 'Awake: Audiobook Edition',
    summary: 'A spoken audio release on attention, soft lies, and how to think before the feed thinks for you.',
    creator: 'House of El',
    price: '£14.95',
    meta: '2 hr 18 min',
    unlocks: '121 unlocks'
  },
  {
    type: 'Video',
    title: 'The Real Fermentation System',
    summary: 'A focused video course for creating confident ferments with a simple kitchen system.',
    creator: 'David Levitsky',
    price: '$57',
    meta: '42 min video',
    unlocks: '64 unlocks'
  },
  {
    type: 'Article',
    title: 'Hacking with Swift+: Route Notes',
    summary: 'A technical publishing archive for Swift developers who want practical paid programming notes.',
    creator: 'Paul Hudson',
    price: '$20 a month',
    meta: 'Updated weekly',
    unlocks: '297 unlocks',
    topCreator: true
  },
  {
    type: 'Music',
    title: 'GSonic Immersive 1.1.7',
    summary: 'A sound measurement toolkit and audio walkthrough for tuning home cinema spaces.',
    creator: 'S Guer',
    price: '$74.99',
    meta: 'Audio toolkit',
    unlocks: '132 unlocks'
  },
  {
    type: 'Image',
    title: 'Manga Megapack: Brush Studies',
    summary: 'A visual pack for making clean anime-style panels, covers, and production-ready illustration work.',
    creator: 'MANGA BRUSH',
    price: '$0+',
    meta: '3000+ assets',
    unlocks: '517 unlocks'
  },
  {
    type: 'Music',
    title: 'GMaudio Ducker 1.6',
    summary: 'A precise Ableton Live audio utility for clean side-chain movement in creator-made tracks.',
    creator: 'Robert K//Groov Mekanik',
    price: '$18+',
    meta: 'Ableton pack',
    unlocks: '89 unlocks'
  }
];

const marketProductSeeds = [
  ['Writing: The Agent Economy Field Notes', 'Mira Stone', '$8', '11 min read'],
  ['Article: How x402 Changes Paid Content', 'Ayo Labs', '$4', '6 min read'],
  ['Image: Neon Interface Textures', 'Kemi Studio', '$12', '24 images'],
  ['Video: Building a Paid Route in 20 Minutes', 'Nibgate Studio', '$15', '20 min'],
  ['Music: Midnight API Loops', 'Sound Route', '$9', '18 loops'],
  ['Writing: Notes on Independent Publishing', 'Ada Vale', '$6', '9 min read'],
  ['Article: Creator Analytics Without the Noise', 'Northstar Desk', '$5', '7 min read'],
  ['Image: Editorial Cover System', 'Framewell', '$18', '12 covers'],
  ['Video: Launching Your First Premium Drop', 'Launch Room', '$20', '31 min'],
  ['Music: Ambient Checkout Cues', 'Low Signal', '$7', '9 cues'],
  ['Writing: A Small Internet Manifesto', 'June Paper', '$10', 'Essay'],
  ['Article: Payment-Gated APIs for Writers', 'Protocol Press', '$6', '8 min read'],
  ['Image: Grain, Glass, and Gradients', 'Pixel Yard', '$14', '36 images'],
  ['Video: Selling Research as a Product', 'Signal School', '$24', '44 min'],
  ['Music: Creator Intro Stingers', 'Warm Audio Club', '$11', '16 stingers'],
  ['Writing: Paid Essays Starter Kit', 'Longform Supply', '$19', 'Template'],
  ['Article: Designing Content Licenses', 'Rights Lab', '$5', '5 min read'],
  ['Image: Product Mockup Backdrops', 'Still Goods', '$16', '18 backdrops'],
  ['Video: Founder Updates People Finish', 'Studio Ledger', '$12', '16 min'],
  ['Music: Minimal Podcast Beds', 'Quiet Channel', '$13', '7 tracks'],
  ['Writing: Newsletter Operating Manual', 'Dispatch House', '$17', 'Guide'],
  ['Article: The New Creator Stack', 'Builder Notes', '$7', '10 min read'],
  ['Image: Social Launch Templates', 'Visual Ops', '$15', '20 templates'],
  ['Video: Turning Posts Into Paid Libraries', 'Archive Club', '$22', '28 min'],
  ['Music: Shortform Motion Pack', 'Tempo Goods', '$10', '22 sounds'],
  ['Writing: Research Notes Template', 'Field Desk', '$9', 'Template'],
  ['Article: Pricing Your First Drop', 'Market Letter', '$5', '6 min read'],
  ['Image: Cover Art Starter Set', 'Canvas Room', '$21', '15 covers'],
  ['Video: Premium Tutorial Structure', 'Course Cut', '$18', '24 min'],
  ['Music: Warm Synth Mini Pack', 'Patch Notes', '$12', '12 presets'],
  ['Writing: Subscriber Research Bundle', 'Reader Signal', '$25', 'Bundle'],
  ['Article: Launch Pages That Convert', 'Web Letter', '$8', '9 min read'],
  ['Image: Clean Content Thumbnails', 'Grid Supply', '$13', '30 thumbnails'],
  ['Video: Creator Analytics Walkthrough', 'Metric Studio', '$19', '21 min'],
  ['Music: Soft UI Notification Sounds', 'Interface Audio', '$6', '14 sounds'],
  ['Writing: Private Feed Playbook', 'Membership Works', '$29', 'Playbook']
];

export const wishlists = [
  {
    title: 'free resources god bless',
    creator: 'cal',
    products: '554 products',
    followers: '2.1K followers',
    images: ['01', '02', '03', '04'],
    avatar: '05'
  },
  {
    title: 'Free assets/ avatar ( for more go to my profile)',
    creator: 'Quinn Flora',
    products: '100 products',
    followers: '880 followers',
    images: ['06', '07', '08', '09'],
    avatar: '10'
  },
  {
    title: 'FREEEE',
    creator: 'CookieO3O_VR',
    products: '98 products',
    followers: '524 followers',
    images: ['11', '12', '13', '14'],
    avatar: '15'
  },
  {
    title: 'Free Procreate Brushes',
    copy: 'because I have a problem',
    creator: 'KharmaKhay',
    products: '69 products',
    followers: '659 followers',
    images: ['16', '17', '18', '19'],
    avatar: '20'
  }
];

export const featuredProducts = featuredProductSeeds.map((product) => ({
  ...product,
  image: featuredArt(product.title),
  avatar: creatorAvatar(product.creator)
}));

function normalizeType(type) {
  if (type === 'Image Pack') return 'Image';
  return type;
}

export const marketProducts = marketProductSeeds.map(([rawTitle, creator, price, meta], index) => {
  const [rawType, ...titleParts] = rawTitle.split(': ');
  const title = titleParts.join(': ') || rawTitle;
  const type = normalizeType(rawType);

  return {
    title,
    type,
    creator,
    price,
    meta,
    unlocks: `${34 + ((index * 17) % 140)} unlocks`,
    image: marketArt(rawTitle),
    avatar: creatorAvatar(creator)
  };
});
