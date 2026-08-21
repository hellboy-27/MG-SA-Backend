const mongoose = require('mongoose');

const modSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  size: { type: String, default: '' },
  imageFilename: { type: [String], default: [] },
  modFilename: { type: String, default: '' },
  downloads: { type: Number, default: 0 },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
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

module.exports = mongoose.model('Mod', modSchema);
