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
    tag: 'General',
    tags: 'welcome,getting-started',
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
    tag: 'Development',
    tags: 'sdk,development,integration',
    status: 'published',
    publishedAt: new Date(Date.now() - 86400000),
  },
];

async function main() {
  console.log('Seeding database...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  const author = await prisma.user.upsert({
    where: { email: 'author@example.com' },
    update: {},
    create: {
      name: 'Demo Author',
      email: 'author@example.com',
      password: hashedPassword,
      role: 'author',
    },
  });

  console.log(`Created author: ${author.email} (password: password123)`);

  for (const post of samplePosts) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: { ...post, authorId: author.id },
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
