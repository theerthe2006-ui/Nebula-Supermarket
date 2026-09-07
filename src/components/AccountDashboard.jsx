import React, { useState, useEffect } from 'react';
import { User, MapPin, Package, Heart, ShieldCheck, Plus, Trash2, CheckCircle2, Clock, Truck, Download, AlertCircle } from 'lucide-react';

export default function AccountDashboard({ user, onLogout, onAddToCart }) {
  const [activeTab, setActiveTab] = useState('orders');
  const [addresses, setAddresses] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(false);

  // New Address Form State
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [addrForm, setAddrForm] = useState({
    name: user?.username || '',
    phone: user?.phone || '',
    addressLine1: '',
    addressLine2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    landmark: '',
    addressType: 'HOME',
    isDefault: true
  });

  useEffect(() => {
    fetchUserData();
  }, [user]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('nebula_token');
      const headers = { 'x-session-id': token || '' };

      const [addrRes, orderRes, wishRes] = await Promise.all([
        fetch('/api/addresses', { headers }).then(r => r.json()),
        fetch('/api/orders/my-orders', { headers }).then(r => r.json()),
        fetch('/api/wishlist', { headers }).then(r => r.json())
      ]);

      if (addrRes.success) setAddresses(addrRes.addresses || []);
      if (orderRes.success) setMyOrders(orderRes.orders || []);
      if (wishRes.success) setWishlist(wishRes.wishlist || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAddress = async (e) => {
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
        fetchUserData();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteAddress = async (id) => {
    try {
      const token = localStorage.getItem('nebula_token');
      await fetch(`/api/addresses/${id}`, {
        method: 'DELETE',
        headers: { 'x-session-id': token || '' }
      });
      fetchUserData();
    } catch (e) {}
  };

  const getOrderStatusStep = (status) => {
    const steps = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    return Math.max(0, steps.indexOf(status || 'PLACED'));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Profile Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950/40 border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-2xl">
            {user?.username ? user.username[0].toUpperCase() : 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white">{user?.username || 'Customer Account'}</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {user?.role || 'CUSTOMER'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{user?.email} • {user?.phone || 'No phone added'}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 transition"
        >
          Sign Out
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex gap-2 border-b border-slate-800 pb-1 overflow-x-auto">
        {[
          { id: 'orders', label: 'My Orders', icon: Package, count: myOrders.length },
          { id: 'addresses', label: 'Saved Addresses', icon: MapPin, count: addresses.length },
          { id: 'wishlist', label: 'Wishlist', icon: Heart, count: wishlist.length },
          { id: 'security', label: 'Security & Preferences', icon: ShieldCheck }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${
                isActive 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                  : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: MY ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {myOrders.length === 0 ? (
            <div className="p-12 text-center bg-slate-850/60 border border-slate-800 rounded-3xl space-y-3">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Orders Placed Yet</h3>
              <p className="text-xs text-slate-400">Your order history will appear here once you place a supermarket order.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myOrders.map(order => {
                const currentStep = getOrderStatusStep(order.order_status);
                return (
                  <div key={order.id} className="bg-slate-850/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest block">Invoice #{order.invoice_number}</span>
                        <span className="text-xs text-slate-400">Placed on {new Date(order.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-emerald-400">₹{Number(order.grand_total).toFixed(2)}</span>
                        {order.pdf_invoice_path && (
                          <a
                            href={order.pdf_invoice_path}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-bold text-sky-400 flex items-center gap-1 border border-slate-700"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF Tax Invoice
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Delivery Status Stepper */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-slate-300">Order Progress Status:</span>
                        <span className="font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {(order.order_status || 'PLACED').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {['Placed', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'].map((st, idx) => (
                          <div key={st} className="flex flex-col items-center gap-1">
                            <div className={`w-full h-1.5 rounded-full ${idx <= currentStep ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                            <span className={`text-[10px] text-center font-medium ${idx <= currentStep ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                              {st}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SAVED ADDRESSES */}
      {activeTab === 'addresses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white text-base">Your Saved Delivery Addresses</h3>
            <button
              onClick={() => setShowAddAddr(!showAddAddr)}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" /> Add New Address
            </button>
          </div>

          {showAddAddr && (
            <form onSubmit={handleCreateAddress} className="bg-slate-850 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="font-bold text-sm text-white">Add Delivery Address</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={addrForm.name}
                  onChange={e => setAddrForm({ ...addrForm, name: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="tel"
                  required
                  placeholder="Phone Number"
                  value={addrForm.phone}
                  onChange={e => setAddrForm({ ...addrForm, phone: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <input
                type="text"
                required
                placeholder="Flat / House No. / Building Name / Street"
                value={addrForm.addressLine1}
                onChange={e => setAddrForm({ ...addrForm, addressLine1: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={addrForm.city}
                  onChange={e => setAddrForm({ ...addrForm, city: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="State"
                  value={addrForm.state}
                  onChange={e => setAddrForm({ ...addrForm, state: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Pincode"
                  value={addrForm.pincode}
                  onChange={e => setAddrForm({ ...addrForm, pincode: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddAddr(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">Save Address</button>
              </div>
            </form>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {addresses.map(addr => (
              <div key={addr.id} className="bg-slate-850/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{addr.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {addr.address_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{addr.address_line1}, {addr.city}, {addr.state} - {addr.pincode}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Phone: {addr.phone}</p>
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button onClick={() => handleDeleteAddress(addr.id)} className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: WISHLIST */}
      {activeTab === 'wishlist' && (
        <div className="space-y-4">
          {wishlist.length === 0 ? (
            <div className="p-12 text-center bg-slate-850/60 border border-slate-800 rounded-3xl space-y-3">
              <Heart className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">Your Wishlist is Empty</h3>
              <p className="text-xs text-slate-400">Save products to your wishlist to buy them later.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {wishlist.map(item => (
                <div key={item.id} className="bg-slate-850/80 border border-slate-800 rounded-2xl p-4 flex gap-3 items-center">
                  <img src={item.image_url || '/assets/placeholder.svg'} alt={item.name} className="w-16 h-16 object-contain rounded-xl bg-slate-900 p-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                    <p className="text-[11px] text-slate-400">{item.pack_size}</p>
                    <p className="text-sm font-black text-emerald-400 mt-1">₹{Number(item.selling_price).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => onAddToCart({ id: item.product_id, name: item.name, selling_price: item.selling_price, pack_size: item.pack_size, stock_quantity: item.stock_quantity })}
                    className="p-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shrink-0"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SECURITY */}
      {activeTab === 'security' && (
        <div className="bg-slate-850/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-white text-base">Account Security & Session Control</h3>
          <p className="text-xs text-slate-400">Your account is secured with salt-based scrypt password hashing and session tokens.</p>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-emerald-400 block">Active Web Session</span>
            <p className="text-xs text-slate-300">Device: {navigator.userAgent.slice(0, 60)}...</p>
            <p className="text-xs text-slate-500">Role: {user?.role}</p>
          </div>
        </div>
      )}

    </div>
  );
}
