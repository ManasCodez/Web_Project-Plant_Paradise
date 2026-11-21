# API Documentation

All successful payloads use `success: true` and a resource field (`data`, `user`, or `order`) unless noted. Standard middleware errors are `{success:false,message}` with 400 validation/cast errors, 401/403 authentication/authorization, 404 absence, 409 conflicts/duplicates, 415 media type, 429 rate limit, 502 Cloudinary failure, or 503 dependency/configuration failure.

## Endpoint inventory

| Method / path | Handler source | Auth / operation | Request and response summary |
|---|---|---|---|
| POST `/api/auth/register` | authRoutes | public; rate 15 | fullname, username, email, password, optional DOB → 201 safe `user`; creates bcrypt-hashed User. |
| POST `/api/auth/login` | authRoutes | public; rate 30 | email/password → safe `user` plus HttpOnly session cookie. |
| GET `/api/auth/me` | authRoutes | signed-in | current safe `user`. |
| POST `/api/auth/logout` | authRoutes | signed-in | increments User sessionVersion, clears cookie → success. |
| GET `/api/products`, `/api/products/:id` | catalogRoutes | public | pagination/surface or id; reads publishable products → `data`, total/page/limit for list. |
| GET `/api/categories`, `/api/categories/:slug/products` | catalogRoutes | public | reads active categories or paged public category products. |
| GET `/api/content/home`, `/shop` | contentRoutes | public | HomePage document; home additionally loads category-surface products. |
| GET `/api/content/products`, `/categories` | contentRoutes | public | publishable shop products or active categories. |
| POST `/api/contact` | contactRoutes | public; rate 20 | name/email/subject/message → 201 created Contact. |
| GET `/api/contact` | contactRoutes | admin | latest 100 Contact records → `count`, `messages`. |
| GET `/api/orders/profile` | orderRoutes | signed-in | safe account fields and saved address. |
| POST `/api/orders/quote` | orderRoutes | signed-in; rate 180 | `items[{productId,quantity}]` → validated current totals/items. |
| POST `/api/orders` | orderRoutes | signed-in; rate 30 | idempotency header; cart, customer, Indian address, COD, total, optional saved address → 201 `order`; transaction reserves stock. |
| GET `/api/orders/my` | orderRoutes | signed-in | own paged orders. |
| GET `/api/orders` | orderRoutes | admin | latest 50 orders. **Implemented, no production browser caller found.** |
| GET `/api/orders/:id` | orderRoutes | signed-in | owned order or any order for admin. |
| GET `/api/admin/dashboard` | adminRoutes | admin | aggregate/count dashboard data. |
| GET/POST `/api/admin/products` | adminRoutes | admin | filter/page products; create draft/product. |
| GET/PATCH/DELETE `/api/admin/products/:id` | adminRoutes | admin | read/update; delete archives and hides, not physical deletion. |
| GET/POST `/api/admin/categories` | adminRoutes | admin | list/create categories. |
| PATCH/DELETE `/api/admin/categories/:id` | adminRoutes | admin | update except immutable slug; delete only when no linked product. |
| GET `/api/admin/users` | adminRoutes | admin | filtered/paged safe user projection. |
| GET `/api/admin/settings` | adminRoutes | admin | non-secret feature/connection settings. |
| GET `/api/admin/media` | adminRoutes | admin | paged non-retired media. |
| POST `/api/admin/media/upload` | adminRoutes | admin; rate 60 | raw JPG/PNG/WebP ≤3 MB → validated Sharp/Cloudinary media record. |
| DELETE `/api/admin/media/:id` | adminRoutes | admin | retires unused Media; refuses referenced media. |
| GET `/api/admin/orders`, `/api/admin/orders/:id` | adminCommerceRoutes | admin | paged/filterable order list or full presentable order. |
| PATCH `/api/admin/orders/:id/status` | adminCommerceRoutes | admin; rate 120 | legal next `orderStatus`; COD `paid` only post-delivery; cancellation restores stock transactionally. |
| PATCH `/api/admin/users/:id/role` | adminCommerceRoutes | admin; rate 30 | `role` user/admin; transaction audits change, preserves an admin, invalidates target session. |

## Frontend callers and actual lifecycle

`content.js` calls content home/shop plus categories/products dynamically. `auth-state.js`, login/register/contact forms call auth/contact. `commerce.js` calls profile, content products, quote, checkout, order detail and history. `admin.js` calls all listed `/api/admin/*` resources it renders plus `/api/auth/me` and logout; its XHR invokes media upload. The public catalog routes and admin contacts endpoint have no production frontend caller found; tests do call them.

```mermaid
sequenceDiagram
  participant UI as Checkout UI
  participant F as commerce.js
  participant E as Express /api
  participant A as authenticate
  participant O as orders service
  participant DB as MongoDB
  UI->>F: Place COD order
  F->>E: POST /api/orders + JSON + Idempotency-Key
  E->>A: verify cookie/sessionVersion
  A->>DB: find User
  E->>O: validate delivery/cart, quote(reserve=true)
  O->>DB: transaction: decrement stock + create Order
  opt saveAddress
    E->>DB: update User.savedAddress
  end
  DB-->>E: commit
  E-->>F: 201 {success, order}
  F->>F: clear cart; navigate confirmation
```

The external call is server-to-Cloudinary only; browser code never calls Cloudinary directly.
