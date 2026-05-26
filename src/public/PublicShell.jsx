import { useEffect, useMemo } from 'react';
import { getT } from '../i18n/i18n.js';
import AuthFlow from '../auth/AuthFlow.jsx';
import AuthModal from './AuthModal.jsx';
import InstitutionalPage from './InstitutionalPage.jsx';
import { usePublicRouting } from './usePublicRouting.js';

const getRefFromPath = () => {
  try {
    const path = String(window.location?.pathname || '');
    const match = path.match(/\/ref\/([^/]+)/i);
    return match && match[1] ? decodeURIComponent(match[1]).trim() : '';
  } catch {
    return '';
  }
};

export default function PublicShell({ lang, setLang, onLogin }) {
  const { publicRoute, authModalMode, navigatePublicRoute } = usePublicRouting();
  const refUsername = useMemo(() => getRefFromPath(), []);
  const t = getT(lang);

  useEffect(() => {
    if (refUsername) return;
    if (!publicRoute || publicRoute === 'dashboard') {
      navigatePublicRoute('projeto', { replace: true });
    }
  }, [publicRoute, refUsername]);

  if (refUsername) {
    return (
      <AuthFlow
        onLogin={onLogin}
        lang={lang}
        setLang={setLang}
        initialMode="register"
        refUsername={refUsername}
      />
    );
  }

  const modalTitle = authModalMode === 'login' ? t.login : t.register;

  return (
    <>
      <InstitutionalPage
        lang={lang}
        setLang={setLang}
        t={t}
        onLogin={() => navigatePublicRoute('login')}
        onRegister={() => navigatePublicRoute('register')}
      />
      <AuthModal
        isOpen={Boolean(authModalMode)}
        title={modalTitle}
        t={t}
        onClose={() => navigatePublicRoute('projeto', { replace: true })}
      >
        <AuthFlow
          onLogin={onLogin}
          lang={lang}
          setLang={setLang}
          initialMode={authModalMode || undefined}
          layout="modal"
        />
      </AuthModal>
    </>
  );
}

