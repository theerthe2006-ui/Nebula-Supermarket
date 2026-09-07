import { db } from '../db.js';
import { executeCheckout, calculateCart } from './billing.js';
import { broadcastEvent } from './events.js';

// In-memory or database-backed draft bills for Telegram users
export class TelegramStoreAssistant {
  constructor(storeId = 'store-nebula-main') {
    this.storeId = storeId;
  }

  getDraft(userId) {
    const row = db.prepare('SELECT draft_json FROM telegram_drafts WHERE user_id = ?').get(userId);
    if (!row) {
      return { items: [], customerId: null };
    }
    try {
      return JSON.parse(row.draft_json);
    } catch {
      return { items: [], customerId: null };
    }
  }

  saveDraft(userId, draft) {
    db.prepare(`
      INSERT INTO telegram_drafts (user_id, store_id, draft_json, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET draft_json = excluded.draft_json, updated_at = CURRENT_TIMESTAMP
    `).run(userId, this.storeId, JSON.stringify(draft));
  }

  clearDraft(userId) {
    db.prepare('DELETE FROM telegram_drafts WHERE user_id = ?').run(userId);
  }

  // Natural Language Orchestrator
  async processMessage(userId, text) {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // 1. Command /new or reset
    if (lower === '/new' || lower === 'new bill' || lower === 'clear bill' || lower === 'reset') {
      this.clearDraft(userId);
      return {
        reply: '🔄 Bill draft cleared. Ready for a new transaction. What would you like to do?',
        draft: null
      };
    }

    // 2. Stock Query
    if (lower.startsWith('stock') || lower.includes('how much') || lower.includes('how many') || lower.includes('available')) {
      return this.handleStockQuery(raw);
    }

    // 3. Low stock query
    if (lower.includes('low stock') || lower.includes('reorder') || lower.includes('running out')) {
      return this.handleLowStockQuery();
    }

    // 4. Daily Close / Day End
    if (lower.includes('daily close') || lower.includes('day end') || lower.includes('close store') || lower.includes('day summary')) {
      return this.handleDailyClose();
    }

    // 5. Khata query or payment
    if (lower.includes('khata') || lower.includes('owe') || lower.includes('balance') || lower.includes('paid')) {
      return this.handleKhataMessage(raw);
    }

    // 6. Stock Receiving
    if (lower.startsWith('received') || lower.startsWith('add stock') || lower.includes('stock receipt')) {
      return this.handleStockReceiving(raw);
    }

    // 7. New Product creation
    if (lower.startsWith('new product') || lower.startsWith('create product')) {
      return this.handleNewProduct(raw);
    }

    // 8. Bill Finalization / Checkout
    if (lower.includes('close bill') || lower.includes('checkout') || lower.startsWith('bill ') || lower.startsWith('pay ') || lower.includes('finalize')) {
      return this.handleCheckoutIntent(userId, raw);
    }

    // 9. Draft Billing Operations: Add / Remove / Edit
    if (lower.startsWith('add ') || lower.startsWith('remove ') || lower.startsWith('change ') || lower.includes('packet') || lower.includes('kg')) {
      return this.handleDraftModification(userId, raw);
    }

    // 10. Default Help / Clarification
    return {
      reply: `👋 **Nebula AI Store Assistant**\n\nHere are commands I understand:\n• **Add to bill**: \`Add 2 Maggi 70g\` or \`Add 1 Tata Salt\`\n• **Modify bill**: \`Remove Maggi\` or \`Change Maggi to 4\`\n• **Checkout**: \`Checkout with Cash\` or \`Bill to Ramesh on credit\`\n• **Reset**: \`/new\` to reset active bill draft\n• **Check Stock**: \`How much Tata Salt left?\` or \`List low stock\`\n• **Receive Stock**: \`Received 50 Maggi 70g at 12 cost\`\n• **Customer Khata**: \`How much does Ramesh owe?\` or \`Ramesh paid 300\`\n• **Daily Close**: \`Run daily close\``,
      draft: this.getDraft(userId)
    };
  }

