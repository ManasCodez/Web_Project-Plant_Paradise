const router = require('express').Router();
const Product = require('../models/ShopProduct');
const Category = require('../models/Category');
const { asyncRoute, fail } = require('../middleware/security');
const { publicFilter, present, pagination, validId } = require('../services/catalog');
router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const { page, limit } = pagination(req.query),
      filter = await publicFilter(req.query.surface);
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ displayOrder: 1, slug: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: items.map(present), total, page, limit });
  }),
);
router.get(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const p = await Product.findOne({
      _id: validId(req.params.id),
      ...(await publicFilter(req.query.surface)),
    }).lean();
    if (!p) throw fail(404, 'Plant not found.');
    res.json({ success: true, data: present(p) });
  }),
);
router.get(
  '/categories',
  asyncRoute(async (req, res) =>
    res.json({
      success: true,
      data: await Category.find({ isActive: { $ne: false } })
        .sort({ displayOrder: 1 })
        .lean(),
    }),
  ),
);
router.get(
  '/categories/:slug/products',
  asyncRoute(async (req, res) => {
    const filter = await publicFilter('categories');
    if (!filter.category.$in.includes(req.params.slug)) throw fail(404, 'Category not found.');
    const { page, limit } = pagination(req.query);
    filter.category = req.params.slug;
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ displayOrder: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: items.map(present), total, page, limit });
  }),
);
module.exports = router;
