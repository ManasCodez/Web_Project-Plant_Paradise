const express = require('express');
const path = require('node:path');
const connectDB = require('./config/db');
const { sameOrigin, authenticate, adminOnly, errorHandler } = require('./middleware/security');
const app = express();
app.disable('x-powered-by');
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/api', sameOrigin, async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    await connectDB();
    next();
  } catch {
    res
      .status(503)
      .json({ success: false, message: 'Database unavailable. Please retry shortly.' });
  }
});
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api', require('./routes/catalogRoutes'));
app.get(
  ['/admin', '/admin/*'],
  async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      await connectDB();
      next();
    } catch {
      res.status(503).send('Database unavailable. Please retry shortly.');
    }
  },
  (req, res, next) =>
    authenticate(req, res, (err) => {
      if (err?.status === 401) return res.redirect('/login/?next=admin');
      if (err) return next(err);
      next();
    }),
  adminOnly,
  (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')),
);
app.get(['/checkout', '/my-orders', '/orders/confirmation/:id'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'views', 'commerce.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) =>
  req.path.startsWith('/api/')
    ? res.status(404).json({ success: false, message: 'Resource not found.' })
    : res.status(404).sendFile(path.join(__dirname, 'public', '404.html')),
);
app.use(errorHandler);
if (require.main === module)
  app.listen(process.env.PORT || 3000, () =>
    console.log('Plant Paradise listening on port ' + (process.env.PORT || 3000)),
  );
module.exports = app;
