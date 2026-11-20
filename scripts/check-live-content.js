// Run against an already running server: node scripts/check-live-content.js
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const base = process.env.APP_URL || 'http://localhost:5000';
async function check(page, pathname, script) {
  const response = await fetch(new URL(pathname, base));
  assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text(), { url: new URL(pathname, base).href, runScripts: 'outside-only' });
  const w = dom.window;
  try {
    // Node's fetch requires its own realm's AbortSignal, unlike a browser fetch.
    w.AbortSignal = globalThis.AbortSignal;
    w.AbortController = globalThis.AbortController;
    w.fetch = (url, options) => fetch(new URL(url, w.location.href), options);
    w.HTMLElement.prototype.scrollIntoView = () => {};
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${page} did not load: ${w.document.getElementById('content-status').textContent}`)), 12000);
      w.document.addEventListener('content:loaded', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    for (const file of ['/auth-state.js', script, '/content.js']) {
      w.eval(await (await fetch(new URL(file, base))).text());
    }
    await loaded;
    assert.equal(w.document.getElementById('content-status').hidden, true);
    if (page === 'home') {
      assert.equal(w.document.querySelectorAll('.plant-card').length, 24);
      assert.equal(w.document.querySelectorAll('.category-card').length, 6);
      const search = w.document.getElementById('plantSearch');
      search.value = 'aloe'; search.dispatchEvent(new w.Event('input'));
      assert.match(w.document.getElementById('searchResult').textContent, /2 matching/);
    } else {
      assert.equal(w.document.querySelectorAll('.product-card').length, 24);
      w.document.querySelector('.add-to-cart').click();
      assert.equal(w.document.querySelector('.qty-count').textContent, '1');
      assert.equal(w.document.getElementById('checkout-btn').disabled, false);
    }
    console.log(`${page}: live MongoDB content rendered; ${page === 'home' ? 'search and categories' : 'cart controls'} passed.`);
  } finally { w.close(); }
}
async function main() {
  await check('home', '/', '/search.js');
  await check('shop', '/Shop/', '/Shop/shop.js');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
