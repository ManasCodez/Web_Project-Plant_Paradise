# Database Architecture

MongoDB is accessed through Mongoose. `connectDB()` reuses an open/pending connection; connection failures surface as API 503 responses. Transactions are used for product/category consistency, checkout inventory reservation, status cancellation/restock, and role changes.

```mermaid
erDiagram
  User ||--o{ Order : places
  User ||--o{ AdminEvent : acts_in
  User ||--o{ Order : history_actor
  ShopProduct ||--o{ Order : snapshotted_in
  Category ||--o{ ShopProduct : category_slug
  HomePage }o--o{ ShopProduct : displays_via_query
  Media }o--o{ ShopProduct : referenced_by
  Media }o--o{ Category : referenced_by
  User {
    ObjectId id PK
    string email UK
    string username UK
    string role
  }
  ShopProduct {
    ObjectId id PK
    string slug UK
    string category
    int stock
    string status
  }
  Category {
    ObjectId id PK
    string slug UK
    string anchorId UK
    boolean isActive
  }
  Order {
    ObjectId id PK
    string orderNumber UK
    ObjectId userId FK
    string orderStatus
    int totalPaise
  }
  Media {
    ObjectId id PK
    string publicId UK
    string url
    boolean retired
  }
```

## Collections

| Collection/model | Purpose and notable constraints |
|---|---|
| `User` | Accounts, role, session version, password hash, optional saved address; username/email unique. |
| `ShopProduct` | Sellable catalogue; unique slug, category slug, availability, visibility, price/sale price and stock. |
| `Category` | Unique slug/anchor, presentation and active state. Product-to-category association is by slug, not Mongo ObjectId. |
| `HomePage` | One document per `home`/`shop`, with content map, backgrounds and legacy educational plant array. |
| `Order` | User/order references, immutable-ish item snapshots, monetary paise fields, COD/order status/history; unique order ids and partial unique `(userId,idempotencyKey)` index. |
| `Media` | Cloudinary metadata; logical retirement rather than cloud deletion. |
| `Contact` | Form messages. |
| `AdminEvent` | Role lock/revision plus role-change audit events. |
| `RateLimit` | Hashed scope/IP/time-bucket counter with TTL `expiresAt`. |

## Data workflow

```mermaid
flowchart TD
  Admin([Admin edits product/category]) --> TX[MongoDB transaction]
  TX --> CAT[(Category: validate/bump version)]
  TX --> PROD[(ShopProduct: save/archive)]
  Shopper([Checkout]) --> Q[quote validates public category/product + stock]
  Q --> CTX[transaction]
  CTX --> DEC[atomic Product stock decrement]
  DEC --> ORD[(Order create with history)]
  CTX --> USR[(optional User savedAddress update)]
  AdminOrder([Cancel order]) --> CANCEL[transaction]
  CANCEL --> RESTORE[(increment ShopProduct stock)]
  CANCEL --> HISTORY[(update Order status/history)]
```

CRUD mapping: public catalogue/content reads query `ShopProduct`, `Category`, and `HomePage`; admin creates/updates/archives products, creates/updates/deletes categories, manages media and reads users; contact POST creates `Contact`; auth creates/reads/updates `User`; checkout reads products/categories then creates orders and may update a saved address. The server performs schema validation plus explicit input validation; it has no Mongoose lifecycle hooks or database triggers.
