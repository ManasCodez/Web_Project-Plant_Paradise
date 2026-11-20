const mongoose = require('mongoose');
const connectDB = require('../config/db');
const HomePage = require('../models/HomePage');
const Category = require('../models/Category');
const ShopProduct = require('../models/ShopProduct');
const seed = require('../seed/content.json');

async function seedContent() {
  for (const [Model, documents] of [[Category, seed.categories], [HomePage, seed.pages], [ShopProduct, seed.products]]) {
    await Model.init();
    let inserted = 0;
    for (const document of documents) {
      await new Model(document).validate();
      const now = new Date();
      const result = await Model.updateOne({ slug: document.slug }, {
        $setOnInsert: { ...document, createdAt: now, updatedAt: now },
      }, { upsert: true, runValidators: true, timestamps: false });
      inserted += result.upsertedCount;
    }
    console.log(`${Model.modelName}: ${inserted} inserted; existing documents preserved.`);
  }
}
async function main() {
  try {
    await connectDB();
    await seedContent();
  } catch {
    console.error('Content seeding failed. Check MongoDB availability and MONGODB_URI; no collections were cleared.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module) main();
module.exports = { seedContent };
