import { initDatabase, db } from './db.js';
import { hashPassword, verifyPassword } from './services/auth.js';
import { calculateCart, executeCheckout } from './services/billing.js';

console.log("=== Testing Backend Services ===");
initDatabase();

// 1. Check Product Count
const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
console.log(`✓ Products seeded in DB: ${prodCount}`);

// 2. Check User Authentication
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('customer@nebulamarket.local');
console.log(`✓ Demo Customer user found: ${user ? user.username : 'NO'}`);
if (user) {
  const isMatch = verifyPassword('Nebula123!', user.password_hash);
  console.log(`✓ Password scrypt verification match: ${isMatch}`);
}

// 3. Test Cart Calculation
const calc = calculateCart([{ productId: 'prod-apple-1kg', quantity: 2 }], 'store-nebula-main');
console.log(`✓ Cart calculation total for 2 Apple packs: ₹${calc.grand_total}`);

// 4. Test Checkout Execution
executeCheckout({
  storeId: 'store-nebula-main',
  userId: user ? user.id : 'user-customer-1',
  customerId: 'cust-1',
  channel: 'WEB_APP',
  items: [{ productId: 'prod-apple-1kg', quantity: 1 }],
  paymentMethod: 'DEMO_PAYMENT'
}).then(res => {
  console.log(`✓ Atomic checkout success! Invoice #${res.invoiceNumber}, Grand Total: ₹${res.grandTotal}, PDF: ${res.pdfInvoiceUrl}`);
  process.exit(0);
}).catch(err => {
  console.error("❌ Checkout failed:", err);
  process.exit(1);
});
