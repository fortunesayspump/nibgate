const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const samplePosts = [
  {
    title: 'Welcome to Your New Blog',
    slug: 'welcome-to-your-new-blog',
    bodyMarkdown: `Welcome to your new blog powered by Nibgate.

This is a sample post to help you get started. You can create, edit, and publish posts from the admin dashboard.

## What's Next?

- Write your first post
- Customize the design
- Set up premium content gating with Nibgate
- Share your work with the world

Happy writing! 🚀`,
    excerpt: 'Welcome to your new blog powered by Nibgate. Get started with writing and publishing.',
    tags: 'welcome,getting-started',
    coverUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800',
    status: 'published',
    featured: true,
    publishedAt: new Date(),
  },
  {
    title: 'Understanding the Nibgate SDK',
    slug: 'understanding-nibgate-sdk',
    bodyMarkdown: `The Nibgate SDK allows you to gate premium content behind a simple unlock flow.

## How It Works

1. Install the SDK via npm
2. Configure your content settings
3. Add the unlock widget to your page
4. Earn payments for premium content

## Getting Started

\`\`\`bash
npm install @nibgate/sdk
\`\`\`

Then import and configure it in your application.`,
    excerpt: 'Learn how to use the Nibgate SDK to gate premium content and earn payments.',
    tags: 'sdk,development,integration',
    coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
    status: 'published',
    publishedAt: new Date(Date.now() - 86400000),
  },
  {
    title: 'The Art of Creative Coding',
    slug: 'art-of-creative-coding',
    bodyMarkdown: `Creative coding blends technology with artistic expression. Whether you're generating visuals or composing music algorithmically, the possibilities are endless.

## Why Creative Coding?

- Express ideas through code
- Generate unique visual art
- Create interactive experiences
- Push the boundaries of traditional media`,
    excerpt: 'Exploring the intersection of code and creativity through generative art and interactive design.',
    tags: 'coding,creative,art',
    coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
    status: 'published',
    publishedAt: new Date(Date.now() - 172800000),
  },
  {
    title: 'Building with Web3 Tools',
    slug: 'building-with-web3-tools',
    bodyMarkdown: `The Web3 ecosystem offers powerful tools for creators. From smart contracts to decentralized storage, here's what you need to know.

## Key Tools

- **Smart Contracts**: Automate agreements
- **IPFS**: Decentralized file storage
- **Wallet Connect**: User authentication
- **Circle Gateway**: Payment processing`,
    excerpt: 'A practical guide to the essential tools and infrastructure powering the decentralized web.',
    tags: 'web3,tools,blockchain',
    coverUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800',
    status: 'published',
    publishedAt: new Date(Date.now() - 259200000),
  },
  {
    title: 'Coastal California',
    slug: 'coastal-california',
    bodyMarkdown: '',
    excerpt: 'A photo collection from the California coast.',
    tags: 'photography,travel,california',
    coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    type: 'photo',
    media: JSON.stringify([
      { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', caption: 'Sunset at Huntington Beach' },
      { url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=800', caption: 'Big Sur coastline' },
      { url: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800', caption: 'Santa Monica pier' },
    ]),
    status: 'published',
    publishedAt: new Date(Date.now() - 345600000),
  },
  {
    title: 'Ambient Synth Session',
    slug: 'ambient-synth-session',
    bodyMarkdown: 'A live ambient jam recorded in one take using the Eurorack modular system.',
    excerpt: 'A live ambient modular synth recording.',
    tags: 'music,ambient,synth',
    coverUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800',
    type: 'music',
    status: 'published',
    publishedAt: new Date(Date.now() - 432000000),
  },
  {
    title: 'Tokyo Nights',
    slug: 'tokyo-nights',
    bodyMarkdown: '',
    excerpt: 'Street photography from the neon-lit streets of Tokyo.',
    tags: 'photography,japan,street',
    coverUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
    type: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'published',
    publishedAt: new Date(Date.now() - 518400000),
  },
];

async function main() {
  console.log('Seeding database...');

  const site = await prisma.site.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      subdomain: 'demo',
      name: 'Demo Blog',
      description: 'A demo blog powered by Nibgate.',
      verifyToken: 'demo-token-123',
      settings: JSON.stringify({ recipientWallet: '', defaultPrice: '0.01', defaultCurrency: 'USDC', paymentNetwork: 'eip155:5042002' }),
    },
  });

  console.log(`Created site: ${site.subdomain}.nibgate.xyz`);

  const hashedPassword = await bcrypt.hash('password123', 10);

  const author = await prisma.user.upsert({
    where: { email: 'author@example.com' },
    update: {},
    create: {
      siteId: site.id,
      name: 'Demo Author',
      email: 'author@example.com',
      password: hashedPassword,
      role: 'author',
    },
  });

  console.log(`Created author: ${author.email} (password: password123)`);

  for (const post of samplePosts) {
    await prisma.blogPost.upsert({
      where: { siteId_slug: { siteId: site.id, slug: post.slug } },
      update: {},
      create: { ...post, siteId: site.id, authorId: author.id },
    });
    console.log(`Created post: ${post.title}`);
  }

  console.log('Seed complete!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
