import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send as SendIcon } from 'lucide-react';
import { getT } from '../i18n/i18n.js';
import {
  addMessage,
  getOrCreateThread,
  loadSupportState,
  markReadForUser,
  saveSupportState,
} from './supportStorage';

const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function SupportModal({ isOpen, channel, channelName, isOnline, queue, user, onClose, t }) {
  const [text, setText] = useState('');
  const [state, setState] = useState(() => loadSupportState());
  const listRef = useRef(null);

  const userEmail = (user?.email || '').toLowerCase();
  const tr = t || getT('pt');
  const userName = user?.name || user?.username || tr.genericUserName;

  const { thread } = useMemo(() => getOrCreateThread(state, { channel, userEmail, userName }), [state, channel, userEmail, userName]);

  useEffect(() => {
    if (!isOpen) return;
    const fresh = loadSupportState();
    const updated = markReadForUser(fresh, { threadId: thread.id });
    const saved = saveSupportState(updated);
    setState(saved);
    setText('');
  }, [isOpen, thread.id]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, thread.messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = () => {
    const content = text.trim();
    if (!content) return;
    const next1 = addMessage(state, { threadId: thread.id, from: 'user', text: content });
    const saved1 = saveSupportState(next1);
    setState(saved1);
    setText('');

    if (!isOnline) {
      const next2 = addMessage(saved1, {
        threadId: thread.id,
        from: 'admin',
        text: tr.supportTicketCreated,
      });
      const saved2 = saveSupportState(next2);
      setState(saved2);
    }
  };

  const close = () => {
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60" onClick={close}></div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(980px,92vw)] h-[min(760px,88vh)] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]">
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">{tr.supportService}</p>
            <h3 className="text-lg font-black truncate">{channelName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${isOnline ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200'}`}>
              {isOnline ? tr.supportOnline : tr.supportOffline}
            </span>
            {Number(queue || 0) > 0 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-200">
                {tr.supportQueue}: {queue}
              </span>
            )}
            <button
              onClick={close}
              className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
              title={tr.close}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-56px)] flex flex-col">
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 bg-gray-50">
            <div className="space-y-3">
              {thread.status === 'resolved' && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-black text-gray-800">{tr.supportResolvedTitle}</p>
                  <p className="text-xs text-gray-500 mt-1">{tr.supportResolvedDesc}</p>
                </div>
              )}
              {thread.messages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center bg-white">
                  <p className="text-lg font-black text-gray-800">{tr.supportEmptyTitle}</p>
                  <p className="text-sm text-gray-500 mt-2">{tr.supportEmptyDesc}</p>
                </div>
              )}
              {thread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${m.from === 'user' ? 'bg-[#00FF00]/20 border-[#00FF00]/30 text-gray-900' : 'bg-white border-gray-200 text-gray-800'}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                    <p className="text-[11px] mt-2 text-gray-500">{formatTime(m.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isOnline ? tr.supportPlaceholderOnline : tr.supportPlaceholderOffline}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-[#00FF00]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                className="px-5 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400 inline-flex items-center gap-2"
              >
                <SendIcon size={18} />
                {tr.supportSend}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              {isOnline ? tr.supportHintOnline : tr.supportHintOffline}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
