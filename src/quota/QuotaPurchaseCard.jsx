import { Coins, CreditCard, Sparkles, TrendingUp } from 'lucide-react';

const DetailRow = ({ label, value, strong = false, tone = 'light' }) => (
  <div
    className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${
      tone === 'dark'
        ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
        : 'border-gray-200 bg-gray-50/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.28)]'
    }`.trim()}
  >
    <span className={tone === 'dark' ? 'text-sm text-slate-300' : 'text-sm text-gray-600'}>{label}</span>
    <span
      className={`text-right whitespace-nowrap text-sm ${strong ? 'font-black' : 'font-semibold'} ${
        tone === 'dark' ? 'text-white' : 'text-gray-900'
      }`.trim()}
    >
      {value}
    </span>
  </div>
);

export default function QuotaPurchaseCard({
  t,
  plan,
  locale,
  earnings,
  isPopular,
  canBuy,
  disabled,
  buyBusy,
  maxAllowed,
  currentUnits,
  remainingGlobalQuotas,
  qtyValue,
  selectedCoin,
  networkValue,
  onQtyChange,
  onCoinChange,
  onNetworkChange,
  onBuy,
  formatMoney,
  formatMoneyUsd,
  formatPct,
  balanceAvailableText,
  actionLabel,
  availabilityHint,
}) {
  const isDark = plan.variant === 'dark';
  const isSaldo = selectedCoin === 'SALDO';

  const shellClass = isDark
    ? 'rm-neon-banner rm-neon-static rm-neon-surface text-white'
    : 'rm-neon-banner rm-neon-static rm-neon-light text-gray-900';
  const badgeClass = isDark
    ? 'border-white/10 bg-white/6 text-white/80'
    : 'border-gray-200 bg-gray-50 text-gray-700';
  const accentValueClass = isDark ? 'text-[#00FF00]' : 'text-[#8A2BE2]';
  const subtleTextClass = isDark ? 'text-xs text-slate-400' : 'text-xs text-gray-500';
  const labelClass = isDark ? 'text-sm text-slate-300' : 'text-sm text-gray-600';
  const inputClass = isDark
    ? 'w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-white outline-none transition focus:border-[#00FF00]/40'
    : 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-[#8A2BE2]/40';

  return (
    <div className={`p-5 sm:p-6 ${shellClass}`.trim()}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl" />

      <div className="rm-neon-banner-content">
        <div className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${badgeClass}`.trim()}>
                <Sparkles className="h-4 w-4" />
                {plan.systemText}
              </span>
              {isPopular ? (
                <span className="inline-flex items-center rounded-full bg-[#00FF00] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-black">
                  {t.quotasPopular}
                </span>
              ) : null}
            </div>
            <h3 className="mt-4 text-2xl font-black">{plan.title}</h3>
            <p className={`mt-2 text-4xl font-black tracking-tight ${accentValueClass}`.trim()}>
              {formatMoney(plan.price).replace('.00', '')}
            </p>
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 text-right ${
              isDark
                ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
                : 'border-gray-200 bg-white/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.22)]'
            }`.trim()}
          >
            <p className={subtleTextClass}>{t.quotasHeroAvailableLabel}</p>
            <p className={`mt-2 text-xl font-black ${isDark ? 'text-white' : 'text-gray-950'}`.trim()}>{maxAllowed}</p>
            <p className={`mt-2 text-[11px] leading-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`.trim()}>
              {t.quotasPlanAvailableNowHint}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <DetailRow
            label={t.quotasDailyReturn}
            value={`${formatPct(plan.dailyPct)}%${t.quotasPerDaySuffix}`}
            strong
            tone={isDark ? 'dark' : 'light'}
          />
          <DetailRow
            label={t.quotasMonthlyAvg}
            value={`~${Number(plan.monthlyPct || 0).toLocaleString(locale)}%${t.quotasPerMonthSuffix}`}
            strong
            tone={isDark ? 'dark' : 'light'}
          />
          <DetailRow
            label={t.quotasApproxDailyUsdLabel}
            value={formatMoneyUsd(earnings.perUnit.dailyUsd)}
            tone={isDark ? 'dark' : 'light'}
          />
          <DetailRow
            label={t.quotasApproxMonthlyUsdLabel}
            value={formatMoneyUsd(earnings.perUnit.monthlyUsd)}
            tone={isDark ? 'dark' : 'light'}
          />
          <DetailRow
            label={t.quotasCycleProjectionLabel}
            value={`${formatMoneyUsd(earnings.perUnit.cycleUsd)} (${Number(earnings.cyclePct || 0).toLocaleString(locale)}%)`}
            tone={isDark ? 'dark' : 'light'}
          />
          <DetailRow
            label={t.quotasEntryFee}
            value={`10% (${formatMoney(plan.price * 0.1)})`}
            tone={isDark ? 'dark' : 'light'}
          />
        </div>

        <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
          <div
            className={`rounded-2xl border px-4 py-4 ${
              isDark
                ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
                : 'border-gray-200 bg-white/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.22)]'
            }`.trim()}
          >
            <div className="flex items-center gap-2">
              <Coins className={`h-4 w-4 ${isDark ? 'text-[#00FF00]' : 'text-violet-600'}`.trim()} />
              <p className={subtleTextClass}>{t.quotasValidity}</p>
            </div>
            <p className={`mt-3 text-lg font-black ${isDark ? 'text-white' : 'text-gray-950'}`.trim()}>{t.quotasValidityValue}</p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-4 ${
              isDark
                ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
                : 'border-gray-200 bg-white/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.22)]'
            }`.trim()}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className={`h-4 w-4 ${isDark ? 'text-[#00FF00]' : 'text-emerald-600'}`.trim()} />
              <p className={subtleTextClass}>{t.quotasCurrentHoldingsLabel}</p>
            </div>
            <p className={`mt-3 text-lg font-black ${isDark ? 'text-white' : 'text-gray-950'}`.trim()}>{currentUnits}</p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-4 ${
              isDark
                ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
                : 'border-gray-200 bg-white/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.22)]'
            }`.trim()}
          >
            <div className="flex items-center gap-2">
              <CreditCard className={`h-4 w-4 ${isDark ? 'text-[#00FF00]' : 'text-sky-600'}`.trim()} />
              <p className={subtleTextClass}>{t.quotasGlobalAvailableLabel}</p>
            </div>
            <p className={`mt-3 text-lg font-black ${isDark ? 'text-white' : 'text-gray-950'}`.trim()}>
              {Number(remainingGlobalQuotas || 0).toLocaleString(locale)}
            </p>
          </div>
        </div>

        <div
          className={`mt-6 rounded-[24px] border p-4 ${
            isDark
              ? 'border-white/10 bg-black/15 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.55)]'
              : 'border-gray-200 bg-white/85 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.22)]'
          }`.trim()}
        >
          <div className="grid gap-3">
            <div>
              <label className={`${labelClass} block mb-2`}>{t.quotasQuantity}</label>
              <input
                type="number"
                min="1"
                value={qtyValue}
                onChange={(e) => onQtyChange(e.target.value)}
                disabled={buyBusy}
                className={inputClass}
              />
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              <div>
                <label className={`${labelClass} block mb-2`}>{t.quotasPayment}</label>
                <select value={selectedCoin} onChange={(e) => onCoinChange(e.target.value)} disabled={buyBusy} className={inputClass}>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="SALDO">{t.quotasBalanceOption}</option>
                </select>
                {isSaldo ? (
                  <p className={`${subtleTextClass} mt-2`}>
                    {t.quotasBalanceAvailable} <span className="font-black">{balanceAvailableText}</span>
                  </p>
                ) : null}
                <p className={`${subtleTextClass} mt-2`}>{t.quotasBalanceAlwaysHint}</p>
              </div>

              {!isSaldo ? (
                <div>
                  <label className={`${labelClass} block mb-2`}>{t.quotasNetwork}</label>
                  {selectedCoin === 'USDT' ? (
                    <select value={networkValue} onChange={(e) => onNetworkChange(e.target.value)} disabled={buyBusy} className={inputClass}>
                      <option value="BEP20">BEP-20</option>
                      <option value="TRC20">TRC-20</option>
                    </select>
                  ) : (
                    <select value="ARBITRUM" disabled className={`${inputClass} opacity-70 cursor-not-allowed`}>
                      <option value="ARBITRUM">Arbitrum</option>
                    </select>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBuy}
          disabled={disabled || buyBusy}
          className={`mt-6 w-full rounded-2xl py-3.5 text-sm font-black transition-colors ${
            disabled || buyBusy
              ? 'cursor-not-allowed bg-gray-300 text-gray-500'
              : isDark
                ? 'bg-[#00FF00] text-black hover:bg-green-400'
                : 'bg-slate-950 text-white hover:bg-slate-800'
          }`.trim()}
        >
          {actionLabel}
        </button>

        <div
          className={`mt-4 rounded-2xl border px-4 py-4 ${
            canBuy
              ? isDark
                ? 'border-white/10 bg-white/6 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.55)]'
                : 'border-gray-200 bg-gray-50/80 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.28)]'
              : 'border-amber-200 bg-amber-50/90'
          }`.trim()}
        >
          <p className={`text-xs leading-6 ${canBuy ? (isDark ? 'text-slate-300' : 'text-gray-600') : 'text-amber-800'}`.trim()}>
            {availabilityHint}
          </p>
        </div>
      </div>
    </div>
  );
}
