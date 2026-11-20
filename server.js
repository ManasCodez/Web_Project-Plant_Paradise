const express = require('express');
const path = require('path');
const cors = require('cors');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const contactRoutes = require('./routes/contactRoutes');

const app = express();

// Connect to Database
async function connectWithRetry() {
  try { await connectDB(); }
  catch { setTimeout(connectWithRetry, 10000).unref(); }
}
const initialConnection = connectWithRetry();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/content', async (req, res, next) => {
  // Avoid returning a startup 503 while the initial connection is still opening.
  await initialConnection;
  try { await connectDB(); } catch {} // Retry also recovers a failed initial connection.
  next();
}, require('./routes/contentRoutes'));

// Custom 404 page for unmatched routes
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  return res.status(404).json({ success: false, message: 'Resource not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Plant Paradise Server running on port ${PORT}`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});

module.exports = app;
