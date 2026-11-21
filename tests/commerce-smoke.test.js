// Focused local smoke check: one checkout flow and the essential admin controls.
process.env.MONGOMS_DOWNLOAD_DIR = require('node:path').resolve(
  __dirname,
  '../node_modules/.cache/mongodb-memory-server',
);
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const mongoose = require('mongoose'),
  bcrypt = require('bcryptjs'),
  { MongoMemoryReplSet } = require('mongodb-memory-server'),
  { JSDOM, VirtualConsole } = require('jsdom');
test(
  'checkout, customer privacy, order management and protected role changes (local smoke)',
  async () => {
    const replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    let server, dom;
    try {
      process.env.MONGODB_URI = replica.getUri('checkout_smoke');
      process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
      process.env.NODE_ENV = 'test';
      delete process.env.VERCEL;
      const app = require('../server');
      await require('../config/db')();
      const User = require('../models/User'),
        Product = require('../models/ShopProduct'),
        Category = require('../models/Category'),
        Order = require('../models/Order'),
        AdminEvent = require('../models/AdminEvent');
      await Promise.all(
        [User, Product, Category, Order, AdminEvent, require('../models/RateLimit')].map((M) =>
          M.init(),
        ),
      );
      const hash = await bcrypt.hash('local-smoke-password', 10);
      const [admin, buyer, other] = await User.create([
        {
          fullname: 'Smoke Admin',
          username: 'smokeadmin',
          email: 'admin@smoke.test',
          password: hash,
          role: 'admin',
        },
        {
          fullname: 'Smoke Buyer',
          username: 'smokebuyer',
          email: 'buyer@smoke.test',
          password: hash,
        },
        {
          fullname: 'Other Buyer',
          username: 'otherbuyer',
          email: 'other@smoke.test',
          password: hash,
        },
      ]);
      await Category.create({
        name: 'Indoor',
        slug: 'indoor',
        anchorId: 'indoor',
        displayOrder: 0,
        isActive: true,
      });
      const product = await Product.create({
        name: 'Smoke Fern',
        slug: 'smoke-fern',
        category: 'indoor',
        price: 249,
        stock: 10,
        status: 'active',
      });
      server = app.listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      const base = 'http://127.0.0.1:' + server.address().port;
      process.env.APP_ORIGIN = base;
      async function api(path, { method = 'GET', cookie, data, key } = {}) {
        const r = await fetch(base + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
        const b = await r.json();
        return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
      }
      async function login(email) {
        const r = await api('/api/auth/login', {
          method: 'POST',
          data: { email, password: 'local-smoke-password' },
        });
        assert.equal(r.status, 200);
        return r.cookie;
      }
      const adminCookie = await login(admin.email),
        buyerCookie = await login(buyer.email),
        otherCookie = await login(other.email);
      assert.equal((await fetch(base + '/checkout')).status, 200);
      const virtualConsole = new VirtualConsole();
      dom = new JSDOM(fs.readFileSync('views/commerce.html', 'utf8'), {
        url: base + '/checkout',
        runScripts: 'outside-only',
        virtualConsole,
      });
      const w = dom.window;
      w.fetch = (url, options = {}) =>
        fetch(new URL(url, base), {
          ...options,
          headers: { ...options.headers, Cookie: buyerCookie },
        });
      w.localStorage.setItem(
        'plantParadiseCart',
        JSON.stringify([{ productId: String(product._id), quantity: 2 }]),
      );
      w.eval(fs.readFileSync('public/cart.js', 'utf8'));
      w.eval(fs.readFileSync('public/commerce.js', 'utf8'));
      for (
        let i = 0;
        i < 100 &&
        (!w.document.querySelector('.place-order') ||
          w.document.querySelector('.place-order').disabled);
        i++
      )
        await new Promise((r) => setTimeout(r, 20));
      const form = w.document.getElementById('delivery-form');
      assert.ok(form);
      assert.match(w.document.getElementById('summary').textContent, /Smoke Fern/);
      assert.equal(form.elements.email.value, buyer.email);
      for (const [k, v] of Object.entries({
        name: 'Smoke Buyer',
        phone: '9876543210',
        addressLine1: '10 Test Lane',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001',
      }))
        form.elements[k].value = v;
      form.elements.saveAddress.checked = true;
      await form.onsubmit({ preventDefault() {} });
      const order = await Order.findOne({ userId: buyer._id });
      assert.ok(order, 'Checkout UI placed an order');
      assert.equal(order.totalPaise, 49800);
      assert.equal(order.customer.email, buyer.email);
      assert.equal(order.paymentStatus, 'pending');
      assert.equal(order.orderStatus, 'placed');
      assert.equal((await Product.findById(product._id)).stock, 8);
      assert.equal(w.localStorage.getItem('plantParadiseCart'), null);
      assert.equal((await User.findById(buyer._id)).savedAddress.city, 'Delhi');
      assert.equal((await api('/api/orders/my', { cookie: buyerCookie })).body.total, 1);
      assert.equal((await api('/api/orders/' + order._id, { cookie: otherCookie })).status, 404);
      assert.equal((await api('/api/admin/orders', { cookie: buyerCookie })).status, 403);
      assert.equal((await api('/api/admin/orders', { cookie: adminCookie })).body.total, 1);
      assert.equal(
        (await api('/api/admin/orders/' + order._id, { cookie: adminCookie })).body.data.customer
          .phone,
        '9876543210',
      );
      const statusPath = '/api/admin/orders/' + order._id + '/status';
      assert.equal(
        (
          await api(statusPath, {
            cookie: adminCookie,
            method: 'PATCH',
            data: { orderStatus: 'delivered' },
          })
        ).status,
        409,
      );
      for (const status of ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'])
        assert.equal(
          (
            await api(statusPath, {
              cookie: adminCookie,
              method: 'PATCH',
              data: { orderStatus: status },
            })
          ).status,
          200,
        );
      assert.equal(
        (await api('/api/admin/dashboard', { cookie: adminCookie })).body.data.revenue,
        0,
      );
      assert.equal(
        (
          await api(statusPath, {
            cookie: adminCookie,
            method: 'PATCH',
            data: { paymentStatus: 'paid' },
          })
        ).status,
        200,
      );
      assert.equal(
        (await api('/api/admin/dashboard', { cookie: adminCookie })).body.data.revenue,
        498,
      );
      assert.equal(
        (await api('/api/orders/' + order._id, { cookie: buyerCookie })).body.data.orderStatus,
        'delivered',
      );
      const payload = {
        items: [{ productId: String(product._id), quantity: 1, price: 1 }],
        customer: { name: 'Smoke Buyer', phone: '9876543210' },
        shippingAddress: {
          addressLine1: '10 Test Lane',
          city: 'Delhi',
          state: 'Delhi',
          postalCode: '110001',
          country: 'India',
        },
        paymentMethod: 'cod',
        expectedTotalPaise: 24900,
      };
      const key = crypto.randomUUID();
      const placed = await api('/api/orders', {
        cookie: buyerCookie,
        method: 'POST',
        data: payload,
        key,
      });
      assert.equal(placed.status, 201);
      assert.equal(
        (await api('/api/orders', { cookie: buyerCookie, method: 'POST', data: payload, key })).body
          .order._id,
        placed.body.order._id,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await api('/api/admin/orders/' + placed.body.order._id + '/status', {
              cookie: adminCookie,
              method: 'PATCH',
              data: { orderStatus: 'cancelled' },
            })
          ).status,
          200,
        );
      assert.equal((await Product.findById(product._id)).stock, 8);
      const rolePath = '/api/admin/users/' + other._id + '/role';
      assert.equal(
        (await api(rolePath, { cookie: buyerCookie, method: 'PATCH', data: { role: 'admin' } }))
          .status,
        403,
      );
      assert.equal(
        (await api(rolePath, { cookie: adminCookie, method: 'PATCH', data: { role: 'admin' } }))
          .status,
        200,
      );
      assert.equal((await api('/api/auth/me', { cookie: otherCookie })).status, 401);
      const promotedCookie = await login(other.email);
      assert.equal((await api('/api/admin/orders', { cookie: promotedCookie })).status, 200);
      assert.equal(
        (await api(rolePath, { cookie: adminCookie, method: 'PATCH', data: { role: 'user' } }))
          .status,
        200,
      );
      assert.equal((await api('/api/admin/orders', { cookie: promotedCookie })).status, 401);
      assert.equal(
        (
          await api('/api/admin/users/' + admin._id + '/role', {
            cookie: adminCookie,
            method: 'PATCH',
            data: { role: 'user' },
          })
        ).status,
        409,
      );
      assert.equal(await AdminEvent.countDocuments({ type: 'role_change' }), 2);
      console.log(
        'Smoke checks passed: checkout UI + saved address, owned history, admin orders/status/COD revenue, idempotency/cancellation stock, safe promotion/demotion and access denials.',
      );
    } finally {
      dom?.window.close();
      if (server) await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await replica.stop();
    }
  },
  { timeout: 60000 },
);
