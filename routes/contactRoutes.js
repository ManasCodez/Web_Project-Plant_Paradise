const express = require('express');
const Contact = require('../models/Contact');
const { asyncRoute, authenticate, adminOnly, rateLimit, fail } = require('../middleware/security');
const { string } = require('../services/catalog');
const router = express.Router();
router.post(
  '/',
  rateLimit('contact', 20),
  asyncRoute(async (req, res) => {
    const name = string(req.body.name, 'name', 120);
    const email = string(req.body.email, 'email', 254).toLowerCase();
    const subject = string(req.body.subject, 'subject', 200);
    const message = string(req.body.message, 'message', 10000);
    if (!name || !subject || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw fail(400, 'Provide a name, valid email, subject and message.');
    const data = await Contact.create({ name, email, subject, message });
    res
      .status(201)
      .json({
        success: true,
        message: 'Your message has been received! Our team will get back to you shortly.',
        data,
      });
  }),
);
router.get(
  '/',
  authenticate,
  adminOnly,
  asyncRoute(async (req, res) => {
    const messages = await Contact.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, count: messages.length, messages });
  }),
);
module.exports = router;
