import React from 'react';
import { 
  LayoutDashboard, ShoppingBag, Receipt, BookOpen, Tag, 
  Package, Shield, Settings, Bot, ChevronRight 
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, role, onOpenTelegram }) {
  const navItems = [
    { id: 'dashboard', label: 'Operations Home', icon: LayoutDashboard },
    { id: 'catalog', label: 'Product Catalog', icon: ShoppingBag },
    { id: 'orders', label: 'Orders & Invoices', icon: Receipt },
    { id: 'khata', label: 'Customer Khata', icon: BookOpen },
    { id: 'offers', label: 'Store Offers', icon: Tag },
    { id: 'inventory', label: 'Stock Receiving', icon: Package },
    { id: 'security', label: 'Account Security', icon: Shield },
    { id: 'settings', label: 'Store Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 hidden lg:flex shrink-0">
      <div className="space-y-6">
        
        {/* Active Role Indicator */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Signed in as:</span>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
              role === 'OWNER' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
            }`}>
              {role}
            </span>
          </div>
          <p className="text-sm font-semibold text-white mt-1">
            {role === 'OWNER' ? 'Ravi Sharma (Owner)' : 'Arun Verma (Cashier)'}
          </p>
          <p className="text-[11px] text-slate-400">Bangalore Store #1042</p>
        </div>

        {/* Main Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 opacity-75" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Telegram AI Assistant Action Card */}
      <div className="bg-gradient-to-br from-sky-900/40 to-slate-850 border border-sky-500/20 rounded-2xl p-3.5">
        <div className="flex items-center gap-2 text-sky-400 mb-1.5">
          <Bot className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Telegram Agent</span>
        </div>
        <p className="text-xs text-slate-300 mb-3">
          Conversational assistant with multi-turn billing, oversell guard & khata.
        </p>
        <button
          onClick={onOpenTelegram}
          className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs py-2 rounded-xl transition shadow-lg shadow-sky-500/20"
        >
          Open Assistant Console
        </button>
      </div>
    </aside>
  );
}
