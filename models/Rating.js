const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  modId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mod', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' }
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

ratingSchema.index({ modId: 1 });
ratingSchema.index({ modId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('Rating', ratingSchema);
