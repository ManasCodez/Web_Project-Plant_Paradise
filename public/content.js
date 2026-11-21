/* Render database values into the original layout using safe DOM operations. */
(() => {
  const page = document.body.dataset.page;
  const status = document.getElementById('content-status');
  const boundText = new Map();
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  function safeURL(value, image = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return (image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']).includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function image(record) {
    const img = element('img');
    const url = safeURL(record.imageUrl, true);
    if (url) img.src = url; else if (!record.imageUrl) img.src = '/fallback-plant.svg';
    img.alt = record.imageAlt || record.name || '';
    img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { if (!img.src.endsWith('/fallback-plant.svg')) img.src = '/fallback-plant.svg'; });
    return img;
  }
  function applyPage(data) {
    const values = data.content || {};
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      const marker = walker.currentNode;
      if (!marker.data.startsWith('content:')) continue;
      if (!boundText.has(marker)) {
        const node = document.createTextNode(''); marker.after(node); boundText.set(marker, node);
      }
      boundText.get(marker).textContent = values[marker.data.slice(8)] || '';
    }
    document.querySelectorAll('[data-content-text]').forEach(node => { node.textContent = values[node.dataset.contentText] || ''; });
    document.querySelectorAll('[data-content-attrs]').forEach(node => {
      Object.entries(JSON.parse(node.dataset.contentAttrs)).forEach(([attr, key]) => {
        if (!['href', 'src', 'alt', 'placeholder', 'aria-label'].includes(attr)) return;
        const value = values[key] || '';
        if (attr === 'href' || attr === 'src') {
          const url = safeURL(value, attr === 'src');
          if (url) node.setAttribute(attr, url); else node.removeAttribute(attr);
        } else node.setAttribute(attr, value);
      });
    });
    for (const background of data.backgrounds || []) {
      if (!/^\.(herotext|box(?:[2-9]|1[0-2]))$/.test(background.selector)) continue;
      const node = document.querySelector(background.selector), url = safeURL(background.imageUrl, true);
      if (node) node.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : '';
    }
  }
  function renderHome(data, categories) {
    const nav = document.querySelector('.category-nav'), sections = document.getElementById('plant-sections');
    nav.replaceChildren(); sections.replaceChildren();
    for (const category of categories) {
      const anchor = /^[a-z][a-z0-9-]*$/.test(category.anchorId) ? category.anchorId : category.slug;
      const card = element('a', 'category-card'); card.href = safeURL(`#${encodeURIComponent(anchor)}`);
      card.append(image(category), element('h3', '', category.name), element('p', '', category.description)); nav.append(card);
      const section = element('section', 'plant-section'); section.id = anchor;
      const grid = element('div', 'plant-grid');
      const plants = (data.plants || []).filter(p => p.category === category.slug).sort((a,b) => a.displayOrder-b.displayOrder);
      for (const plant of plants) {
        const plantCard = element('div', 'plant-card');
        plantCard.append(image(plant), element('h3', '', plant.name), element('p', '', plant.shortDescription || plant.description), element('p', 'highlight', plant.famousFor || plant.highlight), element('p', 'uses', plant.uses)); grid.append(plantCard);
      }
      if (!plants.length) grid.append(element('p', '', 'No plants in this category yet.'));
      section.append(element('h2', '', category.sectionHeading || category.name), grid); sections.append(section);
    }
    if (location.hash) {
      try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch {}
    }
  }
  function renderShop(data, products) {
    const grid = document.querySelector('.shop-grid'); grid.replaceChildren();
    for (const product of products) {
      const card = element('div', 'product-card'); card.dataset.productId = product._id;
      const info = element('div', 'product-info');
      const add = element('button', 'add-to-cart', data.addToCartLabel || 'Add to Cart'); add.type = 'button';
      if (product.stock === 0 || product.availability === 'unavailable') { add.disabled = true; add.textContent = 'Out of Stock'; }
      info.append(element('h3', '', product.name), element('p', '', product.description), element('div', 'product-price', money(product.price)), add);
      card.append(image(product), info); grid.append(card);
    }
  }
  async function get(endpoint) {
    const response = await fetch(`/api/content/${endpoint}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Could not load page content.');
    return body.data;
  }
  async function load() {
    status.replaceChildren(element('span', '', 'Loading page content…')); status.hidden = false;
    if (location.protocol === 'file:') {
      status.textContent = 'Open this page through the Node server at http://localhost:3000/ so it can load MongoDB content.';
      return;
    }
    try {
      const [data, items] = await Promise.all([get(page), get(page === 'home' ? 'categories' : 'products')]);
      applyPage(data);
      if (page === 'home') renderHome(data, items); else renderShop(data, items);
      const empty = !items.length || (page === 'home' && !data.plants?.length);
      status.textContent = empty ? 'No content is available yet.' : ''; status.hidden = !empty;
      if (empty) addRetry();
      if (typeof updateNavAuth === 'function') updateNavAuth();
      document.dispatchEvent(new CustomEvent('content:loaded', { detail: { page, products: page === 'shop' ? items : [] } }));
    } catch (error) {
      status.textContent = `Unable to load page content. ${error.name === 'TimeoutError' ? 'The request timed out.' : error.message}`; addRetry();
    }
  }
  function addRetry() {
    const retry = element('button', '', 'Retry'); retry.type = 'button'; retry.addEventListener('click', load); status.append(' ', retry);
  }
  load();
})();
