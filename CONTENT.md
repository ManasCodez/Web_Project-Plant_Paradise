# MongoDB page content

The admin upgrade supersedes direct database editing instructions below. ShopProduct now supplies both public plant views; HomePage.plants is retained only as the migration source. See [ADMIN.md](./ADMIN.md) for the current model, migration, stock and admin workflow.

From `Web_Project-Plant_Paradise` in PowerShell:

```powershell
npm.cmd install
# Configure MONGODB_URI in your local .env, or start MongoDB on 127.0.0.1:27017.
npm.cmd run seed:content
npm.cmd start
```

Open `http://localhost:3000/` and `http://localhost:3000/Shop/` (or the configured PORT). Serve these pages through Express, rather than opening the HTML files directly.

The application loads `.env` from the project directory regardless of the terminal working directory. If your network's DNS times out when resolving an Atlas `mongodb+srv` hostname, you can set `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in that file. This changes only the Node process's DNS resolver. API requests retry a failed database connection; use the page's Retry button once connectivity is restored.

Run `npm.cmd run test:content` for the content migration, DOM rendering, search, cart, safe rendering, seeding adapter, and HTTP API checks. DOM tests use jsdom, a development dependency; they do not replace visual browser inspection. The seeding adapter test verifies insert-only behavior without requiring a MongoDB installation. Live database verification still requires MongoDB.

With the server running and the content seeded, run `node scripts/check-live-content.js` to verify both pages render real MongoDB API responses and that home search and shop quantity controls initialize successfully. This check does not place an order or modify database records.

## Storage and editing

- `HomePage` documents with slugs `home` and `shop` store the editable page text, links, and metadata. The `home` document additionally holds the educational `plants` array and 12 hero `backgrounds`.
- `ShopProduct` holds the 24 purchasable products. `price` is numeric INR. Category-prefixed unique slugs distinguish the two Aloe Vera listings.
- `Category` holds six shared category definitions, their names, descriptions, image data, ordering, and anchor IDs. Product and educational plant `category` fields reference the category's stable slug.
- `HomePage.content` is a string map: each HTML `<!--content:fieldN-->` marker binds a text node, `data-content-text` binds a title, and `data-content-attrs` maps editable attributes to keys. Use `seed/content.json` to find the original value for each key. The layout remains in HTML; no database HTML is evaluated. Changing text or an allowed URL in the database takes effect on refresh, without reseeding or rebuilding.
- Keep category slugs and anchor IDs stable to preserve existing links. Change `displayOrder` to reorder categories, products, or educational plants. URLs accept HTTP/HTTPS images and HTTP/HTTPS/mailto/tel links; executable schemes are discarded.

The read-only endpoints are `/api/content/home`, `/api/content/shop`, `/api/content/products`, and `/api/content/categories`. Successful responses use `{ success: true, data }`. Missing page documents return 404; empty product/category collections return empty arrays; unavailable or failed database reads return 503. Reads disable caching so refreshes see current records.

## Migration safety

`seed/content.json` is the permanent structured initialization dataset. The `seed/original-*` files preserve the original HTML and image CSS for migration auditing; Express does not serve this directory. `scripts/extract-content.js` documents the one-time extraction and deliberately refuses to run against already migrated HTML. Do not rerun extraction on the migrated pages.

The explicit seed command connects with the existing `config/db.js` configuration, validates records, and upserts by unique slug using `$setOnInsert`. Existing records, including their timestamps and edits, are left intact. It creates missing seed records, never clears collections, and never touches users, orders, or contact submissions. It is not run automatically by server startup. The seed command returns a failing exit code if MongoDB is unavailable and always disconnects. A partially completed run can safely be rerun.

## Live verification when MongoDB is available

1. Run the seed command twice. The second run should report zero inserts for all three models. Expected initial counts: 2 page documents, 6 categories, 24 products, and 24 educational plants in the home document.
2. Edit a product price or description and a home page content value using MongoDB Compass. Refresh each page and verify the edits appear. Run the seed command again and verify the edits and counts are unchanged.
3. Search for Aloe Vera on Home: both category entries should match. Clear the search and follow category anchors.
4. On Shop, add products, adjust quantities, and complete a test order. Verify totals, saved order, and cart reset. A failed order request should retain the cart.
5. Stop MongoDB, reload, and verify an error with Retry. Restart MongoDB and use Retry; content requests attempt to reconnect. In an isolated test database, verify empty collections and missing page documents produce the documented states.

The admin upgrade now validates checkout prices and stock on the server and protects order listings with admin authorization. See ADMIN.md.
