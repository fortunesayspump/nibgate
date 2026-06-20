import { wishlistCard } from '../components/wishlist-card.js';
import { wishlists } from '../data/catalog.js';

export function wishlistSection() {
  return `<section class="wishlist-section" aria-labelledby="wishlist-title">
    <h2 id="wishlist-title">Wishlists you might like</h2>
    <div class="wishlist-grid">
      ${wishlists.map(wishlistCard).join('')}
    </div>
  </section>`;
}
