import { featuredSection } from '../sections/featured.js';
import { marketSection } from '../sections/market.js';
import { wishlistSection } from '../sections/wishlists.js';

export function exploreHomePage() {
  return `${featuredSection()}${marketSection()}${wishlistSection()}`;
}
