import React, { useState, useEffect } from 'react';
import {
  User, Bell, Send, Globe, Copy, Menu, X, Home,
  PieChart, Users, Wallet, FileText, Gift, Settings,
  Eye, EyeOff, LogOut, MessageCircle, ChevronDown, Check
} from 'lucide-react';
import AdminView from './admin/AdminView.jsx';
import { BANK_STATUS, getBankByQuotaKey, loadAdminConfig, saveAdminConfig } from './admin/adminStorage.js';
import BankHistoryModal from './history/BankHistoryModal.jsx';
import SupportModal from './support/SupportModal.jsx';
import FaqModal from './support/FaqModal.jsx';
import { getUnreadCountForUser, loadSupportState } from './support/supportStorage';
import {
  QUOTA_GLOBAL_LIMIT,
  canBuyPlan,
  createLot,
  normalizeUserCycles,
  renewLot,
  settleCyclesIfNeeded,
  requestDesistance,
  calcDesistPenaltyPct,
  DESIST_ANALYSIS_HOURS,
} from './quota/quotaEngine.js';
import {
  addNotification,
  getUnreadNotificationsCount,
  hasNotificationRef,
  loadNotificationsState,
  markAllRead,
  saveNotificationsState,
  listNotifications,
} from './notifications/notificationsStorage.js';
import { calcEntryFeeEarnings, calcResidual, calcRankVolume, getCurrentRank, RANKS, sumAllLevels, sumLevel } from './team/teamEngine.js';
import { loadOrSeedTeamForUser, updateTeamForUser } from './team/teamStorage.js';
import TeamStructureCard from './team/TeamStructureCard.jsx';
import TeamResidualCard from './team/TeamResidualCard.jsx';
import TeamRankCard from './team/TeamRankCard.jsx';
import TeamNetworkLevelsCard from './team/TeamNetworkLevelsCard.jsx';
import { formatTeamMoney, getLegTarget, getRankProgressPct, getStructureLevels, getStructureTotalBase } from './team/teamViewFormatters.js';
import ApnPdfModal from './apn/ApnPdfModal.jsx';
import { getUserByEmail, getUserByUsername, loadUsersState, saveUsersState, upsertUser, listUsers } from './users/usersStorage.js';
import { buildReferralLevels } from './users/referralTree.js';
import { calcElitePool, calcElitePayoutPerSlot, computeEliteBoard, ensureEliteAchievedAt, ELITE_CATEGORIES, getEliteCategoryForRank } from './elite/eliteEngine.js';
import { fetchNowpaymentStatus } from './payments/nowpaymentsClient.js';
import { calcWithdrawNet, requestWithdraw, settleNowpaymentsDeposit, WITHDRAW_FEE_USD } from './payments/walletEngine.js';
import { fillTemplate, formatDateShort, formatDateTime, formatMoneyUsd, formatMoneyUsdInt, getLocaleForLang, getStatusLabel, getT, translateFinancialReason, translateNotification, translateRankTitle, translateTransactionType } from './i18n/i18n.js';

// --- THEME CONSTANTS ---
const THEME = {
  primary: '#00FF00', // Verde Radioativo
  secondary: '#8A2BE2', // Roxo (Bordas e detalhes)
  dark: '#1A1A1A', // Topo
  light: '#FFFFFF', // Fundo Principal
  gray: '#F3F4F6',
  textDark: '#333333',
  textLight: '#FFFFFF'
};

const LANG_STORAGE_KEY = 'rm_lang';

const normalizeLang = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'pt';
  if (key === 'pt' || key.startsWith('pt-')) return 'pt';
  if (key === 'en' || key.startsWith('en-')) return 'en';
  if (key === 'es' || key.startsWith('es-')) return 'es';
  return 'pt';
};

const detectBrowserLang = () => {
  try {
    const raw = String(navigator?.language || navigator?.languages?.[0] || '');
    return normalizeLang(raw);
  } catch {
    return 'pt';
  }
};

const getInitialLang = () => {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored) return normalizeLang(stored);
    const detected = detectBrowserLang();
    localStorage.setItem(LANG_STORAGE_KEY, detected);
    return detected;
  } catch {
    return 'pt';
  }
};

