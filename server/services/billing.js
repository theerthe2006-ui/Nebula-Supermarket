import { db } from '../db.js';
import { broadcastEvent } from './events.js';
import { generateInvoicePDF } from './pdfInvoice.js';

export function calculateCart(items, storeId) {
  let subtotal = 0;
  let taxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalDiscount = 0;

  const validatedItems = [];

  // Check active offers
  const activeOffers = db.prepare(`
    SELECT * FROM offers 
    WHERE store_id = ? AND is_active = 1 
      AND start_at <= CURRENT_TIMESTAMP AND end_at >= CURRENT_TIMESTAMP
  `).all(storeId);

  for (const item of items) {
    const product = db.prepare(`SELECT * FROM products WHERE id = ? AND store_id = ?`).get(item.productId, storeId);
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    if (!product.is_active) {
      throw new Error(`Product is no longer active: ${product.name}`);
    }

    const qty = Number(item.quantity);
    if (qty <= 0) {
      throw new Error(`Invalid quantity for ${product.name}`);
    }

    const unitSellingPrice = Number(product.selling_price);
    const lineSubtotal = unitSellingPrice * qty;

    // Check applicable offer
    let discount = 0;
    for (const offer of activeOffers) {
      if (offer.offer_type === 'PERCENTAGE' && offer.applicable_product_ids) {
        try {
          const prodIds = JSON.parse(offer.applicable_product_ids);
          if (prodIds.includes(product.id) && qty >= offer.minimum_quantity) {
            discount += (lineSubtotal * (offer.discount_value / 100));
          }
        } catch (e) {}
      }
    }

    const lineAfterDiscount = Math.max(0, lineSubtotal - discount);
    const gstRate = Number(product.gst_rate);
    const lineTaxable = gstRate > 0 ? (lineAfterDiscount / (1 + gstRate / 100)) : lineAfterDiscount;
    const lineTax = lineAfterDiscount - lineTaxable;
    const lineCgst = lineTax / 2;
    const lineSgst = lineTax / 2;

    subtotal += lineSubtotal;
    totalDiscount += discount;
    taxableAmount += lineTaxable;
    totalCgst += lineCgst;
    totalSgst += lineSgst;

    validatedItems.push({
      product,
      quantity: qty,
      unit_mrp: product.mrp,
      unit_selling_price: unitSellingPrice,
      discount_amount: discount,
      taxable_value: lineTaxable,
      gst_rate: gstRate,
      cgst_amount: lineCgst,
      sgst_amount: lineSgst,
      total_amount: lineAfterDiscount
    });
  }

  const grandTotal = Math.round(subtotal - totalDiscount);

  return {
    items: validatedItems,
    subtotal,
    discount_total: totalDiscount,
    taxable_amount: taxableAmount,
    cgst_amount: totalCgst,
    sgst_amount: totalSgst,
    total_tax: totalCgst + totalSgst,
    grand_total: grandTotal
  };
}

