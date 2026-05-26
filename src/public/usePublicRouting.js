import { useEffect, useMemo, useState } from 'react';
import { buildPublicPath, getPublicRouteFromLocation, normalizePublicRoute } from './publicRouting.js';

export const usePublicRouting = () => {
  const [publicRoute, setPublicRoute] = useState(() => getPublicRouteFromLocation());

  const navigatePublicRoute = (route, options = {}) => {
    const next = normalizePublicRoute(route);
    const path = buildPublicPath(next);
    const replace = Boolean(options.replace);
    try {
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
    } catch {}
    setPublicRoute(next);
  };

  useEffect(() => {
    const handleLocationChange = () => {
      setPublicRoute(getPublicRouteFromLocation());
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const authModalMode = useMemo(() => {
    return publicRoute === 'login' || publicRoute === 'register' ? publicRoute : null;
  }, [publicRoute]);

  return { publicRoute, authModalMode, navigatePublicRoute, setPublicRoute };
};

