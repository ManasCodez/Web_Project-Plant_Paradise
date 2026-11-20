const cart = new Map();
let productsById = new Map();
let processing = false;
const cartText = document.getElementById('cart-summary-text');
const checkoutBtn = document.getElementById('checkout-btn');
const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
function totals() {
  let totalItems = 0, cents = 0;
  for (const [id, quantity] of cart) { totalItems += quantity; cents += Math.round(productsById.get(id).price * 100) * quantity; }
  return { totalItems, totalAmount: cents / 100 };
}
function updateCart() {
  const total = totals();
  cartText.textContent = `${total.totalItems} items — Total: ${currency(total.totalAmount)}`;
  checkoutBtn.disabled = processing || total.totalItems === 0;
  document.querySelectorAll('.product-card').forEach(card => {
    const quantity = cart.get(card.dataset.productId) || 0;
    card.querySelector('.qty-count').textContent = quantity;
    card.querySelector('.qty-control').classList.toggle('hidden', quantity === 0);
    card.querySelector('.add-to-cart').style.display = quantity ? 'none' : '';
    card.querySelectorAll('button').forEach(button => { button.disabled = processing; });
  });
}
document.addEventListener('content:loaded', event => {
  productsById = new Map(event.detail.products.map(product => [product._id, product])); cart.clear();
  document.querySelectorAll('.product-card').forEach(card => {
    const id = card.dataset.productId;
    const controls = document.createElement('div'); controls.className = 'qty-control hidden';
    const minus = document.createElement('button'); minus.type = 'button'; minus.className = 'qty-btn'; minus.textContent = '−'; minus.setAttribute('aria-label', `Remove one ${productsById.get(id).name}`);
    const count = document.createElement('span'); count.className = 'qty-count'; count.textContent = '0';
    const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'qty-btn'; plus.textContent = '+'; plus.setAttribute('aria-label', `Add one ${productsById.get(id).name}`);
    controls.append(minus, count, plus); card.querySelector('.add-to-cart').after(controls);
    const change = delta => { if (processing) return; const quantity = Math.max(0, (cart.get(id) || 0) + delta); if(quantity) cart.set(id, quantity); else cart.delete(id); updateCart(); };
    card.querySelector('.add-to-cart').onclick = () => change(1); plus.onclick = () => change(1); minus.onclick = () => change(-1);
  });
  updateCart();
});
checkoutBtn.onclick = async () => {
  const total = totals(); if (processing || !total.totalItems) return;
  let customerEmail = 'guest@plantparadise.com';
  try { customerEmail = JSON.parse(localStorage.getItem('plantParadiseUser'))?.email || customerEmail; } catch {}
  const items = [...cart].map(([id, quantity]) => { const product = productsById.get(id); return { productId: id, plant: product.name, price: product.price, quantity }; });
  const originalText = checkoutBtn.textContent;
  processing = true; updateCart(); checkoutBtn.textContent = 'Processing Order…';
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ orderId: `ORD-${Date.now()}`, items, ...total, customerEmail }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not process order. Please try again.');
    alert(`🎉 Order placed successfully!\nOrder ID: ${data.order.orderId}\nTotal: ${currency(data.order.totalAmount)}\nItems: ${data.order.totalItems}`); cart.clear();
  } catch (error) {
    alert(error.name === 'TimeoutError' ? 'Order request timed out. Check your order status before trying again.' : error.message);
  } finally { processing = false; checkoutBtn.textContent = originalText; updateCart(); }
};
