import { useState } from 'react';
import { Bell, Send, Menu, ChevronDown, Check, Copy } from 'lucide-react';
import { formatDateTime, getT, translateNotification } from '../i18n/i18n.js';

export default function DashboardHeader({
  user,
  toggleSidebar,
  lang,
  userLang,
  setLang,
  setCurrentView,
  notificationsCount,
  notifications,
  onMarkAllNotificationsRead,
}) {
  const t = getT(lang);
  const refLink = `https://comunidaderm.com/ref/${user?.username || 'user'}`;
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="bg-[#1A1A1A] sticky top-0 z-30 shadow-md">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#8A2BE2]">
        <div className="flex items-center">
          <button onClick={toggleSidebar} className="text-white lg:hidden mr-4" type="button">
            <Menu size={24} />
          </button>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-6">
          <div className="hidden min-[540px]:flex gap-1 bg-gray-800 p-1 rounded-lg">
            {['pt', 'en', 'es'].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2 py-1 text-xs font-bold rounded ${userLang === l ? 'bg-[#00FF00] text-black' : 'text-gray-400 hover:text-white'}`}
                type="button"
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <a href="https://t.me/seu_grupo_oficial" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors" title="Telegram">
            <Send size={20} />
          </a>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications((s) => !s)}
              className="text-gray-400 hover:text-[#00FF00] relative"
              title={t.notifications}
            >
              <Bell size={20} />
              {Number(notificationsCount || 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full">
                  {notificationsCount > 99 ? '99+' : notificationsCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-[#1A1A1A] border border-[#8A2BE2] rounded-xl shadow-xl overflow-hidden">
                <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{t.notifications}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onMarkAllNotificationsRead?.();
                      setShowNotifications(false);
                    }}
                    className="text-xs font-black px-3 py-1 rounded-lg bg-[#00FF00] text-black"
                  >
                    {t.markRead}
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {Array.isArray(notifications) && notifications.length > 0 ? (
                    notifications.slice(0, 20).map((n) => {
                      const nn = translateNotification(n, t, lang);
                      return (
                        <div key={n.id} className={`p-3 border-b border-gray-800 ${n.read ? 'opacity-70' : ''}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-white">{nn.title}</p>
                            <p className="text-[10px] text-gray-400 whitespace-nowrap">{formatDateTime(nn.at, lang)}</p>
                          </div>
                          <p className="text-xs text-gray-300 mt-1 break-words">{nn.message}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-sm text-gray-400">{t.noNotifications}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center space-x-2 text-white" type="button">
              <div className="w-8 h-8 rounded-full bg-[#00FF00] flex items-center justify-center text-black font-bold">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <ChevronDown size={16} className="text-gray-400" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-[#1A1A1A] border border-[#8A2BE2] rounded-xl shadow-xl p-4">
                <div className="mb-4">
                  <p className="font-bold text-white">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-400">@{user?.username || 'username'}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setCurrentView('settings'); setShowDropdown(false); }}
                  className="w-full py-2.5 mb-2 text-sm font-black bg-gradient-to-r from-[#8A2BE2] to-purple-600 text-white border border-purple-400 rounded-lg shadow-[0_10px_30px_-12px_rgba(138,43,226,0.7)] hover:brightness-110 transition"
                  type="button"
                >
                  {t.registerWalletBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-[540px]:hidden border-b border-gray-800 bg-[#161616] px-4 py-2">
        <div className="flex justify-center">
          <div className="inline-flex gap-1 rounded-xl bg-gray-800 p-1 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.8)]">
            {['pt', 'en', 'es'].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`min-w-[34px] rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase transition-colors ${
                  userLang === l ? 'bg-[#00FF00] text-black' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 px-4 py-2 flex flex-col min-[540px]:flex-row items-center justify-between gap-2 border-b border-gray-800">
        <span className="text-sm text-gray-400">{t.refLink}:</span>
        <div className="flex w-full min-[540px]:w-auto items-center bg-gray-800 rounded px-3 py-1 border border-gray-700">
          <span className="text-xs text-gray-300 truncate w-full min-[540px]:w-64 mr-2">{refLink}</span>
          <button onClick={copyLink} className="text-[#00FF00] hover:text-white transition-colors p-1" type="button">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}

