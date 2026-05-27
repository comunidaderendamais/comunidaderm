import HomeView from '../views/HomeView.jsx';
import QuotasView from '../views/QuotasView.jsx';
import TeamView from '../views/TeamView.jsx';
import WalletView from '../views/WalletView.jsx';
import ReportsView from '../views/ReportsView.jsx';
import BonusView from '../views/BonusView.jsx';
import SettingsView from '../views/SettingsView.jsx';
import AdminView from '../admin/AdminView.jsx';

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
  if (currentView === 'admin') {
    if (!isAdmin) return null;
    return <AdminView {...(adminViewProps || {})} />;
  }

  switch (currentView) {
    case 'home':
      return (
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
      return (
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
      return <TeamView user={user} lang={lang} onOpenApn={onOpenApn} />;
    case 'wallet':
      return (
        <WalletView
          setCurrentView={setCurrentView}
          user={user}
          setUser={setUser}
          lang={lang}
          adminConfig={adminConfig}
        />
      );
    case 'reports':
      return <ReportsView user={user} lang={lang} />;
    case 'bonus':
      return <BonusView user={user} adminConfig={adminConfig} onOpenApn={onOpenApn} lang={lang} />;
    case 'settings':
      return <SettingsView user={user} setUser={setUser} lang={lang} />;
    default:
      return null;
  }
}

