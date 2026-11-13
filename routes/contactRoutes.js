const express = require('express');
const Contact = require('../models/Contact');

const router = express.Router();

// @route   POST /api/contact
// @desc    Submit a contact query
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All contact form fields are required' });
    }

    const contactEntry = await Contact.create({
      name,
      email,
      subject,
      message,
    });

    return res.status(201).json({
      success: true,
      message: 'Your message has been received! Our team will get back to you shortly.',
      data: contactEntry,
    });
  } catch (error) {
    console.error('Contact submission error:', error);
    return res.status(500).json({ success: false, message: 'Server error submitting contact form', error: error.message });
  }
});

// @route   GET /api/contact
// @desc    Get all submitted contact inquiries
// @access  Public (or Admin)
router.get('/', async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error('Fetch contact messages error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching contact messages', error: error.message });
  }
});

module.exports = router;
