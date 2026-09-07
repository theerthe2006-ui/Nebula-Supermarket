import React, { useState } from 'react';
import { 
  ShoppingBag, Bell, Search, MapPin, User, LogIn, Heart, 
  Sparkles, Menu, ShieldCheck, ChevronDown, Store 
} from 'lucide-react';

export default function Navbar({
  cartCount,
  onOpenCart,
  onOpenNotifications,
  unreadCount,
  onToggleTelegram,
  isTelegramOpen,
  user,
  onOpenAuth,
  onLogout,
  onSearch,
  searchQuery,
  portalMode,
  setPortalMode,
  onOpenAccount,
  wishlistCount = 0
}) {
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('Indiranagar, Bengaluru');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      
      {/* Top Banner Notice */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        
        {/* Logo & Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-emerald-500/20">
            N
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg text-white tracking-tight">NEBULA</span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                SUPERMARKET
              </span>
            </div>
            {/* Location Selector */}
            <button
              onClick={() => setShowLocationModal(!showLocationModal)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
            >
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span className="font-medium truncate">{selectedLocation}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Central Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search 50+ fresh products, brands, staples..."
              className="w-full bg-slate-850 border border-slate-750 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner"
            />
          </div>
        </div>

        {/* Right Actions Header */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Portal Switcher (Customer vs Store Ops) */}
          <button
            onClick={() => setPortalMode(portalMode === 'STOREFRONT' ? 'OPERATIONS' : 'STOREFRONT')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-bold text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Store className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">
              {portalMode === 'STOREFRONT' ? 'Owner Portal' : 'Customer Shop'}
            </span>
          </button>

          {/* AI Telegram Assistant Console Toggle */}
          <button
            onClick={onToggleTelegram}
            className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
              isTelegramOpen
                ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span className="hidden xl:inline">AI Agent</span>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-slate-850 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Account Button / User Profile */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => onOpenAccount()}
                className="flex items-center gap-2 p-1.5 pr-3 rounded-2xl bg-slate-850 border border-slate-800 text-slate-300 hover:border-slate-700 transition"
              >
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center border border-emerald-500/30">
                  {user.username ? user.username[0].toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-bold text-white hidden sm:inline max-w-[100px] truncate">
                  {user.username}
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Cart Icon */}
          <button
            onClick={onOpenCart}
            className="relative p-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="bg-slate-950 text-emerald-400 px-1.5 py-0.2 rounded-md text-xs font-black">
                {cartCount}
              </span>
            )}
          </button>

        </div>

      </div>

      {/* Mobile Search Bar Row */}
      <div className="md:hidden px-4 pb-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search groceries & products..."
            className="w-full bg-slate-850 border border-slate-750 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

    </header>
  );
}