  // Handler: Stock Query
  handleStockQuery(text) {
    const products = db.prepare('SELECT * FROM products WHERE store_id = ? AND is_active = 1').all(this.storeId);
    const cleaned = text.toLowerCase().replace(/(stock|how|much|many|do|we|have|left|of|is|are|available|\?)/g, '').trim();

    if (!cleaned) {
      // General stock overview
      const count = products.length;
      return {
        reply: `📦 **Inventory Overview**: Catalog contains **${count} active products**. Ask about any product (e.g. *"How much Maggi left?"*) or ask for *"low stock"*.`
      };
    }

    const matches = products.filter(p => 
      p.name.toLowerCase().includes(cleaned) || 
      p.brand.toLowerCase().includes(cleaned) ||
      p.category.toLowerCase().includes(cleaned) ||
      p.sku.toLowerCase().includes(cleaned)
    );

    if (matches.length === 0) {
      return { reply: `❌ No product matching "${cleaned}" was found in store inventory.` };
    }

    if (matches.length === 1) {
      const p = matches[0];
      const isLow = p.stock_quantity <= p.reorder_level;
      return {
        reply: `📦 **${p.name} (${p.pack_size})**\n• On-hand Stock: **${p.stock_quantity} ${p.unit}s**\n• Selling Price: ₹${p.selling_price} (MRP ₹${p.mrp})\n• Status: ${isLow ? '⚠️ Low Stock (Reorder Level: ' + p.reorder_level + ')' : '✅ In Stock'}`
      };
    }

    // Multiple matches - don't guess
    let list = `🔍 Found **${matches.length} matching products**:\n`;
    matches.forEach(p => {
      list += `• **${p.name} (${p.pack_size})**: ${p.stock_quantity} ${p.unit}s @ ₹${p.selling_price}\n`;
    });
    return { reply: list };
  }

  // Handler: Low Stock Alert Query
  handleLowStockQuery() {
    const lowStock = db.prepare(`
      SELECT * FROM products 
      WHERE store_id = ? AND is_active = 1 AND stock_quantity <= reorder_level
      ORDER BY (stock_quantity / reorder_level) ASC
    `).all(this.storeId);

    if (lowStock.length === 0) {
      return { reply: '✅ All inventory items are currently above their reorder thresholds.' };
    }

    let msg = `⚠️ **Low Stock Alert (${lowStock.length} items need replenishment)**:\n\n`;
    lowStock.forEach((p, idx) => {
      msg += `${idx + 1}. **${p.name} (${p.pack_size})**: **${p.stock_quantity} ${p.unit}s** remaining (Reorder Level: ${p.reorder_level})\n`;
    });
    return { reply: msg };
  }

  // Handler: Daily Store Close
  handleDailyClose() {
    const today = new Date().toISOString().split('T')[0];
    
    const sales = db.prepare(`
      SELECT * FROM sales 
      WHERE store_id = ? AND DATE(created_at) = DATE(?)
    `).all(this.storeId, today);

    if (sales.length === 0) {
      return {
        reply: `📊 **Daily Store Close Report (${today})**\n\nNo sales recorded today.\n\nAll counters remain at zero. No synthetic metrics fabricated.`
      };
    }

    let totalRevenue = 0;
    let totalTax = 0;
    let cashTotal = 0;
    let upiTotal = 0;
    let cardTotal = 0;
    let creditTotal = 0;

    for (const s of sales) {
      totalRevenue += s.grand_total;
      totalTax += s.total_tax;

      const payments = db.prepare('SELECT * FROM payment_records WHERE sale_id = ?').all(s.id);
      for (const p of payments) {
        if (p.payment_method === 'CASH') cashTotal += p.amount;
        if (p.payment_method === 'UPI') upiTotal += p.amount;
        if (p.payment_method === 'CARD') cardTotal += p.amount;
        if (p.payment_method === 'CREDIT') creditTotal += p.amount;
      }
    }

    return {
      reply: `📊 **Official Daily Close Summary (${today})**\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `• **Total Bills**: ${sales.length}\n` +
             `• **Gross Sales Revenue**: ₹${totalRevenue.toFixed(2)}\n` +
             `• **Total GST Collected**: ₹${totalTax.toFixed(2)}\n\n` +
             `💳 **Payment Breakdown (Recorded)**:\n` +
             `• Cash in Drawer: ₹${cashTotal.toFixed(2)}\n` +
             `• Recorded UPI: ₹${upiTotal.toFixed(2)}\n` +
             `• Recorded Card: ₹${cardTotal.toFixed(2)}\n` +
             `• Khata Credit Issued: ₹${creditTotal.toFixed(2)}\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `*All figures calculated directly from finalized database records.*`
    };
  }

