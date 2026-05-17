const SUPPORT_KEY = 'rm_support';

export const emptySupportState = { threads: {} };

export const normalizeSupportState = (state) => {
  const threads = state?.threads && typeof state.threads === 'object' ? state.threads : {};
  const next = { threads: {} };
  Object.keys(threads).forEach((id) => {
    const t = threads[id] || {};
    next.threads[id] = {
      id,
      channel: t.channel || 'finance',
      userEmail: t.userEmail || '',
      userName: t.userName || '',
      status: t.status || 'open',
      updatedAt: t.updatedAt || new Date(0).toISOString(),
      messages: Array.isArray(t.messages)
        ? t.messages.map((m) => ({
            id: m.id || `${Date.now()}`,
            at: m.at || new Date(0).toISOString(),
            from: m.from === 'admin' ? 'admin' : 'user',
            text: typeof m.text === 'string' ? m.text : '',
            readByUser: Boolean(m.readByUser),
            readByAdmin: Boolean(m.readByAdmin),
          }))
        : [],
    };
  });
  return next;
};

export const loadSupportState = () => {
  try {
    const raw = localStorage.getItem(SUPPORT_KEY);
    if (!raw) return emptySupportState;
    return normalizeSupportState(JSON.parse(raw));
  } catch {
    return emptySupportState;
  }
};

export const saveSupportState = (state) => {
  const normalized = normalizeSupportState(state);
  localStorage.setItem(SUPPORT_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getThreadId = ({ channel, userEmail }) => `${channel}:${(userEmail || '').toLowerCase()}`;

export const getOrCreateThread = (state, { channel, userEmail, userName }) => {
  const id = getThreadId({ channel, userEmail });
  const existing = state?.threads?.[id];
  if (existing) return { state, thread: existing };

  const now = new Date().toISOString();
  const thread = {
    id,
    channel,
    userEmail: (userEmail || '').toLowerCase(),
    userName: userName || '',
    status: 'open',
    updatedAt: now,
    messages: [],
  };

  const next = { ...state, threads: { ...(state?.threads || {}), [id]: thread } };
  return { state: next, thread };
};

export const addMessage = (state, { threadId, from, text }) => {
  const t = state?.threads?.[threadId];
  if (!t) return state;
  const now = new Date();
  const msg = {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    at: now.toISOString(),
    from: from === 'admin' ? 'admin' : 'user',
    text: text || '',
    readByUser: from === 'user',
    readByAdmin: from === 'admin',
  };
  const updatedAt = msg.at;
  const nextThread = { ...t, messages: [...t.messages, msg], updatedAt, status: 'open' };
  return { ...state, threads: { ...state.threads, [threadId]: nextThread } };
};

export const markReadForUser = (state, { threadId }) => {
  const t = state?.threads?.[threadId];
  if (!t) return state;
  const msgs = t.messages.map((m) => (m.from === 'admin' ? { ...m, readByUser: true } : m));
  return { ...state, threads: { ...state.threads, [threadId]: { ...t, messages: msgs } } };
};

export const markReadForAdmin = (state, { threadId }) => {
  const t = state?.threads?.[threadId];
  if (!t) return state;
  const msgs = t.messages.map((m) => (m.from === 'user' ? { ...m, readByAdmin: true } : m));
  return { ...state, threads: { ...state.threads, [threadId]: { ...t, messages: msgs } } };
};

export const setThreadStatus = (state, { threadId, status }) => {
  const t = state?.threads?.[threadId];
  if (!t) return state;
  const nextStatus = status === 'resolved' ? 'resolved' : 'open';
  return { ...state, threads: { ...state.threads, [threadId]: { ...t, status: nextStatus } } };
};

export const getUnreadCountForUser = (state, userEmail) => {
  const email = (userEmail || '').toLowerCase();
  const threads = Object.values(state?.threads || {}).filter((t) => (t.userEmail || '').toLowerCase() === email);
  return threads.reduce((acc, t) => acc + t.messages.filter((m) => m.from === 'admin' && !m.readByUser).length, 0);
};

export const getUnreadCountForAdmin = (state) => {
  const threads = Object.values(state?.threads || {});
  return threads.reduce((acc, t) => acc + t.messages.filter((m) => m.from === 'user' && !m.readByAdmin).length, 0);
};

export const listThreads = (state) =>
  Object.values(state?.threads || {}).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
