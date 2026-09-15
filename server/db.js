import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.join(DATA_DIR, 'supermarket.db');

const dbParentDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbParentDir)) {
  fs.mkdirSync(dbParentDir, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

// Initialize Tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legal_name TEXT,
      gstin TEXT,
      address_line1 TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      currency TEXT DEFAULT 'INR',
      invoice_prefix TEXT DEFAULT 'INV-2026-',
      invoice_counter INTEGER DEFAULT 1000,
      daily_close_time TEXT DEFAULT '21:00',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT,
      role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'OWNER', 'STAFF')),
      telegram_user_id INTEGER UNIQUE,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      landmark TEXT,
      address_type TEXT DEFAULT 'HOME' CHECK(address_type IN ('HOME', 'WORK', 'OTHER')),
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      unit TEXT NOT NULL,
      pack_size TEXT NOT NULL,
      cost_price REAL NOT NULL,
      mrp REAL NOT NULL,
      selling_price REAL NOT NULL,
      gst_rate REAL NOT NULL,
      hsn_code TEXT NOT NULL,
      stock_quantity REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 10,
      rating REAL DEFAULT 4.5,
      review_count INTEGER DEFAULT 128,
      is_featured INTEGER DEFAULT 0,
      is_deal INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('RECEIPT', 'SALE', 'SALE_RETURN', 'AUDIT_ADJUSTMENT')),
      quantity_delta REAL NOT NULL,
      previous_stock REAL NOT NULL,
      resulting_stock REAL NOT NULL,
      unit_cost_price REAL,
      reference_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      credit_limit REAL DEFAULT 5000.0,
      current_balance REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS khata_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('CREDIT_SALE', 'PAYMENT_RECEIVED', 'ADJUSTMENT')),
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_sale_id TEXT,
      payment_method TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      offer_type TEXT NOT NULL CHECK(offer_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'CART_DISCOUNT')),
      discount_value REAL NOT NULL,
      minimum_quantity REAL DEFAULT 1,
      minimum_cart_value REAL DEFAULT 0,
      applicable_product_ids TEXT,
      applicable_categories TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      user_id TEXT,
      address_id TEXT,
      channel TEXT NOT NULL CHECK(channel IN ('WEB_APP', 'TELEGRAM')),
      subtotal REAL NOT NULL,
      discount_total REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      total_tax REAL NOT NULL,
      grand_total REAL NOT NULL,
      payment_method TEXT,
      payment_status TEXT DEFAULT 'PAID' CHECK(payment_status IN ('UNPAID', 'PROCESSING', 'PAID', 'FAILED')),
      order_status TEXT DEFAULT 'PLACED' CHECK(order_status IN ('PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')),
      pdf_invoice_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_mrp REAL NOT NULL,
      unit_selling_price REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      taxable_value REAL NOT NULL,
      gst_rate REAL NOT NULL,
      cgst_amount REAL NOT NULL,
      sgst_amount REAL NOT NULL,
      total_amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_records (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'CARD', 'NET_BANKING', 'CREDIT', 'DEMO_PAYMENT')),
      amount REAL NOT NULL,
      recording_status TEXT NOT NULL DEFAULT 'RECORDED_UNVERIFIED',
      payment_reference TEXT,
      notes TEXT,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      user_id TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL')),
      related_resource_type TEXT,
      related_resource_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_info TEXT NOT NULL,
      ip_address TEXT,
      last_active TEXT DEFAULT CURRENT_TIMESTAMP,
      is_revoked INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS telegram_drafts (
      user_id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      store_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cart_id, product_id)
    );
  `);

  // Migration/Safety checks for columns and constraints
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(users)`).all();
    if (!tableInfo.some(col => col.name === 'password_hash')) {
      db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
    }
    // Test if CUSTOMER role insert works or if table needs recreation
    const testCust = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (testCust && testCust.sql && !testCust.sql.includes('CUSTOMER')) {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          store_id TEXT NOT NULL,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          password_hash TEXT,
          role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'OWNER', 'STAFF')),
          telegram_user_id INTEGER UNIQUE,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO users_new SELECT id, store_id, username, email, phone, NULL, role, telegram_user_id, is_active, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    }
  } catch (e) {}

  try {
    const saleInfo = db.prepare(`PRAGMA table_info(sales)`).all();
    if (!saleInfo.some(col => col.name === 'address_id')) {
      db.exec(`ALTER TABLE sales ADD COLUMN address_id TEXT`);
    }
    if (!saleInfo.some(col => col.name === 'user_id')) {
      db.exec(`ALTER TABLE sales ADD COLUMN user_id TEXT`);
    }
    if (!saleInfo.some(col => col.name === 'payment_status')) {
      db.exec(`ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'PAID'`);
    }
    if (!saleInfo.some(col => col.name === 'order_status')) {
      db.exec(`ALTER TABLE sales ADD COLUMN order_status TEXT DEFAULT 'PLACED'`);
    }
    if (!saleInfo.some(col => col.name === 'payment_method')) {
      db.exec(`ALTER TABLE sales ADD COLUMN payment_method TEXT`);
    }
    if (!saleInfo.some(col => col.name === 'status')) {
      db.exec(`ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'PAID_RECORDED'`);
    }
  } catch (e) {}

  try {
    const testPay = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_records'").get();
    if (testPay && testPay.sql && !testPay.sql.includes('DEMO_PAYMENT')) {
      db.exec(`
        CREATE TABLE payment_records_new (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL,
          payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'CARD', 'NET_BANKING', 'CREDIT', 'DEMO_PAYMENT')),
          amount REAL NOT NULL,
          recording_status TEXT NOT NULL DEFAULT 'RECORDED_UNVERIFIED',
          payment_reference TEXT,
          notes TEXT,
          recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO payment_records_new SELECT id, sale_id, payment_method, amount, recording_status, payment_reference, notes, recorded_at FROM payment_records;
        DROP TABLE payment_records;
        ALTER TABLE payment_records_new RENAME TO payment_records;
      `);
    }
  } catch (e) {}

  try {
    const prodInfo = db.prepare(`PRAGMA table_info(products)`).all();
    if (!prodInfo.some(col => col.name === 'rating')) {
      db.exec(`ALTER TABLE products ADD COLUMN rating REAL DEFAULT 4.5`);
    }
    if (!prodInfo.some(col => col.name === 'review_count')) {
      db.exec(`ALTER TABLE products ADD COLUMN review_count INTEGER DEFAULT 128`);
    }
    if (!prodInfo.some(col => col.name === 'is_featured')) {
      db.exec(`ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0`);
    }
    if (!prodInfo.some(col => col.name === 'is_deal')) {
      db.exec(`ALTER TABLE products ADD COLUMN is_deal INTEGER DEFAULT 0`);
    }
  } catch (e) {}

  try {
    const notifInfo = db.prepare(`PRAGMA table_info(notifications)`).all();
    if (!notifInfo.some(col => col.name === 'user_id')) {
      db.exec(`ALTER TABLE notifications ADD COLUMN user_id TEXT`);
    }
  } catch (e) {}

  // Check store existence and catalog completeness
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const storeCheck = db.prepare('SELECT id FROM stores LIMIT 1').get();
  if (!storeCheck || prodCount < 10) {
    seedInitialData();
  }
}

