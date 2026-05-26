export const normalizePublicRoute = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'loguin') return 'login';
  if (key === 'cadastro') return 'register';
  if (key === 'projeto' || key === 'login' || key === 'register' || key === 'dashboard') return key;
  return '';
};

export const getPublicRouteFromPathname = (pathname = '') => {
  const path = String(pathname || '').trim().toLowerCase();
  const match = path.match(/^\/(projeto|login|loguin|register|cadastro|dashboard)(\/|$)/i);
  return match?.[1] ? normalizePublicRoute(match[1]) : '';
};

export const getPublicRouteFromHash = (hash = '') => {
  const raw = String(hash || '').trim().replace(/^#/, '');
  if (!raw) return '';
  const route = raw.startsWith('/') ? raw.slice(1) : raw;
  const key = route.split('?')[0].split('&')[0];
  return normalizePublicRoute(key);
};

export const getPublicRouteFromLocation = (location) => {
  try {
    const loc = location || window.location;
    const byPath = getPublicRouteFromPathname(loc?.pathname || '');
    if (byPath) return byPath;
    return getPublicRouteFromHash(loc?.hash || '');
  } catch {
    return '';
  }
};

export const buildPublicPath = (route) => {
  const key = normalizePublicRoute(route);
  if (!key) return '/';
  return `/${key === 'login' ? 'login' : key === 'register' ? 'register' : key}`;
};

