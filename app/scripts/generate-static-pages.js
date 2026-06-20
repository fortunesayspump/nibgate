import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { explorePage } from '../explore/page.js';
import { sitePage, siteRoutePage } from '../server/site/page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const distDir = path.join(appDir, 'dist');

function findBuiltCssHref() {
  try {
    const viteHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const cssMatch = viteHtml.match(/href="([^"]+\.css)"/);
    return cssMatch ? cssMatch[1] : '/assets/styles.css';
  } catch {
    return '/assets/styles.css';
  }
}

function writePage(routePath, html) {
  const normalizedPath = routePath === '/' ? '/index.html' : `${routePath.replace(/\/$/, '')}/index.html`;
  const filePath = path.join(distDir, normalizedPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

const cssHref = findBuiltCssHref();

const siteRoutes = ['/', '/about', '/blog', '/features', '/get-started', '/signin'];
for (const routePath of siteRoutes) {
  const html = routePath === '/'
    ? sitePage({ cssHref })
    : routePath === '/about'
      ? sitePage({ cssHref, activePath: '/about' })
      : siteRoutePage({ cssHref, path: routePath });

  if (html) writePage(routePath, html);
}

const exploreRoutes = ['/', '/products', '/categories', '/wishlists', '/creators'];
for (const routePath of exploreRoutes) {
  const outputPath = routePath === '/' ? '/explore' : `/explore${routePath}`;
  writePage(outputPath, explorePage({
    cssHref,
    siteOrigin: '',
    path: routePath,
    basePath: '/explore'
  }));
}

