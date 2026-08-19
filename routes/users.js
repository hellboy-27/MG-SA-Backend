const express = require('express');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Rating = require('../models/Rating');
const Suggestion = require('../models/Suggestion');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('username email role emailVerified createdAt').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('username email role emailVerified createdAt');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Delete user (admin only, cannot delete self)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent deleting the super admin
    if (user.email === 'duabua1@gmail.com') {
      return res.status(400).json({ error: 'Cannot delete the main admin' });
    }

    await User.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ userId: req.params.id });
    await Rating.deleteMany({ userId: req.params.id });
    await Suggestion.deleteMany({ userId: req.params.id });

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
