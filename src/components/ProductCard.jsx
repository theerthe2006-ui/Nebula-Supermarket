import React, { useState } from 'react';
import { Star, Heart, Plus, Minus, Eye, ShoppingBag } from 'lucide-react';

export default function ProductCard({
  product,
  role = 'CUSTOMER',
  inCartQty = 0,
  onAddToCart,
  onUpdateQty,
  onViewDetails,
  onToggleWishlist,
  isWishlisted = false
}) {
  const [imgError, setImgError] = useState(false);

  const discountPercent = product.mrp > product.selling_price
    ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
    : 0;

  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= product.reorder_level;
  const isOutOfStock = product.stock_quantity <= 0;

  return (
    <div className="bg-slate-850/90 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between hover:border-slate-700 transition duration-200 group shadow-lg">
      
      {/* Top Image Container */}
      <div className="relative aspect-square rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center p-3">
        
        {/* Product Image */}
        <img
          src={imgError ? '/assets/placeholder.svg' : (product.image_url || '/assets/placeholder.svg')}
          alt={product.name}
          onError={() => setImgError(true)}
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-300"
        />

        {/* Discount Badge */}
        {discountPercent > 0 && (
          <span className="absolute top-2 left-2 bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-md shadow-md">
            {discountPercent}% OFF
          </span>
        )}

        {/* Low Stock Badge */}
        {isLowStock && (
          <span className="absolute bottom-2 left-2 bg-amber-500/90 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded">
            Only {product.stock_quantity} Left!
          </span>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-black px-3 py-1 rounded-lg">
              OUT OF STOCK
            </span>
          </div>
        )}

        {/* Actions Overlay: Wishlist & Quick View */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleWishlist && onToggleWishlist(); }}
            className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-rose-500 transition"
          >
            <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onViewDetails}
            className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-emerald-400 transition"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Info Body */}
      <div className="mt-3 space-y-1 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span className="uppercase tracking-wider truncate font-semibold text-slate-400">{product.brand}</span>
            <span>{product.pack_size}</span>
          </div>

          <h4
            onClick={onViewDetails}
            className="text-xs font-bold text-white line-clamp-2 hover:text-emerald-400 cursor-pointer transition mt-0.5"
          >
            {product.name}
          </h4>

          {/* Rating */}
          <div className="flex items-center gap-1 mt-1 text-[11px]">
            <div className="flex items-center gap-0.5 bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.2 rounded border border-amber-500/20 text-[10px]">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>{product.rating || 4.8}</span>
            </div>
            <span className="text-slate-500 text-[10px]">({product.review_count || 45})</span>
          </div>
        </div>

        {/* Pricing & Cart Action */}
        <div className="pt-2 mt-2 border-t border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black text-emerald-400">
                ₹{Number(product.selling_price).toFixed(2)}
              </span>
              {product.mrp > product.selling_price && (
                <span className="text-[10px] text-slate-500 line-through">
                  ₹{Number(product.mrp).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Cart Quantity Control */}
          {inCartQty > 0 ? (
            <div className="flex items-center border border-emerald-500/50 rounded-xl bg-emerald-500/10 overflow-hidden">
              <button
                type="button"
                onClick={() => onUpdateQty && onUpdateQty(product.id, inCartQty - 1)}
                className="p-1 text-emerald-400 hover:bg-emerald-500/20"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-black text-white">{inCartQty}</span>
              <button
                type="button"
                onClick={() => onUpdateQty && onUpdateQty(product.id, inCartQty + 1)}
                disabled={inCartQty >= product.stock_quantity}
                className="p-1 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => onAddToCart && onAddToCart(product)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-md shadow-emerald-600/20 disabled:opacity-40 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
