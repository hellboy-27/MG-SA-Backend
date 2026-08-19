const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class BackupManager {
  constructor(dbPath, backupDir) {
    this.dbPath = dbPath;
    this.backupDir = backupDir;
    this.maxBackups = 14; // Keep 14 backups (7 days x 2 daily)
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.zip`;
    const backupPath = path.join(this.backupDir, backupName);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`[BACKUP] Created: ${backupName} (${archive.pointer()} bytes)`);
        this.cleanOldBackups();
        resolve(backupPath);
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add database file
      if (fs.existsSync(this.dbPath)) {
        archive.file(this.dbPath, { name: 'database.db' });
      }

      // Add WAL and SHM files if they exist
      const walPath = this.dbPath + '-wal';
      const shmPath = this.dbPath + '-shm';
      if (fs.existsSync(walPath)) archive.file(walPath, { name: 'database.db-wal' });
      if (fs.existsSync(shmPath)) archive.file(shmPath, { name: 'database.db-shm' });

      archive.finalize();
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
