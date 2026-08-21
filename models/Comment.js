const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  modId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mod', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  content: { type: String, required: true }
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

commentSchema.index({ modId: 1 });
module.exports = mongoose.model('Comment', commentSchema);
