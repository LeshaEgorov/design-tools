import fs from 'fs';
import path from 'path';

const ONE_HOUR = 60 * 60 * 1000;

export default function cleanupOldSessions(uploadRoot, options = {}) {
  const now = Date.now();
  const lifetime = options.lifetimeMs || ONE_HOUR;
  const log = options.logger || console;

  if (!fs.existsSync(uploadRoot)) {
    return;
  }

  const sessions = fs.readdirSync(uploadRoot);

  sessions.forEach((sessionId) => {
    if (sessionId.startsWith('_')) {
      return;
    }

    const sessionDir = path.join(uploadRoot, sessionId);
    try {
      const stats = fs.statSync(sessionDir);
      if (now - stats.ctimeMs > lifetime) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        log.info?.(`Cleanup removed session ${sessionId}`) ?? log.log(`Cleanup removed session ${sessionId}`);
      }
    } catch (error) {
      log.error?.(`Cleanup failed for ${sessionId}: ${error.message}`) ?? log.log(`Cleanup failed for ${sessionId}: ${error.message}`);
    }
  });
}
