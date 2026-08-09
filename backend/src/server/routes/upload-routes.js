import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { requireAuth } from '@nibgate/internal/auth.js';
import {
  putBlob, deleteBlob, generateContentKey, encryptBytes, packCipherBlob, wrapKey
} from '@nibgate/sdk/server';
import { shareKeySecret } from '../nibshare/utils.js';
import sharp from 'sharp';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);
const MAX_IMAGE_BYTES = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024
};
const OUTPUT_SIZES = {
  avatar: { width: 512, height: 512 },
  cover: { width: 1600, height: 640 }
};

function getNibgatePublicUrl() {
  return (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  };
}

async function prepareImage(buffer, target) {
  const image = sharp(buffer, { limitInputPixels: 24_000_000, failOn: 'none' }).rotate();
  const metadata = await image.metadata();

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error('Unsupported image type');
  }

  const size = OUTPUT_SIZES[target];
  const output = await image
    .resize({
      width: size.width,
      height: size.height,
      fit: 'cover',
      withoutEnlargement: false
    })
    .webp({ quality: target === 'avatar' ? 82 : 78, effort: 4 })
    .toBuffer();

  return {
    buffer: output,
    contentType: 'image/webp',
    extension: 'webp'
  };
}

function managedKeyFromUrl(url) {
  const publicUrl = getNibgatePublicUrl();
  if (!publicUrl) return '';
  try {
    const parsed = new URL(publicUrl);
    const imageUrl = new URL(url);
    if (parsed.origin !== imageUrl.origin) return '';

    const publicPath = parsed.pathname.replace(/\/+$/, '');
    if (publicPath && !imageUrl.pathname.startsWith(`${publicPath}/`)) return '';

    const key = decodeURIComponent(imageUrl.pathname.slice(publicPath.length).replace(/^\/+/, ''));
    if (!/^(avatars|covers)\/[a-zA-Z0-9_-]+\//.test(key)) return '';
    return key;
  } catch {
    return '';
  }
}

export async function deleteManagedProfileImage(url) {
  if (!url) return;
  const key = managedKeyFromUrl(url);
  if (!key) return;
  await deleteBlob({ storageRef: key }).catch(() => {});
}

export function registerUploadRoutes(app) {
  app.post('/api/uploads/profile-image', requireAuth, async (req, res) => {
    try {
      if (!process.env.R2_ENDPOINT) {
        return res.status(500).json({ error: 'R2 upload environment is not configured' });
      }

      const target = req.body.target === 'cover' ? 'cover' : 'avatar';
      const parsed = parseDataUrl(req.body.image);
      if (!parsed) {
        return res.status(400).json({ error: 'A base64 image data URL is required' });
      }
      if (!parsed.contentType.startsWith('image/')) {
        return res.status(400).json({ error: 'Unsupported image type' });
      }
      if (parsed.buffer.length > MAX_IMAGE_BYTES[target]) {
        return res.status(400).json({ error: `${target} image is too large` });
      }

      let image;
      try {
        image = await prepareImage(parsed.buffer, target);
      } catch (error) {
        console.log('Profile image processing failed:', error.message);
        return res.status(400).json({
          error: error.message === 'Unsupported image type' ? 'Unsupported image type' : 'Could not process image. Try a JPG, PNG, WebP, AVIF, or a smaller image.'
        });
      }
      const key = `${target}s/${req.user.id}/${crypto.randomUUID()}.${image.extension}`;

      const { url } = await putBlob({ key, data: image.buffer, contentType: image.contentType });

      res.json({ success: true, url, key });
    } catch (error) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.post('/api/uploads/content', requireAuth, (req, res) => {
    contentUpload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      if (!process.env.R2_ENDPOINT) {
        return res.status(500).json({ error: 'R2 upload environment is not configured' });
      }

      try {
        const ext = path.extname(req.file.originalname).toLowerCase();
        let body = req.file.buffer;
        let contentType = DOCUMENT_MIMES[ext] || IMAGE_MIMES[ext] || AUDIO_MIMES[ext] || VIDEO_MIMES[ext] || req.file.mimetype;
        let finalExt = ext;

        if (IMAGE_EXTS.has(ext)) {
          const processed = await processContentImage(body);
          body = processed.buffer;
          contentType = processed.contentType;
          finalExt = processed.ext;
        }

        const key = `nibshare/${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${finalExt}`;

        if (req.query.encrypted === '1') {
          const contentKey = generateContentKey();
          const enc = encryptBytes(contentKey, body);
          const blob = packCipherBlob(enc);
          const encKey = `nibshare/${req.user.id}/enc/media/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
          const { storageRef } = await putBlob({ key: encKey, data: blob, contentType: 'application/octet-stream' });
          const result = {
            success: true,
            storageRef,
            encryptedKey: wrapKey(shareKeySecret(), contentKey),
            contentType,
            name: req.file.originalname,
            size: req.file.size,
            encrypted: true,
          };
          if (IMAGE_EXTS.has(ext)) {
            const preview = await processPreviewImage(body);
            const previewKey = `nibshare/${req.user.id}/public/preview/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
            const { url } = await putBlob({
              key: previewKey,
              data: preview.buffer,
              contentType: preview.contentType,
              cacheControl: 'public, max-age=31536000, immutable',
            });
            result.previewUrl = url;
          }
          return res.json(result);
        }

        const { url } = await putBlob({
          key,
          data: body,
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        });

        res.json({ success: true, url, filename: key, name: req.file.originalname, size: req.file.size, contentType });
      } catch (uploadErr) {
        console.log('Content upload failed:', uploadErr.message);
        res.status(500).json({ error: 'Upload failed' });
      }
    });
  });
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const IMAGE_MIMES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma']);
const AUDIO_MIMES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4', '.wma': 'audio/x-ms-wma' };
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv']);
const VIDEO_MIMES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };
const DOCUMENT_EXTS = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.ods', '.docx', '.doc', '.txt', '.md']);
const DOCUMENT_MIMES = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const contentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS, ...DOCUMENT_EXTS];
    if (!allowed.includes(ext)) return cb(new Error(`File type ${ext} not allowed.`));

    if (DOCUMENT_EXTS.has(ext)) {
      return cb(null, true);
    }

    const expectedMime = IMAGE_MIMES[ext] || AUDIO_MIMES[ext] || VIDEO_MIMES[ext] || 'application/pdf';
    if (file.mimetype !== expectedMime) {
      return cb(new Error(`MIME type ${file.mimetype} does not match file extension ${ext}.`));
    }

    cb(null, true);
  },
});

async function processContentImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const width = Math.min(meta.width || 2560, 2560);
  const resized = await image.resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 4 }).toBuffer();
  return { buffer: resized, contentType: 'image/webp', ext: '.webp' };
}

async function processPreviewImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const width = Math.min(meta.width || 1200, 1200);
  const resized = await image.resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
  return { buffer: resized, contentType: 'image/webp' };
}
