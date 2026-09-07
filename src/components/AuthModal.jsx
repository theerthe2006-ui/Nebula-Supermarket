import React, { useState } from 'react';
import { X, Lock, Mail, User, Phone, ShieldCheck, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  if (!isOpen) return null;

  const [isSignUp, setIsSignUp] = useState(false);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
      const body = isSignUp 
        ? { username, email: identity, phone, password, name } 
        : { identity, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed.');
      }

      if (data.token) {
        localStorage.setItem('nebula_token', data.token);
      }

      setSuccessMsg(data.message || 'Authenticated successfully!');
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoCustomer = () => {
    setIdentity('customer@nebulamarket.local');
    setPassword('Nebula123!');
  };

  const handleQuickDemoOwner = () => {
    setIdentity('owner@nebulamarket.local');
    setPassword('Nebula123!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-850/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              N
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">
                {isSignUp ? 'Create Nebula Account' : 'Sign In to Nebula'}
              </h3>
              <p className="text-xs text-slate-400">
                {isSignUp ? 'Join for exclusive grocery deals & fast checkout' : 'Access your account, orders & wishlist'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 text-xs text-center font-bold">
              {successMsg}
            </div>
          )}

          {isSignUp && (
            <>
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rahul Verma"
                    className="w-full bg-slate-850 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-850 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-slate-300 font-medium block mb-1">
              {isSignUp ? 'Email Address' : 'Email Address or Phone'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="customer@nebulamarket.local"
                className="w-full bg-slate-850 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-850 border border-slate-700 rounded-xl pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
          >
            {loading ? 'Processing...' : (
              <>
                {isSignUp ? 'Create Account' : 'Sign In'} <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Demo Accounts Banner */}
          {!isSignUp && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quick Demo Sign-In:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleQuickDemoCustomer}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-300 border border-slate-700"
                >
                  Demo Customer
                </button>
                <button
                  type="button"
                  onClick={handleQuickDemoOwner}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-amber-400 border border-slate-700"
                >
                  Demo Store Owner
                </button>
              </div>
            </div>
          )}

          {/* Switch Mode Toggle */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-xs text-slate-400 hover:text-emerald-400 transition font-medium"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create One"}
            </button>
          </div>

          <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-2.5 flex items-center gap-2 text-sky-300 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span><strong>DEMO AUTH MODE</strong>: Accounts stored safely in local database. No paid external SMS required.</span>
          </div>

        </form>

      </div>
    </div>
  );
}
