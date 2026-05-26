import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Send as SendIcon, X } from 'lucide-react';
import ErrorBoundary from './app/ErrorBoundary.jsx';
import LoggedRouter from './app/LoggedRouter.jsx';
import DashboardShell from './layout/DashboardShell.jsx';
import BankHistoryModal from './history/BankHistoryModal.jsx';
import PublicShell from './public/PublicShell.jsx';
import { fetchFaqItems } from './supabase/faqRepo.js';
import { ensureMySupportThread, fetchMySupportUnreadCount, fetchThreadMessages, markThreadReadForUser, sendSupportMessage } from './supabase/supportRepo.js';
import { fetchMyNotifications, markAllMyNotificationsRead } from './supabase/notificationsRepo.js';
import { adminPatchAppConfig, adminUpsertBank, fetchAppConfig, fetchBanks, fetchPublicStats } from './supabase/appConfigRepo.js';
import { fetchMyDashboard, fetchMyTeamSummary } from './supabase/dashboardRepo.js';
import { adminProcessElitePayout } from './supabase/adminRepo.js';
import { getSupabaseSession, signOutFromSupabase } from './supabase/auth.js';
import { fillTemplate, getT } from './i18n/i18n.js';
import { getInitialLang, normalizeLang, persistLang } from './shared/lang.js';
import { buildAdminConfigFromSupabase } from './shared/buildAdminConfigFromSupabase.js';
import { normalizeUser } from './shared/normalizeUser.js';

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

const ADMIN_EMAILS = new Set([
  'rmadmin@gmail.com',
  'comunidaderendamais@gmail.com',
  'telexrn@gmail.com',
  'pauloalberto5000@gmail.com',
  'wilson270043@gmail.com',
  'samiroliver.oliver@gmail.com',
]);

const APN_CHIP_BASE = 'px-3 py-2 rounded-xl text-sm font-bold border transition';

const APN_PDF_FILES = {
  pt: 'APN_RENDA_MAIS_BR.pdf',
  en: 'APN_RENDA_MAIS_EN-US.pdf',
  es: 'APN_RENDA_MAIS_ES-ES.pdf',
  fr: 'APN_RENDA_MAIS_FR-FR.pdf',
};

const getDocLangDefault = (lang) => {
  const key = String(lang || '').trim().toLowerCase();
  if (key === 'en') return 'en';
  if (key === 'es') return 'es';
  if (key === 'fr') return 'fr';
  return 'pt';
};

const formatSupportTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

