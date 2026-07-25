// Run: node prisma/create-blogs.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const blogs = [
  { subdomain: 'benedict', name: "Benedict's Blog", email: 'chukwudiakukweb@gmail.com', password: 'nibgate2026' },
  { subdomain: 'xwillie', name: "Xwillie's Blog", email: 'Ozuombawilliams2020@gmail.com', password: 'nibgate2026' },
  { subdomain: 'elite', name: "Elite's Blog", email: 'ezep0123.33@gmail.com', password: 'nibgate2026' },
  { subdomain: 'shitstories', name: "Shitstories", email: 'remyairdrop.com@gmail.com', password: 'nibgate2026' },
];

async function main() {
  console.log('Creating blogs...');
  const hashedPassword = await bcrypt.hash('nibgate2026', 10);

  for (const b of blogs) {
    const site = await prisma.site.upsert({
      where: { subdomain: b.subdomain },
      update: { name: b.name },
      create: {
        subdomain: b.subdomain,
        name: b.name,
        description: `${b.name} — powered by Nibgate.`,
        verifyToken: `token-${b.subdomain}-${Date.now()}`,
        settings: JSON.stringify({ recipientWallet: '', defaultPrice: '0.01', defaultCurrency: 'USDC', paymentNetwork: 'eip155:5042002' }),
      },
    });

    const user = await prisma.user.upsert({
      where: { email: b.email },
      update: {},
      create: {
        siteId: site.id,
        name: b.name,
        email: b.email,
        password: hashedPassword,
        role: 'author',
      },
    });

    console.log(`✓ ${b.subdomain}.nibgate.xyz — ${b.email} (password: ${b.password})`);
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
