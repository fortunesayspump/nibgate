import { siteImagePlaceholder } from '../shared/placeholders.js';

const downloadedIllustrations = {
  'about/ukulele.png': '/assets/nibgate/illustrations/undraw/posts.svg',
  'about/make-your-road.svg': '/assets/nibgate/illustrations/undraw/user-flow.svg',
  'about/sell-anywhere.png': '/assets/nibgate/illustrations/undraw/payments.svg',
  'about/side-project-1.svg': '/assets/nibgate/illustrations/undraw/server.svg',
  'about/side-project-2.svg': '/assets/nibgate/illustrations/undraw/analytics.svg',
  'about/nibhead.svg': '/assets/nibgate/illustrations/undraw/user-flow.svg',
  'about/new-sale.svg': '/assets/nibgate/illustrations/undraw/payments.svg',
  'about/sign-in.svg': '/assets/nibgate/illustrations/undraw/sign-in.svg'
};

export function imagePath(path) {
  if (downloadedIllustrations[path]) {
    return downloadedIllustrations[path];
  }

  return siteImagePlaceholder(path);
}
