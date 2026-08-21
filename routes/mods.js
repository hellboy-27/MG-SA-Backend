const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Mod = require('../models/Mod');
const Comment = require('../models/Comment');
const Rating = require('../models/Rating');
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

const upload = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } });

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function getNextModId() {
  const last = await Mod.findOne().sort({ modId: -1 });
  return (last ? last.modId : 0) + 1;
}

// Find mod by sequential modId or MongoDB _id
async function findMod(id) {
  const numId = parseInt(id);
  if (!isNaN(numId)) {
    return await Mod.findOne({ modId: numId });
  }
  return await Mod.findById(id);
}

// Get all mods (public)
router.get('/', async (req, res) => {
  try {
    const mods = await Mod.find().sort({ modId: -1 });
    res.json({ mods });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mods' });
  }
});

// Get single mod (public)
router.get('/:id', async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });
    res.json({ mod });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mod' });
  }
});

// Create mod (admin only)
router.post('/', authMiddleware, adminOnly, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'mod_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const images = req.files?.images ? req.files.images.map(f => f.filename) : [];
    const modFile = req.files?.mod_file ? req.files.mod_file[0] : null;
    const modFileName = modFile ? modFile.filename : '';
    const modSize = modFile ? formatSize(modFile.size) : '';
    const modId = await getNextModId();

    const mod = await Mod.create({
      modId,
      title: title.trim(),
      description: description || '',
      size: modSize,
      imageFilename: images,
      modFilename: modFileName
    });

    res.status(201).json({ message: 'Mod created', id: mod.modId });
  } catch (err) {
    console.error('Create mod error:', err.message);
    res.status(500).json({ error: 'Failed to create mod' });
  }
});

// Update mod (admin only)
router.put('/:id', authMiddleware, adminOnly, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'mod_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    const { title, description, existing_images } = req.body;
    let images;
    if (req.files?.images) {
      images = req.files.images.map(f => f.filename);
    } else if (existing_images) {
      try { images = JSON.parse(existing_images); } catch(e) { images = mod.imageFilename; }
    } else {
      images = mod.imageFilename;
    }

    let modFileName = mod.modFilename;
    let modSize = mod.size;

    if (req.files?.mod_file) {
      // Delete old file
      if (mod.modFilename) {
        const oldPath = path.join(__dirname, '..', 'uploads', 'mods', mod.modFilename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      modFileName = req.files.mod_file[0].filename;
      modSize = formatSize(req.files.mod_file[0].size);
    }

    mod.title = title || mod.title;
    mod.description = description !== undefined ? description : mod.description;
    mod.size = modSize;
    mod.imageFilename = images;
    mod.modFilename = modFileName;
    await mod.save();

    res.json({ message: 'Mod updated' });
  } catch (err) {
    console.error('Update mod error:', err.message);
    res.status(500).json({ error: 'Failed to update mod' });
  }
});

// Delete mod (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    // Delete associated files
    if (mod.imageFilename && mod.imageFilename.length) {
      mod.imageFilename.forEach(f => {
        const fp = path.join(__dirname, '..', 'uploads', 'images', f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
    }
    if (mod.modFilename) {
      const fp = path.join(__dirname, '..', 'uploads', 'mods', mod.modFilename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    await Mod.findByIdAndDelete(mod._id);
    await Comment.deleteMany({ modId: mod._id });
    await Rating.deleteMany({ modId: mod._id });

    res.json({ message: 'Mod deleted' });
  } catch (err) {
    console.error('Delete mod error:', err.message);
    res.status(500).json({ error: 'Failed to delete mod' });
  }
});

// Download counter
router.post('/:id/download', async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (mod) {
      mod.downloads = (mod.downloads || 0) + 1;
      await mod.save();
    }
    res.json({ message: 'Count updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Download mod file
router.get('/:id/file', async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod || !mod.modFilename) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(__dirname, '..', 'uploads', 'mods', mod.modFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });

    res.download(filePath, `${mod.title.replace(/[^a-z0-9]/gi, '_')}_${mod.modFilename}`);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get comments for mod
router.get('/:id/comments', async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });
    const comments = await Comment.find({ modId: mod._id }).sort({ createdAt: -1 });
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post comment
router.post('/:id/comments', authMiddleware, contentLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment is required' });

    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    const comment = await Comment.create({
      modId: mod._id,
      userId: req.user.id,
      username: req.user.username,
      content: content.trim().slice(0, 300)
    });

    res.status(201).json({ message: 'Comment posted', id: comment._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Delete comment (admin or owner)
router.delete('/:modId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (req.user.role !== 'admin' && req.user.id !== comment.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get ratings for mod
router.get('/:id/ratings', async (req, res) => {
  try {
    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });
    const ratings = await Rating.find({ modId: mod._id }).sort({ createdAt: -1 });
    const stats = await Rating.aggregate([
      { $match: { modId: mod._id } },
      { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    const avg = stats.length ? Math.round(stats[0].avg * 10) / 10 : 0;
    const count = stats.length ? stats[0].count : 0;
    res.json({ ratings, avg, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Post rating
router.post('/:id/ratings', authMiddleware, contentLimiter, async (req, res) => {
  try {
    const { stars, comment } = req.body;
    if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'Stars must be 1-5' });

    const mod = await findMod(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    const existing = await Rating.findOne({ modId: mod._id, userId: req.user.id });
    if (existing) {
      await Rating.findByIdAndUpdate(existing._id, { stars, comment: comment || '' });
    } else {
      await Rating.create({ modId: mod._id, userId: req.user.id, stars, comment: comment || '' });
    }

    const stats = await Rating.aggregate([
      { $match: { modId: mod._id } },
      { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } }
    ]);
    const avg = stats.length ? Math.round(stats[0].avg * 10) / 10 : 0;
    const count = stats.length ? stats[0].count : 0;
    mod.ratingAvg = avg;
    mod.ratingCount = count;
    await mod.save();

    res.json({ message: 'Rating saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

module.exports = router;
