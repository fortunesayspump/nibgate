const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../../config/config');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

const s3 = config.r2?.endpoint ? new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
}) : null;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const IMAGE_MIMES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg']);
const AUDIO_MIMES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [...IMAGE_EXTS, ...AUDIO_EXTS, '.pdf'];
    if (!allowed.includes(ext)) return cb(new Error(`File type ${ext} not allowed.`));

    const expectedMime = IMAGE_MIMES[ext] || AUDIO_MIMES[ext] || 'application/pdf';
    if (file.mimetype !== expectedMime) {
      return cb(new Error(`MIME type ${file.mimetype} does not match file extension ${ext}.`));
    }

    cb(null, true);
  },
});

async function processImage(buffer, ext) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const width = Math.min(meta.width || 2000, 2000);
  const resized = await image.resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
  return { buffer: resized, contentType: 'image/webp', ext: '.webp' };
}

router.post('/', authenticate, async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!s3) return res.status(500).json({ error: 'R2 not configured' });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      let body = req.file.buffer;
      let contentType = req.file.mimetype;
      let finalExt = ext;

      if (IMAGE_EXTS.has(ext)) {
        const processed = await processImage(body, ext);
        body = processed.buffer;
        contentType = processed.contentType;
        finalExt = processed.ext;
      }

      const key = `blog/${req.siteId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${finalExt}`;

      await s3.send(new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      const url = `${config.r2.publicUrl}/${key}`;
      res.json({ success: true, url, filename: key });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

module.exports = router;
