import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import cleanupOldSessions from './cleanup.js';
import createUploadRouter from './routes/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, '_tmp');

ensureDirectory(UPLOAD_ROOT);
ensureDirectory(TEMP_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/upload', createUploadRouter({
  uploadRoot: UPLOAD_ROOT,
  tempDir: TEMP_DIR,
  maxFiles: MAX_FILES,
  maxTotalSize: MAX_TOTAL_SIZE
}));

app.get('/api/download/:sessionId/:fileName', (req, res) => {
  const { sessionId, fileName } = req.params;
  const filePath = path.join(UPLOAD_ROOT, sessionId, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    }
  });
});

app.get('/api/download-zip/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(UPLOAD_ROOT, sessionId);

  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.attachment(`design-tools-${sessionId}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).end();
  });

  archive.pipe(res);
  archive.directory(sessionDir, false);
  archive.finalize();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MS || '300000', 10);
setInterval(() => {
  cleanupOldSessions(UPLOAD_ROOT);
}, CLEANUP_INTERVAL);

app.listen(PORT, () => {
  console.log(`Design Tools server running on port ${PORT}`);
});

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
