import React, { useState } from 'react';
import { X, Bell, CheckCheck, AlertTriangle, Info, CheckCircle, ShieldAlert } from 'lucide-react';

export default function NotificationCenter({ isOpen, onClose, notifications, onMarkRead, onMarkAllRead }) {
  const [filter, setFilter] = useState('ALL');

  if (!isOpen) return null;

  const filtered = notifications.filter(n => {
    if (filter === 'UNREAD') return !n.is_read;
    if (filter === 'LOW_STOCK') return n.category === 'LOW_STOCK';
    if (filter === 'KHATA') return n.category === 'KHATA';
    if (filter === 'SECURITY') return n.category === 'SECURITY';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 h-full border-l border-slate-800 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Notification Center</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2 border-b border-slate-800/80 flex gap-1.5 overflow-x-auto text-[11px]">
          {['ALL', 'UNREAD', 'LOW_STOCK', 'KHATA', 'SECURITY'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition ${
                filter === f
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Notification Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Bell className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs font-semibold">No notifications under this filter</p>
            </div>
          ) : (
            filtered.map(n => (
              <div
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`p-3.5 rounded-2xl border text-xs cursor-pointer transition ${
                  n.is_read
                    ? 'bg-slate-850/50 border-slate-800/60 opacity-70'
                    : 'bg-slate-850 border-slate-700 shadow-md'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {n.severity === 'WARNING' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : n.severity === 'CRITICAL' ? (
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h5 className="font-bold text-white truncate">{n.title}</h5>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">{n.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-850 text-center border-t border-slate-800 text-[10px] text-slate-500">
          All notifications originate from real database events. Marking as read preserves audit logs.
        </div>

      </div>
    </div>
  );
}
