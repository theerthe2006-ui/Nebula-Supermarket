import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env configuration if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    console.warn('Note: .env file loading skipped:', e.message);
  }
}

import { db, initDatabase } from './db.js';
import { registerSSEClient, broadcastEvent } from './services/events.js';
import { calculateCart, executeCheckout } from './services/billing.js';
import { TelegramStoreAssistant } from './services/telegramAgent.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  authenticateToken,
  requireAuth,
  requireRole,
  signJwt
} from './services/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema & seeds
initDatabase();

export const app = express();
const PORT = process.env.PORT || 5000;
const STORE_ID = 'store-nebula-main';

const clientUrl = process.env.CLIENT_URL;
app.use(cors({
  origin: clientUrl ? (clientUrl.includes(',') ? clientUrl.split(',').map(s => s.trim()) : clientUrl) : true,
  credentials: true
}));
app.use(express.json());

// Global Auth Middleware (populates req.user if valid token/session present)
app.use(authenticateToken);

// Health & System Status Endpoint
app.get('/api/health', (req, res) => {
  try {
    const store = db.prepare('SELECT name, legal_name, gstin FROM stores WHERE id = ?').get(STORE_ID);
    const prodCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE store_id = ? AND is_active = 1').get(STORE_ID).count;
    res.json({
      success: true,
      status: 'UP',
      service: 'Nebula Supermarket API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'SQLite (node:sqlite)',
      store: store ? store.name : 'Nebula Supermarket',
      activeProducts: prodCount
    });
  } catch (err) {
    res.status(500).json({ success: false, status: 'DOWN', error: err.message });
  }
});

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
   AUTHENTICATION & PROFILE API (JWT + SESSIONS + RBAC)
