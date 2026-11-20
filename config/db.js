const mongoose = require('mongoose');
const path = require('node:path');
const dns = require('node:dns');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// Optional process-only workaround for networks whose DNS cannot resolve Atlas SRV records.
const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(',').map(value => value.trim()).filter(Boolean);
if (dnsServers?.length) dns.promises.setServers(dnsServers);
let pendingConnection;

const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (pendingConnection) return pendingConnection;
  pendingConnection = openConnection().finally(() => { pendingConnection = null; });
  return pendingConnection;
};

async function openConnection() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/plant_paradise', { serverSelectionTimeoutMS: 5000 });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    const message = String(error.message);
    const reason = /querySrv|queryTxt|ENOTFOUND|ETIMEOUT|ESERVFAIL/.test(message)
      ? 'DNS lookup failed. Check your DNS resolver or configure MONGODB_DNS_SERVERS in .env.'
      : /auth|bad credentials/i.test(message)
        ? 'Authentication failed. Check the MongoDB database username and password.'
        : 'Unable to reach MongoDB. Check the URI, network access, and Atlas IP access list.';
    console.error(`[MongoDB Connection Error]: ${reason}`);
    throw error;
  }
}

module.exports = connectDB;
