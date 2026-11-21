const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {
  asyncRoute,
  fail,
  secret,
  issueSession,
  authenticate,
  cookieOptions,
  rateLimit,
} = require('../middleware/security');
const { string } = require('../services/catalog');
const router = express.Router();
function passwordValue(value, registration = false) {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    (registration && Buffer.byteLength(value, 'utf8') > 72)
  )
    throw fail(400, 'Invalid password length (maximum 72 UTF-8 bytes for new accounts).');
  return value;
}
const profile = (u) => ({
  id: u._id,
  fullname: u.fullname,
  username: u.username,
  email: u.email,
  role: u.role || 'user',
});
router.post(
  '/register',
  rateLimit('register', 15),
  asyncRoute(async (req, res) => {
    secret();
    const fullname = string(req.body.fullname, 'full name', 120),
      username = string(req.body.username, 'username', 80).toLowerCase();
    const email = string(req.body.email, 'email', 254).toLowerCase(),
      password = passwordValue(req.body.password, true);
    if (
      !fullname ||
      !/^[a-z0-9_.-]{2,80}$/.test(username) ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      password.length < 6
    )
      throw fail(
        400,
        'Provide a valid name, username, email and password of at least six characters.',
      );
    let dob;
    if (req.body.dob) {
      dob = new Date(string(req.body.dob, 'date of birth', 30));
      if (!Number.isFinite(+dob) || dob > new Date()) throw fail(400, 'Invalid date of birth.');
    }
    const user = await User.create({
      fullname,
      username,
      email,
      password: await bcrypt.hash(password, 12),
      dob,
      role: 'user',
    });
    res.status(201).json({ success: true, user: profile(user) });
  }),
);
router.post(
  '/login',
  rateLimit('login', 30),
  asyncRoute(async (req, res) => {
    secret();
    const email = string(req.body.email, 'email', 254).toLowerCase(),
      password = passwordValue(req.body.password);
    const user = await User.findOne({ email });
    const matches = await bcrypt.compare(
      password,
      user?.password || '$2b$12$zvX7N3HN3njY7wxrG0gta.JFlSTvnc2pEIQcGkO8yEfIUjwpVopue',
    );
    if (!user || !matches) throw fail(401, 'Invalid email or password.');
    issueSession(res, user);
    res.json({ success: true, user: profile(user) });
  }),
);
router.get('/me', authenticate, (req, res) => res.json({ success: true, user: profile(req.user) }));
router.post(
  '/logout',
  authenticate,
  asyncRoute(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 } });
    res.clearCookie('pp_session', cookieOptions());
    res.json({ success: true });
  }),
);
module.exports = router;
