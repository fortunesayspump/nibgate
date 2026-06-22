import { escapeHtml } from 'nibgate/src/shared/html.js';
import { creatorAvatar, wishlistTile } from '../assets.js';
import { exploreRoutes } from '../routes.js';

const documentIcon = '<svg class="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M14.71 2.29A1 1 0 0 0 14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-.27-.11-.52-.29-.71zM7 7h4v2H7zm10 10H7v-2h10zm0-4H7v-2h10zm-4-4V3.5L18.5 9z"/></svg>';
const bookmarkIcon = '<svg class="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M18 2H6c-1.1 0-2 .9-2 2v17c0 .36.19.69.5.87s.69.18 1 0l6.5-3.72 6.5 3.72c.15.09.33.13.5.13s.35-.04.5-.13c.31-.18.5-.51.5-.87V4c0-1.1-.9-2-2-2"/></svg>';
const followIcon = '<svg class="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M13 6 11 6 11 9 8 9 8 11 11 11 11 14 13 14 13 11 16 11 16 9 13 9 13 6z"/><path d="m18,2H6c-1.1,0-2,.9-2,2v17c0,.36.19.69.5.86.31.18.69.18,1,0l6.5-3.72,6.5,3.72c.15.09.32.13.5.13s.35-.04.5-.14c.31-.18.5-.51.5-.86V4c0-1.1-.9-2-2-2Zm0,8v9.28l-5.5-3.15c-.31-.18-.68-.18-.99,0l-5.5,3.15V4h12v6Z"/></svg>';

export function wishlistCard(wishlist) {
  return `<article class="wishlist-card">
    <figure class="wishlist-mosaic" aria-hidden="true">
      ${wishlist.images.map((image, index) => `<img src="${escapeHtml(wishlistTile(wishlist.title || image, index))}" alt="" loading="lazy" data-tile="${index + 1}" />`).join('')}
    </figure>
    <section class="wishlist-copy">
      <header>
        <a href="${exploreRoutes.wishlists}"><h3>${escapeHtml(wishlist.title)}</h3></a>
        ${wishlist.copy ? `<p>${escapeHtml(wishlist.copy)}</p>` : ''}
        <a class="wishlist-creator" href="${exploreRoutes.creators}">
          <img src="${escapeHtml(creatorAvatar(wishlist.creator))}" alt="" loading="lazy" />
          <span>${escapeHtml(wishlist.creator)}</span>
        </a>
      </header>
      <footer>
        <div>
          <span class="wishlist-products">${documentIcon} ${escapeHtml(wishlist.products)}</span>
          <span>${bookmarkIcon} ${escapeHtml(wishlist.followers)}</span>
        </div>
        <button type="button" aria-label="Follow">${followIcon}</button>
      </footer>
    </section>
  </article>`;
}
