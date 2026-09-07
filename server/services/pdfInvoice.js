import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INVOICES_DIR = path.join(__dirname, '..', '..', 'data', 'invoices');

if (!fs.existsSync(INVOICES_DIR)) {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

export function generateInvoicePDF({ store, sale, items, customer, payment }) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `${sale.invoice_number}.pdf`;
      const filePath = path.join(INVOICES_DIR, fileName);
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header Banner
      doc.rect(40, 40, 515, 60).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(store.name, 55, 52);
      doc.fontSize(9).font('Helvetica').fillColor('#94a3b8').text(`${store.legal_name} | GSTIN: ${store.gstin}`, 55, 75);
      doc.text(`${store.address_line1}, ${store.city}, ${store.state} - ${store.pincode} | Phone: ${store.phone}`, 55, 87);

      doc.moveDown(3);
      doc.fillColor('#0f172a');

      // Invoice Details Block
      const startY = 120;
      doc.fontSize(12).font('Helvetica-Bold').text('TAX INVOICE', 40, startY);
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(`Invoice No: ${sale.invoice_number}`, 40, startY + 18);
      doc.text(`Date & Time: ${new Date(sale.created_at || Date.now()).toLocaleString('en-IN')}`, 40, startY + 30);
      doc.text(`Channel: ${sale.channel === 'TELEGRAM' ? 'Telegram AI Assistant' : 'Web Commerce POS'}`, 40, startY + 42);

      // Customer Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Billed To:', 340, startY);
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      if (customer) {
        doc.text(`Name: ${customer.name}`, 340, startY + 16);
        doc.text(`Phone: ${customer.phone}`, 340, startY + 28);
        doc.text(`Khata Balance: ₹${Number(customer.current_balance || 0).toFixed(2)}`, 340, startY + 40);
      } else {
        doc.text('Counter Customer (Walk-in)', 340, startY + 16);
      }

      // Line Separator
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, 180).lineTo(555, 180).stroke();

      // Items Table Header
      let tableY = 195;
      doc.rect(40, tableY - 5, 515, 20).fill('#f1f5f9');
      doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold');
      doc.text('#', 45, tableY);
      doc.text('Item Description', 65, tableY);
      doc.text('HSN', 240, tableY);
      doc.text('Qty', 290, tableY);
      doc.text('Rate', 330, tableY);
      doc.text('Taxable', 380, tableY);
      doc.text('GST', 440, tableY);
      doc.text('Total', 500, tableY, { align: 'right', width: 50 });

      tableY += 22;
      doc.font('Helvetica').fontSize(8).fillColor('#334155');

      items.forEach((item, index) => {
        doc.text(`${index + 1}`, 45, tableY);
        doc.text(item.product_name, 65, tableY, { width: 170, ellipsis: true });
        doc.text(item.hsn_code, 240, tableY);
        doc.text(`${item.quantity}`, 290, tableY);
        doc.text(`₹${Number(item.unit_selling_price).toFixed(2)}`, 330, tableY);
        doc.text(`₹${Number(item.taxable_value).toFixed(2)}`, 380, tableY);
        doc.text(`${item.gst_rate}%`, 440, tableY);
        doc.text(`₹${Number(item.total_amount).toFixed(2)}`, 500, tableY, { align: 'right', width: 50 });
        tableY += 18;
      });

      // Line Separator
      doc.strokeColor('#e2e8f0').moveTo(40, tableY + 5).lineTo(555, tableY + 5).stroke();

      // Calculation Summary
      let summaryY = tableY + 15;
      doc.rect(340, summaryY, 215, 110).fill('#f8fafc');
      doc.strokeColor('#cbd5e1').rect(340, summaryY, 215, 110).stroke();

      doc.fillColor('#334155').fontSize(9).font('Helvetica');
      doc.text('Subtotal:', 355, summaryY + 10);
      doc.text(`₹${Number(sale.subtotal).toFixed(2)}`, 480, summaryY + 10, { align: 'right', width: 65 });

      doc.text('Discount:', 355, summaryY + 25);
      doc.text(`- ₹${Number(sale.discount_total || 0).toFixed(2)}`, 480, summaryY + 25, { align: 'right', width: 65 });

      doc.text('Taxable Amount:', 355, summaryY + 40);
      doc.text(`₹${Number(sale.taxable_amount).toFixed(2)}`, 480, summaryY + 40, { align: 'right', width: 65 });

      doc.text('CGST:', 355, summaryY + 55);
      doc.text(`₹${Number(sale.cgst_amount || 0).toFixed(2)}`, 480, summaryY + 55, { align: 'right', width: 65 });

      doc.text('SGST:', 355, summaryY + 70);
      doc.text(`₹${Number(sale.sgst_amount || 0).toFixed(2)}`, 480, summaryY + 70, { align: 'right', width: 65 });

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
      doc.text('Grand Total:', 355, summaryY + 90);
      doc.text(`₹${Number(sale.grand_total).toFixed(2)}`, 460, summaryY + 90, { align: 'right', width: 85 });

      // Payment Status Badge
      const paymentY = summaryY + 125;
      doc.rect(40, paymentY, 515, 45).fill('#ecfdf5');
      doc.strokeColor('#10b981').lineWidth(1).rect(40, paymentY, 515, 45).stroke();

      doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(10);
      doc.text(`PAYMENT STATUS: RECORDED (${payment.payment_method})`, 55, paymentY + 12);
      doc.font('Helvetica').fontSize(8).fillColor('#047857');
      doc.text(
        `Amount: ₹${Number(payment.amount).toFixed(2)} | Method recorded by store cashier. No fake gateway simulation.`,
        55,
        paymentY + 26
      );

      // Footer
      doc.fontSize(8).fillColor('#94a3b8').text(
        'Thank you for shopping at Nebula Supermarket! This is a genuine computer-generated tax invoice.',
        40,
        740,
        { align: 'center', width: 515 }
      );

      doc.end();

      stream.on('finish', () => {
        resolve({ fileName, filePath });
      });

      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}
