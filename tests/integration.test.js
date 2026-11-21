process.env.MONGOMS_DOWNLOAD_DIR ||= require('node:path').resolve(
  __dirname,
  '../node_modules/.cache/mongodb-memory-server',
);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const sharp = require('sharp');
let replica, server, base, adminCookie, userCookie;
let Product, Category, User, Order, Media;
async function request(path, { method = 'GET', data, cookie, headers = {}, raw } = {}) {
  const response = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: raw ?? (data === undefined ? undefined : JSON.stringify(data)),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: response.status,
    body,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    headers: response.headers,
  };
}
before(
  async () => {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.MONGODB_URI = replica.getUri('plant_paradise_test');
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL;
    await require('../config/db')();
    const app = require('../server');
    Product = require('../models/ShopProduct');
    Category = require('../models/Category');
    User = require('../models/User');
    Order = require('../models/Order');
    Media = require('../models/Media');
    await Promise.all(
      [Product, Category, User, Order, Media, require('../models/RateLimit')].map((M) => M.init()),
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
    process.env.APP_ORIGIN = base;
  },
  { timeout: 900000 },
);
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replica) await replica.stop();
});
test('registration ignores supplied roles, password hashing, login cookies, authorization and logout revocation', async () => {
  const account = {
    fullname: 'Test Gardener',
    username: 'gardener',
    email: 'gardener@example.test',
    password: 'garden-test-password',
  };
  let r = await request('/api/auth/register', {
    method: 'POST',
    data: { ...account, role: 'admin' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'user');
  const user = await User.findOne({ email: account.email });
  assert.notEqual(user.password, account.password);
  r = await request('/api/auth/login', {
    method: 'POST',
    data: { email: { $ne: null }, password: 'x' },
  });
  assert.equal(r.status, 400);
  r = await request('/api/auth/login', {
    method: 'POST',
    data: { email: account.email, password: 'wrong' },
  });
  assert.equal(r.status, 401);
  r = await request('/api/auth/login', { method: 'POST', data: account });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal(r.body.token, undefined);
  userCookie = r.cookie;
  assert.equal((await request('/api/admin/products')).status, 401);
  assert.equal((await request('/api/admin/products', { cookie: userCookie })).status, 403);
  assert.equal(
    (
      await request('/api/admin/products', {
        cookie: userCookie,
        method: 'POST',
        data: { role: 'admin' },
      })
    ).status,
    403,
  );
  assert.equal((await request('/api/admin/products', { cookie: 'pp_session=forged' })).status, 401);
  assert.equal((await request('/admin')).status, 302);
  assert.equal((await request('/admin', { cookie: userCookie })).status, 403);
  assert.equal((await request('/api/orders', { cookie: userCookie })).status, 403);
  assert.equal((await request('/api/contact')).status, 401);
  await request('/api/auth/register', {
    method: 'POST',
    data: { ...account, username: 'admin', email: 'admin@example.test' },
  });
  await User.updateOne({ email: 'admin@example.test' }, { $set: { role: 'admin' } });
  r = await request('/api/auth/login', {
    method: 'POST',
    data: { email: 'admin@example.test', password: account.password },
  });
  assert.equal(r.status, 200);
  adminCookie = r.cookie;
  assert.equal((await request('/admin/products/new', { cookie: adminCookie })).status, 200);
  assert.equal(
    (
      await request('/api/admin/products', {
        cookie: adminCookie,
        method: 'POST',
        data: {},
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  const list = await request('/api/admin/users', { cookie: adminCookie });
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 2);
  for (const u of list.body.data) {
    assert.equal(u.password, undefined);
    assert.equal(u.sessionVersion, undefined);
    assert.equal(u.dob, undefined);
  }
  assert.equal(
    (await request('/api/auth/logout', { method: 'POST', data: {}, cookie: userCookie })).status,
    200,
  );
  assert.equal((await request('/api/auth/me', { cookie: userCookie })).status, 401);
});
test('legacy migration preserves IDs, prices, source arrays and edited content on repeat runs', async () => {
  const seed = require('../seed/content.json');
  await require('../scripts/seed-content').seedContent();
  // Remove only extension fields in this isolated test database to simulate old documents.
  await Product.collection.updateMany(
    {},
    {
      $unset: {
        stock: '',
        status: '',
        images: '',
        showInShop: '',
        showInCategories: '',
        availability: '',
      },
    },
  );
  const before = await Product.collection.findOne({ slug: 'medicinal-aloe-vera' });
  const home = await require('../models/HomePage').findOne({ slug: 'home' }).lean();
  const { migrate } = require('../scripts/migrate-admin');
  assert.equal((await migrate()).changes, 24);
  await migrate({ apply: true });
  const after = await Product.findById(before._id).lean();
  assert.equal(String(before._id), String(after._id));
  assert.equal(after.price, before.price);
  assert.equal(after.imageUrl, before.imageUrl);
  assert.equal(after.description, before.description);
  assert.equal(after.stock, 0);
  assert.ok(after.famousFor);
  assert.ok(after.uses);
  await Product.updateOne({ _id: before._id }, { $set: { famousFor: 'Admin edit', price: 249 } });
  assert.equal((await migrate({ apply: true })).changes, 0);
  assert.equal((await Product.findById(before._id)).famousFor, 'Admin edit');
  assert.equal(await Product.countDocuments(), 24);
  assert.deepEqual(
    (await require('../models/HomePage').findOne({ slug: 'home' }).lean()).plants,
    home.plants,
  );
});
test('product CRUD, shared public data, category filters, visibility, archive and safe category deletion', async () => {
  let r = await request('/api/admin/categories', {
    cookie: adminCookie,
    method: 'POST',
    data: {
      name: 'Air Purifying Plants',
      slug: 'air-purifying',
      description: 'Fresh green spaces',
      displayOrder: 7,
      isActive: true,
    },
  });
  assert.equal(r.status, 201);
  const cat = r.body.data;
  const data = {
    name: 'Test Snake Plant',
    slug: 'test-snake',
    category: cat.slug,
    price: 299,
    stock: 10,
    shortDescription: 'Fresh description',
    famousFor: 'Clean air',
    uses: 'Indoor decoration',
    status: 'active',
    showInShop: true,
    showInCategories: true,
  };
  r = await request('/api/admin/products', { cookie: adminCookie, method: 'POST', data });
  assert.equal(r.status, 201);
  const id = r.body.data._id;
  assert.equal(
    (
      await request('/api/admin/products', {
        cookie: adminCookie,
        method: 'POST',
        data: { ...data, slug: 'bad-price', price: -1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/admin/products', {
        cookie: adminCookie,
        method: 'POST',
        data: { ...data, slug: 'bad-category', category: 'missing' },
      })
    ).status,
    400,
  );
  r = await request('/api/admin/products/' + id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: {
      price: 249,
      discountPrice: 199,
      shortDescription: 'Updated description',
      imageUrl: 'https://example.test/plant.jpg',
    },
  });
  assert.equal(r.status, 200);
  const shop = (await request('/api/content/products')).body.data.find((p) => p._id === id),
    home = (await request('/api/content/home')).body.data.plants.find((p) => p._id === id);
  assert.equal(shop.price, 199);
  assert.equal(shop.description, 'Updated description');
  assert.equal(home.description, shop.description);
  assert.equal(home.imageUrl, shop.imageUrl);
  assert.equal(home.famousFor, 'Clean air');
  assert.equal((await request('/api/categories/' + cat.slug + '/products')).body.data[0]._id, id);
  assert.equal(
    (
      await request('/api/admin/categories/' + cat._id, {
        cookie: adminCookie,
        method: 'DELETE',
        data: {},
      })
    ).status,
    409,
  );
  r = await request('/api/admin/products?q=Test&category=' + cat.slug + '&limit=1&sort=price', {
    cookie: adminCookie,
  });
  assert.equal(r.body.total, 1);
  assert.equal(r.body.data.length, 1);
  await request('/api/admin/products/' + id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: { showInShop: false },
  });
  assert.equal(
    (await request('/api/content/products')).body.data.some((p) => p._id === id),
    false,
  );
  assert.equal(
    (await request('/api/content/home')).body.data.plants.some((p) => p._id === id),
    true,
  );
  await request('/api/admin/categories/' + cat._id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: { isActive: false },
  });
  assert.equal(
    (await request('/api/content/home')).body.data.plants.some((p) => p._id === id),
    false,
  );
  await request('/api/admin/categories/' + cat._id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: { isActive: true },
  });
  await request('/api/admin/products/' + id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: { status: 'draft' },
  });
  assert.equal((await request('/api/categories/' + cat.slug + '/products')).body.data.length, 0);
  await request('/api/admin/products/' + id, { cookie: adminCookie, method: 'DELETE', data: {} });
  assert.equal((await Product.findById(id)).status, 'archived');
  await request('/api/admin/products/' + id, {
    cookie: adminCookie,
    method: 'PATCH',
    data: { category: 'indoor' },
  });
  assert.equal(
    (
      await request('/api/admin/categories/' + cat._id, {
        cookie: adminCookie,
        method: 'DELETE',
        data: {},
      })
    ).status,
    200,
  );
});
test('checkout ignores browser prices, is idempotent, prevents overselling and rolls back a multi-item failure', async () => {
  const p = await Product.create({
    name: 'Checkout Plant',
    slug: 'checkout-plant',
    category: 'indoor',
    price: 249,
    stock: 3,
    status: 'active',
  });
  const details = {
    customer: { name: 'Test Admin', phone: '9876543210' },
    shippingAddress: {
      addressLine1: '10 Test Street',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110001',
      country: 'India',
    },
    paymentMethod: 'cod',
  };
  const payload = {
    ...details,
    expectedTotalPaise: 49800,
    items: [{ productId: String(p._id), quantity: 2, price: 1, plant: 'Forged' }],
    totalAmount: 1,
    totalItems: 99,
  };
  const key = crypto.randomUUID();
  let r = await request('/api/orders', {
    cookie: adminCookie,
    method: 'POST',
    data: payload,
    headers: { 'Idempotency-Key': key },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.totalAmount, 498);
  assert.equal(r.body.order.totalItems, 2);
  r = await request('/api/orders', {
    cookie: adminCookie,
    method: 'POST',
    data: payload,
    headers: { 'Idempotency-Key': key },
  });
  assert.equal(r.status, 201);
  assert.equal((await Product.findById(p._id)).stock, 1);
  assert.equal(await Order.countDocuments(), 1);
  const parallel = await Promise.all(
    [1, 2].map(() =>
      request('/api/orders', {
        cookie: adminCookie,
        method: 'POST',
        data: {
          ...details,
          expectedTotalPaise: 24900,
          items: [{ productId: String(p._id), quantity: 1 }],
        },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    ),
  );
  assert.deepEqual(parallel.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await Product.findById(p._id)).stock, 0);
  const other = await Product.create({
    name: 'Other',
    slug: 'other-checkout',
    category: 'indoor',
    price: 50,
    stock: 5,
    status: 'active',
  });
  r = await request('/api/orders', {
    cookie: adminCookie,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      ...details,
      expectedTotalPaise: 29900,
      items: [
        { productId: String(other._id), quantity: 1 },
        { productId: String(p._id), quantity: 1 },
      ],
    },
  });
  assert.equal(r.status, 409);
  assert.equal((await Product.findById(other._id)).stock, 5);
  await request('/api/admin/products/' + p._id, {
    cookie: adminCookie,
    method: 'DELETE',
    data: {},
  });
  const order = await Order.findOne({ 'items.productId': p._id });
  assert.equal(order.items[0].plant, 'Checkout Plant');
  assert.equal(order.items[0].price, 249);
  assert.equal(
    (await request('/api/admin/dashboard', { cookie: adminCookie })).body.data.orders,
    2,
  );
});
test('image validation, persistent-storage adapter, reference-safe media removal and upload authorization', async () => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.cloudinary.com/')) {
      calls++;
      assert.ok(options.body.get('signature'));
      assert.ok(options.body.get('file').size > 0);
      return {
        ok: true,
        json: async () => ({
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test.webp',
          public_id: options.body.get('public_id'),
          width: 20,
          height: 20,
          bytes: 300,
        }),
      };
    }
    return realFetch(url, options);
  };
  try {
    const headers = { 'Content-Type': 'image/png', 'X-Requested-With': 'PlantParadise' },
      png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#116633' } })
        .png()
        .toBuffer();
    assert.equal(
      (await request('/api/admin/media/upload', { method: 'POST', headers, raw: png })).status,
      401,
    );
    assert.equal(
      (
        await request('/api/admin/media/upload', {
          method: 'POST',
          cookie: adminCookie,
          headers,
          raw: Buffer.alloc(3 * 1024 * 1024 + 1),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await request('/api/admin/media/upload', {
          method: 'POST',
          cookie: adminCookie,
          headers,
          raw: Buffer.from('not a png'),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/admin/media/upload', {
          method: 'POST',
          cookie: adminCookie,
          headers: { ...headers, 'Content-Type': 'image/jpeg' },
          raw: png,
        })
      ).status,
      400,
    );
    const r = await request('/api/admin/media/upload', {
      method: 'POST',
      cookie: adminCookie,
      headers,
      raw: png,
    });
    assert.equal(r.status, 201);
    assert.equal(calls, 1);
    const media = r.body.data;
    assert.ok(await Media.findById(media._id));
    const p = await Product.create({
      name: 'Photo plant',
      slug: 'photo-plant',
      category: 'indoor',
      price: 20,
      imageUrl: media.url,
      images: [{ url: media.url, publicId: media.publicId, alt: 'Leaf' }],
    });
    assert.equal(
      (
        await request('/api/admin/media/' + media._id, {
          method: 'DELETE',
          cookie: adminCookie,
          data: {},
        })
      ).status,
      409,
    );
    await request('/api/admin/products/' + p._id, {
      method: 'PATCH',
      cookie: adminCookie,
      data: { images: [] },
    });
    assert.equal(
      (
        await request('/api/admin/media/' + media._id, {
          method: 'DELETE',
          cookie: adminCookie,
          data: {},
        })
      ).status,
      200,
    );
    assert.equal((await Media.findById(media._id)).retired, true);
  } finally {
    global.fetch = realFetch;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }
});
test('persistent limiter returns 429 and safe retry metadata', async () => {
  const responses = await Promise.all(
    Array.from({ length: 32 }, () =>
      request('/api/auth/login', {
        method: 'POST',
        data: { email: 'missing@example.test', password: 'wrong' },
      }),
    ),
  );
  const limited = responses.find((r) => r.status === 429);
  assert.ok(limited);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
