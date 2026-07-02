import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';
import { jsonResponse } from './response.js';

export function createManifest(input = {}) {
  const origin = input.origin || serverEnv('NIBGATE_SITE_ORIGIN') || '';
  const content = (input.content || input.resources || []).map((resource) => normalizeResource(resource));
  return {
    name: input.name || 'Nibgate creator site',
    origin,
    nibgate: {
      content
    }
  };
}

export function manifestResponse(input = {}) {
  return jsonResponse(createManifest(input));
}
