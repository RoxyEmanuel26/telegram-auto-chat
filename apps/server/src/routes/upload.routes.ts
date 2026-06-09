import { Router, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// Helper to determine the public URL of the server (e.g. under Hugging Face Space reverse proxy)
const getPublicUrl = (req: Request): string => {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  if (process.env.SPACE_HOST) {
    return `https://${process.env.SPACE_HOST}`;
  }
  return `${req.protocol}://${req.get('host')}`;
};
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Multer file filter (restrict to images, video, docs, audio)
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    // Videos
    'video/mp4', 'video/quicktime',
    // Documents
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv',
    // Audio
    'audio/mpeg', 'audio/ogg', 'audio/mp3'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Harap upload gambar, video, audio, atau dokumen standard.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // Max 50 MB
  }
});

// POST /api/upload - Requires login (ADMIN/EDITOR roles)
router.post(
  '/',
  authenticateJWT,
  requireRole([UserRole.ADMIN, UserRole.EDITOR]),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'File tidak ditemukan atau format tidak valid' });
      return;
    }

    const baseUrl = getPublicUrl(req);
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
    res.status(200).json({
      message: 'File berhasil diupload',
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  }
);

export default router;
