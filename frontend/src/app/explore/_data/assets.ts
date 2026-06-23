const palette = {
  ink: '#111111',
  paper: '#F6F4EE',
  plum: '#2E1F5E',
  olive: '#7C9A6D',
  teal: '#0F766E',
  soft: '#E7EFE4'
};

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function svgDataUri(svg: string) {
  if (typeof window !== "undefined") {
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function hash(value = '') {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function titleWords(value = '') {
  return String(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .replaceAll(/[-_/]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function initials(value = '') {
  const words = titleWords(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() || '').join('') || 'N';
}

function tone(seed = '') {
  const tones = [
    { bg: palette.plum, fg: palette.paper, accent: palette.olive, accentSoft: '#9FB38D' },
    { bg: palette.olive, fg: palette.ink, accent: palette.teal, accentSoft: '#B8C8AC' },
    { bg: palette.teal, fg: palette.paper, accent: palette.olive, accentSoft: '#6F9387' }
  ];
  return tones[hash(seed) % tones.length];
}

export function placeholderAvatar(label: string, { size = 128 } = {}) {
  const colors = tone(label);
  const mark = initials(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" fill="${colors.bg}"/>
      <circle cx="${Math.round(size * 0.78)}" cy="${Math.round(size * 0.24)}" r="${Math.round(size * 0.18)}" fill="${colors.accent}" opacity="0.9"/>
      <circle cx="${Math.round(size * 0.22)}" cy="${Math.round(size * 0.78)}" r="${Math.round(size * 0.16)}" fill="${colors.accentSoft}" opacity="0.95"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.3)}" font-weight="700">${escapeXml(mark)}</text>
    </svg>
  `;
  return svgDataUri(svg);
}

export function placeholderArt(title: string, { kicker = 'Nibgate', width = 800, height = 800 } = {}) {
  const colors = tone(`${title}:${kicker}`);
  const safeTitle = titleWords(title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${colors.bg}"/>
      <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.84)}" rx="${Math.round(Math.min(width, height) * 0.05)}" fill="${colors.accentSoft}" opacity="0.18" stroke="${colors.fg}" stroke-opacity="0.22"/>
      <circle cx="${Math.round(width * 0.8)}" cy="${Math.round(height * 0.24)}" r="${Math.round(Math.min(width, height) * 0.13)}" fill="${colors.accent}" opacity="0.92"/>
      <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.76)}" r="${Math.round(Math.min(width, height) * 0.14)}" fill="${palette.soft}" opacity="0.95"/>
      <path d="M${Math.round(width * 0.16)} ${Math.round(height * 0.66)} C ${Math.round(width * 0.34)} ${Math.round(height * 0.5)}, ${Math.round(width * 0.52)} ${Math.round(height * 0.88)}, ${Math.round(width * 0.78)} ${Math.round(height * 0.54)}" fill="none" stroke="${colors.fg}" stroke-width="${Math.max(4, Math.round(width * 0.008))}" stroke-linecap="round" opacity="0.55"/>
      <text x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.19)}" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(width * 0.052)}" font-weight="700">${escapeXml(kicker.toUpperCase())}</text>
      <text x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.42)}" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(width * 0.082)}" font-weight="700">${escapeXml(safeTitle.slice(0, 20))}</text>
      <text x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.52)}" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(width * 0.038)}" opacity="0.82">${escapeXml(safeTitle.slice(20, 60).trim() || 'Creator-owned work')}</text>
    </svg>
  `;
  return svgDataUri(svg);
}

export function placeholderTile(label: string, { size = 240 } = {}) {
  const colors = tone(label);
  const safeLabel = titleWords(label);
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.12)}" fill="${colors.bg}"/>
      <rect x="${Math.round(size * 0.12)}" y="${Math.round(size * 0.12)}" width="${Math.round(size * 0.76)}" height="${Math.round(size * 0.76)}" rx="${Math.round(size * 0.1)}" fill="${colors.accent}" opacity="0.88"/>
      <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.22)}" font-weight="700">${escapeXml(initials(safeLabel))}</text>
      <text x="50%" y="76%" text-anchor="middle" fill="${colors.fg}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(size * 0.08)}" opacity="0.88">${escapeXml(safeLabel.slice(0, 18))}</text>
    </svg>
  `);
}

export function featuredArt(title: string) {
  return placeholderArt(title, { kicker: 'Featured', width: 760, height: 760 });
}

export function marketArt(title: string) {
  return placeholderArt(title, { kicker: 'Explore', width: 640, height: 480 });
}

export function creatorAvatar(name: string) {
  return placeholderAvatar(name, { size: 96 });
}

export function wishlistTile(title: string, index: number) {
  return placeholderTile(`${title} ${index + 1}`, { size: 260 });
}
