const Product = require('../models/ShopProduct');
const Category = require('../models/Category');
const { fail } = require('../middleware/security');
const active = { status: { $nin: ['draft', 'archived'] } };
async function publicFilter(surface = 'shop') {
  const categories = await Category.find({ isActive: { $ne: false } })
    .select('slug')
    .lean();
  return {
    ...active,
    [surface === 'categories' ? 'showInCategories' : 'showInShop']: { $ne: false },
    category: { $in: categories.map((c) => c.slug) },
  };
}
const effectivePrice = (p) => (p.discountPrice != null ? p.discountPrice : p.price);
function present(p) {
  return {
    ...p,
    price: effectivePrice(p),
    originalPrice: p.price,
    stock: p.stock || 0,
    highlight: p.famousFor || '',
    description: p.shortDescription || p.description || '',
  };
}
async function publicProducts(surface) {
  return (
    await Product.find(await publicFilter(surface))
      .sort({ displayOrder: 1, slug: 1 })
      .lean()
      .maxTimeMS(5000)
  ).map(present);
}
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pagination(query) {
  return {
    page: Math.max(1, Math.min(100000, parseInt(query.page) || 1)),
    limit: Math.max(1, Math.min(100, parseInt(query.limit) || 20)),
  };
}
const validId = (id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) throw fail(400, 'Invalid record ID.');
  return String(id).toLowerCase();
};
function string(value, name, max = 10000) {
  if (typeof value !== 'string' || value.length > max) throw fail(400, `Invalid ${name}.`);
  return value.trim();
}
function url(value) {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail(400, 'Invalid image URL.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw fail(400, 'Image URL must use HTTP or HTTPS.');
  return value;
}
function number(value, name, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000 ||
    (integer && !Number.isInteger(value))
  )
    throw fail(400, `Invalid ${name}.`);
  return value;
}
function fields(body, kind) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw fail(400, 'Invalid request.');
  const result = {};
  const texts =
    kind === 'product'
      ? [
          'name',
          'slug',
          'shortDescription',
          'description',
          'detailedDescription',
          'scientificName',
          'category',
          'famousFor',
          'uses',
          'benefits',
          'careInstructions',
          'imageAlt',
        ]
      : ['name', 'slug', 'description', 'sectionHeading', 'imageAlt', 'imagePublicId'];
  for (const key of texts)
    if (body[key] !== undefined)
      result[key] = string(
        body[key],
        key,
        ['name', 'slug', 'category'].includes(key) ? 160 : 10000,
      );
  if (result.slug !== undefined && !/^[a-z][a-z0-9-]*$/.test(result.slug))
    throw fail(
      400,
      'Slug must start with a letter and use lowercase letters, numbers and hyphens.',
    );
  if (result.name === '') throw fail(400, 'Name is required.');
  for (const key of kind === 'product' ? ['showInShop', 'showInCategories'] : ['isActive'])
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') throw fail(400, `Invalid ${key}.`);
      result[key] = body[key];
    }
  for (const key of kind === 'product' ? ['price', 'stock', 'displayOrder'] : ['displayOrder'])
    if (body[key] !== undefined) result[key] = number(body[key], key, key !== 'price');
  if (body.imageUrl !== undefined) result.imageUrl = url(string(body.imageUrl, 'image URL', 3000));
  if (kind === 'product') {
    if (body.discountPrice !== undefined)
      result.discountPrice =
        body.discountPrice === null ? null : number(body.discountPrice, 'discount price');
    for (const [key, allowed] of [
      ['status', ['active', 'draft', 'archived']],
      ['availability', ['available', 'unavailable']],
    ])
      if (body[key] !== undefined) {
        if (!allowed.includes(body[key])) throw fail(400, `Invalid ${key}.`);
        result[key] = body[key];
      }
    if (body.images !== undefined) {
      if (!Array.isArray(body.images) || body.images.length > 8)
        throw fail(400, 'Use up to eight images.');
      if (body.images.some((i) => !i || typeof i !== 'object' || Array.isArray(i)))
        throw fail(400, 'Invalid image metadata.');
      result.images = body.images.map((i) => ({
        url: url(string(i.url, 'image URL', 3000)),
        publicId: string(i.publicId || '', 'media ID', 300),
        alt: string(i.alt || '', 'alt text', 300),
      }));
      result.imageUrl = result.images[0]?.url || '';
      result.imageAlt = result.images[0]?.alt || '';
    }
  }
  return result;
}
module.exports = {
  active,
  publicFilter,
  publicProducts,
  present,
  effectivePrice,
  escapeRegex,
  pagination,
  validId,
  fields,
  string,
};
