export function unlockedContent(route, config, paymentId) {
  return {
    ok: true,
    contentId: route.id,
    title: route.title,
    text: 'Unlocked demo content. In production this would proxy the origin response or return licensed article text for agent use.',
    citation: {
      url: `${config.site.origin}${route.path}`,
      paid: true,
      paymentId
    }
  };
}
