const mongoose = require('mongoose');
module.exports = mongoose.model(
  'Media',
  new mongoose.Schema(
    {
      url: { type: String, required: true },
      publicId: { type: String, required: true, unique: true },
      alt: String,
      width: Number,
      height: Number,
      bytes: Number,
      retired: { type: Boolean, default: false },
    },
    { timestamps: true, bufferCommands: false },
  ),
);
