const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware, adminOnly, optionalAuth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/security');

const router = express.Router();

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'mod_file'
      ? path.join(__dirname, '..', 'uploads', 'mods')
      : path.join(__dirname, '..', 'uploads', 'images');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedMod = ['.zip', '.rar', '.7z'];

  if (file.fieldname === 'images') {
    cb(null, allowedImage.includes(path.extname(file.originalname).toLowerCase()));
  } else if (file.fieldname === 'mod_file') {
    cb(null, allowedMod.includes(path.extname(file.originalname).toLowerCase()));
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Get all mods (public)
router.get('/', (req, res) => {
  try {
    const mods = db.prepare('SELECT * FROM mods ORDER BY created_at DESC').all();
    // Parse image_filename JSON
    const parsed = mods.map(m => ({
      ...m,
      image_filename: m.image_filename ? JSON.parse(m.image_filename) : []
    }));
    res.json({ mods: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mods' });
  }
});

// Get single mod (public)
router.get('/:id', (req, res) => {
  try {
    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });
    mod.image_filename = mod.image_filename ? JSON.parse(mod.image_filename) : [];
    res.json({ mod });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mod' });
  }
});

// Create mod (admin only)
router.post('/', authMiddleware, adminOnly, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'mod_file', maxCount: 1 }
]), (req, res) => {
  try {
    const { title, description, size } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const images = req.files?.images ? req.files.images.map(f => f.filename) : [];
    const modFile = req.files?.mod_file ? req.files.mod_file[0].filename : null;

    const result = db.prepare(
      'INSERT INTO mods (title, description, size, image_filename, mod_filename) VALUES (?, ?, ?, ?, ?)'
    ).run(title.trim(), description || '', size || '', JSON.stringify(images), modFile);

    res.status(201).json({ message: 'Mod created', id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create mod error:', err.message);
    res.status(500).json({ error: 'Failed to create mod' });
  }
});

// Update mod (admin only)
router.put('/:id', authMiddleware, adminOnly, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'mod_file', maxCount: 1 }
]), (req, res) => {
  try {
    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    const { title, description, size } = req.body;
    const images = req.files?.images ? req.files.images.map(f => f.filename) : JSON.parse(mod.image_filename || '[]');
    const modFile = req.files?.mod_file ? req.files.mod_file[0].filename : mod.mod_filename;

    db.prepare('UPDATE mods SET title=?, description=?, size=?, image_filename=?, mod_filename=? WHERE id=?')
      .run(title || mod.title, description || mod.description, size || mod.size, JSON.stringify(images), modFile, req.params.id);

    res.json({ message: 'Mod updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mod' });
  }
});

// Delete mod (admin only)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    // Delete associated files
    if (mod.image_filename) {
      JSON.parse(mod.image_filename).forEach(f => {
        const fp = path.join(__dirname, '..', 'uploads', 'images', f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
    }
    if (mod.mod_filename) {
      const fp = path.join(__dirname, '..', 'uploads', 'mods', mod.mod_filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    db.prepare('DELETE FROM mods WHERE id = ?').run(req.params.id);
    res.json({ message: 'Mod deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete mod' });
  }
});

// Download counter
router.post('/:id/download', (req, res) => {
  try {
    db.prepare('UPDATE mods SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Count updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Get comments for mod
router.get('/:id/comments', (req, res) => {
  try {
    const comments = db.prepare('SELECT * FROM comments WHERE mod_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post comment
router.post('/:id/comments', authMiddleware, contentLimiter, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment is required' });

    const mod = db.prepare('SELECT id FROM mods WHERE id = ?').get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    const result = db.prepare('INSERT INTO comments (mod_id, user_id, username, content) VALUES (?, ?, ?, ?)')
      .run(req.params.id, req.user.id, req.user.username, content.trim().slice(0, 300));

    res.status(201).json({ message: 'Comment posted', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Delete comment (admin or owner)
router.delete('/:modId/comments/:commentId', authMiddleware, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (req.user.role !== 'admin' && req.user.id !== comment.user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get ratings for mod
router.get('/:id/ratings', (req, res) => {
  try {
    const ratings = db.prepare('SELECT * FROM ratings WHERE mod_id = ? ORDER BY created_at DESC').all(req.params.id);
    const stats = db.prepare('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE mod_id = ?').get(req.params.id);
    res.json({ ratings, avg: stats.avg || 0, count: stats.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Post rating
router.post('/:id/ratings', authMiddleware, contentLimiter, (req, res) => {
  try {
    const { stars, comment } = req.body;
    if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'Stars must be 1-5' });

    const mod = db.prepare('SELECT id FROM mods WHERE id = ?').get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    // Upsert rating
    const existing = db.prepare('SELECT id FROM ratings WHERE mod_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (existing) {
      db.prepare('UPDATE ratings SET stars = ?, comment = ? WHERE id = ?').run(stars, comment || null, existing.id);
    } else {
      db.prepare('INSERT INTO ratings (mod_id, user_id, stars, comment) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, stars, comment || null);
    }

    // Update mod rating stats
    const stats = db.prepare('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE mod_id = ?').get(req.params.id);
    db.prepare('UPDATE mods SET rating_avg = ?, rating_count = ? WHERE id = ?')
      .run(Math.round(stats.avg * 10) / 10, stats.count, req.params.id);

    res.json({ message: 'Rating saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

module.exports = router;
