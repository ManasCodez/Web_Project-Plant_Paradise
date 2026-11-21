const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopProduct' },
  image: String,
  unitPricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
  subtotalPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
  plant: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger,
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    orderNumber: { type: String, unique: true, sparse: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    idempotencyKey: String,
    requestHash: String,
    customer: { name: String, email: String, phone: String },
    shippingAddress: {
      addressLine1: String,
      addressLine2: String,
      landmark: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    subtotalPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    deliveryChargePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    discountPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    totalPaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    paymentMethod: { type: String, enum: ['cod'] },
    paymentStatus: { type: String, enum: ['pending', 'paid'] },
    orderStatus: {
      type: String,
      enum: [
        'placed',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ],
    },
    deliveryInstructions: String,
    inventoryReserved: Boolean,
    stockRestored: Boolean,
    history: [
      {
        _id: false,
        status: String,
        paymentStatus: String,
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
      },
    ],
    items: [orderItemSchema],
    totalItems: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'placed',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ],
      default: 'confirmed',
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: 'guest@plantparadise.com',
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, paymentStatus: 1, createdAt: -1 });
module.exports = mongoose.model('Order', orderSchema);
