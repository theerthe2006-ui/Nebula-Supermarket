import React from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, ShieldAlert } from 'lucide-react';

export default function CartDrawer({ 
  isOpen, 
  onClose, 
  items, 
  calculation, 
  onUpdateQty, 
  onRemoveItem, 
  onClearCart, 
  onProceedToCheckout 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-slate-900 h-full border-l border-slate-800 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-white text-base">Store Cart ({items.length})</h2>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button 
                onClick={onClearCart} 
                className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-rose-500/10 transition"
              >
                Clear
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingBag className="w-12 h-12 text-slate-600 mb-3" />
              <p className="font-semibold text-slate-300 text-sm">Your store cart is empty</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Add products from the catalog or speak commands to the Telegram Assistant to draft a bill.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div 
                key={item.productId}
                className="bg-slate-850 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{item.name}</h4>
                  <p className="text-xs text-slate-400">
                    {item.packSize} • ₹{item.sellingPrice} each
                  </p>
                  <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                    Line Total: ₹{(item.sellingPrice * item.quantity).toFixed(2)}
                  </p>
                </div>

                {/* Quantity Stepper */}
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                  <button 
                    onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-white">
                    {item.quantity}
                  </span>
                  <button 
                    onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button 
                  onClick={() => onRemoveItem(item.productId)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer & Calculations */}
        {items.length > 0 && calculation && (
          <div className="p-4 border-t border-slate-800 bg-slate-850/90 space-y-3">
            
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Subtotal</span>
                <span>₹{Number(calculation.subtotal || 0).toFixed(2)}</span>
              </div>
              
              {calculation.discount_total > 0 && (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Offer Discount</span>
                  <span>- ₹{Number(calculation.discount_total).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-400">
                <span>Taxable Value</span>
                <span>₹{Number(calculation.taxable_amount || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>GST (CGST + SGST)</span>
                <span>₹{Number(calculation.total_tax || 0).toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline text-base font-extrabold text-white">
                <span>Grand Total</span>
                <span className="text-emerald-400 text-lg">
                  ₹{Number(calculation.grand_total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <button 
              onClick={onProceedToCheckout}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-98 transition text-sm"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[10px] text-center text-slate-400">
              * Cart does not lock inventory. Stock is reserved & verified during checkout.
            </p>

          </div>
        )}

      </div>
    </div>
  );
}
