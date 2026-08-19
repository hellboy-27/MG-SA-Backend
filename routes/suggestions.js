const express = require('express');
const Suggestion = require('../models/Suggestion');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/security');

const router = express.Router();

// Submit suggestion (authenticated users only)
router.post('/', authMiddleware, contentLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const suggestion = await Suggestion.create({
      userId: req.user.id,
      username: req.user.username,
      message: message.trim().slice(0, 500)
    });

    res.status(201).json({ message: 'Suggestion submitted', id: suggestion._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit suggestion' });
  }
});

// Get all suggestions (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const suggestions = await Suggestion.find().sort({ createdAt: -1 });
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Mark as read (admin only)
router.post('/:id/read', authMiddleware, adminOnly, async (req, res) => {
  try {
    await Suggestion.findByIdAndUpdate(req.params.id, { status: 'read' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Delete suggestion (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await Suggestion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
