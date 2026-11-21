const mongoose = require('mongoose');
module.exports = mongoose.model(
  'RateLimit',
  new mongoose.Schema(
    {
      _id: String,
      count: Number,
      expiresAt: { type: Date, expires: 0 },
    },
    { bufferCommands: false },
  ),
);
