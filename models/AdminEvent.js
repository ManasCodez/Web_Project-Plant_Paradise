const mongoose = require('mongoose');
module.exports = mongoose.model(
  'AdminEvent',
  new mongoose.Schema(
    {
      _id: String,
      type: { type: String, enum: ['role_lock', 'role_change'], required: true },
      revision: Number,
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      oldRole: String,
      newRole: String,
    },
    { timestamps: true },
  ),
);
