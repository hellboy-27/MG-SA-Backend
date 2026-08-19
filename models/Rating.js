const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  modId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mod', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' }
}, { timestamps: true });

ratingSchema.index({ modId: 1 });
ratingSchema.index({ modId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('Rating', ratingSchema);
