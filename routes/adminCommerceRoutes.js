const router = require('express').Router();
const mongoose = require('mongoose'),
  { randomUUID } = require('node:crypto');
const Order = require('../models/Order'),
  Product = require('../models/ShopProduct'),
  User = require('../models/User'),
  AdminEvent = require('../models/AdminEvent');
const { asyncRoute, fail, rateLimit } = require('../middleware/security');
const { pagination, escapeRegex, validId } = require('../services/catalog');
const { statuses, nextStatuses, statusOf, presentOrder } = require('../services/orders');
// Mounted only after the existing admin authentication/authorization middleware.
router.get(
  '/orders',
  asyncRoute(async (req, res) => {
    const filter = {},
      { page, limit } = pagination(req.query);
    if (req.query.q) {
      const search = { $regex: escapeRegex(String(req.query.q).slice(0, 160)), $options: 'i' };
      filter.$or = [
        { orderNumber: search },
        { orderId: search },
        { 'customer.name': search },
        { 'customer.email': search },
        { customerEmail: search },
      ];
    }
    if (statuses.includes(req.query.status))
      filter.$and = [
        {
          $or: [
            { orderStatus: req.query.status },
            {
              orderStatus: { $exists: false },
              status: req.query.status === 'placed' ? 'pending' : req.query.status,
            },
          ],
        },
      ];
    if (['pending', 'paid'].includes(req.query.paymentStatus))
      filter.paymentStatus = req.query.paymentStatus;
    const sort = req.query.sort === 'oldest' ? 1 : -1;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: sort, _id: sort })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, data: orders.map(presentOrder), total, page, limit });
  }),
);
router.get(
  '/orders/:id',
  asyncRoute(async (req, res) => {
    const order = await Order.findById(validId(req.params.id)).lean();
    if (!order) throw fail(404, 'Order not found.');
    res.json({ success: true, data: presentOrder(order) });
  }),
);
router.patch(
  '/orders/:id/status',
  rateLimit('order-status', 120),
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id),
      desired = req.body.orderStatus,
      payment = req.body.paymentStatus;
    if (desired !== undefined && !statuses.includes(desired))
      throw fail(400, 'Invalid order status.');
    if (payment !== undefined && payment !== 'paid')
      throw fail(400, 'Only confirmation of collected COD payment is supported.');
    if (desired === undefined && payment === undefined)
      throw fail(400, 'Choose a status or payment update.');
    let order;
    await mongoose.connection.transaction(async (session) => {
      order = await Order.findById(id).session(session);
      if (!order) throw fail(404, 'Order not found.');
      const current = statusOf(order),
        next = desired || current;
      if (next !== current && !(nextStatuses[current] || []).includes(next))
        throw fail(
          409,
          'Invalid status transition. Refresh the order and choose an available next step.',
        );
      if (payment === 'paid' && (next !== 'delivered' || order.paymentMethod !== 'cod'))
        throw fail(409, 'Record COD payment only after delivery.');
      if (
        next === 'cancelled' &&
        current !== 'cancelled' &&
        order.inventoryReserved &&
        !order.stockRestored
      ) {
        for (const item of order.items) {
          if (!item.productId) throw fail(409, 'This order needs manual inventory review.');
          const restored = await Product.updateOne(
            { _id: item.productId },
            { $inc: { stock: item.quantity } },
            { session },
          );
          if (restored.matchedCount !== 1)
            throw fail(
              409,
              'A product record is missing. Review inventory before cancelling this order.',
            );
        }
        order.stockRestored = true;
      }
      const changed = next !== current || (payment && payment !== order.paymentStatus);
      if (changed) {
        order.orderStatus = next;
        order.status = next;
        if (payment) order.paymentStatus = payment;
        order.history.push({
          status: next,
          paymentStatus: order.paymentStatus,
          actor: req.user._id,
          at: new Date(),
        });
        await order.save({ session });
      }
    });
    res.json({ success: true, data: presentOrder(order) });
  }),
);
router.patch(
  '/users/:id/role',
  rateLimit('role-change', 30),
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id),
      role = req.body.role;
    if (!['user', 'admin'].includes(role)) throw fail(400, 'Choose user or admin.');
    if (String(req.user._id) === id && role === 'user')
      throw fail(
        409,
        'You cannot remove your own administrator access. Ask another administrator.',
      );
    try {
      await AdminEvent.updateOne(
        { _id: 'role-control' },
        { $setOnInsert: { type: 'role_lock', revision: 0 } },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
    let target;
    await mongoose.connection.transaction(async (session) => {
      await AdminEvent.findOneAndUpdate(
        { _id: 'role-control' },
        { $inc: { revision: 1 } },
        { session },
      );
      const actor = await User.findById(req.user._id).session(session);
      if (actor?.role !== 'admin' || actor.sessionVersion !== req.user.sessionVersion)
        throw fail(403, 'Your administrator session is no longer valid.');
      target = await User.findById(id).session(session);
      if (!target) throw fail(404, 'User not found.');
      const oldRole = target.role || 'user';
      if (oldRole === role) return;
      if (
        oldRole === 'admin' &&
        role === 'user' &&
        (await User.countDocuments({ role: 'admin' }).session(session)) <= 1
      )
        throw fail(409, 'The last administrator cannot be removed.');
      target.role = role;
      target.sessionVersion = (target.sessionVersion || 0) + 1;
      await target.save({ session });
      await AdminEvent.create(
        [
          {
            _id: randomUUID(),
            type: 'role_change',
            actor: req.user._id,
            userId: target._id,
            oldRole,
            newRole: role,
          },
        ],
        { session },
      );
    });
    res.json({
      success: true,
      data: {
        _id: target._id,
        fullname: target.fullname,
        email: target.email,
        role: target.role,
        createdAt: target.createdAt,
      },
    });
  }),
);
module.exports = router;
