// One-time extraction from the original pages. Run before replacing their content.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, value) => fs.writeFileSync(path.join(root, p), value);
const decode = s => s.replace(/&amp;/g, '&').replace(/&copy;/g, '©').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const text = s => decode(s.replace(/<[^>]*>/g, '').trim());
const attr = (s, name) => decode(s.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const tagText = (s, tag) => text(s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] || '');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const home = read('public/index.html');
const shop = read('public/Shop/index.html');
assert.equal((home.match(/class="plant-card"/g) || []).length, 24, 'Run only against the original home page');
const categories = [...home.matchAll(/<a href="#([^"]+)" class="category-card">([\s\S]*?)<\/a>/g)].map((m, i) => ({slug:m[1], anchorId:m[1], name:tagText(m[2], 'h3'), description:tagText(m[2], 'p'), imageUrl:attr(m[2], 'src'), imageAlt:attr(m[2], 'alt'), displayOrder:i}));
const plants = [];
for (const section of home.matchAll(/<section class="plant-section" id="([^"]+)">([\s\S]*?)<\/section>/g)) {
  categories.find(category => category.slug === section[1]).sectionHeading = tagText(section[2], 'h2');
  for (const m of section[2].matchAll(/<div class="plant-card">([\s\S]*?)<\/div>/g)) {
    const ps = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(p => text(p[1]));
    plants.push({slug:`${section[1]}-${slug(tagText(m[1],'h3'))}`, category:section[1], name:tagText(m[1],'h3'), description:ps[0], highlight:ps[1], uses:ps[2], imageUrl:attr(m[1],'src'), imageAlt:attr(m[1],'alt'), displayOrder:plants.length});
  }
}
const products = [...shop.matchAll(/<div class="product-card">([\s\S]*?)<span class="add-to-cart">([^<]*)<\/span>[\s\S]*?<\/div>\s*<\/div>/g)].map((m, i) => ({slug:plants[i].slug, category:plants[i].category, name:tagText(m[1],'h3'), description:tagText(m[1],'p'), imageUrl:attr(m[1],'src'), imageAlt:attr(m[1],'alt'), price:Number(m[1].match(/class="product-price">[^\d]*(\d+)/)[1]), displayOrder:i}));
assert.equal(products.length, 24);
products.forEach((p,i) => assert.equal(p.name, plants[i].name));
const backgrounds = [];
let css = read('public/style.css').replace(/(\.(?:herotext|box\d+)\s*\{[^}]*?)background: url\("([^"]+)"\) center \/ cover no-repeat;/g, (_, before, url) => {
  backgrounds.push({selector:before.match(/^\.[\w]+/)[0], imageUrl:url});
  return before + 'background-position: center; background-size: cover; background-repeat: no-repeat;';
});
assert.equal(backgrounds.length, 12);
const pages = [];
function migrate(source, page) {
  let html = source;
  if (page === 'home') {
    html = html.replace(/(<div class="category-nav">)[\s\S]*?(<\/div>\s*<\/section>)/, '$1$2');
    html = html.replace(/\s*<!-- (?:Medicinal|Edible|Indoor|Flowering|Fruit|Desert) Plants Section -->/g, '');
    let inserted = false;
    html = html.replace(/<section class="plant-section"[\s\S]*?<\/section>/g, () => { if(inserted) return ''; inserted=true; return '<div id="plant-sections"></div>'; });
  } else {
    html = html.replace(/(<div class="shop-grid">)[\s\S]*?(<\/div>\s*<\/section>)/, '$1$2');
  }
  const content = {};
  let n = 0;
  // Keep layout in HTML; bind editable text/attributes to named database entries.
  let inScript = false;
  html = html.split(/(<[^>]+>)/g).map(token => {
    if(token.startsWith('<')) {
      if(token.startsWith('<script')) inScript=true;
      if(token.startsWith('</script')) inScript=false;
      if(inScript || /^<\/?(?:link|meta|script|!--|!DOCTYPE)/i.test(token)) return token;
      const bindings = {};
      token = token.replace(/\s(href|src|alt|placeholder|aria-label)="([^"]*)"/g, (_, name, value) => {
        const key = `field${++n}`; content[key]=decode(value); bindings[name]=key; return '';
      });
      if(Object.keys(bindings).length) token=token.replace(/>$/, ` data-content-attrs='${JSON.stringify(bindings)}'>`);
      return token;
    }
    if(inScript || !token.trim()) return token;
    const key=`field${++n}`; content[key]=decode(token); return `<!--content:${key}-->`;
  }).join('');
  // Title comments are raw text in HTML; bind it as an attribute instead.
  html=html.replace(/<title><!--content:(\w+)--><\/title>/, '<title data-content-text="$1"></title>');
  html=html.replace('<body>', `<body data-page="${page}">\n<div id="content-status" role="status" aria-live="polite">Loading page content…</div>`);
  const prefix=page==='home'?'':'../';
  html=html.replace(/<script src="(?:\.\.\/)?auth-state.js"><\/script>/, `<script src="${prefix}auth-state.js"></script>\n<script src="${prefix}content.js"></script>`);
  pages.push({slug:page, content, plants:page==='home'?plants:[], backgrounds:page==='home'?backgrounds:[], addToCartLabel:page==='shop'?text(shop.match(/class="add-to-cart">([^<]*)/)[1]):undefined});
  write(page==='home'?'public/index.html':'public/Shop/index.html',html);
}
// Save source snapshots only in the seed directory for migration auditing, never served publicly.
fs.mkdirSync(path.join(root,'seed'),{recursive:true});
write('seed/original-home.html', home); write('seed/original-shop.html',shop); write('seed/original-style.css',read('public/style.css'));
migrate(home,'home'); migrate(shop,'shop');
write('seed/content.json', JSON.stringify({pages,categories,products}, null,2)+'\n');
write('public/style.css', css);
console.log(`Preserved ${plants.length} home plants, ${products.length} products, ${categories.length} categories, ${backgrounds.length} hero images.`);
