const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/ShopProduct'),
  Category = require('../models/Category'),
  HomePage = require('../models/HomePage'),
  User = require('../models/User');
async function migrate({ apply = false } = {}) {
  const home = await HomePage.findOne({ slug: 'home' }).lean();
  const products = await Product.collection.find({}).toArray();
  const bySlug = new Map((home?.plants || []).map((p) => [p.slug, p]));
  let changes = 0;
  for (const product of products) {
    const plant = bySlug.get(product.slug),
      defaults = {
        shortDescription: product.description || '',
        detailedDescription: plant?.description || '',
        famousFor: plant?.highlight || '',
        uses: plant?.uses || '',
        stock: 0,
        status: 'active',
        availability: 'available',
        showInShop: true,
        showInCategories: true,
        images: product.imageUrl
          ? [{ url: product.imageUrl, publicId: '', alt: product.imageAlt || product.name }]
          : [],
        cmsVersion: 1,
      };
    const missing = Object.fromEntries(
      Object.entries(defaults).filter(([key]) => product[key] === undefined),
    );
    if (Object.keys(missing).length) {
      changes++;
      if (apply) {
        for (const [key, value] of Object.entries(missing))
          await Product.collection.updateOne(
            { _id: product._id, [key]: { $exists: false } },
            { $set: { [key]: value } },
          );
      }
    }
    bySlug.delete(product.slug);
  }
  // Home-only plants are imported without inventing a selling price: hidden from shop, draft.
  for (const plant of bySlug.values()) {
    changes++;
    if (apply)
      await Product.updateOne(
        { slug: plant.slug },
        {
          $setOnInsert: {
            name: plant.name,
            slug: plant.slug,
            category: plant.category,
            description: plant.description,
            shortDescription: plant.description,
            detailedDescription: plant.description,
            famousFor: plant.highlight,
            uses: plant.uses,
            imageUrl: plant.imageUrl,
            imageAlt: plant.imageAlt,
            images: plant.imageUrl
              ? [{ url: plant.imageUrl, alt: plant.imageAlt || plant.name, publicId: '' }]
              : [],
            displayOrder: plant.displayOrder,
            price: 0,
            stock: 0,
            status: 'draft',
            showInShop: false,
            showInCategories: true,
            cmsVersion: 1,
          },
        },
        { upsert: true },
      );
  }
  if (apply) {
    await Category.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
    await User.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });
  }
  console.log(
    `${apply ? 'Applied' : 'Dry run'}: ${products.length} existing products inspected; ${changes} products need extension/import; ${bySlug.size} home-only plants. Existing IDs, prices, images, descriptions and home arrays preserved.`,
  );
  return { existing: products.length, changes, homeOnly: bySlug.size };
}
if (require.main === module)
  (async () => {
    try {
      await connectDB();
      await migrate({ apply: process.argv.includes('--apply') });
    } catch (e) {
      console.error('Migration failed: ' + e.name);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
module.exports = { migrate };
