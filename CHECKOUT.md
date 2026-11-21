# Checkout and order-management upgrade

This extends the existing Express/Mongoose/vanilla-JavaScript application. Public Shop and Categories layouts remain unchanged. No new dependency or production-data migration is required.

## Run locally

```powershell
npm.cmd install
$env:PORT='3000'
$env:APP_ORIGIN='http://localhost:3000'
# Only if your Atlas DNS resolver needs this workaround:
$env:MONGODB_DNS_SERVERS='1.1.1.1,8.8.8.8'
npm.cmd start
```

Open `/Shop/`, add plants, and choose Proceed to Checkout. `/checkout` preserves the same cart through login. `/my-orders` and `/orders/confirmation/:id` show authenticated, owner-checked order data. Existing admins use `/admin/orders` and `/admin/users`.

Use the existing `MONGODB_URI` and `JWT_SECRET` (32+ characters). MongoDB must support transactions (Atlas or a local replica set). `APP_ORIGIN`, `PORT`, and optional DNS settings retain their existing meaning. No payment keys or new environment variables are required for COD. Existing Cloudinary variables remain necessary only for media uploads.

## Behavior and store policies

- One shared cart persists **product IDs and quantities** in browser localStorage. MongoDB remains authoritative for products, prices, orders and users. Checkout quotes current prices, then revalidates price, publication and stock inside the placement transaction.
- Delivery is currently **free within India**. Product sale prices are already included in item prices; no fictitious coupon or additional discount is displayed. Pricing policy is centralized in `services/orders.js`.
- Customer email is taken from the authenticated account, never from the submitted form. Name, Indian mobile number, address, six-digit PIN and country are validated server-side. An optional saved address is stored only when an order succeeds.
- COD orders begin `placed` / `pending`. Integer paise are used for calculations and snapshots; legacy rupee fields remain for compatibility. Browser totals and item prices cannot set the charged amount. A stale quote is rejected for customer review.
- Checkout retains the exact pending submission and request key in sessionStorage across ambiguous network failures. Repeating the same request returns the existing order. A unique index scopes idempotency to the authenticated user. Successful placement clears the cart; failures retain it.
- Status flow: **placed → confirmed → processing → shipped → out_for_delivery → delivered**. Cancellation is available only before dispatch, from placed/confirmed/processing. Delivered and cancelled are terminal. Cancellation restores a new order's reserved stock once, in the same transaction as the status change.
- Admins explicitly mark COD payment collected **after delivery**. Delivered-but-unpaid orders are excluded from revenue. Repeating collection does not duplicate the timeline. Dashboard “today” uses Asia/Kolkata.
- Historical orders retain their snapshots and IDs. Old guest orders are **not assigned to accounts by email**: without a stored userId, they remain admin-only. Unknown historical payment states are not treated as paid. Legacy orders without an inventory reservation marker do not automatically add stock when cancelled.
- Admins can promote/demote other accounts after a confirmation dialog. Self-demotion is blocked. A shared transactional lock serializes role changes and protects the last administrator, including concurrent requests. Changes invalidate the affected account's sessions and create an audit event. No super-admin role was introduced because the existing authorization model has only user/admin.

## API changes

All customer endpoints below require authentication. All admin endpoints retain server-side admin checks.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/orders/profile` | Account name/email and optional saved address |
| `POST /api/orders/quote` | Validate cart and calculate current summary |
| `POST /api/orders` | Place an authenticated COD order with delivery details and an `Idempotency-Key` header |
| `GET /api/orders/my` | Paginated orders belonging to the current user |
| `GET /api/orders/:id` | Order details for its owner or an admin |
| `GET /api/admin/orders` | Search number/name/email; filter order/payment status; sort newest/oldest; paginate |
| `GET /api/admin/orders/:id` | Full order detail and available next statuses |
| `PATCH /api/admin/orders/:id/status` | Update `orderStatus`, or set `paymentStatus: "paid"` after actual COD collection |
| `PATCH /api/admin/users/:id/role` | Set `role: "user"` or `"admin"` with safeguards and auditing |
| `GET /api/admin/dashboard` | Adds today/delivered/cancelled counts and collected-payment revenue |

Order POST accepts `items[{productId,quantity}]`, `customer{name,phone}`, `shippingAddress{addressLine1,addressLine2,landmark,city,state,postalCode,country}`, `paymentMethod:"cod"`, `deliveryInstructions`, `saveAddress`, and `expectedTotalPaise` from the quote. The expected amount is compared with the independently recomputed total; it is not trusted as the price.

## Schema changes

- **Order:** additive owner, human-readable number, customer/address snapshot, integer-paise totals and item snapshots, payment/order states, idempotency key/hash, stock reservation/restoration flags and status history. Added indexes for order number, user/request-key uniqueness, customer history and status searches. Original `orderId`, `plant`, `price`, `totalAmount`, `status` and `customerEmail` remain compatible.
- **User:** optional `savedAddress`; existing role/sessionVersion fields are reused.
- **AdminEvent:** role audit entries (acting admin, target, previous/new role, timestamps) and a control document used to serialize role changes.

## Files

Created: `services/orders.js`, `routes/adminCommerceRoutes.js`, `models/AdminEvent.js`, `public/cart.js`, `public/commerce.js`, `public/commerce.css`, `views/commerce.html`, `tests/commerce-smoke.test.js`, and this guide.

Modified: `models/Order.js`, `models/User.js`, `services/catalog.js`, `routes/orderRoutes.js`, `routes/adminRoutes.js`, `server.js`, `public/Shop/index.html`, `public/Shop/shop.js`, `public/login/script.js`, `public/auth-state.js`, `public/admin-assets/admin.js`, `public/admin-assets/admin.css`, `package.json`, and the affected existing content/integration tests. Existing admin product/category/media functionality is retained.

## Essential verification

```powershell
npm.cmd run test:commerce
```

This focused smoke test starts an isolated local MongoDB replica set and exercises the checkout DOM against real local APIs, order placement/history/ownership, admin order details and status transitions, collected-payment revenue, cancellation stock restoration, idempotency, and promotion/demotion on disposable accounts. It disables automatic binary downloading; use the already cached MongoDB test binary, or set `MONGOMS_SYSTEM_BINARY` to a locally installed compatible mongod executable if needed. It does not connect to your production URI or modify real accounts.

No large new test suite or new testing framework was added. Existing checkout tests were updated to the new authenticated delivery contract. Browser-based visual inspection is not claimed.

## Deployment

Deploy the updated repository to the existing Vercel Express project; retain its current MongoDB, JWT, origin and Cloudinary settings. There is no frontend build step. New indexes are initialized by Mongoose; checkout awaits its unique indexes before creating orders. No destructive migration or live role changes are needed for this upgrade. Restart the local server after updating the code.

After deployment, verify the pages and appearance on desktop/mobile, then use an explicitly designated test environment for further ordering checks. Do not create fake orders in the production database. The public pages and admin styling include responsive breakpoints and reduced-motion rules.

Executed verification: the focused local smoke workflow and three related UI/cart checks passed (4 checks total). Checkout startup, cart rendering, order placement, saved address, customer ownership, admin order listing/details/status, COD revenue, cancellation/idempotency, role promotion/demotion and access denials were exercised. `git diff --check` passed. No production orders or real-role changes were made. Deployment and manual desktop/mobile visual inspection have not been performed.