const normalizeUser = (u) => {
  const userId =
    String(u?.userId || '').trim() ||
    (() => {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      } catch {}
      return `rm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    })();
  const wallets = u?.wallets ?? { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' };
  const balances = u?.balances ?? { available: 474.5, invested: 350, teamEarnings: 124.5, eliteEarnings: 0, teEarnings: 0 };
  if (!Object.prototype.hasOwnProperty.call(balances, 'eliteEarnings')) balances.eliteEarnings = 0;
  if (!Object.prototype.hasOwnProperty.call(balances, 'teEarnings')) balances.teEarnings = 0;
  const holdings = u?.holdings ?? { cota10: 0, cota50: 0, cota100: 0 };
  const transactions = Array.isArray(u?.transactions) ? u.transactions : [];
  return normalizeUserCycles({ ...u, userId, wallets, balances, holdings, transactions });
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    try {
      localStorage.setItem('rm_last_error', JSON.stringify({ at: new Date().toISOString(), message: String(error?.message || error) }));
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-black/30 border border-red-500/50 rounded-2xl p-6">
          <h2 className="text-xl font-black mb-2">Ocorreu um erro na tela</h2>
          <p className="text-sm text-gray-300 break-words">{String(this.state.error?.message || this.state.error || 'Erro desconhecido')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

const AuthFlow = ({ onLogin, lang, setLang }) => {
  const refUsername = String(localStorage.getItem('rm_ref_username') || '').trim();
  const [isLogin, setIsLogin] = useState(!refUsername);
  const [showPwd, setShowPwd] = useState(false);
  const [formData, setFormData] = useState({
    name: '', username: '', country: 'Brasil', email: '', whatsapp: '', password: '', confirmPassword: ''
  });

  const t = getT(lang);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      // Simulação de login
      const st = loadUsersState();
      const fromRegistry = getUserByEmail(st, formData.email);
      if (fromRegistry && String(fromRegistry.password || '') === String(formData.password || '')) {
        onLogin(fromRegistry);
        return;
      }
      const storedUser = JSON.parse(localStorage.getItem('rm_user'));
      if (storedUser && String(storedUser.email || '') === String(formData.email || '') && String(storedUser.password || '') === String(formData.password || '')) {
        onLogin(storedUser);
        return;
      }
      alert('Credenciais inválidas. Para teste, registre-se primeiro.');
    } else {
      // Simulação de registro
      if (formData.password !== formData.confirmPassword) {
        alert('As senhas não coincidem');
        return;
      }
      const st = loadUsersState();
      const exists = getUserByEmail(st, formData.email);
      if (exists) {
        alert('Este e-mail já está cadastrado. Faça login.');
        setIsLogin(true);
        return;
      }
      const desiredUsername = String(formData.username || '').trim().toLowerCase();
      const usernameExists = listUsers(st).some((u) => String(u?.username || '').trim().toLowerCase() === desiredUsername);
      if (desiredUsername && usernameExists) {
        alert('Este username já está em uso. Escolha outro.');
        return;
      }
      onLogin({ ...formData, referrerUsername: refUsername || null });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      {/* Language Selector na Auth */}
      <div className="absolute top-4 right-4 flex gap-2">
        {['pt', 'en', 'es'].map(l => (
          <button key={l} onClick={() => setLang(l)} className={`px-2 py-1 rounded text-xs font-bold uppercase ${lang === l ? 'bg-[#00FF00] text-black' : 'bg-gray-200 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md bg-[#1A1A1A] rounded-2xl shadow-2xl p-8 border border-[#8A2BE2]">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_35px_rgba(0,255,0,0.15)]">
            <img src="LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-wide text-white">RENDA MAIS</h1>
          <p className="mt-2 text-gray-400">{isLogin ? t.login : t.register}</p>
          {!isLogin && refUsername && (
            <p className="mt-2 text-xs text-gray-300">
              Patrocinador: <span className="font-black text-white">@{refUsername}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <input type="text" name="name" placeholder={t.name} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <input type="text" name="username" placeholder={t.username} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
              <select name="country" onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]">
                <option value="Brasil">Brasil</option>
                <option value="Portugal">Portugal</option>
                <option value="USA">USA</option>
                <option value="Spain">Spain</option>
              </select>
              <input type="tel" name="whatsapp" placeholder={t.whatsapp} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            </>
          )}

          <input type="email" name="email" placeholder={t.email} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />

          <div className="relative">
            <input type={showPwd ? "text" : "password"} name="password" placeholder={t.password} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-gray-400 hover:text-white">
              {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {!isLogin && (
            <div className="relative">
              <input type={showPwd ? "text" : "password"} name="confirmPassword" placeholder={t.confirmPassword} required onChange={handleInputChange} className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF00]" />
            </div>
          )}

          {isLogin && (
            <div className="text-right">
              <a href="#" className="text-sm text-[#00FF00] hover:underline">{t.forgotPassword}</a>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-lg transition-colors">
            {isLogin ? t.login : t.register}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          {isLogin ? t.noAccount : t.hasAccount}
          <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-[#00FF00] font-bold hover:underline">
            {isLogin ? t.register : t.login}
          </button>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ isOpen, setIsOpen, currentView, setCurrentView, lang, onLogout, isAdmin }) => {
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
      {/* Mobile Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
      
      <aside className={`fixed top-0 left-0 h-full w-64 bg-[#1A1A1A] border-r border-[#8A2BE2] transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-5 flex justify-between items-center border-b border-gray-800 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#8A2BE2] bg-white/5 shadow-[0_0_20px_rgba(0,255,0,0.12)]">
              <img src="LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-10 w-auto object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-[0.25em] text-white">RENDA MAIS</p>
              <p className="text-xs text-gray-400">{t.investorPanel}</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-white"><X size={24}/></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {finalNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-6 py-3 mb-2 text-left transition-colors ${currentView === item.id ? 'border-r-4 border-[#00FF00] bg-[#00FF00]/15 text-white shadow-[inset_0_0_0_1px_rgba(0,255,0,0.18)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <item.icon size={20} className={`shrink-0 ${currentView === item.id ? 'text-[#00FF00]' : ''}`} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={onLogout} className="w-full flex items-center text-red-500 hover:text-red-400 px-2 py-2">
            <LogOut size={20} className="mr-3" />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

const Header = ({ user, toggleSidebar, lang, userLang, setLang, setCurrentView, notificationsCount, notifications, onMarkAllNotificationsRead }) => {
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
          <button onClick={toggleSidebar} className="text-white lg:hidden mr-4">
            <Menu size={24} />
          </button>
        </div>

        <div className="flex items-center space-x-4 sm:space-x-6">
          {/* Language Selector */}
          <div className="hidden min-[540px]:flex gap-1 bg-gray-800 p-1 rounded-lg">
             {['pt', 'en', 'es'].map(l => (
              <button key={l} onClick={() => setLang(l)} className={`px-2 py-1 text-xs font-bold rounded ${userLang === l ? 'bg-[#00FF00] text-black' : 'text-gray-400 hover:text-white'}`}>
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

          {/* User Profile Dropdown */}
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center space-x-2 text-white">
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
                >
                  {t.registerWalletBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub Header - Referral Link */}
      <div className="bg-gray-900 px-4 py-2 flex flex-col min-[540px]:flex-row items-center justify-between gap-2 border-b border-gray-800">
        <span className="text-sm text-gray-400">{t.refLink}:</span>
        <div className="flex w-full min-[540px]:w-auto items-center bg-gray-800 rounded px-3 py-1 border border-gray-700">
          <span className="text-xs text-gray-300 truncate w-full min-[540px]:w-64 mr-2">{refLink}</span>
          <button onClick={copyLink} className="text-[#00FF00] hover:text-white transition-colors p-1">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
};

const HomeView = ({ lang, adminConfig, user, onOpenBankHistory, onOpenApn }) => {
  const t = getT(lang);
  
  const totalLimit = 100000;
  const currentSold = adminConfig?.globalSold || 45230;
  const percentage = Math.min((currentSold / totalLimit) * 100, 100);

  const formatMoney = (v) => formatMoneyUsd(v, lang);
  
  const currentUser = normalizeUser(user);

  const cards = [
    { title: t.invested, value: formatMoney(currentUser.balances.invested), desc: t.homeBoughtQuotasDesc, color: 'border-blue-500' },
    { title: t.teamEarnings, value: formatMoney(currentUser.balances.teamEarnings), desc: t.homeUpToLevel5Desc, color: 'border-[#00FF00]' },
    { title: t.totalBalance, value: formatMoney(currentUser.balances.available), desc: t.homeWithdrawAvailableDesc, color: 'border-[#8A2BE2]' },
    {
      title: t.rank,
      value: 'BRONZE',
      desc: fillTemplate(t.homeRankDescTemplate, { current: '$2,100', target: '$5,000', next: 'Silver' }),
      color: 'border-yellow-500',
    },
  ];

  return (
    <div className="p-4 min-[540px]:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Progress Bar Limit */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.totalLimit}</h3>
            <p className="text-sm text-gray-500">{t.homeBetaPhase}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-[#8A2BE2]">{currentSold.toLocaleString()}</span>
            <span className="text-gray-500 text-sm"> / {totalLimit.toLocaleString()}</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div className="bg-gradient-to-r from-[#8A2BE2] to-[#00FF00] h-4 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
        </div>
        <p className="text-right text-xs text-gray-400 mt-1">{fillTemplate(t.homeFilledTemplate, { pct: percentage.toFixed(1) })}</p>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.homeProjectPresentationTitle}</h3>
            <p className="text-sm text-gray-500">{t.homeProjectPresentationDesc}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onOpenApn?.({
                  page: 5,
                  title: `${t.apnPresentation} • ${t.apnHowToJoin}`,
                  shortcuts: [
                    { label: t.apnHowToJoin, page: 5 },
                    { label: t.apnBanks, page: 9 },
                    { label: t.apnTeam, page: 10 },
                    { label: t.apnResidual, page: 11 },
                    { label: t.apnElitePool, page: 12 },
                  ],
                })
              }
              className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
            >
              {t.homeHowToJoinPdf}
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenApn?.({
                  page: 9,
                  title: `${t.apnPresentation} • ${t.apnBanksSystem}`,
                  shortcuts: [
                    { label: t.apnHowToJoin, page: 5 },
                    { label: t.apnBanks, page: 9 },
                    { label: t.apnTeam, page: 10 },
                    { label: t.apnResidual, page: 11 },
                    { label: t.apnElitePool, page: 12 },
                  ],
                })
              }
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
            >
              {t.homeBankSystemPdf}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${card.color}`}>
            <h4 className="text-gray-500 text-sm font-medium mb-1">{card.title}</h4>
            <p className="text-2xl font-bold text-gray-800 mb-1">{card.value}</p>
            <p className="text-xs text-gray-400">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Forex Operations Showcase (Simulation) */}
      <div className="bg-[#1A1A1A] rounded-2xl p-6 text-white border border-[#8A2BE2]">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PieChart className="text-[#00FF00]" />
          {t.homeRealOpsTitle}
        </h3>
        <p className="text-gray-400 text-sm mb-6">{t.homeRealOpsDesc}</p>
        
        <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.values(adminConfig?.banks || {}).map((bank) => {
            const badge =
              bank.status === BANK_STATUS.active
                ? { text: t.bankOperating, className: 'bg-blue-500/20 text-blue-300 animate-pulse' }
                : bank.status === BANK_STATUS.closed
                  ? { text: t.bankClosed, className: 'bg-green-500/20 text-green-300' }
                  : { text: t.bankSoon, className: 'bg-yellow-500/20 text-yellow-300' };

            const profitAcc = bank.profitAccumulatedPct ? `+${String(bank.profitAccumulatedPct).replace('.', ',')}%` : '—';
            const profitMonth = bank.status === BANK_STATUS.active && bank.profitMonthPct ? `+${String(bank.profitMonthPct).replace('.', ',')}%` : '—';
            const filled = Math.max(0, Math.min(100, Number(bank.filledPct || 0)));
            const disabled = bank.status !== BANK_STATUS.active;

            return (
              <div
                key={bank.id}
                onClick={() => {
                  if (!disabled) onOpenBankHistory?.(bank);
                }}
                className={`bg-gray-800 rounded-xl p-4 border transition-colors ${disabled ? 'border-gray-700 opacity-60 cursor-not-allowed' : 'border-[#00FF00] shadow-[0_0_15px_rgba(0,255,0,0.1)] cursor-pointer hover:border-[#00FF00]'}`}
                title={disabled ? t.bankUnavailableTitle : t.bankActiveTitle}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">{bank.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${badge.className}`}>{badge.text}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {fillTemplate(t.homeLimitTemplate, {
                    amount: `$${Number(bank.limit || 0).toLocaleString()}`,
                    quota: bank.quotaKey === 'cota10' ? t.quotaLabel10 : bank.quotaKey === 'cota50' ? t.quotaLabel50 : t.quotaLabel100,
                  })}
                </p>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                  <div className={`h-2 rounded-full ${disabled ? 'bg-gray-500' : 'bg-[#00FF00]'}`} style={{ width: `${filled}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">{t.homeAccumulated}:</span>
                    <span className="text-[#00FF00] font-bold">{profitAcc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">{t.homeCurrentMonth}:</span>
                    <span className="text-[#00FF00] font-bold">{profitMonth}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

       {/* Daily Reports Summary */}
       <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{t.homeLastDailyEarningsTitle}</h3>
        <div className="space-y-3">
          {[
            { date: '12 Maio, 18:00', amount: '+$3.50', desc: t.homeQuotaEarning },
            { date: '11 Maio, 18:00', amount: '+$3.50', desc: t.homeQuotaEarning },
            { date: '10 Maio, 18:00', amount: '+$3.50', desc: t.homeQuotaEarning },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{item.desc}</p>
                <p className="text-xs text-gray-400">{item.date}</p>
              </div>
              <span className="font-bold text-[#00FF00]">{item.amount}</span>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 py-2 text-sm text-[#8A2BE2] font-medium hover:underline">{t.homeViewFullReport}</button>
      </div>
    </div>
  );
};

const QuotasView = ({ user, setUser, adminConfig, onBuy, onNotify, onOpenApn, lang }) => {
  const t = getT(lang);
  const locale = getLocaleForLang(lang);
  const formatPct = (value) => {
    const n = Number(value || 0);
    const hasDecimal = Math.abs(n - Math.round(n)) > 1e-9;
    return n.toLocaleString(locale, { minimumFractionDigits: hasDecimal ? 1 : 0, maximumFractionDigits: 1 });
  };
  const plans = [
    { key: 'cota10', title: 'COTA 10', price: 10, quotas: 1, dailyPct: 1.0, monthlyPct: 30, systemText: t.quotaSystemText1, variant: 'light' },
    { key: 'cota50', title: 'COTA 50', price: 50, quotas: 5, dailyPct: 1.1, monthlyPct: 33, systemText: t.quotaSystemText5, variant: 'dark' },
    { key: 'cota100', title: 'COTA 100', price: 100, quotas: 10, dailyPct: 1.2, monthlyPct: 36, systemText: t.quotaSystemText10, variant: 'light' },
  ];

  const [qty, setQty] = useState({ cota10: 1, cota50: 1, cota100: 1 });
  const [coin, setCoin] = useState({ cota10: 'USDT', cota50: 'USDT', cota100: 'USDT' });
  const [network, setNetwork] = useState({ cota10: 'BEP20', cota50: 'BEP20', cota100: 'BEP20' });

  const formatMoney = (v) => formatMoneyUsd(v, lang);
  const round2 = (n) => Number(Number(n || 0).toFixed(2));

  const persistUser = (u) => {
    localStorage.setItem('rm_user', JSON.stringify(u));
    setUser(u);
  };

  const handleBuy = (plan) => {
    try {
      const bank = getBankByQuotaKey(adminConfig, plan.key);
      if (!bank || bank.status !== BANK_STATUS.active) {
        alert(t.bankUnavailable);
        return;
      }
      const count = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
      const paymentCoin = coin[plan.key];
      const paymentNetwork = paymentCoin === 'USDT' ? network[plan.key] : paymentCoin === 'USDC' ? 'ARBITRUM' : null;

      if (!paymentCoin) {
        alert(t.selectPaymentMethod);
        return;
      }

      if (paymentCoin === 'USDT' && !paymentNetwork) {
        alert(t.selectUsdtNetwork);
        return;
      }

      const total = plan.price * count;
      const currentUser = normalizeUser(user);
      if (currentUser?.blocked) {
        alert(t.blockedAccountSupport);
        return;
      }
      const validation = canBuyPlan({
        user: currentUser,
        adminConfig,
        planKey: plan.key,
        unitsToBuy: count,
        quotasPerUnit: plan.quotas,
      });
      if (!validation.ok) {
        alert(translateFinancialReason(validation.reason, t));
        return;
      }
      const currentAvailable = Number(currentUser?.balances?.available || 0);

      if (paymentCoin === 'SALDO' && currentAvailable < total) {
        alert(t.insufficientBalanceBuy);
        return;
      }

      const now = new Date();
      const lot = createLot({
        planKey: plan.key,
        planTitle: plan.title,
        units: count,
        planPrice: plan.price,
        quotasPerUnit: plan.quotas,
        nowIso: now.toISOString(),
        cycleMonths: adminConfig?.cycle?.months,
        renewWindowHours: adminConfig?.cycle?.renewWindowHours,
      });
      const nowIso = now.toISOString();

      if (paymentCoin !== 'SALDO') {
        const promptId = String(
          window.prompt(
            t.enterDepositCodePrompt
          ) || ''
        ).trim();
        const baseId = `${now.getTime()}-${plan.key}`;
        const buyTxId = `${baseId}-buy`;
        const depositTxId = `${baseId}-dep`;

        const buyTx = {
          id: buyTxId,
          at: nowIso,
          kind: 'COMPRA',
          type: `Compra ${plan.title}`,
          amount: -total,
          payment: `${paymentCoin} ${paymentNetwork || ''}`.trim(),
          status: 'Aguardando depósito',
          meta: { depositTxId },
        };

        const depositTx = {
          id: depositTxId,
          at: nowIso,
          kind: 'DEPOSITO',
          type: `Depósito em processamento • ${plan.title}`,
          amount: total,
          payment: `${paymentCoin} ${paymentNetwork || ''}`.trim(),
          status: 'Pendente',
          meta: {
            provider: 'NOWPAYMENTS',
            paymentId: promptId || null,
            currency: paymentCoin,
            network: paymentNetwork,
            purpose: 'PURCHASE',
            purchaseTxId: buyTxId,
            planKey: plan.key,
            planTitle: plan.title,
            planPrice: plan.price,
            quotasPerUnit: plan.quotas,
            units: count,
          },
        };

        const updatedUser = {
          ...currentUser,
          transactions: [buyTx, depositTx, ...currentUser.transactions],
        };

        persistUser(updatedUser);
        let usersSt = loadUsersState();
        usersSt = upsertUser(usersSt, updatedUser);
        saveUsersState(usersSt);

        try {
          if (onBuy) onBuy(plan.quotas * count);
        } catch (err) {}

        onNotify?.({
          kind: 'BUY',
          title: t.pendingPurchaseTitle,
          message: `${plan.title} x${count} ${t.pendingPurchaseMessage}`,
          at: buyTx.at,
          ref: buyTx.id,
        });
        alert(t.pendingPurchaseAlert);
        return;
      }

      const nextBalances = { ...currentUser.balances };
      nextBalances.available = Number((currentAvailable - total).toFixed(2));
      nextBalances.invested = Number((Number(nextBalances.invested || 0) + total).toFixed(2));

      const nextHoldings = { ...currentUser.holdings };
      nextHoldings[plan.key] = Number(nextHoldings[plan.key] || 0) + count;

      const tx = {
        id: `${now.getTime()}-${plan.key}`,
        at: nowIso,
        kind: 'COMPRA',
        type: `Compra ${plan.title}`,
        amount: -total,
        payment: 'SALDO',
        status: 'Concluído',
      };

      const updatedUser = {
        ...currentUser,
        balances: nextBalances,
        holdings: nextHoldings,
        quotaLots: [lot, ...(Array.isArray(currentUser.quotaLots) ? currentUser.quotaLots : [])],
        transactions: [tx, ...currentUser.transactions],
      };

      persistUser(updatedUser);

      let usersSt = loadUsersState();
      usersSt = upsertUser(usersSt, updatedUser);

      {
        const adminEmail = 'rmadmin@gmail.com';
        let notifSt = loadNotificationsState();

        const ensureRecipient = (emailToEnsure) => {
          const key = String(emailToEnsure || '').toLowerCase();
          let existing = getUserByEmail(usersSt, key);
          if (existing) return existing;
          if (key !== adminEmail) return null;
          const seededAdmin = normalizeUser({
            email: adminEmail,
            username: 'rmadmin',
            name: 'Admin',
            createdAt: nowIso,
            balances: { available: 0, invested: 0, teamEarnings: 0, eliteEarnings: 0, teEarnings: 0 },
            holdings: { cota10: 0, cota50: 0, cota100: 0 },
            transactions: [],
          });
          usersSt = upsertUser(usersSt, seededAdmin);
          return seededAdmin;
        };

        const buyerRef = String(updatedUser?.referrerUsername || '').trim();
        const buyerUsername = String(updatedUser?.username || '').trim();
        const buyerEmail = String(updatedUser?.email || '').toLowerCase();

        const u1 = buyerRef ? getUserByUsername(usersSt, buyerRef) : null;
        const u2 = u1?.referrerUsername ? getUserByUsername(usersSt, u1.referrerUsername) : null;
        const u3 = u2?.referrerUsername ? getUserByUsername(usersSt, u2.referrerUsername) : null;

        const recipients = [
          { level: 1, user: u1, pct: 0.4 },
          { level: 2, user: u2, pct: 0.2 },
          { level: 3, user: u3, pct: 0.1 },
        ];

        const teBase = round2(total * 0.1);

        recipients.forEach((r) => {
          const amount = round2(teBase * r.pct);
          if (!amount) return;
          const recipientEmail = String(r?.user?.email || '').toLowerCase() || adminEmail;
          const existing = ensureRecipient(recipientEmail);
          if (!existing) return;
          const normalized = normalizeUser(existing);
          const balances = { ...(normalized.balances || {}) };
          balances.available = round2(Number(balances.available || 0) + amount);
          balances.teamEarnings = round2(Number(balances.teamEarnings || 0) + amount);
          balances.teEarnings = round2(Number(balances.teEarnings || 0) + amount);

          const teTx = {
            id: `${tx.id}-te-L${r.level}-${recipientEmail}`,
            at: nowIso,
            kind: 'TE',
            type: `Ganho de Rede (TE) - Nível ${r.level} - Compra ${buyerUsername || buyerEmail}`,
            amount,
            payment: 'SISTEMA',
            status: 'Creditado',
          };

          const updated = { ...normalized, balances, transactions: [teTx, ...(normalized.transactions || [])] };
          usersSt = upsertUser(usersSt, updated);

          if (!hasNotificationRef(notifSt, recipientEmail, 'TE', teTx.id)) {
            notifSt = addNotification(notifSt, recipientEmail, {
              kind: 'TE',
              title: 'Ganho de equipe (TE)',
              message: `Você recebeu ${formatMoney(amount)} no nível ${r.level} (compra de ${buyerUsername || buyerEmail}).`,
              at: nowIso,
              ref: teTx.id,
            });
          }
        });

        saveUsersState(usersSt);
        saveNotificationsState(notifSt);

        const refreshed = getUserByEmail(usersSt, buyerEmail);
        if (refreshed) persistUser(normalizeUser(refreshed));
      }

      try {
        if (onBuy) onBuy(plan.quotas * count);
      } catch (err) {
        alert(`${t.buyPanelUpdateError} ${String(err?.message || err)}`);
      }

      onNotify?.({
        kind: 'BUY',
        title: t.buyRegisteredTitle,
        message: `${plan.title} x${count} ${t.buyRegisteredMessage}`,
        at: tx.at,
        ref: tx.id,
      });
      alert(t.buySuccessWithBalance);
    } catch (err) {
      alert(`${t.buyProcessingError} ${String(err?.message || err)}`);
    }
  };

  return (
    <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t.quotasPageTitle}</h2>
        <div className="flex flex-col lg:flex-row lg:flex-wrap gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={() =>
              onOpenApn?.({
                page: 5,
                title: `${t.apnPresentation} • ${t.apnHowToJoin}`,
                shortcuts: [
                  { label: t.apnHowToJoin, page: 5 },
                  { label: t.apnBanks, page: 9 },
                ],
              })
            }
            className="w-full lg:w-auto px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
          >
            {t.quotasHowToJoinPdf}
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenApn?.({
                page: 9,
                title: `${t.apnPresentation} • ${t.apnBanksSystem}`,
                shortcuts: [
                  { label: t.apnHowToJoin, page: 5 },
                  { label: t.apnBanks, page: 9 },
                ],
              })
            }
            className="w-full lg:w-auto px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
          >
            {t.quotasBanksPdf}
          </button>
        </div>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded">
        <p className="text-sm text-blue-700">
          <strong>{t.quotasRuleLabel}</strong> {t.quotasRuleText}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isDark = plan.variant === 'dark';
          const isPopular = plan.key === 'cota50';
          const selectedCoin = coin[plan.key];
          const isSaldo = selectedCoin === 'SALDO';
          const bank = getBankByQuotaKey(adminConfig, plan.key);
          const bankStatus = bank?.status || BANK_STATUS.upcoming;
          const canBuy = bankStatus === BANK_STATUS.active;
          const currentUnits = Number(user?.holdings?.[plan.key] || 0);
          const remainingUserUnits = Math.max(0, 100 - currentUnits);
          const sold = Number(adminConfig?.globalSold || 0);
          const remainingGlobalQuotas = Math.max(0, QUOTA_GLOBAL_LIMIT - sold);
          const remainingGlobalUnits = Math.floor(remainingGlobalQuotas / plan.quotas);
          const maxAllowed = Math.max(0, Math.min(remainingUserUnits, remainingGlobalUnits));
          const requested = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
          const blockedByUser = remainingUserUnits <= 0;
          const blockedByGlobal = remainingGlobalQuotas <= 0;
          const blockedByLimit = maxAllowed <= 0;
          const disabled = !canBuy || blockedByLimit;

          const wrapperClass = isDark
            ? 'bg-[#1A1A1A] rounded-2xl p-4 min-[540px]:p-6 shadow-xl border-2 border-[#00FF00] relative transform lg:-translate-y-4'
            : 'bg-white rounded-2xl p-4 min-[540px]:p-6 shadow-md border border-gray-200 hover:border-[#00FF00] transition-all';

          const titleClass = isDark ? 'text-xl font-bold text-white' : 'text-xl font-bold text-gray-800';
          const priceClass = isDark ? 'text-4xl font-black text-[#00FF00] my-2' : 'text-4xl font-black text-[#8A2BE2] my-2';
          const systemClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-500';
          const listClass = isDark ? 'text-sm text-gray-300 mb-6 space-y-2' : 'text-sm text-gray-600 mb-6 space-y-2';
          const qtyLabelClass = isDark ? 'text-sm text-gray-400 w-full' : 'text-sm text-gray-600 w-full';
          const qtyInputClass = isDark ? 'w-full lg:w-24 p-2 bg-gray-800 text-white border border-gray-700 rounded focus:ring-[#00FF00] outline-none' : 'w-full lg:w-24 p-2 border rounded focus:ring-[#00FF00] outline-none';
          const coinLabelClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-600';
          const selectClass = isDark ? 'w-full p-2 bg-gray-800 text-white border border-gray-700 rounded focus:ring-[#00FF00] outline-none' : 'w-full p-2 border rounded focus:ring-[#00FF00] outline-none';
          const subtleTextClass = isDark ? 'text-xs text-gray-400' : 'text-xs text-gray-500';

          return (
            <div key={plan.key} className={wrapperClass}>
              {isPopular && (
                <div className="absolute top-0 right-0 bg-[#00FF00] text-black text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                  {t.quotasPopular}
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className={titleClass}>{plan.title}</h3>
                <p className={priceClass}>{formatMoney(plan.price).replace('.00', '')}</p>
                <p className={systemClass}>{plan.systemText}</p>
              </div>

              <ul className={listClass}>
                <li className="flex items-start justify-between gap-3">
                  <span>{t.quotasDailyReturn}</span>
                  <span className="font-bold text-[#00FF00] text-right whitespace-nowrap">
                    {formatPct(plan.dailyPct)}%{t.quotasPerDaySuffix}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span>{t.quotasMonthlyAvg}</span>
                  <span className="font-bold text-[#00FF00] text-right whitespace-nowrap">
                    ~{Number(plan.monthlyPct || 0).toLocaleString(locale)}%{t.quotasPerMonthSuffix}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span>{t.quotasEntryFee}</span>
                  <span className="text-right whitespace-nowrap">10% ({formatMoney(plan.price * 0.1)})</span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span>{t.quotasValidity}</span>
                  <span className="text-right whitespace-nowrap">{t.quotasValidityValue}</span>
                </li>
              </ul>

              <div className="flex flex-col lg:flex-row lg:items-center gap-2 mb-4">
                <label className={qtyLabelClass}>{t.quotasQuantity}</label>
                <input
                  type="number"
                  min="1"
                  value={qty[plan.key]}
                  onChange={(e) => setQty((s) => ({ ...s, [plan.key]: e.target.value }))}
                  className={qtyInputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 mb-5">
                <div>
                  <label className={`${coinLabelClass} block mb-1`}>{t.quotasPayment}</label>
                  <select value={selectedCoin} onChange={(e) => setCoin((s) => ({ ...s, [plan.key]: e.target.value }))} className={selectClass}>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="SALDO">{t.quotasBalanceOption}</option>
                  </select>
                  {isSaldo && (
                    <p className={`${subtleTextClass} mt-1`}>
                      {t.quotasBalanceAvailable} <span className="font-bold">{formatMoney(user?.balances?.available)}</span>
                    </p>
                  )}
                  <p className={`${subtleTextClass} mt-1`}>{t.quotasBalanceAlwaysHint}</p>
                </div>

                {!isSaldo && (
                  <div>
                    <label className={`${coinLabelClass} block mb-1`}>{t.quotasNetwork}</label>
                    {selectedCoin === 'USDT' ? (
                      <select value={network[plan.key]} onChange={(e) => setNetwork((s) => ({ ...s, [plan.key]: e.target.value }))} className={selectClass}>
                        <option value="BEP20">BEP-20</option>
                        <option value="TRC20">TRC-20</option>
                      </select>
                    ) : (
                      <select value="ARBITRUM" disabled className={`${selectClass} opacity-70 cursor-not-allowed`}>
                        <option value="ARBITRUM">Arbitrum</option>
                      </select>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleBuy(plan)}
                disabled={disabled}
                className={`w-full py-3 font-bold rounded-xl transition-colors ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#00FF00] hover:bg-green-400 text-black'} ${isDark ? 'shadow-[0_0_15px_rgba(0,255,0,0.4)]' : ''}`}
              >
                {!canBuy
                  ? t.quotasBtnUnavailable
                  : disabled
                    ? t.quotasBtnLimitReached
                    : isSaldo
                      ? t.quotasBtnBuyWithBalance
                      : t.quotasBtnBuyWithCrypto}
              </button>
              <p className={`mt-3 text-center text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {!canBuy
                  ? bankStatus === BANK_STATUS.upcoming
                    ? t.quotasHintSoon
                    : t.quotasHintClosed
                  : blockedByGlobal
                    ? t.quotasHintGlobalLimit
                    : blockedByUser
                      ? t.quotasHintUserLimit
                      : requested > maxAllowed
                        ? fillTemplate(t.quotasHintMaxNowTemplate, { max: String(maxAllowed) })
                        : fillTemplate(t.quotasHintYouHaveTemplate, {
                            current: String(currentUnits),
                            global: Number(remainingGlobalQuotas || 0).toLocaleString(getLocaleForLang(lang)),
                          })}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.quotasHistoryTitle}</h3>
          <p className="text-sm text-gray-500 mt-1">{t.quotasHistorySubtitle}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">{t.quotasTableDate}</th>
                <th className="p-4">{t.quotasTableType}</th>
                <th className="p-4">{t.quotasTablePayment}</th>
                <th className="p-4">{t.quotasTableStatus}</th>
                <th className="p-4 text-right">{t.quotasTableValue}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {(Array.isArray(user?.transactions) ? user.transactions : [])
                .filter((t) => String(t?.kind || '') === 'COMPRA' || String(t?.type || '').startsWith('Compra '))
                .slice(0, 25)
                .map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 whitespace-nowrap">{formatDateTime(tx.at, lang)}</td>
                    <td className="p-4">{translateTransactionType(tx.type, t)}</td>
                    <td className="p-4">{tx.payment || '—'}</td>
                    <td className="p-4">
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold">{getStatusLabel(tx.status, t)}</span>
                    </td>
                    <td className="p-4 text-right font-bold">{formatMoneyUsd(tx.amount, lang)}</td>
                  </tr>
                ))}
              {(Array.isArray(user?.transactions) ? user.transactions : []).filter(
                (t) => String(t?.kind || '') === 'COMPRA' || String(t?.type || '').startsWith('Compra ')
              ).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-sm text-gray-500">
                    {t.quotasNoPurchasesYet}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="mt-8 text-center text-sm text-gray-500">
        {t.quotasActivationHint}
      </div>
    </div>
  );
};

const SettingsView = ({ user, setUser, lang }) => {
  const t = getT(lang);
  const [wallets, setWallets] = useState(user.wallets || { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' });

  const handleSaveWallets = (e) => {
    e.preventDefault();
    const updatedUser = { ...user, wallets };
    localStorage.setItem('rm_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    alert(t.settingsWalletsUpdatedAlert);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t.settingsAccountTitle}</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Wallet className="text-[#8A2BE2]" size={20} /> {t.settingsReceivingWalletsTitle}
          </h3>
          <form onSubmit={handleSaveWallets} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (BEP-20)</label>
              <input type="text" value={wallets.usdtBep20} onChange={(e) => setWallets({...wallets, usdtBep20: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDT (TRC-20)</label>
              <input type="text" value={wallets.usdtTrc20} onChange={(e) => setWallets({...wallets, usdtTrc20: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">USDC (Arbitrum)</label>
              <input type="text" value={wallets.usdcArbitrum} onChange={(e) => setWallets({...wallets, usdcArbitrum: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none" placeholder={t.settingsWalletAddressPlaceholder} />
            </div>
            <button type="submit" className="w-full py-3 bg-[#1A1A1A] hover:bg-gray-800 text-white font-bold rounded-lg transition-colors">
              {t.settingsSaveWalletsBtn}
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings className="text-gray-500" size={20} /> {t.settingsChangePasswordTitle}
          </h3>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert(t.settingsTokenSentAlert); }}>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settingsCurrentPassword}</label>
              <input type="password" placeholder="***" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settingsNewPassword}</label>
              <input type="password" placeholder="***" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settingsConfirmTokenEmail}</label>
              <div className="flex gap-2">
                <input type="text" placeholder="000000" className="w-full p-3 bg-gray-50 border rounded-lg outline-none" />
                <button type="button" className="px-4 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold">{t.send}</button>
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-[#8A2BE2] hover:bg-purple-600 text-white font-bold rounded-lg transition-colors">
              {t.settingsUpdatePasswordBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const WalletView = ({ setCurrentView, user, setUser, onNotify, adminConfig, lang }) => {
  const currentUser = normalizeUser(user);
  const t = getT(lang);
  const hasWallet = currentUser?.wallets?.usdtBep20 || currentUser?.wallets?.usdtTrc20 || currentUser?.wallets?.usdcArbitrum;
  const [renewModal, setRenewModal] = useState({ open: false, lotId: null });
  const [desistModal, setDesistModal] = useState({ open: false, lotId: null });
  const [renewPayment, setRenewPayment] = useState('SALDO');
  const [renewNetwork, setRenewNetwork] = useState('BEP20');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDT');
  const [withdrawNetwork, setWithdrawNetwork] = useState('BEP20');
  const [depositEdits, setDepositEdits] = useState({});
  const [verifyBusy, setVerifyBusy] = useState(false);

  const persistUser = (u) => {
    localStorage.setItem('rm_user', JSON.stringify(u));
    setUser?.(u);
  };

  const persistUsersState = (u) => {
    const st = loadUsersState();
    saveUsersState(upsertUser(st, u));
  };

  const getWithdrawAddress = () => {
    if (withdrawAsset === 'USDC') return String(currentUser?.wallets?.usdcArbitrum || '').trim();
    if (withdrawNetwork === 'TRC20') return String(currentUser?.wallets?.usdtTrc20 || '').trim();
    return String(currentUser?.wallets?.usdtBep20 || '').trim();
  };

  const pendingDeposits = (Array.isArray(currentUser?.transactions) ? currentUser.transactions : []).filter(
    (t) => String(t?.kind || '') === 'DEPOSITO' && String(t?.status || '').toLowerCase() === 'pendente'
  );

  const updateDepositPaymentId = (txId, paymentId) => {
    const pid = String(paymentId || '').trim();
    const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
    const nextTxs = txs.map((t) =>
      String(t?.id || '') === String(txId)
        ? { ...t, meta: { ...(t?.meta || {}), paymentId: pid || null } }
        : t
    );
    const nextUser = { ...currentUser, transactions: nextTxs };
    persistUser(nextUser);
    persistUsersState(nextUser);
  };

  const verifyDeposit = async (txId) => {
    try {
      if (verifyBusy) return;
      setVerifyBusy(true);
      const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
      const tx = txs.find((t) => String(t?.id || '') === String(txId));
      const paymentId = String(tx?.meta?.paymentId || '').trim();
      if (!paymentId) {
        alert(t.depositCodeRequired);
        return;
      }
      const res = await fetchNowpaymentStatus({ paymentId });
      if (!res.ok) {
        alert(`${t.depositCheckFailed} ${res.reason}`);
        return;
      }
      const settled = settleNowpaymentsDeposit({
        user: currentUser,
        depositTxId: txId,
        nowpayStatus: res.status,
        now: new Date(),
        cycleMonths: adminConfig?.cycle?.months,
        renewWindowHours: adminConfig?.cycle?.renewWindowHours,
      });
      if (!settled.ok) {
        alert(settled.reason);
        return;
      }
      if (settled.updated) {
        persistUser(settled.user);
        persistUsersState(settled.user);
      }
      alert(t.checkComplete);
    } finally {
      setVerifyBusy(false);
    }
  };

  const submitWithdraw = () => {
    const addr = getWithdrawAddress();
    const amount = Number(withdrawAmount || 0);
    const res = requestWithdraw({
      user: currentUser,
      amountUsd: amount,
      asset: withdrawAsset,
      network: withdrawAsset === 'USDC' ? 'ARBITRUM' : withdrawNetwork,
      address: addr,
      now: new Date(),
    });
    if (!res.ok) {
      alert(translateFinancialReason(res.reason, t));
      return;
    }
    persistUser(res.user);
    persistUsersState(res.user);
    onNotify?.({
      kind: 'WITHDRAW',
      title: t.withdrawRequestedTitle,
      message: `${t.withdrawRequestedMessage} $${WITHDRAW_FEE_USD}.`,
      at: res.tx.at,
      ref: res.tx.id,
    });
    setWithdrawAmount('');
    alert(t.withdrawRequestedAlert);
  };

  const reports = currentUser.transactions.map((tx, i) => ({
    id: tx.id || i,
    date: formatDateShort(tx.at, lang),
    type: translateTransactionType(tx.type, t),
    value: formatMoneyUsd(Math.abs(tx.amount), lang),
    displayValue: `${tx.amount >= 0 ? '+' : '-'}${formatMoneyUsd(Math.abs(tx.amount), lang)}`,
    status: getStatusLabel(tx.status, t),
    color: tx.amount > 0 ? 'text-green-600' : 'text-red-500'
  }));

  if (reports.length === 0) {
    reports.push(
      {
        id: 1,
        date: formatDateShort(new Date().toISOString(), lang),
        type: translateTransactionType('Compra COTA 50', t),
        value: formatMoneyUsd(50, lang),
        displayValue: `-${formatMoneyUsd(50, lang)}`,
        status: getStatusLabel('Concluído', t),
        color: 'text-gray-500',
      }
    );
  }

  const nowTs = Date.now();
  const lots = Array.isArray(currentUser.quotaLots) ? currentUser.quotaLots : [];
  const maturedLots = lots
    .filter((l) => l.status === 'MATURED')
    .map((l) => ({ ...l, renewLeftMs: Math.max(0, Date.parse(l.renewUntil) - nowTs) }))
    .sort((a, b) => (a.renewLeftMs < b.renewLeftMs ? -1 : 1));
  const activeLots = lots
    .filter((l) => l.status === 'ACTIVE')
    .map((l) => ({
      ...l,
      endsInMs: Math.max(0, Date.parse(l.endAt) - nowTs),
      durationMs: Math.max(1, Date.parse(l.endAt) - Date.parse(l.startAt)),
    }))
    .sort((a, b) => (a.endsInMs < b.endsInMs ? -1 : 1));
  const cancelLots = lots
    .filter((l) => l.status === 'CANCEL_PENDING')
    .map((l) => ({ ...l, cancelLeftMs: Math.max(0, Date.parse(l.cancelPayAt) - nowTs) }))
    .sort((a, b) => (a.cancelLeftMs < b.cancelLeftMs ? -1 : 1));

  const selectedLot = renewModal.open ? lots.find((l) => l.id === renewModal.lotId) : null;
  const desistLot = desistModal.open ? lots.find((l) => l.id === desistModal.lotId) : null;
  const renewNetworkFinal = renewPayment === 'USDT' ? renewNetwork : renewPayment === 'USDC' ? 'ARBITRUM' : null;

  const confirmRenew = () => {
    if (!selectedLot) return;
    const res = renewLot({
      user: currentUser,
      lotId: selectedLot.id,
      payment: renewPayment,
      network: renewNetworkFinal,
      cycle: adminConfig?.cycle,
      now: new Date(),
    });
    if (!res.ok) {
      alert(translateFinancialReason(res.reason, t));
      return;
    }
    persistUser(res.user);
    if (res.notification) onNotify?.(res.notification);
    setRenewModal({ open: false, lotId: null });
    alert(t.renewRegisteredAlert);
  };

  const confirmDesistance = () => {
    if (!desistLot) return;
    const res = requestDesistance({ user: currentUser, adminConfig, lotId: desistLot.id, now: new Date() });
    if (!res.ok) {
      alert(translateFinancialReason(res.reason, t));
      return;
    }
    persistUser(res.user);
    if (res.notification) onNotify?.(res.notification);
    setDesistModal({ open: false, lotId: null });
    alert(`${t.desistanceRequestedAlert} ${DESIST_ANALYSIS_HOURS}h.`);
  };

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t.walletTitle}</h2>
      
      <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-6">
        <div className="bg-[#1A1A1A] p-8 rounded-2xl border border-[#00FF00] text-center flex flex-col justify-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00FF00] opacity-10 rounded-full blur-3xl"></div>
          <h3 className="text-2xl font-bold text-white mb-2">{t.walletIncreaseEarningsTitle}</h3>
          <p className="text-gray-400 mb-6">{t.walletIncreaseEarningsDesc}</p>
          <button onClick={() => setCurrentView('quotas')} className="py-4 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-xl text-lg transition-transform transform hover:scale-105">
            {t.walletIncreaseEarningsCta}
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4">{t.walletWithdrawTitle}</h3>
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-sm text-gray-500">{t.walletWithdrawReleased}</p>
              <p className="text-4xl font-black text-[#8A2BE2]">{formatMoneyUsd(currentUser.balances.available, lang)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{t.walletWithdrawTotalInvested}</p>
              <p className="text-xl font-bold text-gray-700">{formatMoneyUsd(currentUser.balances.invested, lang)}</p>
            </div>
          </div>

          {!hasWallet ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-sm text-yellow-800">
              <p>{t.walletNoWalletConfigured}</p>
              <button onClick={() => setCurrentView('settings')} className="font-bold underline mt-1">{t.walletConfigureNow}</button>
            </div>
          ) : (
            <div className="space-y-4">
               <div>
                  <label className="text-sm text-gray-600 block mb-1">{t.walletWithdrawAmountLabel}</label>
                  <input
                    type="number"
                    min="10"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                  />
                  <div className="mt-2 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">{t.walletCurrencyLabel}</label>
                      <select
                        value={withdrawAsset}
                        onChange={(e) => setWithdrawAsset(e.target.value)}
                        className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                      >
                        <option value="USDT">USDT</option>
                        <option value="USDC">USDC</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">{t.walletNetworkLabel}</label>
                      {withdrawAsset === 'USDT' ? (
                        <select
                          value={withdrawNetwork}
                          onChange={(e) => setWithdrawNetwork(e.target.value)}
                          className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                        >
                          <option value="BEP20">BEP-20</option>
                          <option value="TRC20">TRC-20</option>
                        </select>
                      ) : (
                        <select disabled value="ARBITRUM" className="w-full p-3 border rounded-lg opacity-70 cursor-not-allowed">
                          <option value="ARBITRUM">Arbitrum</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    {(() => {
                      const calc = calcWithdrawNet({ amountUsd: Number(withdrawAmount || 0) });
                      return (
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <p className="text-gray-600">
                            {t.walletFeeFixedLabel} <span className="font-black text-gray-800">${WITHDRAW_FEE_USD}</span>
                          </p>
                          <p className="text-gray-600">
                            {t.walletYouReceiveLabel} <span className="font-black text-gray-900">{formatMoneyUsd(calc.netUsd, lang)}</span>
                          </p>
                        </div>
                      );
                    })()}
                  </div>
               </div>
               <button
                 type="button"
                 onClick={submitWithdraw}
                 className="w-full py-3 bg-[#8A2BE2] hover:bg-purple-600 text-white font-bold rounded-xl transition-colors"
               >
                 {t.walletRequestWithdrawBtn}
               </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.pendingDeposits}</h3>
          <p className="text-sm text-gray-500 mt-1">{t.pendingDepositsHint}</p>
        </div>
        <div className="p-6 space-y-3">
          {pendingDeposits.length === 0 ? (
            <p className="text-sm text-gray-500">{t.noPendingDeposits}</p>
          ) : (
            pendingDeposits.slice(0, 10).map((tx) => (
              <div key={tx.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 truncate">{translateTransactionType(tx.type, t)}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.walletValueLabel}: <span className="font-black text-gray-800">{formatMoneyUsd(tx.amount, lang)}</span></p>
                  </div>
                  <span className="text-xs font-black px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 whitespace-nowrap">
                    {getStatusLabel(tx.status, t)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-8">
                    <label className="block text-xs font-black text-gray-600">{t.depositCode}</label>
                    <input
                      value={String(depositEdits[tx.id] ?? tx?.meta?.paymentId ?? '')}
                      onChange={(e) => setDepositEdits((s) => ({ ...s, [tx.id]: e.target.value }))}
                      placeholder={t.depositCode}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                    />
                  </div>
                  <div className="lg:col-span-4 flex items-end">
                    <button
                      type="button"
                      disabled={verifyBusy}
                      onClick={() => {
                        const v = String(depositEdits[tx.id] ?? '').trim();
                        if (v) updateDepositPaymentId(tx.id, v);
                        verifyDeposit(tx.id);
                      }}
                      className={`w-full px-4 py-3 rounded-xl font-black ${verifyBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
                    >
                      {t.refresh}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.walletMovementHistoryTitle}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">{t.walletTableDate}</th>
                <th className="p-4">{t.walletTableType}</th>
                <th className="p-4">{t.walletTableStatus}</th>
                <th className="p-4 text-right">{t.walletTableValue}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.map(rep => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{rep.status}</span></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>{rep.displayValue || rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.walletCyclesRenewalTitle}</h3>
            <p className="text-sm text-gray-500">{t.walletCyclesRenewalDesc}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletCancellationsInReview}</p>
            {cancelLots.length === 0 ? (
              <p className="text-sm text-gray-500">{t.walletNoCancellationsInReview}</p>
            ) : (
              <div className="space-y-3">
                {cancelLots.map((l) => (
                  <div key={l.id} className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-800">{l.planTitle} x{l.units}</p>
                      <p className="text-xs text-gray-600">
                        {t.walletRefundExpected} {formatDateTime(l.cancelPayAt, lang)}
                      </p>
                      <p className="text-xs text-gray-600">{t.walletRemainingLabel} {Math.ceil(l.cancelLeftMs / (1000 * 60 * 60))}h</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600">{t.walletEstimatedValue}</p>
                      <p className="text-lg font-black text-gray-900">{formatMoneyUsd(l.cancelAmount, lang)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletRenewalAvailable}</p>
            {maturedLots.length === 0 ? (
              <p className="text-sm text-gray-500">{t.walletNoRenewalAvailable}</p>
            ) : (
              <div className="space-y-3">
                {maturedLots.map((l) => (
                  <div key={l.id} className="border border-yellow-200 bg-yellow-50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-800">{l.planTitle} x{l.units}</p>
                      <p className="text-xs text-gray-600">{t.walletDeadlineLabel} {formatDateTime(l.renewUntil, lang)}</p>
                      <p className="text-xs text-gray-600">{t.walletRemainingLabel} {Math.ceil(l.renewLeftMs / (1000 * 60 * 60))}h</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRenewModal({ open: true, lotId: l.id })}
                      className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
                    >
                      {t.walletRenewBtn}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletActiveCycles}</p>
            {activeLots.length === 0 ? (
              <p className="text-sm text-gray-500">{t.walletNoActiveCycles}</p>
            ) : (
              <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
                {activeLots.map((l) => (
                  <div key={l.id} className="border border-gray-200 rounded-xl p-4">
                    <p className="font-black text-gray-800">{l.planTitle} x{l.units}</p>
                    <p className="text-xs text-gray-500">{t.walletStart} {formatDateShort(l.startAt, lang)}</p>
                    <p className="text-xs text-gray-500">{t.walletEnd} {formatDateShort(l.endAt, lang)}</p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">{t.walletTimeRemaining}</p>
                        <p className="text-xs font-black text-gray-800">{Math.ceil(l.endsInMs / (1000 * 60 * 60 * 24))} {t.walletDays}</p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-[#8A2BE2]"
                          style={{ width: `${Math.min(100, Math.max(0, ((l.durationMs - l.endsInMs) / l.durationMs) * 100))}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDesistModal({ open: true, lotId: l.id })}
                      className="w-full mt-4 px-4 py-2 rounded-xl border border-gray-300 text-gray-800 font-black hover:border-red-300 hover:text-red-600"
                    >
                      {t.walletRequestCancellationBtn}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {renewModal.open && selectedLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRenewModal({ open: false, lotId: null })} />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#8A2BE2] overflow-hidden">
            <div className="p-5 bg-[#1A1A1A] text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-300">{t.walletRenewModalTitle}</p>
                <p className="text-lg font-black">{selectedLot.planTitle} x{selectedLot.units}</p>
              </div>
              <button type="button" onClick={() => setRenewModal({ open: false, lotId: null })} className="text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletValueLabel}</p>
                  <p className="text-sm font-black text-gray-800">{formatMoneyUsd(Number(selectedLot.planPrice || 0) * Number(selectedLot.units || 0), lang)}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {fillTemplate(t.walletRenewUntilLabel, { date: formatDateTime(selectedLot.renewUntil, lang) })}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
                  <label className="block text-xs font-black text-gray-700 mb-1">{t.walletPayMethodLabel}</label>
                  <select
                    value={renewPayment}
                    onChange={(e) => setRenewPayment(e.target.value)}
                    className="w-full p-2 border rounded-lg outline-none focus:ring-[#00FF00]"
                  >
                    <option value="SALDO">{t.quotasBalanceOption}</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                  </select>
                  {renewPayment === 'SALDO' && (
                    <p className="text-xs text-gray-500 mt-1">{t.quotasBalanceAvailable} <span className="font-black">{formatMoneyUsd(currentUser?.balances?.available, lang)}</span></p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{t.quotasBalanceAlwaysHint}</p>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1">{t.walletNetworkLabelShort}</label>
                  {renewPayment === 'USDT' ? (
                    <select
                      value={renewNetwork}
                      onChange={(e) => setRenewNetwork(e.target.value)}
                      className="w-full p-2 border rounded-lg outline-none focus:ring-[#00FF00]"
                    >
                      <option value="BEP20">BEP-20</option>
                      <option value="TRC20">TRC-20</option>
                    </select>
                  ) : (
                    <select
                      value={renewPayment === 'USDC' ? 'ARBITRUM' : ''}
                      disabled={renewPayment !== 'USDT'}
                      className="w-full p-2 border rounded-lg outline-none opacity-70 cursor-not-allowed"
                    >
                      <option value="">{renewPayment === 'SALDO' ? '—' : 'Arbitrum'}</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenewModal({ open: false, lotId: null })}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-black text-gray-700 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmRenew}
                  className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {desistModal.open && desistLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDesistModal({ open: false, lotId: null })} />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#8A2BE2] overflow-hidden">
            <div className="p-5 bg-[#1A1A1A] text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-300">{t.walletCancellationModalTitle}</p>
                <p className="text-lg font-black">{desistLot.planTitle} x{desistLot.units}</p>
              </div>
              <button type="button" onClick={() => setDesistModal({ open: false, lotId: null })} className="text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletQuotaValueLabel}</p>
                  <p className="text-sm font-black text-gray-800">{formatMoneyUsd(Number(desistLot.planPrice || 0) * Number(desistLot.units || 0), lang)}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletCancellationFeeLabel}</p>
                  <p className="text-sm font-black text-gray-800">
                    {Math.round(calcDesistPenaltyPct({ startAt: desistLot.startAt, now: new Date(), cycleMonths: adminConfig?.cycle?.months }) * 1000) / 10}%
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletAnalysisPeriodLabel}</p>
                  <p className="text-sm font-black text-gray-800">{DESIST_ANALYSIS_HOURS}h</p>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {t.walletCancellationConfirmHint}
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDesistModal({ open: false, lotId: null })}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-black text-gray-700 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
                <button type="button" onClick={confirmDesistance} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black">
                  {t.walletConfirmCancellationBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TeamView = ({ user, setUser, lang, onNotify, onOpenApn }) => {
  const t = getT(lang);
  const email = (user?.email || '').toLowerCase();
  const seed = user?.username || email || 'user';
  const [teamEntry, setTeamEntry] = useState(() => (email ? loadOrSeedTeamForUser(email, seed) : null));

  useEffect(() => {
    if (!email) return;
    setTeamEntry(loadOrSeedTeamForUser(email, seed));
  }, [email, seed]);

  const team = teamEntry?.team;
  const directVol = sumLevel(team, 1);
  const indirectVol = sumAllLevels(team) - directVol;
  const rankInfo = getCurrentRank(team);
  const residual = calcResidual(team, rankInfo.current.key);
  const entryFee = calcEntryFeeEarnings(team);
  const nextRankTarget = rankInfo.next?.target || rankInfo.current.target;
  const nextRankVolume = calcRankVolume(team, nextRankTarget);
  const rankTitleDisplay = translateRankTitle(rankInfo.current.title, t);
  const structureLevels = getStructureLevels({ team, residual });
  const structureTotalBase = getStructureTotalBase(team);
  const nextTargetPerLeg = getLegTarget(nextRankTarget);
  const rankProgressPct = getRankProgressPct(rankInfo);
  const networkLevels = (() => {
    const st = loadUsersState();
    const all = listUsers(st);
    const levels = buildReferralLevels({ users: all, rootUsername: user?.username, maxDepth: 5 });
    const normalizeDownline = (u, idx) => {
      const e = String(u?.email || '').toLowerCase();
      const s = u?.username || e || 'user';
      const tEntry = e ? loadOrSeedTeamForUser(e, s) : null;
      const rInfo = getCurrentRank(tEntry?.team);
      const holdings = u?.holdings || {};
      const totalCotas = Number(holdings.cota10 || 0) + Number(holdings.cota50 || 0) + Number(holdings.cota100 || 0);
      return {
        key: e || `${String(u?.username || '').toLowerCase()}-${idx}`,
        username: u?.username || '—',
        email: u?.email || '—',
        createdAt: u?.createdAt || u?.updatedAt || null,
        holdings,
        totalCotas,
        rankTitle: translateRankTitle(rInfo?.current?.title || '—', t),
      };
    };
    return [1, 2, 3, 4, 5].map((lvl) => ({
      level: lvl,
      users: (levels[lvl - 1] || []).map((u, idx) => normalizeDownline(u, idx)),
    }));
  })();

  useEffect(() => {
    if (!email || !teamEntry) return;
    const currentKey = rankInfo.current.key;
    const last = teamEntry.lastRankKey;
    if (!last) {
      const updated = updateTeamForUser(email, { lastRankKey: currentKey });
      setTeamEntry(updated);
      return;
    }
    if (last !== currentKey) {
      const updated = updateTeamForUser(email, { lastRankKey: currentKey });
      setTeamEntry(updated);
      onNotify?.({
        kind: 'RANK_UP',
        at: new Date().toISOString(),
        ref: `rank:${currentKey}`,
        i18n: {
          titleKey: 'rankUpTitle',
          messageKey: 'rankUpMessageTemplate',
          values: { rank: rankInfo.current.title },
        },
      });
    }
  }, [email, teamEntry, rankInfo.current.key]);

  const simulateResidual = () => {
    if (!email) return;
    const today = new Date().toISOString().slice(0, 10);
    if (teamEntry?.lastResidualDay === today) {
      alert(t.residualAlreadySimulated);
      return;
    }
    const amount = residual.total;
    const currentUser = normalizeUser(user);
    const balances = { ...(currentUser.balances || {}) };
    balances.available = Number((Number(balances.available || 0) + amount).toFixed(2));
    balances.teamEarnings = Number((Number(balances.teamEarnings || 0) + amount).toFixed(2));

    const tx = {
      id: `${Date.now()}-residual`,
      at: new Date().toISOString(),
      kind: 'RESIDUAL',
      type: `Residual diário (${rankInfo.current.title})`,
      amount,
      payment: 'SISTEMA',
      status: 'Creditado',
    };
    const updatedUser = { ...currentUser, balances, transactions: [tx, ...(currentUser.transactions || [])] };
    localStorage.setItem('rm_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    const updatedEntry = updateTeamForUser(email, { lastResidualDay: today });
    setTeamEntry(updatedEntry);
    onNotify?.({
      kind: 'RESIDUAL',
      title: 'Residual creditado',
      message: `Residual do dia creditado: ${formatTeamMoney(amount)} (${rankInfo.current.title}).`,
      at: tx.at,
      ref: tx.id,
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center bg-[#1A1A1A] p-6 rounded-2xl shadow-lg border border-[#8A2BE2] gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">{t.teamPageTitle}</h2>
          <p className="text-gray-400 text-sm">{t.teamPageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:gap-5">
          <div className="text-center">
            <p className="text-xs text-gray-500">{t.rank}</p>
            <p className="text-xl font-black text-[#00FF00]">{translateRankTitle(rankInfo.current.title, t)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">{t.teamDirectVolume}</p>
            <p className="text-xl font-bold text-white">{formatTeamMoney(directVol)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">{t.teamIndirectVolume}</p>
            <p className="text-xl font-bold text-white">{formatTeamMoney(indirectVol)}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenApn?.({
                page: 10,
                title: `${t.apnPresentation} • ${t.apnTeamEarnings}`,
                shortcuts: [
                  { label: t.apnTeamEarnings, page: 10 },
                  { label: t.apnResidual, page: 11 },
                ],
              })
            }
            className="px-4 py-2 rounded-xl border border-gray-700 text-white font-black hover:border-[#00FF00]"
          >
            {t.viewPresentation}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TeamStructureCard
          t={t}
          rankTitle={rankTitleDisplay}
          totalBase={structureTotalBase}
          activeResidualRate={residual.rates[1]}
          levels={structureLevels}
        />

        <TeamResidualCard
          t={t}
          rankTitle={rankTitleDisplay}
          residual={residual}
          onSimulateResidual={simulateResidual}
        />

        <TeamRankCard
          t={t}
          lang={lang}
          rankInfo={rankInfo}
          rankProgressPct={rankProgressPct}
          nextRankVolume={nextRankVolume}
          nextTargetPerLeg={nextTargetPerLeg}
          entryFee={entryFee}
        />
      </div>

      <TeamNetworkLevelsCard t={t} lang={lang} levels={networkLevels} />
    </div>
  );
};

const BonusView = ({ user, adminConfig, onOpenApn, lang }) => {
  const t = getT(lang);
  const email = (user?.email || '').toLowerCase();
  const seed = user?.username || email || 'user';
  const teamEntry = email ? loadOrSeedTeamForUser(email, seed) : null;
  const team = teamEntry?.team;
  const rankInfo = getCurrentRank(team);
  const locale = getLocaleForLang(lang);
  const formatPct = (rate) => {
    const n = Number(rate || 0) * 100;
    const hasDecimal = Math.abs(n - Math.round(n)) > 1e-9;
    return `${n.toLocaleString(locale, { minimumFractionDigits: hasDecimal ? 1 : 0, maximumFractionDigits: 1 })}%`;
  };

  const usersState = loadUsersState();
  const usersWithRank = listUsers(usersState).map((u) => {
    const nu = normalizeUser(u);
    const e = String(nu?.email || '').toLowerCase();
    const s = nu?.username || e || 'user';
    const t = e ? loadOrSeedTeamForUser(e, s)?.team : null;
    const rk = getCurrentRank(t).current.key;
    return { ...nu, rankKey: rk };
  });
  const eliteBoard = computeEliteBoard(usersWithRank);
  const eliteInfo = calcElitePool(adminConfig?.elite?.fortnightProfitUsd);
  const elitePool = eliteInfo.elitePool;

  const myAssignedCat = ELITE_CATEGORIES.map((c) => c.key).find((k) =>
    (eliteBoard?.[k]?.occupants || []).some((o) => String(o.email || '').toLowerCase() === email)
  );
  const myEligibleCat = getEliteCategoryForRank(rankInfo.current.key);
  const myDisplayCat = myAssignedCat || myEligibleCat;
  const mySlot =
    myAssignedCat && eliteBoard?.[myAssignedCat]
      ? (eliteBoard[myAssignedCat].occupants || []).findIndex((o) => String(o.email || '').toLowerCase() === email)
      : -1;

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="relative p-6 min-[540px]:p-8 lg:p-10">
          <div className="pointer-events-none absolute -top-32 -left-32 w-72 h-72 bg-emerald-900/20 rounded-[56px] rotate-12 blur-sm" />
          <div className="pointer-events-none absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-900/20 rounded-[64px] -rotate-12 blur-sm" />
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-3 text-emerald-900">
                <Gift className="w-7 h-7" />
                <p className="text-lg font-semibold">{t.bonusMeritEarnings}</p>
              </div>
              <h2 className="mt-2 text-4xl lg:text-5xl font-black text-emerald-900">{t.bonusResidualTitle}</h2>
              <p className="mt-4 text-sm min-[540px]:text-base text-gray-700 max-w-2xl">
                {t.bonusResidualDesc1} {t.bonusResidualDesc2}
              </p>
              <p className="mt-4 text-center text-sm min-[540px]:text-base font-black text-emerald-900">
                {t.bonusResidualQuote}
              </p>
            </div>
            <div className="lg:col-span-4 flex items-end">
              <div className="w-full bg-white/90 backdrop-blur border border-gray-200 rounded-2xl p-4">
                <p className="text-xs text-gray-500">{t.bonusYourCurrentRank}</p>
                <p className="text-2xl font-black text-emerald-900">{translateRankTitle(rankInfo.current.title, t)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t.bonusRankVolumeRule}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{t.bonusCurrentVolume}</p>
                    <p className="text-lg font-black text-[#00FF00] truncate">{formatMoneyUsd(rankInfo.volume, lang)}</p>
                  </div>
                  {rankInfo.next ? (
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500">{t.bonusNext}</p>
                      <p className="text-xs font-black text-gray-800">{translateRankTitle(rankInfo.next.title, t)}</p>
                      <p className="text-[11px] text-gray-500">{formatMoneyUsdInt(rankInfo.next.target, lang)}</p>
                    </div>
                  ) : (
                    <span className="text-xs font-black text-emerald-900">{t.bonusTop}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenApn?.({
                        page: 11,
                        title: `${t.apnPresentation} • ${t.apnResidualEarnings}`,
                        shortcuts: [
                          { label: t.apnResidualEarnings, page: 11 },
                          { label: t.apnElitePool, page: 12 },
                        ],
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
                  >
                    {t.bonusViewResidualPdf}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenApn?.({
                        page: 12,
                        title: `${t.apnPresentation} • ${t.apnElitePool}`,
                        shortcuts: [
                          { label: t.apnResidualEarnings, page: 11 },
                          { label: t.apnElitePool, page: 12 },
                        ],
                      })
                    }
                    className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
                  >
                    {t.bonusViewElitePdf}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-emerald-900 mt-0.5" />
            <div>
              <p className="text-sm font-black text-emerald-900">{t.bonusRankSectionTitle}</p>
              <p className="text-xs text-gray-600 leading-snug max-w-md">
                {t.bonusRankQualificationRule}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {RANKS.map((r) => (
              <div
                key={r.key}
                className="border border-gray-100 rounded-xl p-3 min-[540px]:p-4 bg-gray-50/70"
              >
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-3">
                  <p className="text-lg font-black text-gray-900 leading-none">{translateRankTitle(r.title, t)}</p>
                  <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-2 w-full min-[540px]:w-auto">
                    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusGoal}</p>
                      <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.target, lang)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusPrize}</p>
                      <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.bonus, lang)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-emerald-900 rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-emerald-800 text-white">
          <p className="text-2xl min-[540px]:text-3xl font-black tracking-wide text-center">{t.bonusResidualShort}</p>

          <div className="mt-5 space-y-3 min-[540px]:hidden">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <div key={lvl} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-black text-white mb-3">{fillTemplate(t.levelLabelTemplate, { n: String(lvl) })}</p>
                <div className="grid grid-cols-2 gap-2">
                  {RANKS.map((r) => {
                    const rate = lvl === 1 ? r.residual[1] : r.residual.other;
                    return (
                      <div key={`${r.key}-${lvl}`} className="rounded-lg bg-black/10 border border-white/10 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-white/70">{r.key === 'RM' ? 'RM' : translateRankTitle(r.title, t)}</p>
                        <p className="text-sm font-black text-white whitespace-nowrap">{formatPct(rate)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden min-[540px]:block overflow-x-auto">
            <table className="mt-5 min-w-[520px] w-full text-left border-collapse">
              <thead>
                <tr className="text-sm text-white/90">
                  <th className="py-2 pr-4"> </th>
                  {RANKS.map((r) => (
                    <th key={r.key} className="py-2 pr-4 font-black">{r.key === 'RM' ? 'RM' : translateRankTitle(r.title, t)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <tr key={lvl} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-black whitespace-nowrap">{fillTemplate(t.levelLabelTemplate, { n: String(lvl) })}</td>
                    {RANKS.map((r) => {
                      const rate = lvl === 1 ? r.residual[1] : r.residual.other;
                      return (
                        <td key={`${r.key}-${lvl}`} className="py-2 pr-4 font-semibold whitespace-nowrap">{formatPct(rate)}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6">{t.bonusRewardsTrackTitle}</h3>
        <div className="space-y-5">
          {RANKS.map((r) => {
            const v = calcRankVolume(team, r.target).total;
            const progress = r.target > 0 ? Math.min(100, (v / r.target) * 100) : 0;
            const unlocked = v >= r.target;
            return (
              <div key={r.key} className={`p-4 rounded-xl border ${unlocked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className={`font-black text-lg ${unlocked ? 'text-green-700' : 'text-gray-800'}`}>{translateRankTitle(r.title, t)}</p>
                    <div className="mt-2 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/80 border border-gray-200 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusGoal}</p>
                        <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.target, lang)}</p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-gray-200 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusPrize}</p>
                        <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.bonus, lang)}</p>
                      </div>
                    </div>
                  </div>
                  <span className={`self-start min-[540px]:self-auto text-xs px-2 py-1 rounded font-black whitespace-nowrap ${unlocked ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                    {unlocked ? t.bonusAchieved : `${progress.toFixed(1)}%`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full ${unlocked ? 'bg-green-500' : 'bg-[#8A2BE2]'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2 text-xs text-gray-500">
                  <div className="rounded-lg bg-white/70 border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusProgressLabel}</p>
                    <p className="font-black text-gray-700">{formatMoneyUsd(v, lang)} / {formatMoneyUsdInt(r.target, lang)}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusResidualL1}</p>
                    <p className="font-black text-gray-700">{formatPct(r.residual[1])}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.bonusEliteTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {t.bonusEliteDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenApn?.({
                page: 12,
                title: `${t.apnPresentation} • ${t.apnElitePool}`,
                shortcuts: [
                  { label: t.apnResidualEarnings, page: 11 },
                  { label: t.apnElitePool, page: 12 },
                ],
              })
            }
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
          >
            {t.bonusViewInPdf}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusBiweeklyProfitAdmin}</p>
            <p className="text-lg font-black text-gray-800">{formatMoneyUsdInt(eliteInfo.profit, lang)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusElitePool10}</p>
            <p className="text-lg font-black text-[#00FF00]">{formatMoneyUsd(elitePool, lang)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusYourStatus}</p>
              {myDisplayCat ? (
              <p className="text-sm font-black text-gray-800">
                  {mySlot >= 0
                    ? fillTemplate(t.bonusSlotTemplate, { slot: String(mySlot + 1), cat: String(myDisplayCat) })
                    : fillTemplate(t.bonusQualifiedWaitingTemplate, { cat: String(myDisplayCat) })}
              </p>
            ) : (
              <p className="text-sm font-black text-gray-800">{t.bonusNotQualified}</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ELITE_CATEGORIES.map((cat) => {
            const block = eliteBoard?.[cat.key];
            const occupants = block?.occupants || [];
            const slotAmount = calcElitePayoutPerSlot(elitePool, cat.key);
            return (
              <div key={cat.key} className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-900">{cat.title}</p>
                    <p className="text-xs text-gray-500">
                      {cat.slots} {t.bonusSlotsWord} • {Math.round(Number(cat.pctPerSlot || 0) * 1000) / 10}% {t.bonusPerSlotWord} • {formatMoneyUsd(slotAmount, lang)} {t.bonusPerLeaderWord}
                    </p>
                  </div>
                  <span className="text-xs font-black px-2 py-1 rounded bg-white border border-gray-200 text-gray-700">
                    {occupants.length}/{cat.slots}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {Array.from({ length: cat.slots }).map((_, i) => {
                    const occ = occupants[i];
                    return (
                      <div key={i} className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-2 bg-white rounded-xl border border-gray-200 px-3 py-3">
                        <p className="text-sm font-black text-gray-800">#{i + 1}</p>
                        {occ ? (
                          <div className="min-w-0 w-full min-[540px]:w-auto text-left min-[540px]:text-right">
                            <p className="text-sm font-black text-gray-900 break-all min-[540px]:break-normal min-[540px]:truncate">{occ.username || occ.email}</p>
                            <p className="text-[11px] text-gray-500">{t.bonusEntryLabel} {occ.achievedAt ? formatDateTime(occ.achievedAt, lang) : '—'}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 font-bold">{t.bonusSlotAvailable}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          {t.bonusRulesLabel} {t.bonusRulesText}
        </p>
        {adminConfig?.elite?.lastPaidAt && (
          <p className="text-xs text-gray-500 mt-1">
            {fillTemplate(t.bonusLastPaidSimulatedTemplate, { date: formatDateTime(adminConfig.elite.lastPaidAt, lang) })}
          </p>
        )}
      </div>
    </div>
  );
};

const ReportsView = ({ user, lang }) => {
  const currentUser = normalizeUser(user);
  const t = getT(lang);

  const reports = currentUser.transactions.map((tx, i) => ({
    id: tx.id || i,
    date: formatDateTime(tx.at, lang),
    type: translateTransactionType(tx.type, t),
    value: `${tx.amount >= 0 ? '+' : '-'}${formatMoneyUsd(Math.abs(tx.amount), lang)}`,
    status: getStatusLabel(tx.status, t),
    color: tx.amount > 0 ? 'text-green-600' : 'text-red-500'
  }));

  if (reports.length === 0) {
    const now = new Date();
    const iso1 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const iso2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const iso3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    reports.push(
      {
        id: 1,
        date: formatDateTime(iso1, lang),
        type: translateTransactionType('Residual diário (Silver)', t),
        value: `+${formatMoneyUsd(1.5, lang)}`,
        status: getStatusLabel('Creditado', t),
        color: 'text-green-600',
      },
      {
        id: 2,
        date: formatDateTime(iso2, lang),
        type: translateTransactionType('Residual diário (Silver)', t),
        value: `+${formatMoneyUsd(1.5, lang)}`,
        status: getStatusLabel('Creditado', t),
        color: 'text-green-600',
      },
      {
        id: 3,
        date: formatDateTime(iso3, lang),
        type: translateTransactionType('Ganho de Rede (TE) - Nível 1 - Compra alfabrazil', t),
        value: `+${formatMoneyUsd(4, lang)}`,
        status: getStatusLabel('Creditado', t),
        color: 'text-blue-600',
      }
    );
  }

  return (
    <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t.reportsTitle}</h2>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">{t.reportsTableDateTime}</th>
                <th className="p-4">{t.reportsTableDescription}</th>
                <th className="p-4">{t.quotasTableStatus}</th>
                <th className="p-4 text-right">{t.quotasTableValue}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.map(rep => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{rep.status}</span></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>{rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-center bg-gray-50 border-t border-gray-100 text-sm text-gray-500 cursor-pointer hover:text-gray-800">
          {t.reportsLoadMore}
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState(() => getInitialLang());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [adminConfig, setAdminConfig] = useState(loadAdminConfig());
  const [historyModal, setHistoryModal] = useState({ open: false, bankId: null, bankName: null });
  const [supportModal, setSupportModal] = useState({ open: false, channel: null, name: null });
  const [faqOpen, setFaqOpen] = useState(false);
  const [apnModal, setApnModal] = useState({ open: false, page: 1, title: null, shortcuts: [] });
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [notificationsState, setNotificationsState] = useState(loadNotificationsState());
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [notificationsListState, setNotificationsListState] = useState([]);

  const setUserLang = (next) => setLang(normalizeLang(next));
  const effectiveLang = currentView === 'admin' ? 'pt' : lang;
  const tEff = getT(effectiveLang);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, normalizeLang(lang));
    } catch {}
  }, [lang]);

  useEffect(() => {
    try {
      const path = String(window.location?.pathname || '');
      const match = path.match(/\/ref\/([^/]+)/i);
      if (match && match[1]) {
        const ref = decodeURIComponent(match[1]).trim();
        if (ref) localStorage.setItem('rm_ref_username', ref);
      }
    } catch {}

    // Verifica se há usuário no localStorage ao carregar
    const storedUser = localStorage.getItem('rm_user');
    if (storedUser) {
      const nowIso = new Date().toISOString();
      const parsed = JSON.parse(storedUser);
      const base = { ...(parsed || {}) };
      const normalized = normalizeUser({ ...base, createdAt: base.createdAt || nowIso });
      const email = String(normalized?.email || '').toLowerCase();
      const seed = normalized?.username || email || 'user';
      const teamEntry = email ? loadOrSeedTeamForUser(email, seed) : null;
      const rankKey = getCurrentRank(teamEntry?.team).current.key;
      const withElite = ensureEliteAchievedAt(normalized, rankKey, normalized.createdAt);
      localStorage.setItem('rm_user', JSON.stringify(withElite));
      setUser(withElite);
    }
  }, []);

  useEffect(() => {
    const email = String(user?.email || '').toLowerCase();
    if (!email) return;
    const st = loadUsersState();
    saveUsersState(upsertUser(st, user));
  }, [user]);

  useEffect(() => {
    const cfg = loadAdminConfig();
    setAdminConfig(cfg);
  }, []);

  const syncNotifications = (email) => {
    const st = loadNotificationsState();
    const list = listNotifications(st, email);
    setNotificationsState(st);
    setNotificationsListState(list);
    setNotificationsUnread(getUnreadNotificationsCount(st, email));
  };

  const pushNotification = (email, n) => {
    const st = loadNotificationsState();
    const next = saveNotificationsState(addNotification(st, email, n));
    setNotificationsState(next);
    setNotificationsListState(listNotifications(next, email));
    setNotificationsUnread(getUnreadNotificationsCount(next, email));
  };

  const markAllNotifications = (email) => {
    const st = loadNotificationsState();
    const next = saveNotificationsState(markAllRead(st, email));
    setNotificationsState(next);
    setNotificationsListState(listNotifications(next, email));
    setNotificationsUnread(getUnreadNotificationsCount(next, email));
  };

  const openApn = (cfg) => {
    setApnModal({
      open: true,
      page: Number(cfg?.page || 1),
      title: cfg?.title || 'Apresentação (PDF)',
      shortcuts: Array.isArray(cfg?.shortcuts) ? cfg.shortcuts : [],
    });
  };

  const round2 = (n) => Number(Number(n || 0).toFixed(2));

  const buildEliteBoard = () => {
    const st = loadUsersState();
    const users = listUsers(st);
    let nextSt = st;
    let changed = false;
    const usersWithRank = users.map((u) => {
      const normalized = normalizeUser(u);
      const email = String(normalized?.email || '').toLowerCase();
      const seed = normalized?.username || email || 'user';
      const teamEntry = email ? loadOrSeedTeamForUser(email, seed) : null;
      const rankKey = getCurrentRank(teamEntry?.team).current.key;
      const at = normalized.createdAt || normalized.updatedAt || new Date().toISOString();
      const withElite = ensureEliteAchievedAt(normalized, rankKey, at);
      if (withElite !== normalized) {
        nextSt = upsertUser(nextSt, withElite);
        changed = true;
      }
      return { ...withElite, rankKey };
    });
    if (changed) saveUsersState(nextSt);
    return { usersWithRank, board: computeEliteBoard(usersWithRank) };
  };

  const simulateElitePayout = () => {
    const cfg = loadAdminConfig();
    const { elitePool } = calcElitePool(cfg?.elite?.fortnightProfitUsd);
    if (!elitePool) {
      alert(tEff.bonusAdminProfitMissingAlert);
      return null;
    }
    const { board } = buildEliteBoard();
    const nowIso = new Date().toISOString();

    let usersSt = loadUsersState();
    let notifSt = loadNotificationsState();

    ELITE_CATEGORIES.forEach((cat) => {
      const slotAmount = calcElitePayoutPerSlot(elitePool, cat.key);
      const occupants = board?.[cat.key]?.occupants || [];
      occupants.forEach((o, idx) => {
        const email = String(o.email || '').toLowerCase();
        const existing = getUserByEmail(usersSt, email);
        if (!existing) return;
        const normalized = normalizeUser(existing);
        const balances = { ...(normalized.balances || {}) };
        balances.available = round2(Number(balances.available || 0) + slotAmount);
        balances.eliteEarnings = round2(Number(balances.eliteEarnings || 0) + slotAmount);
        const tx = {
          id: `${Date.now()}-elite-${cat.key}-${idx}`,
          at: nowIso,
          kind: 'ELITE',
          type: `Bolsão Elite (${cat.title})`,
          amount: slotAmount,
          payment: 'SISTEMA',
          status: 'Creditado',
        };
        const updated = { ...normalized, balances, transactions: [tx, ...(normalized.transactions || [])] };
        usersSt = upsertUser(usersSt, updated);

        if (!hasNotificationRef(notifSt, email, 'ELITE', tx.id)) {
          notifSt = addNotification(notifSt, email, {
            kind: 'ELITE',
            at: nowIso,
            ref: tx.id,
            i18n: {
              titleKey: 'bonusEliteCreditedTitle',
              messageKey: 'eliteCreditedMessageTemplate',
              values: { amount: slotAmount, cat: cat.title },
            },
          });
        }

        const currentEmail = String(user?.email || '').toLowerCase();
        if (currentEmail && currentEmail === email) {
          localStorage.setItem('rm_user', JSON.stringify(updated));
          setUser(updated);
        }
      });
    });

    saveUsersState(usersSt);
    saveNotificationsState(notifSt);

    const savedCfg = saveAdminConfig({ ...cfg, elite: { ...(cfg.elite || {}), lastPaidAt: nowIso } });
    setAdminConfig(savedCfg);
    const currentEmail = String(user?.email || '').toLowerCase();
    if (currentEmail) syncNotifications(currentEmail);
    alert(tEff.bonusEliteSimulatedSuccessAlert);
    return savedCfg;
  };

  useEffect(() => {
    const email = (user?.email || '').toLowerCase();
    if (!email) return;

    const compute = () => {
      const st = loadSupportState();
      setSupportUnread(getUnreadCountForUser(st, email));

      const notifSt = loadNotificationsState();
      const threads = Object.values(st?.threads || {}).filter((t) => (t.userEmail || '').toLowerCase() === email);
      let nextNotif = notifSt;
      let changed = false;
      threads.forEach((t) => {
        t.messages
          .filter((m) => m.from === 'admin' && !m.readByUser)
          .forEach((m) => {
            const ref = `support:${m.id}`;
            if (hasNotificationRef(nextNotif, email, 'SUPPORT_MSG', ref)) return;
            nextNotif = addNotification(nextNotif, email, {
              kind: 'SUPPORT_MSG',
              title: 'Mensagem do suporte',
              message: m.text,
              at: m.at,
              ref,
            });
            changed = true;
          });
      });

      if (changed) {
        const saved = saveNotificationsState(nextNotif);
        setNotificationsState(saved);
        setNotificationsListState(listNotifications(saved, email));
        setNotificationsUnread(getUnreadNotificationsCount(saved, email));
      } else {
        setNotificationsUnread(getUnreadNotificationsCount(notifSt, email));
        setNotificationsListState(listNotifications(notifSt, email));
        setNotificationsState(notifSt);
      }
    };

    compute();

    const intervalId = window.setInterval(compute, 2000);

    const onStorage = (e) => {
      if (e?.key === 'rm_support') compute();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.email]);

  useEffect(() => {
    const email = (user?.email || '').toLowerCase();
    if (!email) return;
    syncNotifications(email);
  }, [user?.email]);

  useEffect(() => {
    const email = (user?.email || '').toLowerCase();
    if (!email) return;

    const run = () => {
      const storedUser = localStorage.getItem('rm_user');
      const storedCfg = loadAdminConfig();
      if (!storedUser) return;

      const currentUser = normalizeUser(JSON.parse(storedUser));
      const settled = settleCyclesIfNeeded({ user: currentUser, adminConfig: storedCfg, now: new Date() });
      const nextUser = settled.user;
      const nextCfg = settled.adminConfig;

      const userChanged = JSON.stringify(currentUser) !== JSON.stringify(nextUser);
      const cfgChanged = JSON.stringify(storedCfg) !== JSON.stringify(nextCfg);

      if (userChanged) {
        localStorage.setItem('rm_user', JSON.stringify(nextUser));
        setUser(nextUser);
      }
      if (cfgChanged) {
        const saved = saveAdminConfig(nextCfg);
        setAdminConfig(saved);
      }

      if (Array.isArray(settled.notifications) && settled.notifications.length) {
        settled.notifications.forEach((n) => pushNotification(email, n));
      }
    };

    run();
    const id = window.setInterval(run, 60000);
    return () => window.clearInterval(id);
  }, [user?.email]);

  const handleLogin = (u) => {
    const nowIso = new Date().toISOString();
    const base = { ...(u || {}) };
    const isRegister = Object.prototype.hasOwnProperty.call(base, 'confirmPassword');
    const clean = { ...base };
    if (Object.prototype.hasOwnProperty.call(clean, 'confirmPassword')) delete clean.confirmPassword;
    const withCreated = { ...clean, createdAt: clean.createdAt || nowIso };
    const normalized = normalizeUser(withCreated);
    const email = String(normalized?.email || '').toLowerCase();
    const seed = normalized?.username || email || 'user';
    const teamEntry = email ? loadOrSeedTeamForUser(email, seed) : null;
    const rankKey = getCurrentRank(teamEntry?.team).current.key;
    const withElite = ensureEliteAchievedAt(normalized, rankKey, normalized.createdAt);
    let usersSt = loadUsersState();
    let finalUser = withElite;

    const myUsername = String(withElite?.username || '').trim();
    const desiredRef = String(withElite?.referrerUsername || '').trim();
    if (isRegister && desiredRef) {
      const refUser = getUserByUsername(usersSt, desiredRef);
      const safeRef = refUser && String(refUser?.username || '').trim().toLowerCase() !== myUsername.toLowerCase() ? String(refUser.username).trim() : null;
      if (safeRef) {
        finalUser = { ...withElite, referrerUsername: safeRef };
        usersSt = upsertUser(usersSt, finalUser);
      } else {
        finalUser = { ...withElite, referrerUsername: null };
        usersSt = upsertUser(usersSt, finalUser);
      }
    } else {
      usersSt = upsertUser(usersSt, withElite);
    }

    saveUsersState(usersSt);
    localStorage.setItem('rm_user', JSON.stringify(finalUser));
    setUser(finalUser);

    if (isRegister) {
      try {
        localStorage.removeItem('rm_ref_username');
      } catch {}
    }
  };

  const handleLogout = () => {
    // Mantemos o user no localstorage para facilitar o re-login no protótipo, apenas deslogamos o estado
    setUser(null);
  };

  if (!user) {
    return <AuthFlow onLogin={handleLogin} lang={lang} setLang={setUserLang} />;
  }

  const isAdmin = (user?.email || '').toLowerCase() === 'rmadmin@gmail.com';

  // Renderiza a view correspondente
  const renderView = () => {
    switch(currentView) {
      case 'home':
        return (
          <HomeView
            lang={effectiveLang}
            adminConfig={adminConfig}
            user={user}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
            onOpenApn={openApn}
          />
        );
      case 'quotas': 
        return (
          <QuotasView 
            user={user} 
            setUser={setUser} 
            lang={effectiveLang}
            adminConfig={adminConfig} 
            onBuy={(quotasBought) => {
              const base = Number.isFinite(Number(adminConfig?.globalSold)) ? Number(adminConfig.globalSold) : 45230;
              const inc = Number.isFinite(Number(quotasBought)) ? Number(quotasBought) : 0;
              const newGlobalSold = base + inc;
              if (newGlobalSold > QUOTA_GLOBAL_LIMIT) {
                alert('Limite global de 100.000 cotas atingido.');
                return;
              }
              const saved = saveAdminConfig({ ...adminConfig, globalSold: newGlobalSold });
              setAdminConfig(saved);
            }}
            onNotify={(n) => pushNotification((user?.email || '').toLowerCase(), n)}
            onOpenApn={openApn}
          />
        );
      case 'team':
        return <TeamView user={user} setUser={setUser} lang={effectiveLang} onNotify={(n) => pushNotification((user?.email || '').toLowerCase(), n)} onOpenApn={openApn} />;
      case 'wallet':
        return (
          <WalletView
            setCurrentView={setCurrentView}
            user={user}
            setUser={setUser}
            lang={effectiveLang}
            adminConfig={adminConfig}
            onNotify={(n) => pushNotification((user?.email || '').toLowerCase(), n)}
          />
        );
      case 'reports': return <ReportsView user={user} lang={effectiveLang} />;
      case 'bonus': return <BonusView user={user} adminConfig={adminConfig} onOpenApn={openApn} lang={effectiveLang} />;
      case 'settings': return <SettingsView user={user} setUser={setUser} lang={effectiveLang} />;
      case 'admin':
        return (
          <AdminView
            config={adminConfig}
            onSave={(draft) => {
              const saved = saveAdminConfig(draft);
              setAdminConfig(saved);
              alert('Configuração das bancas atualizada.');
            }}
            onSimulateElitePayout={() => simulateElitePayout()}
          />
        );
      default:
        return (
          <HomeView
            lang={effectiveLang}
            adminConfig={adminConfig}
            user={user}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
            onOpenApn={openApn}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-[#F3F4F6] font-sans overflow-hidden">
        <Sidebar 
          isOpen={sidebarOpen} 
          setIsOpen={setSidebarOpen} 
          currentView={currentView}
          setCurrentView={setCurrentView}
          lang={effectiveLang}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />
        
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-64 relative overflow-hidden">
          <Header 
            user={user} 
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
            lang={effectiveLang}
            userLang={lang}
            setLang={setUserLang}
            setCurrentView={setCurrentView}
            notificationsCount={Number(supportUnread || 0) + Number(notificationsUnread || 0)}
            notifications={notificationsListState}
            onMarkAllNotificationsRead={() => markAllNotifications((user?.email || '').toLowerCase())}
          />
          
          <main className="flex-1 overflow-y-auto bg-gray-50 relative pb-20">
            {renderView()}
          </main>

        <BankHistoryModal
          isOpen={historyModal.open}
          bankId={historyModal.bankId}
          bankName={historyModal.bankName}
          t={tEff}
          lang={effectiveLang}
          onClose={() => {
            setHistoryModal({ open: false, bankId: null, bankName: null });
            setCurrentView('home');
          }}
        />

        <SupportModal
          isOpen={supportModal.open}
          channel={supportModal.channel}
          channelName={supportModal.name}
          isOnline={Boolean(adminConfig?.support?.[supportModal.channel]?.online)}
          queue={Number(adminConfig?.support?.[supportModal.channel]?.queue || 0)}
          user={user}
          t={tEff}
          onClose={() => {
            setSupportModal({ open: false, channel: null, name: null });
            setSupportMenuOpen(false);
            const st = loadSupportState();
            setSupportUnread(getUnreadCountForUser(st, (user?.email || '').toLowerCase()));
          }}
        />

        <FaqModal
          isOpen={faqOpen}
          t={tEff}
          lang={effectiveLang}
          onClose={() => {
            setFaqOpen(false);
            setSupportMenuOpen(false);
          }}
        />

        <ApnPdfModal
          isOpen={apnModal.open}
          initialPage={apnModal.page}
          title={apnModal.title}
          shortcuts={apnModal.shortcuts}
          t={tEff}
          lang={effectiveLang}
          onClose={() => setApnModal({ open: false, page: 1, title: null, shortcuts: [] })}
        />

        {/* Floating Support Button */}
        <div className="fixed bottom-6 right-6 z-40 group flex flex-col items-end gap-3">
          <div className={`${supportMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'} transition-all flex flex-col items-end gap-2 duration-300`}>
            <button
              type="button"
              onClick={() => {
                setSupportModal({ open: true, channel: 'finance', name: tEff.supportChannelFinance });
              }}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              {tEff.supportChannelFinance}
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${adminConfig?.support?.finance?.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {adminConfig?.support?.finance?.online ? tEff.supportOnline : tEff.supportOffline}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSupportModal({ open: true, channel: 'tech', name: tEff.supportChannelTech });
              }}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              {tEff.supportChannelTech}
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${adminConfig?.support?.tech?.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {adminConfig?.support?.tech?.online
                  ? tEff.supportOnline
                  : fillTemplate(tEff.queueTemplate, { count: Number(adminConfig?.support?.tech?.queue || 0) })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              className="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              {tEff.faqButton}
            </button>
          </div>
          
          <button
            type="button"
            onClick={() => setSupportMenuOpen((s) => !s)}
            className="p-0 rounded-full shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:scale-105 transition-transform flex items-center justify-center border-2 border-[#00FF00] relative bg-[#1A1A1A]"
          >
            <img src="PERSONAGEM RENDA MAIS com LOGO.png" alt="Suporte" className="w-14 h-14 rounded-full object-cover" />
            {Number(supportUnread || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-xs px-2 py-1 rounded-full font-bold text-white shadow">
                {supportUnread > 99 ? '99+' : supportUnread}
              </span>
            )}
          </button>
        </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
