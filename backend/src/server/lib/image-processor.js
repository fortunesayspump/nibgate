// Keep libvips and its native caches out of the API's idle startup path.
// Cache decoded operations sparingly; uploaded content already has durable storage.
let processor;

export function getImageProcessor() {
  if (!processor) {
    processor = import('sharp').then(({ default: sharp }) => {
      sharp.cache({ memory: 8, files: 0, items: 32 });
      sharp.concurrency(1);
      return sharp;
    }).catch((error) => {
      processor = undefined;
      throw error;
    });
  }
  return processor;
}
