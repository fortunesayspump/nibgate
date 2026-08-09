const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const { putBlob } = require('@nibgate/sdk/server');
const { generateContentKey, encryptBytes, packCipherBlob } = require('@nibgate/sdk/server');
const { wrapContentKey } = require('../../lib/keywrap');
const { registerR2Provider } = require('../../lib/storage');
const config = require('../../config/config');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

registerR2Provider();
const useR2 = config.r2?.endpoint ? true : false;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const IMAGE_MIMES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg']);
const AUDIO_MIMES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
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

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const storage = useR2 ? multer.memoryStorage() : multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
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

async function processImage(buffer, ext) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const width = Math.min(meta.width || 2560, 2560);
  const resized = await image.resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 4 }).toBuffer();
  return { buffer: resized, contentType: 'image/webp', ext: '.webp' };
}

router.post('/', authenticate, async (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    if (!useR2) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      let filename = req.file.filename;

      if (IMAGE_EXTS.has(ext)) {
        try {
          const processed = await processImage(fs.readFileSync(req.file.path), ext);
          const webpName = `${path.basename(filename, ext)}.webp`;
          const webpPath = path.join(UPLOAD_DIR, webpName);
          fs.writeFileSync(webpPath, processed.buffer);
          fs.unlinkSync(req.file.path);
          filename = webpName;
        } catch {}
      }

      const url = `/uploads/${filename}`;
      return res.json({ success: true, url, filename, name: req.file.originalname, size: req.file.size, contentType: IMAGE_MIMES[ext] || AUDIO_MIMES[ext] || VIDEO_MIMES[ext] || DOCUMENT_MIMES[ext] || req.file.mimetype });
    }

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      let body = req.file.buffer;
      let contentType = DOCUMENT_MIMES[ext] || IMAGE_MIMES[ext] || AUDIO_MIMES[ext] || VIDEO_MIMES[ext] || req.file.mimetype;

      if (IMAGE_EXTS.has(ext)) {
        const processed = await processImage(body, ext);
        body = processed.buffer;
        contentType = processed.contentType;
      }

      const contentKey = generateContentKey();
      const enc = encryptBytes(contentKey, body);
      const blob = packCipherBlob(enc);
      const encKey = `blog/${req.siteId}/enc/media/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
      const { storageRef } = await putBlob({ key: encKey, data: blob, contentType: 'application/octet-stream' });
      res.json({
        success: true,
        storageRef,
        encryptedKey: wrapContentKey(contentKey.toString('base64')),
        contentType,
        name: req.file.originalname,
        size: req.file.size,
        encrypted: true,
      });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

module.exports = router;
