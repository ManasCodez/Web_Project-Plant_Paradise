const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const User = require('../models/User');
const RateLimit = require('../models/RateLimit');
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw fail(503, 'Authentication requires a JWT_SECRET of at least 32 characters.');
  return process.env.JWT_SECRET;
}
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
  sameSite: 'strict',
  path: '/',
});
function issueSession(res, user) {
  const token = jwt.sign({ id: String(user._id), version: user.sessionVersion || 0 }, secret(), {
    expiresIn: '8h',
    issuer: 'plant-paradise',
    audience: 'plant-paradise',
  });
  res.cookie('pp_session', token, { ...cookieOptions(), maxAge: 8 * 3600000 });
}
const authenticate = asyncRoute(async (req, res, next) => {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('pp_session='));
  if (!cookie) throw fail(401, 'Please sign in.');
  let payload;
  try {
    payload = jwt.verify(cookie.slice(11), secret(), {
      algorithms: ['HS256'],
      issuer: 'plant-paradise',
      audience: 'plant-paradise',
    });
  } catch (err) {
    if (err.status) throw err;
    throw fail(401, 'Session expired. Please sign in again.');
  }
  const user = await User.findById(payload.id).select(
    '_id fullname username email role sessionVersion',
  );
  if (!user || (user.sessionVersion || 0) !== payload.version)
    throw fail(401, 'Session expired. Please sign in again.');
  req.user = user;
  next();
});
const adminOnly = (req, res, next) =>
  req.user?.role === 'admin' ? next() : next(fail(403, 'Administrator access required.'));
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // JSON/custom-header requests cannot be submitted by cross-origin HTML forms.
  if (req.headers['sec-fetch-site'] === 'cross-site')
    return next(fail(403, 'Cross-site requests are not allowed.'));
  const origin = req.headers.origin;
  const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expected) return next(fail(403, 'Invalid request origin.'));
  if (!req.is('application/json') && req.headers['x-requested-with'] !== 'PlantParadise')
    return next(fail(415, 'Use JSON or the supported upload interface.'));
  next();
}
function rateLimit(scope, max, windowMs = 15 * 60000) {
  return asyncRoute(async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = crypto.createHash('sha256').update(`${scope}:${req.ip}:${bucket}`).digest('hex');
    let record;
    try {
      record = await RateLimit.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } },
        { upsert: true, new: true },
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      record = await RateLimit.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 } },
        { new: true },
      );
    }
    if (record.count > max) {
      res.set('Retry-After', String(Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)));
      throw fail(429, 'Too many requests. Please try again later.');
    }
    next();
  });
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    (err.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(err.name) ? 400 : 500);
  const message =
    err.code === 11000
      ? 'That slug, email, or username is already in use.'
      : status < 500
        ? err.message
        : status === 503
          ? err.message
          : 'The operation could not be completed. Please retry.';
  if (status >= 500) console.error(`[API] ${req.method} ${req.path}: ${err.name}`);
  res.status(status).json({ success: false, message });
}
module.exports = {
  asyncRoute,
  fail,
  secret,
  cookieOptions,
  issueSession,
  authenticate,
  adminOnly,
  sameOrigin,
  rateLimit,
  errorHandler,
};
