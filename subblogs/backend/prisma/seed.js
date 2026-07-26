const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const articles = [
  { title: 'Welcome to Your New Blog', slug: 'welcome-to-your-new-blog', bodyMarkdown: 'Welcome to your new blog powered by Nibgate.\n\n![](https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800)\n\nThis is a sample post to help you get started. You can create, edit, and publish posts from the admin dashboard.\n\n## What\'s Next?\n\n- Write your first post\n- Customize the design\n- Set up premium content gating with Nibgate\n- Share your work with the world', excerpt: 'Welcome to your new blog powered by Nibgate. Get started with writing and publishing.', coverUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800', price: null, featured: true },
  { title: 'Understanding the Nibgate SDK', slug: 'understanding-nibgate-sdk', bodyMarkdown: 'The Nibgate SDK allows you to gate premium content behind a simple unlock flow.\n\n## How It Works\n\n1. Install the SDK via npm\n2. Configure your content settings\n3. Add the unlock widget to your page\n4. Earn payments for premium content', excerpt: 'Learn how to use the Nibgate SDK to gate premium content and earn payments.', coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800', price: '0.01', featured: false },
  { title: 'The Art of Creative Coding', slug: 'art-of-creative-coding', bodyMarkdown: 'Creative coding blends technology with artistic expression.\n\n![](https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800)\n\n## Why Creative Coding?\n\n- Express ideas through code\n- Generate unique visual art\n- Create interactive experiences\n- Push the boundaries of traditional media', excerpt: 'Exploring the intersection of code and creativity through generative art.', coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800', price: null, featured: false },
  { title: 'Building with Web3 Tools', slug: 'building-with-web3-tools', bodyMarkdown: 'The Web3 ecosystem offers powerful tools for creators. From smart contracts to decentralized storage.\n\n## Key Tools\n\n- **Smart Contracts**: Automate agreements\n- **IPFS**: Decentralized file storage\n- **Wallet Connect**: User authentication\n- **Circle Gateway**: Payment processing', excerpt: 'A practical guide to essential Web3 infrastructure.', coverUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800', price: '0.02', featured: false },
  { title: 'Why Decentralized Publishing Matters', slug: 'decentralized-publishing', bodyMarkdown: 'Decentralized publishing puts creators back in control. No algorithms, no demonetization, no middlemen taking 30%.\n\n![](https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800)\n\n## The Problem\n\nPlatforms own your audience. They can shadowban, demonetize, or delete your content at any time.\n\n## The Solution\n\nOwn your domain, own your content, own your revenue.', excerpt: 'Why creators are moving to decentralized platforms.', coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800', price: null, featured: false },
  { title: 'A Guide to Modular Synthesis', slug: 'guide-modular-synthesis', bodyMarkdown: 'Modular synthesis is an electronic music technique where you build sounds by patching together individual modules.\n\n## Getting Started\n\nStart with a case, power supply, VCO, VCF, VCA, and envelope generator.\n\n## East Coast vs West Coast\n\nEast Coast (Moog) focuses on subtractive synthesis. West Coast (Buchla) emphasizes complex oscillators and low-pass gates.', excerpt: 'An introduction to the world of modular synthesizers.', coverUrl: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800', price: '0.05', featured: false },
  { title: 'The Future of AI and Creativity', slug: 'ai-creativity', bodyMarkdown: 'AI is transforming creative work. But rather than replacing artists, it\'s becoming a powerful tool for exploration.\n\n![](https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800)\n\n## Augmenting Creativity\n\nUse AI for brainstorming, variations, and overcoming creative blocks.\n\n## Maintaining Authenticity\n\nThe best work comes from human intent guided by AI assistance, not fully automated output.', excerpt: 'How AI is reshaping creative work without replacing artists.', coverUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800', price: null, featured: false },
  { title: 'Building a Personal Brand Online', slug: 'building-personal-brand', bodyMarkdown: 'Your personal brand is what people say about you when you leave the room. Online, it\'s your digital footprint.\n\n## Key Principles\n\n- Consistency across platforms\n- Authentic voice and perspective\n- Provide value before asking for anything\n- Engage with your community', excerpt: 'A practical framework for building your online presence.', coverUrl: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800', price: '0.01', featured: false },
  { title: 'Indie Web Revival', slug: 'indie-web-revival', bodyMarkdown: 'The IndieWeb movement is about owning your identity and content on the web. Not renting it from platforms.\n\n![](https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800)\n\n## Principles\n\n- Own your domain\n- Publish on your site, syndicate elsewhere\n- Use open standards\n- Connect with others through the indie web', excerpt: 'Why the independent web movement matters more than ever.', coverUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800', price: null, featured: false },
  { title: 'Pricing Your Digital Work', slug: 'pricing-digital-work', bodyMarkdown: 'Pricing creative work is hard. Here\'s a framework that works.\n\n## Find Your Floor\n\nWhat\'s the minimum you\'d accept? Consider time, expertise, and market rates.\n\n## Test and Iterate\n\nStart with a price, gather feedback, adjust. Your first price won\'t be your last.', excerpt: 'A practical guide to pricing creative and digital products.', coverUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800', price: '0.03', featured: false },
];

const photoGalleries = [
  { title: 'Coastal California', slug: 'coastal-california', excerpt: 'A photo collection from the California coast.', coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', price: null, media: [{ url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', caption: 'Sunset at Huntington Beach' }, { url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=800', caption: 'Big Sur coastline' }, { url: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800', caption: 'Santa Monica pier' }] },
  { title: 'Urban Geometry', slug: 'urban-geometry', excerpt: 'Architectural patterns found in city spaces.', coverUrl: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=800', price: '0.01', media: [{ url: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=800', caption: 'Geometric facade, Chicago' }, { url: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800', caption: 'Modern architecture' }, { url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800', caption: 'Glass reflections' }, { url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=800', caption: 'Urban symmetry' }] },
  { title: 'Nordic Landscapes', slug: 'nordic-landscapes', excerpt: 'The dramatic landscapes of Scandinavia.', coverUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', price: null, media: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', caption: 'Norwegian fjord' }, { url: 'https://images.unsplash.com/photo-1504851149312-7a0750c3e53e?w=800', caption: 'Aurora borealis' }, { url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=800', caption: 'Swedish forest' }] },
  { title: 'Street Food Markets', slug: 'street-food-markets', excerpt: 'Vibrant street food scenes from around the world.', coverUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800', price: '0.02', media: [{ url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800', caption: 'Bangkok night market' }, { url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800', caption: 'Mexican street tacos' }, { url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800', caption: 'Italian market' }, { url: 'https://images.unsplash.com/photo-1505253758473-96b7015fcd40?w=800', caption: 'Japanese street food' }] },
  { title: 'Desert Light', slug: 'desert-light', excerpt: 'The play of light across desert landscapes.', coverUrl: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800', price: null, media: [{ url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800', caption: 'Dunes at sunset' }, { url: 'https://images.unsplash.com/photo-1473580044384-7ba9967d16d0?w=800', caption: 'Mountain silhouette' }, { url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800', caption: 'Stars over the desert' }] },
  { title: 'Porto at Dusk', slug: 'porto-at-dusk', excerpt: 'The colorful streets of Porto, Portugal at golden hour.', coverUrl: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800', price: '0.01', media: [{ url: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800', caption: 'Douro riverfront' }, { url: 'https://images.unsplash.com/photo-1569949381669-ecf31ae8f613?w=800', caption: 'Ribeira district' }, { url: 'https://images.unsplash.com/photo-1568832352279-ad06ab161b5b?w=800', caption: 'Porto tiles' }] },
  { title: 'Macro World', slug: 'macro-world', excerpt: 'Tiny details revealed through macro photography.', coverUrl: 'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?w=800', price: null, media: [{ url: 'https://images.unsplash.com/photo-1504214208698-ea1916a2195a?w=800', caption: 'Dew on a leaf' }, { url: 'https://images.unsplash.com/photo-1507177982003-89139e7c04be?w=800', caption: 'Insect macro' }, { url: 'https://images.unsplash.com/photo-1452573992436-6d508f200b30?w=800', caption: 'Flower petals' }] },
  { title: 'Mountain Summits', slug: 'mountain-summits', excerpt: 'Views from the top of the world.', coverUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', price: '0.03', media: [{ url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', caption: 'Alpine peak' }, { url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800', caption: 'Morning hike' }, { url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800', caption: 'Cloud inversion' }] },
  { title: 'Neon Nights', slug: 'neon-nights', excerpt: 'Night photography with neon aesthetics.', coverUrl: 'https://images.unsplash.com/photo-1571153484333-3c4e29f0b219?w=800', price: null, media: [{ url: 'https://images.unsplash.com/photo-1571153484333-3c4e29f0b219?w=800', caption: 'Neon sign' }, { url: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800', caption: 'City lights' }, { url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800', caption: 'Rainy street' }] },
  { title: 'Botanical Gardens', slug: 'botanical-gardens', excerpt: 'Exotic plants and flowers from botanical gardens.', coverUrl: 'https://images.unsplash.com/photo-1536323760102-c5d4c8918b11?w=800', price: '0.01', media: [{ url: 'https://images.unsplash.com/photo-1536323760102-c5d4c8918b11?w=800', caption: 'Greenhouse dome' }, { url: 'https://images.unsplash.com/photo-1490750967868-88aa2f44e0db?w=800', caption: 'Tropical flowers' }, { url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800', caption: 'Succulent garden' }, { url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800', caption: 'Cherry blossoms' }] },
];

const musicPosts = [
  { title: 'Ambient Synth Session', slug: 'ambient-synth-session', excerpt: 'A live ambient modular synth recording.', coverUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800', price: null },
  { title: 'Midnight Protocol', slug: 'midnight-protocol', excerpt: 'Dark electronic beats for late night coding.', coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800', price: '0.01' },
  { title: 'Analog Dreams', slug: 'analog-dreams', excerpt: 'Warm analog synthesizer textures.', coverUrl: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=800', price: null },
  { title: 'Building a DIY Synth', slug: 'building-diy-synth', excerpt: 'Documenting the process of building a modular synth from scratch.', coverUrl: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=800', price: '0.02' },
  { title: 'Studio Session Vol 1', slug: 'studio-session-vol1', excerpt: 'Live studio recording session with analog gear.', coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800', price: null },
  { title: 'Eurorack Beginners Guide', slug: 'eurorack-beginners', excerpt: 'Getting started with Eurorack modular synthesis.', coverUrl: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800', price: '0.01' },
  { title: 'LoFi Study Beats', slug: 'lofi-study-beats', excerpt: 'Chill lo-fi beats for focus and relaxation.', coverUrl: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800', price: null },
  { title: 'Field Recordings', slug: 'field-recordings', excerpt: 'Ambient soundscapes made from field recordings.', coverUrl: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800', price: '0.03' },
  { title: 'Granular Explorations', slug: 'granular-explorations', excerpt: 'Experiments in granular synthesis and texture.', coverUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800', price: null },
  { title: 'Live at Berghain', slug: 'live-at-berghain', excerpt: 'A live techno set recorded at Berghain.', coverUrl: 'https://images.unsplash.com/photo-1574169208507-84376144848b?w=800', price: '0.05' },
];

const videoPosts = [
  { title: 'Tokyo Nights', slug: 'tokyo-nights', excerpt: 'Street photography from the neon-lit streets of Tokyo.', coverUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: null },
  { title: 'Modular Synth Performance', slug: 'modular-synth-performance', excerpt: 'A live modular synth performance.', coverUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53e2bc?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: '0.01' },
  { title: 'Studio Tour 2026', slug: 'studio-tour-2026', excerpt: 'A walkthrough of the recording studio setup.', coverUrl: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: null },
  { title: 'Building a Eucephal Case', slug: 'building-eurorack-case', excerpt: 'Step by step guide to building a custom Eurorack case.', coverUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: '0.02' },
  { title: 'Generative Art Tutorial', slug: 'generative-art-tutorial', excerpt: 'Learn to create generative art with JavaScript.', coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: null },
  { title: 'Album Recording Process', slug: 'album-recording-process', excerpt: 'Behind the scenes of recording a full album.', coverUrl: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: '0.03' },
  { title: 'Lighting for Photography', slug: 'lighting-photography', excerpt: 'Essential lighting techniques for photographers.', coverUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: null },
  { title: 'Mastering in Ableton', slug: 'mastering-ableton', excerpt: 'A complete guide to mastering your tracks in Ableton Live.', coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: '0.01' },
  { title: 'Street Photography Tips', slug: 'street-photography-tips', excerpt: 'Tips and techniques for better street photography.', coverUrl: 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: null },
  { title: 'Synthesizer Comparison', slug: 'synthesizer-comparison', excerpt: 'Comparing classic analog vs modern digital synthesizers.', coverUrl: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=800', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', price: '0.04' },
];

function buildPost(data, type, extra = {}) {
  return { ...data, tags: data.tags || type, type, status: 'published', bodyMarkdown: data.bodyMarkdown || '', publishedAt: new Date(Date.now() - Math.random() * 365 * 86400000), ...extra };
}

async function main() {
  console.log('Seeding database...');

  const site = await prisma.site.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: { subdomain: 'demo', name: 'Demo Blog', description: 'A demo blog powered by Nibgate.', verifyToken: 'demo-token-123', settings: JSON.stringify({ recipientWallet: '', defaultPrice: '0.01', defaultCurrency: 'USDC', paymentNetwork: 'eip155:5042002' }) },
  });

  console.log(`Created site: ${site.subdomain}.nibgate.xyz`);

  const hashedPassword = await bcrypt.hash('password123', 10);
  const author = await prisma.user.upsert({
    where: { email: 'author@example.com' },
    update: {},
    create: { siteId: site.id, name: 'Demo Author', email: 'author@example.com', password: hashedPassword, role: 'author' },
  });

  console.log(`Created author: ${author.email} (password: password123)`);

  await prisma.blogPost.deleteMany();

  for (const a of articles) {
    await prisma.blogPost.create({ data: { ...a, status: 'published', tags: 'article,' + a.tags, siteId: site.id, authorId: author.id } });
  }
  for (const p of photoGalleries) {
    await prisma.blogPost.create({ data: { ...p, status: 'published', tags: 'photo,' + p.tags, bodyMarkdown: '', type: 'photo', media: JSON.stringify(p.media), siteId: site.id, authorId: author.id } });
  }
  for (const m of musicPosts) {
    await prisma.blogPost.create({ data: { ...m, status: 'published', bodyMarkdown: m.excerpt, tags: 'music,' + m.excerpt.slice(0, 30), type: 'music', siteId: site.id, authorId: author.id } });
  }
  for (const v of videoPosts) {
    await prisma.blogPost.create({ data: { ...v, status: 'published', bodyMarkdown: v.excerpt, tags: 'video,' + v.excerpt.slice(0, 30), type: 'video', siteId: site.id, authorId: author.id } });
  }

  console.log(`Created ${articles.length + photoGalleries.length + musicPosts.length + videoPosts.length} posts`);
  console.log('Seed complete!');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
