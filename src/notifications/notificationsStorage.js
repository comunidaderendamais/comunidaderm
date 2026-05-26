const KEY = 'rm_notifications';

const normalize = (raw) => {
  const byEmail = raw?.byEmail && typeof raw.byEmail === 'object' ? raw.byEmail : {};
  return { byEmail };
};

export const loadNotificationsState = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return normalize(null);
    return normalize(JSON.parse(raw));
  } catch {
    return normalize(null);
  }
};

export const saveNotificationsState = (st) => {
  const normalized = normalize(st);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
};

export const listNotifications = (st, email) => {
  const key = (email || '').toLowerCase();
  const arr = st?.byEmail?.[key];
  return Array.isArray(arr) ? arr : [];
};

export const getUnreadNotificationsCount = (st, email) => listNotifications(st, email).filter((n) => !n.read).length;

export const addNotification = (st, email, n) => {
  const key = (email || '').toLowerCase();
  const next = normalize(st);
  const existing = listNotifications(next, key);
  const item = {
    id: n.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: n.at || new Date().toISOString(),
    title: n.title || 'Notificação',
    message: n.message || '',
    kind: n.kind || 'SYSTEM',
    ref: n.ref || null,
    read: Boolean(n.read),
  };
  next.byEmail[key] = [item, ...existing].slice(0, 100);
  return next;
};

export const markAllRead = (st, email) => {
  const key = (email || '').toLowerCase();
  const next = normalize(st);
  next.byEmail[key] = listNotifications(next, key).map((n) => ({ ...n, read: true }));
  return next;
};

export const hasNotificationRef = (st, email, kind, ref) => {
  const key = (email || '').toLowerCase();
  return listNotifications(st, key).some((n) => n.kind === kind && n.ref === ref);
};

