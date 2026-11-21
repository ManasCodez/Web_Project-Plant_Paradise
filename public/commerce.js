'use strict';
const root = document.getElementById('commerce');
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (v) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format((v || 0) / 100);
const date = (v) =>
  new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const label = (v) => String(v || 'unknown').replace(/_/g, ' ');
const safeImage = (v) => {
  try {
    const u = new URL(v, location.origin);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '/fallback-plant.svg';
  } catch {
    return '/fallback-plant.svg';
  }
};
const picture = (url, name) =>
  `<img src="${esc(safeImage(url || '/fallback-plant.svg'))}" alt="${esc(name)}" loading="lazy">`;
document.addEventListener(
  'error',
  (e) => {
    if (e.target.tagName === 'IMG' && !e.target.src.endsWith('/fallback-plant.svg'))
      e.target.src = '/fallback-plant.svg';
  },
  true,
);
let profile,
  cart = PlantCart.read(),
  quoted = null,
  products = new Map(),
  busy = false,
  quoteVersion = 0,
  pending = null;
const draftKey = () => `pp-delivery-${profile._id}`;
const pendingKey = () => `pp-checkout-${profile._id}`;
function stored(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function toast(message) {
  document.getElementById('toast').textContent = message;
  setTimeout(() => (document.getElementById('toast').textContent = ''), 6000);
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw Error('The server did not respond correctly. Please retry.');
  }
  if (response.status === 401) {
    location.href = '/login/?next=' + encodeURIComponent(location.pathname);
    throw Error('Please sign in to continue.');
  }
  if (!response.ok) {
    const error = Error(body.message || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return body;
}
const post = (path, data, headers = {}) =>
  api(path, { method: 'POST', headers, body: JSON.stringify(data) });
function empty(
  title = 'Your cart is waiting to bloom',
  text = 'Find a little green for your space. Your chosen plants will appear here.',
) {
  root.innerHTML = `<section class="card empty"><div class="empty-symbol">❧</div><h1>${esc(title)}</h1><p>${esc(text)}</p><a class="button" href="/Shop/">Explore the shop</a></section>`;
}
function errorScreen(error) {
  root.innerHTML = `<section class="card empty"><h1>Something needs a little care</h1><p>${esc(error.message)}</p><button id="retry">Try again</button></section>`;
  root.querySelector('#retry').onclick = () => location.reload();
}
function input(name, title, value = '', type = 'text', extra = '') {
  return `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function currentDraft() {
  const form = document.getElementById('delivery-form');
  if (!form) return {};
  return Object.fromEntries(new FormData(form));
}
function saveDraft() {
  try {
    sessionStorage.setItem(draftKey(), JSON.stringify(currentDraft()));
  } catch {}
}
function addressText(a) {
  return [
    a.addressLine1,
    a.addressLine2,
    a.landmark,
    [a.city, a.state, a.postalCode].filter(Boolean).join(', '),
    a.country,
  ]
    .filter(Boolean)
    .join('\n');
}
function totalsHTML(o) {
  return `<div class="price-row"><span>Subtotal</span><span>${money(o.subtotalPaise)}</span></div><div class="price-row"><span>Delivery</span><span>${o.deliveryChargePaise ? money(o.deliveryChargePaise) : 'Complimentary'}</span></div>${o.discountPaise ? `<div class="price-row"><span>Discount</span><span>−${money(o.discountPaise)}</span></div>` : ''}<div class="price-row total"><span>Total payable</span><strong>${money(o.totalPaise)}</strong></div>`;
}
function renderSummary() {
  const box = document.getElementById('summary');
  if (!box) return;
  const lines =
    (pending?.quote || quoted)?.items ||
    cart.map((i) => {
      const p = products.get(i.productId);
      return {
        productId: i.productId,
        plant: p?.name || 'Unavailable plant',
        image: p?.imageUrl,
        quantity: i.quantity,
        unitPricePaise: Math.round((p?.price || 0) * 100),
        subtotalPaise: Math.round((p?.price || 0) * 100) * i.quantity,
      };
    });
  const total = pending?.quote || quoted;
  box.innerHTML = `<div class="summary-head"><h2>Your green companions</h2><p>${cart.reduce((n, i) => n + i.quantity, 0)} plants · thoughtfully selected</p></div><div class="items">${lines.map((i) => `<div class="order-item">${picture(i.image, i.plant)}<div class="item-info"><strong>${esc(i.plant)}</strong><small>${money(i.unitPricePaise)} each</small><div class="quantity"><button type="button" data-quantity="-1" data-id="${esc(i.productId)}" aria-label="Remove one ${esc(i.plant)}" ${busy || pending ? 'disabled' : ''}>−</button><span>${i.quantity}</span><button type="button" data-quantity="1" data-id="${esc(i.productId)}" aria-label="Add one ${esc(i.plant)}" ${busy || pending ? 'disabled' : ''}>+</button><button type="button" class="remove" data-remove="${esc(i.productId)}" ${busy || pending ? 'disabled' : ''}>Remove</button></div></div><span class="item-price">${money(i.subtotalPaise)}</span></div>`).join('')}</div><div class="price-box">${total ? totalsHTML(total) : '<p>Review quantities to calculate your final total.</p>'}<button class="place-order" type="submit" form="delivery-form" ${busy || !total ? 'disabled' : ''}>${busy ? 'Please wait…' : pending ? 'Retry order safely' : 'Place Order'} <span aria-hidden="true">↗</span></button><p class="secure-note">${pending ? 'Your previous request may have completed. Retry to retrieve the same order; you will not be charged twice.' : 'Pay on delivery · No online payment required<br>Prices and availability verified at checkout.'}</p></div>`;
  box
    .querySelectorAll('[data-quantity]')
    .forEach((b) => (b.onclick = () => changeQuantity(b.dataset.id, Number(b.dataset.quantity))));
  box
    .querySelectorAll('[data-remove]')
    .forEach((b) => (b.onclick = () => changeQuantity(b.dataset.remove, -Infinity)));
}
async function changeQuantity(id, delta) {
  if (busy || pending) return;
  saveDraft();
  cart = cart
    .map((i) => (i.productId === id ? { ...i, quantity: Math.min(1000, i.quantity + delta) } : i))
    .filter((i) => i.quantity > 0);
  try {
    PlantCart.write(cart);
  } catch {
    toast('Could not save the cart. Check site storage settings.');
    return;
  }
  if (!cart.length) return empty();
  await refreshQuote();
}
async function refreshQuote() {
  const version = ++quoteVersion;
  busy = true;
  renderSummary();
  const message = document.getElementById('checkout-error');
  try {
    quoted = (await post('/api/orders/quote', { items: cart })).data;
    if (version !== quoteVersion) return;
    message.hidden = true;
  } catch (e) {
    if (version !== quoteVersion) return;
    quoted = null;
    message.textContent = e.message;
    message.hidden = false;
  } finally {
    if (version === quoteVersion) {
      busy = false;
      renderSummary();
    }
  }
}
async function checkout() {
  pending = stored(pendingKey());
  if (pending && !pending.body?.items) pending = null;
  if (!cart.length && !pending) return empty();
  if (pending) cart = pending.body.items;
  const saved = profile.savedAddress || {},
    draft = stored(draftKey()) || {},
    v = { name: profile.fullname, country: 'India', ...saved, ...draft };
  if (pending)
    Object.assign(v, pending.body.shippingAddress, pending.body.customer, {
      deliveryInstructions: pending.body.deliveryInstructions,
    });
  root.innerHTML = `<section class="hero"><div class="eyebrow">A greener home begins here</div><h1>Complete Your Order</h1><p>Your green companions are just one step away.</p><ol class="steps" aria-label="Order progress"><li class="done"><span>✓</span> Cart</li><i aria-hidden="true"></i><li class="current" aria-current="step"><span>2</span> Checkout</li><i aria-hidden="true"></i><li><span>3</span> Confirmation</li></ol></section><p id="checkout-error" class="error-message" role="alert" hidden></p><div class="checkout-layout"><form id="delivery-form"><section class="card"><div class="section-title"><span class="icon" aria-hidden="true">⌂</span><div><h2>Where should they grow?</h2><p>Add your contact and delivery details.</p></div></div><fieldset style="border:0;padding:0;margin:0" ${pending ? 'disabled' : ''}><div class="fields">${input('name', 'Full name', v.name, 'text', 'required autocomplete="name" maxlength="120"')}${input('email', 'Email address', profile.email, 'email', 'readonly autocomplete="email"')}${input('phone', 'Mobile number', v.phone, 'tel', 'required pattern="[6-9][0-9]{9}" maxlength="10" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number"')}${input('postalCode', 'PIN code', v.postalCode, 'text', 'required pattern="[1-9][0-9]{5}" maxlength="6" inputmode="numeric" autocomplete="postal-code"')}<div class="wide">${input('addressLine1', 'House / flat number & street', v.addressLine1, 'text', 'required maxlength="240" autocomplete="address-line1"')}</div><div class="wide">${input('addressLine2', 'Area / locality (optional)', v.addressLine2, 'text', 'maxlength="240" autocomplete="address-line2"')}</div>${input('landmark', 'Landmark (optional)', v.landmark, 'text', 'maxlength="160"')}${input('city', 'City', v.city, 'text', 'required maxlength="100" autocomplete="address-level2"')}${input('state', 'State / union territory', v.state, 'text', 'required maxlength="100" autocomplete="address-level1"')}${input('country', 'Country', v.country, 'text', 'readonly autocomplete="country-name"')}<label class="wide">Delivery instructions (optional)<textarea name="deliveryInstructions" rows="3" maxlength="1000" placeholder="Anything that helps us find you?">${esc(v.deliveryInstructions || '')}</textarea></label></div><label class="check-label"><input name="saveAddress" type="checkbox" ${draft.saveAddress ? 'checked' : ''}>Save this address for my next order</label></fieldset></section><section class="card"><div class="section-title"><span class="icon" aria-hidden="true">▤</span><div><h2>A simple way to pay</h2><p>Pay when your plants arrive.</p></div></div><label class="payment-option"><input type="radio" name="paymentMethod" value="cod" checked><span><strong>Cash on Delivery</strong><small>Keep the exact amount ready at delivery.</small></span><span class="payment-tag">AVAILABLE</span></label></section></form><aside id="summary" class="card summary" aria-label="Order summary"></aside></div>`;
  const form = root.querySelector('form');
  form.oninput = saveDraft;
  form.onsubmit = placeOrder;
  renderSummary();
  if (!pending) {
    try {
      products = new Map((await api('/api/content/products')).data.map((p) => [p._id, p]));
    } catch {}
    await refreshQuote();
  }
}
async function placeOrder(event) {
  event.preventDefault();
  if (busy) return;
  const form = document.getElementById('delivery-form');
  if (!pending && !form.reportValidity()) return;
  if (!pending && !quoted) return;
  if (!pending) {
    const d = currentDraft();
    const shippingAddress = Object.fromEntries(
      ['addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'postalCode', 'country'].map(
        (k) => [k, d[k] || ''],
      ),
    );
    pending = {
      key: crypto.randomUUID(),
      quote: quoted,
      body: {
        items: cart,
        customer: { name: d.name, phone: d.phone },
        shippingAddress,
        paymentMethod: 'cod',
        deliveryInstructions: d.deliveryInstructions || '',
        saveAddress: form.elements.saveAddress.checked,
        expectedTotalPaise: quoted.totalPaise,
      },
    };
    try {
      sessionStorage.setItem(pendingKey(), JSON.stringify(pending));
    } catch {
      pending = null;
      toast('Enable session storage to submit your order safely.');
      return;
    }
  }
  busy = true;
  form.querySelector('fieldset').disabled = true;
  renderSummary();
  try {
    const { order } = await post('/api/orders', pending.body, { 'Idempotency-Key': pending.key });
    PlantCart.clear();
    sessionStorage.removeItem(pendingKey());
    sessionStorage.removeItem(draftKey());
    location.href = '/orders/confirmation/' + order._id;
  } catch (e) {
    const message = document.getElementById('checkout-error');
    message.textContent = e.message;
    message.hidden = false;
    // Validation/conflict failures guarantee no order was committed. Network/5xx retries retain the exact request.
    if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      pending = null;
      sessionStorage.removeItem(pendingKey());
      form.querySelector('fieldset').disabled = false;
      busy = false;
      await refreshQuote();
      message.textContent = e.message;
      message.hidden = false;
    }
  } finally {
    busy = false;
    renderSummary();
  }
}
function itemRows(order) {
  return order.items
    .map(
      (i) =>
        `<div class="order-item">${picture(i.image, i.plant)}<div class="item-info"><strong>${esc(i.plant)}</strong><small>Quantity ${i.quantity} · ${money(i.unitPricePaise)} each</small></div><span class="item-price">${money(i.subtotalPaise)}</span></div>`,
    )
    .join('');
}
async function confirmation() {
  const id = location.pathname.split('/').pop();
  const { data: o } = await api('/api/orders/' + encodeURIComponent(id));
  document.title = 'Order ' + o.orderNumber + ' · Plant Paradise';
  root.innerHTML = `<section class="success-hero"><div class="success-check" aria-hidden="true">✓</div><div class="eyebrow">Thank you for growing with us</div><h1>${o.orderStatus === 'cancelled' ? 'Order Cancelled' : 'Order Placed Successfully!'}</h1><p>Order <strong>${esc(o.orderNumber)}</strong> · ${date(o.createdAt)}</p><span class="badge ${esc(o.orderStatus)}">${esc(label(o.orderStatus))}</span></section><div class="detail-grid"><section class="card"><div class="section-title"><h2>Your plants</h2></div>${itemRows(o)}<div class="price-box" style="border-radius:12px;margin-top:20px">${totalsHTML(o)}</div></section><div><section class="card"><div class="section-title"><h2>Delivery details</h2></div><strong>${esc(o.customer?.name || '')}</strong><p class="address">${esc(addressText(o.shippingAddress || {}))}</p><p class="hint">${esc(o.customer?.email || o.customerEmail)}<br>${esc(o.customer?.phone || '')}</p>${o.deliveryInstructions ? `<p class="hint">Instructions: ${esc(o.deliveryInstructions)}</p>` : ''}<hr style="border:0;border-top:1px solid var(--line)"><p>Payment: <strong>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : esc(label(o.paymentMethod))}</strong></p><span class="badge ${esc(o.paymentStatus)}">${esc(label(o.paymentStatus))}</span></section><section class="card"><h2 style="font-size:1rem">Order journey</h2><ul class="timeline">${(o.history || []).map((h) => `<li><strong>${esc(label(h.status))}${h.paymentStatus === 'paid' ? ' · Payment collected' : ''}</strong><small>${date(h.at)}</small></li>`).join('') || '<li>Order received</li>'}</ul></section></div></div><div class="actions"><a class="button" href="/my-orders">View My Orders</a><a class="button secondary" href="/Shop/">Continue Shopping</a></div>`;
}
async function myOrders() {
  const page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page')) || 1);
  const result = await api('/api/orders/my?page=' + page + '&limit=10');
  if (!result.total)
    return empty(
      'Your garden story starts here',
      'When you place your first order, you can follow its journey right here.',
    );
  document.title = 'My Orders · Plant Paradise';
  root.innerHTML = `<section class="hero"><div class="eyebrow">Your personal garden journal</div><h1>My Orders</h1><p>Every little green beginning, all in one place.</p></section><div class="order-list">${result.data
    .map(
      (o) =>
        `<article class="card order-card"><div class="order-card-header"><div><h2>${esc(o.orderNumber)}</h2><small>${date(o.createdAt)}</small></div><span class="badge ${esc(o.orderStatus)}">${esc(label(o.orderStatus))}</span></div><div class="order-card-body"><div class="thumbnails">${o.items
          .slice(0, 4)
          .map((i) => picture(i.image, i.plant))
          .join(
            '',
          )}</div><div><div class="order-total">${money(o.totalPaise)}</div><small class="hint">${o.totalItems} plants · ${o.paymentMethod === 'cod' ? 'Cash on Delivery' : esc(label(o.paymentMethod))}<br>Payment ${esc(label(o.paymentStatus))}</small></div><a class="button secondary" href="/orders/confirmation/${o._id}">View Details</a></div></article>`,
    )
    .join(
      '',
    )}</div><div class="pagination">${page > 1 ? `<a class="button secondary" href="?page=${page - 1}">Previous</a>` : ''}<span>Page ${page}</span>${page * result.limit < result.total ? `<a class="button secondary" href="?page=${page + 1}">Next</a>` : ''}</div>`;
}
(async () => {
  try {
    profile = (await api('/api/orders/profile')).data;
    if (location.pathname === '/checkout') await checkout();
    else if (location.pathname === '/my-orders') await myOrders();
    else await confirmation();
  } catch (e) {
    errorScreen(e);
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
})();
