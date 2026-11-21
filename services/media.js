const crypto = require('node:crypto');
const sharp = require('sharp');
const { fail } = require('../middleware/security');
function configured() {
  return ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].every(
    (k) => !!process.env[k],
  );
}
async function upload(buffer, mime) {
  if (!configured()) throw fail(503, 'Configure Cloudinary credentials to upload photos.');
  if (!Buffer.isBuffer(buffer) || buffer.length > 3 * 1024 * 1024 || !buffer.length)
    throw fail(400, 'Upload an image of at most 3 MB.');
  let output;
  try {
    const image = sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' }),
      metadata = await image.metadata();
    if (
      !{ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[mime] ||
      metadata.format !==
        { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[mime] ||
      (metadata.pages || 1) > 1
    )
      throw new Error('format');
    output = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw fail(400, 'Invalid image. Use a non-animated JPG, PNG or WebP up to 25 megapixels.');
  }
  const timestamp = String(Math.floor(Date.now() / 1000)),
    public_id = 'plant-paradise/' + crypto.randomUUID();
  const signature = crypto
    .createHash('sha256')
    .update(
      'public_id=' + public_id + '&timestamp=' + timestamp + process.env.CLOUDINARY_API_SECRET,
    )
    .digest('hex');
  const form = new FormData();
  form.set('file', new Blob([output], { type: 'image/webp' }), 'plant.webp');
  for (const [k, v] of Object.entries({
    public_id,
    timestamp,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
  }))
    form.set(k, v);
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/' +
      encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME) +
      '/image/upload',
    { method: 'POST', body: form, signal: AbortSignal.timeout(25000) },
  );
  if (!response.ok) throw fail(502, 'Image storage is unavailable. Please retry.');
  const data = await response.json();
  if (!data.secure_url?.startsWith('https://'))
    throw fail(502, 'Image storage returned an invalid URL.');
  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
  };
}
module.exports = { upload, configured };
