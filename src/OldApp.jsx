import React, { useEffect, useRef, useState } from 'react';
import ErrorBoundary from './app/ErrorBoundary.jsx';
import LoggedRouter from './app/LoggedRouter.jsx';
import DashboardShell from './layout/DashboardShell.jsx';
import BankHistoryModal from './history/BankHistoryModal.jsx';
import SupportModal from './support/SupportModal.jsx';
import FaqModal from './support/FaqModal.jsx';
import ApnPdfModal from './apn/ApnPdfModal.jsx';
import PublicShell from './public/PublicShell.jsx';
import { fetchMySupportUnreadCount } from './supabase/supportRepo.js';
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
