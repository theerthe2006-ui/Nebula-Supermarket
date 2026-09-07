import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, CreditCard, Banknote, 
  Smartphone, BookOpen, ShieldCheck, Download, ArrowRight, ArrowLeft, MapPin, Truck, Plus 
} from 'lucide-react';

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  cartItems, 
  calculation, 
  user,
  onFinalizeCheckout
}) {
  if (!isOpen) return null;

  const [step, setStep] = useState(1);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddrId, setSelectedAddrId] = useState(null);
  const [deliveryOption, setDeliveryOption] = useState('EXPRESS');
  const [paymentMethod, setPaymentMethod] = useState('DEMO_PAYMENT');
  const [paymentRef, setPaymentRef] = useState('');
  
  // Payment Processing State Machine
  const [paymentState, setPaymentState] = useState('IDLE'); // IDLE, PROCESSING, SUCCESS, FAILED
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Inline address form
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [addrForm, setAddrForm] = useState({
    name: user?.username || 'Rahul Verma',
    phone: user?.phone || '+91 98765 43210',
    addressLine1: 'Flat 402, Sunshine Apartments, 4th Main',
    addressLine2: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    landmark: 'Near Metro Station',
    addressType: 'HOME',
    isDefault: true
  });

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    try {
      const token = localStorage.getItem('nebula_token');
      const res = await fetch('/api/addresses', {
        headers: { 'x-session-id': token || '' }
      }).then(r => r.json());

      if (res.success && res.addresses.length > 0) {
        setAddresses(res.addresses);
        const def = res.addresses.find(a => a.is_default) || res.addresses[0];
        setSelectedAddrId(def.id);
      }
    } catch (e) {}
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('nebula_token');
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': token || '' },
        body: JSON.stringify(addrForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowAddAddr(false);
        fetchAddresses();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExecutePaymentAndOrder = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    setPaymentState('PROCESSING');

    // Simulate payment state processing delay
    setTimeout(async () => {
      try {
        const res = await onFinalizeCheckout({
          items: cartItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod,
          addressId: selectedAddrId,
          paymentReference: paymentRef
        });
        setCheckoutResult(res);
        setPaymentState('SUCCESS');
        setStep(6); // Success Step
      } catch (err) {
        setPaymentState('FAILED');
        setErrorMessage(err.message || 'Payment processing or checkout failed.');
      } finally {
        setIsSubmitting(false);
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850/50">
          <div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
              Step {step} of 6
            </span>
            <h3 className="font-extrabold text-lg text-white">
              {step === 1 && '1. Select Delivery Address'}
              {step === 2 && '2. Choose Delivery Slot'}
              {step === 3 && '3. Order Items Summary'}
              {step === 4 && '4. Payment Method Selection'}
              {step === 5 && '5. Payment Verification State'}
              {step === 6 && '6. Order Placed Successfully'}
            </h3>
          </div>
          {step !== 6 && (
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">

          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Address Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-400">Select where your supermarket order should be delivered:</p>
                <button
                  onClick={() => setShowAddAddr(!showAddAddr)}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Address
                </button>
              </div>

              {showAddAddr && (
                <form onSubmit={handleAddAddress} className="bg-slate-850 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                  <h4 className="font-bold text-white">New Address</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" required placeholder="Name" value={addrForm.name} onChange={e => setAddrForm({ ...addrForm, name: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                    <input type="tel" required placeholder="Phone" value={addrForm.phone} onChange={e => setAddrForm({ ...addrForm, phone: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                  </div>
                  <input type="text" required placeholder="Address Line 1" value={addrForm.addressLine1} onChange={e => setAddrForm({ ...addrForm, addressLine1: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" required placeholder="City" value={addrForm.city} onChange={e => setAddrForm({ ...addrForm, city: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                    <input type="text" required placeholder="State" value={addrForm.state} onChange={e => setAddrForm({ ...addrForm, state: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                    <input type="text" required placeholder="Pincode" value={addrForm.pincode} onChange={e => setAddrForm({ ...addrForm, pincode: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
                  </div>
                  <button type="submit" className="w-full bg-emerald-600 font-bold text-white py-1.5 rounded-lg mt-2">Save Address</button>
                </form>
              )}

              {addresses.length === 0 ? (
                <div className="p-6 bg-slate-850 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                  <MapPin className="w-6 h-6 mx-auto text-slate-500" />
                  <p>No addresses found. Click "Add New Address" above to set your delivery location.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {addresses.map(addr => (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddrId(addr.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                        selectedAddrId === addr.id
                          ? 'bg-emerald-500/10 border-emerald-500 text-white'
                          : 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{addr.name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {addr.address_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{addr.address_line1}, {addr.city} - {addr.pincode}</p>
                        <p className="text-[11px] text-slate-500">Phone: {addr.phone}</p>
                      </div>
                      {selectedAddrId === addr.id && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Delivery Speed */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Choose delivery option:</p>
              {[
                { id: 'EXPRESS', title: 'Nebula Express (30 Mins)', desc: 'Instant super-fast delivery from nearest hub', fee: 'FREE on ₹499+' },
                { id: 'SCHEDULED', title: 'Scheduled Evening Slot', desc: 'Delivered today between 6:00 PM - 8:00 PM', fee: 'FREE' }
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setDeliveryOption(opt.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                    deliveryOption === opt.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-white'
                      : 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-white">{opt.title}</h4>
                      <p className="text-xs text-slate-400">{opt.desc}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">{opt.fee}</span>
                </div>
              ))}
            </div>
          )}

          {/* STEP 3: Order Review */}
          {step === 3 && calculation && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Review items in your order:</p>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                {cartItems.map(item => (
                  <div key={item.productId} className="p-3 bg-slate-850 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold text-white">{item.name}</span>
                      <p className="text-slate-400">{item.packSize} • Qty: {item.quantity}</p>
                    </div>
                    <span className="font-bold text-slate-200">
                      ₹{(item.sellingPrice * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-slate-850 border border-slate-800 rounded-2xl p-4 space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span>₹{Number(calculation.subtotal || 0).toFixed(2)}</span>
                </div>
                {calculation.discount_total > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Offers Discount:</span>
                    <span>-₹{Number(calculation.discount_total || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Taxes (CGST + SGST):</span>
                  <span>₹{Number(calculation.total_tax || 0).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline text-base font-black text-white">
                  <span>Grand Total</span>
                  <span className="text-emerald-400 text-xl">₹{Number(calculation.grand_total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Payment Method */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Select payment method:</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'DEMO_PAYMENT', label: 'DEMO PAYMENT', icon: ShieldCheck, desc: 'Academic demo fallback (No charge)', recommended: true },
                  { id: 'UPI', label: 'UPI / QR Code', icon: Smartphone, desc: 'Google Pay, PhonePe, Paytm' },
                  { id: 'CARD', label: 'Credit / Debit Card', icon: CreditCard, desc: 'Visa, Mastercard, RuPay' },
                  { id: 'CASH', label: 'Cash on Delivery', icon: Banknote, desc: 'Pay cash upon delivery' }
                ].map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition ${
                        paymentMethod === m.id
                          ? 'bg-emerald-600/15 border-emerald-500 text-white shadow-lg'
                          : 'bg-slate-850 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-emerald-400 mb-2" />
                      <div>
                        <div className="flex items-center gap-1">
                          <h4 className="font-bold text-sm text-white">{m.label}</h4>
                          {m.recommended && <span className="text-[9px] bg-emerald-500 text-slate-950 px-1.5 font-bold rounded">RECOMMENDED</span>}
                        </div>
                        <p className="text-[11px] text-slate-400">{m.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Truth-in-Payment Notice (Rule 3) */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>TRUTH IN PAYMENT NOTICE</strong>: Demo payment mode active. No real money will be charged to your bank account.
                </span>
              </div>
            </div>
          )}

          {/* STEP 5: Payment Processing & Verification State */}
          {step === 5 && (
            <div className="space-y-4 text-center py-6">
              {paymentState === 'PROCESSING' ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <h4 className="font-extrabold text-base text-white">Verifying Demo Payment State...</h4>
                  <p className="text-xs text-slate-400">Communicating with backend payment state machine.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h4 className="font-extrabold text-lg text-white">Confirm & Finalize Supermarket Order</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Finalizing will record your order, decrement store inventory atomically, and generate your PDF tax invoice.
                  </p>
                  <div className="text-2xl font-black text-emerald-400">
                    ₹{Number(calculation?.grand_total || 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: Success Receipt */}
          {step === 6 && checkoutResult && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center mx-auto mb-2 font-black shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="font-extrabold text-xl text-white">Order Confirmed!</h4>
              
              <div className="bg-slate-850 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-400">Invoice Number:</span>
                  <span className="font-mono font-bold text-white">{checkoutResult.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount Settled:</span>
                  <span className="font-bold text-emerald-400">₹{Number(checkoutResult.grandTotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Status:</span>
                  <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-semibold">
                    {checkoutResult.paymentHonestyMessage}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <a
                  href={checkoutResult.pdfInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" /> Download PDF Tax Invoice
                </a>
              </div>
            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex items-center justify-between">
          {step > 1 && step < 6 ? (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step < 5 && (
            <button
              onClick={() => {
                if (step === 1 && !selectedAddrId) return alert('Please select a delivery address');
                setStep(step + 1);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 5 && (
            <button
              onClick={handleExecutePaymentAndOrder}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/30"
            >
              {isSubmitting ? 'Processing Payment...' : 'Confirm & Place Order'}
            </button>
          )}

          {step === 6 && (
            <button
              onClick={onClose}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs"
            >
              Done & Start Shopping
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
