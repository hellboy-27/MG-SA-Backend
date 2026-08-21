const mongoose = require('mongoose');

const modSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  size: { type: String, default: '' },
  imageFilename: { type: [String], default: [] },
  modFilename: { type: String, default: '' },
  downloads: { type: Number, default: 0 },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  modId: { type: Number, default: 0 }
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret.modId || ret._id.toString();
      ret.image_filename = ret.imageFilename || [];
      ret.mod_filename = ret.modFilename || '';
      ret.rating_avg = ret.ratingAvg || 0;
      ret.rating_count = ret.ratingCount || 0;
      ret.avg_rating = ret.ratingAvg || 0;
      ret.created_at = ret.createdAt;
      ret.updated_at = ret.updatedAt;
      delete ret._id;
      delete ret.__v;
      delete ret.imageFilename;
      delete ret.modFilename;
      delete ret.ratingAvg;
      delete ret.ratingCount;
      delete ret.modId;
      delete ret.createdAt;
      delete ret.updatedAt;
      return ret;
    }
  }
});

module.exports = mongoose.model('Mod', modSchema);
