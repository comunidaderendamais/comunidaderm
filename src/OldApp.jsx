import React, { useEffect, useRef, useState } from 'react';
import {
  User, Bell, Send, Globe, Copy, Menu, X, Home,
  PieChart, Users, Wallet, FileText, Gift, Settings,
  Eye, EyeOff, LogOut, MessageCircle, ChevronDown, Check
} from 'lucide-react';
import AdminView from './admin/AdminView.jsx';
import { BANK_STATUS, getBankByQuotaKey } from './admin/adminStorage.js';
import BankHistoryModal from './history/BankHistoryModal.jsx';
import SupportModal from './support/SupportModal.jsx';
import FaqModal from './support/FaqModal.jsx';
import { fetchMySupportUnreadCount } from './supabase/supportRepo.js';
import {
  QUOTA_GLOBAL_LIMIT,
  canBuyPlan,
  createLot,
  normalizeUserCycles,
  calcDesistPenaltyPct,
  DESIST_ANALYSIS_HOURS,
} from './quota/quotaEngine.js';
import { RANKS } from './team/teamEngine.js';
import TeamOverviewSection from './team/TeamOverviewSection.jsx';
import { formatTeamMoney } from './team/teamViewFormatters.js';
import ApnPdfModal from './apn/ApnPdfModal.jsx';
import { calcElitePool, calcElitePayoutPerSlot, computeEliteBoard, ELITE_CATEGORIES, getEliteCategoryForRank } from './elite/eliteEngine.js';
import { createNowpaymentPayment, fetchNowpaymentStatus } from './payments/nowpaymentsClient.js';
import { buildCheckoutUrlFromInvoiceId, getPaymentSnapshotSummary, hasHostedCheckoutAvailable, normalizeNowpaymentsPayment } from './payments/nowpaymentsPresentation.js';
import { calcWithdrawNet, WITHDRAW_FEE_USD } from './payments/walletEngine.js';
import NowpaymentsPaymentModal from './payments/NowpaymentsPaymentModal.jsx';
import InfoRow from './components/ui/InfoRow.jsx';
import StatusBadge from './components/ui/StatusBadge.jsx';
import InlineFeedbackCard from './components/ui/InlineFeedbackCard.jsx';
import EmptyStateCard from './components/ui/EmptyStateCard.jsx';
import QuotaLotProgressCard from './wallet/QuotaLotProgressCard.jsx';
import QuotaLotEarningsModal from './wallet/QuotaLotEarningsModal.jsx';
import QuotasOverviewSection from './quota/QuotasOverviewSection.jsx';
import QuotaPurchaseCard from './quota/QuotaPurchaseCard.jsx';
import WalletOverviewSection from './wallet/WalletOverviewSection.jsx';
import ReportsOverviewSection from './reports/ReportsOverviewSection.jsx';
import HomeOverviewSection, { HomeRecentEarningsSection } from './home/HomeOverviewSection.jsx';
import BonusOverviewSection from './bonus/BonusOverviewSection.jsx';
import { fillTemplate, formatDateShort, formatDateTime, formatMoneyUsd, formatMoneyUsdInt, getLocaleForLang, getStatusLabel, getT, translateFinancialReason, translateNotification, translateRankTitle, translateTransactionType } from './i18n/i18n.js';
import { getSupabaseSession, sendPasswordResetEmail, signInWithSupabase, signOutFromSupabase, signUpWithSupabase } from './supabase/auth.js';
import { getAuthActionPageUrl } from './supabase/authRedirect.js';
import { buildSupabaseMetadata, getSupabaseAuthErrorMessage, hydrateUserFromSupabaseAuth } from './supabase/authBridge.js';
import { loadMyProfileAndWallets, saveMyWallets } from './supabase/profileRepo.js';
import { getReferrerProfile, isEmailAvailable, isUsernameAvailable } from './supabase/publicLookup.js';
import { attachNowpaymentsSnapshot, confirmMyNowpaymentsPayment, createMyPurchase, fetchMyState, renewMyLot, requestMyDesistance, requestMyWithdraw } from './supabase/stateSync.js';
import { adminPatchAppConfig, adminUpsertBank, fetchAppConfig, fetchBanks, fetchPublicStats } from './supabase/appConfigRepo.js';
import { fetchMyDashboard, fetchMyTeamSummary } from './supabase/dashboardRepo.js';
import { fetchMyNotifications, markAllMyNotificationsRead } from './supabase/notificationsRepo.js';
import { fetchEliteCandidates } from './supabase/eliteRepo.js';
import { adminProcessElitePayout } from './supabase/adminRepo.js';
import { getInitialLang, normalizeLang, persistLang } from './shared/lang.js';
import { getQuotaEarningsSummary } from './quota/quotaPresentation.js';

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

const stableSerialize = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
};

const buildAdminConfigFromSupabase = ({ config, banks }) => {
  const cfg = config || {};
  const cycle = cfg?.cycle || {};
  const elite = cfg?.elite || {};
  const support = cfg?.support || {};

  const banksMap = {};
  (Array.isArray(banks) ? banks : []).forEach((b) => {
    const id = String(b?.id || '').trim();
    if (!id) return;
    banksMap[id] = {
      id,
      name: b?.name || id,
      quotaKey: b?.quota_key || b?.quotaKey,
      status: String(b?.status || 'UPCOMING').toUpperCase(),
      limit: Number(b?.limit_usd ?? 0),
      filledPct: Number(b?.filled_pct ?? 0),
      profitAccumulatedPct: b?.profit_accumulated_pct == null ? 0 : Number(b.profit_accumulated_pct),
      profitMonthPct: b?.profit_month_pct == null ? 0 : Number(b.profit_month_pct),
    };
  });

  return {
    cycle: {
      months: Number(cycle?.months ?? 6),
      renewWindowHours: Number(cycle?.renewWindowHours ?? 72),
      entryFeePct: Number(cycle?.entryFeePct ?? 0.1),
    },
    elite: {
      fortnightProfitUsd: Number(elite?.profitQuinzenal ?? elite?.fortnightProfitUsd ?? 0),
      lastPaidAt: elite?.lastPaidAt ?? null,
    },
    banks: banksMap,
    support: {
      finance: { id: 'finance', name: 'Suporte 1 (Financeiro)', online: Boolean(support?.finance?.online), queue: Number(support?.finance?.queue ?? 0) },
      tech: { id: 'tech', name: 'Suporte 2 (Técnico)', online: Boolean(support?.tech?.online), queue: Number(support?.tech?.queue ?? 0) },
    },
  };
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
  const balances = u?.balances ?? { available: 0, invested: 0, teamEarnings: 0, eliteEarnings: 0, teEarnings: 0 };
  if (!Object.prototype.hasOwnProperty.call(balances, 'eliteEarnings')) balances.eliteEarnings = 0;
  if (!Object.prototype.hasOwnProperty.call(balances, 'teEarnings')) balances.teEarnings = 0;
  const holdings = u?.holdings ?? { cota10: 0, cota50: 0, cota100: 0 };
  const transactions = Array.isArray(u?.transactions) ? u.transactions : [];
  return normalizeUserCycles({ ...u, userId, wallets, balances, holdings, transactions });
};

const getRefFromPath = () => {
  try {
    const path = String(window.location?.pathname || '');
    const match = path.match(/\/ref\/([^/]+)/i);
    return match && match[1] ? decodeURIComponent(match[1]).trim() : '';
  } catch {
    return '';
  }
};

