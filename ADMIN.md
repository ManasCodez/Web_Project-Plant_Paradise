# Plant Paradise admin implementation

> Checkout, customer order history, COD payment tracking, order status management and dashboard role controls now extend this version. See [CHECKOUT.md](./CHECKOUT.md) for the current behavior and setup. Older descriptions of guest checkout, read-only orders, role changes being CLI-only, and order-value revenue are superseded.

This extends the existing Express, Mongoose and vanilla JavaScript application. The public layout and original page-content bindings remain in place. There is no separate frontend framework or build step.

## Run locally

Use Node 22 or newer. Keep your existing `.env`; copy only missing settings from `.env.example`.

```powershell
npm.cmd install
# Set PORT=3000 and APP_ORIGIN=http://localhost:3000 in your environment.
$env:PORT='3000'
$env:APP_ORIGIN='http://localhost:3000'
npm.cmd start
```

Open `/`, `/Shop/`, and `/admin`. An unauthenticated `/admin` request redirects to the existing login form. Signed-in ordinary users receive 403. Administrators signing in through the existing login page are redirected to `/admin`.

MongoDB must be a replica set (Atlas supports this). Product/category writes and stock/order creation use transactions. A standalone local MongoDB is insufficient for those writes; initialize a local replica set or use Atlas. Startup does not seed or migrate data automatically.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Existing MongoDB connection; never sent to the browser |
| `JWT_SECRET` | Random secret of at least 32 characters; no fallback secret |
| `PORT` | Local port; defaults to 3000 if unset |
| `APP_ORIGIN` | Exact browser origin, without a trailing slash; local example `http://localhost:3000`, production `https://web-project-plant-paradise.vercel.app` |
| `CLOUDINARY_CLOUD_NAME` | Persistent photo storage account |
| `CLOUDINARY_API_KEY` | Server-only Cloudinary key |
| `CLOUDINARY_API_SECRET` | Server-only signing secret |
| `MONGODB_DNS_SERVERS` | Optional comma-separated DNS resolvers for Atlas SRV issues |

Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Store it directly in `.env` or Vercel environment settings, never in Git. Use distinct environment values for preview deployments; omit `APP_ORIGIN` to derive the origin from the request host if each preview has a unique URL.

## Safe catalog migration

```powershell
npm.cmd run migrate:admin
npm.cmd run migrate:admin -- --apply
npm.cmd run migrate:admin
```

The first/default command is read-only. The explicit apply command adds only missing fields and is safe to repeat. Back up your database before applying any deployment migration. No collection is cleared, no existing record is deleted, and product IDs, prices, existing descriptions, image URLs and source HomePage arrays are preserved.

The repository and connected database contain 24 shop products across six categories: Medicinal, Edible, Indoor, Flowering, Fruit and Desert. Both Aloe Vera records retain their distinct category-prefixed slugs. Existing home plants are matched to ShopProduct by exact slug, not name. Their `highlight`, `uses` and longer descriptions populate `famousFor`, `uses` and `detailedDescription` only when those target fields are missing. The old arrays remain as an archival source, but public home rendering reads ShopProduct.

Home-only plants, if present in another database, are inserted once by slug as drafts with `showInShop=false` and price 0; review their content and price before publishing. No such unmatched records were found in the connected database dry run.

Stock was not tracked previously. Missing stock becomes **0**, not a fabricated inventory count. Existing listings remain visible; an admin must set actual stock before purchases are accepted. Seed commands remain insert-only and do not overwrite admin edits. For a brand-new database, run `npm.cmd run seed:content` before the admin migration.

## Administrator setup

Register through `/register/`, then run the command from a trusted server/local terminal with the database environment configured:

```powershell
npm.cmd run admin:promote -- registered@example.com
```

This promotes only an existing account and invalidates its previous sessions. It creates no default credentials and never resets passwords. Sign in again at `/login/`. Public registration always assigns `user`, regardless of client-supplied role. There are no role-change or user-delete APIs, so an administrator cannot accidentally remove the last administrator through this UI.

Sessions use an eight-hour HttpOnly, SameSite=Strict cookie, Secure in production. Roles and session versions are re-read from MongoDB on every authenticated request. Logout invalidates existing sessions for that account. Old localStorage JWTs are no longer accepted; users must sign in again after deployment. MongoDB-backed fixed-window rate limits protect login, registration, checkout and upload across serverless instances. Origin checks protect mutations, and unrestricted CORS has been removed.

