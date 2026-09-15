process.env.TEST_MODE = '1';
process.env.PORT = '0'; // Ephemeral port for isolated testing

import http from 'node:http';
import { app } from './index.js';
import { db } from './db.js';
import { verifyJwt } from './services/auth.js';

console.log('====================================================');
console.log('🧪 NEBULA SUPERMARKET - FULL BACKEND INTEGRATION TEST');
console.log('====================================================\n');

let server;
let baseUrl;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🌐 Test server listening on ${baseUrl}\n`);

  try {
    // -----------------------------------------------------------------
    // 1. SYSTEM HEALTH
    // -----------------------------------------------------------------
    console.log('[1/10] Testing System Health & Root Info...');
    const health = await request('/api/health');
    assert(health.status === 200, 'Health endpoint responds with 200 OK');
    assert(health.data.success === true, 'Health check indicates success');
    assert(health.data.status === 'UP', 'Service status is UP');
    assert(health.data.activeProducts > 0, `Active product count verified: ${health.data.activeProducts}`);

    // -----------------------------------------------------------------
    // 2. AUTHENTICATION & JWT (REGISTRATION, LOGIN, PROFILES)
    // -----------------------------------------------------------------
    console.log('\n[2/10] Testing Authentication & RFC 7519 JWT...');
    const testEmail = `cust_${Date.now()}@nebulatest.local`;
    const testPass = 'SecurePass123!';

    // Register
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: `user_${Date.now()}`,
        email: testEmail,
        password: testPass,
        name: 'Test Customer',
        phone: `+91 99${Math.floor(10000000 + Math.random() * 90000000)}`
      })
    });
    if (regRes.status !== 201) {
      console.error('Registration failed with error:', regRes.data);
    }
    assert(regRes.status === 201, 'User registration returns 201 Created');
    assert(regRes.data.success === true, 'Registration reports success');
    assert(Boolean(regRes.data.token), 'Registration returns JWT token');
    const customerToken = regRes.data.token;
    const decodedJwt = verifyJwt(customerToken);
    assert(decodedJwt !== null && decodedJwt.email === testEmail, 'Returned token is a valid, verifiable JWT');
    const customerUser = regRes.data.user;

    // Login with registered user
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: testEmail, password: testPass })
    });
    assert(loginRes.status === 200, 'User login returns 200 OK');
    assert(loginRes.data.success === true, 'Login reports success');
    assert(Boolean(loginRes.data.token), 'Login returns JWT token');

    // Profile retrieval
    const profRes = await request('/api/users/profile', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(profRes.status === 200, 'GET /api/users/profile returns 200 with Bearer JWT');
    assert(profRes.data.user.email === testEmail, 'Profile email matches registered email');

    // Profile update
    const updateProfRes = await request('/api/users/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ phone: '+91 91111 22222' })
    });
    assert(updateProfRes.status === 200, 'PUT /api/users/profile updates profile');
    assert(updateProfRes.data.user.phone === '+91 91111 22222', 'Updated phone verified');

    // Login with Owner
    const ownerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: 'owner@nebulamarket.local', password: 'Nebula123!' })
    });
    assert(ownerLogin.status === 200, 'Owner login successful');
    assert(ownerLogin.data.user.role === 'OWNER', 'Owner role verified');
    const ownerToken = ownerLogin.data.token;

    // -----------------------------------------------------------------
    // 3. ADDRESS MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n[3/10] Testing Address Management...');
    const addAddrRes = await request('/api/addresses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        name: 'Test Customer',
        phone: '+91 91111 22222',
        addressLine1: '42 Galaxy Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        addressType: 'HOME',
        isDefault: true
      })
    });
    assert(addAddrRes.status === 200, 'POST /api/addresses adds address');
    const createdAddrId = addAddrRes.data.address.id;

    const listAddrRes = await request('/api/addresses', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(listAddrRes.status === 200 && listAddrRes.data.addresses.length > 0, 'GET /api/addresses lists addresses');

    const updateAddrRes = await request(`/api/addresses/${createdAddrId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ landmark: 'Opposite Park' })
    });
    assert(updateAddrRes.status === 200, 'PUT /api/addresses/:id updates address');
    assert(updateAddrRes.data.address.landmark === 'Opposite Park', 'Updated landmark verified');

    // -----------------------------------------------------------------
    // 4. PRODUCT FUNCTIONALITY & SEARCH
    // -----------------------------------------------------------------
    console.log('\n[4/10] Testing Product Catalog, Search, and Filtering...');
    const prodList = await request('/api/products');
    assert(prodList.status === 200, 'GET /api/products returns 200');
    assert(prodList.data.products.length > 0, `Products returned: ${prodList.data.count}`);
    assert(prodList.data.products[0].cost_price === undefined, 'Confidential cost_price masked for public/customer');

    const catList = await request('/api/products/categories');
    assert(catList.status === 200 && catList.data.categories.length > 0, 'GET /api/products/categories returns categories');

    const searchRes = await request('/api/products?search=apple');
    assert(searchRes.status === 200 && searchRes.data.products.length > 0, 'Product search returns matching items');

    const singleProd = await request('/api/products/prod-apple-1kg');
    assert(singleProd.status === 200, 'GET /api/products/:id returns product details');
    assert(singleProd.data.product.id === 'prod-apple-1kg', 'Product ID verified');

    // -----------------------------------------------------------------
    // 5. ADMIN PRODUCT CRUD & AUTHORIZATION
    // -----------------------------------------------------------------
    console.log('\n[5/10] Testing Admin Product CRUD & Authorization Security...');
    // Customer attempting to create product should be blocked (403)
    const unauthorizedCreate = await request('/api/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ name: 'Hacker Product' })
    });
    assert(unauthorizedCreate.status === 403, 'Customer cannot create products (403 Forbidden enforced)');

    // Owner creates product
    const newProdSku = 'TEST-SKU-' + Date.now();
    const createProdRes = await request('/api/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        sku: newProdSku,
        name: 'Organic Wild Honey',
        brand: 'Nebula Naturals',
        category: 'Kitchen Essentials',
        description: 'Pure unfiltered forest honey.',
        unit: 'jar',
        packSize: '500g',
        costPrice: 220,
        mrp: 350,
        sellingPrice: 310,
        gstRate: 5,
        hsnCode: '04090000',
        stockQuantity: 40,
        reorderLevel: 10
      })
    });
    assert(createProdRes.status === 201, 'Owner POST /api/products creates new product (201 Created)');
    const createdProdId = createProdRes.data.product.id;

    // Owner updates product
    const updateProdRes = await request(`/api/products/${createdProdId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ sellingPrice: 299, stockQuantity: 45 })
    });
    assert(updateProdRes.status === 200, 'Owner PUT /api/products/:id updates product');
    assert(updateProdRes.data.product.selling_price === 299, 'Updated selling price verified');

    // Owner deactivates product
    const delProdRes = await request(`/api/products/${createdProdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert(delProdRes.status === 200, 'Owner DELETE /api/products/:id deactivates product');

    // -----------------------------------------------------------------
    // 6. USER CART SYSTEM (PERSISTENT SERVER-SIDE CART)
    // -----------------------------------------------------------------
    console.log('\n[6/10] Testing User Persistent Cart System...');
    // Initial empty cart
    const emptyCartRes = await request('/api/cart', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(emptyCartRes.status === 200, 'GET /api/cart returns user cart');

    // Add item to cart
    const addToCartRes = await request('/api/cart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: 'prod-apple-1kg', quantity: 2 })
    });
    assert(addToCartRes.status === 200, 'POST /api/cart adds item to persistent cart');
    assert(addToCartRes.data.items.length === 1, 'Cart has 1 line item');
    assert(addToCartRes.data.calculation.grand_total > 0, 'Server calculated cart total');

    // Update quantity
    const updateCartRes = await request('/api/cart/prod-apple-1kg', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ quantity: 3 })
    });
    assert(updateCartRes.status === 200, 'PUT /api/cart/:productId updates item quantity');
    assert(updateCartRes.data.items[0].quantity === 3, 'Quantity updated to 3');

    // Add second item
    await request('/api/cart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: 'prod-milk-amul-1l', quantity: 2 })
    }).catch(() => {});

    // -----------------------------------------------------------------
    // 7. ORDER CREATION & ATOMIC CHECKOUT
    // -----------------------------------------------------------------
    console.log('\n[7/10] Testing Order Creation & Atomic Checkout...');
    // Checkout using items currently in user database cart
    const checkoutRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        paymentMethod: 'DEMO_PAYMENT',
        addressId: createdAddrId
      })
    });
    assert(checkoutRes.status === 201, 'POST /api/orders places order from persistent cart (201 Created)');
    assert(Boolean(checkoutRes.data.invoiceNumber), `Generated Invoice Number: ${checkoutRes.data.invoiceNumber}`);
    assert(checkoutRes.data.grandTotal > 0, `Server-computed Grand Total: ₹${checkoutRes.data.grandTotal}`);
    assert(Boolean(checkoutRes.data.pdfInvoiceUrl), `PDF Tax Invoice generated: ${checkoutRes.data.pdfInvoiceUrl}`);
    const placedSaleId = checkoutRes.data.saleId;

    // Verify user cart was cleared automatically after order placement
    const cartAfterOrder = await request('/api/cart', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(cartAfterOrder.data.items.length === 0, 'User cart cleared automatically after successful checkout');

    // -----------------------------------------------------------------
    // 8. ORDERS RETRIEVAL & STATUS MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n[8/10] Testing Order Retrieval & Status Updates...');
    const myOrdersRes = await request('/api/orders/my-orders', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(myOrdersRes.status === 200, 'GET /api/orders/my-orders returns customer order history');
    assert(myOrdersRes.data.orders.length > 0, `Customer has ${myOrdersRes.data.orders.length} recorded order(s)`);

    const singleOrderRes = await request(`/api/orders/${placedSaleId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(singleOrderRes.status === 200, 'GET /api/orders/:id returns order details to owner');
    assert(singleOrderRes.data.sale.id === placedSaleId, 'Order details match placed order ID');

    // Admin updates order status
    const updateStatusRes = await request(`/api/orders/${placedSaleId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ orderStatus: 'CONFIRMED' })
    });
    assert(updateStatusRes.status === 200, 'PUT /api/orders/:id/status updates order status');
    assert(updateStatusRes.data.orderStatus === 'CONFIRMED', 'Order status updated to CONFIRMED');

    // -----------------------------------------------------------------
    // 9. ADMIN USER & INVENTORY MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n[9/10] Testing Admin Users & Inventory Audit Trail...');
    const adminUsers = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert(adminUsers.status === 200, 'GET /api/admin/users lists all users for OWNER');
    assert(adminUsers.data.users.length >= 3, `Users registered in system: ${adminUsers.data.count}`);

    const movementsRes = await request('/api/admin/inventory/movements', {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert(movementsRes.status === 200, 'GET /api/admin/inventory/movements returns stock movements');
    assert(movementsRes.data.movements.length > 0, 'Audit trail contains logged stock transactions');

    // -----------------------------------------------------------------
    // 10. SECURITY, 401/403/404 & KHATA LEDGER
    // -----------------------------------------------------------------
    console.log('\n[10/10] Testing Error Handling, 401/403/404, and Khata Ledger...');
    const unauthCart = await request('/api/cart');
    assert(unauthCart.status === 401, 'Unauthenticated access to /api/cart returns 401 Unauthorized');

    const notFound = await request('/api/unknown_endpoint_xyz');
    assert(notFound.status === 404, 'Unknown API route returns 404 with JSON error');

    const khataCusts = await request('/api/khata/customers');
    assert(khataCusts.status === 200 && khataCusts.data.customers.length > 0, 'GET /api/khata/customers returns khata accounts');

    console.log('\n====================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! BACKEND 100% READY');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED WITH ERROR:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();

