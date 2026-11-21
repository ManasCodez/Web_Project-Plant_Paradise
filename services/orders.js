const { fail } = require('../middleware/security');
const { validId, effectivePrice, publicFilter, string } = require('./catalog');
const Product = require('../models/ShopProduct');
const Category = require('../models/Category');
const statuses = [
  'placed',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
];
const nextStatuses = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};
function statusOf(order) {
  return order.orderStatus || (order.status === 'pending' ? 'placed' : order.status);
}
function presentOrder(order) {
  const o = order.toObject ? order.toObject() : order;
  const { idempotencyKey, requestHash, __v, ...data } = o;
  return {
    ...data,
    orderNumber: o.orderNumber || o.orderId,
    orderStatus: statusOf(o),
    allowedStatuses: nextStatuses[statusOf(o)] || [],
    paymentMethod: o.paymentMethod || 'unknown',
    paymentStatus: o.paymentStatus || 'unknown',
    legacy: !o.userId,
    totalPaise: o.totalPaise ?? Math.round(o.totalAmount * 100),
    subtotalPaise: o.subtotalPaise ?? Math.round(o.totalAmount * 100),
    deliveryChargePaise: o.deliveryChargePaise || 0,
    discountPaise: o.discountPaise || 0,
    items: o.items.map((i) => ({
      ...i,
      unitPricePaise: i.unitPricePaise ?? Math.round(i.price * 100),
      subtotalPaise: i.subtotalPaise ?? Math.round(i.price * 100) * i.quantity,
    })),
  };
}
function cartItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100)
    throw fail(400, 'Your cart must contain 1 to 100 plants.');
  const quantities = new Map();
  for (const item of items) {
    if (!item || typeof item.productId !== 'string') throw fail(400, 'Invalid plant in cart.');
    const id = validId(item.productId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000)
      throw fail(400, 'Choose a quantity between 1 and 1,000.');
    const quantity = (quantities.get(id) || 0) + item.quantity;
    if (quantity > 1000) throw fail(400, 'Maximum quantity is 1,000 per plant.');
    quantities.set(id, quantity);
  }
  return [...quantities].sort(([a], [b]) => a.localeCompare(b));
}
function delivery(body, user) {
  const input = body.shippingAddress;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw fail(400, 'Enter your delivery address.');
  const text = (value, label, max, required = true) => {
    const v = string(value ?? '', label, max);
    if (required && !v) throw fail(400, `${label} is required.`);
    return v;
  };
  const name = text(body.customer?.name, 'Full name', 120);
  const phone = text(body.customer?.phone, 'Mobile number', 20)
    .replace(/[\s()-]/g, '')
    .replace(/^\+91/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) throw fail(400, 'Enter a valid 10-digit Indian mobile number.');
  const shippingAddress = {};
  for (const [key, label, max, required] of [
    ['addressLine1', 'Address line 1', 240, true],
    ['addressLine2', 'Address line 2', 240, false],
    ['landmark', 'Landmark', 160, false],
    ['city', 'City', 100, true],
    ['state', 'State', 100, true],
    ['postalCode', 'PIN code', 6, true],
  ])
    shippingAddress[key] = text(input[key], label, max, required);
  if (!/^[1-9]\d{5}$/.test(shippingAddress.postalCode))
    throw fail(400, 'Enter a valid six-digit PIN code.');
  const country = text(input.country || 'India', 'Country', 60);
  if (country.toLowerCase() !== 'india')
    throw fail(400, 'Delivery is currently available within India only.');
  shippingAddress.country = 'India';
  if (body.paymentMethod !== 'cod')
    throw fail(400, 'Cash on Delivery is the supported payment method.');
  if (body.saveAddress !== undefined && typeof body.saveAddress !== 'boolean')
    throw fail(400, 'Invalid save address option.');
  return {
    customer: { name, phone, email: user.email },
    shippingAddress,
    deliveryInstructions: text(body.deliveryInstructions, 'Delivery instructions', 1000, false),
    paymentMethod: 'cod',
  };
}
async function quote(items, session, reserve = false) {
  const quantities = cartItems(items),
    result = [];
  const filter = await publicFilter('shop');
  let subtotalPaise = 0,
    totalItems = 0;
  for (const [id, quantity] of quantities) {
    let product;
    if (reserve)
      product = await Product.findOneAndUpdate(
        { _id: id, ...filter, availability: { $ne: 'unavailable' }, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session, new: true },
      );
    else
      product = await Product.findOne({
        _id: id,
        ...filter,
        availability: { $ne: 'unavailable' },
        stock: { $gte: quantity },
      }).lean();
    if (!product)
      throw fail(
        409,
        'A plant is unavailable or has insufficient stock. Adjust your cart or return to the shop.',
      );
    if (reserve) {
      // Serialize publication changes with checkout, inside the stock transaction.
      const category = await Category.findOneAndUpdate(
        { slug: product.category, isActive: { $ne: false } },
        { $inc: { __v: 1 } },
        { session, new: true },
      );
      if (!category) throw fail(409, 'A plant category is no longer available.');
    }
    const unitPricePaise = Math.round(effectivePrice(product) * 100),
      line = unitPricePaise * quantity;
    if (!Number.isSafeInteger(line)) throw fail(400, 'Order amount exceeds the supported limit.');
    subtotalPaise += line;
    totalItems += quantity;
    result.push({
      productId: product._id,
      plant: product.name,
      image: product.imageUrl || '',
      quantity,
      price: unitPricePaise / 100,
      unitPricePaise,
      subtotalPaise: line,
      stock: reserve ? product.stock + quantity : product.stock,
    });
  }
  if (!Number.isSafeInteger(subtotalPaise))
    throw fail(400, 'Order amount exceeds the supported limit.');
  // Current store policy: free delivery. Product sale prices already include any discount.
  return {
    items: result,
    totalItems,
    subtotalPaise,
    deliveryChargePaise: 0,
    discountPaise: 0,
    totalPaise: subtotalPaise,
    totalAmount: subtotalPaise / 100,
  };
}
module.exports = { statuses, nextStatuses, statusOf, presentOrder, cartItems, delivery, quote };