const buildNowpaymentsOrderId = (...parts) => {
  const base = parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'rm'}-${Date.now()}`;
};

const buildNowpaymentsSnapshot = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  return {
    paymentId: current.paymentId || null,
    invoiceId: current.invoiceId || null,
    orderId: current.orderId || null,
    checkoutUrl: current.checkoutUrl || null,
    qrCodeUrl: current.qrCodeUrl || null,
    payAddress: current.payAddress || null,
    payAmount: current.payAmount ?? null,
    payCurrency: current.payCurrency || null,
    paymentStatus: current.paymentStatus || null,
    warnings: Array.isArray(current.warnings) ? current.warnings : [],
  };
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '', errorStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    try {
      const errorStack = String(error?.stack || '').trim();
      const componentStack = String(errorInfo?.componentStack || '').trim();
      this.setState({ errorStack, componentStack });
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-black/30 border border-red-500/50 rounded-2xl p-6">
          <h2 className="text-xl font-black mb-2">Ocorreu um erro na tela</h2>
          <p className="text-sm text-gray-300 break-words">{String(this.state.error?.message || this.state.error || 'Erro desconhecido')}</p>
          {(this.state.errorStack || this.state.componentStack) ? (
            <details className="mt-4 rounded-xl border border-gray-700 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-black text-gray-200">Detalhes técnicos</summary>
              <div className="mt-3 space-y-3">
                {this.state.componentStack ? (
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-300">{this.state.componentStack}</pre>
                ) : null}
                {this.state.errorStack ? (
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-300">{this.state.errorStack}</pre>
                ) : null}
              </div>
            </details>
          ) : null}
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
  const refUsername = getRefFromPath();
  const [isLogin, setIsLogin] = useState(!refUsername);
  const [showPwd, setShowPwd] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [formData, setFormData] = useState({
    name: '', username: '', country: 'Brasil', email: '', whatsapp: '', password: '', confirmPassword: ''
  });

  const t = getT(lang);

  const handleInputChange = (e) => {
    if (feedback) setFeedback(null);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const showErrorFeedback = (message) => {
    setFeedback({
      variant: 'danger',
      title: t.authFeedbackErrorTitle,
      message,
    });
  };

  const showSuccessFeedback = (title, message) => {
    setFeedback({
      variant: 'success',
      title,
      message,
    });
  };

  const handleForgotPassword = async () => {
    const email = String(formData.email || '').trim().toLowerCase();
    if (!email) {
      showErrorFeedback(t.authResetLinkMissingEmail);
      return;
    }

    try {
      setResetBusy(true);
      const result = await sendPasswordResetEmail({
        email,
        redirectTo: getAuthActionPageUrl({ lang, flow: 'recovery' }),
      });
      if (!result.ok) {
        showErrorFeedback(getSupabaseAuthErrorMessage(result.error));
        return;
      }
      showSuccessFeedback(t.authResetLinkSent, t.settingsPasswordSentHint);
    } finally {
      setResetBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLogin) {
      const email = String(formData.email || '').toLowerCase();
      const authResult = await signInWithSupabase({
        email,
        password: formData.password,
      });

      if (authResult.ok && authResult?.data?.user) {
        onLogin(
          hydrateUserFromSupabaseAuth({
            authUser: authResult.data.user,
            candidateUser: formData,
            password: formData.password,
          })
        );
        return;
      }

      showErrorFeedback(getSupabaseAuthErrorMessage(authResult.error || 'Credenciais inválidas. Para teste, registre-se primeiro.'));
    } else {
      if (formData.password !== formData.confirmPassword) {
        showErrorFeedback(t.authPasswordMismatchDesc);
        return;
      }
      const desiredUsername = String(formData.username || '').trim().toLowerCase();
      const desiredEmail = String(formData.email || '').trim().toLowerCase();

      const refCheck = await getReferrerProfile(refUsername || null);
      const safeRef = refCheck.ok ? refCheck.profile?.username || null : null;

      const emailCheck = await isEmailAvailable(desiredEmail);
      if (emailCheck.ok && !emailCheck.available) {
        showErrorFeedback(t.authEmailInUseDesc);
        setIsLogin(true);
        return;
      }
      if (!emailCheck.ok) {
        showErrorFeedback(fillTemplate(t.authEmailValidationErrorTemplate, { error: emailCheck.error }));
        return;
      }

      const userCheck = await isUsernameAvailable(desiredUsername);
      if (userCheck.ok && !userCheck.available) {
        showErrorFeedback(t.authUsernameInUseDesc);
        return;
      }
      if (!userCheck.ok) {
        showErrorFeedback(fillTemplate(t.authUsernameValidationErrorTemplate, { error: userCheck.error }));
        return;
      }

      const authResult = await signUpWithSupabase({
        email: formData.email,
        password: formData.password,
        metadata: buildSupabaseMetadata(formData, safeRef),
        emailRedirectTo: getAuthActionPageUrl({ lang, flow: 'signup' }),
      });

      if (!authResult.ok) {
        const errorMessage = getSupabaseAuthErrorMessage(authResult.error);
        showErrorFeedback(errorMessage);
        if (errorMessage.includes('já está cadastrado')) setIsLogin(true);
        return;
      }

      if (authResult?.data?.user && !authResult?.data?.session) {
        showSuccessFeedback(t.authSignupPendingTitle, t.authSignupPendingDesc);
        setIsLogin(true);
        return;
      }

      if (authResult?.data?.user) {
        onLogin(
          hydrateUserFromSupabaseAuth({
            authUser: authResult.data.user,
            candidateUser: { ...formData, referrerUsername: refUsername || null },
            password: formData.password,
          })
        );
        return;
      }

      showSuccessFeedback(t.authSignupFallbackTitle, t.authSignupFallbackDesc);
      setIsLogin(true);
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
            <img src="/LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-20 w-auto object-contain" />
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
          {feedback ? (
            <InlineFeedbackCard
              variant={feedback.variant}
              title={feedback.title}
              message={feedback.message}
            />
          ) : null}

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
              <button
                type="button"
                disabled={resetBusy}
                onClick={handleForgotPassword}
                className={`text-sm hover:underline ${resetBusy ? 'cursor-not-allowed text-gray-500' : 'text-[#00FF00]'}`}
              >
                {resetBusy ? t.processing : t.forgotPassword}
              </button>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-[#00FF00] hover:bg-green-400 text-black font-bold rounded-lg transition-colors">
            {isLogin ? t.login : t.register}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          {isLogin ? t.noAccount : t.hasAccount}
          <button
            onClick={() => {
              setFeedback(null);
              setIsLogin(!isLogin);
            }}
            className="ml-2 text-[#00FF00] font-bold hover:underline"
          >
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
              <img src="/LOGO RENDA MAIS 05 BRANCO.png" alt="Renda Mais" className="h-10 w-auto object-contain" />
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

        <div className="flex items-center space-x-3 sm:space-x-6">
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

const HomeView = ({ lang, adminConfig, publicStats, user, teamSummary, onOpenBankHistory, onOpenApn, onOpenReports }) => {
  const t = getT(lang);
  
  const totalLimit = 100000;
  const currentSold = Number(publicStats?.globalSold || 0);
  const percentage = Math.min((currentSold / totalLimit) * 100, 100);

  const formatMoney = (v) => formatMoneyUsd(v, lang);
  
  const currentUser = normalizeUser(user);

  const rankTitle = translateRankTitle(teamSummary?.rank?.title || currentUser?.rankKey || 'Ferro', t);
  const nextRank = teamSummary?.rank?.next || null;
  const rankDesc = nextRank
    ? fillTemplate(t.homeRankDescTemplate, {
        current: formatMoneyUsdInt(Number(teamSummary?.rank?.volume || 0), lang),
        target: formatMoneyUsdInt(Number(nextRank?.target || 0), lang),
        next: translateRankTitle(nextRank?.title || nextRank?.key || '', t),
      })
    : t.bonusTop;
  const investedAmount = Number(currentUser?.balances?.invested || 0);
  const teamEarningsAmount = Number(currentUser?.balances?.teamEarnings || 0);
  const availableAmount = Number(currentUser?.balances?.available || 0);

  const cards = [
    {
      key: 'invested',
      title: t.invested,
      value: formatMoney(investedAmount),
      desc: t.homeBoughtQuotasDesc,
      hint: investedAmount > 0 ? t.homeMetricInvestedActiveHint : t.homeMetricInvestedEmptyHint,
      badge: investedAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-sky-100 bg-sky-50 text-sky-600',
    },
    {
      key: 'teamEarnings',
      title: t.teamEarnings,
      value: formatMoney(teamEarningsAmount),
      desc: t.homeUpToLevel5Desc,
      hint: teamEarningsAmount > 0 ? t.homeMetricTeamActiveHint : t.homeMetricTeamEmptyHint,
      badge: teamEarningsAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-emerald-100 bg-emerald-50 text-emerald-600',
    },
    {
      key: 'totalBalance',
      title: t.totalBalance,
      value: formatMoney(availableAmount),
      desc: t.homeWithdrawAvailableDesc,
      hint: availableAmount > 0 ? t.homeMetricBalanceActiveHint : t.homeMetricBalanceEmptyHint,
      badge: availableAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-violet-100 bg-violet-50 text-violet-600',
    },
    {
      key: 'rank',
      title: t.rank,
      value: rankTitle,
      desc: t.homeMetricRankDesc,
      hint: nextRank ? rankDesc : t.homeMetricRankHint,
      badge: nextRank ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-amber-100 bg-amber-50 text-amber-600',
    },
  ];

  const recentEarnings = (Array.isArray(currentUser.transactions) ? currentUser.transactions : [])
    .filter((tx) => Number(tx?.amount || 0) > 0)
    .slice()
    .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
    .slice(0, 3);
  const recentItems = recentEarnings.map((item) => ({
    id: item.id,
    title: translateTransactionType(item.type, t),
    date: formatDateTime(item.at, lang),
    amount: `+${formatMoneyUsd(Math.abs(Number(item.amount || 0)), lang)}`,
  }));
  const hasDashboardMovement =
    investedAmount > 0 ||
    teamEarningsAmount > 0 ||
    availableAmount > 0 ||
    recentItems.length > 0;
  const handleOpenHowToJoin = () =>
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
    });
  const handleOpenBankSystem = () =>
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
    });

  return (
    <div className="p-4 min-[540px]:p-6 space-y-6 max-w-7xl mx-auto">
      <HomeOverviewSection
        t={t}
        totalLimit={totalLimit}
        currentSold={currentSold}
        percentage={percentage}
        hasMovement={hasDashboardMovement}
        rankTitle={rankTitle}
        rankDesc={rankDesc}
        cards={cards}
        onOpenHowToJoin={handleOpenHowToJoin}
        onOpenBankSystem={handleOpenBankSystem}
      />

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

      <HomeRecentEarningsSection
        t={t}
        recentItems={recentItems}
        onOpenReports={onOpenReports}
      />
    </div>
  );
};

const QuotasView = ({ user, setUser, adminConfig, publicStats, onBuy, onOpenApn, lang }) => {
  const currentUser = normalizeUser(user);
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
  const [paymentModal, setPaymentModal] = useState({ open: false, payment: null });
  const [buyBusy, setBuyBusy] = useState(false);

  const formatMoney = (v) => formatMoneyUsd(v, lang);
  const round2 = (n) => Number(Number(n || 0).toFixed(2));
  const sold = Number(publicStats?.globalSold || 0);
  const remainingGlobalQuotas = Math.max(0, QUOTA_GLOBAL_LIMIT - sold);
  const totalHoldings = plans.reduce((acc, plan) => acc + Number(currentUser?.holdings?.[plan.key] || 0), 0);
  const purchaseTransactions = (Array.isArray(user?.transactions) ? user.transactions : []).filter(
    (tx) => String(tx?.kind || '') === 'COMPRA' || String(tx?.type || '').startsWith('Compra ')
  );
  const hasQuotaMovement =
    totalHoldings > 0 ||
    purchaseTransactions.length > 0 ||
    Number(currentUser?.balances?.available || 0) > 0;
  const soldSummary = `${sold.toLocaleString(locale)} / ${QUOTA_GLOBAL_LIMIT.toLocaleString(locale)}`;
  const availableGlobalSummary = remainingGlobalQuotas.toLocaleString(locale);
  const holdingsSummary = totalHoldings.toLocaleString(locale);
  const openHowToJoinPdf = () =>
    onOpenApn?.({
      page: 5,
      title: `${t.apnPresentation} • ${t.apnHowToJoin}`,
      shortcuts: [
        { label: t.apnHowToJoin, page: 5 },
        { label: t.apnBanks, page: 9 },
      ],
    });
  const openBanksPdf = () =>
    onOpenApn?.({
      page: 9,
      title: `${t.apnPresentation} • ${t.apnBanksSystem}`,
      shortcuts: [
        { label: t.apnHowToJoin, page: 5 },
        { label: t.apnBanks, page: 9 },
      ],
    });

  const persistUser = (u) => {
    setUser(u);
  };

  const refreshUserFromServer = async () => {
    const fetched = await fetchMyState({ maxTransactions: 200 });
    if (fetched.ok && fetched.state?.userPatch) {
      persistUser(
        normalizeUser({
          ...currentUser,
          ...fetched.state.userPatch,
          transactions: fetched.state.transactions,
        })
      );
    }
  };

  const handleBuy = async (plan) => {
    if (buyBusy) return;
    setBuyBusy(true);
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
      let paymentId = null;
      let invoiceId = null;
      let orderId = null;
      let nowpaymentData = null;
      if (paymentCoin !== 'SALDO') {
        orderId = buildNowpaymentsOrderId('purchase', currentUser?.id || currentUser?.userId, plan.key, count);
        const paymentRes = await createNowpaymentPayment({
          amountUsd: total,
          asset: paymentCoin,
          network: paymentNetwork,
          orderId,
          orderDescription: `${plan.title} x${count}`,
        });
        if (!paymentRes.ok) {
          alert(`${t.buyProcessingError} ${String(paymentRes.reason || 'Falha ao criar cobrança.')}`);
          return;
        }
        paymentId = String(paymentRes.data?.paymentId || '').trim();
        invoiceId = String(paymentRes.data?.invoiceId || '').trim();
        orderId = String(paymentRes.data?.orderId || orderId || '').trim();
        if (!paymentId && !invoiceId && !orderId) {
          alert(`${t.buyProcessingError} referência de cobrança ausente.`);
          return;
        }
        nowpaymentData = paymentRes.data || null;
      }

      const createRes = await createMyPurchase({
        planKey: plan.key,
        units: count,
        paymentCurrency: paymentCoin,
        paymentNetwork,
        paymentId,
        invoiceId,
        orderId,
        bankId: bank.id,
      });
      if (!createRes.ok || !createRes.data?.ok) {
        alert(`${t.buyProcessingError} ${String(createRes.error || createRes.data?.reason || 'erro')}`);
        return;
      }

      try {
        if (onBuy) onBuy(plan.quotas * count);
      } catch (err) {
        alert(`${t.buyPanelUpdateError} ${String(err?.message || err)}`);
      }

      const mode = String(createRes.data?.mode || '').toUpperCase();
      if (mode === 'NOWPAYMENTS') {
        if (createRes.data?.depositId && nowpaymentData) {
          await attachNowpaymentsSnapshot({
            depositId: createRes.data.depositId,
            paymentSnapshot: buildNowpaymentsSnapshot(nowpaymentData),
          }).catch(() => null);
        }
        setPaymentModal({ open: true, payment: nowpaymentData });
        void refreshUserFromServer();
        return;
      }

      await refreshUserFromServer();
      alert(t.buySuccessWithBalance);
    } catch (err) {
      alert(`${t.buyProcessingError} ${String(err?.message || err)}`);
    } finally {
      setBuyBusy(false);
    }
  };

  return (
    <>
      <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto">
      <QuotasOverviewSection
        t={t}
        hasMovement={hasQuotaMovement}
        soldSummary={soldSummary}
        availableGlobalSummary={availableGlobalSummary}
        holdingsSummary={holdingsSummary}
        onOpenHowToJoin={openHowToJoinPdf}
        onOpenBanks={openBanksPdf}
      />

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const earnings = getQuotaEarningsSummary({ planKey: plan.key, units: 1 });
          const isPopular = plan.key === 'cota50';
          const selectedCoin = coin[plan.key];
          const isSaldo = selectedCoin === 'SALDO';
          const bank = getBankByQuotaKey(adminConfig, plan.key);
          const bankStatus = bank?.status || BANK_STATUS.upcoming;
          const canBuy = bankStatus === BANK_STATUS.active;
          const currentUnits = Number(user?.holdings?.[plan.key] || 0);
          const remainingUserUnits = Math.max(0, 100 - currentUnits);
          const remainingGlobalUnits = Math.floor(remainingGlobalQuotas / plan.quotas);
          const maxAllowed = Math.max(0, Math.min(remainingUserUnits, remainingGlobalUnits));
          const requested = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
          const blockedByUser = remainingUserUnits <= 0;
          const blockedByGlobal = remainingGlobalQuotas <= 0;
          const blockedByLimit = maxAllowed <= 0;
          const disabled = !canBuy || blockedByLimit;
          const actionLabel = buyBusy
            ? t.processing
            : !canBuy
              ? t.quotasBtnUnavailable
              : disabled
                ? t.quotasBtnLimitReached
                : isSaldo
                  ? t.quotasBtnBuyWithBalance
                  : t.quotasBtnBuyWithCrypto;
          const availabilityHint = !canBuy
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
                    });

          return (
            <QuotaPurchaseCard
              key={plan.key}
              t={t}
              plan={plan}
              locale={locale}
              earnings={earnings}
              isPopular={isPopular}
              canBuy={canBuy}
              disabled={disabled}
              buyBusy={buyBusy}
              maxAllowed={maxAllowed}
              currentUnits={currentUnits}
              remainingGlobalQuotas={remainingGlobalQuotas}
              qtyValue={qty[plan.key]}
              selectedCoin={selectedCoin}
              networkValue={network[plan.key]}
              onQtyChange={(value) => setQty((s) => ({ ...s, [plan.key]: value }))}
              onCoinChange={(value) => setCoin((s) => ({ ...s, [plan.key]: value }))}
              onNetworkChange={(value) => setNetwork((s) => ({ ...s, [plan.key]: value }))}
              onBuy={() => handleBuy(plan)}
              formatMoney={formatMoney}
              formatMoneyUsd={(value) => formatMoneyUsd(value, lang)}
              formatPct={formatPct}
              balanceAvailableText={formatMoney(user?.balances?.available)}
              actionLabel={actionLabel}
              availabilityHint={availabilityHint}
            />
          );
        })}
      </div>

      <div className="mt-8 bg-white rounded-[28px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.22)] border border-gray-200 overflow-hidden">
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
              {purchaseTransactions
                .slice(0, 25)
                .map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 whitespace-nowrap">{formatDateTime(tx.at, lang)}</td>
                    <td className="p-4">{translateTransactionType(tx.type, t)}</td>
                    <td className="p-4">{tx.payment || '—'}</td>
                    <td className="p-4">
                      <StatusBadge className="rounded text-xs px-2 py-1 font-bold">{getStatusLabel(tx.status, t)}</StatusBadge>
                    </td>
                    <td className="p-4 text-right font-bold">{formatMoneyUsd(tx.amount, lang)}</td>
                  </tr>
                ))}
              {purchaseTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10">
                    <div className="mx-auto max-w-xl">
                      <EmptyStateCard
                        icon={PieChart}
                        title={t.quotasHistoryEmptyTitle}
                        description={t.quotasHistoryEmptyDesc}
                      />
                    </div>
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
      <NowpaymentsPaymentModal
        isOpen={paymentModal.open}
        payment={paymentModal.payment}
        onClose={() => setPaymentModal({ open: false, payment: null })}
      />
    </>
  );
};

const SettingsView = ({ user, setUser, lang }) => {
  const t = getT(lang);
  const [wallets, setWallets] = useState(user.wallets || { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' });
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [passwordResetFeedback, setPasswordResetFeedback] = useState(null);

  const handleSaveWallets = async (e) => {
    e.preventDefault();
    const res = await saveMyWallets(wallets);
    if (!res.ok) {
      alert(`Falha ao salvar no Supabase: ${res.error}`);
      return;
    }
    const updatedUser = { ...user, wallets };
    setUser(updatedUser);
    alert(t.settingsWalletsUpdatedAlert);
  };

  const handleSendPasswordLink = async () => {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) {
      setPasswordResetFeedback({
        variant: 'danger',
        title: t.authFeedbackErrorTitle,
        message: t.authResetLinkMissingEmail,
      });
      return;
    }

    try {
      setPasswordResetBusy(true);
      const result = await sendPasswordResetEmail({
        email,
        redirectTo: getAuthActionPageUrl({ lang, flow: 'recovery' }),
      });
      if (!result.ok) {
        setPasswordResetFeedback({
          variant: 'danger',
          title: t.authFeedbackErrorTitle,
          message: getSupabaseAuthErrorMessage(result.error),
        });
        return;
      }
      setPasswordResetFeedback({
        variant: 'success',
        title: t.authResetLinkSent,
        message: t.settingsPasswordSentHint,
      });
    } finally {
      setPasswordResetBusy(false);
    }
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
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm leading-6 text-gray-600">{t.settingsPasswordHelp}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t.settingsPasswordEmailLabel}</label>
              <input
                type="email"
                value={String(user?.email || '')}
                readOnly
                className="w-full p-3 bg-gray-50 border rounded-lg outline-none text-gray-600"
              />
            </div>
            <button
              type="button"
              disabled={passwordResetBusy}
              onClick={handleSendPasswordLink}
              className={`w-full py-3 font-bold rounded-lg transition-colors ${passwordResetBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#8A2BE2] hover:bg-purple-600 text-white'}`}
            >
              {passwordResetBusy ? t.processing : t.settingsPasswordSendLinkBtn}
            </button>
            {passwordResetFeedback ? (
              <InlineFeedbackCard
                variant={passwordResetFeedback.variant}
                title={passwordResetFeedback.title}
                message={passwordResetFeedback.message}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const WalletView = ({ setCurrentView, user, setUser, adminConfig, lang }) => {
  const currentUser = normalizeUser(user);
  const t = getT(lang);
  const hasWallet = currentUser?.wallets?.usdtBep20 || currentUser?.wallets?.usdtTrc20 || currentUser?.wallets?.usdcArbitrum;
  const [renewModal, setRenewModal] = useState({ open: false, lotId: null });
  const [desistModal, setDesistModal] = useState({ open: false, lotId: null });
  const [lotDetailsModal, setLotDetailsModal] = useState({ open: false, lotId: null });
  const [renewPayment, setRenewPayment] = useState('SALDO');
  const [renewNetwork, setRenewNetwork] = useState('BEP20');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDT');
  const [withdrawNetwork, setWithdrawNetwork] = useState('BEP20');
  const [paymentModal, setPaymentModal] = useState({ open: false, payment: null });
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [reopenBusyId, setReopenBusyId] = useState(null);

  const persistUser = (u) => {
    setUser?.(u);
  };

  const refreshUserFromServer = async () => {
    const fetched = await fetchMyState({ maxTransactions: 200 });
    if (fetched.ok && fetched.state?.userPatch) {
      const enriched = normalizeUser({ ...currentUser, ...fetched.state.userPatch, transactions: fetched.state.transactions });
      persistUser(enriched);
    }
  };

  const getWithdrawAddress = () => {
    if (withdrawAsset === 'USDC') return String(currentUser?.wallets?.usdcArbitrum || '').trim();
    if (withdrawNetwork === 'TRC20') return String(currentUser?.wallets?.usdtTrc20 || '').trim();
    return String(currentUser?.wallets?.usdtBep20 || '').trim();
  };

  const pendingDeposits = (Array.isArray(currentUser?.transactions) ? currentUser.transactions : []).filter(
    (t) => String(t?.kind || '') === 'DEPOSITO' && String(t?.status || '').toLowerCase() === 'pendente'
  );

  const getDepositReference = (tx) => ({
    paymentId: String(tx?.meta?.paymentId || tx?.meta?.meta?.paymentId || '').trim(),
    invoiceId: String(tx?.meta?.invoiceId || tx?.meta?.meta?.invoiceId || '').trim(),
    orderId: String(tx?.meta?.orderId || tx?.meta?.meta?.orderId || '').trim(),
  });

  const getDepositSnapshot = (tx) => {
    const snapshot = tx?.meta?.nowpaymentsSnapshot || tx?.meta?.meta?.nowpaymentsSnapshot || null;
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  };

  const getDepositSummary = (tx) => {
    const refs = getDepositReference(tx);
    const snapshot = getDepositSnapshot(tx);
    return getPaymentSnapshotSummary({
      ...(snapshot || {}),
      paymentId: refs.paymentId || snapshot?.paymentId || '',
      invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
      orderId: refs.orderId || snapshot?.orderId || '',
    });
  };

  const getDepositDisplayReference = (tx) => {
    const refs = getDepositReference(tx);
    if (refs.paymentId) return refs.paymentId;
    if (refs.invoiceId) return `Invoice: ${refs.invoiceId}`;
    if (refs.orderId) return `Order: ${refs.orderId}`;
    return 'Referencia indisponivel';
  };

  const buildPendingPaymentModalData = async (tx) => {
    const refs = getDepositReference(tx);
    const snapshot = getDepositSnapshot(tx);
    let payment = normalizeNowpaymentsPayment({
      ...(snapshot || {}),
      paymentId: refs.paymentId || snapshot?.paymentId || '',
      invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
      orderId: refs.orderId || snapshot?.orderId || '',
      checkoutUrl: snapshot?.checkoutUrl || buildCheckoutUrlFromInvoiceId(refs.invoiceId || snapshot?.invoiceId || ''),
    });

    const needsRemoteHydration =
      Boolean(refs.paymentId) &&
      (!payment.payAddress || !payment.payAmount || !payment.payCurrency || !payment.paymentStatus);

    if (needsRemoteHydration) {
      const statusRes = await fetchNowpaymentStatus({ paymentId: refs.paymentId });
      if (statusRes.ok && statusRes.data) {
        payment = normalizeNowpaymentsPayment({
          ...payment,
          ...statusRes.data,
          paymentId: refs.paymentId || statusRes.data?.payment_id,
          invoiceId: refs.invoiceId || statusRes.data?.invoice_id,
          orderId: refs.orderId || statusRes.data?.order_id,
        });
      }
    }

    return normalizeNowpaymentsPayment(payment);
  };

  const reopenDepositPayment = async (txId) => {
    try {
      if (reopenBusyId) return;
      setReopenBusyId(String(txId || ''));
      const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
      const tx = txs.find((item) => String(item?.id || '') === String(txId));
      if (!tx) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      const refs = getDepositReference(tx);
      const snapshot = getDepositSnapshot(tx);
      if (!snapshot && !refs.paymentId && !refs.invoiceId && !refs.orderId) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      const payment = await buildPendingPaymentModalData(tx);
      if (!payment.checkoutUrl && !payment.payAddress && !payment.paymentId && !payment.invoiceId && !payment.orderId) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      setPaymentModal({ open: true, payment });
    } catch (err) {
      alert(`${t.walletReopenChargeError} ${String(err?.message || err)}`);
    } finally {
      setReopenBusyId(null);
    }
  };

  const verifyDeposit = async (txId) => {
    try {
      if (verifyBusy) return;
      setVerifyBusy(true);
      const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
      const tx = txs.find((t) => String(t?.id || '') === String(txId));
      const refs = getDepositReference(tx);
      if (!refs.paymentId && !refs.invoiceId && !refs.orderId) {
        alert(t.depositCodeRequired);
        return;
      }
      let paymentStatus = null;
      let rawEvent = {};
      if (refs.paymentId) {
        const res = await fetchNowpaymentStatus({ paymentId: refs.paymentId });
        if (!res.ok) {
          alert(`${t.depositCheckFailed} ${res.reason}`);
          return;
        }
        paymentStatus = res.status;
        rawEvent = res.data || {};
      }
      const confirmRes = await confirmMyNowpaymentsPayment({
        paymentId: refs.paymentId,
        invoiceId: refs.invoiceId,
        orderId: refs.orderId,
        paymentStatus,
        rawEvent,
      });
      if (!confirmRes.ok) {
        alert(`${t.depositCheckFailed} ${confirmRes.error}`);
        return;
      }
      await refreshUserFromServer();
      alert(`${t.checkComplete} (${String(paymentStatus || '').trim() || '—'})`);
    } finally {
      setVerifyBusy(false);
    }
  };

  const submitWithdraw = async () => {
    const addr = getWithdrawAddress();
    const amount = Number(withdrawAmount || 0);
    const net = calcWithdrawNet({ amountUsd: amount });
    if (currentUser?.blocked) {
      alert(t.blockedAccountSupport);
      return;
    }
    if (amount < 10) {
      alert(translateFinancialReason('Valor mínimo para saque é $10.', t));
      return;
    }
    if (!addr) {
      alert(t.walletNoWalletConfigured);
      return;
    }
    const reqRes = await requestMyWithdraw({
      amountUsd: amount,
      asset: withdrawAsset,
      network: withdrawAsset === 'USDC' ? 'ARBITRUM' : withdrawNetwork,
      address: addr,
    });
    if (!reqRes.ok || !reqRes.data?.ok) {
      alert(translateFinancialReason(reqRes.error || 'Falha ao solicitar saque.', t));
      return;
    }
    await refreshUserFromServer();
    setWithdrawAmount('');
    alert(`${t.withdrawRequestedAlert} ${formatMoneyUsd(net.netUsd, lang)}`);
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
  const lotDetails = lotDetailsModal.open ? lots.find((l) => l.id === lotDetailsModal.lotId) : null;
  const renewNetworkFinal = renewPayment === 'USDT' ? renewNetwork : renewPayment === 'USDC' ? 'ARBITRUM' : null;
  const hasWalletMovement =
    Boolean(hasWallet) ||
    Number(currentUser?.balances?.available || 0) > 0 ||
    Number(currentUser?.balances?.invested || 0) > 0 ||
    activeLots.length > 0 ||
    pendingDeposits.length > 0;

  const confirmRenew = () => {
    if (!selectedLot) return;
    (async () => {
      const paymentCurrency = renewPayment;
      let paymentId = null;
      let invoiceId = null;
      let orderId = null;
      let nowpaymentData = null;
      if (paymentCurrency !== 'SALDO') {
        orderId = buildNowpaymentsOrderId('renew', currentUser?.id || currentUser?.userId, selectedLot.id);
        const paymentRes = await createNowpaymentPayment({
          amountUsd: Number(selectedLot.planPrice || 0) * Number(selectedLot.units || 0),
          asset: paymentCurrency,
          network: renewNetworkFinal,
          orderId,
          orderDescription: `Renovacao ${selectedLot.planTitle} x${selectedLot.units}`,
        });
        if (!paymentRes.ok) {
          alert(translateFinancialReason(paymentRes.reason || 'Falha ao criar cobrança.', t));
          return;
        }
        paymentId = String(paymentRes.data?.paymentId || '').trim();
        invoiceId = String(paymentRes.data?.invoiceId || '').trim();
        orderId = String(paymentRes.data?.orderId || orderId || '').trim();
        if (!paymentId && !invoiceId && !orderId) {
          alert('Referência de cobrança ausente.');
          return;
        }
        nowpaymentData = paymentRes.data || null;
      }

      const res = await renewMyLot({
        lotId: selectedLot.id,
        paymentCurrency,
        paymentNetwork: renewNetworkFinal,
        paymentId,
        invoiceId,
        orderId,
      });
      if (!res.ok || !res.data?.ok) {
        alert(translateFinancialReason(res.error || 'Falha ao renovar.', t));
        return;
      }

      await refreshUserFromServer();
      setRenewModal({ open: false, lotId: null });
      const mode = String(res.data?.mode || '').toUpperCase();
      if (mode === 'NOWPAYMENTS') {
        if (res.data?.depositId && nowpaymentData) {
          await attachNowpaymentsSnapshot({
            depositId: res.data.depositId,
            paymentSnapshot: buildNowpaymentsSnapshot(nowpaymentData),
          }).catch(() => null);
          await refreshUserFromServer();
        }
        setPaymentModal({ open: true, payment: nowpaymentData });
        return;
      }
      alert(t.renewRegisteredAlert);
    })();
  };

  const confirmDesistance = () => {
    if (!desistLot) return;
    (async () => {
      const res = await requestMyDesistance({ lotId: desistLot.id });
      if (!res.ok || !res.data?.ok) {
        alert(translateFinancialReason(res.error || 'Falha ao solicitar desistência.', t));
        return;
      }

      await refreshUserFromServer();
      setDesistModal({ open: false, lotId: null });
      alert(`${t.desistanceRequestedAlert} ${DESIST_ANALYSIS_HOURS}h.`);
    })();
  };

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <WalletOverviewSection
        t={t}
        hasMovement={hasWalletMovement}
        availableBalance={formatMoneyUsd(currentUser.balances.available, lang)}
        activeCyclesCount={activeLots.length}
        pendingDepositsCount={pendingDeposits.length}
        hasWallet={Boolean(hasWallet)}
        onOpenQuotas={() => setCurrentView('quotas')}
        onOpenSettings={() => setCurrentView('settings')}
      />

      <div className="bg-white p-8 rounded-[28px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)] border border-gray-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-900">{t.walletWithdrawTitle}</h3>
            <p className="mt-1 text-sm text-gray-500">{t.walletWithdrawPanelDesc}</p>
          </div>
          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-violet-700">{t.walletWithdrawReleased}</p>
              <p className="mt-2 text-2xl font-black text-[#8A2BE2]">{formatMoneyUsd(currentUser.balances.available, lang)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletWithdrawTotalInvested}</p>
              <p className="mt-2 text-2xl font-black text-gray-900">{formatMoneyUsd(currentUser.balances.invested, lang)}</p>
            </div>
          </div>
        </div>

        {!hasWallet ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-amber-200 bg-amber-50/80 px-5 py-5">
            <p className="text-sm font-black text-amber-900">{t.walletNoWalletConfiguredTitle}</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">{t.walletNoWalletConfiguredDesc}</p>
            <button
              type="button"
              onClick={() => setCurrentView('settings')}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              {t.walletConfigureNow}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.pendingDeposits}</h3>
          <p className="text-sm text-gray-500 mt-1">{t.pendingDepositsHint}</p>
        </div>
        <div className="p-6 space-y-3">
          {pendingDeposits.length === 0 ? (
            <EmptyStateCard
              icon={Wallet}
              title={t.walletPendingEmptyTitle}
              description={t.walletPendingEmptyDesc}
            />
          ) : (
            pendingDeposits.slice(0, 10).map((tx) => (
              (() => {
                const snapshot = getDepositSnapshot(tx);
                const refs = getDepositReference(tx);
                const summary = getDepositSummary(tx);
                const canReopen = Boolean(snapshot || refs.paymentId || refs.invoiceId || refs.orderId);
                const checkoutReady = hasHostedCheckoutAvailable({
                  ...(snapshot || {}),
                  invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
                });
                const reopenBusy = String(reopenBusyId || '') === String(tx.id || '');

                return (
                  <div key={tx.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 truncate">{translateTransactionType(tx.type, t)}</p>
                        <p className="text-xs text-gray-500 mt-1">{t.walletValueLabel}: <span className="font-black text-gray-800">{formatMoneyUsd(tx.amount, lang)}</span></p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge variant={checkoutReady ? 'success' : 'warning'}>
                            {checkoutReady ? t.walletHostedCheckoutAvailable : t.walletHostedCheckoutManualOnly}
                          </StatusBadge>
                        </div>
                      </div>
                      <StatusBadge>{getStatusLabel(tx.status, t)}</StatusBadge>
                    </div>

                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                      <div className="lg:col-span-8">
                        <InfoRow
                          label={t.depositCode}
                          value={getDepositDisplayReference(tx)}
                          className="mt-0 rounded-xl px-4 py-3"
                        />
                        {summary.hasSummary ? (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <InfoRow
                              label={t.walletPaymentAssetLabel}
                              value={summary.asset}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                            <InfoRow
                              label={t.walletPaymentNetworkLabel}
                              value={summary.network}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                            <InfoRow
                              label={t.walletPaymentValueShortLabel}
                              value={summary.value}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="lg:col-span-4 grid grid-cols-1 gap-3">
                        <button
                          type="button"
                          disabled={!canReopen || reopenBusy || verifyBusy}
                          onClick={() => reopenDepositPayment(tx.id)}
                          className={`w-full px-4 py-3 rounded-xl font-black ${!canReopen || reopenBusy || verifyBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
                        >
                          {reopenBusy ? t.processing : checkoutReady ? t.walletOpenCheckoutBtn : t.walletViewPaymentDataBtn}
                        </button>
                        <button
                          type="button"
                          disabled={verifyBusy || reopenBusy}
                          onClick={() => verifyDeposit(tx.id)}
                          className={`w-full px-4 py-3 rounded-xl font-black ${verifyBusy || reopenBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
                        >
                          {t.refresh}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
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
              {reports.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan="4">
                    <div className="mx-auto max-w-xl">
                      <EmptyStateCard
                        icon={FileText}
                        title={t.walletHistoryEmptyTitle}
                        description={t.walletHistoryEmptyDesc}
                        className="text-left"
                      />
                    </div>
                  </td>
                </tr>
              ) : reports.map(rep => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><StatusBadge className="rounded text-xs px-2 py-1 font-normal">{rep.status}</StatusBadge></td>
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
              <EmptyStateCard
                icon={FileText}
                title={t.walletReviewEmptyTitle}
                description={t.walletReviewEmptyDesc}
              />
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
              <EmptyStateCard
                icon={Wallet}
                title={t.walletRenewalEmptyTitle}
                description={t.walletRenewalEmptyDesc}
              />
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
              <EmptyStateCard
                icon={PieChart}
                title={t.walletCyclesEmptyTitle}
                description={t.walletCyclesEmptyDesc}
                ctaLabel={t.walletIncreaseEarningsCta}
                onCtaClick={() => setCurrentView('quotas')}
              />
            ) : (
              <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
                {activeLots.map((l) => (
                  <QuotaLotProgressCard
                    key={l.id}
                    lot={l}
                    lang={lang}
                    t={t}
                    onOpenDetails={(lot) => setLotDetailsModal({ open: true, lotId: lot.id })}
                    onRequestCancellation={(lot) => setDesistModal({ open: true, lotId: lot.id })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <QuotaLotEarningsModal
        open={lotDetailsModal.open}
        lot={lotDetails}
        lang={lang}
        t={t}
        onClose={() => setLotDetailsModal({ open: false, lotId: null })}
      />

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
      <NowpaymentsPaymentModal
        isOpen={paymentModal.open}
        payment={paymentModal.payment}
        onClose={() => setPaymentModal({ open: false, payment: null })}
      />
    </div>
  );
};

const TeamView = ({ user, lang, onOpenApn }) => {
  const t = getT(lang);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedRefLink, setCopiedRefLink] = useState(false);
  const refLink = `https://comunidaderm.com/ref/${user?.username || 'user'}`;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchMyTeamSummary({ maxDepth: 5 })
      .then((res) => {
        if (cancelled) return;
        setSummary(res.ok ? res.summary : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const rankTitle = translateRankTitle(summary?.rank?.title || 'Ferro', t);
  const directVol = Number(summary?.directVolume || 0);
  const indirectVol = Number(summary?.indirectVolume || 0);
  const residualTotal = Number(summary?.residual?.total || 0);
  const te1 = Number(summary?.entryFee?.level1 || 0);
  const te2 = Number(summary?.entryFee?.level2 || 0);
  const te3 = Number(summary?.entryFee?.level3 || 0);
  const legs = Array.isArray(summary?.legs) ? summary.legs : [];
  const currentRankVolume = Number(summary?.rank?.volume || 0);
  const nextRank = summary?.rank?.next || null;

  const handleCopyRefLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopiedRefLink(true);
      window.setTimeout(() => setCopiedRefLink(false), 1800);
    } catch {
      setCopiedRefLink(false);
    }
  };

  const handleOpenPresentation = () =>
    onOpenApn?.({
      page: 10,
      title: `${t.apnPresentation} • ${t.apnTeamEarnings}`,
      shortcuts: [
        { label: t.apnTeamEarnings, page: 10 },
        { label: t.apnResidual, page: 11 },
      ],
    });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <TeamOverviewSection
        t={t}
        rankTitle={rankTitle}
        directVol={directVol}
        indirectVol={indirectVol}
        residualTotal={residualTotal}
        entryFee={{ level1: te1, level2: te2, level3: te3 }}
        legs={legs}
        currentRankVolume={currentRankVolume}
        nextRank={nextRank}
        loading={loading}
        copied={copiedRefLink}
        onCopyRefLink={handleCopyRefLink}
        onOpenPresentation={handleOpenPresentation}
      />
    </div>
  );
};

const BonusView = ({ user, adminConfig, onOpenApn, lang }) => {
  const t = getT(lang);
  const email = (user?.email || '').toLowerCase();
  const locale = getLocaleForLang(lang);
  const [summary, setSummary] = useState(null);
  const [eliteBoard, setEliteBoard] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const [teamRes, eliteRes] = await Promise.all([fetchMyTeamSummary({ maxDepth: 5 }), fetchEliteCandidates()]);
      if (cancelled) return;
      setSummary(teamRes.ok ? teamRes.summary : null);
      setEliteBoard(eliteRes.ok ? computeEliteBoard(eliteRes.users) : {});
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const formatPct = (rate) => {
    const n = Number(rate || 0) * 100;
    const hasDecimal = Math.abs(n - Math.round(n)) > 1e-9;
    return `${n.toLocaleString(locale, { minimumFractionDigits: hasDecimal ? 1 : 0, maximumFractionDigits: 1 })}%`;
  };
  const eliteInfo = calcElitePool(adminConfig?.elite?.fortnightProfitUsd);
  const elitePool = eliteInfo.elitePool;
  const currentRankKey = String(summary?.rank?.key || 'FERRO').toUpperCase();
  const currentRankTitle = summary?.rank?.title || 'Ferro';
  const currentRankVolume = Number(summary?.rank?.volume || 0);
  const nextRank = summary?.rank?.next || null;
  const myEligibleCat = getEliteCategoryForRank(currentRankKey);

  const myAssignedCat = ELITE_CATEGORIES.map((c) => c.key).find((k) =>
    (eliteBoard?.[k]?.occupants || []).some((o) => String(o.email || '').toLowerCase() === email)
  );
  const myDisplayCat = myAssignedCat || myEligibleCat;
  const mySlot =
    myAssignedCat && eliteBoard?.[myAssignedCat]
      ? (eliteBoard[myAssignedCat].occupants || []).findIndex((o) => String(o.email || '').toLowerCase() === email)
      : -1;

  const getRankProgressVolume = (target) => {
    const legs = Array.isArray(summary?.legs) ? summary.legs : [];
    const numericTarget = Number(target || 0);
    const cap = numericTarget >= 200 ? numericTarget * 0.5 : null;
    return legs.reduce((acc, leg) => {
      const weighted = Number(leg?.weighted || 0);
      return acc + (cap == null ? weighted : Math.min(weighted, cap));
    }, 0);
  };
  const hasBonusMovement = currentRankVolume > 0 || Boolean(myDisplayCat) || Number(elitePool || 0) > 0;
  const bonusStatusLabel = myDisplayCat
    ? mySlot >= 0
      ? fillTemplate(t.bonusSlotTemplate, { slot: String(mySlot + 1), cat: String(myDisplayCat) })
      : fillTemplate(t.bonusQualifiedWaitingTemplate, { cat: String(myDisplayCat) })
    : t.bonusNotQualified;
  const nextRankLabel = nextRank
    ? fillTemplate(t.bonusNextRankTemplate, {
        rank: translateRankTitle(nextRank.title, t),
        target: formatMoneyUsdInt(nextRank.target, lang),
      })
    : t.bonusTop;
  const handleOpenResidualPdf = () =>
    onOpenApn?.({
      page: 11,
      title: `${t.apnPresentation} • ${t.apnResidualEarnings}`,
      shortcuts: [
        { label: t.apnResidualEarnings, page: 11 },
        { label: t.apnElitePool, page: 12 },
      ],
    });
  const handleOpenElitePdf = () =>
    onOpenApn?.({
      page: 12,
      title: `${t.apnPresentation} • ${t.apnElitePool}`,
      shortcuts: [
        { label: t.apnResidualEarnings, page: 11 },
        { label: t.apnElitePool, page: 12 },
      ],
    });

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <BonusOverviewSection
        t={t}
        hasMovement={hasBonusMovement}
        rankTitle={translateRankTitle(currentRankTitle, t)}
        currentVolume={formatMoneyUsd(currentRankVolume, lang)}
        nextRankLabel={nextRankLabel}
        statusLabel={bonusStatusLabel}
        onOpenResidual={handleOpenResidualPdf}
        onOpenElite={handleOpenElitePdf}
      />

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
        {loading && <p className="text-sm text-gray-500 mb-4">{t.loading}</p>}
        {currentRankVolume <= 0 ? (
          <EmptyStateCard
            icon={Gift}
            title={t.bonusTrackEmptyTitle}
            description={t.bonusTrackEmptyDesc}
            className="mb-5"
          />
        ) : null}
        <div className="space-y-5">
          {RANKS.map((r) => {
            const v = getRankProgressVolume(r.target);
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
            onClick={handleOpenElitePdf}
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

        {!myDisplayCat ? (
          <EmptyStateCard
            icon={Gift}
            title={t.bonusEliteEmptyTitle}
            description={t.bonusEliteEmptyDesc}
            className="mt-5"
          />
        ) : null}

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
  const [visibleCount, setVisibleCount] = useState(20);

  const reports = (Array.isArray(currentUser.transactions) ? currentUser.transactions : [])
    .slice()
    .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
    .map((tx, i) => ({
      id: tx.id || i,
      date: formatDateTime(tx.at, lang),
      type: translateTransactionType(tx.type, t),
      value: `${tx.amount >= 0 ? '+' : '-'}${formatMoneyUsd(Math.abs(tx.amount), lang)}`,
      status: getStatusLabel(tx.status, t),
      color: tx.amount > 0 ? 'text-green-600' : 'text-red-500'
    }));
  const totalCount = reports.length;
  const creditCount = reports.filter((rep) => String(rep.value || '').startsWith('+')).length;
  const debitCount = reports.filter((rep) => String(rep.value || '').startsWith('-')).length;
  const latestDate = reports[0]?.date || '';

  return (
    <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto space-y-6">
      <ReportsOverviewSection
        t={t}
        totalCount={totalCount}
        creditCount={creditCount}
        debitCount={debitCount}
        latestDate={latestDate}
        hasReports={reports.length > 0}
      />

      <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.28)]">
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
              {reports.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan="4">
                    <div className="mx-auto max-w-xl">
                      <p className="text-base font-black text-gray-800">{t.reportsTableEmptyTitle}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">{t.reportsTableEmptyDesc}</p>
                    </div>
                  </td>
                </tr>
              )}
              {reports.slice(0, visibleCount).map(rep => (
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
        {reports.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 20)}
            className="w-full p-4 text-center bg-gray-50 border-t border-gray-100 text-sm text-gray-500 cursor-pointer hover:text-gray-800"
          >
            {t.reportsLoadMore}
          </button>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState(() => getInitialLang());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [adminConfig, setAdminConfig] = useState(null);
  const [publicStats, setPublicStats] = useState({ globalSold: 0 });
  const [historyModal, setHistoryModal] = useState({ open: false, bankId: null, bankName: null });
  const [supportModal, setSupportModal] = useState({ open: false, channel: null, name: null });
  const [faqOpen, setFaqOpen] = useState(false);
  const [apnModal, setApnModal] = useState({ open: false, page: 1, title: null, shortcuts: [] });
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [notificationsListState, setNotificationsListState] = useState([]);
  const [teamSummary, setTeamSummary] = useState(null);
  const lastUserSnapshotRef = useRef('');

  const setUserLang = (next) => setLang(normalizeLang(next));
  const effectiveLang = currentView === 'admin' ? 'pt' : lang;
  const tEff = getT(effectiveLang);

  useEffect(() => {
    persistLang(lang);
  }, [lang]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const status = String(url.searchParams.get('np') || '').trim().toLowerCase();
      if (!status) return;
      if (status === 'success') alert(tEff.nowpaymentsReturnSuccess);
      if (status === 'cancel') alert(tEff.nowpaymentsReturnCancel);
      url.searchParams.delete('np');
      url.searchParams.delete('orderId');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [tEff.nowpaymentsReturnCancel, tEff.nowpaymentsReturnSuccess]);

  useEffect(() => {
    const restore = async () => {
      const sessionResult = await getSupabaseSession();
      if (!sessionResult.ok || !sessionResult.session?.user) return;

      const dash = await fetchMyDashboard({ maxTransactions: 200 });
      if (!dash.ok || !dash.dashboard?.profile) return;

      const prof = dash.dashboard.profile || {};
      const wallets = dash.dashboard.wallets || {};
      const tx = Array.isArray(dash.dashboard.transactions) ? dash.dashboard.transactions : [];
      const nextUser = normalizeUser({
        ...prof,
        isAdmin: Boolean(prof.is_admin) || Boolean(prof.isAdmin),
        rankKey: prof.rank_key || prof.rankKey,
        teamState: prof.team_state || prof.teamState || {},
        quotaLots: prof.quota_lots || prof.quotaLots || [],
        wallets: {
          usdtBep20: String(wallets?.usdt_bep20 || wallets?.usdtBep20 || ''),
          usdtTrc20: String(wallets?.usdt_trc20 || wallets?.usdtTrc20 || ''),
          usdcArbitrum: String(wallets?.usdc_arbitrum || wallets?.usdcArbitrum || ''),
        },
        transactions: tx,
      });
      setUser(nextUser);
    };
    void restore();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const run = async () => {
      const [cfgRes, banksRes, statsRes] = await Promise.all([fetchAppConfig(), fetchBanks(), fetchPublicStats()]);
      if (cancelled) return;
      const nextCfg = buildAdminConfigFromSupabase({
        config: cfgRes.ok ? cfgRes.config : {},
        banks: banksRes.ok ? banksRes.banks : [],
      });
      const nextStats = statsRes.ok ? statsRes.stats : { globalSold: 0 };
      setPublicStats(nextStats);
      setAdminConfig({ ...nextCfg, globalSold: Number(nextStats?.globalSold || 0) });
    };

    run();
    const id = window.setInterval(run, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user]);

  const syncNotifications = async () => {
    const profileId = user?.id || user?.profileId;
    const res = await fetchMyNotifications({ profileId, limit: 50 });
    if (!res.ok) return;
    setNotificationsListState(res.notifications);
    setNotificationsUnread(res.notifications.filter((n) => !n.read).length);
  };

  const markAllNotifications = async () => {
    const profileId = user?.id || user?.profileId;
    const res = await markAllMyNotificationsRead({ profileId });
    if (!res.ok) return;
    await syncNotifications();
  };

  const openApn = (cfg) => {
    setApnModal({
      open: true,
      page: Number(cfg?.page || 1),
      title: cfg?.title || 'Apresentação (PDF)',
      shortcuts: Array.isArray(cfg?.shortcuts) ? cfg.shortcuts : [],
    });
  };

  void 0;

  useEffect(() => {
    const profileId = user?.id || user?.profileId;
    if (!profileId) return;
    let cancelled = false;
    const run = async () => {
      const res = await fetchMySupportUnreadCount({ profileId });
      if (cancelled || !res.ok) return;
      setSupportUnread(Number(res.unread || 0));
    };
    void run();
    const id = window.setInterval(() => void run(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, user?.profileId]);

  useEffect(() => {
    const profileId = user?.id || user?.profileId;
    if (!profileId) {
      setTeamSummary(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const res = await fetchMyTeamSummary({ maxDepth: 5 });
      if (cancelled || !res.ok) return;
      setTeamSummary(res.summary);
    };
    void run();
    const id = window.setInterval(() => void run(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, user?.profileId]);

  useEffect(() => {
    const profileId = user?.id || user?.profileId;
    if (!profileId) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await syncNotifications();
    };
    void run();
    const id = window.setInterval(() => void run(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, user?.profileId]);

  useEffect(() => {
    const email = (user?.email || '').toLowerCase();
    if (!email) return;

    const run = async () => {
      const dash = await fetchMyDashboard({ maxTransactions: 200 });
      if (!dash.ok || !dash.dashboard?.profile) return;
      const prof = dash.dashboard.profile || {};
      const wallets = dash.dashboard.wallets || {};
      const tx = Array.isArray(dash.dashboard.transactions) ? dash.dashboard.transactions : [];
      const nextUser = normalizeUser({
        ...normalizeUser(user),
        ...prof,
        isAdmin: Boolean(prof.is_admin) || Boolean(prof.isAdmin),
        rankKey: prof.rank_key || prof.rankKey,
        teamState: prof.team_state || prof.teamState || {},
        quotaLots: prof.quota_lots || prof.quotaLots || [],
        wallets: {
          usdtBep20: String(wallets?.usdt_bep20 || wallets?.usdtBep20 || ''),
          usdtTrc20: String(wallets?.usdt_trc20 || wallets?.usdtTrc20 || ''),
          usdcArbitrum: String(wallets?.usdc_arbitrum || wallets?.usdcArbitrum || ''),
        },
        transactions: tx,
      });
      const nextSnapshot = stableSerialize(nextUser);
      const currentSnapshot = stableSerialize(normalizeUser(user));
      if (!nextSnapshot || nextSnapshot === currentSnapshot || nextSnapshot === lastUserSnapshotRef.current) return;
      lastUserSnapshotRef.current = nextSnapshot;
      setUser(nextUser);
    };

    const id = window.setInterval(run, 60000);
    return () => window.clearInterval(id);
  }, [user?.email]);

  const handleLogin = async (u) => {
    const nowIso = new Date().toISOString();
    const base = { ...(u || {}) };
    const isRegister = Object.prototype.hasOwnProperty.call(base, 'confirmPassword');
    const clean = { ...base };
    if (Object.prototype.hasOwnProperty.call(clean, 'confirmPassword')) delete clean.confirmPassword;
    const withCreated = { ...clean, createdAt: clean.createdAt || nowIso };
    const normalized = normalizeUser(withCreated);
    const dash = await fetchMyDashboard({ maxTransactions: 200 });
    if (dash.ok && dash.dashboard?.profile) {
      const prof = dash.dashboard.profile || {};
      const wallets = dash.dashboard.wallets || {};
      const tx = Array.isArray(dash.dashboard.transactions) ? dash.dashboard.transactions : [];
      const nextUser = normalizeUser({
        ...normalized,
        ...prof,
        isAdmin: Boolean(prof.is_admin) || Boolean(prof.isAdmin),
        rankKey: prof.rank_key || prof.rankKey,
        teamState: prof.team_state || prof.teamState || {},
        quotaLots: prof.quota_lots || prof.quotaLots || [],
        wallets: {
          usdtBep20: String(wallets?.usdt_bep20 || wallets?.usdtBep20 || ''),
          usdtTrc20: String(wallets?.usdt_trc20 || wallets?.usdtTrc20 || ''),
          usdcArbitrum: String(wallets?.usdc_arbitrum || wallets?.usdcArbitrum || ''),
        },
        transactions: tx,
      });
      setUser(nextUser);
    } else {
      setUser(normalized);
    }

    if (isRegister) void fetchPublicStats().then((r) => r.ok && setPublicStats(r.stats));
  };

  const handleLogout = async () => {
    await signOutFromSupabase();
    setUser(null);
  };

  if (!user) {
    return <AuthFlow onLogin={handleLogin} lang={lang} setLang={setUserLang} />;
  }

  const emailLower = (user?.email || '').toLowerCase();
  const isAdmin = Boolean(user?.isAdmin) || emailLower === 'rmadmin@gmail.com' || emailLower === 'comunidaderendamais@gmail.com';

  // Renderiza a view correspondente
  const renderView = () => {
    switch(currentView) {
      case 'home':
        return (
          <HomeView
            lang={effectiveLang}
            adminConfig={adminConfig}
            publicStats={publicStats}
            user={user}
            teamSummary={teamSummary}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
            onOpenApn={openApn}
            onOpenReports={() => setCurrentView('reports')}
          />
        );
      case 'quotas': 
        return (
          <QuotasView 
            user={user} 
            setUser={setUser} 
            lang={effectiveLang}
            adminConfig={adminConfig} 
            publicStats={publicStats}
            onBuy={(quotasBought) => {
              const inc = Number.isFinite(Number(quotasBought)) ? Number(quotasBought) : 0;
              if (inc <= 0) return;
              void (async () => {
                const statsRes = await fetchPublicStats();
                if (statsRes.ok && statsRes.stats) setPublicStats(statsRes.stats);
              })();
            }}
            onOpenApn={openApn}
          />
        );
      case 'team':
        return <TeamView user={user} lang={effectiveLang} onOpenApn={openApn} />;
      case 'wallet':
        return (
          <WalletView
            setCurrentView={setCurrentView}
            user={user}
            setUser={setUser}
            lang={effectiveLang}
            adminConfig={adminConfig}
          />
        );
      case 'reports': return <ReportsView user={user} lang={effectiveLang} />;
      case 'bonus': return <BonusView user={user} adminConfig={adminConfig} onOpenApn={openApn} lang={effectiveLang} />;
      case 'settings': return <SettingsView user={user} setUser={setUser} lang={effectiveLang} />;
      case 'admin':
        return (
          <AdminView
            config={adminConfig}
            onSave={async (draft) => {
              const patch = {
                cycle: draft?.cycle || {},
                elite: {
                  profitQuinzenal: Number(draft?.elite?.fortnightProfitUsd || 0),
                  lastPaidAt: draft?.elite?.lastPaidAt ?? null,
                },
                support: draft?.support || {},
              };
              const cfgRes = await adminPatchAppConfig(patch);
              if (!cfgRes.ok) {
                alert(`Falha ao salvar configuração: ${cfgRes.error || 'Erro'}`);
                return { ok: false, error: cfgRes.error || 'Falha ao salvar configuração.', config: null };
              }

              const banks = Object.values(draft?.banks || {});
              const bankResults = await Promise.all(banks.map((b) => adminUpsertBank(b)));
              const failedBankIndex = bankResults.findIndex((res) => !res?.ok);
              if (failedBankIndex >= 0) {
                const failedBank = banks[failedBankIndex];
                const failedResult = bankResults[failedBankIndex];
                alert(`Falha ao salvar ${failedBank?.name || failedBank?.id || 'banca'}: ${failedResult?.error || 'Erro desconhecido'}`);
                return {
                  ok: false,
                  error: failedResult?.error || 'Falha ao salvar banca.',
                  config: null,
                };
              }

              const [freshCfg, freshBanks] = await Promise.all([fetchAppConfig(), fetchBanks()]);
              const nextCfg = buildAdminConfigFromSupabase({
                config: freshCfg.ok ? freshCfg.config : {},
                banks: freshBanks.ok ? freshBanks.banks : [],
              });
              setAdminConfig(nextCfg);
              alert('Configuração atualizada.');
              return { ok: true, error: null, config: nextCfg };
            }}
            onSimulateElitePayout={async ({ profitUsd } = {}) => {
              const res = await adminProcessElitePayout({ profitUsd, mode: 'MANUAL' });
              if (!res.ok || !res.data?.ok) {
                alert(`Falha ao processar Bolsão Elite: ${res.error || res.data?.reason || 'Erro'}`);
                return null;
              }

              const [freshCfg, freshBanks] = await Promise.all([fetchAppConfig(), fetchBanks()]);
              if (freshCfg.ok || freshBanks.ok) {
                const nextCfg = buildAdminConfigFromSupabase({
                  config: freshCfg.ok ? freshCfg.config : {},
                  banks: freshBanks.ok ? freshBanks.banks : [],
                });
                setAdminConfig(nextCfg);
                alert(`Bolsão Elite processado. Lote ${String(res.data?.batchId || '').trim() || 'registrado'}.`);
                return nextCfg;
              }

              alert(`Bolsão Elite processado. Lote ${String(res.data?.batchId || '').trim() || 'registrado'}.`);
              return adminConfig;
            }}
          />
        );
      default:
        return (
          <HomeView
            lang={effectiveLang}
            adminConfig={adminConfig}
            publicStats={publicStats}
            user={user}
            teamSummary={teamSummary}
            onOpenBankHistory={(bank) => {
              setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
            }}
            onOpenApn={openApn}
            onOpenReports={() => setCurrentView('reports')}
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
            onMarkAllNotificationsRead={() => void markAllNotifications()}
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
            void (async () => {
              const profileId = user?.id || user?.profileId;
              if (!profileId) return;
              const res = await fetchMySupportUnreadCount({ profileId });
              if (res.ok) setSupportUnread(Number(res.unread || 0));
            })();
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
        <div className="fixed bottom-6 right-6 z-40 pointer-events-none">
          <div className={`absolute bottom-16 right-0 ${supportMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'} transition-all flex flex-col items-end gap-2 duration-300`}>
            <button
              type="button"
              onClick={() => {
                setSupportMenuOpen(false);
                setSupportModal({ open: true, channel: 'finance', name: tEff.supportChannelFinance });
              }}
              className="pointer-events-auto bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              {tEff.supportChannelFinance}
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${adminConfig?.support?.finance?.online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {adminConfig?.support?.finance?.online ? tEff.supportOnline : tEff.supportOffline}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSupportMenuOpen(false);
                setSupportModal({ open: true, channel: 'tech', name: tEff.supportChannelTech });
              }}
              className="pointer-events-auto bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
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
              onClick={() => {
                setSupportMenuOpen(false);
                setFaqOpen(true);
              }}
              className="pointer-events-auto bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-black flex items-center gap-2 hover:bg-gray-50"
            >
              {tEff.faqButton}
            </button>
          </div>
          
          <button
            type="button"
            onClick={() => setSupportMenuOpen((s) => !s)}
            className="pointer-events-auto p-0 rounded-full shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:scale-105 transition-transform flex items-center justify-center border-2 border-[#00FF00] relative bg-[#1A1A1A]"
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
