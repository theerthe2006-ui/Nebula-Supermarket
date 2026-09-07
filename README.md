# 🚀 NEBULA SUPERMARKET PLATFORM
## Modern Full-Stack E-Commerce & AI Dual-Interface Supermarket Platform

---

## 🌟 Executive Project Overview

**Nebula Supermarket** is a responsive, full-stack e-commerce and supermarket operations platform built for modern web standards. Inspired by the usability, visual clarity, and responsiveness of major retail platforms (Amazon, Flipkart), Nebula provides a dual-interface architecture:

1. **Consumer Supermarket Storefront (PWA):** A modern e-commerce shopping experience featuring 50+ products across 20+ supermarket categories, live search, dynamic category filtering, sorting, wishlist management, multi-step checkout with address management, DEMO payment verification, order tracking stepper, and PDF invoice generation.
2. **Store Owner & Operations Portal:** A real-time POS dashboard with 16-step atomic inventory transaction control, low-stock alerts, customer credit ledgers (Khata), GST tax accounting, and an interactive **Telegram AI Agent Console**.

---

## 🔑 Key Architectural Features & Rules

- **Authentication & Security (Rule 4):** Salt-based `scrypt` password hashing, session tokens (`user_sessions`), and role-based access control (`CUSTOMER`, `STAFF`, `OWNER`) with protected routes.
- **Truth-in-Payment Honesty (Rule 3):** Explicit payment state verification machine with a clearly labelled **DEMO PAYMENT MODE** ("Demo payment — no real money is charged") when real gateways are unconfigured.
- **Strict Zero Fabrication (Rule 2):** Real relational SQLite database backend (`node:sqlite`). No fake statistics or hardcoded mock totals.
- **Comprehensive Product Catalog:** 50+ items across 20+ categories (Fruits & Vegetables, Dairy, Bakery, Rice & Atta, Pulses, Cooking Oils, Spices, Snacks, Biscuits, Chocolates, Beverages, Tea & Coffee, Instant Foods, Frozen Foods, Personal Care, Baby Care, Cleaning, Pet Care).
- **Atomic Stock Control:** Row-level stock locking prevents overselling, decrements stock atomically on checkout, and triggers real-time SSE low-stock notifications.
- **PDF Tax Invoices:** Automatic sequential GST invoice generation (`INV-2026-XXXX`) using `pdfkit`.

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite 6, Tailwind CSS 3, Lucide React icons.
- **Backend:** Node.js 22, Express 4, Server-Sent Events (SSE).
- **Database Engine:** `node:sqlite` (Node 22 native built-in SQLite database at `data/supermarket.db`).
- **Document Engine:** PDFKit for GST invoice generation.

---

## 📁 Repository Directory Structure

```
Nebula__supermarket/
├── data/                      # Database & generated PDF storage
│   ├── supermarket.db         # SQLite database file
│   └── invoices/              # Generated PDF Tax Invoices
├── public/                    # Static assets & fallbacks
│   ├── logo.svg
│   └── assets/placeholder.svg # High quality SVG fallback
├── server/                    # Express backend
│   ├── db.js                  # Database schema & 50+ item catalog seed
│   ├── index.js               # REST API endpoints & SSE broadcast
│   └── services/
│       ├── auth.js            # Scrypt password hashing & session auth
│       ├── billing.js         # 16-step atomic checkout transaction logic
│       ├── events.js          # Real-time SSE event stream
│       ├── pdfInvoice.js      # PDFKit GST invoice generator
│       └── telegramAgent.js   # Telegram AI Store Assistant simulation engine
├── src/                       # React 18 Frontend
│   ├── components/
│   │   ├── AccountDashboard.jsx   # Profile, saved addresses, order tracking & wishlist
│   │   ├── AuthModal.jsx          # Sign In & Create Account modal
│   │   ├── CartDrawer.jsx         # Slide-over cart calculation drawer
│   │   ├── CheckoutModal.jsx      # Multi-step checkout & DEMO payment machine
│   │   ├── MobileNav.jsx          # Responsive mobile navigation
│   │   ├── Navbar.jsx             # Top bar, location picker & search
│   │   ├── NotificationCenter.jsx # In-app notification center
│   │   ├── ProductCard.jsx        # Product grid card with quantity & wishlist
│   │   ├── ProductDetailModal.jsx # Dedicated product view & specs
│   │   ├── Sidebar.jsx            # Desktop ops navigation
│   │   ├── Storefront.jsx         # Hero banner, deals & catalog grid
│   │   └── TelegramConsole.jsx    # Interactive AI Store Assistant console
│   ├── App.jsx                # Main application controller & state orchestrator
│   ├── index.css              # Tailwind styling
│   └── main.jsx               # Entrypoint
├── .env.example               # Environment variables template
├── package.json
└── vite.config.js
```

---

## ⚡ Quick Start & Setup Instructions

### 1. Prerequisites
- Node.js 22+ (Required for native `node:sqlite` module support)
- npm 9+

### 2. Installation
```bash
npm install
```

### 3. Development Server
To launch both backend (Express on port 5000) and frontend (Vite on port 5173) concurrently:
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### 4. Production Build & Verification
```bash
npm run build
npm run preview
```

---

## 🔐 Demo Credentials (FOR TEST/DEMO USE ONLY)

| Role | Username / Email | Password | Purpose |
|---|---|---|---|
| **Demo Customer** | `customer@nebulamarket.local` | `Nebula123!` | Test storefront, wishlist, address & checkout |
| **Store Owner** | `owner@nebulamarket.local` | `Nebula123!` | Access operations portal, stock & AI console |
| **Store Staff** | `staff@nebulamarket.local` | `Nebula123!` | Limited operations & POS access |

---

## 📄 License & Compliance

Developed for academic submission. Designed for zero third-party branding infringement and project portability across Windows, macOS, and Linux platforms.
