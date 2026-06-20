import { escapeHtml } from 'nibgate/src/shared/html.js';
import { exploreRoutes } from '../routes.js';

const starIcon = '<svg class="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m6.87 14.33-1.83 6.4c-.12.4.03.84.37 1.08.34.25.8.26 1.14.02L12 18.2l5.45 3.63a.988.988 0 0 0 1.14-.02c.34-.25.49-.68.37-1.08l-1.83-6.4 4.54-4.08c.3-.27.41-.69.28-1.06-.13-.38-.47-.64-.87-.68l-5.7-.45-2.47-5.46a.998.998 0 0 0-1.82 0L8.62 8.06l-5.7.45c-.4.03-.74.3-.87.68s-.02.8.28 1.06z"/></svg>';
const topCreatorBadge = '<span class="top-creator-badge" aria-label="Top creator"><svg width="16" height="16" viewBox="3.5 5 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.6895 14.4967C12.2571 14.7205 11.7429 14.7205 11.3105 14.4967L5.31055 11.3903C4.81285 11.1326 4.50011 10.6187 4.5 10.0582L4.5 7.41662C4.5 6.5882 5.17157 5.91662 6 5.91662L18 5.91663C18.8284 5.91663 19.5 6.5882 19.5 7.41663L19.5 10.0582C19.4999 10.6187 19.1872 11.1326 18.6895 11.3903L12.6895 14.4967Z" fill="#7C9A6D" stroke="black"/><circle cx="12" cy="18.8333" r="2.45" fill="#E7EFE4" stroke="#242423" stroke-width="1.1"/><path d="M9 5.41663H10V13.4166L9 12.8974V5.41663Z" fill="black"/><path d="M14 5.41663H15V13.0166L14 13.4166V5.4166Z" fill="black"/></svg></span>';

function creatorRow({ creator, avatar, topCreator }) {
  return `<a class="explore-creator" href="${exploreRoutes.creators}">
    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" loading="lazy" />` : ''}
    ${escapeHtml(creator)}
    ${topCreator ? topCreatorBadge : ''}
  </a>`;
}

function priceTag(price) {
  return `<div class="price-ticket" aria-label="Price ${escapeHtml(price)}">
    <span>${escapeHtml(price)}</span>
    <i aria-hidden="true"></i>
  </div>`;
}

function rating({ rating, reviews }) {
  return `<div class="explore-rating" aria-label="Rating">
    ${starIcon}
    <span>${escapeHtml(rating)}</span>
    <span>(${escapeHtml(reviews)})</span>
  </div>`;
}

export function featuredCard(product) {
  return `<article class="explore-feature-card">
    <figure class="explore-art">
      <img src="${escapeHtml(product.image)}" alt="" loading="lazy" />
    </figure>
    <section class="explore-card-copy">
      <header>
        <a href="${exploreRoutes.products}"><h2>${escapeHtml(product.title)}</h2></a>
        <small>${escapeHtml(product.summary)}</small>
        ${creatorRow(product)}
      </header>
      <footer>
        ${priceTag(product.price)}
        ${rating(product)}
      </footer>
    </section>
  </article>`;
}

export function marketCard([title, creator, price, ratingValue, reviews, image, avatar]) {
  return `<article class="market-card">
    <figure class="market-art"><img src="${escapeHtml(image)}" alt="" loading="lazy" /></figure>
    <header>
      <a href="${exploreRoutes.products}" aria-label="${escapeHtml(title)}"><h3>${escapeHtml(title)}</h3></a>
      ${creatorRow({ creator, avatar })}
      ${rating({ rating: ratingValue, reviews })}
    </header>
    <footer>
      ${priceTag(price)}
    </footer>
  </article>`;
}
