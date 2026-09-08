import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase } from './db.js';
import { registerSSEClient, broadcastEvent } from './services/events.js';
import { calculateCart, executeCheckout } from './services/billing.js';
import { TelegramStoreAssistant } from './services/telegramAgent.js';
import { hashPassword, verifyPassword, createSession, authenticateToken, requireRole } from './services/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema & seeds
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;
const STORE_ID = 'store-nebula-main';

app.use(cors());
app.use(express.json());

// Global Auth Middleware
app.use(authenticateToken);

// Serve generated PDF invoices
const INVOICES_DIR = path.join(__dirname, '..', 'data', 'invoices');
app.use('/invoices', express.static(INVOICES_DIR));

// Real-Time Server-Sent Events
app.get('/events', (req, res) => {
  registerSSEClient(res);
});

// Telegram Assistant Engine Instance
const telegramAssistant = new TelegramStoreAssistant(STORE_ID);

/* =========================================================================
   AUTHENTICATION & SESSION API (RULE 4 COMPLIANT)
========================================================================= */
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, email, phone, password, name } = req.body;

    if (!email || !password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Valid email and a password of at least 6 characters are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username ? username.trim().toLowerCase() : cleanEmail.split('@')[0];

    // Check existing
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(cleanEmail, cleanUsername);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email address or username already exists.' });
    }

    const userId = 'user-cust-' + Date.now();
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, store_id, username, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?, ?, 'CUSTOMER')
    `).run(userId, STORE_ID, cleanUsername, cleanEmail, phone || null, passwordHash);

    // Create Customer profile if phone or name provided
    db.prepare(`
      INSERT INTO customers (id, store_id, name, phone)
      VALUES (?, ?, ?, ?)
    `).run('cust-' + Date.now(), STORE_ID, name || cleanUsername, phone || `+91 ${Math.floor(1000000000 + Math.random() * 9000000000)}`);

    const sessionId = createSession(userId, req.headers['user-agent'] || 'Web Client', req.ip);

    // Welcome Notification
    db.prepare(`
      INSERT INTO notifications (id, store_id, user_id, category, title, message, severity)
      VALUES (?, ?, ?, 'WELCOME', 'Welcome to Nebula Supermarket!', ?, 'INFO')
    `).run('notif-' + Date.now(), STORE_ID, userId, `Hi ${name || cleanUsername}, your account has been created successfully. Happy shopping!`);

    res.json({
      success: true,
      message: 'Account created successfully!',
      token: sessionId,
      user: {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        phone,
        role: 'CUSTOMER',
        storeId: STORE_ID
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { identity, password } = req.body;
    if (!identity || !password) {
      return res.status(400).json({ success: false, error: 'Please enter your email/username and password.' });
    }

    const cleanIdentity = identity.trim().toLowerCase();
    const user = db.prepare(`
      SELECT * FROM users 
      WHERE (LOWER(email) = ? OR LOWER(username) = ? OR phone = ?) AND is_active = 1
    `).get(cleanIdentity, cleanIdentity, identity.trim());

    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid email/phone or password.' });
    }

    const sessionId = createSession(user.id, req.headers['user-agent'] || 'Web Client', req.ip);

    res.json({
      success: true,
      message: `Welcome back, ${user.username}!`,
      token: sessionId,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        storeId: user.store_id
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  res.json({ success: true, authenticated: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  try {
    if (req.user && req.user.sessionId) {
      db.prepare('UPDATE user_sessions SET is_revoked = 1 WHERE id = ?').run(req.user.sessionId);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   ADDRESS MANAGEMENT API
========================================================================= */
app.get('/api/addresses', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC').all(req.user.id);
    res.json({ success: true, addresses: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/addresses', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { name, phone, addressLine1, addressLine2, city, state, pincode, landmark, addressType, isDefault } = req.body;

    if (!name || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({ success: false, error: 'Name, phone, address line 1, city, state and pincode are required.' });
    }

    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    }

    const addrId = 'addr-' + Date.now();
    db.prepare(`
      INSERT INTO addresses (id, user_id, name, phone, address_line1, address_line2, city, state, pincode, landmark, address_type, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(addrId, req.user.id, name, phone, addressLine1, addressLine2 || null, city, state, pincode, landmark || null, addressType || 'HOME', isDefault ? 1 : 0);

    const newAddr = db.prepare('SELECT * FROM addresses WHERE id = ?').get(addrId);
    res.json({ success: true, address: newAddr });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/addresses/:id', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   WISHLIST API
========================================================================= */
app.get('/api/wishlist', (req, res) => {
  try {
    if (!req.user) return res.json({ success: true, wishlist: [] });
    const rows = db.prepare(`
      SELECT w.*, p.name, p.brand, p.selling_price, p.mrp, p.unit, p.pack_size, p.image_url, p.rating, p.stock_quantity
      FROM wishlists w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?
    `).all(req.user.id);
    res.json({ success: true, wishlist: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/wishlist/toggle', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Please sign in to add products to your wishlist.' });
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, error: 'productId is required' });

    const existing = db.prepare('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
    if (existing) {
      db.prepare('DELETE FROM wishlists WHERE id = ?').run(existing.id);
      return res.json({ success: true, added: false, message: 'Removed from wishlist' });
    } else {
      const wishId = 'wish-' + Date.now();
      db.prepare('INSERT INTO wishlists (id, user_id, product_id) VALUES (?, ?, ?)').run(wishId, req.user.id, productId);
      return res.json({ success: true, added: true, message: 'Added to wishlist' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   PRODUCTS & CATALOG API (ENHANCED SEARCH, SORT, CATEGORIES)
========================================================================= */
app.get('/api/products', (req, res) => {
  try {
    const { search, category, sort, featured, deal, role } = req.query;
    const userRole = req.user ? req.user.role : (role || 'CUSTOMER');

    let query = 'SELECT * FROM products WHERE store_id = ? AND is_active = 1';
    const params = [STORE_ID];

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (featured === 'true' || featured === '1') {
      query += ' AND is_featured = 1';
    }

    if (deal === 'true' || deal === '1') {
      query += ' AND is_deal = 1';
    }

    let rows = db.prepare(query).all(...params);

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (sort === 'price_asc') {
      rows.sort((a, b) => a.selling_price - b.selling_price);
    } else if (sort === 'price_desc') {
      rows.sort((a, b) => b.selling_price - a.selling_price);
    } else if (sort === 'rating') {
      rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'discount') {
      rows.sort((a, b) => ((b.mrp - b.selling_price) / b.mrp) - ((a.mrp - a.selling_price) / a.mrp));
    } else if (sort === 'popularity') {
      rows.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    }

    // Role-based masking: cost_price masked unless OWNER
    const sanitized = rows.map(p => {
      const copy = { ...p };
      if (userRole !== 'OWNER') {
        delete copy.cost_price;
      }
      return copy;
    });

    res.json({ success: true, count: sanitized.length, products: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT category FROM products WHERE store_id = ? ORDER BY category ASC').all(STORE_ID);
    res.json({ success: true, categories: rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found' });

    if (!req.user || req.user.role !== 'OWNER') {
      delete prod.cost_price;
    }

    const related = db.prepare(`
      SELECT * FROM products 
      WHERE store_id = ? AND category = ? AND id != ? AND is_active = 1 
      LIMIT 4
    `).all(STORE_ID, prod.category, prod.id);

    res.json({ success: true, product: prod, related });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/products/receive-stock', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const { productId, quantity, costPrice, supplierRef, notes } = req.body;
    const qty = Number(quantity);
    if (!productId || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Valid productId and positive quantity are required.' });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, STORE_ID);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found.' });

    const prevStock = prod.stock_quantity;
    const newStock = prevStock + qty;

    db.prepare('UPDATE products SET stock_quantity = ?, cost_price = COALESCE(?, cost_price), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStock, costPrice ? Number(costPrice) : null, prod.id);

    db.prepare(`
      INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, unit_cost_price, notes)
      VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?, ?)
    `).run('mov-' + Date.now(), prod.id, qty, prevStock, newStock, costPrice || prod.cost_price, notes || `Stock received from ${supplierRef || 'Supplier'}`);

    broadcastEvent('INVENTORY_UPDATED', { productId: prod.id, resultingStock: newStock });

    res.json({ success: true, message: `Received ${qty} units of ${prod.name}. New stock: ${newStock}`, product: prod });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   BILLING, CART, CHECKOUT & ORDERS API
========================================================================= */
app.post('/api/billing/calculate', (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.json({
        success: true,
        calculation: {
          items: [],
          subtotal: 0,
          discount_total: 0,
          taxable_amount: 0,
          cgst_amount: 0,
          sgst_amount: 0,
          total_tax: 0,
          grand_total: 0
        }
      });
    }

    const calc = calculateCart(items, STORE_ID);
    res.json({ success: true, calculation: calc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/billing/checkout', async (req, res) => {
  try {
    const { items, paymentMethod, customerId, addressId, paymentReference } = req.body;
    const userId = req.user ? req.user.id : null;

    const result = await executeCheckout({
      storeId: STORE_ID,
      userId: userId || 'user-customer-1',
      customerId,
      addressId,
      channel: 'WEB_APP',
      items,
      paymentMethod: paymentMethod || 'DEMO_PAYMENT',
      paymentReference
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Customer My Orders
app.get('/api/orders/my-orders', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const sales = db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count,
             a.address_line1, a.city, a.pincode
      FROM sales s
      LEFT JOIN addresses a ON s.address_id = a.id
      WHERE s.user_id = ? OR s.customer_id = (SELECT id FROM customers WHERE phone = ? LIMIT 1)
      ORDER BY s.created_at DESC
    `).all(req.user.id, req.user.phone || '');

    res.json({ success: true, orders: sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin / Staff Orders List
app.get('/api/billing/orders', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone,
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count,
             (SELECT payment_method FROM payment_records WHERE sale_id = s.id LIMIT 1) as payment_method_rec
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.store_id = ?
      ORDER BY s.created_at DESC
    `).all(STORE_ID);

    res.json({ success: true, orders: sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/billing/orders/:id', (req, res) => {
  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!sale) return res.status(404).json({ success: false, error: 'Order not found' });

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
    const payment = db.prepare('SELECT * FROM payment_records WHERE sale_id = ?').get(sale.id);
    const customer = sale.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id) : null;
    const address = sale.address_id ? db.prepare('SELECT * FROM addresses WHERE id = ?').get(sale.address_id) : null;

    res.json({ success: true, sale, items, payment, customer, address });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Order Status Update (Admin / Staff)
app.post('/api/orders/:id/update-status', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const { orderStatus } = req.body;
    const validStatuses = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid order status' });
    }

    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!sale) return res.status(404).json({ success: false, error: 'Order not found' });

    db.prepare('UPDATE sales SET order_status = ? WHERE id = ?').run(orderStatus, sale.id);

    // Notify Customer
    if (sale.user_id) {
      db.prepare(`
        INSERT INTO notifications (id, store_id, user_id, category, title, message, severity)
        VALUES (?, ?, ?, 'ORDER_STATUS', ?, ?, 'INFO')
      `).run('notif-' + Date.now(), STORE_ID, sale.user_id, `Order Status Update: ${sale.invoice_number}`, `Your order status has been updated to ${orderStatus.replace('_', ' ')}.`);
    }

    broadcastEvent('ORDER_STATUS_CHANGED', { saleId: sale.id, invoiceNumber: sale.invoice_number, orderStatus });

    res.json({ success: true, message: `Order status updated to ${orderStatus}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   CUSTOMERS & KHATA LEDGER API
========================================================================= */
app.get('/api/khata/customers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM customers WHERE store_id = ? ORDER BY current_balance DESC').all(STORE_ID);
    res.json({ success: true, customers: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/khata/repayment', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const { customerId, amount, paymentMethod = 'UPI', notes } = req.body;
    const numAmount = Number(amount);
    if (!customerId || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid customerId and positive amount are required.' });
    }

    const cust = db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(customerId, STORE_ID);
    if (!cust) return res.status(404).json({ success: false, error: 'Customer not found.' });

    const balanceBefore = cust.current_balance;
    const balanceAfter = Math.max(0, balanceBefore - numAmount);

    db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balanceAfter, cust.id);

    db.prepare(`
      INSERT INTO khata_transactions (id, customer_id, store_id, transaction_type, amount, balance_before, balance_after, payment_method, notes)
      VALUES (?, ?, ?, 'PAYMENT_RECEIVED', ?, ?, ?, ?, ?)
    `).run('khata-pay-' + Date.now(), cust.id, STORE_ID, numAmount, balanceBefore, balanceAfter, paymentMethod, notes || 'Repayment recorded at store counter');

    broadcastEvent('KHATA_UPDATED', { customerId: cust.id, name: cust.name, balanceAfter });

    res.json({
      success: true,
      message: `Recorded repayment of ₹${numAmount.toFixed(2)} for ${cust.name}. Remaining balance: ₹${balanceAfter.toFixed(2)}`,
      customer: { ...cust, current_balance: balanceAfter }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   OFFERS API
========================================================================= */
app.get('/api/offers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM offers WHERE store_id = ? AND is_active = 1').all(STORE_ID);
    res.json({ success: true, offers: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   NOTIFICATIONS API (IN-APP SYSTEM)
========================================================================= */
app.get('/api/notifications', (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    let query = 'SELECT * FROM notifications WHERE store_id = ?';
    const params = [STORE_ID];

    if (userId) {
      query += ' AND (user_id IS NULL OR user_id = ?)';
      params.push(userId);
    } else {
      query += ' AND user_id IS NULL';
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const rows = db.prepare(query).all(...params);
    const unreadCount = rows.filter(n => !n.is_read).length;

    res.json({ success: true, notifications: rows, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications/mark-read', (req, res) => {
  try {
    const { id } = req.body;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND store_id = ?').run(id, STORE_ID);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications/mark-all-read', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE store_id = ?').run(STORE_ID);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   DASHBOARD & ANALYTICS API (STRICT ZERO-FABRICATION)
========================================================================= */
app.get('/api/analytics/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todaySales = db.prepare(`
      SELECT COUNT(*) as bills_count, 
             COALESCE(SUM(grand_total), 0) as total_revenue,
             COALESCE(SUM(total_tax), 0) as total_tax
      FROM sales 
      WHERE store_id = ? AND DATE(created_at) = DATE(?)
    `).get(STORE_ID, today);

    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM products 
      WHERE store_id = ? AND is_active = 1 AND stock_quantity <= reorder_level
    `).get(STORE_ID).count;

    const totalKhataBalance = db.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total FROM customers WHERE store_id = ?
    `).get(STORE_ID).total;

    const recentOrders = db.prepare(`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.store_id = ?
      ORDER BY s.created_at DESC LIMIT 5
    `).all(STORE_ID);

    const lowStockItems = db.prepare(`
      SELECT id, name, pack_size, unit, stock_quantity, reorder_level
      FROM products
      WHERE store_id = ? AND is_active = 1 AND stock_quantity <= reorder_level
      ORDER BY stock_quantity ASC LIMIT 5
    `).all(STORE_ID);

    res.json({
      success: true,
      hasSalesToday: todaySales.bills_count > 0,
      todaySales: {
        billsCount: todaySales.bills_count,
        totalRevenue: todaySales.total_revenue,
        totalTax: todaySales.total_tax,
        emptyStateMessage: todaySales.bills_count === 0 ? 'No sales recorded today.' : null
      },
      lowStockCount,
      lowStockItems,
      totalKhataBalance,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   TELEGRAM AI ASSISTANT API
========================================================================= */
app.post('/api/telegram/message', async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user ? req.user.id : 'user-owner-1';
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const response = await telegramAssistant.processMessage(userId, message);
    res.json({ success: true, ...response });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Nebula Supermarket Backend running on port ${PORT}`);
  console.log(`📡 Real-time SSE stream available at http://localhost:${PORT}/events`);
  console.log(`📄 Invoices stored and served at http://localhost:${PORT}/invoices/`);
});
