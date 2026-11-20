const mongoose = require('mongoose');
const plantSchema = new mongoose.Schema({
  slug: { type: String, required: true },
  category: { type: String, required: true },
  name: { type: String, required: true },
  description: String, highlight: String, uses: String,
  imageUrl: String, imageAlt: String,
  displayOrder: { type: Number, min: 0, required: true },
}, { _id: false });

// Both page shells use editable text/link bindings; the home document also owns
// its educational plant catalog. Shop inventory lives in ShopProduct.
module.exports = mongoose.model('HomePage', new mongoose.Schema({
  slug: { type: String, enum: ['home', 'shop'], required: true, unique: true },
  content: { type: Map, of: String, default: {} },
  plants: [plantSchema],
  backgrounds: [{ _id: false, selector: String, imageUrl: String }],
  addToCartLabel: String,
}, { timestamps: true, bufferCommands: false }));
