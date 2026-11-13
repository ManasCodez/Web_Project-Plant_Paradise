const express = require('express');
const Order = require('../models/Order');

const router = express.Router();

// @route   POST /api/orders
// @desc    Create a new plant order
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { items, totalItems, totalAmount, customerEmail, orderId } = req.body;

    if (!items || !items.length || !totalItems || !totalAmount) {
      return res.status(400).json({ success: false, message: 'Invalid order data. Cart items are required.' });
    }

    const generatedOrderId = orderId ? String(orderId) : `ORD-${Date.now()}`;

    const newOrder = await Order.create({
      orderId: generatedOrderId,
      items,
      totalItems,
      totalAmount,
      customerEmail: customerEmail || 'guest@plantparadise.com',
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: newOrder,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ success: false, message: 'Server error placing order', error: error.message });
  }
});

// @route   GET /api/orders
// @desc    Get all orders
// @access  Public
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('Fetch orders error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching orders', error: error.message });
  }
});

module.exports = router;
