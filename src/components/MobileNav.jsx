import React from 'react';
import { LayoutDashboard, ShoppingBag, ShoppingCart, Receipt, MoreHorizontal } from 'lucide-react';

export default function MobileNav({ activeTab, setActiveTab, onOpenCart, cartCount, onOpenMore }) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around">
      
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
          activeTab === 'dashboard' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[10px]">Home</span>
      </button>

      <button
        onClick={() => setActiveTab('catalog')}
        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
          activeTab === 'catalog' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <ShoppingBag className="w-5 h-5" />
        <span className="text-[10px]">Catalog</span>
      </button>

      <button
        onClick={onOpenCart}
        className="relative flex flex-col items-center gap-1 p-2 rounded-xl text-emerald-400 transition"
      >
        <div className="relative">
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold">Cart</span>
      </button>

      <button
        onClick={() => setActiveTab('orders')}
        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
          activeTab === 'orders' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Receipt className="w-5 h-5" />
        <span className="text-[10px]">Orders</span>
      </button>

      <button
        onClick={onOpenMore}
        className="flex flex-col items-center gap-1 p-2 rounded-xl text-slate-400 hover:text-slate-200 transition"
      >
        <MoreHorizontal className="w-5 h-5" />
        <span className="text-[10px]">More</span>
      </button>

    </nav>
  );
}
