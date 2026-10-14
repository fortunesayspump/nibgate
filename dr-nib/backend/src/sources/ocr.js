import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const IMAGE_FORMAT = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
const MAX_PIXELS = 20_000_000;
const require = createRequire(import.meta.url);
const langPath = join(dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0_best_int');
let queue = Promise.resolve();

export function extractImageText(buffer, ext) {
  // OCR is CPU- and memory-heavy. Serialize it within an API instance so
  // several simultaneous uploads cannot create several WASM workers.
  const run = queue.then(() => recognize(buffer, ext));
  queue = run.catch(() => {});
  return run;
}

async function recognize(buffer, ext) {
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new Error('This image could not be read or exceeds the 20-megapixel limit.');
  }
  if (metadata.format !== IMAGE_FORMAT[ext] || (metadata.pages || 1) !== 1) {
    throw new Error('Choose a valid, single-frame PNG, JPEG or WebP image matching its filename.');
  }
  const prepared = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate().flatten({ background: '#ffffff' }).greyscale().normalise()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .png().toBuffer();
  let worker;
  try {
    worker = await createWorker('eng', 1, { langPath, cachePath: tmpdir() });
    const { data } = await worker.recognize(prepared);
    const text = String(data.text || '').trim();
    if (text.length < 10) throw new Error('No readable English text was found in this image. Try a sharper image or a text document.');
    return {
      text: `[Image OCR — verify names, dates and amounts against the original]\n${text}`,
      pages: 1,
      warnings: ['Image text was extracted with OCR. It may misread figures, handwriting and table structure; review the preview and original before using it as evidence.'],
    };
  } catch (error) {
    if (error?.message?.startsWith('No readable English text')) throw error;
    throw new Error('Image text extraction is temporarily unavailable. Please try again or upload a text document.');
  } finally {
    await worker?.terminate().catch(() => {});
  }
}
