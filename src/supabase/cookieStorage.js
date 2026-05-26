const encode = (value) => {
  try {
    return encodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
};

const decode = (value) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
};

const getCookie = (name) => {
  try {
    const raw = String(document?.cookie || '');
    if (!raw) return null;
    const parts = raw.split(';').map((p) => p.trim());
    const prefix = `${name}=`;
    const hit = parts.find((p) => p.startsWith(prefix));
    if (!hit) return null;
    return decode(hit.slice(prefix.length));
  } catch {
    return null;
  }
};

const setCookie = (name, value, days = 30) => {
  try {
    const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encode(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch {}
};

const removeCookie = (name) => {
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {}
};

export const cookieStorage = {
  getItem: (key) => getCookie(key),
  setItem: (key, value) => setCookie(key, value, 30),
  removeItem: (key) => removeCookie(key),
};

