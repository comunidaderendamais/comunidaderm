import DashboardHeader from './DashboardHeader.jsx';
import DashboardSidebar from './DashboardSidebar.jsx';

export default function DashboardShell({
  sidebarOpen,
  setSidebarOpen,
  currentView,
  setCurrentView,
  effectiveLang,
  userLang,
  setUserLang,
  user,
  isAdmin,
  onLogout,
  notificationsCount,
  notifications,
  onMarkAllNotificationsRead,
  children,
}) {
  return (
    <div className="flex h-screen bg-[#F3F4F6] font-sans overflow-hidden">
      <DashboardSidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        currentView={currentView}
        setCurrentView={setCurrentView}
        lang={effectiveLang}
        isAdmin={isAdmin}
        onLogout={onLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-64 relative overflow-hidden">
        <DashboardHeader
          user={user}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          lang={effectiveLang}
          userLang={userLang}
          setLang={setUserLang}
          setCurrentView={setCurrentView}
          notificationsCount={notificationsCount}
          notifications={notifications}
          onMarkAllNotificationsRead={onMarkAllNotificationsRead}
        />

        <main className="flex-1 overflow-y-auto bg-gray-50 relative pb-20">
          {children}
        </main>
      </div>
    </div>
  );
}

