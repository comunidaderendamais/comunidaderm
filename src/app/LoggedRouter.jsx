import { Suspense, lazy } from 'react';

const HomeView = lazy(() => import('../views/HomeView.jsx'));
const QuotasView = lazy(() => import('../views/QuotasView.jsx'));
const TeamView = lazy(() => import('../views/TeamView.jsx'));
const WalletView = lazy(() => import('../views/WalletView.jsx'));
const ReportsView = lazy(() => import('../views/ReportsView.jsx'));
const BonusView = lazy(() => import('../views/BonusView.jsx'));
const SettingsView = lazy(() => import('../views/SettingsView.jsx'));
const AdminView = lazy(() => import('../admin/AdminView.jsx'));

const RouterFallback = () => <div className="min-h-[320px] rounded-[32px] border border-slate-200 bg-white/80" />;

export default function LoggedRouter({
  currentView,
  setCurrentView,
  user,
  setUser,
  lang,
  adminConfig,
  publicStats,
  teamSummary,
  onOpenBankHistory,
  onOpenApn,
  onOpenReports,
  onBuyQuotas,
  isAdmin,
  adminViewProps,
}) {
  const renderWithSuspense = (node) => <Suspense fallback={<RouterFallback />}>{node}</Suspense>;

  if (currentView === 'admin') {
    if (!isAdmin) return null;
    return renderWithSuspense(<AdminView {...(adminViewProps || {})} />);
  }

  switch (currentView) {
    case 'home':
      return renderWithSuspense(
        <HomeView
          lang={lang}
          adminConfig={adminConfig}
          publicStats={publicStats}
          user={user}
          teamSummary={teamSummary}
          onOpenBankHistory={onOpenBankHistory}
          onOpenReports={onOpenReports}
          onOpenQuotas={() => setCurrentView('quotas')}
        />
      );
    case 'quotas':
      return renderWithSuspense(
        <QuotasView
          user={user}
          setUser={setUser}
          lang={lang}
          adminConfig={adminConfig}
          publicStats={publicStats}
          onBuy={onBuyQuotas}
          onOpenApn={onOpenApn}
        />
      );
    case 'team':
      return renderWithSuspense(<TeamView user={user} lang={lang} onOpenApn={onOpenApn} />);
    case 'wallet':
      return renderWithSuspense(
        <WalletView
          setCurrentView={setCurrentView}
          user={user}
          setUser={setUser}
          lang={lang}
          adminConfig={adminConfig}
        />
      );
    case 'reports':
      return renderWithSuspense(<ReportsView user={user} lang={lang} />);
    case 'bonus':
      return renderWithSuspense(<BonusView user={user} adminConfig={adminConfig} onOpenApn={onOpenApn} lang={lang} />);
    case 'settings':
      return renderWithSuspense(<SettingsView user={user} setUser={setUser} lang={lang} />);
    default:
      return null;
  }
}
