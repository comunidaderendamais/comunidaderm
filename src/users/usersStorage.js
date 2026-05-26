const USERS_KEY = 'rm_users';

const defaultUsersState = {
  version: 1,
  byEmail: {},
};

const generateUserId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  return `rm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const ensureUserId = (user) => {
  if (!user) return user;
  if (String(user?.userId || '').trim()) return user;
  return { ...user, userId: generateUserId() };
};

export const normalizeUsersState = (st) => ({
  ...defaultUsersState,
  ...(st || {}),
  byEmail: { ...(st?.byEmail || {}) },
});

export const loadUsersState = () => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      const seeded = normalizeUsersState(defaultUsersState);
      localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = normalizeUsersState(JSON.parse(raw));
    let changed = false;
    const nextByEmail = { ...(parsed?.byEmail || {}) };
    Object.keys(nextByEmail).forEach((email) => {
      const u = nextByEmail[email];
      if (!String(u?.userId || '').trim()) {
        nextByEmail[email] = ensureUserId(u);
        changed = true;
      }
    });
    if (changed) {
      const next = { ...parsed, byEmail: nextByEmail };
      localStorage.setItem(USERS_KEY, JSON.stringify(next));
      return next;
    }
    return parsed;
  } catch {
    return normalizeUsersState(defaultUsersState);
  }
};

export const saveUsersState = (st) => {
  const normalized = normalizeUsersState(st);
  localStorage.setItem(USERS_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getUserByEmail = (st, email) => {
  const key = String(email || '').toLowerCase();
  return key ? st?.byEmail?.[key] || null : null;
};

export const getUserByUsername = (st, username) => {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return null;
  return Object.values(st?.byEmail || {}).find((item) => String(item?.username || '').trim().toLowerCase() === u) || null;
};

export const listUsers = (st) => Object.values(st?.byEmail || {});

export const upsertUser = (st, user) => {
  const email = String(user?.email || '').toLowerCase();
  if (!email) return st;
  const previous = st?.byEmail?.[email];
  const createdAt = previous?.createdAt || user?.createdAt || new Date().toISOString();
  const withId = ensureUserId({ ...previous, ...user });
  const nextUser = { ...withId, email, createdAt, updatedAt: new Date().toISOString() };
  return {
    ...st,
    byEmail: {
      ...(st?.byEmail || {}),
      [email]: nextUser,
    },
  };
};
