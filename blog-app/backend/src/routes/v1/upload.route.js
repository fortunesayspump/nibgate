const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
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
  storage,
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

router.post('/', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    res.json({ success: true, url: `/uploads/${req.file.filename}`, filename: req.file.filename });
  });
});

module.exports = router;
