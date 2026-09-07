import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

export default function TelegramConsole({ isOpen, onClose, onRefreshData }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: `👋 **Telegram AI Store Assistant Ready**\n\nI share the exact same backend, database, and billing engine as the Web App.\n\nTry sending commands like:\n• \`Add 2 Maggi 70g\`\n• \`Add 1 Tata Salt\`\n• \`How much does Ramesh owe?\`\n• \`Close bill with Cash\`\n• \`List low stock\`\n• \`/new\` to reset draft`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || isLoading) return;

    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/telegram/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId: 'user-owner-1' })
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { sender: 'bot', text: data.reply, invoiceUrl: data.invoiceUrl }]);
        if (onRefreshData) onRefreshData();
      } else {
        setMessages(prev => [...prev, { sender: 'bot', text: `❌ Error: ${data.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: `🛑 Network error communicating with assistant.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 h-full border-l border-slate-800 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-slate-950 flex items-center justify-center font-bold">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Telegram AI Store Assistant</h3>
              <p className="text-[10px] text-sky-400 font-medium">Single Source of Truth • Live Domain Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Operational Prompts */}
        <div className="p-2 border-b border-slate-800 bg-slate-900 flex gap-2 overflow-x-auto text-[10px]">
          {[
            'Add 2 Maggi 70g',
            'Add 1 Tata Salt',
            'How much does Ramesh owe?',
            'Checkout with Cash',
            'List low stock',
            'Run daily close',
            '/new'
          ].map(cmd => (
            <button
              key={cmd}
              onClick={() => sendMessage(cmd)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-full whitespace-nowrap border border-slate-700 transition"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-850 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>

                {m.invoiceUrl && (
                  <a
                    href={m.invoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold px-3 py-1.5 rounded-lg border border-sky-500/30 transition text-[11px]"
                  >
                    <FileText className="w-3.5 h-3.5" /> Download Tax Invoice PDF
                  </a>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-sky-400 bg-slate-850 border border-slate-800 rounded-2xl p-3 w-fit">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Assistant reasoning & executing tools...</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Bar */}
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="p-3 bg-slate-850 border-t border-slate-800 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type Telegram command (e.g. 'Add 2 Maggi', '/new')..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold px-4 rounded-xl flex items-center justify-center transition shadow-md shadow-sky-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
}