## Shared catalog and schema changes

- `ShopProduct` remains the existing collection, now used by **both** Shop and Categories. Added fields: `shortDescription`, `detailedDescription`, `scientificName`, `famousFor`, `uses`, `benefits`, `careInstructions`, `images[{url,publicId,alt}]`, `discountPrice`, `stock`, `availability`, `status`, `showInShop`, `showInCategories`, and migration marker `cmsVersion`. Original `description`, `imageUrl`, `imageAlt`, `category`, `price`, `slug`, and ordering remain compatible.
- `Category` retains slug references and anchors; added `isActive` and `imagePublicId`. Slugs are immutable after creation, so renaming does not break links. Deleting a linked category is rejected, including links from archived plants; reassign all linked products first.
- `User` gains `role` and `sessionVersion`. Existing password hashes are preserved.
- `Order.items` gains an optional `productId`. Historical item names and prices remain immutable snapshots. Checkout uses current MongoDB prices, discounts and available stock, ignores browser totals, and decrements stock atomically with order creation. A client-generated idempotency key prevents double ordering on network retries.
- New `Media` collection stores cloud URLs, IDs, dimensions and retirement metadata, never image binaries.
- New `RateLimit` collection stores hashed request buckets and expiry dates with a TTL index.

A product is publicly listed only when active, enabled for the requested surface, and assigned to a published category. Out-of-stock products remain visible with disabled purchase controls. Reads use `Cache-Control: no-store`; ordinary edits need no redeployment. Archiving removes public visibility while retaining IDs and order history. The admin list can edit and restore an archived product.

## Media

Uploads use server-signed Cloudinary requests. The server checks the 3 MB request limit, MIME type, decoded image format, animation and a 25-megapixel limit. Sharp fully decodes and re-encodes to WebP, strips metadata and limits output dimensions to 1600 px. No temporary filesystem uploads are used. Existing external image URLs remain valid.

The UI supports progress, local preview, multiple images, alt text, cover selection, replacement and removal. Uploads become library records immediately; a failed or cancelled plant save leaves the uploaded image available for reuse. Library removal rejects referenced assets and retires unused records. Cloud objects are intentionally retained to protect old links and concurrent edits; this is **not** a permanent Cloudinary deletion or storage-cost cleanup feature. Public images are lazy loaded and fall back to a local illustration after a load failure.

## Routes

| Area | Endpoints |
| --- | --- |
| Existing public content | `GET /api/content/home`, `/shop`, `/products`, `/categories` |
| Public catalog | `GET /api/products`, `/api/products/:id`, `/api/categories`, `/api/categories/:slug/products` |
| Authentication | `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me` |
| Dashboard | `GET /api/admin/dashboard` |
| Plants | `GET, POST /api/admin/products`; `GET, PATCH, DELETE /api/admin/products/:id` (DELETE archives) |
| Categories | `GET, POST /api/admin/categories`; `PATCH, DELETE /api/admin/categories/:id` |
| Media | `GET /api/admin/media`; `POST /api/admin/media/upload`; `DELETE /api/admin/media/:id` (retires unused media) |
| Users, orders, settings | `GET /api/admin/users`, `/api/admin/orders`, `/api/admin/settings` |
| Checkout | Existing `POST /api/orders`; order listings now require admin authorization |
| Contact | Existing `POST /api/contact`; message listings now require admin authorization |

Admin plant search accepts `q`, `category`, `status`, `visibility`, `sort`, `page`, `limit`. Sort choices: `updated`, `name`, `price`, `price-desc`. Users support `q` and `role`; orders support `status`. Public product endpoints accept pagination and `surface=categories` where appropriate. Pagination is capped at 100 per page. Search strings are escaped before use in MongoDB regexes. User listings project only ID, name, username, email, role and registration date.

The dashboard displays actual product, category, user and order counts. Revenue is the value of confirmed/shipped/delivered orders, not verified payment receipts. No payment gateway was introduced, and no sales statistics were fabricated. The existing order flow remains order placement without payment processing.

## Project/file map

