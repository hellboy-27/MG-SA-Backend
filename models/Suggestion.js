const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['new', 'read'], default: 'new' }
}, { timestamps: true });

suggestionSchema.index({ status: 1 });
module.exports = mongoose.model('Suggestion', suggestionSchema);
