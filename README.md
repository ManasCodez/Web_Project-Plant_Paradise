# 🌿 Plant Paradise - Full-Stack Web Application

> **Discover the beauty and benefits of plants around you.** 🌱

Plant Paradise is a full-stack e-commerce and plant discovery platform built using **Node.js, Express, MongoDB (Mongoose), HTML5, and CSS3**.

---

## ✨ Features

- 🌿 **Plant Showcase & Categories**: Interactive plant categories with live real-time search.
- 🪴 **Plant Shop & Cart**: Add plants to cart, live quantity adjustments, and direct order placement.
- 🔐 **Authentication System**:
  - User registration and login with encrypted passwords (`bcryptjs`).
  - Session tokens (`JWT`) stored in browser `localStorage`.
  - Dynamic navigation bar: hides Login/Register when logged in and displays the user profile and a **Logout** button.
- 📩 **Contact Us**: Contact form saving inquiries directly into the database.
- ☁️ **Cloud Database**: Powered by MongoDB Atlas.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (via Mongoose ODM) / MongoDB Atlas
- **Security**: bcryptjs (Password Hashing), jsonwebtoken (JWT)
- **Frontend**: Semantic HTML5, CSS3 (CSS Grid & Flexbox), Vanilla JavaScript (ES6+ Fetch API)

---

## 📁 Project Structure

```text
Web_Project-Plant_Paradise/
├── .env                  # Environment variables (Mongo URI, Port, JWT secret)
├── .env.example          # Template for environment variables
├── .gitignore            # Files ignored by git (node_modules, .env)
├── package.json          # Dependencies & scripts
├── server.js             # Main Express backend server entry point
├── config/
│   └── db.js             # MongoDB connection logic
├── models/
│   ├── User.js           # User schema (fullname, username, email, password)
│   ├── Order.js          # Order schema (orderId, items, totals, customer)
│   └── Contact.js        # Contact messages schema
├── routes/
│   ├── authRoutes.js     # /api/auth (register, login)
│   ├── orderRoutes.js    # /api/orders (create, retrieve orders)
│   └── contactRoutes.js  # /api/contact (submit contact form)
└── public/               # Static frontend files served by Express
    ├── index.html        # Home & plant categories
    ├── style.css         # Styling for home
    ├── search.js         # Live client-side plant search
    ├── auth-state.js     # Dynamic navbar (login/register vs user/logout)
    ├── 404.html & css    # 404 Page Not Found
    ├── Shop/             # E-commerce store (index.html, styles.css, shop.js)
    ├── contact/          # Contact page (index.html, styles.css, contact.js)
    ├── login/            # Sign in page (index.html, styles.css, script.js)
    └── register/         # Sign up page (index.html, styles.css, script.js)
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed (v16 or higher recommended).
- A [MongoDB Atlas](https://www.mongodb.com/atlas) account (or a local MongoDB instance).

### 2. Installation
Open your terminal in the project directory and install the required dependencies:
```bash
npm install
```

### 3. Environment Configuration (`.env`)
Create or edit the `.env` file in the project root:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/plant_paradise?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_key_here
```
> 💡 *Replace `<username>` and `<password>` with your MongoDB Atlas database user credentials.*

---

## 🏃 Running the Application

### Development Mode (with automatic server reload):
```bash
npm run dev
```

### Production / Standard Mode:
```bash
npm start
```

Once started, the console will output:
```text
===============================================
 Plant Paradise Server running on port 5000
 Local URL: http://localhost:5000
===============================================
[MongoDB] Connected successfully: ...
```

---

## 🌐 Using the Website

Open your browser and navigate to:

| Page | URL | Description |
|---|---|---|
| 🏠 **Home** | `http://localhost:5000/` | Browse plant categories and use live search |
| 🛒 **Shop** | `http://localhost:5000/Shop/` | Add plants to cart and place orders |
| 📝 **Register**| `http://localhost:5000/register/` | Create a new user account |
| 🔑 **Login** | `http://localhost:5000/login/` | Log into an existing account |
| 📬 **Contact**| `http://localhost:5000/contact/` | Send inquiries to the database |

---

## 🔒 Authentication & Session Details

- When a user logs in, user data and an auth token are stored in browser **`localStorage`**.
- Navigation automatically reflects authentication state via `auth-state.js`:
  - When logged out: **Login** and **Register** links are visible.
  - When logged in: **Login** and **Register** are hidden, replaced by the user's name and a **Logout** button.
- Orders submitted from the Shop are automatically attached to the logged-in user's email.

---

## 💚 Made With

**Node.js + Express + MongoDB + HTML/CSS + 🌱 A Love for Plants**
