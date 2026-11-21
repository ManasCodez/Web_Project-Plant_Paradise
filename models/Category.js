const mongoose = require('mongoose');
module.exports = mongoose.model('Category', new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  anchorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  sectionHeading: String,
  description: String, imageUrl: String, imageAlt: String,
  imagePublicId: String,
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, required: true, min: 0 },
}, { timestamps: true, bufferCommands: false }));