function seedInitialData() {
  const storeId = 'store-nebula-main';

  db.prepare(`
    INSERT OR IGNORE INTO stores (id, name, legal_name, gstin, address_line1, city, state, pincode, phone, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    storeId,
    'Nebula Supermarket',
    'Nebula Retail Enterprises Pvt Ltd',
    '29ABCDE1234F1Z5',
    'Shop 12-14, Commercial Plaza, Indiranagar 100ft Rd',
    'Bengaluru',
    'Karnataka',
    '560038',
    '+91 98765 43210',
    'support@nebulamarket.local'
  );

  // Users: Owner, Staff, and Demo Customer
  const defaultPasswordHash = hashPassword('Nebula123!');

  db.prepare(`
    INSERT OR REPLACE INTO users (id, store_id, username, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('user-owner-1', storeId, 'owner_ravi', 'owner@nebulamarket.local', '+91 98765 00001', defaultPasswordHash, 'OWNER');

  db.prepare(`
    INSERT OR REPLACE INTO users (id, store_id, username, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('user-staff-1', storeId, 'staff_arun', 'staff@nebulamarket.local', '+91 98765 00002', defaultPasswordHash, 'STAFF');

  db.prepare(`
    INSERT OR REPLACE INTO users (id, store_id, username, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('user-customer-1', storeId, 'demo_customer', 'customer@nebulamarket.local', '+91 98765 00003', defaultPasswordHash, 'CUSTOMER');

  // Default Address for Customer
  db.prepare(`
    INSERT OR REPLACE INTO addresses (id, user_id, name, phone, address_line1, address_line2, city, state, pincode, landmark, address_type, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'addr-1',
    'user-customer-1',
    'Rahul Verma',
    '+91 98765 00003',
    'Flat 402, Sunshine Apartments, 4th Main',
    'Indiranagar',
    'Bengaluru',
    'Karnataka',
    '560038',
    'Near Metro Station',
    'HOME',
    1
  );

  // 50+ Real Supermarket Products across 20+ categories
  const products = [
    // 1. Fruits & Vegetables
    {
      id: 'prod-apple-1kg',
      sku: 'FRU-APP-01KG',
      name: 'Fresh Royal Gala Apples',
      brand: 'Fresh Orchard',
      category: 'Fruits & Vegetables',
      description: 'Crisp, sweet and juicy imported Royal Gala apples. Rich in antioxidants and dietary fiber.',
      unit: 'pack',
      pack_size: '1 kg',
      cost_price: 130.0, mrp: 199.0, selling_price: 169.0, gst_rate: 0.0, hsn_code: '08081000',
      stock_quantity: 45, reorder_level: 10, rating: 4.8, review_count: 142, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-banana-1doz',
      sku: 'FRU-BAN-01DZ',
      name: 'Fresh Organic Robusta Bananas',
      brand: 'Fresh Orchard',
      category: 'Fruits & Vegetables',
      description: 'Naturally ripened, sweet and energy-packed fresh Robusta bananas.',
      unit: 'doz',
      pack_size: '12 Pcs',
      cost_price: 35.0, mrp: 60.0, selling_price: 49.0, gst_rate: 0.0, hsn_code: '08039010',
      stock_quantity: 60, reorder_level: 15, rating: 4.7, review_count: 98, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-tomato-1kg',
      sku: 'VEG-TOM-01KG',
      name: 'Farm Fresh Hybrid Tomatoes',
      brand: 'Fresh Farm',
      category: 'Fruits & Vegetables',
      description: 'Firm, ripe and juicy red tomatoes sourced directly from local farm collectives.',
      unit: 'kg',
      pack_size: '1 kg',
      cost_price: 22.0, mrp: 40.0, selling_price: 32.0, gst_rate: 0.0, hsn_code: '07020000',
      stock_quantity: 80, reorder_level: 20, rating: 4.5, review_count: 75, is_featured: 0, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80'
    },

    // 2. Dairy & Eggs
    {
      id: 'prod-amul-milk-1l',
      sku: 'DAI-MLK-01LT',
      name: 'Amul Taaza Homogenised Toned Milk',
      brand: 'Amul',
      category: 'Dairy & Eggs',
      description: 'Long life pasteurized toned milk enriched with Vitamin A & D.',
      unit: 'pouch',
      pack_size: '1 Litre',
      cost_price: 52.0, mrp: 68.0, selling_price: 66.0, gst_rate: 0.0, hsn_code: '04012000',
      stock_quantity: 50, reorder_level: 15, rating: 4.9, review_count: 310, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-butter-500g',
      sku: 'AMU-BUT-500G',
      name: 'Amul Pasteurized Salted Butter',
      brand: 'Amul',
      category: 'Dairy & Eggs',
      description: 'Rich creamy pasteurized table butter made with pure milk.',
      unit: 'pack',
      pack_size: '500g',
      cost_price: 245.0, mrp: 285.0, selling_price: 275.0, gst_rate: 12.0, hsn_code: '04051000',
      stock_quantity: 19, reorder_level: 10, rating: 4.9, review_count: 420, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-paneer-200g',
      sku: 'AMU-PAN-200G',
      name: 'Amul Fresh Malai Paneer',
      brand: 'Amul',
      category: 'Dairy & Eggs',
      description: 'Soft, hygienic and fresh malai cottage cheese block for delicious curries.',
      unit: 'pack',
      pack_size: '200g',
      cost_price: 75.0, mrp: 95.0, selling_price: 90.0, gst_rate: 5.0, hsn_code: '04061000',
      stock_quantity: 30, reorder_level: 10, rating: 4.8, review_count: 185, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80'
    },

    // 3. Bakery
    {
      id: 'prod-bread-400g',
      sku: 'BAK-BRD-400G',
      name: 'Britannia 100% Whole Wheat Bread',
      brand: 'Britannia',
      category: 'Bakery',
      description: 'Healthy brown bread baked with 100% whole wheat flour, rich in dietary fiber.',
      unit: 'pack',
      pack_size: '400g',
      cost_price: 32.0, mrp: 50.0, selling_price: 45.0, gst_rate: 0.0, hsn_code: '19059010',
      stock_quantity: 25, reorder_level: 8, rating: 4.6, review_count: 112, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80'
    },

    // 4. Rice, Atta & Staples
    {
      id: 'prod-atta-5kg',
      sku: 'ITC-AAS-05KG',
      name: 'Aashirvaad Shudh Chakki Whole Wheat Atta',
      brand: 'Aashirvaad',
      category: 'Rice, Atta & Staples',
      description: '100% pure whole wheat grain flour milled with traditional chakki process.',
      unit: 'bag',
      pack_size: '5 kg',
      cost_price: 225.0, mrp: 275.0, selling_price: 255.0, gst_rate: 5.0, hsn_code: '11010000',
      stock_quantity: 32, reorder_level: 8, rating: 4.9, review_count: 512, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-basmati-5kg',
      sku: 'FOR-BAS-05KG',
      name: 'Daawat Rozana Super Basmati Rice',
      brand: 'Daawat',
      category: 'Rice, Atta & Staples',
      description: 'Long grain aromatic basmati rice ideal for daily meals, biryani and pulao.',
      unit: 'bag',
      pack_size: '5 kg',
      cost_price: 380.0, mrp: 499.0, selling_price: 439.0, gst_rate: 5.0, hsn_code: '10063020',
      stock_quantity: 28, reorder_level: 6, rating: 4.8, review_count: 240, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80'
    },

    // 5. Pulses & Dal
    {
      id: 'prod-toor-dal-1kg',
      sku: 'TTA-TOO-01KG',
      name: 'Tata Sampann Unpolished Toor Dal',
      brand: 'Tata Sampann',
      category: 'Pulses & Dal',
      description: 'Unpolished split pigeon peas naturally rich in plant protein and nutrient retention.',
      unit: 'packet',
      pack_size: '1 kg',
      cost_price: 135.0, mrp: 175.0, selling_price: 159.0, gst_rate: 5.0, hsn_code: '07137000',
      stock_quantity: 40, reorder_level: 10, rating: 4.7, review_count: 165, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1585994191611-72ec0a69c849?w=600&auto=format&fit=crop&q=80'
    },

    // 6. Cooking Oil & Ghee
    {
      id: 'prod-sunflower-oil-1l',
      sku: 'FOR-SUN-01LT',
      name: 'Fortune Sunlite Refined Sunflower Oil',
      brand: 'Fortune',
      category: 'Cooking Oil & Ghee',
      description: 'Light and healthy cooking oil enriched with Vitamins A & D for heart wellness.',
      unit: 'pouch',
      pack_size: '1 Litre',
      cost_price: 118.0, mrp: 145.0, selling_price: 135.0, gst_rate: 5.0, hsn_code: '15121910',
      stock_quantity: 40, reorder_level: 15, rating: 4.7, review_count: 310, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-amul-ghee-1l',
      sku: 'AMU-GHE-01LT',
      name: 'Amul Pure Cow Ghee Carton',
      brand: 'Amul',
      category: 'Cooking Oil & Ghee',
      description: 'Aromatic granular pure cow ghee made from fresh milk fat.',
      unit: 'carton',
      pack_size: '1 Litre',
      cost_price: 540.0, mrp: 650.0, selling_price: 615.0, gst_rate: 12.0, hsn_code: '04059020',
      stock_quantity: 22, reorder_level: 5, rating: 4.9, review_count: 480, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80'
    },

    // 7. Masala & Spices
    {
      id: 'prod-tata-salt-1kg',
      sku: 'TAT-SLT-01KG',
      name: 'Tata Salt Vacuum Evaporated Iodised Salt',
      brand: 'Tata',
      category: 'Masala & Spices',
      description: 'Desh ka namak. Pure vacuum evaporated iodised salt for mental growth.',
      unit: 'packet',
      pack_size: '1 kg',
      cost_price: 23.5, mrp: 28.0, selling_price: 26.0, gst_rate: 0.0, hsn_code: '25010010',
      stock_quantity: 8, reorder_level: 12, rating: 4.9, review_count: 890, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-turmeric-200g',
      sku: 'EVE-TUR-200G',
      name: 'Everest Turmeric Powder (Haldi)',
      brand: 'Everest',
      category: 'Masala & Spices',
      description: 'Vibrant golden yellow natural turmeric powder sourced from Sangli farms.',
      unit: 'box',
      pack_size: '200g',
      cost_price: 42.0, mrp: 58.0, selling_price: 52.0, gst_rate: 5.0, hsn_code: '09103020',
      stock_quantity: 35, reorder_level: 10, rating: 4.8, review_count: 145, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80'
    },

    // 8. Snacks & Chips
    {
      id: 'prod-lays-magic-50g',
      sku: 'PEPSI-LAY-050G',
      name: "Lay's India's Magic Masala Potato Chips",
      brand: "Lay's",
      category: 'Snacks & Chips',
      description: 'Crispy crunchy potato chips seasoned with Indian blend of aromatic spices.',
      unit: 'pack',
      pack_size: '50g',
      cost_price: 15.0, mrp: 20.0, selling_price: 20.0, gst_rate: 12.0, hsn_code: '20052000',
      stock_quantity: 75, reorder_level: 25, rating: 4.8, review_count: 620, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop&q=80'
    },

    // 9. Biscuits & Cookies
    {
      id: 'prod-parleg-250g',
      sku: 'PAR-GLU-250G',
      name: 'Parle-G Gold Glucose Biscuits',
      brand: 'Parle',
      category: 'Biscuits & Cookies',
      description: 'Bigger, crunchier Parle-G with rich wheat and milk goodness.',
      unit: 'packet',
      pack_size: '250g',
      cost_price: 22.0, mrp: 30.0, selling_price: 28.0, gst_rate: 18.0, hsn_code: '19053100',
      stock_quantity: 65, reorder_level: 25, rating: 4.9, review_count: 1250, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-goodday-200g',
      sku: 'BRI-GDD-200G',
      name: 'Britannia Good Day Cashew Cookies',
      brand: 'Britannia',
      category: 'Biscuits & Cookies',
      description: 'Rich buttery cookies loaded with real roasted cashew nuts.',
      unit: 'packet',
      pack_size: '200g',
      cost_price: 38.0, mrp: 50.0, selling_price: 45.0, gst_rate: 18.0, hsn_code: '19053100',
      stock_quantity: 55, reorder_level: 15, rating: 4.7, review_count: 310, is_featured: 0, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80'
    },

    // 10. Chocolates & Sweets
    {
      id: 'prod-dairymilk-150g',
      sku: 'CAD-DMK-150G',
      name: 'Cadbury Dairy Milk Silk Chocolate Bar',
      brand: 'Cadbury',
      category: 'Chocolates & Sweets',
      description: 'Smooth, creamy and velvet Cadbury Dairy Milk Silk milk chocolate bar.',
      unit: 'bar',
      pack_size: '150g',
      cost_price: 140.0, mrp: 185.0, selling_price: 170.0, gst_rate: 18.0, hsn_code: '18063200',
      stock_quantity: 40, reorder_level: 10, rating: 4.9, review_count: 780, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=600&auto=format&fit=crop&q=80'
    },

    // 11. Beverages & Juices
    {
      id: 'prod-coke-1.25l',
      sku: 'COC-COK-1.25L',
      name: 'Coca-Cola Original Taste Soft Drink',
      brand: 'Coca-Cola',
      category: 'Beverages & Juices',
      description: 'Refreshing carbonated beverage with classic Coca-Cola original flavor.',
      unit: 'bottle',
      pack_size: '1.25 Litre',
      cost_price: 52.0, mrp: 65.0, selling_price: 60.0, gst_rate: 28.0, hsn_code: '22021010',
      stock_quantity: 45, reorder_level: 12, rating: 4.8, review_count: 490, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-tropicana-1l',
      sku: 'PEPSI-TRO-01LT',
      name: 'Tropicana 100% Real Orange Juice',
      brand: 'Tropicana',
      category: 'Beverages & Juices',
      description: 'Pure fruit juice with no added sugar, artificial color or preservatives.',
      unit: 'carton',
      pack_size: '1 Litre',
      cost_price: 110.0, mrp: 145.0, selling_price: 130.0, gst_rate: 12.0, hsn_code: '20091200',
      stock_quantity: 30, reorder_level: 10, rating: 4.7, review_count: 220, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80'
    },

    // 12. Tea & Coffee
    {
      id: 'prod-tatatea-500g',
      sku: 'TAT-TEA-500G',
      name: 'Tata Tea Premium Desh Ki Chai',
      brand: 'Tata Tea',
      category: 'Tea & Coffee',
      description: 'Blend of big and small tea leaves for rich aroma and strong taste.',
      unit: 'pack',
      pack_size: '500g',
      cost_price: 230.0, mrp: 310.0, selling_price: 280.0, gst_rate: 5.0, hsn_code: '09023020',
      stock_quantity: 38, reorder_level: 10, rating: 4.8, review_count: 360, is_featured: 0, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-nescafe-100g',
      sku: 'NES-COF-100G',
      name: 'Nescafe Classic Instant Coffee Powder',
      brand: 'Nescafe',
      category: 'Tea & Coffee',
      description: '100% pure natural coffee beans medium dark roasted for rich coffee aroma.',
      unit: 'jar',
      pack_size: '100g',
      cost_price: 280.0, mrp: 365.0, selling_price: 335.0, gst_rate: 18.0, hsn_code: '21011110',
      stock_quantity: 25, reorder_level: 8, rating: 4.9, review_count: 540, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80'
    },

    // 13. Instant & Packaged Foods
    {
      id: 'prod-maggi-70g',
      sku: 'NES-MAG-070G',
      name: 'Maggi 2-Minute Masala Instant Noodles',
      brand: 'Nestle',
      category: 'Instant & Packaged Foods',
      description: 'Classic India favorite 2-minute masala instant noodles with authentic spice mix.',
      unit: 'packet',
      pack_size: '70g',
      cost_price: 11.2, mrp: 14.0, selling_price: 14.0, gst_rate: 12.0, hsn_code: '19023010',
      stock_quantity: 90, reorder_level: 20, rating: 4.9, review_count: 1540, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-knorr-soup-45g',
      sku: 'ULV-KNO-045G',
      name: 'Knorr Thick Tomato Instant Soup',
      brand: 'Knorr',
      category: 'Instant & Packaged Foods',
      description: 'Delicious restaurant-like thick tomato soup with croutons.',
      unit: 'packet',
      pack_size: '45g',
      cost_price: 45.0, mrp: 60.0, selling_price: 55.0, gst_rate: 18.0, hsn_code: '21041010',
      stock_quantity: 35, reorder_level: 10, rating: 4.6, review_count: 88, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&auto=format&fit=crop&q=80'
    },

    // 14. Frozen Foods
    {
      id: 'prod-mccain-fries-425g',
      sku: 'MCC-FRI-425G',
      name: 'McCain Crispy French Fries',
      brand: 'McCain',
      category: 'Frozen Foods',
      description: 'Ready to fry crunchy golden potato french fries.',
      unit: 'pack',
      pack_size: '425g',
      cost_price: 95.0, mrp: 135.0, selling_price: 119.0, gst_rate: 12.0, hsn_code: '20041000',
      stock_quantity: 20, reorder_level: 5, rating: 4.8, review_count: 210, is_featured: 0, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80'
    },

    // 15. Personal Care & Hygiene
    {
      id: 'prod-dettol-soap-125g',
      sku: 'DET-SOP-125G',
      name: 'Dettol Original Germ Protection Soap',
      brand: 'Dettol',
      category: 'Personal Care & Hygiene',
      description: 'Trusted 99.9% germ protection body bathing soap bar with pine fragrance.',
      unit: 'bar',
      pack_size: '125g',
      cost_price: 44.0, mrp: 58.0, selling_price: 54.0, gst_rate: 18.0, hsn_code: '34011110',
      stock_quantity: 50, reorder_level: 20, rating: 4.8, review_count: 670, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1607006482602-76ca0fd2f477?w=600&auto=format&fit=crop&q=80'
    },

    // 16. Hair Care & Beauty
    {
      id: 'prod-dove-shampoo-340ml',
      sku: 'ULV-DOV-340M',
      name: 'Dove Intense Repair Nourishing Shampoo',
      brand: 'Dove',
      category: 'Hair Care & Beauty',
      description: 'Nourishing shampoo formulated with Keratin Repair Actives for smooth hair.',
      unit: 'bottle',
      pack_size: '340ml',
      cost_price: 240.0, mrp: 340.0, selling_price: 299.0, gst_rate: 18.0, hsn_code: '33051090',
      stock_quantity: 30, reorder_level: 8, rating: 4.8, review_count: 340, is_featured: 0, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&auto=format&fit=crop&q=80'
    },

    // 17. Oral Care
    {
      id: 'prod-colgate-150g',
      sku: 'COL-TOT-150G',
      name: 'Colgate Total Whole Mouth Protection Toothpaste',
      brand: 'Colgate',
      category: 'Oral Care',
      description: 'Antibacterial fluoride toothpaste providing 12 hour oral germ protection.',
      unit: 'pack',
      pack_size: '150g',
      cost_price: 95.0, mrp: 130.0, selling_price: 115.0, gst_rate: 18.0, hsn_code: '33061020',
      stock_quantity: 45, reorder_level: 10, rating: 4.7, review_count: 410, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?w=600&auto=format&fit=crop&q=80'
    },

    // 18. Baby Care
    {
      id: 'prod-pampers-m-50',
      sku: 'PND-PAM-00M',
      name: 'Pampers All Round Protection Baby Diapers (Medium)',
      brand: 'Pampers',
      category: 'Baby Care',
      description: 'Anti-rash soft diapers with aloe vera lotion for 12-hour leak lock protection.',
      unit: 'pack',
      pack_size: '50 Diapers',
      cost_price: 650.0, mrp: 899.0, selling_price: 799.0, gst_rate: 12.0, hsn_code: '96190010',
      stock_quantity: 25, reorder_level: 5, rating: 4.9, review_count: 520, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&auto=format&fit=crop&q=80'
    },

    // 19. Household Cleaning
    {
      id: 'prod-lizol-1l',
      sku: 'REC-LIZ-01LT',
      name: 'Lizol Disinfectant Surface & Floor Cleaner (Citrus)',
      brand: 'Lizol',
      category: 'Household Cleaning',
      description: 'Kills 99.9% germs, removes tough stains and leaves fresh lemon fragrance.',
      unit: 'bottle',
      pack_size: '1 Litre',
      cost_price: 160.0, mrp: 215.0, selling_price: 195.0, gst_rate: 18.0, hsn_code: '38089400',
      stock_quantity: 35, reorder_level: 10, rating: 4.8, review_count: 320, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&auto=format&fit=crop&q=80'
    },

    // 20. Laundry & Dishwash
    {
      id: 'prod-surf-excel-2kg',
      sku: 'ULV-SRF-02KG',
      name: 'Surf Excel Easy Wash Detergent Powder',
      brand: 'Surf Excel',
      category: 'Laundry & Dishwash',
      description: 'Superior stain removal powder formula engineered for tough collar & cuff dirt.',
      unit: 'pack',
      pack_size: '2 kg',
      cost_price: 240.0, mrp: 330.0, selling_price: 295.0, gst_rate: 18.0, hsn_code: '34022010',
      stock_quantity: 40, reorder_level: 10, rating: 4.8, review_count: 610, is_featured: 1, is_deal: 1,
      image_url: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=600&auto=format&fit=crop&q=80'
    },
    {
      id: 'prod-vim-gel-750ml',
      sku: 'ULV-VIM-750M',
      name: 'Vim Dishwash Gel Lemon Power',
      brand: 'Vim',
      category: 'Laundry & Dishwash',
      description: 'Concentrated dishwashing gel infused with real lemon juice to cut grease easily.',
      unit: 'bottle',
      pack_size: '750ml',
      cost_price: 145.0, mrp: 199.0, selling_price: 175.0, gst_rate: 18.0, hsn_code: '34022020',
      stock_quantity: 45, reorder_level: 10, rating: 4.7, review_count: 280, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80'
    },

    // 21. Kitchen Essentials
    {
      id: 'prod-foil-18m',
      sku: 'KIT-FOI-018M',
      name: 'Hindalco Freshwrap Aluminium Foil',
      brand: 'Freshwrap',
      category: 'Kitchen Essentials',
      description: 'Food grade hygiene aluminium foil roll for keeping roti and snacks hot & fresh.',
      unit: 'roll',
      pack_size: '18 Metres',
      cost_price: 90.0, mrp: 140.0, selling_price: 119.0, gst_rate: 18.0, hsn_code: '76071190',
      stock_quantity: 30, reorder_level: 8, rating: 4.6, review_count: 140, is_featured: 0, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=600&auto=format&fit=crop&q=80'
    },

    // 22. Pet Care
    {
      id: 'prod-pedigree-3kg',
      sku: 'MAR-PED-03KG',
      name: 'Pedigree Adult Dry Dog Food (Chicken & Vegetables)',
      brand: 'Pedigree',
      category: 'Pet Care',
      description: 'Complete nutritional dry kibble for adult dogs enriched with Omega 6 & zinc.',
      unit: 'bag',
      pack_size: '3 kg',
      cost_price: 520.0, mrp: 720.0, selling_price: 649.0, gst_rate: 18.0, hsn_code: '23091000',
      stock_quantity: 18, reorder_level: 5, rating: 4.8, review_count: 195, is_featured: 1, is_deal: 0,
      image_url: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=600&auto=format&fit=crop&q=80'
    }
  ];

  const insertProd = db.prepare(`
    INSERT OR REPLACE INTO products (
      id, store_id, sku, name, brand, category, description, unit, pack_size, 
      cost_price, mrp, selling_price, gst_rate, hsn_code, stock_quantity, 
      reorder_level, rating, review_count, is_featured, is_deal, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of products) {
    insertProd.run(
      p.id, storeId, p.sku, p.name, p.brand, p.category, p.description, p.unit, p.pack_size,
      p.cost_price, p.mrp, p.selling_price, p.gst_rate, p.hsn_code, p.stock_quantity,
      p.reorder_level, p.rating, p.review_count, p.is_featured, p.is_deal, p.image_url
    );
  }

  // Stock Movement Logs for initial inventory
  const insertMovement = db.prepare(`
    INSERT OR REPLACE INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, unit_cost_price, notes)
    VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?, ?)
  `);

  for (const p of products) {
    insertMovement.run(
      'init-mov-' + p.id,
      p.id,
      p.stock_quantity,
      0,
      p.stock_quantity,
      p.cost_price,
      'Initial Supermarket Catalog Stocking'
    );
  }

  // Customers
  const insertCust = db.prepare(`
    INSERT OR REPLACE INTO customers (id, store_id, name, phone, credit_limit, current_balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertCust.run('cust-1', storeId, 'Ramesh Kumar', '+91 98451 12345', 5000.0, 450.0);
  insertCust.run('cust-2', storeId, 'Priya Sharma', '+91 98452 23456', 8000.0, 0.0);
  insertCust.run('cust-3', storeId, 'Suresh Patel', '+91 98453 34567', 4000.0, 1200.0);

  // Offers
  db.prepare(`
    INSERT OR REPLACE INTO offers (id, store_id, name, description, offer_type, discount_value, minimum_quantity, minimum_cart_value, applicable_product_ids, start_at, end_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'offer-amul-butter-10',
    storeId,
    'Amul Butter 10% Instant Off',
    'Get 10% instant discount on Amul Salted Butter 500g',
    'PERCENTAGE',
    10.0,
    1,
    0,
    JSON.stringify(['prod-butter-500g']),
    '2026-01-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    1
  );

  db.prepare(`
    INSERT OR REPLACE INTO offers (id, store_id, name, description, offer_type, discount_value, minimum_quantity, minimum_cart_value, applicable_product_ids, start_at, end_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'offer-maggi-festive',
    storeId,
    'Weekend Super Deal: Maggi Noodles',
    'Special grocery offer on instant noodles pack',
    'PERCENTAGE',
    5.0,
    2,
    0,
    JSON.stringify(['prod-maggi-70g']),
    '2026-01-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    1
  );

  // Low Stock Notification
  db.prepare(`
    INSERT OR REPLACE INTO notifications (id, store_id, category, title, message, severity, related_resource_type, related_resource_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'notif-low-tata-salt',
    storeId,
    'LOW_STOCK',
    'Low Stock Alert: Tata Salt 1kg',
    'Tata Salt Vacuum Evaporated Iodised Salt has reached 8 packets (reorder level: 12).',
    'WARNING',
    'product',
    'prod-tata-salt-1kg'
  );
}
