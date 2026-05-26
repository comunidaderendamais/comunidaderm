import { generateDemoTeam } from './teamEngine';

const KEY = 'rm_team';

const normalize = (raw) => {
  const byEmail = raw?.byEmail && typeof raw.byEmail === 'object' ? raw.byEmail : {};
  return { byEmail };
};

export const loadTeamState = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return normalize(null);
    return normalize(JSON.parse(raw));
  } catch {
    return normalize(null);
  }
};

export const saveTeamState = (st) => {
  const normalized = normalize(st);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
};

export const loadOrSeedTeamForUser = (email, seed) => {
  const key = (email || '').toLowerCase();
  const st = loadTeamState();
  const existing = st.byEmail[key];
  if (existing && existing.team) return existing;

  const seeded = {
    team: generateDemoTeam({ seed: seed || key }),
    lastResidualDay: null,
    lastRankKey: null,
    createdAt: new Date().toISOString(),
  };
  const next = { ...st, byEmail: { ...st.byEmail, [key]: seeded } };
  saveTeamState(next);
  return seeded;
};

export const updateTeamForUser = (email, patch) => {
  const key = (email || '').toLowerCase();
  const st = loadTeamState();
  const current = st.byEmail[key] || {};
  const nextEntry = { ...current, ...patch };
  const next = { ...st, byEmail: { ...st.byEmail, [key]: nextEntry } };
  saveTeamState(next);
  return nextEntry;
};
