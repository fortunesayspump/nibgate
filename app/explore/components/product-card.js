import { escapeHtml } from 'nibgate/src/shared/html.js';
import { exploreRoutes } from '../routes.js';

const topCreatorBadge = '<span class="top-creator-badge" aria-label="Top creator"><svg width="16" height="16" viewBox="3.5 5 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.6895 14.4967C12.2571 14.7205 11.7429 14.7205 11.3105 14.4967L5.31055 11.3903C4.81285 11.1326 4.50011 10.6187 4.5 10.0582L4.5 7.41662C4.5 6.5882 5.17157 5.91662 6 5.91662L18 5.91663C18.8284 5.91663 19.5 6.5882 19.5 7.41663L19.5 10.0582C19.4999 10.6187 19.1872 11.1326 18.6895 11.3903L12.6895 14.4967Z" fill="#7C9A6D" stroke="black"/><circle cx="12" cy="18.8333" r="2.45" fill="#E7EFE4" stroke="#242423" stroke-width="1.1"/><path d="M9 5.41663H10V13.4166L9 12.8974V5.41663Z" fill="black"/><path d="M14 5.41663H15V13.0166L14 13.4166V5.4166Z" fill="black"/></svg></span>';
const playIcon = '<span class="content-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.4v13.2L18.6 12 8 5.4Z"/></svg></span>';
const waveform = '<span class="content-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>';

function creatorRow({ creator, avatar, topCreator }) {
  return `<a class="explore-creator" href="${exploreRoutes.creators}">
    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" loading="lazy" />` : ''}
    ${escapeHtml(creator)}
    ${topCreator ? topCreatorBadge : ''}
  </a>`;
}

function priceTag(price) {
  return `<span class="unlock-price" aria-label="Price ${escapeHtml(price)}">${escapeHtml(price)}</span>`;
}

function contentMeta({ type, meta, unlocks }) {
  return `<div class="content-meta">
    <span>${escapeHtml(type)}</span>
    ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
    ${unlocks ? `<span>${escapeHtml(unlocks)}</span>` : ''}
  </div>`;
}

function typeClass(type) {
  return String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function mediaOverlay(product) {
  if (product.type === 'Video') return playIcon;
  if (product.type === 'Music') return waveform;
  return '';
}

export function featuredCard(product) {
  const contentType = typeClass(product.type);

  return `<article class="explore-feature-card content-card-${contentType}">
    <figure class="explore-art">
      <img src="${escapeHtml(product.image)}" alt="" loading="lazy" />
      ${mediaOverlay(product)}
    </figure>
    <section class="explore-card-copy">
      <header>
        <span class="content-type">${escapeHtml(product.type)}</span>
        <a href="${exploreRoutes.products}"><h2>${escapeHtml(product.title)}</h2></a>
        <small>${escapeHtml(product.summary)}</small>
        ${creatorRow(product)}
      </header>
      <footer>
        ${contentMeta(product)}
        ${priceTag(product.price)}
      </footer>
    </section>
  </article>`;
}

export function articleCard(product) {
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;
  
  return `<article class="article-card">
    <div class="article-header">
      <img class="article-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(product.creator)}" loading="lazy" />
      <div class="article-author-info">
        <span class="article-author-name">${escapeHtml(product.creator || 'Creator')}</span>
        <span class="article-meta-time">4 hours ago</span>
      </div>
    </div>
    <div class="article-body">
      <img class="article-media" src="${escapeHtml(product.image)}" alt="Article cover" loading="lazy" />
      <div class="article-content">
        <h3 class="article-title">${escapeHtml(product.title)}</h3>
        <p class="article-summary">${escapeHtml(product.summary || 'No description available for this content.')}</p>
      </div>
    </div>
    <div class="article-footer">
      <div class="article-socials">
        <button class="article-action" aria-label="Like">♡ 52</button>
        <button class="article-action" aria-label="Comment">🗨 16</button>
      </div>
      <button class="article-action" aria-label="Share">➦</button>
    </div>
  </article>`;
}

export function marketCard(product) {
  const contentType = typeClass(product.type);
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;

  // Mocking dynamic natural aspect ratios for masonry layout
  const mockRatios = ['16/9', '4/5', '1/1', '3/4', '4/3', '5/4'];
  const randomRatio = mockRatios[Math.floor(Math.random() * mockRatios.length)];

  // Inject the random ratio onto the container so the image sizes it naturally
  return `<article class="market-card content-card-${contentType}">
    <div class="market-media" style="aspect-ratio: ${randomRatio};">
      <img class="market-thumbnail" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" />
      
      ${product.type === 'Video' ? `
      <div class="market-play-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>` : ''}

      ${product.type === 'Music' ? `
      <div class="market-music-player">
        <button class="music-play-btn" aria-label="Play">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <div class="music-waveform">
          ${'<i></i>'.repeat(40)}
        </div>
      </div>` : ''}

      <div class="market-overlay">
        <div class="market-badges">
          <span class="market-badge">${escapeHtml(product.type)}</span>
          <div class="market-actions">
            <button class="market-action-btn" aria-label="Like" onclick="event.preventDefault();">♡</button>
            <button class="market-action-btn" aria-label="Bookmark" onclick="event.preventDefault();">⚑</button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="market-info">
      <div class="market-info-header">
        <h3 class="market-title">${escapeHtml(product.title)}</h3>
        <span class="market-price">${escapeHtml(product.price)}</span>
      </div>
      
      <p class="market-summary">${escapeHtml(product.summary || 'No description available for this content.')}</p>
      
      <div class="market-info-footer">
        <a class="market-creator" href="${exploreRoutes.creators}">
          <img class="market-avatar" src="${escapeHtml(avatar)}" alt="Creator" />
          <span class="market-creator-name">${escapeHtml(product.creator || 'Creator')}</span>
        </a>
      </div>
    </div>
  </article>`;
}

export function exploreCard(product) {
  if (product.type === 'Article' || product.type === 'Writing') {
    return articleCard(product);
  }
  return marketCard(product);
}