// Atomic Checkout Transaction with Stock Locking & Address Support
export async function executeCheckout({
  storeId,
  userId = null,
  customerId = null,
  addressId = null,
  channel = 'WEB_APP',
  items,
  paymentMethod = 'DEMO_PAYMENT',
  paymentReference = ''
}) {
  if (!items || items.length === 0) {
    throw new Error('Cart cannot be empty for checkout.');
  }

  const validMethods = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CREDIT', 'DEMO_PAYMENT'];
  if (!validMethods.includes(paymentMethod)) {
    throw new Error(`Invalid payment method: ${paymentMethod}`);
  }

  // BEGIN TRANSACTION
  db.exec('BEGIN TRANSACTION;');

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
    if (!store) throw new Error('Store context not found.');

    let customer = null;
    if (customerId) {
      customer = db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(customerId, storeId);
    }

    if (paymentMethod === 'CREDIT' && !customer) {
      throw new Error('Khata credit sale requires an identified customer account.');
    }

    // Verify stock availability
    for (const item of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(item.productId, storeId);
      if (!prod || !prod.is_active) {
        throw new Error(`Product ${item.productId} is unavailable.`);
      }
      if (prod.stock_quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for "${prod.name}". Requested: ${item.quantity}, Available: ${prod.stock_quantity} ${prod.unit}s.`
        );
      }
    }

    const calc = calculateCart(items, storeId);

    if (paymentMethod === 'CREDIT' && customer) {
      const newBal = customer.current_balance + calc.grand_total;
      if (newBal > customer.credit_limit) {
        throw new Error(
          `Credit limit exceeded for ${customer.name}. Limit: ₹${customer.credit_limit}, Current: ₹${customer.current_balance}, Attempted: ₹${calc.grand_total}`
        );
      }
    }

    // Sequential Invoice Number
    const nextCounter = (store.invoice_counter || 1000) + 1;
    const invoiceNumber = `${store.invoice_prefix || 'INV-2026-'}${String(nextCounter).padStart(4, '0')}`;
    db.prepare('UPDATE stores SET invoice_counter = ? WHERE id = ?').run(nextCounter, storeId);

    const saleId = 'sale-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    db.prepare(`
      INSERT INTO sales (
        id, store_id, invoice_number, customer_id, user_id, address_id, channel, subtotal, 
        discount_total, taxable_amount, cgst_amount, sgst_amount, 
        total_tax, grand_total, payment_method, payment_status, order_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'PLACED', 'PAID_RECORDED')
    `).run(
      saleId,
      storeId,
      invoiceNumber,
      customerId,
      userId,
      addressId,
      channel,
      calc.subtotal,
      calc.discount_total,
      calc.taxable_amount,
      calc.cgst_amount,
      calc.sgst_amount,
      calc.total_tax,
      calc.grand_total,
      paymentMethod
    );

    const lowStockAlerts = [];

    for (const line of calc.items) {
      const saleItemId = 'si-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, product_id, product_name, hsn_code, quantity,
          unit_mrp, unit_selling_price, discount_amount, taxable_value,
          gst_rate, cgst_amount, sgst_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleItemId,
        saleId,
        line.product.id,
        line.product.name,
        line.product.hsn_code,
        line.quantity,
        line.unit_mrp,
        line.unit_selling_price,
        line.discount_amount,
        line.taxable_value,
        line.gst_rate,
        line.cgst_amount,
        line.sgst_amount,
        line.total_amount
      );

      // Decrement stock
      const prevStock = line.product.stock_quantity;
      const newStock = prevStock - line.quantity;

      db.prepare('UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        newStock,
        line.product.id
      );

      // Stock Movement Log
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, reference_id, notes)
        VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
      `).run(
        'mov-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        line.product.id,
        -line.quantity,
        prevStock,
        newStock,
        saleId,
        `Sale checkout ${invoiceNumber}`
      );

      if (newStock <= line.product.reorder_level && prevStock > line.product.reorder_level) {
        lowStockAlerts.push({ product: line.product, remaining: newStock });
      }
    }

    // Payment Record
    const paymentId = 'pay-' + Date.now();
    const isDemo = paymentMethod === 'DEMO_PAYMENT';
    db.prepare(`
      INSERT INTO payment_records (id, sale_id, payment_method, amount, recording_status, payment_reference, notes)
      VALUES (?, ?, ?, ?, 'RECORDED_UNVERIFIED', ?, ?)
    `).run(
      paymentId,
      saleId,
      paymentMethod,
      calc.grand_total,
      paymentReference || (isDemo ? 'DEMO-TXN-' + Date.now() : null),
      isDemo ? 'Demo Payment — No real money was charged.' : `Payment recorded via ${paymentMethod}`
    );

    if (paymentMethod === 'CREDIT' && customer) {
      const balanceBefore = customer.current_balance;
      const balanceAfter = balanceBefore + calc.grand_total;
      db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balanceAfter, customer.id);
      db.prepare(`
        INSERT INTO khata_transactions (id, customer_id, store_id, transaction_type, amount, balance_before, balance_after, reference_sale_id, notes)
        VALUES (?, ?, ?, 'CREDIT_SALE', ?, ?, ?, ?, ?)
      `).run('khata-' + Date.now(), customer.id, storeId, calc.grand_total, balanceBefore, balanceAfter, saleId, `Credit sale on invoice ${invoiceNumber}`);
    }

    // Audit Log
    db.prepare(`
      INSERT INTO audit_logs (id, store_id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'CHECKOUT_FINALIZED', 'sale', ?, ?)
    `).run('audit-' + Date.now(), storeId, userId, saleId, JSON.stringify({ invoiceNumber, grandTotal: calc.grand_total, paymentMethod }));

    // Customer Notification
    if (userId) {
      db.prepare(`
        INSERT INTO notifications (id, store_id, user_id, category, title, message, severity)
        VALUES (?, ?, ?, 'ORDER_PLACED', ?, ?, 'SUCCESS')
      `).run(
        'notif-' + Date.now(),
        storeId,
        userId,
        `Order Placed Successfully! (${invoiceNumber})`,
        `Your order of ₹${calc.grand_total.toFixed(2)} has been placed. Payment Method: ${isDemo ? 'Demo Payment' : paymentMethod}.`
      );

      // Clear user database cart upon successful order
      try {
        const userCart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(userId);
        if (userCart) {
          db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(userCart.id);
        }
      } catch (e) {}
    }

    // Low stock notifications
    for (const alert of lowStockAlerts) {
      db.prepare(`
        INSERT INTO notifications (id, store_id, category, title, message, severity, related_resource_type, related_resource_id)
        VALUES (?, ?, 'LOW_STOCK', ?, ?, 'WARNING', 'product', ?)
      `).run(
        'notif-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        storeId,
        `Low Stock: ${alert.product.name}`,
        `${alert.product.name} is down to ${alert.remaining} ${alert.product.unit}s (reorder level: ${alert.product.reorder_level}).`,
        alert.product.id
      );
    }

    db.exec('COMMIT;');

    // Generate PDF Tax Invoice
    const saleRecord = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
    const paymentRecord = db.prepare('SELECT * FROM payment_records WHERE sale_id = ?').get(saleId);

    const { fileName } = await generateInvoicePDF({
      store,
      sale: saleRecord,
      items: saleItems,
      customer,
      payment: paymentRecord
    });

    db.prepare('UPDATE sales SET pdf_invoice_path = ? WHERE id = ?').run(`/invoices/${fileName}`, saleId);

    broadcastEvent('SALE_FINALIZED', { saleId, invoiceNumber, grandTotal: calc.grand_total, paymentMethod, channel });
    broadcastEvent('INVENTORY_UPDATED', { updatedItems: calc.items.map(i => ({ productId: i.product.id, name: i.product.name })) });

    return {
      success: true,
      saleId,
      invoiceNumber,
      grandTotal: calc.grand_total,
      subtotal: calc.subtotal,
      totalTax: calc.total_tax,
      discountTotal: calc.discount_total,
      paymentMethod,
      paymentStatus: 'PAID',
      orderStatus: 'PLACED',
      recordingStatus: 'RECORDED_UNVERIFIED',
      paymentHonestyMessage: isDemo
        ? 'DEMO PAYMENT — No real money was charged.'
        : `${paymentMethod} payment recorded.`,
      pdfInvoiceUrl: `/invoices/${fileName}`,
      itemsCount: calc.items.length
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
