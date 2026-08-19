const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const User = require('./models/User');
const Mod = require('./models/Mod');
const Comment = require('./models/Comment');
const Rating = require('./models/Rating');
const Suggestion = require('./models/Suggestion');

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
    const dumpFile = path.join(this.backupDir, `dump-${timestamp}.json`);

    return new Promise((resolve, reject) => {
      try {
        // Export MongoDB data to JSON
        const exportData = async () => {
          const users = await User.find().lean();
          const mods = await Mod.find().lean();
          const comments = await Comment.find().lean();
          const ratings = await Rating.find().lean();
          const suggestions = await Suggestion.find().lean();

          return { users, mods, comments, ratings, suggestions, exportedAt: new Date().toISOString() };
        };

        exportData().then(data => {
          fs.writeFileSync(dumpFile, JSON.stringify(data, null, 2));
          console.log(`[BACKUP] MongoDB data exported to ${dumpFile}`);

          const output = fs.createWriteStream(backupPath);
          const archive = archiver('zip', { zlib: { level: 9 } });

          output.on('close', () => {
            console.log(`[BACKUP] Created: ${backupName} (${archive.pointer()} bytes)`);
            if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
            this.cleanOldBackups();
            resolve(backupPath);
          });

          archive.on('error', reject);
          archive.pipe(output);

          if (fs.existsSync(dumpFile)) {
            archive.file(dumpFile, { name: 'database.json' });
          }

          archive.finalize();
        }).catch(err => {
          console.error('[BACKUP] Export failed:', err.message);
          resolve(null);
        });
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