function EmbeddedSupportModal({ isOpen, channel, channelName, isOnline, queue, user, onClose, t }) {
  const [text, setText] = useState('');
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const tr = t || getT('pt');
  const profileId = user?.id || user?.profileId;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const run = async () => {
      const ensured = await ensureMySupportThread({ profileId, channel });
      if (cancelled || !ensured.ok) return;
      setThread(ensured.thread);
      await markThreadReadForUser({ threadId: ensured.thread.id });
      const msgs = await fetchThreadMessages({ threadId: ensured.thread.id });
      if (cancelled || !msgs.ok) return;
      setMessages(msgs.messages);
      setText('');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, profileId, channel]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !thread?.id || busy) return;
    try {
      setBusy(true);
      const sent = await sendSupportMessage({ threadId: thread.id, from: 'user', text: content });
      if (!sent.ok) {
        alert(sent.error || 'Falha ao enviar mensagem.');
        return;
      }
      setText('');
      const msgs = await fetchThreadMessages({ threadId: thread.id });
      if (msgs.ok) setMessages(msgs.messages);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onClose?.()}></div>
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
              onClick={() => onClose?.()}
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
              {thread?.status === 'resolved' && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-black text-gray-800">{tr.supportResolvedTitle}</p>
                  <p className="text-xs text-gray-500 mt-1">{tr.supportResolvedDesc}</p>
                </div>
              )}
              {messages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center bg-white">
                  <p className="text-lg font-black text-gray-800">{tr.supportEmptyTitle}</p>
                  <p className="text-sm text-gray-500 mt-2">{tr.supportEmptyDesc}</p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${m.from === 'user' ? 'bg-[#00FF00]/20 border-[#00FF00]/30 text-gray-900' : 'bg-white border-gray-200 text-gray-800'}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                    <p className="text-[11px] mt-2 text-gray-500">{formatSupportTime(m.at)}</p>
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
                className="px-5 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400 inline-flex items-center gap-2 disabled:opacity-60"
                disabled={busy || !thread?.id}
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

function EmbeddedFaqModal({ isOpen, onClose, t, lang }) {
  const tr = t || getT(lang);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const run = async () => {
      const res = await fetchFaqItems();
      if (cancelled || !res.ok) return;
      setItems(res.items);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] h-[min(780px,88vh)] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]">
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">{tr.faqTitle}</p>
            <h3 className="text-lg font-black truncate">{tr.faqSubtitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
            title={tr.close}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="h-[calc(100%-56px)] overflow-y-auto p-4 bg-gray-50">
          <div className="space-y-3">
            {items.map((item, idx) => {
              const q = typeof item?.q === 'string' ? item.q : item?.q?.[lang] || item?.q?.pt || '';
              const a = typeof item?.a === 'string' ? item.a : item?.a?.[lang] || item?.a?.pt || '';
              return (
                <details key={idx} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <summary className="cursor-pointer font-black text-gray-800">{q}</summary>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{a}</p>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmbeddedApnPdfModal({ isOpen, initialPage = 1, title, onClose, shortcuts = [], t, lang }) {
  const tr = t || getT(lang);
  const [page, setPage] = useState(Number(initialPage || 1));
  const [docLang, setDocLang] = useState(() => getDocLangDefault(lang));

  useEffect(() => {
    if (!isOpen) return;
    setPage(Number(initialPage || 1));
  }, [isOpen, initialPage]);

  useEffect(() => {
    if (!isOpen) return;
    setDocLang(getDocLangDefault(lang));
  }, [isOpen, lang]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const safePage = Math.max(1, Number.isFinite(Number(page)) ? Number(page) : 1);
  const file = APN_PDF_FILES[docLang] || APN_PDF_FILES.pt;
  const src = `/apn/${file}#page=${safePage}`;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60" onClick={() => onClose?.()}></div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,94vw)] h-[min(820px,92vh)] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]">
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">{tr.apnOfficialLabel}</p>
            <h3 className="text-lg font-black truncate">{title || tr.apnPresentation}</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onClose?.()}
              className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
              title={tr.close}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-700">{tr.apnPdfLanguageLabel}</span>
              <select
                value={docLang}
                onChange={(e) => setDocLang(String(e.target.value || '').trim().toLowerCase())}
                className="bg-transparent text-sm font-black text-gray-900 outline-none"
              >
                <option value="pt">{tr.apnPdfLangPt}</option>
                <option value="en">{tr.apnPdfLangEn}</option>
                <option value="es">{tr.apnPdfLangEs}</option>
                <option value="fr">{tr.apnPdfLangFr}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Number(p || 1) - 1))}
              className={`${APN_CHIP_BASE} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00] flex items-center gap-2`}
            >
              <ChevronLeft size={16} />
              {tr.apnPrev}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Number(p || 1) + 1))}
              className={`${APN_CHIP_BASE} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00] flex items-center gap-2`}
            >
              {tr.apnNext}
              <ChevronRight size={16} />
            </button>

            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-700">{tr.apnPage}</span>
              <input
                value={String(page)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') {
                    setPage('');
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isFinite(n)) setPage(n);
                }}
                className="w-20 bg-transparent text-sm font-black text-gray-900 outline-none"
                inputMode="numeric"
              />
            </div>

            {shortcuts.map((s) => (
              <button
                key={`${s.page}-${s.label}`}
                type="button"
                onClick={() => setPage(s.page)}
                className={`${APN_CHIP_BASE} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00]`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{tr.apnTip}</p>
        </div>

        <div className="h-[calc(100%-132px)] bg-black">
          <iframe title="APN Renda Mais" src={src} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}

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

  const resolveGlobalSold = (statsValue, configValue, previousValue = 0) => {
    const candidates = [statsValue, previousValue, configValue]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);
    return candidates.length ? candidates[0] : 0;
  };
  const [teamSummary, setTeamSummary] = useState(null);
  const lastUserSnapshotRef = useRef('');
  const lastGlobalSoldRef = useRef(0);
  lastGlobalSoldRef.current = Number(publicStats?.globalSold || 0);

  const setUserLang = (next) => setLang(normalizeLang(next));
  const effectiveLang = currentView === 'admin' ? 'pt' : lang;
  const tEff = getT(effectiveLang);

  useEffect(() => {
    const handleAppNavigate = (event) => {
      const nextView = String(event?.detail?.view || '').trim();
      if (!nextView) return;
      setCurrentView(nextView);
      setSidebarOpen(false);
    };
    window.addEventListener('app:navigate', handleAppNavigate);
    return () => window.removeEventListener('app:navigate', handleAppNavigate);
  }, []);

  useEffect(() => {
    persistLang(lang);
  }, [lang]);

  useEffect(() => {
    if (!user) return;
    try {
      const current = String(window.location?.pathname || '');
      if (current.startsWith('/dashboard')) return;
      window.history.replaceState({}, '', '/dashboard');
    } catch {}
    try {
      const nextView = String(sessionStorage.getItem('rmPostLoginView') || '').trim();
      if (nextView) {
        sessionStorage.removeItem('rmPostLoginView');
        setCurrentView(nextView);
      }
    } catch {}
  }, [user?.id]);

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
      const nextGlobalSold = resolveGlobalSold(statsRes.ok ? statsRes.stats?.globalSold : null, nextCfg?.globalSold, lastGlobalSoldRef.current);
      setPublicStats((prev) => ({ ...(statsRes.ok ? statsRes.stats : prev), globalSold: nextGlobalSold }));
      setAdminConfig({ ...nextCfg, globalSold: nextGlobalSold });
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
    try {
      window.history.replaceState({}, '', '/dashboard');
    } catch {}
  };

  const handleLogout = async () => {
    await signOutFromSupabase();
    setUser(null);
    try {
      window.history.replaceState({}, '', '/projeto');
    } catch {}
  };

  if (!user) {
    return <PublicShell lang={lang} setLang={setUserLang} onLogin={handleLogin} />;
  }

  const emailLower = (user?.email || '').toLowerCase();
  const isAdmin = Boolean(user?.isAdmin) || ADMIN_EMAILS.has(emailLower);

  const renderView = () => {
    const onBuyQuotas = (quotasBought) => {
      const inc = Number.isFinite(Number(quotasBought)) ? Number(quotasBought) : 0;
      if (inc <= 0) return;
      void (async () => {
        const statsRes = await fetchPublicStats();
        if (statsRes.ok && statsRes.stats) setPublicStats(statsRes.stats);
      })();
    };

    const adminViewProps = {
      config: adminConfig,
      onSave: async (draft) => {
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
      },
      onSimulateElitePayout: async ({ profitUsd } = {}) => {
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
      },
    };

    return (
      <LoggedRouter
        currentView={currentView}
        setCurrentView={setCurrentView}
        user={user}
        setUser={setUser}
        lang={effectiveLang}
        adminConfig={adminConfig}
        publicStats={publicStats}
        teamSummary={teamSummary}
        onOpenBankHistory={(bank) => {
          setHistoryModal({ open: true, bankId: bank.id, bankName: bank.name });
        }}
        onOpenApn={openApn}
        onOpenReports={() => setCurrentView('reports')}
        onBuyQuotas={onBuyQuotas}
        isAdmin={isAdmin}
        adminViewProps={adminViewProps}
      />
    );
  };

  return (
    <ErrorBoundary>
      <DashboardShell
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentView={currentView}
        setCurrentView={setCurrentView}
        effectiveLang={effectiveLang}
        userLang={lang}
        setUserLang={setUserLang}
        user={user}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        notificationsCount={Number(supportUnread || 0) + Number(notificationsUnread || 0)}
        notifications={notificationsListState}
        onMarkAllNotificationsRead={() => void markAllNotifications()}
      >
        {renderView()}
      </DashboardShell>

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

      <EmbeddedSupportModal
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

      <EmbeddedFaqModal
        isOpen={faqOpen}
        t={tEff}
        lang={effectiveLang}
        onClose={() => {
          setFaqOpen(false);
          setSupportMenuOpen(false);
        }}
      />

      <EmbeddedApnPdfModal
        isOpen={apnModal.open}
        initialPage={apnModal.page}
        title={apnModal.title}
        shortcuts={apnModal.shortcuts}
        t={tEff}
        lang={effectiveLang}
        onClose={() => setApnModal({ open: false, page: 1, title: null, shortcuts: [] })}
      />

      <div className="fixed bottom-6 right-6 z-40 pointer-events-none">
        {supportMenuOpen ? (
          <div className="absolute bottom-16 right-0 flex translate-y-0 flex-col items-end gap-2 transition-all duration-300 pointer-events-auto">
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
        ) : null}
        
        <button
          type="button"
          onClick={() => setSupportMenuOpen((s) => !s)}
          className="pointer-events-auto p-0 rounded-full shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:scale-105 transition-transform flex items-center justify-center border-2 border-[#00FF00] relative bg-[#1A1A1A]"
        >
          <img src="/PERSONAGEM RENDA MAIS com LOGO.png" alt="Suporte" className="w-14 h-14 rounded-full object-cover" />
          {Number(supportUnread || 0) > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-xs px-2 py-1 rounded-full font-bold text-white shadow">
              {supportUnread > 99 ? '99+' : supportUnread}
            </span>
          )}
        </button>
      </div>
    </ErrorBoundary>
  );
};

export default App;
