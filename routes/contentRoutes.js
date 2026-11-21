const express = require('express');
const mongoose = require('mongoose');
const HomePage = require('../models/HomePage');
const Category = require('../models/Category');
const { publicProducts } = require('../services/catalog');
const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1)
    return res
      .status(503)
      .json({ success: false, message: 'Content database is unavailable. Please retry shortly.' });
  next();
});
function endpoint(load) {
  return async (req, res) => {
    try {
      const data = await load(req);
      if (data === null)
        return res
          .status(404)
          .json({ success: false, message: 'Page content has not been seeded.' });
      res.json({ success: true, data });
    } catch {
      res
        .status(503)
        .json({ success: false, message: 'Could not load content. Please retry shortly.' });
    }
  };
}
router.get(
  '/home',
  endpoint(async () => {
    const page = await HomePage.findOne({ slug: 'home' }).lean().maxTimeMS(5000);
    return page ? { ...page, plants: await publicProducts('categories') } : null;
  }),
);
router.get(
  '/shop',
  endpoint(() => HomePage.findOne({ slug: 'shop' }).lean().maxTimeMS(5000)),
);
router.get(
  '/products',
  endpoint(() => publicProducts('shop')),
);
router.get(
  '/categories',
  endpoint(() =>
    Category.find({ isActive: { $ne: false } })
      .sort({ displayOrder: 1, slug: 1 })
      .lean()
      .maxTimeMS(5000),
  ),
);
module.exports = router;
