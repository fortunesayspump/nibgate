type PublishedPost = { status?: string; publicAccess?: boolean; type?: string };
const routes: Record<string, string> = { article: 'writing', photo: 'photos', music: 'music', video: 'video', document: 'docs' };

// A public paid teaser is discoverable, but the body remains behind the existing
// backend redaction/access gate. Invite-only, draft and unknown posts stay out.
export function creatorPostRobots(post: PublishedPost | undefined, routeType: string, network = 'testnet') {
  const index = network.toLowerCase() === 'mainnet' && post?.status === 'published'
    && post.publicAccess === true && routes[post.type || ''] === routeType;
  return { index, follow: index };
}
