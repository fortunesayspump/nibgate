import crypto from 'node:crypto';
import { getUserBySession } from '@nibgate/internal/auth.js';
import { putBlob, deleteBlob } from '@nibgate/sdk/server';
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

async function requireAuth(req, res, next) {
  const sessionToken = req.cookies.auth_session;
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  next();
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
}
