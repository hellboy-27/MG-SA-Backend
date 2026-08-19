const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

class BackupManager {
  constructor(backupDir) {
    this.backupDir = backupDir;
    this.maxBackups = 14;

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.zip`;
    const backupPath = path.join(this.backupDir, backupName);
    const dumpFile = path.join(this.backupDir, `dump-${timestamp}.sql`);

    return new Promise((resolve, reject) => {
      try {
        // Export PostgreSQL data to SQL file
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
          console.log('[BACKUP] No DATABASE_URL, skipping');
          return resolve(null);
        }

        try {
          execSync(`pg_dump "${dbUrl}" > "${dumpFile}"`, { timeout: 30000 });
        } catch (dumpErr) {
          console.error('[BACKUP] pg_dump failed:', dumpErr.message);
          return resolve(null);
        }

        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
          console.log(`[BACKUP] Created: ${backupName} (${archive.pointer()} bytes)`);
          // Clean up SQL dump file
          if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
          this.cleanOldBackups();
          resolve(backupPath);
        });

        archive.on('error', reject);
        archive.pipe(output);

        if (fs.existsSync(dumpFile)) {
          archive.file(dumpFile, { name: 'database.sql' });
        }

        archive.finalize();
      } catch (err) {
        console.error('[BACKUP] Error:', err.message);
        reject(err);
      }
    });
  }

  cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
        .sort()
        .reverse();

      if (files.length > this.maxBackups) {
        files.slice(this.maxBackups).forEach(f => {
          fs.unlinkSync(path.join(this.backupDir, f));
          console.log(`[BACKUP] Deleted old: ${f}`);
        });
      }
    } catch (err) {
      console.error('[BACKUP] Clean error:', err.message);
    }
  }

  getBackupList() {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
        .sort()
        .reverse()
        .map(f => ({
          name: f,
          size: fs.statSync(path.join(this.backupDir, f)).size,
          created: fs.statSync(path.join(this.backupDir, f)).birthtime
        }));
    } catch {
      return [];
    }
  }
}

module.exports = BackupManager;
