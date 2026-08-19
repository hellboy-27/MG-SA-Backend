const express = require('express');
const db = require('../database');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/security');

const router = express.Router();

// Submit suggestion (authenticated users only)
router.post('/', authMiddleware, contentLimiter, (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = db.prepare('INSERT INTO suggestions (user_id, username, message) VALUES (?, ?, ?)').run(
      req.user.id,
      req.user.username,
      message.trim().slice(0, 500)
    );

    res.status(201).json({ message: 'Suggestion submitted', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit suggestion' });
  }
});

// Get all suggestions (admin only)
router.get('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const suggestions = db.prepare('SELECT * FROM suggestions ORDER BY created_at DESC').all();
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Mark as read (admin only)
router.post('/:id/read', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare("UPDATE suggestions SET status = 'read' WHERE id = ?").run(req.params.id);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Delete suggestion (admin only)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM suggestions WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
