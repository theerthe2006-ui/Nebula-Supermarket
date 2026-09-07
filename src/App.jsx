import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Boxes, CheckCircle2,
  ChevronRight, Clock3, Package, RefreshCw, ShieldCheck, ShoppingBag,
  Tag, TrendingUp, Users, Store, ArrowRight
} from 'lucide-react';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import ProductCard from './components/ProductCard';
import CartDrawer from './components/CartDrawer';
import CheckoutModal from './components/CheckoutModal';
import NotificationCenter from './components/NotificationCenter';
import TelegramConsole from './components/TelegramConsole';
import AuthModal from './components/AuthModal';
import ProductDetailModal from './components/ProductDetailModal';
import AccountDashboard from './components/AccountDashboard';
import Storefront from './components/Storefront';

const emptyCalculation = {
  items: [],
  subtotal: 0,
  discount_total: 0,
  taxable_amount: 0,
  cgst_amount: 0,
  sgst_amount: 0,
  total_tax: 0,
  grand_total: 0
};

async function api(url, options = {}) {
  const token = localStorage.getItem('nebula_token') || '';
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': token,
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function StatCard({ icon: Icon, label, value, hint, tone = 'emerald' }) {
  const tones = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
  };
  return (
    <div className="bg-slate-850/80 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</p>
          <p className="text-2xl font-black text-white mt-1">{value}</p>
          {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tones[tone] || tones.emerald}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Authentication & Mode State
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('CUSTOMER');
  const [portalMode, setPortalMode] = useState('STOREFRONT'); // STOREFRONT vs OPERATIONS
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sortOption, setSortOption] = useState('popularity');

  // Core Data
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]);
  const [wishlistIds, setWishlistIds] = useState([]);

  // Cart State
  const [cart, setCart] = useState([]);
  const [calculation, setCalculation] = useState(emptyCalculation);

  // Modals & Drawers
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Check auth status on initial load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('nebula_token');
      if (!token) return;
      try {
        const data = await api('/api/auth/me');
        if (data.authenticated && data.user) {
          setUser(data.user);
          setRole(data.user.role || 'CUSTOMER');
        }
      } catch (e) {
        localStorage.removeItem('nebula_token');
      }
    };
    checkAuth();
  }, []);

  const loadCoreData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [productData, customerData, notificationData, dashboardData, orderData, offerData, categoryData] =
        await Promise.all([
          api(`/api/products?role=${encodeURIComponent(role)}&search=${encodeURIComponent(searchQuery)}&category=${encodeURIComponent(category)}&sort=${encodeURIComponent(sortOption)}`),
          api('/api/khata/customers').catch(() => ({ customers: [] })),
          api('/api/notifications').catch(() => ({ notifications: [] })),
          api('/api/analytics/dashboard').catch(() => null),
          api('/api/billing/orders').catch(() => ({ orders: [] })),
          api('/api/offers').catch(() => ({ offers: [] })),
          api('/api/products/categories').catch(() => ({ categories: [] }))
        ]);

      setProducts(productData.products || []);
      setCustomers(customerData.customers || []);
      setNotifications(notificationData.notifications || []);
      setDashboard(dashboardData);
      setOrders(orderData.orders || []);
      setOffers(offerData.offers || []);
      setCategories(categoryData.categories || []);

      if (user) {
        const wishData = await api('/api/wishlist').catch(() => ({ wishlist: [] }));
        setWishlistIds((wishData.wishlist || []).map(w => w.product_id));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [role, searchQuery, category, sortOption, user]);

  useEffect(() => {
    const timer = setTimeout(loadCoreData, 200);
    return () => clearTimeout(timer);
  }, [loadCoreData]);

  const recalculateCart = useCallback(async (items) => {
    if (!items.length) {
      setCalculation(emptyCalculation);
      return;
    }
    try {
      const data = await api('/api/billing/calculate', {
        method: 'POST',
        body: JSON.stringify({ items: items.map(i => ({ productId: i.productId, quantity: i.quantity })) })
      });
      setCalculation(data.calculation || emptyCalculation);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    recalculateCart(cart);
  }, [cart, recalculateCart]);

  const addToCart = (product) => {
    const qty = product.quantity || 1;
    setCart(prev => {
      const existing = prev.find(x => x.productId === product.id);
      if (existing) {
        return prev.map(x => x.productId === product.id
          ? { ...x, quantity: Math.min(Number(product.stock_quantity), x.quantity + qty) }
          : x);
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        packSize: product.pack_size,
        sellingPrice: Number(product.selling_price),
        quantity: qty
      }];
    });
    showToast(`Added "${product.name}" to cart`);
    setCartOpen(true);
  };

  const handleBuyNow = (product) => {
    addToCart(product);
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const updateQty = (productId, quantity) => {
    const product = products.find(p => p.id === productId);
    const max = product ? Number(product.stock_quantity) : Infinity;
    const next = Math.min(max, Number(quantity));
    setCart(prev => next <= 0
      ? prev.filter(x => x.productId !== productId)
      : prev.map(x => x.productId === productId ? { ...x, quantity: next } : x));
  };

  const removeItem = (productId) => setCart(prev => prev.filter(x => x.productId !== productId));
  const clearCart = () => {
    setCart([]);
    setCalculation(emptyCalculation);
  };

  const toggleWishlist = async (productId) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      const data = await api('/api/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId })
      });
      if (data.added) {
        setWishlistIds(prev => [...prev, productId]);
        showToast('Added to Wishlist');
      } else {
        setWishlistIds(prev => prev.filter(id => id !== productId));
        showToast('Removed from Wishlist');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const finalizeCheckout = async (payload) => {
    const data = await api('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setCart([]);
    setCalculation(emptyCalculation);
    await loadCoreData();
    return data;
  };

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('nebula_token');
    setUser(null);
    setRole('CUSTOMER');
    setAccountOpen(false);
    showToast('Signed out successfully.');
  };

  const markRead = async (id) => {
    await api('/api/notifications/mark-read', { method: 'POST', body: JSON.stringify({ id }) });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  const markAllRead = async () => {
    await api('/api/notifications/mark-all-read', { method: 'POST', body: JSON.stringify({}) });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity), 0);

  // Operations Dashboard Rendering (For Store Owner / Staff)
  const renderOperationsDashboard = () => (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            Live Store Management Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-2">Store Operations Home</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time stats from SQLite backend database.</p>
        </div>
        <button onClick={loadCoreData} className="self-start sm:self-auto px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-700">
          <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
        </button>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard icon={TrendingUp} label="Today's revenue" value={dashboard.hasSalesToday ? `₹${Number(dashboard.todaySales.totalRevenue).toFixed(2)}` : '₹0.00'} hint={dashboard.hasSalesToday ? `${dashboard.todaySales.billsCount} recorded bill(s)` : 'No sales recorded today.'} />
          <StatCard icon={Boxes} label="Low stock" value={dashboard.lowStockCount ?? 0} hint="Products at/below reorder level" tone="amber" />
          <StatCard icon={BookOpen} label="Khata outstanding" value={`₹${Number(dashboard.totalKhataBalance || 0).toFixed(2)}`} hint="Current customer credit balance" tone="sky" />
          <StatCard icon={ShieldCheck} label="Tax recorded today" value={`₹${Number(dashboard.todaySales?.totalTax || 0).toFixed(2)}`} hint="CGST + SGST" />
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-slate-850/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-white">Recent orders</h2>
              <p className="text-xs text-slate-500">Persisted sales only</p>
            </div>
            <button onClick={() => setActiveTab('orders')} className="text-xs font-bold text-emerald-400">View all <ChevronRight className="w-3 h-3 inline" /></button>
          </div>
          {orders.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No sales recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{order.invoice_number}</p>
                    <p className="text-[11px] text-slate-500">{order.customer_name || 'Walk-in Customer'} • {order.payment_method || '—'}</p>
                  </div>
                  <span className="text-sm font-black text-emerald-400">₹{Number(order.grand_total).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-slate-850/70 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-bold text-white">Low-stock watch</h2>
          <p className="text-xs text-slate-500 mb-4">Database threshold alerts</p>
          <div className="space-y-2">
            {(dashboard?.lowStockItems || []).map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-500">{item.stock_quantity} {item.unit}s remaining</p>
                </div>
              </div>
            ))}
            {!(dashboard?.lowStockItems || []).length && <p className="text-xs text-slate-500 py-6 text-center">No low-stock products recorded.</p>}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 lg:pb-0 font-sans">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        unreadCount={unreadCount}
        onToggleTelegram={() => setTelegramOpen(v => !v)}
        isTelegramOpen={telegramOpen}
        user={user}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={handleLogout}
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
        portalMode={portalMode}
        setPortalMode={setPortalMode}
        onOpenAccount={() => setAccountOpen(true)}
        wishlistCount={wishlistIds.length}
      />

      <div className="flex min-h-[calc(100vh-65px)]">
        
        {portalMode === 'OPERATIONS' && (
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} role={role} onOpenTelegram={() => setTelegramOpen(true)} />
        )}

        <main className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            
            {error && (
              <div className="mb-4 p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3">
                <span>{error}</span>
                <button onClick={() => setError('')} className="font-bold underline">Dismiss</button>
              </div>
            )}

            {/* View Mode Switching: CUSTOMER STOREFRONT vs OWNER PORTAL vs ACCOUNT DASHBOARD */}
            {accountOpen ? (
              <AccountDashboard
                user={user}
                onLogout={handleLogout}
                onAddToCart={addToCart}
              />
            ) : portalMode === 'STOREFRONT' ? (
              <Storefront
                products={products}
                categories={categories}
                category={category}
                setCategory={setCategory}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortOption={sortOption}
                setSortOption={setSortOption}
                cart={cart}
                onAddToCart={addToCart}
                onUpdateQty={updateQty}
                onOpenProductDetail={(prod) => setSelectedProductDetail(prod)}
                onToggleWishlist={toggleWishlist}
                wishlistIds={wishlistIds}
                role={role}
              />
            ) : (
              renderOperationsDashboard()
            )}

          </div>
        </main>
      </div>

      {portalMode === 'OPERATIONS' && (
        <MobileNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenCart={() => setCartOpen(true)}
          cartCount={cartCount}
        />
      )}

      {/* Drawers & Modals */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        calculation={calculation}
        onUpdateQty={updateQty}
        onRemoveItem={removeItem}
        onClearCart={clearCart}
        onProceedToCheckout={() => {
          if (!user) {
            setCartOpen(false);
            setAuthOpen(true);
            return;
          }
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cartItems={cart}
        calculation={calculation}
        user={user}
        onFinalizeCheckout={finalizeCheckout}
      />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLoginSuccess={(loggedUser, token) => {
          setUser(loggedUser);
          setRole(loggedUser.role || 'CUSTOMER');
          showToast(`Welcome back, ${loggedUser.username}!`);
          loadCoreData();
        }}
      />

      <ProductDetailModal
        product={selectedProductDetail}
        isOpen={Boolean(selectedProductDetail)}
        onClose={() => setSelectedProductDetail(null)}
        onAddToCart={addToCart}
        onBuyNow={handleBuyNow}
        onToggleWishlist={toggleWishlist}
        isWishlisted={selectedProductDetail ? wishlistIds.includes(selectedProductDetail.id) : false}
      />

      <NotificationCenter
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
      />

      <TelegramConsole
        isOpen={telegramOpen}
        onClose={() => setTelegramOpen(false)}
        onRefreshData={loadCoreData}
      />

    </div>
  );
}
