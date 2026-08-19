const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false }
}, { timestamps: true });

verificationCodeSchema.index({ email: 1 });
module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