  // Handler: Khata customer queries & payments
  handleKhataMessage(text) {
    const lower = text.toLowerCase();
    const customers = db.prepare('SELECT * FROM customers WHERE store_id = ?').all(this.storeId);

    // Check payment recording: "Ramesh paid 300 via UPI"
    if (lower.includes('paid') || lower.includes('received')) {
      const match = text.match(/([a-zA-Z\s]+)\s+(?:paid|received)\s+(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
      if (match) {
        const namePart = match[1].replace(/(khata|customer)/gi, '').trim().toLowerCase();
        const amount = parseFloat(match[2]);
        const cust = customers.find(c => c.name.toLowerCase().includes(namePart));

        if (cust) {
          const balBefore = cust.current_balance;
          const balAfter = Math.max(0, balBefore - amount);

          db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balAfter, cust.id);

          db.prepare(`
            INSERT INTO khata_transactions (id, customer_id, store_id, transaction_type, amount, balance_before, balance_after, payment_method, notes)
            VALUES (?, ?, ?, 'PAYMENT_RECEIVED', ?, ?, ?, 'UPI', 'Recorded via Telegram Assistant')
          `).run('khata-pay-' + Date.now(), cust.id, this.storeId, amount, balBefore, balAfter);

          broadcastEvent('KHATA_UPDATED', { customerId: cust.id, name: cust.name, balanceAfter: balAfter });

          return {
            reply: `✅ **Khata Payment Recorded**\n• Customer: **${cust.name}**\n• Amount Paid: **₹${amount.toFixed(2)}**\n• Previous Balance: ₹${balBefore.toFixed(2)}\n• **Remaining Outstanding**: **₹${balAfter.toFixed(2)}**`
          };
        }
      }
    }

    // Check balance query: "How much does Ramesh owe?"
    const matchedCust = customers.find(c => lower.includes(c.name.toLowerCase().split(' ')[0]));
    if (matchedCust) {
      return {
        reply: `📒 **Customer Khata: ${matchedCust.name}**\n• Phone: ${matchedCust.phone}\n• Outstanding Balance: **₹${matchedCust.current_balance.toFixed(2)}**\n• Credit Limit: ₹${matchedCust.credit_limit.toFixed(2)}\n• Available Credit: ₹${Math.max(0, matchedCust.credit_limit - matchedCust.current_balance).toFixed(2)}`
      };
    }

    // General list of pending khata
    const debtors = customers.filter(c => c.current_balance > 0);
    if (debtors.length === 0) {
      return { reply: '📒 **Customer Khata**: Zero outstanding credit balances across all customers.' };
    }

    let summary = `📒 **Active Customer Khata Balances**:\n`;
    debtors.forEach(c => {
      summary += `• **${c.name}**: ₹${c.current_balance.toFixed(2)} pending (Limit: ₹${c.credit_limit})\n`;
    });
    return { reply: summary };
  }

  // Handler: Stock Receiving: "Received 50 packets of Maggi 70g at 12 cost"
  handleStockReceiving(text) {
    const qtyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:packets?|bags?|packs?|units?|bottles?|kg)?/i);
    const costMatch = text.match(/(?:at|cost|price|@)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);

    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : null;
    const cost = costMatch ? parseFloat(costMatch[1]) : null;

    if (!qty) {
      return { reply: '❓ Please specify the quantity received (e.g. *"Received 50 Maggi 70g at ₹12 cost"*).' };
    }

    // Match product name
    const products = db.prepare('SELECT * FROM products WHERE store_id = ?').all(this.storeId);
    const cleaned = text.toLowerCase()
      .replace(/(received|add|stock|packets?|bags?|packs?|units?|bottles?|kg|at|cost|price|@|\d+(\.\d+)?)/g, '')
      .trim();

    const matches = products.filter(p => p.name.toLowerCase().includes(cleaned) || p.brand.toLowerCase().includes(cleaned));

    if (matches.length === 0) {
      return { reply: `❌ Could not find an existing product matching "${cleaned}". Create it first using: \`New product [Name]...\`` };
    }

    if (matches.length > 1) {
      let clarification = `❓ Multiple items matched "${cleaned}". Which one are you receiving?\n`;
      matches.forEach(p => {
        clarification += `• ${p.name} (${p.pack_size}) — SKU: ${p.sku}\n`;
      });
      return { reply: clarification };
    }

