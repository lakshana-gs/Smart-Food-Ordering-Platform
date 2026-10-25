# 🍔 Smart Food Ordering Platform

> **A Complete Full-Stack Database-Driven Food Ordering & Delivery Management System**

A powerful Node.js + Express + MySQL web application featuring real-time kitchen tracking, personalized food discovery, dynamic promotional coupons, address book management, persistent shopping carts, and a comprehensive administrative command center.

---

## 📑 Table of Contents

* [Features](#-features)
* [Architecture & Tech Stack](#-architecture--tech-stack)
* [Project Structure](#-project-structure)
* [Database Setup & Migrations](#-database-setup--migrations)
* [Installation & Quickstart](#-installation--quickstart)
* [API Reference](#-api-reference)
* [Security Best Practices](#-security-best-practices)
* [Automated Testing](#-automated-testing)
* [Author & Contact](#-author--contact)
* [License](#-license)

---

## 🚀 Features

### 🧑‍🍳 Customer Experience
* **Welcoming Storefront:** Hero discovery, food category filters, trending popular dishes, and personalized "For You" recommendations.
* **Smart Food Discovery:** Real-time search, category filtering, pure vegetarian vs. non-vegetarian dietary badges, price sorting, and item detail modals with "Frequently Bought Together" pairings.
* **Persistent Shopping Cart:** Fully synchronized with MySQL across logins and page reloads, server-side price protection, quantity controls, delivery charge calculation, and promo code support.
* **Saved Favourites:** MySQL-backed saved dishes per user with one-click cart additions.
* **Address Book Management:** Add, edit, delete, and set default delivery addresses with strict user ownership isolation.
* **Checkout & Payment:** Order item summaries, recipient phone validation, delivery instructions, and clearly labelled Cash on Delivery & Demo Card options.
* **Order History & Quick Reorder:** Order archive, cancellation protection (cancellable only while Pending or Confirmed), and one-click reordering at current store prices.
* **Real Order Tracking:** Live status timeline (`Pending` → `Confirmed` → `Preparing` → `Out for Delivery` → `Delivered`) backed by real database timestamps and auto-refresh polling (no fake GPS animations).
* **Customer Support & FAQs:** Interactive FAQ categories and functional customer contact submission storing inquiries in MySQL.

### 🛡️ Administrative Command Center
* **Live Overview Metrics:** Registered accounts, active dishes, total orders, and real net revenue calculated strictly excluding cancelled orders.
* **Date Range Summaries:** Analytics filters for `Today`, `This Week`, `This Month`, and `All Time`.
* **Menu Management:** Full CRUD operations, category management, dietary flags, prep times, availability toggles, and soft-delete safeguards for dishes with order history.
* **Order Lifecycle Control:** Inspect full order snapshots, update status through validated transitions, and review delivery instructions.
* **User & Role Administration:** Search accounts, filter by role/status, toggle account deactivation, with protection against self-deactivation.
* **Promotions Engine:** Create, toggle active status, and set rules for discount percentages, flat discounts, minimum order thresholds, and expiration dates.

---

## 🧰 Architecture & Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | HTML5, Modern Vanilla CSS3 (Custom Design System), JavaScript (ES6+), FontAwesome Icons |
| **Backend** | Node.js, Express.js (v5.x REST API) |
| **Database** | MySQL (`mysql2/promise` connection pool, utf8mb4 charset) |
| **Authentication** | JSON Web Tokens (JWT), bcrypt password hashing |
| **Architecture** | Client-Server REST, Transactional SQL checkout, Role-Based Access Control (RBAC) |

---

## 📁 Project Structure

```bash
Smart-Food-Ordering-Platform/
├── backend/
│   ├── middleware/
│   │   └── authMiddleware.js      # JWT verification & admin RBAC
│   ├── routes/
│   │   ├── addresses.js           # User delivery address book
│   │   ├── admin.js               # Analytics, stats & recent orders
│   │   ├── auth.js                # Signup, login & profile (/me)
│   │   ├── coupons.js             # Promo validation & admin management
│   │   ├── favourites.js          # Saved foods per user
│   │   ├── menu.js                # Public browse & admin menu CRUD
│   │   ├── orders.js              # Cart, checkout, tracking & reorder
│   │   ├── recommendations.js     # Popular, personalized & basket pairs
│   │   ├── support.js             # FAQs & contact form submissions
│   │   └── users.js               # User management & account safety
│   ├── db.js                      # MySQL connection pool configuration
│   ├── migrate.js                 # Safe incremental DB migrations
│   ├── server.js                  # Main server entry point
│   ├── test.js                    # Automated end-to-end test suite
│   ├── init.sql                   # Base database initialization
│   └── package.json               # Backend dependencies
├── frontend/
│   ├── admin/
│   │   ├── add-user.html          # Admin user creation
│   │   ├── coupons.html           # Promotional campaign manager
│   │   ├── dashboard.html         # Live analytics command center
│   │   ├── delivery-status.html   # Quick status updater
│   │   ├── edit-user.html         # Edit user roles and status
│   │   ├── manage-menu.html       # Dish CRUD and availability
│   │   ├── orders.html            # Order management table
│   │   └── users.html             # Account administration
│   ├── customer/
│   │   ├── billing.html           # Tax invoice & print view
│   │   ├── cart.html              # Persistent user cart & coupons
│   │   ├── checkout.html          # Order confirmation & address picker
│   │   ├── favourites.html        # Saved favourite dishes
│   │   ├── help.html              # FAQs & functioning contact form
│   │   ├── menu.html              # Browse food with filters & modal
│   │   ├── order-confirmation.html# Order placed success screen
│   │   ├── order-history.html     # Past orders & reorder option
│   │   ├── profile.html           # Profile & address book manager
│   │   └── track-order.html       # Live status progress timeline
│   ├── css/
│   │   ├── app.css                # Core design system & utilities
│   │   ├── dashboard.css          # Admin styling
│   │   └── Pages.css              # Supporting legacy styling
│   ├── 404.html                   # 404 error page
│   ├── index.html                 # Customer home page
│   ├── login.html                 # User authentication sign in
│   ├── main.js                    # Navbar, toast, cart badge & utilities
│   └── signup.html                # Account registration
├── .gitignore                     # Git ignore rules
├── LICENSE                        # MIT License
└── README.md                      # Project documentation
```

---

## 🧱 Database Setup & Migrations

The system utilizes safe, idempotent migrations in `backend/migrate.js` that check for existing columns and tables prior to modification.

### 1. Database Creation
Ensure your MySQL server is running, then create the database:
```sql
CREATE DATABASE IF NOT EXISTS online_food_db;
```

### 2. Run Safe Migrations
Execute the automated migration runner to configure all required tables (`users`, `menu`, `orders`, `order_items`, `billing`, `customer_addresses`, `favourites`, `coupons`, `contact_messages`):
```bash
node backend/migrate.js
```

---

## 🛠️ Installation & Quickstart

### 1. Clone the Repository
```bash
git clone https://github.com/lakshana-gs/Smart-Food-Ordering-Platform.git
cd Smart-Food-Ordering-Platform
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file inside `backend/` or set environment variables:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=online_food_db
DB_PORT=3006
JWT_SECRET=your_jwt_secret_key_here
```

### 4. Start the Application
```bash
node backend/server.js
```
The application will start on: **[http://localhost:3000](http://localhost:3000)**

---

## 🔌 API Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/signup` | Register new customer account | Public |
| `POST` | `/login` | Authenticate with bcrypt & issue JWT | Public |
| `GET` | `/me` | Get profile details of caller | Authenticated |

### 🍽️ Menu & Dishes (`/api/menu`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Browse dishes with search, category, diet, & sort | Public |
| `GET` | `/categories` | Get category breakdown & dish counts | Public |
| `GET` | `/:id` | Fetch single menu dish details | Public |
| `POST` | `/` | Create new dish | Admin |
| `PUT` | `/:id` | Update dish details and price | Admin |
| `PATCH`| `/:id/availability` | Toggle dish available/sold-out | Admin |
| `DELETE`| `/:id` | Delete dish (or soft-deactivate if ordered) | Admin |

### 🛒 Cart & Orders (`/api/orders`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/cart` | Get active user cart with server prices | Authenticated |
| `POST` | `/add-to-cart` | Add dish to cart with quantity | Authenticated |
| `PUT` | `/cart/update` | Update item quantity in cart | Authenticated |
| `DELETE`| `/cart/item/:id`| Remove specific item from cart | Authenticated |
| `DELETE`| `/cart/clear` | Clear active cart | Authenticated |
| `POST` | `/cart/coupon` | Apply promo code to cart | Authenticated |
| `POST` | `/checkout` | Place transactional order | Authenticated |
| `GET` | `/history` | View customer order history | Authenticated |
| `GET` | `/track/:id` | Get real order status & timeline | Authenticated |
| `GET` | `/:id/billing` | Order billing breakdown & invoice | Authenticated |
| `POST` | `/cancel/:id` | Cancel order (Pending/Confirmed only) | Authenticated |
| `POST` | `/reorder/:id` | Reorder past dishes at current prices | Authenticated |
| `PUT` | `/update/:id` | Advance delivery status through state machine | Admin |

### 🏷️ Coupons & Promos (`/api/coupons`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/active` | Active promotional coupons | Public |
| `POST` | `/validate` | Validate promo code against subtotal | Public |
| `GET` | `/admin` | List all promotions | Admin |
| `POST` | `/admin` | Create new promotional coupon | Admin |
| `PATCH`| `/admin/:code/toggle` | Activate or deactivate promo | Admin |
| `DELETE`| `/admin/:code` | Delete coupon code | Admin |

### 📍 Addresses (`/api/addresses`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Fetch user's saved addresses | Authenticated |
| `POST` | `/` | Save new delivery address | Authenticated |
| `PUT` | `/:id` | Update address details | Authenticated |
| `DELETE`| `/:id` | Delete address (ownership validated) | Authenticated |
| `PATCH`| `/:id/default` | Set address as primary default | Authenticated |

### 💡 Discovery & Recommendations (`/api/recommendations`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/popular` | Top ordered dishes (`SUM(oi.quantity)`) | Public |
| `GET` | `/for-you` | Personalized dishes from past orders & favs | Authenticated |
| `GET` | `/pairs/:id` | Frequently bought together pairings | Public |
| `GET` | `/similar/:id`| Similar dishes in same category | Public |

### 📊 Admin Analytics (`/api/admin`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/stats` | Live revenue, orders, and sales stats | Admin |
| `GET` | `/order/:id` | Detailed order inspection | Admin |

---

## 🔒 Security Best Practices

* **Zero Trust for Client Pricing:** Prices and order subtotals are fetched and calculated directly from the database during checkout.
* **IDOR Prevention:** All address and order routes verify caller identity against database ownership before returning or mutating records.
* **SQL Injection Protection:** All queries use parameterized prepared statements.
* **Password Hashing:** Passwords are encrypted with bcrypt (10 salt rounds); password hashes are never exposed in user responses.
* **Role-Based Protection:** Admin endpoints enforce `role === 'admin'` server-side.

---

## 🧪 Automated Testing

The repository includes a comprehensive 9-suite automated verification script covering authentication, RBAC, menu CRUD, cart persistence, address ownership, and transactional order lifecycles:

```bash
node backend/test.js
```

**Results:**
```
======================================================
🏁 TEST EXECUTION COMPLETE: 50 PASSED, 0 FAILED
======================================================
```

---

## 📜 License

This project is licensed under the **MIT License**.

