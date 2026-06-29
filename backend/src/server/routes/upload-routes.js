import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { getUserBySession } from '@nibgate/cli/src/core/auth.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024
};

function uploadConfig() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/+$/, '') };
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

function extensionFor(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'bin';
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
      const config = uploadConfig();
      if (!config) {
        return res.status(500).json({ error: 'R2 upload environment is not configured' });
      }

      const target = req.body.target === 'cover' ? 'cover' : 'avatar';
      const parsed = parseDataUrl(req.body.image);
      if (!parsed) {
        return res.status(400).json({ error: 'A base64 image data URL is required' });
      }
      if (!ALLOWED_TYPES.has(parsed.contentType)) {
        return res.status(400).json({ error: 'Unsupported image type' });
      }
      if (parsed.buffer.length > MAX_IMAGE_BYTES[target]) {
        return res.status(400).json({ error: `${target} image is too large` });
      }

      const client = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        }
      });
      const ext = extensionFor(parsed.contentType);
      const key = `${target}s/${req.user.id}/${crypto.randomUUID()}.${ext}`;

      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: parsed.buffer,
        ContentType: parsed.contentType,
        CacheControl: 'public, max-age=31536000, immutable'
      }));

      res.json({
        success: true,
        url: `${config.publicUrl}/${key}`,
        key
      });
    } catch (error) {
      res.status(500).json({ error: 'Upload failed', details: error.message });
    }
  });
}
