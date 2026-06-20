import { placeholderArt, placeholderAvatar, placeholderTile } from '../server/shared/placeholders.js';

export function featuredArt(title) {
  return placeholderArt(title, { kicker: 'Featured', width: 760, height: 760 });
}

export function marketArt(title) {
  return placeholderArt(title, { kicker: 'Explore', width: 640, height: 480 });
}

export function creatorAvatar(name) {
  return placeholderAvatar(name, { size: 96 });
}

export function wishlistTile(title, index) {
  return placeholderTile(`${title} ${index + 1}`, { size: 260 });
}
