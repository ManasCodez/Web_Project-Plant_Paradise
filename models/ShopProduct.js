const mongoose = require('mongoose');
module.exports = mongoose.model('ShopProduct', new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  imageUrl: String,
  imageAlt: String,
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, index: true },
  displayOrder: { type: Number, required: true, min: 0 },
}, { timestamps: true, bufferCommands: false }));
