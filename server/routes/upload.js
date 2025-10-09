import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export default function createUploadRouter(options) {
  const {
    uploadRoot,
    tempDir,
    maxFiles,
    maxTotalSize,
    perFileLimit = 25 * 1024 * 1024
  } = options;

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      files: maxFiles,
      fileSize: perFileLimit
    }
  });

  const router = express.Router();

  router.post('/', upload.array('files', maxFiles), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > maxTotalSize) {
        for (const file of req.files) {
          fs.rmSync(file.path, { force: true });
        }
        return res.status(413).json({ error: 'Total upload size exceeds allowed limit' });
      }

      const sessionId = req.sessionId ?? generateSessionId();
      const sessionDir = path.join(uploadRoot, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const files = [];
      for (const file of req.files) {
        const originalName = sanitizeFilename(file.originalname);
        const destination = getUniqueDestination(sessionDir, originalName);
        await fs.promises.rename(file.path, destination);
        const savedName = path.basename(destination);
        files.push({
          name: savedName,
          url: `/api/download/${sessionId}/${encodeURIComponent(savedName)}`
        });
      }

      res.json({ sessionId, files });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload files' });
    }
  });

  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Too many files uploaded' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds size limit' });
      }
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  });

  return router;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getUniqueDestination(dir, filename) {
  const base = path.parse(filename).name;
  const ext = path.parse(filename).ext;
  let counter = 0;
  let finalName = filename;

  while (fs.existsSync(path.join(dir, finalName))) {
    counter += 1;
    finalName = `${base}-${counter}${ext}`;
  }

  return path.join(dir, finalName);
}

function generateSessionId() {
  return Math.random().toString(36).slice(2, 10);
}