    const prod = matches[0];
    const prevStock = prod.stock_quantity;
    const newStock = prevStock + qty;

    db.prepare('UPDATE products SET stock_quantity = ?, cost_price = COALESCE(?, cost_price), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStock, cost, prod.id);

    db.prepare(`
      INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, previous_stock, resulting_stock, unit_cost_price, notes)
      VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?, 'Stock receipt via Telegram Assistant')
    `).run('mov-' + Date.now(), prod.id, qty, prevStock, newStock, cost || prod.cost_price);

    broadcastEvent('INVENTORY_UPDATED', { productId: prod.id, resultingStock: newStock });

    return {
      reply: `✅ **Stock Received Successfully**\n• Product: **${prod.name} (${prod.pack_size})**\n• Received: **+${qty} ${prod.unit}s**\n• Updated Stock: **${newStock} ${prod.unit}s**\n• Cost Price: ₹${(cost || prod.cost_price).toFixed(2)}`
    };
  }

  // Handler: New Product
  handleNewProduct(text) {
    return {
      reply: `ℹ️ To register a new product, please use the Web App Catalog screen or provide: Name, Pack Size, Selling Price, MRP, Cost Price, GST %, HSN.`
    };
  }

  // Handler: Draft Modification (Add, Remove, Edit)
  handleDraftModification(userId, text) {
    const lower = text.toLowerCase();
    const draft = this.getDraft(userId);
    const products = db.prepare('SELECT * FROM products WHERE store_id = ? AND is_active = 1').all(this.storeId);

    // Check Remove
    if (lower.startsWith('remove ') || lower.startsWith('delete ')) {
      const search = lower.replace(/(remove|delete)/g, '').trim();
      const idx = draft.items.findIndex(i => {
        const p = products.find(prod => prod.id === i.productId);
        return p && p.name.toLowerCase().includes(search);
      });

      if (idx === -1) {
        return { reply: `❌ Could not find "${search}" in your active draft bill.` };
      }

      const removed = draft.items.splice(idx, 1)[0];
      const prod = products.find(p => p.id === removed.productId);
      this.saveDraft(userId, draft);

      return {
        reply: `🗑️ Removed **${prod.name}** from draft bill.\n\n${this.formatDraftSummary(draft)}`,
        draft
      };
    }

    // Adding item: "Add 2 Maggi 70g"
    const qtyMatch = text.match(/(\d+(?:\.\d+)?)/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

    const searchTerm = lower
      .replace(/(add|also|put|packets?|packs?|units?|bottles?|kg|\d+(\.\d+)?)/g, '')
      .trim();

    if (!searchTerm) {
      return { reply: '❓ What item would you like to add to the bill?' };
    }

    const matches = products.filter(p => 
      p.name.toLowerCase().includes(searchTerm) || 
      p.brand.toLowerCase().includes(searchTerm) ||
      p.sku.toLowerCase().includes(searchTerm)
    );

    if (matches.length === 0) {
      return { reply: `❌ Product "${searchTerm}" not found in supermarket catalog.` };
    }

    // Ambiguity clarification: e.g. "Maggi" matches Maggi 70g and Maggi 140g
    if (matches.length > 1 && !lower.includes('70g') && !lower.includes('140g') && !lower.includes('5kg')) {
      let clarification = `❓ Multiple pack sizes found for "${searchTerm}". Please specify which one:\n`;
      matches.forEach(p => {
        clarification += `• **${p.name} (${p.pack_size})** — ₹${p.selling_price} (${p.stock_quantity} available)\n`;
      });
      clarification += `\n*Reply with: "Add ${qty} ${matches[0].name} ${matches[0].pack_size}"*`;
      return { reply: clarification };
    }

    const selectedProduct = matches[0];

    // Oversell guard
    const existingIndex = draft.items.findIndex(i => i.productId === selectedProduct.id);
    const existingQty = existingIndex >= 0 ? draft.items[existingIndex].quantity : 0;
    const requestedTotal = existingQty + qty;

    if (requestedTotal > selectedProduct.stock_quantity) {
      return {
        reply: `🛑 **Oversell Guard Alert**: Cannot add ${qty} ${selectedProduct.unit}s of **${selectedProduct.name}**.\n` +
               `• Available On-hand: **${selectedProduct.stock_quantity} ${selectedProduct.unit}s**\n` +
               `• Already in draft: ${existingQty}\n` +
               `• Maximum you can add: **${Math.max(0, selectedProduct.stock_quantity - existingQty)}**`
      };
    }

    if (existingIndex >= 0) {
      draft.items[existingIndex].quantity = requestedTotal;
    } else {
      draft.items.push({ productId: selectedProduct.id, quantity: qty });
    }

    this.saveDraft(userId, draft);

    return {
      reply: `🛒 Added **${qty}x ${selectedProduct.name} (${selectedProduct.pack_size})** @ ₹${selectedProduct.selling_price}.\n\n${this.formatDraftSummary(draft)}`,
      draft
    };
  }

  // Format Draft Bill Summary
  formatDraftSummary(draft) {
    if (!draft || draft.items.length === 0) {
      return '*(Draft bill is currently empty. Use "Add [qty] [item]" to begin)*';
    }

    try {
      const calc = calculateCart(draft.items, this.storeId);
      let summary = `🧾 **Active Draft Bill**:\n`;
      calc.items.forEach((item, idx) => {
        summary += `${idx + 1}. **${item.product.name}** × ${item.quantity} = ₹${item.total_amount.toFixed(2)}\n`;
      });
      summary += `\n• Subtotal: ₹${calc.subtotal.toFixed(2)}\n`;
      if (calc.discount_total > 0) {
        summary += `• Discount: -₹${calc.discount_total.toFixed(2)}\n`;
      }
      summary += `• Taxes (CGST+SGST): ₹${calc.total_tax.toFixed(2)}\n`;
      summary += `• **Grand Total**: **₹${calc.grand_total.toFixed(2)}**\n\n`;
      summary += `*To finalize, say: "Checkout with Cash" or "Bill to Ramesh on credit".*`;
      return summary;
    } catch (err) {
      return `*(Error calculating draft: ${err.message})*`;
    }
  }

  // Handler: Checkout & Finalization
  async handleCheckoutIntent(userId, text) {
    const lower = text.toLowerCase();
    const draft = this.getDraft(userId);

    if (!draft || draft.items.length === 0) {
      return { reply: '❌ There are no items in the active draft bill to checkout. Add items first (e.g. *"Add 2 Maggi"*).' };
    }

    let paymentMethod = 'CASH';
    let customerId = null;

    if (lower.includes('upi')) paymentMethod = 'UPI';
    if (lower.includes('card')) paymentMethod = 'CARD';
    if (lower.includes('credit') || lower.includes('khata')) paymentMethod = 'CREDIT';

    // Customer match for khata or identified sale
    const customers = db.prepare('SELECT * FROM customers WHERE store_id = ?').all(this.storeId);
    for (const c of customers) {
      if (lower.includes(c.name.toLowerCase().split(' ')[0])) {
        customerId = c.id;
        break;
      }
    }

    if (paymentMethod === 'CREDIT' && !customerId) {
      return {
        reply: `❓ Which customer's khata should this be billed to? (e.g., *"Bill to Ramesh on credit"*). Available customers: ${customers.map(c => c.name).join(', ')}.`
      };
    }

    try {
      const result = await executeCheckout({
        storeId: this.storeId,
        userId: 'user-owner-1',
        customerId,
        channel: 'TELEGRAM',
        items: draft.items,
        paymentMethod,
        paymentReference: 'Telegram-Assisted'
      });

      // Clear draft on success
      this.clearDraft(userId);

      let msg = `🎉 **Sale Finalized Successfully!**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `• **Invoice Number**: \`${result.invoiceNumber}\`\n` +
                `• **Total Amount**: **₹${result.grandTotal.toFixed(2)}**\n` +
                `• **Payment Status**: Recorded (${paymentMethod})\n` +
                `• **Items Count**: ${result.itemsCount}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📄 **Tax Invoice PDF**: [Download Invoice](${result.pdfInvoiceUrl})\n\n` +
                `*Draft cleared. Type \`/new\` or add new items anytime.*`;

      return {
        reply: msg,
        invoiceUrl: result.pdfInvoiceUrl,
        saleId: result.saleId
      };
    } catch (err) {
      return {
        reply: `🛑 **Checkout Failed**: ${err.message}\nDraft items preserved. Fix the issue or type \`/new\` to reset.`
      };
    }
  }
}
