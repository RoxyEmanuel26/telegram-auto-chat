import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { previewImport, processImport, getImportHistory } from './import.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `import-${uniqueSuffix}.csv`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB CSV
});

// All bulk import routes require active authentication
router.use(authenticateJWT);

router.get('/history', getImportHistory);
router.post('/preview', requireRole([UserRole.ADMIN, UserRole.EDITOR]), upload.single('file'), previewImport);
router.post('/process', requireRole([UserRole.ADMIN, UserRole.EDITOR]), processImport);

export default router;
