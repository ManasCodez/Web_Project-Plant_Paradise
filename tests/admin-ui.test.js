const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const cat = {
  _id: 'a'.repeat(24),
  name: 'Indoor Plants',
  slug: 'indoor',
  displayOrder: 0,
  isActive: true,
};
const product = {
  _id: 'b'.repeat(24),
  name: 'Snake Plant',
  slug: 'snake-plant',
  category: 'indoor',
  price: 249,
  stock: 3,
  status: 'active',
  description: 'Original description',
  showInShop: true,
  showInCategories: true,
};
async function page(path, handler) {
  const dom = new JSDOM(fs.readFileSync('views/admin.html', 'utf8'), {
      url: 'http://localhost' + path,
      runScripts: 'outside-only',
    }),
    w = dom.window,
    calls = [];
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    let body;
    if (url === '/api/auth/me') body = { user: { fullname: 'Test Admin', role: 'admin' } };
    else if (url === '/api/admin/categories') body = { data: [cat] };
    else body = await handler(url, options);
    return {
      ok: body.status !== 500,
      status: body.status || 200,
      json: async () => ({ success: true, ...body }),
    };
  };
  w.eval(fs.readFileSync('public/admin-assets/admin.js', 'utf8'));
  await tick();
  await tick();
  return { dom, w, d: w.document, calls };
}
test('plant editor populates legacy fields, saves typed stock/prices and preserves image references', async () => {
  const { dom, w, d, calls } = await page(
    '/admin/products/' + product._id + '/edit',
    async (url, opts) =>
      opts.method
        ? { data: product }
        : url.endsWith('/' + product._id)
          ? { data: { ...product, imageUrl: 'https://example.test/old.jpg' } }
          : { data: [product], total: 1, page: 1, limit: 20 },
  );
  const form = d.querySelector('#plant-form');
  assert.ok(form);
  assert.equal(form.elements.shortDescription.value, 'Original description');
  form.elements.price.value = '299';
  form.elements.stock.value = '4';
  form.elements.famousFor.value = 'Fresh air';
  await form.onsubmit({ preventDefault() {}, submitter: { value: 'draft' } });
  await tick();
  const saved = calls.find((c) => c.options.method === 'PATCH'),
    body = JSON.parse(saved.options.body);
  assert.equal(body.price, 299);
  assert.equal(body.stock, 4);
  assert.equal(body.status, 'draft');
  assert.equal(body.famousFor, 'Fresh air');
  assert.equal(body.showInShop, true);
  assert.equal(body.images[0].url, 'https://example.test/old.jpg');
  dom.window.close();
});
test('new plant defaults to active and generated slug; save uses shared product API', async () => {
  const { dom, d, calls } = await page('/admin/products/new', async (url, opts) =>
    opts.method ? { data: product } : { data: [], total: 0, page: 1, limit: 20 },
  );
  const form = d.querySelector('#plant-form');
  form.elements.name.value = 'New Fern';
  form.elements.name.oninput();
  assert.equal(form.elements.slug.value, 'new-fern');
  assert.equal(form.elements.status.value, 'active');
  form.elements.category.value = 'indoor';
  form.elements.price.value = '199';
  form.elements.stock.value = '8';
  await form.onsubmit({ preventDefault() {}, submitter: { value: 'save' } });
  await tick();
  const saved = calls.find((c) => c.options.method === 'POST');
  assert.equal(saved.url, '/api/admin/products');
  assert.equal(JSON.parse(saved.options.body).status, 'active');
  dom.window.close();
});
test('admin product list escapes database content and builds working filters', async () => {
  const { dom, d, calls } = await page('/admin/products', async () => ({
    data: [{ ...product, name: '<img src=x onerror=alert(1)>' }],
    total: 1,
    page: 1,
    limit: 20,
  }));
  assert.equal(d.querySelector('[onerror]'), null);
  assert.match(d.querySelector('tbody').textContent, /<img src=x/);
  const form = d.querySelector('#filters');
  form.elements.q.value = 'Aloe';
  form.elements.category.value = 'indoor';
  form.onsubmit({ preventDefault() {}, target: form });
  await tick();
  await tick();
  assert.ok(calls.some((c) => c.url.includes('q=Aloe') && c.url.includes('category=indoor')));
  dom.window.close();
});
test('admin failed data reads offer a working retry', async () => {
  let offline = true;
  const { dom, d } = await page('/admin/users', async () =>
    offline
      ? { status: 500, message: 'Database unavailable' }
      : { data: [], total: 0, page: 1, limit: 20 },
  );
  assert.match(d.querySelector('#main').textContent, /Database unavailable/);
  offline = false;
  d.querySelector('#retry').click();
  await tick();
  await tick();
  assert.match(d.querySelector('#main').textContent, /No matching users/);
  dom.window.close();
});
