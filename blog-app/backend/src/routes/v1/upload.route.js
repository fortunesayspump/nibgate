const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../../config/config');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

const s3 = new S3Client({
  endpoint: config.r2.endpoint,
  region: 'auto',
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const mimeMap = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error(`File type ${ext} not allowed.`));

    const expectedMime = mimeMap[ext];
    if (file.mimetype !== expectedMime) {
      return cb(new Error(`MIME type ${file.mimetype} does not match file extension ${ext}.`));
    }

    cb(null, true);
  },
});

router.post('/', authenticate, async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const key = `blog/${req.siteId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));

      const url = `${config.r2.publicUrl}/${key}`;
      res.json({ success: true, url, filename: key });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

module.exports = router;
