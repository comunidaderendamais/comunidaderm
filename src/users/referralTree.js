export const buildReferralLevels = ({ users, rootUsername, maxDepth = 5 }) => {
  const root = String(rootUsername || '').trim().toLowerCase();
  const list = Array.isArray(users) ? users : [];
  if (!root) return [];

  const byRef = new Map();
  list.forEach((u) => {
    const ref = String(u?.referrerUsername || '').trim().toLowerCase();
    if (!ref) return;
    const arr = byRef.get(ref) || [];
    arr.push(u);
    byRef.set(ref, arr);
  });

  const seen = new Set();
  let parents = [root];
  const levels = [];

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const next = [];
    parents.forEach((p) => {
      const children = byRef.get(String(p || '').trim().toLowerCase()) || [];
      children.forEach((child) => {
        const email = String(child?.email || '').toLowerCase();
        const key = email || `${String(child?.username || '').toLowerCase()}-${depth}`;
        if (seen.has(key)) return;
        seen.add(key);
        next.push(child);
      });
    });
    levels.push(next);
    parents = next.map((u) => String(u?.username || '').trim().toLowerCase()).filter(Boolean);
    if (!parents.length) break;
  }

  return levels;
};

