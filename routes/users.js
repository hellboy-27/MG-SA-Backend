const express = require('express');
const db = require('../database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, email, role, email_verified, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, email, role, email_verified, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Delete user (admin only, cannot delete self)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