========================================================================= */
const handleSignup = (req, res) => {
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
      ON CONFLICT(phone) DO UPDATE SET name = excluded.name
    `).run('cust-' + Date.now(), STORE_ID, name || cleanUsername, phone || `+91 ${Math.floor(1000000000 + Math.random() * 9000000000)}`);

    // Create JWT Token
    const jwtToken = signJwt({
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      role: 'CUSTOMER',
      storeId: STORE_ID
    });

    // Also register session for active session tracking / audit
    createSession(userId, req.headers['user-agent'] || 'Web Client', req.ip);

    // Welcome Notification
    db.prepare(`
      INSERT INTO notifications (id, store_id, user_id, category, title, message, severity)
      VALUES (?, ?, ?, 'WELCOME', 'Welcome to Nebula Supermarket!', ?, 'INFO')
    `).run('notif-' + Date.now(), STORE_ID, userId, `Hi ${name || cleanUsername}, your account has been created successfully. Happy shopping!`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token: jwtToken,
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
};

app.post('/api/auth/signup', handleSignup);
app.post('/api/auth/register', handleSignup);

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

    const jwtToken = signJwt({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      storeId: user.store_id
    });

    // Also register session
    createSession(user.id, req.headers['user-agent'] || 'Web Client', req.ip);

    res.json({
      success: true,
      message: `Welcome back, ${user.username}!`,
      token: jwtToken,
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

const handleGetProfile = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, authenticated: false, error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT id, store_id, username, email, phone, role, is_active, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      storeId: user.store_id,
      createdAt: user.created_at
    }
  });
};

app.get('/api/auth/me', handleGetProfile);
app.get('/api/users/profile', handleGetProfile);
app.get('/api/users/me', handleGetProfile);

const handleUpdateProfile = (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { username, phone, currentPassword, newPassword } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    let updatedUsername = user.username;
    let updatedPhone = user.phone;
    let updatedHash = user.password_hash;

    if (username && username.trim() !== user.username) {
      const cleanUsername = username.trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, user.id);
      if (existing) {
        return res.status(409).json({ success: false, error: 'Username is already in use.' });
      }
      updatedUsername = cleanUsername;
    }

    if (phone !== undefined) {
      updatedPhone = phone ? phone.trim() : null;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'Current password is required to change password.' });
      }
      if (!verifyPassword(currentPassword, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Current password does not match.' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
      }
      updatedHash = hashPassword(newPassword);
    }

    db.prepare(`
      UPDATE users 
      SET username = ?, phone = ?, password_hash = ?
      WHERE id = ?
    `).run(updatedUsername, updatedPhone, updatedHash, user.id);

    const updated = db.prepare('SELECT id, store_id, username, email, phone, role, created_at FROM users WHERE id = ?').get(user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        storeId: updated.store_id,
        createdAt: updated.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.put('/api/auth/profile', handleUpdateProfile);
app.put('/api/users/profile', handleUpdateProfile);

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

app.put('/api/addresses/:id', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Address not found.' });

    const { name, phone, addressLine1, addressLine2, city, state, pincode, landmark, addressType, isDefault } = req.body;

    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    }

    db.prepare(`
      UPDATE addresses
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          address_line1 = COALESCE(?, address_line1),
          address_line2 = COALESCE(?, address_line2),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          pincode = COALESCE(?, pincode),
          landmark = COALESCE(?, landmark),
          address_type = COALESCE(?, address_type),
          is_default = CASE WHEN ? IS NOT NULL THEN ? ELSE is_default END
      WHERE id = ? AND user_id = ?
    `).run(
      name || null,
      phone || null,
      addressLine1 || null,
      addressLine2 !== undefined ? addressLine2 : null,
      city || null,
      state || null,
      pincode || null,
      landmark !== undefined ? landmark : null,
      addressType || null,
      isDefault !== undefined ? (isDefault ? 1 : 0) : null,
      isDefault !== undefined ? (isDefault ? 1 : 0) : null,
      req.params.id,
      req.user.id
    );

    const updated = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Address updated successfully', address: updated });
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

// Create Product (Admin / Staff)
app.post('/api/products', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const {
      name, brand, category, description, unit, packSize, pack_size,
      costPrice, cost_price, mrp, sellingPrice, selling_price,
      gstRate, gst_rate, hsnCode, hsn_code, stockQuantity, stock_quantity,
      reorderLevel, reorder_level, imageUrl, image_url, sku, barcode,
      isFeatured, is_featured, isDeal, is_deal
    } = req.body;

    const finalPackSize = packSize || pack_size;
    const finalCostPrice = costPrice !== undefined ? Number(costPrice) : (cost_price !== undefined ? Number(cost_price) : 0);
    const finalMrp = Number(mrp);
    const finalSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : Number(selling_price);
    const finalGstRate = gstRate !== undefined ? Number(gstRate) : (gst_rate !== undefined ? Number(gst_rate) : 0);
    const finalHsnCode = hsnCode || hsn_code || '00000000';
    const finalStock = stockQuantity !== undefined ? Number(stockQuantity) : (stock_quantity !== undefined ? Number(stock_quantity) : 0);
    const finalReorder = reorderLevel !== undefined ? Number(reorderLevel) : (reorder_level !== undefined ? Number(reorder_level) : 10);
    const finalImageUrl = imageUrl || image_url || null;

    if (!name || !brand || !category || !unit || !finalPackSize || isNaN(finalMrp) || isNaN(finalSellingPrice)) {
      return res.status(400).json({
        success: false,
        error: 'Product name, brand, category, unit, pack size, MRP, and selling price are required.'
      });
    }

    if (finalMrp <= 0 || finalSellingPrice <= 0) {
      return res.status(400).json({ success: false, error: 'MRP and selling price must be greater than zero.' });
    }

    if (finalSellingPrice > finalMrp) {
      return res.status(400).json({ success: false, error: 'Selling price cannot exceed MRP.' });
    }

    const prodId = 'prod-' + Date.now();
    const finalSku = sku || ('SKU-' + Date.now().toString(36).toUpperCase());

    const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(finalSku);
    if (existingSku) {
      return res.status(409).json({ success: false, error: `Product with SKU ${finalSku} already exists.` });
    }

    db.prepare(`
      INSERT INTO products (
        id, store_id, sku, barcode, name, brand, category, description,
        image_url, unit, pack_size, cost_price, mrp, selling_price, gst_rate,
        hsn_code, stock_quantity, reorder_level, is_featured, is_deal, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      prodId, STORE_ID, finalSku, barcode || null, name.trim(), brand.trim(), category.trim(),
      description || null, finalImageUrl, unit.trim(), finalPackSize.trim(),
      finalCostPrice, finalMrp, finalSellingPrice, finalGstRate, finalHsnCode,
      finalStock, finalReorder,
      (isFeatured || is_featured) ? 1 : 0,
      (isDeal || is_deal) ? 1 : 0
    );

    if (finalStock > 0) {
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, unit_cost_price, notes)
        VALUES (?, ?, 'RECEIPT', ?, 0, ?, ?, 'Initial inventory stocking')
      `).run('mov-' + Date.now(), prodId, finalStock, finalStock, finalCostPrice);
    }

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    broadcastEvent('INVENTORY_UPDATED', { productId: prodId, action: 'CREATED', name: created.name });

    res.status(201).json({ success: true, message: 'Product created successfully', product: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Product (Admin / Staff)
app.put('/api/products/:id', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found.' });

    const {
      name, brand, category, description, unit, packSize, pack_size,
      costPrice, cost_price, mrp, sellingPrice, selling_price,
      gstRate, gst_rate, hsnCode, hsn_code, stockQuantity, stock_quantity,
      reorderLevel, reorder_level, imageUrl, image_url,
      isFeatured, is_featured, isDeal, is_deal, isActive, is_active
    } = req.body;

    const newMrp = mrp !== undefined ? Number(mrp) : prod.mrp;
    const newSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : (selling_price !== undefined ? Number(selling_price) : prod.selling_price);

    if (newSellingPrice > newMrp) {
      return res.status(400).json({ success: false, error: 'Selling price cannot exceed MRP.' });
    }

    const newStock = stockQuantity !== undefined ? Number(stockQuantity) : (stock_quantity !== undefined ? Number(stock_quantity) : prod.stock_quantity);

    if (newStock !== prod.stock_quantity) {
      const delta = newStock - prod.stock_quantity;
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, unit_cost_price, notes)
        VALUES (?, ?, 'AUDIT_ADJUSTMENT', ?, ?, ?, ?, 'Stock adjusted via Admin product update')
      `).run('mov-' + Date.now(), prod.id, delta, prod.stock_quantity, newStock, prod.cost_price);
    }

    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        brand = COALESCE(?, brand),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        unit = COALESCE(?, unit),
        pack_size = COALESCE(?, pack_size),
        cost_price = CASE WHEN ? IS NOT NULL THEN ? ELSE cost_price END,
        mrp = COALESCE(?, mrp),
        selling_price = COALESCE(?, selling_price),
        gst_rate = CASE WHEN ? IS NOT NULL THEN ? ELSE gst_rate END,
        hsn_code = COALESCE(?, hsn_code),
        stock_quantity = COALESCE(?, stock_quantity),
        reorder_level = CASE WHEN ? IS NOT NULL THEN ? ELSE reorder_level END,
        image_url = CASE WHEN ? IS NOT NULL THEN ? ELSE image_url END,
        is_featured = CASE WHEN ? IS NOT NULL THEN ? ELSE is_featured END,
        is_deal = CASE WHEN ? IS NOT NULL THEN ? ELSE is_deal END,
        is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND store_id = ?
    `).run(
      name || null,
      brand || null,
      category || null,
      description !== undefined ? description : null,
      unit || null,
      (packSize || pack_size) || null,
      (costPrice !== undefined || cost_price !== undefined) ? 1 : null,
      costPrice !== undefined ? Number(costPrice) : (cost_price !== undefined ? Number(cost_price) : null),
      mrp !== undefined ? Number(mrp) : null,
      newSellingPrice,
      (gstRate !== undefined || gst_rate !== undefined) ? 1 : null,
      gstRate !== undefined ? Number(gstRate) : (gst_rate !== undefined ? Number(gst_rate) : null),
      (hsnCode || hsn_code) || null,
      newStock,
      (reorderLevel !== undefined || reorder_level !== undefined) ? 1 : null,
      reorderLevel !== undefined ? Number(reorderLevel) : (reorder_level !== undefined ? Number(reorder_level) : null),
      (imageUrl !== undefined || image_url !== undefined) ? 1 : null,
      imageUrl || image_url || null,
      (isFeatured !== undefined || is_featured !== undefined) ? 1 : null,
      (isFeatured ?? is_featured) ? 1 : 0,
      (isDeal !== undefined || is_deal !== undefined) ? 1 : null,
      (isDeal ?? is_deal) ? 1 : 0,
      (isActive !== undefined || is_active !== undefined) ? 1 : null,
      (isActive ?? is_active) ? 1 : 0,
      prod.id,
      STORE_ID
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(prod.id);
    broadcastEvent('INVENTORY_UPDATED', { productId: prod.id, action: 'UPDATED', name: updated.name });

    res.json({ success: true, message: 'Product updated successfully', product: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete / Deactivate Product (Admin: OWNER only)
app.delete('/api/products/:id', requireRole('OWNER'), (req, res) => {
  try {
    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found.' });

    db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(prod.id);
    broadcastEvent('INVENTORY_UPDATED', { productId: prod.id, action: 'DEACTIVATED', name: prod.name });

    res.json({ success: true, message: `Product "${prod.name}" deactivated successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================================================
   USER CART API (PERSISTENT CART SYSTEM - RULE & STEP 6 COMPLIANT)
