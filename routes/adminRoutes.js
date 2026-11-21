const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/ShopProduct'),
  Category = require('../models/Category'),
  User = require('../models/User'),
  Order = require('../models/Order'),
  Media = require('../models/Media');
const { authenticate, adminOnly, asyncRoute, fail, rateLimit } = require('../middleware/security');
const { fields, pagination, escapeRegex, validId } = require('../services/catalog');
const storage = require('../services/media');
const router = express.Router();
router.use(authenticate, adminOnly);
router.use(require('./adminCommerceRoutes'));
async function transaction(fn) {
  return mongoose.connection.transaction(fn);
}
async function page(Model, filter, req, sort, projection) {
  const { page, limit } = pagination(req.query);
  const [data, total] = await Promise.all([
    Model.find(filter)
      .select(projection || '')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Model.countDocuments(filter),
  ]);
  return { success: true, data, total, page, limit };
}
router.get(
  '/dashboard',
  asyncRoute(async (req, res) => {
    const [
      plants,
      categories,
      users,
      active,
      outOfStock,
      orders,
      pending,
      revenue,
      recent,
      byCategory,
      todayOrders,
      deliveredOrders,
      cancelledOrders,
    ] = await Promise.all([
      Product.countDocuments({ status: { $ne: 'archived' } }),
      Category.countDocuments(),
      User.countDocuments(),
      Product.countDocuments({ status: { $nin: ['draft', 'archived'] } }),
      Product.countDocuments({
        status: { $ne: 'archived' },
        $or: [
          { stock: { $lte: 0 } },
          { stock: { $exists: false } },
          { availability: 'unavailable' },
        ],
      }),
      Order.countDocuments(),
      Order.countDocuments({
        $or: [
          {
            orderStatus: {
              $in: ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'],
            },
          },
          { orderStatus: { $exists: false }, status: { $in: ['pending', 'confirmed', 'shipped'] } },
        ],
      }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', orderStatus: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$totalPaise' } } },
      ]),
      Product.find({ status: { $ne: 'archived' } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      Product.aggregate([
        { $match: { status: { $ne: 'archived' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Order.countDocuments({
        createdAt: {
          $gte: new Date(
            new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) +
              'T00:00:00+05:30',
          ),
        },
      }),
      Order.countDocuments({
        $or: [
          { orderStatus: 'delivered' },
          { orderStatus: { $exists: false }, status: 'delivered' },
        ],
      }),
      Order.countDocuments({
        $or: [
          { orderStatus: 'cancelled' },
          { orderStatus: { $exists: false }, status: 'cancelled' },
        ],
      }),
    ]);
    res.json({
      success: true,
      data: {
        plants,
        categories,
        users,
        active,
        outOfStock,
        orders,
        pending,
        revenue: (revenue[0]?.total || 0) / 100,
        todayOrders,
        deliveredOrders,
        cancelledOrders,
        recent,
        byCategory,
      },
    });
  }),
);
router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const filter = {};
    if (req.query.q)
      filter.name = { $regex: escapeRegex(String(req.query.q).slice(0, 160)), $options: 'i' };
    if (typeof req.query.category === 'string' && req.query.category)
      filter.category = req.query.category;
    if (['active', 'draft', 'archived'].includes(req.query.status))
      filter.status =
        req.query.status === 'active' ? { $nin: ['draft', 'archived'] } : req.query.status;
    if (req.query.visibility === 'shop') filter.showInShop = { $ne: false };
    if (req.query.visibility === 'categories') filter.showInCategories = { $ne: false };
    if (req.query.visibility === 'hidden')
      Object.assign(filter, { showInShop: false, showInCategories: false });
    const sort = {
      name: { name: 1 },
      price: { price: 1 },
      'price-desc': { price: -1 },
      updated: { updatedAt: -1 },
    }[req.query.sort] || { updatedAt: -1 };
    res.json(await page(Product, filter, req, { ...sort, _id: 1 }));
  }),
);
router.get(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const data = await Product.findById(validId(req.params.id)).lean();
    if (!data) throw fail(404, 'Plant not found.');
    res.json({ success: true, data });
  }),
);
async function saveProduct(req, res) {
  const changes = fields(req.body, 'product');
  let saved;
  await transaction(async (session) => {
    const doc = req.params.id
      ? await Product.findById(validId(req.params.id)).session(session)
      : new Product({ status: 'draft', ...changes });
    if (!doc) throw fail(404, 'Plant not found.');
    doc.set(changes);
    if (doc.discountPrice != null && doc.discountPrice >= doc.price)
      throw fail(400, 'Discount price must be below the regular price.');
    const category = await Category.findOneAndUpdate(
      { slug: doc.category },
      { $inc: { __v: 1 } },
      { session, new: true },
    );
    if (!category) throw fail(400, 'Choose an existing category.');
    for (const image of doc.images || [])
      if (
        image.publicId &&
        !(await Media.exists({
          publicId: image.publicId,
          url: image.url,
          retired: { $ne: true },
        }).session(session))
      )
        throw fail(400, 'Choose available media from the library.');
    if (changes.shortDescription !== undefined) doc.description = changes.shortDescription;
    else if (changes.description !== undefined) doc.shortDescription = changes.description;
    doc.cmsVersion = 1;
    saved = await doc.save({ session });
  });
  res.status(req.params.id ? 200 : 201).json({ success: true, data: saved });
}
router.post('/products', asyncRoute(saveProduct));
router.patch('/products/:id', asyncRoute(saveProduct));
router.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const data = await Product.findByIdAndUpdate(
      validId(req.params.id),
      { $set: { status: 'archived', showInShop: false, showInCategories: false } },
      { new: true },
    );
    if (!data) throw fail(404, 'Plant not found.');
    res.json({ success: true, data });
  }),
);
router.get(
  '/categories',
  asyncRoute(async (req, res) =>
    res.json({
      success: true,
      data: await Category.find().sort({ displayOrder: 1, name: 1 }).lean(),
    }),
  ),
);
router.post(
  '/categories',
  asyncRoute(async (req, res) => {
    const data = fields(req.body, 'category');
    data.anchorId = data.slug;
    if (data.displayOrder === undefined) data.displayOrder = 0;
    res.status(201).json({ success: true, data: await Category.create(data) });
  }),
);
router.patch(
  '/categories/:id',
  asyncRoute(async (req, res) => {
    const data = fields(req.body, 'category');
    delete data.slug; // Slugs are stable product references and public anchors.
    const category = await Category.findByIdAndUpdate(
      validId(req.params.id),
      { $set: data },
      { new: true, runValidators: true },
    );
    if (!category) throw fail(404, 'Category not found.');
    res.json({ success: true, data: category });
  }),
);
router.delete(
  '/categories/:id',
  asyncRoute(async (req, res) => {
    await transaction(async (session) => {
      const category = await Category.findByIdAndUpdate(
        validId(req.params.id),
        { $inc: { __v: 1 } },
        { session, new: true },
      );
      if (!category) throw fail(404, 'Category not found.');
      if (await Product.exists({ category: category.slug }).session(session))
        throw fail(
          409,
          'Reassign all linked plants, including archived plants, before deleting this category.',
        );
      await Category.deleteOne({ _id: category._id }, { session });
    });
    res.json({ success: true });
  }),
);
router.get(
  '/users',
  asyncRoute(async (req, res) => {
    const filter = {};
    if (req.query.q) {
      const search = { $regex: escapeRegex(String(req.query.q).slice(0, 160)), $options: 'i' };
      filter.$or = [{ fullname: search }, { email: search }, { username: search }];
    }
    if (['admin', 'user'].includes(req.query.role))
      filter.role = req.query.role === 'user' ? { $ne: 'admin' } : 'admin';
    res.json(
      await page(User, filter, req, { createdAt: -1 }, 'fullname username email role createdAt'),
    );
  }),
);
router.get(
  '/settings',
  asyncRoute(async (req, res) =>
    res.json({
      success: true,
      data: {
        mediaConfigured: storage.configured(),
        databaseConnected: mongoose.connection.readyState === 1,
        sessionHours: 8,
        currency: 'INR',
        maxUploadMB: 3,
      },
    }),
  ),
);
router.get(
  '/media',
  asyncRoute(async (req, res) =>
    res.json(await page(Media, { retired: { $ne: true } }, req, { createdAt: -1 })),
  ),
);
router.post(
  '/media/upload',
  rateLimit('upload', 60),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  asyncRoute(async (req, res) => {
    const image = await storage.upload(req.body, req.get('content-type')?.split(';')[0]);
    const data = await Media.create({ ...image, alt: '' });
    res.status(201).json({ success: true, data });
  }),
);
router.delete(
  '/media/:id',
  asyncRoute(async (req, res) => {
    const media = await Media.findById(validId(req.params.id));
    if (!media) throw fail(404, 'Media not found.');
    const [product, category] = await Promise.all([
      Product.exists({ $or: [{ 'images.publicId': media.publicId }, { imageUrl: media.url }] }),
      Category.exists({ imageUrl: media.url }),
    ]);
    if (product || category)
      throw fail(
        409,
        'This image is still used by a plant or category. Remove those references first.',
      );
    // Retain the cloud object so saved links and concurrent edits can never break.
    media.retired = true;
    await media.save();
    res.json({ success: true });
  }),
);
module.exports = router;
