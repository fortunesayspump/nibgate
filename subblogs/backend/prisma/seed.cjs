const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const posts = [
  { title: 'Use the saw, fear the saw', slug: 'use-the-saw', type: 'article', excerpt: 'Powerful tools can do powerful things.', bodyMarkdown: 'When I learned to use a table saw, my teacher impressed upon me that the machine wants to cut fingers.', tag: 'Essays', tags: 'tools,craft', coverUrl: 'https://images.unsplash.com/photo-1504006833117-8886a355efbf?w=800&q=80', price: '0.05', publishedAt: new Date('2025-10-20') },
  { title: 'File over app', slug: 'file-over-app', type: 'article', excerpt: 'Your data should outlive the tools.', bodyMarkdown: 'Plain text files will outlive every app you use.', tag: 'Technology', tags: 'files,data', publishedAt: new Date('2023-07-12') },
  { title: 'Style is consistent constraint', slug: 'style-is-constraint', type: 'article', excerpt: 'True style emerges from limitations.', bodyMarkdown: 'Without constraints there is no style.', tag: 'Design', tags: 'style,design', publishedAt: new Date('2023-09-04') },
  { title: 'Calmness is a superpower', slug: 'calmness-superpower', type: 'article', excerpt: 'In a chaotic world calmness wins.', bodyMarkdown: 'When everyone else panics the calm person sees clearly.', tag: 'Life', tags: 'calm,mindfulness', publishedAt: new Date('2022-10-08') },
  { title: 'Swiss Alps', slug: 'swiss-alps', type: 'photo', excerpt: 'Summer in the Alps.', bodyMarkdown: '![Swiss Alps](https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80)', tag: 'Travel', tags: 'alps,switzerland', publishedAt: new Date('2025-08-15') },
  { title: 'Porto at Dusk', slug: 'porto-dusk', type: 'photo', excerpt: 'The Douro river at sunset.', bodyMarkdown: '![Porto](https://images.unsplash.com/photo-1555881400-74d7d6b1c37a?w=800&q=80)', tag: 'Travel', tags: 'porto,portugal', publishedAt: new Date('2025-07-20') },
  { title: 'Morning Light', slug: 'morning-light', type: 'photo', excerpt: 'Golden hour in the garden.', bodyMarkdown: '![Morning Light](https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80)', tag: 'Photography', tags: 'light,golden-hour', publishedAt: new Date('2025-06-10') },
  { title: 'Coastal Walk', slug: 'coastal-walk', type: 'photo', excerpt: 'The rugged coastline trail.', bodyMarkdown: '![Coast](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80)', tag: 'Nature', tags: 'coast,nature', publishedAt: new Date('2025-05-05') },
  { title: 'Ambient Echoes', slug: 'ambient-echoes', type: 'music', excerpt: 'A generative ambient piece.', bodyMarkdown: 'A generative ambient composition made with modular synthesizers and field recordings.\n\n[Listen on SoundCloud](https://soundcloud.com)', tag: 'Music', tags: 'ambient,modular', publishedAt: new Date('2025-09-01') },
  { title: 'Midnight Protocol', slug: 'midnight-protocol', type: 'music', excerpt: 'Dark electronic track.', bodyMarkdown: 'A dark electronic track about surveillance and cryptography.\n\n[Listen on Bandcamp](https://bandcamp.com)', tag: 'Music', tags: 'electronic,dark', publishedAt: new Date('2025-03-15') },
  { title: 'Analog Dreams', slug: 'analog-dreams', type: 'music', excerpt: 'Warm tape-saturated sounds.', bodyMarkdown: 'Recorded entirely to 1/4 tape no computers involved.\n\n[Listen on Spotify](https://spotify.com)', tag: 'Music', tags: 'analog,tape', publishedAt: new Date('2024-08-20') },
  { title: 'Building a DIY Synth', slug: 'diy-synth', type: 'video', excerpt: 'Timelapse of building a modular synth.', bodyMarkdown: 'Watch me build a complete modular synthesizer from scratch over 3 months compressed into 12 minutes.\n\n[Watch on YouTube](https://youtube.com)', tag: 'Music', tags: 'synth,diy', publishedAt: new Date('2025-11-10') },
  { title: 'Studio Session', slug: 'studio-session', type: 'video', excerpt: 'Live improvisation in the studio.', bodyMarkdown: 'An unedited live studio session with the full modular setup.\n\n[Watch on Vimeo](https://vimeo.com)', tag: 'Music', tags: 'studio,live', publishedAt: new Date('2025-04-20') },
];

async function main() {
  const site = await prisma.site.findFirst();
  const author = await prisma.user.findFirst();
  if (!site || !author) { console.log('no site/author found'); return; }

  await prisma.blogPost.deleteMany({ where: { siteId: site.id } });
  console.log('Cleared existing posts');

  for (const p of posts) {
    await prisma.blogPost.create({
      data: { siteId: site.id, authorId: author.id, ...p, status: 'published', featured: false },
    });
  }
  console.log('Seeded ' + posts.length + ' posts');

  for (const type of ['article', 'photo', 'music', 'video']) {
    const count = await prisma.blogPost.count({ where: { siteId: site.id, type } });
    console.log('  ' + type + ': ' + count);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
