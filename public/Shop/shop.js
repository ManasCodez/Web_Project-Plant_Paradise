const cart = new Map((window.PlantCart?.read() || []).map((i) => [i.productId, i.quantity]));
let productsById = new Map();
let processing = false;

const cartText = document.getElementById('cart-summary-text');
const checkoutBtn = document.getElementById('checkout-btn');
const currency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
function totals() {
  let totalItems = 0,
    cents = 0;
  for (const [id, quantity] of cart) {
    totalItems += quantity;
    cents += Math.round((productsById.get(id)?.price || 0) * 100) * quantity;
  }
  return { totalItems, totalAmount: cents / 100 };
}
function updateCart() {
  const total = totals();
  cartText.textContent = `${total.totalItems} items — Total: ${currency(total.totalAmount)}`;
  checkoutBtn.disabled = processing || total.totalItems === 0;
  document.querySelectorAll('.product-card').forEach((card) => {
    const quantity = cart.get(card.dataset.productId) || 0;
    card.querySelector('.qty-count').textContent = quantity;
    card.querySelector('.qty-control').classList.toggle('hidden', quantity === 0);
    card.querySelector('.add-to-cart').style.display = quantity ? 'none' : '';
    const product = productsById.get(card.dataset.productId);
    if (product.stock === 0 || product.availability === 'unavailable')
      card.querySelector('.add-to-cart').textContent = 'Out of Stock';
    card.querySelectorAll('button').forEach((button) => {
      button.disabled =
        processing ||
        (button.dataset.action !== 'decrease' &&
          ((productsById.get(card.dataset.productId).stock ?? Infinity) <= quantity ||
            productsById.get(card.dataset.productId).availability === 'unavailable'));
    });
  });
}
document.addEventListener('content:loaded', (event) => {
  productsById = new Map(event.detail.products.map((product) => [product._id, product]));
  document.querySelectorAll('.product-card').forEach((card) => {
    const id = card.dataset.productId;
    const controls = document.createElement('div');
    controls.className = 'qty-control hidden';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.dataset.action = 'decrease';
    minus.className = 'qty-btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Remove one ${productsById.get(id).name}`);
    const count = document.createElement('span');
    count.className = 'qty-count';
    count.textContent = '0';
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'qty-btn';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Add one ${productsById.get(id).name}`);
    controls.append(minus, count, plus);
    card.querySelector('.add-to-cart').after(controls);
    const change = (delta) => {
      if (processing) return;
      const product = productsById.get(id);
      if (
        delta > 0 &&
        (product.availability === 'unavailable' ||
          (cart.get(id) || 0) >= (product.stock ?? Infinity))
      )
        return;
      const quantity = Math.max(0, (cart.get(id) || 0) + delta);
      if (quantity) cart.set(id, quantity);
      else cart.delete(id);
      try {
        PlantCart.write([...cart].map(([productId, quantity]) => ({ productId, quantity })));
      } catch {
        alert('Your browser could not save the cart. Enable site storage before checking out.');
      }
      updateCart();
    };
    card.querySelector('.add-to-cart').onclick = () => change(1);
    plus.onclick = () => change(1);
    minus.onclick = () => change(-1);
  });
  updateCart();
});
checkoutBtn.onclick = () => {
  if (!cart.size) return;
  try {
    PlantCart.write([...cart].map(([productId, quantity]) => ({ productId, quantity })));
    window.location.href = '/checkout';
  } catch {
    alert('Your browser could not save the cart. Enable site storage before checking out.');
  }
};
