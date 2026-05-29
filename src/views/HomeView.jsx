import { PieChart } from 'lucide-react';
import { BANK_STATUS } from '../admin/adminStorage.js';
import HomeOverviewSection, { HomeRecentEarningsSection } from '../home/HomeOverviewSection.jsx';
import { fillTemplate, formatDateTime, formatMoneyUsd, formatMoneyUsdInt, getT, translateRankTitle, translateTransactionType } from '../i18n/i18n.js';
import { normalizeUser } from '../shared/normalizeUser.js';
import { getCurrentRankDisplayVolume } from '../team/rankSummary.js';

export default function HomeView({ lang, adminConfig, publicStats, user, teamSummary, onOpenBankHistory, onOpenReports, onOpenQuotas }) {
  const t = getT(lang);

  const totalLimit = 100000;
  const currentSold = Number(publicStats?.globalSold ?? adminConfig?.globalSold ?? 0);
  const percentage = Math.min((currentSold / totalLimit) * 100, 100);

  const formatMoney = (v) => formatMoneyUsd(v, lang);

  const currentUser = normalizeUser(user);
  const currentRankVolume = getCurrentRankDisplayVolume(teamSummary);

  const rankTitle = translateRankTitle(teamSummary?.rank?.title || currentUser?.rankKey || 'Ferro', t);
  const nextRank = teamSummary?.rank?.next || null;
  const rankDesc = nextRank
    ? fillTemplate(t.homeRankDescTemplate, {
        current: formatMoneyUsdInt(currentRankVolume, lang),
        target: formatMoneyUsdInt(Number(nextRank?.target || 0), lang),
        next: translateRankTitle(nextRank?.title || nextRank?.key || '', t),
      })
    : t.bonusTop;
  const investedAmount = Number(currentUser?.balances?.invested || 0);
  const teamEarningsAmount = Number(currentUser?.balances?.teamEarnings || 0);
  const availableAmount = Number(currentUser?.balances?.available || 0);

  const cards = [
    {
      key: 'invested',
      title: t.invested,
      value: formatMoney(investedAmount),
      desc: t.homeBoughtQuotasDesc,
      hint: investedAmount > 0 ? t.homeMetricInvestedActiveHint : t.homeMetricInvestedEmptyHint,
      badge: investedAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-sky-100 bg-sky-50 text-sky-600',
    },
    {
      key: 'teamEarnings',
      title: t.teamEarnings,
      value: formatMoney(teamEarningsAmount),
      desc: t.homeUpToLevel5Desc,
      hint: teamEarningsAmount > 0 ? t.homeMetricTeamActiveHint : t.homeMetricTeamEmptyHint,
      badge: teamEarningsAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-emerald-100 bg-emerald-50 text-emerald-600',
    },
    {
      key: 'totalBalance',
      title: t.totalBalance,
      value: formatMoney(availableAmount),
      desc: t.homeWithdrawAvailableDesc,
      hint: availableAmount > 0 ? t.homeMetricBalanceActiveHint : t.homeMetricBalanceEmptyHint,
      badge: availableAmount > 0 ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-violet-100 bg-violet-50 text-violet-600',
    },
    {
      key: 'rank',
      title: t.rank,
      value: rankTitle,
      desc: t.homeMetricRankDesc,
      hint: nextRank ? rankDesc : t.homeMetricRankHint,
      badge: nextRank ? t.homeMetricLiveBadge : t.homeMetricGuideBadge,
      accentClass: 'border-amber-100 bg-amber-50 text-amber-600',
    },
  ];

  const recentEarnings = (Array.isArray(currentUser.transactions) ? currentUser.transactions : [])
    .filter((tx) => Number(tx?.amount || 0) > 0)
    .slice()
    .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
    .slice(0, 3);
  const recentItems = recentEarnings.map((item) => ({
    id: item.id,
    title: translateTransactionType(item.type, t),
    date: formatDateTime(item.at, lang),
    amount: `+${formatMoneyUsd(Math.abs(Number(item.amount || 0)), lang)}`,
  }));
  const hasDashboardMovement =
    investedAmount > 0 ||
    teamEarningsAmount > 0 ||
    availableAmount > 0 ||
    recentItems.length > 0;

  return (
    <div className="p-4 min-[540px]:p-6 space-y-6 max-w-7xl mx-auto">
      <HomeOverviewSection
        t={t}
        totalLimit={totalLimit}
        currentSold={currentSold}
        percentage={percentage}
        hasMovement={hasDashboardMovement}
        rankTitle={rankTitle}
        rankDesc={rankDesc}
        cards={cards}
        onOpenQuotas={onOpenQuotas}
      />

      <div className="bg-[#1A1A1A] rounded-2xl p-6 text-white border border-[#8A2BE2]">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PieChart className="text-[#00FF00]" />
          {t.homeRealOpsTitle}
        </h3>
        <p className="text-gray-400 text-sm mb-6">{t.homeRealOpsDesc}</p>

        <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.values(adminConfig?.banks || {}).map((bank) => {
            const badge =
              bank.status === BANK_STATUS.active
                ? { text: t.bankOperating, className: 'bg-blue-500/20 text-blue-300 animate-pulse' }
                : bank.status === BANK_STATUS.closed
                  ? { text: t.bankClosed, className: 'bg-green-500/20 text-green-300' }
                  : { text: t.bankSoon, className: 'bg-yellow-500/20 text-yellow-300' };

            const profitAcc = bank.profitAccumulatedPct ? `+${String(bank.profitAccumulatedPct).replace('.', ',')}%` : '—';
            const profitMonth = bank.status === BANK_STATUS.active && bank.profitMonthPct ? `+${String(bank.profitMonthPct).replace('.', ',')}%` : '—';
            const filled = Math.max(0, Math.min(100, Number(bank.filledPct || 0)));
            const disabled = bank.status !== BANK_STATUS.active;

            return (
              <div
                key={bank.id}
                onClick={() => {
                  if (!disabled) onOpenBankHistory?.(bank);
                }}
                className={`bg-gray-800 rounded-xl p-4 border transition-colors ${disabled ? 'border-gray-700 opacity-60 cursor-not-allowed' : 'border-[#00FF00] shadow-[0_0_15px_rgba(0,255,0,0.1)] cursor-pointer hover:border-[#00FF00]'}`}
                title={disabled ? t.bankUnavailableTitle : t.bankActiveTitle}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">{bank.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${badge.className}`}>{badge.text}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {fillTemplate(t.homeLimitTemplate, {
                    amount: `$${Number(bank.limit || 0).toLocaleString()}`,
                    quota: bank.quotaKey === 'cota10' ? t.quotaLabel10 : bank.quotaKey === 'cota50' ? t.quotaLabel50 : t.quotaLabel100,
                  })}
                </p>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                  <div className={`h-2 rounded-full ${disabled ? 'bg-gray-500' : 'bg-[#00FF00]'}`} style={{ width: `${filled}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">{t.homeAccumulated}:</span>
                    <span className="text-[#00FF00] font-bold">{profitAcc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">{t.homeCurrentMonth}:</span>
                    <span className="text-[#00FF00] font-bold">{profitMonth}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <HomeRecentEarningsSection
        t={t}
        recentItems={recentItems}
        onOpenReports={onOpenReports}
      />
    </div>
  );
}