========================================================================= */
function getUserCartData(userId) {
  let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
  if (!cart) {
    const cartId = 'cart-' + Date.now();
    db.prepare('INSERT INTO carts (id, user_id, store_id) VALUES (?, ?, ?)').run(cartId, userId, STORE_ID);
    cart = { id: cartId, user_id: userId, store_id: STORE_ID };
  }

  const items = db.prepare(`
    SELECT ci.id as item_id, ci.product_id, ci.quantity, ci.created_at,
           p.name, p.brand, p.category, p.unit, p.pack_size, p.mrp, p.selling_price,
           p.stock_quantity, p.image_url, p.is_active
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ?
    ORDER BY ci.created_at ASC
  `).all(cart.id);

  const activeItems = items.filter(i => i.is_active === 1);
  let calculation = {
    items: [],
    subtotal: 0,
    discount_total: 0,
    taxable_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    total_tax: 0,
    grand_total: 0
  };

  if (activeItems.length > 0) {
    try {
      calculation = calculateCart(activeItems.map(i => ({ productId: i.product_id, quantity: i.quantity })), STORE_ID);
    } catch (e) {}
  }

  return {
    cartId: cart.id,
    userId,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    calculation
  };
}

app.get('/api/cart', requireAuth, (req, res) => {
  try {
    const cartData = getUserCartData(req.user.id);
    res.json({ success: true, ...cartData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const handleAddToCart = (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const qty = Number(quantity);

    if (!productId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Valid productId and positive quantity are required.' });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, STORE_ID);
    if (!prod || !prod.is_active) {
      return res.status(404).json({ success: false, error: 'Product not found or unavailable.' });
    }

    let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(req.user.id);
    if (!cart) {
      const cartId = 'cart-' + Date.now();
      db.prepare('INSERT INTO carts (id, user_id, store_id) VALUES (?, ?, ?)').run(cartId, req.user.id, STORE_ID);
      cart = { id: cartId, user_id: req.user.id, store_id: STORE_ID };
    }

    const existingItem = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, prod.id);
    const newQty = existingItem ? existingItem.quantity + qty : qty;

    if (newQty > prod.stock_quantity) {
      return res.status(400).json({
        success: false,
        error: `Cannot add ${qty} unit(s). Requested total: ${newQty}, available stock: ${prod.stock_quantity}.`
      });
    }

    if (existingItem) {
      db.prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, existingItem.id);
    } else {
      const itemId = 'ci-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      db.prepare('INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (?, ?, ?, ?)').run(itemId, cart.id, prod.id, newQty);
    }

    const cartData = getUserCartData(req.user.id);
    res.json({
      success: true,
      message: `Added ${prod.name} to cart.`,
      ...cartData
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/cart', requireAuth, handleAddToCart);
app.post('/api/cart/items', requireAuth, handleAddToCart);

const handleUpdateCartQty = (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
    const qty = Number(quantity);

    if (!productId || isNaN(qty)) {
      return res.status(400).json({ success: false, error: 'Valid productId and numeric quantity are required.' });
    }

    const cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(req.user.id);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found.' });

    if (qty <= 0) {
      db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cart.id, productId);
      return res.json({ success: true, message: 'Item removed from cart.', ...getUserCartData(req.user.id) });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, STORE_ID);
    if (!prod || !prod.is_active) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    if (qty > prod.stock_quantity) {
      return res.status(400).json({
        success: false,
        error: `Requested quantity (${qty}) exceeds available stock (${prod.stock_quantity}).`
      });
    }

    db.prepare(`
      INSERT INTO cart_items (id, cart_id, product_id, quantity, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP
    `).run('ci-' + Date.now(), cart.id, productId, qty);

    res.json({ success: true, message: 'Cart quantity updated.', ...getUserCartData(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.put('/api/cart/:productId', requireAuth, handleUpdateCartQty);
app.put('/api/cart/items/:productId', requireAuth, handleUpdateCartQty);

const handleRemoveCartItem = (req, res) => {
  try {
    const { productId } = req.params;
    const cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(req.user.id);
    if (!cart) return res.json({ success: true, message: 'Item removed.', ...getUserCartData(req.user.id) });

    db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?').run(cart.id, productId);
    res.json({ success: true, message: 'Item removed from cart.', ...getUserCartData(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.delete('/api/cart/:productId', requireAuth, handleRemoveCartItem);
app.delete('/api/cart/items/:productId', requireAuth, handleRemoveCartItem);

app.delete('/api/cart', requireAuth, (req, res) => {
  try {
    const cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(req.user.id);
    if (cart) {
      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    }
    res.json({ success: true, message: 'Cart cleared successfully.', ...getUserCartData(req.user.id) });
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

const handleCheckoutExecution = async (req, res) => {
  try {
    const { items, paymentMethod, customerId, addressId, paymentReference } = req.body;
    let checkoutItems = items;

    // If items not provided or empty, check if authenticated user has items in database cart
    if ((!checkoutItems || checkoutItems.length === 0) && req.user) {
      const userCart = getUserCartData(req.user.id);
      if (userCart && userCart.items && userCart.items.length > 0) {
        checkoutItems = userCart.items
          .filter(i => i.is_active === 1)
          .map(i => ({ productId: i.product_id, quantity: i.quantity }));
      }
    }

    if (!checkoutItems || checkoutItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart cannot be empty for order creation.' });
    }

    const userId = req.user ? req.user.id : null;

    const result = await executeCheckout({
      storeId: STORE_ID,
      userId: userId || 'user-customer-1',
      customerId,
      addressId,
      channel: 'WEB_APP',
      items: checkoutItems,
      paymentMethod: paymentMethod || 'DEMO_PAYMENT',
      paymentReference
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

app.post('/api/billing/checkout', handleCheckoutExecution);
app.post('/api/orders', handleCheckoutExecution);

// Customer My Orders
app.get('/api/orders/my-orders', requireAuth, (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count,
             a.address_line1, a.city, a.pincode
      FROM sales s
      LEFT JOIN addresses a ON s.address_id = a.id
      WHERE s.user_id = ? OR (s.customer_id IS NOT NULL AND s.customer_id = (SELECT id FROM customers WHERE phone = ? LIMIT 1))
      ORDER BY s.created_at DESC
    `).all(req.user.id, req.user.phone || '');

    res.json({ success: true, orders: sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin / Staff Orders List
const handleGetOrdersList = (req, res) => {
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
};

app.get('/api/billing/orders', requireRole('OWNER', 'STAFF'), handleGetOrdersList);
app.get('/api/orders', requireRole('OWNER', 'STAFF'), handleGetOrdersList);

// Single Order Details
const handleGetSingleOrder = (req, res) => {
  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!sale) return res.status(404).json({ success: false, error: 'Order not found' });

    // Authorization check: if normal user, only allow if they own this order
    if (req.user && req.user.role === 'CUSTOMER') {
      if (sale.user_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied to this order.' });
      }
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
    const payment = db.prepare('SELECT * FROM payment_records WHERE sale_id = ?').get(sale.id);
    const customer = sale.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id) : null;
    const address = sale.address_id ? db.prepare('SELECT * FROM addresses WHERE id = ?').get(sale.address_id) : null;

    res.json({ success: true, sale, order: sale, items, payment, customer, address });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/billing/orders/:id', handleGetSingleOrder);
app.get('/api/orders/:id', handleGetSingleOrder);

// Order Status Update (Admin / Staff)
const handleUpdateOrderStatus = (req, res) => {
  try {
    const { orderStatus } = req.body;
    const validStatuses = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({ success: false, error: `Invalid order status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND store_id = ?').get(req.params.id, STORE_ID);
    if (!sale) return res.status(404).json({ success: false, error: 'Order not found' });

    db.prepare('UPDATE sales SET order_status = ? WHERE id = ?').run(orderStatus, sale.id);

    // Notify Customer
    if (sale.user_id) {
      db.prepare(`
        INSERT INTO notifications (id, store_id, user_id, category, title, message, severity)
        VALUES (?, ?, ?, 'ORDER_STATUS', ?, ?, 'INFO')
      `).run('notif-' + Date.now(), STORE_ID, sale.user_id, `Order Status Update: ${sale.invoice_number}`, `Your order status has been updated to ${orderStatus.replace(/_/g, ' ')}.`);
    }

    broadcastEvent('ORDER_STATUS_CHANGED', { saleId: sale.id, invoiceNumber: sale.invoice_number, orderStatus });

    res.json({ success: true, message: `Order status updated to ${orderStatus}`, orderStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/orders/:id/update-status', requireRole('OWNER', 'STAFF'), handleUpdateOrderStatus);
app.put('/api/orders/:id/status', requireRole('OWNER', 'STAFF'), handleUpdateOrderStatus);

/* =========================================================================
   ADMIN USER & INVENTORY MANAGEMENT API (STEP 8 COMPLIANT)
========================================================================= */
// Admin: List all registered users
app.get('/api/admin/users', requireRole('OWNER'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, store_id, username, email, phone, role, is_active, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Update user role / active status
app.put('/api/admin/users/:id/role', requireRole('OWNER'), (req, res) => {
  try {
    const { role, isActive } = req.body;
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found.' });

    if (role && !['CUSTOMER', 'STAFF', 'OWNER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Must be CUSTOMER, STAFF, or OWNER.' });
    }

    db.prepare(`
      UPDATE users
      SET role = COALESCE(?, role),
          is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END
      WHERE id = ?
    `).run(role || null, isActive !== undefined ? (isActive ? 1 : 0) : null, isActive !== undefined ? (isActive ? 1 : 0) : null, targetUser.id);

    const updated = db.prepare('SELECT id, store_id, username, email, phone, role, is_active FROM users WHERE id = ?').get(targetUser.id);
    res.json({ success: true, message: 'User updated successfully', user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: View stock movement logs
app.get('/api/admin/inventory/movements', requireRole('OWNER', 'STAFF'), (req, res) => {
  try {
    const movements = db.prepare(`
      SELECT sm.*, p.name as product_name, p.sku, p.unit, p.category
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      ORDER BY sm.created_at DESC
      LIMIT 100
    `).all();
    res.json({ success: true, count: movements.length, movements });
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

// 404 Handler for undefined API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `API endpoint ${req.method} ${req.originalUrl} not found.` });
});

// Centralized Error Handling Middleware (Rule & Step 9 Compliant)
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Server Error:', err);
  const status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Express Server
const isDirectRun = process.argv[1] && (path.resolve(process.argv[1]) === path.resolve(__filename));
if (isDirectRun) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Nebula Supermarket Backend running on port ${PORT}`);
    console.log(`📡 Real-time SSE stream available at http://localhost:${PORT}/events`);
    console.log(`📄 Invoices stored and served at http://localhost:${PORT}/invoices/`);
  });
}
