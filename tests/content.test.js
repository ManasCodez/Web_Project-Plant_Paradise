const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const express = require('express');
const mongoose = require('mongoose');
const seed = require('../seed/content.json');
const HomePage = require('../models/HomePage');
const Category = require('../models/Category');
const ShopProduct = require('../models/ShopProduct');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const products = () => seed.products.map((p, i) => ({ ...p, _id: `product-${i}` }));
const pause = () => new Promise((resolve) => setImmediate(resolve));
async function frontend(page, options = {}) {
  const dom = new JSDOM(read(page === 'home' ? 'public/index.html' : 'public/Shop/index.html'), {
    url: options.url || `http://localhost/${page === 'home' ? '' : 'Shop/'}`,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const alerts = [],
    orders = [];
  w.alert = (message) => alerts.push(message);
  w.confirm = () => true;
  if (options.user) w.localStorage.setItem('plantParadiseUser', JSON.stringify(options.user));
  const data = {
    home: clone(seed.pages[0]),
    shop: clone(seed.pages[1]),
    categories: clone(seed.categories),
    products: products(),
  };
  if (options.edit) options.edit(data);
  w.fetch = async (url, init) => {
    if (url === '/api/orders') {
      orders.push(JSON.parse(init.body));
      return {
        ok: !options.orderError,
        json: async () =>
          options.orderError
            ? { success: false, message: 'Try again' }
            : { success: true, order: orders.at(-1) },
      };
    }
    if (options.fail?.()) throw new Error('Offline');
    return { ok: true, json: async () => ({ success: true, data: data[url.split('/').at(-1)] }) };
  };
  w.eval(read('public/auth-state.js'));
  w.eval(read('public/cart.js'));
  w.eval(read(page === 'home' ? 'public/search.js' : 'public/Shop/shop.js'));
  w.eval(read('public/content.js'));
  await pause();
  return { dom, w, d: w.document, data, alerts, orders };
}
function textNodes(document) {
  const walker = document.createTreeWalker(document.body, 4);
  const texts = [];
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement.closest('script, #content-status, .qty-control')) continue;
    const value = walker.currentNode.textContent.trim().replace(/\s+/g, ' ');
    if (value) texts.push(value);
  }
  return texts;
}
test('opening the HTML directly explains how to load the database-backed page', async () => {
  const { dom, d } = await frontend('home', { url: 'file:///C:/plant-paradise/public/index.html' });
  assert.match(d.getElementById('content-status').textContent, /http:\/\/localhost:3000\//);
  assert.equal(d.querySelectorAll('.plant-card').length, 0);
  dom.window.close();
});
test('home migration preserves every visible text, link, image, category and hero background', async () => {
  const { dom, d } = await frontend('home');
  const original = new JSDOM(read('seed/original-home.html')).window.document;
  assert.deepEqual(textNodes(d), textNodes(original));
  assert.equal(d.title, original.title);
  assert.equal(d.querySelectorAll('.plant-card').length, 24);
  assert.equal(d.querySelectorAll('.category-card').length, 6);
  assert.deepEqual(
    [...d.querySelectorAll('img')].map((n) => [n.src, n.alt]),
    [...original.querySelectorAll('img')].map((n) => [n.src, n.alt]),
  );
  assert.deepEqual(
    [...d.querySelectorAll('a')].map((n) =>
      n.getAttribute('href').replace('http://localhost/', ''),
    ),
    [...original.querySelectorAll('a')].map((n) => n.getAttribute('href')),
  );
  const originalUrls = [
    ...read('seed/original-style.css').matchAll(/background: url\("([^"]+)"\)/g),
  ].map((m) => m[1]);
  assert.deepEqual(
    seed.pages[0].backgrounds.map((b) => b.imageUrl),
    originalUrls,
  );
  for (const b of seed.pages[0].backgrounds)
    assert.ok(d.querySelector(b.selector).style.backgroundImage.includes(b.imageUrl));
  dom.window.close();
});
test('shop preserves every product, description, image, category and numeric price', async () => {
  const { dom, d } = await frontend('shop');
  const original = new JSDOM(read('seed/original-shop.html')).window.document;
  assert.deepEqual(textNodes(d), textNodes(original));
  assert.equal(d.querySelectorAll('.product-card').length, 24);
  [...original.querySelectorAll('.product-card')].forEach((card, i) => {
    const p = seed.products[i];
    assert.equal(p.name, card.querySelector('h3').textContent);
    assert.equal(p.description, card.querySelector('p').textContent);
    assert.equal(
      p.price,
      Number(card.querySelector('.product-price').textContent.replace('₹', '')),
    );
    assert.equal(p.imageUrl, card.querySelector('img').src);
    assert.equal(p.imageAlt, card.querySelector('img').alt);
  });
  assert.equal(new Set(seed.products.map((p) => p.slug)).size, 24);
  assert.equal(seed.products.filter((p) => p.name === 'Aloe Vera').length, 2);
  dom.window.close();
});
test('search, clearing, category anchors and authentication work after asynchronous loading', async () => {
  const { dom, w, d } = await frontend('home', {
    user: { fullname: 'Test User', email: 'test@example.com' },
  });
  const input = d.getElementById('plantSearch');
  input.value = 'aloe';
  input.dispatchEvent(new w.Event('input'));
  assert.equal(
    [...d.querySelectorAll('.plant-card')].filter((c) => c.style.display !== 'none').length,
    2,
  );
  assert.match(d.getElementById('searchResult').textContent, /2 matching/);
  input.value = 'does not exist';
  input.dispatchEvent(new w.Event('input'));
  assert.match(d.getElementById('searchResult').textContent, /No plants/);
  d.getElementById('clearSearch').click();
  assert.equal(
    [...d.querySelectorAll('.plant-section')].filter((c) => c.style.display !== 'none').length,
    6,
  );
  assert.ok(d.getElementById('nav-user-item'));
  for (const a of d.querySelectorAll('.category-card'))
    assert.ok(d.getElementById(new URL(a.href).hash.slice(1)));
  dom.window.close();
});
test('shop cart persists IDs and quantities for the dedicated checkout page', async () => {
  const { dom, w, d } = await frontend('shop', {
    edit: (data) => {
      data.products[0].price = 199.95;
    },
  });
  const first = d.querySelector('.product-card');
  first.querySelector('.add-to-cart').click();
  first.querySelectorAll('.qty-btn')[1].click();
  assert.match(d.getElementById('cart-summary-text').textContent, /399.9/);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('plantParadiseCart')), [
    { productId: 'product-0', quantity: 2 },
  ]);
  first.querySelectorAll('.qty-btn')[0].click();
  assert.equal(JSON.parse(w.localStorage.getItem('plantParadiseCart'))[0].quantity, 1);
  dom.window.close();
});
test('empty data, offline retry and malicious database values render safely', async () => {
  let offline = true;
  const { dom, d, data } = await frontend('home', {
    fail: () => offline,
    edit: (data) => {
      data.home.plants[0].name = '<img src=x onerror=alert(1)>';
      data.home.plants[0].imageUrl = 'javascript:alert(1)';
      const key = Object.keys(data.home.content).find((k) => data.home.content[k] === 'Shop/');
      data.home.content[key] = 'javascript:alert(1)';
    },
  });
  assert.match(d.getElementById('content-status').textContent, /Offline/);
  offline = false;
  d.querySelector('#content-status button').click();
  await pause();
  assert.equal(d.querySelector('.plant-card h3').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(d.querySelector('.plant-card img').hasAttribute('src'), false);
  assert.equal(d.querySelector('a[href^="javascript:"]'), null);
  assert.equal(d.querySelector('[onerror]'), null);
  assert.equal(d.getElementById('content-status').hidden, true);
  dom.window.close();
  const empty = await frontend('shop', {
    edit: (data) => {
      data.products = [];
    },
  });
  assert.match(empty.d.getElementById('content-status').textContent, /No content/);
  assert.ok(empty.d.querySelector('#content-status button'));
  assert.equal(empty.d.getElementById('checkout-btn').disabled, true);
  empty.dom.window.close();
});
test('model validation rejects invalid prices and all seed records validate', async () => {
  for (const [Model, records] of [
    [HomePage, seed.pages],
    [Category, seed.categories],
    [ShopProduct, seed.products],
  ])
    for (const record of records) await new Model(record).validate();
  await assert.rejects(new ShopProduct({ ...seed.products[0], price: -1 }).validate());
});
test('seed reruns preserve existing records and edits (model adapter)', async () => {
  const restores = [],
    stores = [];
  try {
    for (const Model of [HomePage, Category, ShopProduct]) {
      const store = new Map();
      stores.push(store);
      const oldInit = Model.init,
        oldUpdate = Model.updateOne;
      restores.push(() => {
        Model.init = oldInit;
        Model.updateOne = oldUpdate;
      });
      Model.init = async () => {};
      Model.updateOne = async (filter, update, options) => {
        assert.equal(options.timestamps, false);
        assert.deepEqual(Object.keys(update), ['$setOnInsert']);
        if (store.has(filter.slug)) return { upsertedCount: 0 };
        store.set(filter.slug, clone(update.$setOnInsert));
        return { upsertedCount: 1 };
      };
    }
    const { seedContent } = require('../scripts/seed-content');
    await seedContent();
    stores[2].get(seed.products[0].slug).price = 123.45;
    const before = JSON.stringify(stores.map((s) => [...s]));
    await seedContent();
    assert.equal(JSON.stringify(stores.map((s) => [...s])), before);
    assert.deepEqual(
      stores.map((s) => s.size),
      [2, 6, 24],
    );
  } finally {
    restores.forEach((restore) => restore());
  }
});
test('read APIs serve latest model data, empty collections, missing pages and database errors', async () => {
  const originalState = mongoose.connection.readyState;
  const saved = [HomePage.findOne, Category.find, ShopProduct.find];
  const app = express();
  app.use('/api/content', require('../routes/contentRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/content/`;
  let page = { ...seed.pages[0] },
    categories = seed.categories,
    items = products(),
    failure = false;
  const query = (value) => ({
    sort() {
      return this;
    },
    select() {
      return this;
    },
    then(resolve, reject) {
      return (failure ? Promise.reject(new Error('unavailable')) : Promise.resolve(value)).then(
        resolve,
        reject,
      );
    },
    lean() {
      return this;
    },
    maxTimeMS() {
      return failure ? Promise.reject(new Error('unavailable')) : Promise.resolve(value);
    },
  });
  HomePage.findOne = () => query(page);
  Category.find = () => query(categories);
  ShopProduct.find = () => query(items);
  try {
    mongoose.connection.readyState = 0;
    assert.equal((await fetch(base + 'home')).status, 503);
    mongoose.connection.readyState = 1;
    assert.equal((await (await fetch(base + 'products')).json()).data.length, 24);
    page = { ...page, content: { heroTitle: 'Edited in database' } };
    assert.equal(
      (await (await fetch(base + 'home')).json()).data.content.heroTitle,
      'Edited in database',
    );
    items = [];
    categories = [];
    assert.deepEqual((await (await fetch(base + 'products')).json()).data, []);
    assert.deepEqual((await (await fetch(base + 'categories')).json()).data, []);
    page = null;
    assert.equal((await fetch(base + 'home')).status, 404);
    failure = true;
    assert.equal((await fetch(base + 'products')).status, 503);
  } finally {
    [HomePage.findOne, Category.find, ShopProduct.find] = saved;
    mongoose.connection.readyState = originalState;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('stock limits disable adding but still allow cart removal', async () => {
  const { dom, d, w } = await frontend('shop', {
    edit: (data) => {
      data.products[0].stock = 1;
    },
  });
  const card = d.querySelector('.product-card');
  card.querySelector('.add-to-cart').click();
  assert.equal(card.querySelectorAll('.qty-btn')[1].disabled, true);
  assert.equal(card.querySelectorAll('.qty-btn')[0].disabled, false);
  card.querySelectorAll('.qty-btn')[0].click();
  assert.equal(card.querySelector('.qty-count').textContent, '0');
  assert.deepEqual(JSON.parse(w.localStorage.getItem('plantParadiseCart')), []);
  dom.window.close();
});

test('public logout invalidates the server session and retains display state when logout fails', async () => {
  const { dom, w, d, alerts } = await frontend('home', {
    user: { fullname: 'Test User', email: 'test@example.com' },
  });
  const calls = [];
  let fail = true;
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: !fail, status: fail ? 500 : 200 };
  };
  await d.getElementById('nav-logout-btn').onclick();
  assert.ok(w.localStorage.getItem('plantParadiseUser'));
  assert.match(alerts.at(-1), /Logout failed/);
  fail = false;
  await d.getElementById('nav-logout-btn').onclick();
  assert.equal(calls.at(-1).url, '/api/auth/logout');
  assert.equal(calls.at(-1).options.method, 'POST');
  assert.equal(w.localStorage.getItem('plantParadiseUser'), null);
  assert.equal(d.getElementById('nav-user-item'), null);
  dom.window.close();
});