```text
middleware/security.js       Cookie sessions, role checks, CSRF, limits, error responses
services/catalog.js          Shared filters, presentation and validation
services/media.js            Image validation and signed persistent uploads
routes/adminRoutes.js        Admin dashboard and CRUD APIs
routes/catalogRoutes.js      Public catalog endpoints
views/admin.html             Server-protected admin shell (outside public/)
public/admin-assets/         Responsive admin CSS and vanilla JavaScript
public/fallback-plant.svg    Broken-image fallback
models/Media.js              Cloud media metadata
models/RateLimit.js          Durable request limits
scripts/migrate-admin.js    Read-only preview / additive migration
scripts/promote-admin.js    Existing-account promotion
.env.example                Environment template, without secrets
tests/admin-ui.test.js      Admin DOM and form tests
tests/integration.test.js   Isolated MongoDB replica-set integration tests
```

Modified existing files: `server.js`; models `ShopProduct`, `Category`, `User`, `Order`; routes `authRoutes`, `contentRoutes`, `orderRoutes`, `contactRoutes`; `public/content.js`, `public/Shop/shop.js`, `public/login/script.js`, `public/auth-state.js`; `package.json`, lockfile, content tests and documentation. Existing package changes present at the start were preserved.

## Testing

```powershell
npm.cmd test
npm.cmd run test:content
npm.cmd run test:integration
npm.cmd audit --omit=dev
```

Integration tests start an ephemeral MongoDB replica set via mongodb-memory-server and never use your configured production URI. The first installation/run downloads a MongoDB binary and requires internet access. Tests cover registration/role injection, cookie sessions, admin route/API denials, logout, migration idempotence, CRUD, shared public data, visibility, safe category deletion, server-calculated prices, idempotent checkout, concurrent stock depletion and transaction rollback. Upload tests use real image decoding with a stubbed Cloudinary response, not a live cloud account.

There is no frontend compilation/build command in this project. Syntax, DOM, HTTP and database tests are the relevant checks. See the final delivery for the executed test results and external-service limitations.

## Deploy to Vercel

1. Review the diff and commit the changes to the existing repository. Keep `.env` out of Git.
2. Use the existing Vercel project, with Express auto-detection and `server.js` as its entry point. No separate static-only output directory or frontend build is required. The app exports Express and only binds a local listener when run directly.
3. Set production environment variables, including the exact `APP_ORIGIN`, long `JWT_SECRET`, MongoDB URI and the three Cloudinary values. Use a supported Node runtime (22 or newer). Configure Atlas network access for the deployment.
4. Back up and apply the additive migration from a trusted terminal. Set actual stock in the admin UI. Promote the chosen registered account.
5. Deploy the existing repository to Vercel. Then sign in and smoke-test `/admin`, a plant edit, Shop/Categories synchronization, a real cloud photo upload and a controlled checkout.

Vercel serves public assets from `public`; the protected shell deliberately lives under `views`, so static delivery cannot bypass admin authentication. The image upload limit stays below Vercel's function request-body limit. Transactions require a replica-set database. See [Vercel Express documentation](https://vercel.com/docs/frameworks/backend/express) and [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference).

## Executed verification (21 November 2026)

- The approved live additive migration extended 24 existing products; the following dry run reported zero remaining changes and no unmatched home-only plants.
- A read-only check against the configured database verified 24 shared Shop/Home product IDs, matching images and descriptions, six categories, and the selected account's admin role.
- The complete automated suite passed **21 tests**, including real transactions against an ephemeral **local** MongoDB replica set. No temporary Atlas database was created for tests.
- `npm audit --omit=dev` reported zero known production-dependency vulnerabilities. The full install still reports two moderate development-dependency advisories.
- JavaScript syntax checks and `git diff --check` passed.
- Cloudinary HTTP responses were stubbed in integration tests; image decoding, validation, MongoDB metadata and reference checks were exercised. Real Cloudinary upload remains unverified until the three service credentials are configured.
- Browser visual inspection could not be completed: the browser automation host was unavailable, and Windows Computer Use then stopped because it could not reliably identify the active browser URL. Responsive CSS and DOM tests exist, but desktop/mobile visual QA is still needed.
- No Vercel deployment was performed. Deploy/restart the updated application before using the new admin routes and authorization protections. Set real stock quantities before accepting purchases.
