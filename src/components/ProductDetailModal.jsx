import React, { useState } from 'react';
import { X, Star, Heart, ShoppingBag, Truck, ShieldCheck, Tag, Minus, Plus, ArrowRight } from 'lucide-react';

export default function ProductDetailModal({ product, isOpen, onClose, onAddToCart, onBuyNow, onToggleWishlist, isWishlisted }) {
  if (!isOpen || !product) return null;

  const [qty, setQty] = useState(1);
  const [imgError, setImgError] = useState(false);

  const discountPercent = product.mrp > product.selling_price
    ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
    : 0;

  const handleAdd = () => {
    onAddToCart({ ...product, quantity: qty });
  };

  const handleBuy = () => {
    onBuyNow({ ...product, quantity: qty });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-8 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850/50">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              {product.category}
            </span>
            <span className="text-xs text-slate-400">SKU: {product.sku}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 grid md:grid-cols-2 gap-6">
          
          {/* Left Column: Image & Badges */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl bg-slate-850 border border-slate-800 overflow-hidden flex items-center justify-center p-4 group">
              <img
                src={imgError ? '/assets/placeholder.svg' : (product.image_url || '/assets/placeholder.svg')}
                alt={product.name}
                onError={() => setImgError(true)}
                className="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-300"
              />

              {discountPercent > 0 && (
                <span className="absolute top-3 left-3 bg-emerald-500 text-slate-950 text-xs font-black px-2.5 py-1 rounded-lg shadow-md">
                  {discountPercent}% OFF
                </span>
              )}

              <button
                onClick={() => onToggleWishlist(product.id)}
                className="absolute top-3 right-3 p-2.5 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-rose-500 hover:bg-slate-900 transition"
              >
                <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            </div>

            {/* Quick Guarantees */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Express 30-Min Supermarket Delivery</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>100% Quality Fresh Guarantee</span>
              </div>
            </div>
          </div>

          {/* Right Column: Product Info & Actions */}
          <div className="space-y-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {product.brand}
              </span>
              <h2 className="text-xl font-black text-white leading-tight">{product.name}</h2>
              
              {/* Rating & Pack size */}
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-amber-400 text-xs font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{product.rating || 4.8}</span>
                  <span className="text-slate-500 font-normal">({product.review_count || 120} reviews)</span>
                </div>
                <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-lg font-medium">
                  Net Wt: {product.pack_size}
                </span>
              </div>

              {/* Price & MRP */}
              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-2xl font-black text-emerald-400">
                  ₹{Number(product.selling_price).toFixed(2)}
                </span>
                {product.mrp > product.selling_price && (
                  <span className="text-sm text-slate-500 line-through">
                    MRP ₹{Number(product.mrp).toFixed(2)}
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-medium">Inclusive of all taxes (GST {product.gst_rate}%)</span>
              </div>

              {/* Description */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Product Highlights</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{product.description}</p>
              </div>

              {/* Stock Status Indicator */}
              <div className="mt-4 flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-400">Availability:</span>
                {product.stock_quantity > 10 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    In Stock ({product.stock_quantity} {product.unit}s available)
                  </span>
                ) : product.stock_quantity > 0 ? (
                  <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    Low Stock (Only {product.stock_quantity} left!)
                  </span>
                ) : (
                  <span className="text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                    Out of Stock
                  </span>
                )}
              </div>
            </div>

            {/* Quantity Selector & Action Buttons */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase">Quantity</span>
                <div className="flex items-center border border-slate-700 rounded-xl bg-slate-850 overflow-hidden">
                  <button
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-4 py-1.5 text-xs font-black text-white">{qty}</span>
                  <button
                    onClick={() => setQty(Math.min(product.stock_quantity || 99, qty + 1))}
                    className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleAdd}
                  disabled={product.stock_quantity <= 0}
                  className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-40"
                >
                  <ShoppingBag className="w-4 h-4 text-emerald-400" /> Add to Cart
                </button>
                <button
                  onClick={handleBuy}
                  disabled={product.stock_quantity <= 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-40"
                >
                  Buy Now <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
