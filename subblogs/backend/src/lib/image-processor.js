let processor;

function getImageProcessor() {
  if (!processor) {
    const sharp = require('sharp');
    sharp.cache({ memory: 8, files: 0, items: 32 });
    sharp.concurrency(1);
    processor = sharp;
  }
  return processor;
}

module.exports = { getImageProcessor };
