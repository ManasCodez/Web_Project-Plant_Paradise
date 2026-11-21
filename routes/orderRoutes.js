const router = require('express').Router();
const mongoose = require('mongoose');
const { randomBytes, createHash } = require('node:crypto');
const Order = require('../models/Order'),
  User = require('../models/User');
const { asyncRoute, fail, authenticate, adminOnly, rateLimit } = require('../middleware/security');
const { validId, pagination } = require('../services/catalog');
const { quote, delivery, cartItems, presentOrder } = require('../services/orders');
router.use(authenticate);
router.get(
  '/profile',
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.user._id).select('fullname email savedAddress').lean();
    res.json({ success: true, data: user });
  }),
);
router.post(
  '/quote',
  rateLimit('quote', 180),
  asyncRoute(async (req, res) => res.json({ success: true, data: await quote(req.body.items) })),
);
router.post(
  '/',
  rateLimit('checkout', 30),
  asyncRoute(async (req, res) => {
    await Order.init();
    const key = req.get('Idempotency-Key');
    if (!key || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))
      throw fail(400, 'A valid checkout request key is required.');
    const details = delivery(req.body, req.user),
      normalized = cartItems(req.body.items);
    if (!Number.isSafeInteger(req.body.expectedTotalPaise) || req.body.expectedTotalPaise < 0)
      throw fail(400, 'Refresh the order summary before placing your order.');
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          items: normalized,
          ...details,
          customer: { name: details.customer.name, phone: details.customer.phone },
          expectedTotalPaise: req.body.expectedTotalPaise,
          saveAddress: req.body.saveAddress === true,
        }),
      )
      .digest('hex');
    const existingFilter = { userId: req.user._id, idempotencyKey: key };
    let order;
    function verifyExisting(existing) {
      if (existing.requestHash !== requestHash)
        throw fail(
          409,
          'This checkout request was already used. Review the existing order before starting a new checkout.',
        );
      return existing;
    }
    try {
      await mongoose.connection.transaction(async (session) => {
        order = await Order.findOne(existingFilter).session(session);
        if (order) {
          verifyExisting(order);
          return;
        }
        const totals = await quote(req.body.items, session, true);
        if (totals.totalPaise !== req.body.expectedTotalPaise)
          throw fail(
            409,
            'Prices have changed. Review the refreshed total and place the order again.',
          );
        const orderNumber =
          'PP-' +
          new Date().toISOString().slice(0, 10).replace(/-/g, '') +
          '-' +
          randomBytes(5).toString('hex').toUpperCase();
        const items = totals.items.map(({ stock, ...item }) => item);
        [order] = await Order.create(
          [
            {
              ...totals,
              items,
              ...details,
              userId: req.user._id,
              customerEmail: req.user.email,
              orderId: orderNumber,
              orderNumber,
              idempotencyKey: key,
              requestHash,
              status: 'placed',
              orderStatus: 'placed',
              paymentStatus: 'pending',
              inventoryReserved: true,
              stockRestored: false,
              history: [
                { status: 'placed', paymentStatus: 'pending', actor: req.user._id, at: new Date() },
              ],
            },
          ],
          { session },
        );
        if (req.body.saveAddress)
          await User.updateOne(
            { _id: req.user._id },
            {
              $set: {
                savedAddress: {
                  ...details.shippingAddress,
                  name: details.customer.name,
                  phone: details.customer.phone,
                },
              },
            },
            { session },
          );
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await Order.findOne(existingFilter);
      if (!existing) throw error;
      order = verifyExisting(existing);
    }
    res.status(201).json({ success: true, order: presentOrder(order) });
  }),
);
router.get(
  '/my',
  asyncRoute(async (req, res) => {
    const { page, limit } = pagination(req.query);
    const filter = { userId: req.user._id };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, data: orders.map(presentOrder), total, page, limit });
  }),
);
router.get(
  '/',
  adminOnly,
  asyncRoute(async (req, res) =>
    res.json({
      success: true,
      orders: (await Order.find().sort({ createdAt: -1 }).limit(50).lean()).map(presentOrder),
    }),
  ),
);
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const filter = { _id: validId(req.params.id) };
    if (req.user.role !== 'admin') filter.userId = req.user._id;
    const order = await Order.findOne(filter).lean();
    if (!order) throw fail(404, 'Order not found.');
    res.json({ success: true, data: presentOrder(order) });
  }),
);
module.exports = router;
