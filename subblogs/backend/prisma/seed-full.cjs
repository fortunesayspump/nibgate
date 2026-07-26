const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const demoPosts = [
  // Articles
  { title: 'Use the saw, fear the saw', slug: 'use-the-saw', type: 'article', excerpt: 'Powerful tools can do powerful things. Respect them.', bodyMarkdown: 'When I learned to use a table saw, my teacher impressed upon me that the machine wants to cut fingers. Fear the saw.\n\nThere is a limit to how safe a tool can be before its function is crippled. A knife must be sharp to cut. A saw must be exposed to cut wood. The danger is inherent to the utility.\n\nThis applies to software too. If you remove all risk, you remove all power.', tag: 'Essays', tags: 'tools,craft', coverUrl: 'https://images.unsplash.com/photo-1504006833117-8886a355efbf?w=800&q=80', price: '0.05', publishedAt: new Date('2025-10-20') },
  { title: 'File over app', slug: 'file-over-app', type: 'article', excerpt: 'Your data should outlive every tool you use.', bodyMarkdown: 'Plain text files will outlive every app you use. Write in formats that are human-readable, portable, and independent of any single vendor.\n\nMarkdown, JSON, CSV, SQLite — these formats have staying power. The tools that read them come and go, but the data remains.', tag: 'Technology', tags: 'files,data,portability', publishedAt: new Date('2023-07-12') },
  { title: 'Style is consistent constraint', slug: 'style-is-constraint', type: 'article', excerpt: 'True style emerges from limitations.', bodyMarkdown: 'Without constraints there is no style. The artist who chooses their limitations finds their voice.\n\nThink of Twitter\'s 140 characters, the sonnet\'s 14 lines, or a film shot on a single lens. The constraint forces creativity.', tag: 'Design', tags: 'style,design,constraints', publishedAt: new Date('2023-09-04') },
  { title: 'Calmness is a superpower', slug: 'calmness-is-power', type: 'article', excerpt: 'In a chaotic world calm thinking wins.', bodyMarkdown: 'When everyone else panics the calm person sees clearly. They make better decisions because fear is not clouding their judgment.\n\nCultivating calmness is a skill. It requires practice, breath, and perspective. But it pays dividends in every area of life.', tag: 'Life', tags: 'calm,mindfulness,clarity', publishedAt: new Date('2022-10-08') },
  { title: 'Love is freedom', slug: 'love-is-freedom', type: 'article', excerpt: 'The paradox of commitment.', bodyMarkdown: 'Freedom is not the absence of constraints. It is the presence of the right ones.\n\nA musician who masters their instrument gains the freedom to express anything. A writer who studies grammar gains the freedom to be understood.', tag: 'Philosophy', tags: 'love,freedom,commitment', publishedAt: new Date('2024-05-14') },
  { title: 'Small, sharp tools', slug: 'small-sharp-tools', type: 'article', excerpt: 'Unix philosophy for everyday life.', bodyMarkdown: 'The best tools do one thing well. A hammer drives nails. A knife cuts. A text editor edits text.\n\nWhen tools try to do everything they become mediocre at everything. Specialization is efficiency.', tag: 'Technology', tags: 'tools,unix,simplicity', publishedAt: new Date('2024-02-18') },
  { title: 'On writing well', slug: 'on-writing-well', type: 'article', excerpt: 'Clear writing is clear thinking.', bodyMarkdown: 'Writing is not about fancy words. It is about clear thinking. If you cannot explain something simply you do not understand it well enough.\n\nEdit ruthlessly. Cut every word that does not work. Your readers time is valuable.', tag: 'Writing', tags: 'writing,clarity', publishedAt: new Date('2025-01-05') },

  // Photos
  { title: 'Swiss Alps', slug: 'swiss-alps-2025', type: 'photo', excerpt: 'Summer in the Swiss Alps.', bodyMarkdown: '![Swiss Alps](https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80)\n\n![Mountain Lake](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80)\n\n![Alpine Meadow](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80)', tag: 'Travel', tags: 'alps,switzerland,mountains', publishedAt: new Date('2025-08-15') },
  { title: 'Porto at Night', slug: 'porto-at-night', type: 'photo', excerpt: 'The Douro river under moonlight.', bodyMarkdown: '![Porto](https://images.unsplash.com/photo-1518635017498-87f514b751ba?w=800&q=80)\n\n![Douro River](https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80)', tag: 'Travel', tags: 'porto,portugal,night', publishedAt: new Date('2025-07-20') },
  { title: 'Morning Light', slug: 'morning-light-garden', type: 'photo', excerpt: 'Golden hour in the garden.', bodyMarkdown: '![Morning Garden](https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80)\n\n![Sunlight](https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80)', tag: 'Photography', tags: 'light,golden-hour,garden', publishedAt: new Date('2025-06-10') },
  { title: 'Coastal Walk', slug: 'coastal-walk-oregon', type: 'photo', excerpt: 'The rugged Oregon coastline.', bodyMarkdown: '![Oregon Coast](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80)\n\n![Waves](https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80)', tag: 'Nature', tags: 'coast,nature,oregon', publishedAt: new Date('2025-05-05') },
  { title: 'Autumn Colors', slug: 'autumn-colors-park', type: 'photo', excerpt: 'Fall foliage in Central Park.', bodyMarkdown: '![Autumn Park](https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80)\n\n![Leaves](https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?w=800&q=80)', tag: 'Photography', tags: 'autumn,leaves,nyc', publishedAt: new Date('2024-11-02') },
  { title: 'Desert Solitude', slug: 'desert-solitude', type: 'photo', excerpt: 'The Mojave at sunrise.', bodyMarkdown: '![Desert](https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80)\n\n![Sand](https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80)', tag: 'Travel', tags: 'desert,majove,nature', publishedAt: new Date('2024-03-10') },

  // Music
  { title: 'Ambient Echoes', slug: 'ambient-echoes', type: 'music', excerpt: 'A generative ambient piece.', bodyMarkdown: 'A generative ambient composition made with modular synthesizers and field recordings from the Swiss Alps.\n\n[Listen on SoundCloud](https://soundcloud.com/monolake/credit-maxim-rotary)\n\nGear: Make Noise Shared System, 4ms MetaModule, field recorder.', tag: 'Music', tags: 'ambient,modular,generative', publishedAt: new Date('2025-09-01') },
  { title: 'Midnight Protocol', slug: 'midnight-protocol', type: 'music', excerpt: 'Dark electronic track.', bodyMarkdown: 'A dark electronic track exploring themes of surveillance and cryptography. Inspired by Snowden and the cypherpunks.\n\n[Listen on Bandcamp](https://bandcamp.com)\n\nGear: Ableton Live, Analog Rytm, Prophet-6.', tag: 'Music', tags: 'electronic,dark,techno', publishedAt: new Date('2025-03-15') },
  { title: 'Analog Dreams', slug: 'analog-dreams', type: 'music', excerpt: 'Warm tape-saturated sounds.', bodyMarkdown: 'Recorded entirely to 1/4" tape. No computers involved in the signal chain.\n\n[Listen on Spotify](https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT)\n\nGear: Juno-60, Space Echo, tape loops.', tag: 'Music', tags: 'analog,tape,warm', publishedAt: new Date('2024-08-20') },
  { title: 'Fractal Patterns', slug: 'fractal-patterns', type: 'music', excerpt: 'Algorithmic composition using L-systems.', bodyMarkdown: 'An algorithmic piece where musical patterns are generated by L-system fractals. Each listen is unique.\n\n[Listen on SoundCloud](https://soundcloud.com/plastikman/spastik)\n\nMade with SuperCollider and custom Max/MSP patches.', tag: 'Music', tags: 'algorithmic,fractal,generative', publishedAt: new Date('2024-12-01') },
  { title: 'Rainy Day Jazz', slug: 'rainy-day-jazz', type: 'music', excerpt: 'Lo-fi jazz for a rainy afternoon.', bodyMarkdown: 'Recorded live in one take on a rainy Sunday. Piano, double bass, and the sound of rain outside.\n\n[Listen on Spotify](https://open.spotify.com/track/3WcZ6TgOTG7azfqSL0Uaoo)\n\nPiano: Yamaha C7. Bass: 1960s Kay.', tag: 'Music', tags: 'jazz,lo-fi,rain', publishedAt: new Date('2025-06-20') },

  // Video
  { title: 'Building a DIY Synth', slug: 'diy-synth-build', type: 'video', excerpt: '3 months of synth building in 12 minutes.', bodyMarkdown: 'Watch me build a complete modular synthesizer from scratch. From PCB assembly to the first patch.\n\n[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)', tag: 'Music', tags: 'synth,diy,modular', coverUrl: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&q=80', publishedAt: new Date('2025-11-10') },
  { title: 'Studio Session Vol 1', slug: 'studio-session-vol1', type: 'video', excerpt: 'Live modular improvisation.', bodyMarkdown: 'An unedited 30-minute live studio session with the full modular setup. No overdubs no edits.\n\n[Watch on Vimeo](https://vimeo.com/76979871)', tag: 'Music', tags: 'studio,live,modular', coverUrl: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800&q=80', publishedAt: new Date('2025-04-20') },
  { title: 'Field Recording in Iceland', slug: 'field-recording-iceland', type: 'video', excerpt: 'Capturing glacial sounds.', bodyMarkdown: 'A week in Iceland recording glacial melt rivers ice cracking and volcanic landscapes.\n\n[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)', tag: 'Travel', tags: 'iceland,field-recording,sound', coverUrl: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80', publishedAt: new Date('2025-02-14') },
  { title: 'How to Solder', slug: 'how-to-solder', type: 'video', excerpt: 'A beginners guide to through-hole soldering.', bodyMarkdown: 'Learn the basics of through-hole soldering: tools technique and common mistakes to avoid.\n\n[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)', tag: 'Tutorial', tags: 'soldering,diy,tutorial', coverUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80', publishedAt: new Date('2024-09-10') },
  { title: 'Album Release Show', slug: 'album-release-show', type: 'video', excerpt: 'Full live set from the album launch.', bodyMarkdown: 'The full live set from our album release show at The Echo in Los Angeles.\n\n[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n[Setlist on Spotify](https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT)', tag: 'Music', tags: 'live,concert,album', coverUrl: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&q=80', publishedAt: new Date('2024-06-30') },
];

const secondSitePosts = [
  { title: 'Getting Started with Synths', slug: 'getting-started-synths', type: 'article', excerpt: 'A beginners guide to synthesis.', bodyMarkdown: 'Synthesis is simpler than it sounds. Oscillators make sound. Filters shape it. Envelopes control it.\n\nThis guide covers subtractive FM and wavetable synthesis with practical examples.', tag: 'Tutorial', tags: 'synth,beginner,music', publishedAt: new Date('2025-12-01') },
  { title: 'Nordic Landscapes', slug: 'nordic-landscapes', type: 'photo', excerpt: 'Photography from Norway.', bodyMarkdown: '![Norway Fjord](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80)\n\n![Northern Lights](https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80)', tag: 'Photography', tags: 'norway,nordic,landscape', publishedAt: new Date('2025-11-15') },
  { title: 'Live at Berghain', slug: 'live-at-berghain', type: 'music', excerpt: 'A recording from a live set.', bodyMarkdown: 'Recorded live at Berghain in Berlin. 45 minutes of deep hypnotic techno.\n\n[Listen on SoundCloud](https://soundcloud.com/plastikman/spastik)', tag: 'Music', tags: 'techno,live,berlin', publishedAt: new Date('2025-10-30') },
  { title: 'Eurorack Beginners Guide', slug: 'eurorack-beginners', type: 'video', excerpt: 'How to start your modular journey.', bodyMarkdown: 'Everything I wish I knew before starting Eurorack. Case power modules cables.\n\n[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)', tag: 'Tutorial', tags: 'eurorack,modular,beginner', coverUrl: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80', publishedAt: new Date('2025-09-20') },
  { title: 'The Art of Constraints', slug: 'art-of-constraints', type: 'article', excerpt: 'Why limits make better art.', bodyMarkdown: 'When you have unlimited options you have no direction. Constraints give you a path.\n\nTry making a track with only one synth. A photo with only one lens. A poem with only 50 words.', tag: 'Essays', tags: 'constraints,creativity,art', publishedAt: new Date('2025-08-05') },
  { title: 'Urban Geometry', slug: 'urban-geometry', type: 'photo', excerpt: 'Architecture photography in Tokyo.', bodyMarkdown: '![Tokyo Tower](https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80)\n\n![Shibuya](https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&q=80)\n\n![Temple](https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80)', tag: 'Photography', tags: 'tokyo,architecture,urban', publishedAt: new Date('2025-07-01') },
];

async function main() {
  // Get or create demo site
  let demoSite = await prisma.site.findFirst({ where: { subdomain: 'demo' } });
  if (!demoSite) {
    demoSite = await prisma.site.create({ data: { name: 'Demo Blog', subdomain: 'demo' } });
  }

  // Get or create demo author
  let demoAuthor = await prisma.user.findFirst({ where: { siteId: demoSite.id } });
  if (!demoAuthor) {
    demoAuthor = await prisma.user.create({
      data: { name: 'Demo Author', email: 'demo@example.com', password: '$2b$10$placeholder', siteId: demoSite.id },
    });
  }

  // Create or find second site
  let secondSite = await prisma.site.findFirst({ where: { subdomain: 'instrmntls' } });
  if (!secondSite) {
    secondSite = await prisma.site.create({ data: { name: 'Instrmntls', subdomain: 'instrmntls' } });
  }

  // Get or create second author
  let secondAuthor = await prisma.user.findFirst({ where: { siteId: secondSite.id } });
  if (!secondAuthor) {
    secondAuthor = await prisma.user.create({
      data: { name: 'Instrumentals', email: 'hello@instrmntls.xyz', password: '$2b$10$placeholder', siteId: secondSite.id },
    });
  }

  // Clear existing posts
  await prisma.blogPost.deleteMany({ where: { siteId: demoSite.id } });
  await prisma.blogPost.deleteMany({ where: { siteId: secondSite.id } });
  console.log('Cleared existing posts');

  // Seed demo site
  for (const p of demoPosts) {
    await prisma.blogPost.create({
      data: { siteId: demoSite.id, authorId: demoAuthor.id, ...p, status: 'published', featured: false },
    });
  }

  // Seed second site
  for (const p of secondSitePosts) {
    await prisma.blogPost.create({
      data: { siteId: secondSite.id, authorId: secondAuthor.id, ...p, status: 'published', featured: false },
    });
  }

  console.log('Seeded:');
  for (const site of [demoSite, secondSite]) {
    console.log(`  ${site.subdomain}:`);
    for (const type of ['article', 'photo', 'music', 'video']) {
      const count = await prisma.blogPost.count({ where: { siteId: site.id, type } });
      console.log(`    ${type}: ${count}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
