import React, { useState } from 'react';
import { 
  Sparkles, Tag, ShoppingBag, ArrowRight, Zap, ShieldCheck, 
  Truck, Search, Star, Heart, SlidersHorizontal, ChevronRight, MapPin, Layers
} from 'lucide-react';
import ProductCard from './ProductCard';

export default function Storefront({
  products,
  categories,
  category,
  setCategory,
  searchQuery,
  setSearchQuery,
  sortOption,
  setSortOption,
  cart,
  onAddToCart,
  onUpdateQty,
  onOpenProductDetail,
  onToggleWishlist,
  wishlistIds = [],
  role = 'CUSTOMER'
}) {
  const [activeBanner, setActiveBanner] = useState(0);

  const heroBanners = [
    {
      id: 1,
      title: 'Fresh Farm Produce & Grocery',
      subtitle: 'Up to 40% OFF on organic fruits, crisp vegetables & dairy daily essentials.',
      cta: 'Shop Fresh Now',
      category: 'Fruits & Vegetables',
      bgColor: 'from-emerald-900 via-slate-900 to-slate-950',
      badge: 'WEEKEND SUPER SAVER'
    },
    {
      id: 2,
      title: 'Daily Staples & Kitchen Essentials',
      subtitle: 'Pure Chakki Atta, Premium Basmati Rice, Edible Oils & Spices at wholesale rates.',
      cta: 'Explore Staples',
      category: 'Rice, Atta & Staples',
      bgColor: 'from-amber-950 via-slate-900 to-slate-950',
      badge: 'BEST PRICE GUARANTEE'
    },
    {
      id: 3,
      title: 'Snacks, Beverages & Biscuits Fest',
      subtitle: 'Stock up your pantry with favorite packaged foods, chocolates & juices.',
      cta: 'Grab Deals',
      category: 'Snacks & Chips',
      bgColor: 'from-purple-950 via-slate-900 to-slate-950',
      badge: 'INSTANT 30-MIN DELIVERY'
    }
  ];

  const dealsProducts = products.filter(p => p.is_deal || (p.mrp - p.selling_price) > 10).slice(0, 6);
  const featuredProducts = products.filter(p => p.is_featured || p.rating >= 4.8).slice(0, 6);

  return (
    <div className="space-y-8">
      
      {/* Top Banner Ticker */}
      <div className="bg-emerald-600/15 border border-emerald-500/20 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-300">
        <div className="flex items-center gap-2 font-semibold truncate">
          <Zap className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <span className="truncate">Nebula Express: Guaranteed 30-minute delivery to your doorstep in Bengaluru!</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-400 font-bold">
          <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-emerald-400" /> Free delivery on ₹499+</span>
          <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> 100% Freshness Guarantee</span>
        </div>
      </div>

      {/* Hero Banner Carousel Section */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        <div className={`bg-gradient-to-r ${heroBanners[activeBanner].bgColor} p-6 sm:p-10 min-h-[220px] sm:min-h-[280px] flex flex-col justify-between transition-all duration-500`}>
          
          <div className="space-y-3 max-w-xl">
            <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full inline-block">
              {heroBanners[activeBanner].badge}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight">
              {heroBanners[activeBanner].title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              {heroBanners[activeBanner].subtitle}
            </p>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setCategory(heroBanners[activeBanner].category)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5"
            >
              {heroBanners[activeBanner].cta} <ArrowRight className="w-4 h-4" />
            </button>

            {/* Indicator Dots */}
            <div className="flex gap-2">
              {heroBanners.map((b, idx) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBanner(idx)}
                  className={`h-2 rounded-full transition-all ${activeBanner === idx ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-700'}`}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Category Pills Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" /> Explore Supermarket Categories
          </h3>
          <span className="text-xs text-slate-400 font-medium">{categories.length} categories available</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setCategory('All')}
            className={`px-4 py-2 rounded-2xl text-xs font-extrabold whitespace-nowrap transition border ${
              category === 'All'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                : 'bg-slate-850 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            All Products
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition border ${
                category === c
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                  : 'bg-slate-850 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Today's Super Deals Carousel / Grid */}
      {dealsProducts.length > 0 && category === 'All' && !searchQuery && (
        <div className="space-y-4 bg-slate-850/40 border border-slate-800 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                <Tag className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-extrabold text-base text-white">Today's Super Deals</h3>
                <p className="text-[11px] text-slate-400">Lowest price guaranteed on daily grocery essentials</p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
              Save up to 40%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {dealsProducts.map(prod => (
              <ProductCard
                key={prod.id}
                product={prod}
                role={role}
                inCartQty={cart.find(i => i.productId === prod.id)?.quantity || 0}
                onAddToCart={onAddToCart}
                onUpdateQty={onUpdateQty}
                onViewDetails={() => onOpenProductDetail(prod)}
                onToggleWishlist={() => onToggleWishlist(prod.id)}
                isWishlisted={wishlistIds.includes(prod.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Catalog Grid Header with Sorting & Filtering */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-850/70 border border-slate-800 rounded-2xl p-4">
          <div>
            <h3 className="font-extrabold text-lg text-white">
              {category === 'All' ? 'Complete Product Catalog' : category}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Showing {products.length} product(s) {searchQuery ? `matching "${searchQuery}"` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
            >
              <option value="popularity">Sort by: Popularity</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Customer Rating</option>
              <option value="discount">Biggest Discount</option>
            </select>
          </div>
        </div>

        {/* Product Cards Grid */}
        {products.length === 0 ? (
          <div className="p-12 text-center bg-slate-850/50 border border-slate-800 rounded-3xl space-y-3">
            <Search className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-white">No products found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              We couldn't find any products matching "{searchQuery}" in category "{category}". Try clearing filters or searching for another term.
            </p>
            <button
              onClick={() => { setCategory('All'); setSearchQuery(''); }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-bold text-emerald-400 border border-slate-700"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                role={role}
                inCartQty={cart.find(i => i.productId === product.id)?.quantity || 0}
                onAddToCart={onAddToCart}
                onUpdateQty={onUpdateQty}
                onViewDetails={() => onOpenProductDetail(product)}
                onToggleWishlist={() => onToggleWishlist(product.id)}
                isWishlisted={wishlistIds.includes(product.id)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
