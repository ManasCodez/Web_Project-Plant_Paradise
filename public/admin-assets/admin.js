'use strict';

function adminIcon(key) {
  const paths = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    products: 'M12 21V10 M12 14C4 14 3 5 3 5c9-1 9 9 9 9z M12 10c0-8 9-8 9-8 0 8-9 8-9 8z',
    new: 'M12 5v14 M5 12h14',
    categories: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3',
    media: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01',
    orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h3',
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M20 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',
    settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    stat: 'M4 18l5-5 4 2 7-9 M14 6h6v6',
  };
  return (
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    (paths[key] || paths.stat) +
    '"/></svg>'
  );
}
document.querySelectorAll('nav a[data-route]').forEach((a) => {
  const icon = document.createElement('span');
  icon.className = 'nav-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = adminIcon(a.dataset.route);
  a.prepend(icon);
});
const main = document.querySelector('#main'),
  notice = document.querySelector('#notice');
const money = (v) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(v || 0);
const date = (v) =>
  v
    ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const imageURL = (v) => {
  try {
    const u = new URL(v, location.origin);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '/fallback-plant.svg';
  } catch {
    return '/fallback-plant.svg';
  }
};
const img = (url, alt = '', cls = 'thumb') =>
  `<img class="${cls}" src="${esc(imageURL(url || '/fallback-plant.svg'))}" alt="${esc(alt)}" loading="lazy">`;
document.addEventListener(
  'error',
  (e) => {
    if (e.target.tagName === 'IMG' && !e.target.src.endsWith('/fallback-plant.svg'))
      e.target.src = '/fallback-plant.svg';
  },
  true,
);
let categories = [],
  user,
  currentRoute = '',
  timer,
  routeVersion = 0;
function toast(message, error = false) {
  clearTimeout(timer);
  notice.textContent = message;
  notice.className = error ? 'error' : '';
  timer = setTimeout(() => (notice.textContent = ''), 6000);
}
async function api(path, options = {}) {
  const response = await fetch(path.startsWith('/api/') ? path : '/api/admin' + path, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw Error('Unexpected server response. Please retry.');
  }
  if (response.status === 401) {
    location.href = '/login/?next=admin';
    throw Error('Please sign in.');
  }
  if (!response.ok) throw Error(body.message || 'Request failed.');
  return body;
}
const mutate = (path, method, data) => api(path, { method, body: JSON.stringify(data || {}) });
function confirmAction(message, title = 'Confirm action') {
  const d = document.querySelector('#confirm');
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-text').textContent = message;
  return new Promise((resolve) => {
    d.returnValue = 'cancel';
    d.addEventListener('close', () => resolve(d.returnValue === 'confirm'), { once: true });
    d.showModal();
  });
}
async function logout() {
  try {
    await mutate('/api/auth/logout', 'POST');
    localStorage.removeItem('plantParadiseUser');
    localStorage.removeItem('plantParadiseToken');
    location.href = '/login/';
  } catch (e) {
    toast(e.message, true);
  }
}
document.querySelectorAll('.logout').forEach((b) => (b.onclick = logout));
function navigate(path) {
  history.pushState({}, '', path);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (
    a?.origin === location.origin &&
    a.pathname.startsWith('/admin') &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey
  ) {
    e.preventDefault();
    navigate(a.pathname + a.search);
  }
});
window.addEventListener('popstate', render);
function options(items, value, key = 'slug') {
  return items
    .map(
      (c) =>
        `<option value="${esc(c[key])}" ${c[key] === value ? 'selected' : ''}>${esc(c.name)}</option>`,
    )
    .join('');
}
const categoryName = (slug) => categories.find((c) => c.slug === slug)?.name || slug;
const plantCell = (p) =>
  `<div class="plant-cell">${img(p.imageUrl, p.imageAlt || p.name)}<div><strong>${esc(p.name)}</strong><br><small>${esc(categoryName(p.category))}</small></div></div>`;
