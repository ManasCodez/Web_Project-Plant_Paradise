const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
(async () => {
  try {
    const email = process.argv[2]?.trim().toLowerCase();
    if (!email || !email.includes('@'))
      throw Error('Usage: npm run admin:promote -- registered@example.com');
    await connectDB();
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { role: 'admin' }, $inc: { sessionVersion: 1 } },
      { new: true },
    );
    if (!user) throw Error('No registered user found. Register normally first.');
    console.log('Existing account promoted to admin. Sign in again to start a new session.');
  } catch (e) {
    console.error(
      e.message.startsWith('Usage:') || e.message.startsWith('No registered')
        ? e.message
        : 'Admin promotion failed. Check database connectivity.',
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
