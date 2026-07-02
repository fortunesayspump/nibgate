import { normalizeResource } from './resource.js';

export function normalizeRating(input = {}) {
  const value = typeof input === 'number' ? input : (input.rating ?? input.stars ?? input.ratingValue ?? input.score);
  const numeric = Number.parseFloat(value);
  const ratingValue = Number.isFinite(numeric)
    ? Math.max(1, Math.min(50, numeric <= 5 ? Math.round(numeric * 10) : Math.round(numeric)))
    : null;
  return {
    ...input,
    rating: ratingValue ? ratingValue / 10 : undefined,
    ratingValue: ratingValue || undefined
  };
}

export function ratingMessage(resource, rating = {}, options = {}) {
  const normalized = normalizeResource(resource);
  const normalizedRating = normalizeRating(rating);
  const value = normalizedRating.ratingValue || 0;
  return [
    'Nibgate content rating',
    `site:${options.siteDomain || options.domain || normalized.siteDomain || normalized.domain || ''}`,
    `content:${normalized.externalId || normalized.id}`,
    `url:${normalized.url || options.url || ''}`,
    `rating:${value}`,
    'I confirm this rating is tied to my unlock/payment proof.'
  ].join('\n');
}
