import { fillTemplate, getT, translateRankTitle } from '../i18n/i18n.js';

const getLocale = (lang) => {
  const key = String(lang || '').trim().toLowerCase();
  if (key === 'en') return 'en-US';
  if (key === 'es') return 'es-ES';
  return 'pt-BR';
};

const formatHoldings = (holdings) => {
  const h = holdings || {};
  const entries = [
    { k: 'cota10', label: 'COTA 10' },
    { k: 'cota50', label: 'COTA 50' },
    { k: 'cota100', label: 'COTA 100' },
  ]
    .map((x) => ({ ...x, v: Number(h?.[x.k] || 0) }))
    .filter((x) => x.v > 0);
  return entries;
};

const TeamNetworkLevelsCard = ({ t, lang, levels }) => {
  const tr = t || getT(lang);
  const locale = getLocale(lang);
  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(locale, { dateStyle: 'short' });
    } catch {
      return String(iso || '');
    }
  };

  const safeLevels = Array.isArray(levels) ? levels : [];
  const total = safeLevels.reduce((acc, lvl) => acc + (Array.isArray(lvl?.users) ? lvl.users.length : 0), 0);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 min-[540px]:p-6 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-gray-900 truncate">{tr.teamNetworkTitle}</h3>
          <p className="mt-2 text-sm text-gray-500">
            {tr.teamNetworkSubtitle}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700 whitespace-nowrap">
          {fillTemplate(tr.teamUsersCountTemplate, { count: total })}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {safeLevels.map((lvl) => {
          const users = Array.isArray(lvl?.users) ? lvl.users : [];
          return (
            <div key={lvl.level} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-gray-900">
                  {fillTemplate(tr.teamLevelLabel, { lvl: lvl.level })}
                </p>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                  {users.length}
                </span>
              </div>

              {users.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">{tr.teamNoReferralsAtLevel}</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {users.map((u) => {
                    const holdings = formatHoldings(u?.holdings);
                    return (
                      <div key={u.key} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">@{u.username || '—'}</p>
                            <p className="mt-1 text-xs text-gray-500 truncate">{u.email || '—'}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                            {translateRankTitle(u.rankTitle, tr)}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tr.teamSignupLabel}</p>
                            <p className="mt-1 text-sm font-black text-gray-900">{u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tr.teamQuotasLabel}</p>
                            <p className="mt-1 text-sm font-black text-gray-900">{u.totalCotas || 0}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {holdings.length ? (
                            holdings.map((x) => (
                              <span
                                key={x.k}
                                className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 whitespace-nowrap"
                              >
                                {x.label}: {x.v}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-black text-gray-600 whitespace-nowrap">
                              {tr.teamNoActiveQuotas}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamNetworkLevelsCard;