function pager(result, callback) {
  const el = document.createElement('div');
  el.className = 'pagination';
  el.innerHTML = `<button class="secondary small" ${result.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${result.page} · ${result.total} records</span><button class="secondary small" ${result.page * result.limit >= result.total ? 'disabled' : ''}>Next</button>`;
  el.children[0].onclick = () => callback(result.page - 1);
  el.children[2].onclick = () => callback(result.page + 1);
  main.append(el);
}
async function dashboard() {
  const { data: d } = await api('/dashboard');
  const stats = [
    ['Total plants', d.plants],
    ['Categories', d.categories],
    ['Registered users', d.users],
    ['Active products', d.active],
    ['Out of stock', d.outOfStock],
    ['Total orders', d.orders],
    ['Pending orders', d.pending],
    ['Paid revenue', money(d.revenue)],
    ['Orders today', d.todayOrders],
    ['Delivered orders', d.deliveredOrders],
    ['Cancelled orders', d.cancelledOrders],
  ];
  main.innerHTML = `<section class="welcome"><div><h2>A little care. A lot of growth.</h2><p>Welcome back, ${esc(user.fullname.split(' ')[0])}. Your garden starts here.</p></div><a class="button" href="/admin/products/new">+ Add New Plant</a></section><div class="stats">${stats.map(([label, value]) => `<div class="stat"><span class="stat-icon" aria-hidden="true">${adminIcon('stat')}</span><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="panels"><section class="panel"><div class="panel-head"><h2>Recently updated plants</h2><a href="/admin/products">View all</a></div><div class="table-wrap"><table><tbody>${d.recent.map((p) => `<tr><td>${plantCell(p)}</td><td>${money(p.price)}</td><td><a class="button secondary small" href="/admin/products/${p._id}/edit">Edit</a></td></tr>`).join('') || '<tr><td>No plants yet. Add your first plant.</td></tr>'}</tbody></table></div></section><section class="panel"><h2>Plants by category</h2>${d.byCategory.map((c) => `<div class="bar-row"><div><span>${esc(categoryName(c._id))}</span><strong>${c.count}</strong></div><div class="bar"><i style="width:${Math.round((c.count / Math.max(d.plants, 1)) * 100)}%"></i></div></div>`).join('') || '<p>No catalog data yet.</p>'}<p class="hint">Revenue includes delivered orders with payment recorded as collected. Unpaid COD orders are excluded.</p></section></div>`;
}
async function products() {
  const q = new URLSearchParams(location.search);
  const result = await api('/products?' + q);
  main.innerHTML = `<div class="panel-head"><p class="muted">Care for your catalog, from one place.</p><a class="button" href="/admin/products/new">+ Add New Plant</a></div><form id="filters" class="toolbar"><input name="q" aria-label="Search plants" placeholder="Search plants…" value="${esc(q.get('q') || '')}"><select name="category" aria-label="Category"><option value="">All categories</option>${options(categories, q.get('category'))}</select><select name="status" aria-label="Status"><option value="">All statuses</option>${['active', 'draft', 'archived'].map((s) => `<option ${q.get('status') === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select name="visibility" aria-label="Visibility"><option value="">All visibility</option>${['shop', 'categories', 'hidden'].map((s) => `<option ${q.get('visibility') === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select name="sort" aria-label="Sort">${[
    ['updated', 'Latest update'],
    ['name', 'Name'],
    ['price', 'Price: low to high'],
    ['price-desc', 'Price: high to low'],
  ]
    .map(([v, n]) => `<option value="${v}" ${q.get('sort') === v ? 'selected' : ''}>${n}</option>`)
    .join(
      '',
    )}</select><button>Apply</button></form><section class="panel table-wrap"><table><thead><tr><th>Plant / category</th><th>Price</th><th>Stock</th><th>Status / visibility</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${result.data.map((p) => `<tr><td>${plantCell(p)}</td><td>${money(p.discountPrice ?? p.price)}</td><td>${p.stock || 0}</td><td><span class="badge ${esc(p.status || 'active')}">${esc(p.status || 'active')}</span><br><small>${p.showInShop !== false ? 'Shop ' : ''}${p.showInCategories !== false ? 'Categories' : ''}</small></td><td>${date(p.updatedAt)}</td><td><div class="actions"><a class="button secondary small" href="/admin/products/${p._id}/edit">Edit</a><button class="secondary small" data-toggle="${p._id}" data-status="${p.status || 'active'}">${p.status === 'draft' ? 'Publish' : 'Unpublish'}</button><button class="danger small" data-delete="${p._id}" data-name="${esc(p.name)}" ${p.status === 'archived' ? 'disabled' : ''}>Archive</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No plants match these filters.</td></tr>'}</tbody></table></section>`;
  main.querySelector('#filters').onsubmit = (e) => {
    e.preventDefault();
    navigate('/admin/products?' + new URLSearchParams(new FormData(e.target)));
  };
  main.querySelectorAll('[data-toggle]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await mutate('/products/' + b.dataset.toggle, 'PATCH', {
            status: b.dataset.status === 'draft' ? 'active' : 'draft',
          });
          toast('Plant visibility updated.');
          await render();
        } catch (e) {
          toast(e.message, true);
          b.disabled = false;
        }
      }),
  );
  main.querySelectorAll('[data-delete]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          await confirmAction(
            `Archive ${b.dataset.name}? It will disappear from public listings. Historical orders are preserved.`,
            'Archive plant',
          )
        ) {
          try {
            await mutate('/products/' + b.dataset.delete, 'DELETE');
            toast('Plant archived.');
            render();
          } catch (e) {
            toast(e.message, true);
          }
        }
      }),
  );
  pager(result, (page) => {
    q.set('page', page);
    navigate('/admin/products?' + q);
  });
}
function field(name, label, value = '', type = 'text', extra = '') {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></label>`;
}
function area(name, label, value = '') {
  return `<label class="full">${label}<textarea name="${name}" rows="3" maxlength="10000">${esc(value)}</textarea></label>`;
}
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 3 * 1024 * 1024
    )
      return reject(Error('Use JPG, PNG or WebP, at most 3 MB.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/media/upload');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-Requested-With', 'PlantParadise');
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(Error('Upload failed. Check your connection.'));
    xhr.ontimeout = () =>
      reject(Error('Upload timed out. Check the media library before retrying.'));
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw Error(d.message || 'Upload failed.');
        resolve(d.data);
      } catch (e) {
        reject(e);
      }
    };
    xhr.send(file);
  });
}
function mediaEditor(container, initial, onChange) {
  let images = initial.map((i) => ({ ...i })),
    busy = false;
  function draw() {
    container.innerHTML = `<div class="upload"><label>Upload plant photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple></label><small>JPG, PNG or WebP · up to 3 MB each · eight photos maximum. The first photo is the cover.</small><progress max="100" value="0" hidden></progress><div id="local-preview"></div></div><div class="actions"><button type="button" class="secondary" id="choose-media">Choose from library</button></div><div id="library-picker"></div><div class="media-grid">${images.map((i, n) => `<div class="media-card">${img(i.url, i.alt, '')}<label>Alt text<input data-alt="${n}" value="${esc(i.alt)}" maxlength="300"></label><div class="actions"><button type="button" class="small secondary" data-cover="${n}">${n ? 'Set cover' : 'Cover'}</button><button type="button" class="small danger" data-remove="${n}">Remove</button></div></div>`).join('')}</div>`;
    container.querySelectorAll('[data-alt]').forEach(
      (el) =>
        (el.oninput = () => {
          images[el.dataset.alt].alt = el.value;
          onChange(images, busy);
        }),
    );
    container.querySelectorAll('[data-remove]').forEach(
      (el) =>
        (el.onclick = () => {
          images.splice(+el.dataset.remove, 1);
          onChange(images, busy);
          draw();
        }),
    );
    container.querySelectorAll('[data-cover]').forEach(
      (el) =>
        (el.onclick = () => {
          images.unshift(images.splice(+el.dataset.cover, 1)[0]);
          onChange(images, busy);
          draw();
        }),
    );
    container.querySelector('#choose-media').onclick = async () => {
      try {
        const result = await api('/media?limit=100');
        const picker = container.querySelector('#library-picker');
        picker.className = 'media-grid';
        picker.innerHTML =
          result.data
            .map(
              (i, n) =>
                `<button type="button" class="media-card" data-pick="${n}">${img(i.url, i.alt, '')}<span>Select photo</span></button>`,
            )
            .join('') || '<p>No uploaded photos yet.</p>';
        picker.querySelectorAll('[data-pick]').forEach(
          (b) =>
            (b.onclick = () => {
              if (images.length >= 8) return toast('Use up to eight images.', true);
              const i = result.data[b.dataset.pick];
              images.push({ url: i.url, publicId: i.publicId, alt: i.alt || '' });
              onChange(images, busy);
              draw();
            }),
        );
      } catch (e) {
        toast(e.message, true);
      }
    };
    container.querySelector('[type=file]').onchange = async (e) => {
      const files = [...e.target.files];
      if (images.length + files.length > 8) return toast('Use up to eight images.', true);
      busy = true;
      onChange(images, busy);
      e.target.disabled = true;
      const progress = container.querySelector('progress');
      progress.hidden = false;
      try {
        for (const file of files) {
          const local = URL.createObjectURL(file),
            preview = document.createElement('img');
          preview.className = 'thumb';
          preview.src = local;
          container.querySelector('#local-preview').append(preview);
          try {
            const i = await uploadFile(file, (value) => (progress.value = value));
            images.push({ url: i.url, publicId: i.publicId, alt: '' });
          } finally {
            URL.revokeObjectURL(local);
          }
        }
        toast('Photos uploaded. Save the form to attach them.');
      } catch (err) {
        toast(err.message, true);
      } finally {
        busy = false;
        onChange(images, busy);
        draw();
      }
    };
  }
  draw();
}
async function productForm(id) {
  const p = id
    ? (await api('/products/' + id)).data
    : {
        status: 'active',
        showInShop: true,
        showInCategories: true,
        stock: 0,
        availability: 'available',
      };
  main.innerHTML = `<form id="plant-form"><section class="panel"><h2>Basic information</h2><div class="form-grid">${field('name', 'Plant name', p.name, 'text', 'required maxlength="160"')}${field('slug', 'Product slug', p.slug, 'text', 'required pattern="[a-z][a-z0-9-]*" maxlength="160"')}${area('shortDescription', 'Short description', p.shortDescription || p.description)}${area('detailedDescription', 'Detailed description', p.detailedDescription)}${field('scientificName', 'Scientific name (optional)', p.scientificName)}<label>Category<select name="category" required><option value="">Choose category</option>${options(categories, p.category)}</select></label>${field('price', 'Price (₹)', p.price, 'number', 'required min="0" max="100000000" step="0.01"')}${field('discountPrice', 'Discount price (₹, optional)', p.discountPrice, 'number', 'min="0" max="100000000" step="0.01"')}${field('stock', 'Stock quantity', p.stock || 0, 'number', 'required min="0" max="100000000" step="1"')}<label>Availability<select name="availability"><option value="available">Available</option><option value="unavailable" ${p.availability === 'unavailable' ? 'selected' : ''}>Unavailable</option></select></label>${field('displayOrder', 'Display order', p.displayOrder || 0, 'number', 'min="0" step="1"')}</div></section><section class="panel"><h2>Category content</h2><div class="form-grid">${area('famousFor', 'Famous for', p.famousFor)}${area('uses', 'Uses', p.uses)}${area('benefits', 'Benefits (optional)', p.benefits)}${area('careInstructions', 'Care instructions (optional)', p.careInstructions)}</div></section><section class="panel"><h2>Photos</h2><div id="media-editor"></div></section><section class="panel"><h2>Visibility</h2><div class="form-grid"><label class="check"><input name="showInShop" type="checkbox" ${p.showInShop !== false ? 'checked' : ''}>Show in Shop</label><label class="check"><input name="showInCategories" type="checkbox" ${p.showInCategories !== false ? 'checked' : ''}>Show in Categories</label><label>Status<select name="status">${['active', 'draft', 'archived'].map((s) => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div><p class="hint">Only active plants in published categories appear publicly. Stock must be greater than zero to purchase.</p></section><div class="form-actions"><button type="submit" value="save">Save Plant</button><button type="submit" value="draft" class="secondary">Save as Draft</button><a href="/admin/products" class="button secondary">Cancel</a></div></form>`;
  const form = main.querySelector('form');
  let images = p.images?.length
      ? p.images
      : p.imageUrl
        ? [{ url: p.imageUrl, publicId: '', alt: p.imageAlt || '' }]
        : [],
    uploading = false;
  mediaEditor(main.querySelector('#media-editor'), images, (value, busy) => {
    images = value;
    uploading = busy;
    form.querySelectorAll('[type=submit]').forEach((b) => (b.disabled = busy));
  });
  if (!id)
    form.elements.name.oninput = () => {
      if (!form.elements.slug.dataset.edited)
        form.elements.slug.value = form.elements.name.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
    };
  form.elements.slug.oninput = () => (form.elements.slug.dataset.edited = 'true');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (uploading) return;
    const data = Object.fromEntries(new FormData(form));
    for (const k of ['price', 'stock', 'displayOrder']) data[k] = Number(data[k]);
    data.discountPrice = data.discountPrice === '' ? null : Number(data.discountPrice);
    data.showInShop = form.elements.showInShop.checked;
    data.showInCategories = form.elements.showInCategories.checked;
    data.images = images;
    if (e.submitter?.value === 'draft') data.status = 'draft';
    form.querySelectorAll('[type=submit]').forEach((b) => (b.disabled = true));
    try {
      await mutate(id ? '/products/' + id : '/products', id ? 'PATCH' : 'POST', data);
      toast('Plant saved. Public pages will use the latest content.');
      navigate('/admin/products');
    } catch (err) {
      toast(err.message, true);
      form.querySelectorAll('[type=submit]').forEach((b) => (b.disabled = false));
    }
  };
}
async function categoryList() {
  main.innerHTML = `<div class="panel-head"><p class="muted">Organize your plants into collections.</p><button id="add-category">+ New Category</button></div><div id="category-form"></div><section class="panel table-wrap"><table><thead><tr><th>Category</th><th>Order</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${categories.map((c) => `<tr><td><div class="plant-cell">${img(c.imageUrl, c.name)}<strong>${esc(c.name)}</strong></div></td><td>${c.displayOrder}</td><td><span class="badge">${c.isActive !== false ? 'Published' : 'Hidden'}</span></td><td><div class="actions"><a class="button secondary small" href="/admin/products?category=${encodeURIComponent(c.slug)}">View plants</a><button class="secondary small" data-edit="${c._id}">Edit</button><button class="danger small" data-delete="${c._id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No categories yet.</td></tr>'}</tbody></table></section>`;
  function edit(c = { isActive: true, displayOrder: categories.length }) {
    const box = main.querySelector('#category-form');
    box.innerHTML = `<form class="panel"><h2>${c._id ? 'Edit' : 'New'} category</h2><div class="form-grid">${field('name', 'Name', c.name, 'text', 'required maxlength="160"')}${field('slug', 'Stable slug', c.slug, 'text', `required pattern="[a-z][a-z0-9-]*" ${c._id ? 'readonly' : ''}`)}${area('description', 'Description', c.description)}${field('sectionHeading', 'Section heading', c.sectionHeading)}${field('displayOrder', 'Display order', c.displayOrder, 'number', 'required min="0" step="1"')}<label class="check"><input name="isActive" type="checkbox" ${c.isActive !== false ? 'checked' : ''}>Published</label></div><h3>Category image</h3><div id="category-media"></div><div class="actions"><button type="submit">Save Category</button><button type="button" id="cancel-category" class="secondary">Cancel</button></div></form>`;
    const form = box.querySelector('form');
    let photos = c.imageUrl
        ? [{ url: c.imageUrl, publicId: c.imagePublicId || '', alt: c.imageAlt || '' }]
        : [],
      busy = false;
    mediaEditor(box.querySelector('#category-media'), photos, (values, uploading) => {
      photos = values;
      busy = uploading;
      form.querySelector('[type=submit]').disabled = busy;
    });
    box.querySelector('#cancel-category').onclick = () => box.replaceChildren();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      const data = Object.fromEntries(new FormData(form));
      data.displayOrder = Number(data.displayOrder);
      data.isActive = form.elements.isActive.checked;
      data.imageUrl = photos[0]?.url || '';
      data.imageAlt = photos[0]?.alt || '';
      data.imagePublicId = photos[0]?.publicId || '';
      form.querySelector('[type=submit]').disabled = true;
      try {
        await mutate(
          c._id ? '/categories/' + c._id : '/categories',
          c._id ? 'PATCH' : 'POST',
          data,
        );
        toast('Category saved.');
        render();
      } catch (err) {
        toast(err.message, true);
        form.querySelector('[type=submit]').disabled = false;
      }
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  main.querySelector('#add-category').onclick = () => edit();
  main
    .querySelectorAll('[data-edit]')
    .forEach((b) => (b.onclick = () => edit(categories.find((c) => c._id === b.dataset.edit))));
  main.querySelectorAll('[data-delete]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          await confirmAction(
            'Delete this category? All linked plants must be reassigned first.',
            'Delete category',
          )
        ) {
          try {
            await mutate('/categories/' + b.dataset.delete, 'DELETE');
            toast('Category deleted.');
            render();
          } catch (e) {
            toast(e.message, true);
          }
        }
      }),
  );
}
async function mediaLibrary() {
  const q = new URLSearchParams(location.search),
    result = await api('/media?' + q);
  main.innerHTML = `<section class="panel"><h2>Media library</h2><p class="muted">Upload once, then select photos in a plant or category form.</p><div class="upload"><label>Upload photo<input id="upload-media" type="file" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG or WebP, up to 3 MB.</small><progress hidden max="100" value="0"></progress><div id="upload-preview"></div></div><div class="media-grid">${result.data.map((i) => `<div class="media-card">${img(i.url, i.alt, '')}<p>${date(i.createdAt)} · ${Math.round(i.bytes / 1024)} KB</p><button class="danger small" data-retire="${i._id}">Remove unused image</button></div>`).join('') || '<p class="empty">Your uploaded photos will appear here.</p>'}</div><p class="hint">Removing unused media hides it from this library. Cloud files are retained to protect existing links.</p></section>`;
  main.querySelector('#upload-media').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.createElement('img'),
      local = URL.createObjectURL(file);
    preview.className = 'thumb';
    preview.src = local;
    main.querySelector('#upload-preview').append(preview);
    e.target.disabled = true;
    const progress = main.querySelector('progress');
    progress.hidden = false;
    try {
      await uploadFile(file, (v) => (progress.value = v));
      toast('Photo uploaded.');
      render();
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
    } finally {
      URL.revokeObjectURL(local);
    }
  };
  main.querySelectorAll('[data-retire]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          await confirmAction('Remove this unused image from the media library?', 'Remove image')
        ) {
          try {
            await mutate('/media/' + b.dataset.retire, 'DELETE');
            toast('Image removed from the library.');
            render();
          } catch (e) {
            toast(e.message, true);
          }
        }
      }),
  );
  pager(result, (page) => {
    q.set('page', page);
    navigate('/admin/media?' + q);
  });
}
async function users() {
  const q = new URLSearchParams(location.search),
    result = await api('/users?' + q);
  main.innerHTML = `<div class="section-intro"><div><p class="eyebrow">THE PEOPLE BEHIND YOUR GARDEN</p><h2>Customers & administrators</h2><p>Manage access with confidence. Every role change is recorded.</p></div><span class="count-pill">${result.total} accounts</span></div><form class="toolbar premium-toolbar"><input name="q" placeholder="Search name or email…" aria-label="Search users" value="${esc(q.get('q') || '')}"><select name="role" aria-label="Role"><option value="">All roles</option>${['user', 'admin'].map((r) => `<option ${q.get('role') === r ? 'selected' : ''}>${r}</option>`).join('')}</select><button>Search</button></form><section class="panel table-wrap"><table><thead><tr><th>Person</th><th>Email</th><th>Registered</th><th>Role</th><th>Access management</th></tr></thead><tbody>${result.data.map((u) => `<tr><td><div class="person-cell"><span class="person-avatar">${esc(u.fullname?.[0] || 'U')}</span><div><strong>${esc(u.fullname)}</strong><br><small>@${esc(u.username || '')}</small></div></div></td><td>${esc(u.email)}</td><td>${date(u.createdAt)}</td><td><span class="badge role-${esc(u.role || 'user')}">${esc(u.role || 'user')}</span></td><td>${u._id === user.id ? '<span class="hint">Your account · protected</span>' : `<div class="role-controls"><select aria-label="Role for ${esc(u.fullname)}" data-role-select="${u._id}"><option value="user" ${u.role !== 'admin' ? 'selected' : ''}>User</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select><button class="secondary small" data-role-save="${u._id}">Change role</button></div>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching users.</td></tr>'}</tbody></table></section><p class="hint">Your own administrator access and the last remaining administrator are protected. A role change signs the affected account out.</p>`;
  main.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    navigate('/admin/users?' + new URLSearchParams(new FormData(e.target)));
  };
  main.querySelectorAll('[data-role-save]').forEach(
    (button) =>
      (button.onclick = async () => {
        const target = result.data.find((u) => u._id === button.dataset.roleSave),
          role = main.querySelector(`[data-role-select="${target._id}"]`).value;
        if (role === (target.role || 'user')) return toast('Choose a different role first.');
        const message =
          role === 'admin'
            ? `Grant administrator access to ${target.email}? They will be able to manage website content, customer orders and user roles.`
            : `Remove administrator access from ${target.email}? Their active sessions will be invalidated.`;
        if (
          !(await confirmAction(
            message,
            role === 'admin' ? 'Grant administrator access' : 'Remove administrator access',
          ))
        )
          return;
        button.disabled = true;
        try {
          await mutate('/users/' + target._id + '/role', 'PATCH', { role });
          toast('Role updated. The affected user must sign in again.');
          await render();
        } catch (e) {
          toast(e.message, true);
          button.disabled = false;
        }
      }),
  );
  pager(result, (page) => {
    q.set('page', page);
    navigate('/admin/users?' + q);
  });
}
const orderStates = [
  'placed',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
];
const stateName = (value) => String(value || 'unknown').replace(/_/g, ' ');
const orderMoney = (value) => money((value || 0) / 100);
function orderBadge(value) {
  return `<span class="badge status-${esc(value)}">${esc(stateName(value))}</span>`;
}
async function orders() {
  const q = new URLSearchParams(location.search),
    result = await api('/orders?' + q);
  main.innerHTML = `<div class="section-intro"><div><p class="eyebrow">FROM OUR GARDEN TO THEIR DOOR</p><h2>Every order, thoughtfully managed.</h2><p>Follow deliveries, record COD collections, and keep customers informed.</p></div><span class="count-pill">${result.total} orders</span></div><form class="toolbar premium-toolbar"><input name="q" aria-label="Search orders" placeholder="Order number, customer name or email…" value="${esc(q.get('q') || '')}"><select name="status" aria-label="Order status"><option value="">All statuses</option>${orderStates.map((s) => `<option value="${s}" ${q.get('status') === s ? 'selected' : ''}>${esc(stateName(s))}</option>`).join('')}</select><select name="paymentStatus" aria-label="Payment status"><option value="">All payments</option>${['pending', 'paid'].map((s) => `<option ${q.get('paymentStatus') === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select name="sort" aria-label="Sort orders"><option value="newest">Newest first</option><option value="oldest" ${q.get('sort') === 'oldest' ? 'selected' : ''}>Oldest first</option></select><button>Apply filters</button></form><section class="panel table-wrap order-table"><table><thead><tr><th>Order / date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Order status</th><th></th></tr></thead><tbody>${result.data.map((o) => `<tr><td><strong>${esc(o.orderNumber)}</strong><br><small>${date(o.createdAt)}</small></td><td><strong>${esc(o.customer?.name || 'Legacy customer')}</strong><br><small>${esc(o.customer?.email || o.customerEmail)}</small></td><td>${o.totalItems}</td><td><strong>${orderMoney(o.totalPaise)}</strong></td><td><small>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : esc(stateName(o.paymentMethod))}</small><br>${orderBadge(o.paymentStatus)}</td><td>${orderBadge(o.orderStatus)}</td><td><button class="secondary small" data-order="${o._id}">View details</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No orders match these filters.</td></tr>'}</tbody></table></section>`;
  main.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    navigate('/admin/orders?' + new URLSearchParams(new FormData(e.target)));
  };
  main
    .querySelectorAll('[data-order]')
    .forEach(
      (b) =>
        (b.onclick = () => showOrderDetails(b.dataset.order).catch((e) => toast(e.message, true))),
    );
  pager(result, (page) => {
    q.set('page', page);
    navigate('/admin/orders?' + q);
  });
}
async function showOrderDetails(id) {
  const { data: o } = await api('/orders/' + id);
  let drawer = document.getElementById('order-details');
  if (!drawer) {
    drawer = document.createElement('dialog');
    drawer.id = 'order-details';
    drawer.className = 'order-drawer';
    document.body.append(drawer);
  }
  const address = o.shippingAddress || {};
  drawer.innerHTML = `<div class="drawer-heading"><div><p class="eyebrow">ORDER DETAILS</p><h2>${esc(o.orderNumber)}</h2><small>${new Date(o.createdAt).toLocaleString('en-IN')}</small></div><button class="secondary small" id="close-order" aria-label="Close order details">Close</button></div><div class="drawer-content"><div class="drawer-badges">${orderBadge(o.orderStatus)}${orderBadge(o.paymentStatus)}</div><section class="detail-section"><h3>Customer & delivery</h3><strong>${esc(o.customer?.name || 'Legacy customer')}</strong><p>${esc(o.customer?.email || o.customerEmail)}<br>${esc(o.customer?.phone || '')}</p><p class="delivery-address">${esc([address.addressLine1, address.addressLine2, address.landmark, [address.city, address.state, address.postalCode].filter(Boolean).join(', '), address.country].filter(Boolean).join('\n')) || 'Delivery details were not recorded for this legacy order.'}</p>${o.deliveryInstructions ? `<p class="hint">Instructions: ${esc(o.deliveryInstructions)}</p>` : ''}</section><section class="detail-section"><h3>Ordered plants</h3>${o.items.map((i) => `<div class="drawer-item">${img(i.image, i.plant)}<div><strong>${esc(i.plant)}</strong><small>${i.quantity} × ${orderMoney(i.unitPricePaise)}</small></div><strong>${orderMoney(i.subtotalPaise)}</strong></div>`).join('')}<div class="drawer-totals"><p><span>Subtotal</span><span>${orderMoney(o.subtotalPaise)}</span></p><p><span>Delivery</span><span>${orderMoney(o.deliveryChargePaise)}</span></p>${o.discountPaise ? `<p><span>Discount</span><span>−${orderMoney(o.discountPaise)}</span></p>` : ''}<p class="grand-total"><strong>Total payable</strong><strong>${orderMoney(o.totalPaise)}</strong></p><small>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : esc(stateName(o.paymentMethod))}</small></div></section><section class="detail-section"><h3>Manage this order</h3>${o.legacy ? '<p class="hint">Legacy order: ownership and inventory reservations were not recorded. It remains admin-only; cancellation does not automatically add stock.</p>' : ''}${o.allowedStatuses.length ? `<form id="status-form"><label>Next order status<select name="status" required><option value="">Choose the next step</option>${o.allowedStatuses.map((s) => `<option value="${s}">${esc(stateName(s))}</option>`).join('')}</select></label><button>Update status</button></form>` : '<p class="hint">This order has reached its final status.</p>'}${o.orderStatus === 'delivered' && o.paymentMethod === 'cod' && o.paymentStatus === 'pending' ? '<button id="collect-payment">Mark COD payment collected</button>' : ''}<p class="hint">Cancellation is available before dispatch and restores reserved stock once. Record COD payment only after collecting it.</p></section><section class="detail-section"><h3>Order timeline</h3><ul class="order-timeline">${(o.history || []).map((h) => `<li><strong>${esc(stateName(h.status))}${h.paymentStatus === 'paid' ? ' · Payment collected' : ''}</strong><small>${new Date(h.at).toLocaleString('en-IN')}</small></li>`).join('') || '<li>No timeline was stored for this legacy order.</li>'}</ul></section></div>`;
  drawer.querySelector('#close-order').onclick = () => drawer.close();
  async function update(body, message) {
    if (!(await confirmAction(message, 'Confirm order update'))) return;
    drawer.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await mutate('/orders/' + id + '/status', 'PATCH', body);
      toast('Order updated. The customer will see the new status.');
      await render();
      await showOrderDetails(id);
    } catch (e) {
      toast(e.message, true);
      drawer.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }
  const form = drawer.querySelector('#status-form');
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      const status = form.elements.status.value;
      update(
        { orderStatus: status },
        status === 'cancelled'
          ? 'Cancel this order and restore its reserved stock? This cannot be undone.'
          : `Update this order to ${stateName(status)}?`,
      );
    };
  const payment = drawer.querySelector('#collect-payment');
  if (payment)
    payment.onclick = () =>
      update(
        { paymentStatus: 'paid' },
        'Confirm that the full Cash on Delivery payment has actually been collected. This will add the order to paid revenue.',
      );
  if (!drawer.open) drawer.showModal();
}

async function settings() {
  const { data: d } = await api('/settings');
  main.innerHTML = `<section class="panel"><h2>Workspace settings</h2><div class="settings-grid"><p><strong>MongoDB:</strong> ${d.databaseConnected ? 'Connected' : 'Unavailable'}</p><p><strong>Photo storage:</strong> ${d.mediaConfigured ? 'Cloudinary configured' : 'Cloudinary credentials required on the server'}</p><p><strong>Currency:</strong> ${esc(d.currency)}</p><p><strong>Session duration:</strong> ${d.sessionHours} hours</p><p><strong>Upload limit:</strong> ${d.maxUploadMB} MB per image</p></div><p class="hint">Connection settings and administrator roles are configured on the server. No credentials are displayed in the browser.</p><a class="button secondary" href="/" target="_blank" rel="noopener">Open public website</a></section>`;
}
async function render() {
  const version = ++routeVersion;
  main.setAttribute('aria-busy', 'true');
  main.innerHTML = '<section class="panel"><p>Loading…</p></section>';
  const parts = location.pathname.split('/').filter(Boolean),
    route = parts[1] || 'dashboard';
  currentRoute = parts[2] === 'new' ? 'new' : route;
  document
    .querySelectorAll('nav a')
    .forEach((a) => a.classList.toggle('active', a.dataset.route === currentRoute));
  document.querySelector('#title').textContent =
    {
      dashboard: 'Overview',
      products: parts[2] ? (parts[2] === 'new' ? 'Add New Plant' : 'Edit Plant') : 'Manage Plants',
      categories: 'Categories',
      media: 'Media Library',
      users: 'Registered Users',
      orders: 'Orders',
      settings: 'Settings',
    }[route] || 'Page not found';
  try {
    categories = (await api('/categories')).data;
    if (version !== routeVersion) return;
    if (route === 'products' && parts[2]) await productForm(parts[2] === 'new' ? null : parts[2]);
    else if (
      {
        dashboard,
        products,
        categories: categoryList,
        media: mediaLibrary,
        users,
        orders,
        settings,
      }[route]
    )
      await {
        dashboard,
        products,
        categories: categoryList,
        media: mediaLibrary,
        users,
        orders,
        settings,
      }[route]();
    else main.innerHTML = '<p>Page not found.</p>';
  } catch (e) {
    main.innerHTML = `<section class="error-box"><h2>Could not load this page</h2><p>${esc(e.message)}</p><button id="retry">Retry</button></section>`;
    main.querySelector('#retry').onclick = render;
  } finally {
    main.setAttribute('aria-busy', 'false');
  }
}
(async () => {
  try {
    user = (await api('/api/auth/me')).user;
    if (user.role !== 'admin') {
      main.textContent = 'Administrator access required.';
      return;
    }
    document.querySelector('#admin-name').textContent = user.fullname;
    document.querySelector('.avatar').textContent = user.fullname[0].toUpperCase();
    await render();
  } catch (e) {
    main.textContent = e.message;
  }
})();
