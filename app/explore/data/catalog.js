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
    title: 'MAGIC MONTHLY by Christian Grace',
    summary: 'Welcome to Magic Monthly by Christian Grace. There are currently over 100 original hard-hitting mag...',
    creator: 'Christian Grace',
    price: '£12.99 a month',
    rating: '4.9',
    reviews: '390'
  },
  {
    title: 'Atravesando el Desierto',
    summary: 'Una guia para quienes ya no pueden seguir dormidos. Formato fisico: https://www.amazon.es/dp/B0GLQ...',
    creator: 'Javier',
    price: '€14.99',
    rating: '4.5',
    reviews: '6'
  },
  {
    title: 'Awake (Audiobook Edition): The Practice of Critical Thinking in an Age of Soft Lies',
    summary: 'Are you reacting, or are you thinking? In an age of algorithmic outrage, soft lies, and constant d...',
    creator: 'House of El',
    price: '£14.95',
    rating: '4.6',
    reviews: '7'
  },
  {
    title: 'The Real Fermentation System',
    summary: 'Bold Flavor. Real Gut Health. Zero Guesswork. Create confident ferments with a simple kitchen system...',
    creator: 'David Levitsky',
    price: '$57',
    rating: '5.0',
    reviews: '6'
  },
  {
    title: 'Hacking with Swift+',
    summary: 'The ultimate investment for your Swift programming career! Hacking with Swift+ is a subscription s...',
    creator: 'Paul Hudson',
    price: '$20 a month',
    rating: '4.9',
    reviews: '297',
    topCreator: true
  },
  {
    title: 'GSonic Immersive version 1.1.7 - 11 June 2026',
    summary: 'GSonic Immersive is a home cinema measurement tool that can capture impulse responses for every...',
    creator: 'S Guer',
    price: '$74.99',
    rating: '5.0',
    reviews: '30'
  },
  {
    title: 'MANGA MEGAPACK - 3000+ Anime-Style Brushes',
    summary: 'The ultimate brush pack for Procreate, Clip Studio Paint and Photoshop. Create clean, professional...',
    creator: 'MANGA BRUSH',
    price: '$0+',
    rating: '4.9',
    reviews: '17'
  },
  {
    title: 'GMaudio Ducker 1.6',
    summary: 'GMaudio Ducker is the only sample accurate side-chain tool for Ableton Live. Designed for ease of...',
    creator: 'Robert K//Groov Mekanik',
    price: '$18+',
    rating: '4.9',
    reviews: '89'
  }
];

const marketProductSeeds = [
  ['Writing: The Agent Economy Field Notes', 'Mira Stone', '$8', '4.8', '91'],
  ['Article: How x402 Changes Paid Content', 'Ayo Labs', '$4', '4.9', '47'],
  ['Image Pack: Neon Interface Textures', 'Kemi Studio', '$12', '4.7', '63'],
  ['Video: Building a Paid Route in 20 Minutes', 'Nibgate Studio', '$15', '5.0', '34'],
  ['Music: Midnight API Loops', 'Sound Route', '$9', '4.8', '118'],
  ['Writing: Notes on Independent Publishing', 'Ada Vale', '$6', '4.6', '39'],
  ['Article: Creator Analytics Without the Noise', 'Northstar Desk', '$5', '4.9', '52'],
  ['Image: Editorial Cover System', 'Framewell', '$18', '5.0', '28'],
  ['Video: Launching Your First Premium Drop', 'Launch Room', '$20', '4.8', '74'],
  ['Music: Ambient Checkout Cues', 'Low Signal', '$7', '4.7', '43'],
  ['Writing: A Small Internet Manifesto', 'June Paper', '$10', '4.9', '86'],
  ['Article: Payment-Gated APIs for Writers', 'Protocol Press', '$6', '4.8', '58'],
  ['Image Pack: Grain, Glass, and Gradients', 'Pixel Yard', '$14', '4.9', '102'],
  ['Video: Selling Research as a Product', 'Signal School', '$24', '4.8', '69'],
  ['Music: Creator Intro Stingers', 'Warm Audio Club', '$11', '4.6', '37'],
  ['Writing: Paid Essays Starter Kit', 'Longform Supply', '$19', '5.0', '44'],
  ['Article: Designing Content Licenses', 'Rights Lab', '$5', '4.5', '31'],
  ['Image: Product Mockup Backdrops', 'Still Goods', '$16', '4.9', '77'],
  ['Video: Founder Updates People Finish', 'Studio Ledger', '$12', '4.7', '55'],
  ['Music: Minimal Podcast Beds', 'Quiet Channel', '$13', '4.8', '82'],
  ['Writing: Newsletter Operating Manual', 'Dispatch House', '$17', '4.8', '96'],
  ['Article: The New Creator Stack', 'Builder Notes', '$7', '4.7', '48'],
  ['Image: Social Launch Templates', 'Visual Ops', '$15', '4.9', '143'],
  ['Video: Turning Posts Into Paid Libraries', 'Archive Club', '$22', '4.8', '61'],
  ['Music: Shortform Motion Pack', 'Tempo Goods', '$10', '4.9', '88'],
  ['Writing: Research Notes Template', 'Field Desk', '$9', '4.7', '57'],
  ['Article: Pricing Your First Drop', 'Market Letter', '$5', '4.6', '66'],
  ['Image: Cover Art Starter Set', 'Canvas Room', '$21', '5.0', '119'],
  ['Video: Premium Tutorial Structure', 'Course Cut', '$18', '4.8', '73'],
  ['Music: Warm Synth Mini Pack', 'Patch Notes', '$12', '4.9', '41'],
  ['Writing: Subscriber Research Bundle', 'Reader Signal', '$25', '4.8', '64'],
  ['Article: Launch Pages That Convert', 'Web Letter', '$8', '4.7', '53'],
  ['Image: Clean Product Thumbnails', 'Grid Supply', '$13', '4.9', '92'],
  ['Video: Creator Analytics Walkthrough', 'Metric Studio', '$19', '4.8', '46'],
  ['Music: Soft UI Notification Sounds', 'Interface Audio', '$6', '4.5', '38'],
  ['Writing: Private Feed Playbook', 'Membership Works', '$29', '5.0', '75']
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

export const marketProducts = marketProductSeeds.map(([title, creator, price, rating, reviews]) => [
  title,
  creator,
  price,
  rating,
  reviews,
  marketArt(title),
  creatorAvatar(creator)
]);
