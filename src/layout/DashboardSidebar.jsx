import { Home, PieChart, Users, Wallet, FileText, Gift, Settings, User, LogOut, X } from 'lucide-react';
import { getT } from '../i18n/i18n.js';

export default function DashboardSidebar({ isOpen, setIsOpen, currentView, setCurrentView, lang, onLogout, isAdmin }) {
  const t = getT(lang);
  const navItems = [
    { id: 'home', icon: Home, label: t.home },
    { id: 'quotas', icon: PieChart, label: t.quotas },
    { id: 'team', icon: Users, label: t.team },
    { id: 'wallet', icon: Wallet, label: t.wallet },
    { id: 'reports', icon: FileText, label: t.reports },
    { id: 'bonus', icon: Gift, label: t.bonus },
    { id: 'settings', icon: Settings, label: t.settings },
  ];
  const finalNavItems = isAdmin ? [...navItems, { id: 'admin', icon: User, label: 'Admin' }] : navItems;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40 lg:hidden" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-64 bg-[#1A1A1A] border-r border-[#8A2BE2] transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 flex justify-between items-center border-b border-gray-800 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_20px_rgba(0,255,0,0.12)]">
              <img src="/LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-10 w-auto object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-[0.25em] text-white">RENDA MAIS</p>
              <p className="text-xs text-gray-400">{t.investorPanel}</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-white" type="button"><X size={24} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {finalNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-6 py-3 mb-2 text-left transition-colors ${currentView === item.id ? 'border-r-4 border-[#00FF00] bg-[#00FF00]/15 text-white shadow-[inset_0_0_0_1px_rgba(0,255,0,0.18)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              type="button"
            >
              <item.icon size={20} className={`shrink-0 ${currentView === item.id ? 'text-[#00FF00]' : ''}`} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={onLogout} className="w-full flex items-center text-red-500 hover:text-red-400 px-2 py-2" type="button">
            <LogOut size={20} className="mr-3" />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

