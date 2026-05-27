import { useState } from 'react';
import { BANK_STATUS, getBankByQuotaKey } from '../admin/adminStorage.js';
import QuotasOverviewSection from '../quota/QuotasOverviewSection.jsx';
import QuotaPurchaseCard from '../quota/QuotaPurchaseCard.jsx';
import QuotaSponsorshipSummaryCard from '../quota/QuotaSponsorshipSummaryCard.jsx';
import QuotaPurchaseHistorySection from '../quota/QuotaPurchaseHistorySection.jsx';
import { QUOTA_GLOBAL_LIMIT, canBuyPlan } from '../quota/quotaEngine.js';
import { getQuotaEarningsSummary } from '../quota/quotaPresentation.js';
import { attachNowpaymentsSnapshot, createMyPurchase, fetchMyState } from '../supabase/stateSync.js';
import { createNowpaymentPayment } from '../payments/nowpaymentsClient.js';
import NowpaymentsPaymentModal from '../payments/NowpaymentsPaymentModal.jsx';
import { buildNowpaymentsOrderId, buildNowpaymentsSnapshot } from '../payments/nowpaymentsHelpers.js';
import { translateNowpaymentsOperationalMessage } from '../payments/nowpaymentsPresentation.js';
import { fillTemplate, formatDateTime, formatMoneyUsd, getLocaleForLang, getStatusLabel, getT, translateFinancialReason, translateTransactionType } from '../i18n/i18n.js';
import { normalizeUser } from '../shared/normalizeUser.js';

export default function QuotasView({ user, setUser, adminConfig, publicStats, onBuy, onOpenApn, lang }) {
  const currentUser = normalizeUser(user);
  const t = getT(lang);
  const locale = getLocaleForLang(lang);
  const formatPct = (value) => {
    const n = Number(value || 0);
    const hasDecimal = Math.abs(n - Math.round(n)) > 1e-9;
    return n.toLocaleString(locale, { minimumFractionDigits: hasDecimal ? 1 : 0, maximumFractionDigits: 1 });
  };
  const plans = [
    { key: 'cota10', title: 'COTA 10', price: 10, quotas: 1, dailyPct: 1.0, monthlyPct: 30, systemText: t.quotaSystemText1, variant: 'light' },
    { key: 'cota50', title: 'COTA 50', price: 50, quotas: 5, dailyPct: 1.1, monthlyPct: 33, systemText: t.quotaSystemText5, variant: 'dark' },
    { key: 'cota100', title: 'COTA 100', price: 100, quotas: 10, dailyPct: 1.2, monthlyPct: 36, systemText: t.quotaSystemText10, variant: 'light' },
  ];

  const [qty, setQty] = useState({ cota10: 1, cota50: 1, cota100: 1 });
  const [coin, setCoin] = useState({ cota10: 'USDT', cota50: 'USDT', cota100: 'USDT' });
  const [network, setNetwork] = useState({ cota10: 'BEP20', cota50: 'BEP20', cota100: 'BEP20' });
  const [paymentModal, setPaymentModal] = useState({ open: false, payment: null });
  const [buyBusy, setBuyBusy] = useState(false);
  const translatePaymentFlowMessage = (message) => {
    const financial = translateFinancialReason(message, t);
    if (financial !== String(message || '').trim()) return financial;
    return translateNowpaymentsOperationalMessage(message, t);
  };

  const formatMoney = (v) => formatMoneyUsd(v, lang);
  const round2 = (n) => Number(Number(n || 0).toFixed(2));
  const sold = Number(publicStats?.globalSold ?? adminConfig?.globalSold ?? 0);
  const remainingGlobalQuotas = Math.max(0, QUOTA_GLOBAL_LIMIT - sold);
  const totalHoldings = plans.reduce((acc, plan) => acc + Number(currentUser?.holdings?.[plan.key] || 0), 0);
  const purchaseTransactions = (Array.isArray(user?.transactions) ? user.transactions : []).filter(
    (tx) => String(tx?.kind || '') === 'COMPRA' || String(tx?.type || '').startsWith('Compra ')
  );
  const sponsorshipState = currentUser?.teamState?.sponsorship || null;
  const hasQuotaMovement =
    totalHoldings > 0 ||
    purchaseTransactions.length > 0 ||
    Number(currentUser?.balances?.available || 0) > 0;
  const soldSummary = `${sold.toLocaleString(locale)} / ${QUOTA_GLOBAL_LIMIT.toLocaleString(locale)}`;
  const availableGlobalSummary = remainingGlobalQuotas.toLocaleString(locale);
  const holdingsSummary = totalHoldings.toLocaleString(locale);
  const openHowToJoinPdf = () =>
    onOpenApn?.({
      page: 5,
      title: `${t.apnPresentation} • ${t.apnHowToJoin}`,
      shortcuts: [
        { label: t.apnHowToJoin, page: 5 },
        { label: t.apnBanks, page: 9 },
      ],
    });
  const openBanksPdf = () =>
    onOpenApn?.({
      page: 9,
      title: `${t.apnPresentation} • ${t.apnBanksSystem}`,
      shortcuts: [
        { label: t.apnHowToJoin, page: 5 },
        { label: t.apnBanks, page: 9 },
      ],
    });

  const persistUser = (u) => {
    setUser(u);
  };

  const refreshUserFromServer = async () => {
    const fetched = await fetchMyState({ maxTransactions: 200 });
    if (fetched.ok && fetched.state?.userPatch) {
      persistUser(
        normalizeUser({
          ...currentUser,
          ...fetched.state.userPatch,
          transactions: fetched.state.transactions,
        })
      );
    }
  };

  const handleBuy = async (plan) => {
    if (buyBusy) return;
    setBuyBusy(true);
    try {
      const bank = getBankByQuotaKey(adminConfig, plan.key);
      if (!bank || bank.status !== BANK_STATUS.active) {
        alert(t.bankUnavailable);
        return;
      }
      const count = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
      const paymentCoin = coin[plan.key];
      const paymentNetwork = paymentCoin === 'USDT' ? network[plan.key] : paymentCoin === 'USDC' ? 'ARBITRUM' : null;

      if (!paymentCoin) {
        alert(t.selectPaymentMethod);
        return;
      }

      if (paymentCoin === 'USDT' && !paymentNetwork) {
        alert(t.selectUsdtNetwork);
        return;
      }

      const total = plan.price * count;
      const validation = canBuyPlan({
        user: currentUser,
        adminConfig,
        planKey: plan.key,
        unitsToBuy: count,
        quotasPerUnit: plan.quotas,
      });
      if (!validation.ok) {
        alert(translateFinancialReason(validation.reason, t));
        return;
      }
      let paymentId = null;
      let invoiceId = null;
      let orderId = null;
      let nowpaymentData = null;
      if (paymentCoin !== 'SALDO') {
        orderId = buildNowpaymentsOrderId('purchase', currentUser?.id || currentUser?.userId, plan.key, count);
        const paymentRes = await createNowpaymentPayment({
          amountUsd: total,
          asset: paymentCoin,
          network: paymentNetwork,
          orderId,
          orderDescription: `${plan.title} x${count}`,
        });
        if (!paymentRes.ok) {
          alert(`${t.buyProcessingError} ${translatePaymentFlowMessage(paymentRes.reason || 'Falha ao criar cobrança.')}`);
          return;
        }
        paymentId = String(paymentRes.data?.paymentId || '').trim();
        invoiceId = String(paymentRes.data?.invoiceId || '').trim();
        orderId = String(paymentRes.data?.orderId || orderId || '').trim();
        if (!paymentId && !invoiceId && !orderId) {
          alert(`${t.buyProcessingError} ${translatePaymentFlowMessage('Referência de cobrança ausente.')}`);
          return;
        }
        nowpaymentData = paymentRes.data || null;
      }

      const createRes = await createMyPurchase({
        planKey: plan.key,
        units: count,
        paymentCurrency: paymentCoin,
        paymentNetwork,
        paymentId,
        invoiceId,
        orderId,
        bankId: bank.id,
      });
      if (!createRes.ok || !createRes.data?.ok) {
        alert(`${t.buyProcessingError} ${translatePaymentFlowMessage(createRes.error || createRes.data?.reason || 'erro')}`);
        return;
      }

      try {
        if (onBuy) onBuy(plan.quotas * count);
      } catch (err) {
        alert(`${t.buyPanelUpdateError} ${String(err?.message || err)}`);
      }

      const mode = String(createRes.data?.mode || '').toUpperCase();
      if (mode === 'NOWPAYMENTS') {
        if (createRes.data?.depositId && nowpaymentData) {
          await attachNowpaymentsSnapshot({
            depositId: createRes.data.depositId,
            paymentSnapshot: buildNowpaymentsSnapshot(nowpaymentData),
          }).catch(() => null);
        }
        setPaymentModal({ open: true, payment: nowpaymentData });
        void refreshUserFromServer();
        return;
      }

      await refreshUserFromServer();
      alert(t.buySuccessWithBalance);
    } catch (err) {
      alert(`${t.buyProcessingError} ${translatePaymentFlowMessage(err?.message || err)}`);
    } finally {
      setBuyBusy(false);
    }
  };

  return (
    <>
      <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto">
        <QuotasOverviewSection
          t={t}
          hasMovement={hasQuotaMovement}
          soldSummary={soldSummary}
          availableGlobalSummary={availableGlobalSummary}
          holdingsSummary={holdingsSummary}
          onOpenHowToJoin={openHowToJoinPdf}
          onOpenBanks={openBanksPdf}
        />

        <QuotaSponsorshipSummaryCard
          t={t}
          locale={locale}
          sponsorship={sponsorshipState}
          transactions={currentUser?.transactions}
          quotaLots={currentUser?.quotaLots}
          formatMoney={(value) => formatMoneyUsd(value, lang)}
        />

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const earnings = getQuotaEarningsSummary({ planKey: plan.key, units: 1 });
            const isPopular = plan.key === 'cota50';
            const selectedCoin = coin[plan.key];
            const isSaldo = selectedCoin === 'SALDO';
            const bank = getBankByQuotaKey(adminConfig, plan.key);
            const bankStatus = bank?.status || BANK_STATUS.upcoming;
            const canBuy = bankStatus === BANK_STATUS.active;
            const currentUnits = Number(user?.holdings?.[plan.key] || 0);
            const remainingUserUnits = Math.max(0, 100 - currentUnits);
            const remainingGlobalUnits = Math.floor(remainingGlobalQuotas / plan.quotas);
            const maxAllowed = Math.max(0, Math.min(remainingUserUnits, remainingGlobalUnits));
            const requested = Math.max(1, Number.parseInt(qty[plan.key] || 1, 10));
            const blockedByUser = remainingUserUnits <= 0;
            const blockedByGlobal = remainingGlobalQuotas <= 0;
            const blockedByLimit = maxAllowed <= 0;
            const disabled = !canBuy || blockedByLimit;
            const actionLabel = buyBusy
              ? t.processing
              : !canBuy
                ? t.quotasBtnUnavailable
                : disabled
                  ? t.quotasBtnLimitReached
                  : isSaldo
                    ? t.quotasBtnBuyWithBalance
                    : t.quotasBtnBuyWithCrypto;
            const availabilityHint = !canBuy
              ? bankStatus === BANK_STATUS.upcoming
                ? t.quotasHintSoon
                : t.quotasHintClosed
              : blockedByGlobal
                ? t.quotasHintGlobalLimit
                : blockedByUser
                  ? t.quotasHintUserLimit
                  : requested > maxAllowed
                    ? fillTemplate(t.quotasHintMaxNowTemplate, { max: String(maxAllowed) })
                    : fillTemplate(t.quotasHintYouHaveTemplate, {
                        current: String(currentUnits),
                        global: Number(remainingGlobalQuotas || 0).toLocaleString(getLocaleForLang(lang)),
                      });

            return (
              <QuotaPurchaseCard
                key={plan.key}
                t={t}
                plan={plan}
                locale={locale}
                earnings={earnings}
                isPopular={isPopular}
                canBuy={canBuy}
                disabled={disabled}
                buyBusy={buyBusy}
                maxAllowed={maxAllowed}
                currentUnits={currentUnits}
                remainingGlobalQuotas={remainingGlobalQuotas}
                qtyValue={qty[plan.key]}
                selectedCoin={selectedCoin}
                networkValue={network[plan.key]}
                onQtyChange={(value) => setQty((s) => ({ ...s, [plan.key]: value }))}
                onCoinChange={(value) => setCoin((s) => ({ ...s, [plan.key]: value }))}
                onNetworkChange={(value) => setNetwork((s) => ({ ...s, [plan.key]: value }))}
                onBuy={() => handleBuy(plan)}
                formatMoney={formatMoney}
                formatMoneyUsd={(value) => formatMoneyUsd(value, lang)}
                formatPct={formatPct}
                balanceAvailableText={formatMoney(user?.balances?.available)}
                actionLabel={actionLabel}
                availabilityHint={availabilityHint}
              />
            );
          })}
        </div>

        <QuotaPurchaseHistorySection
          t={t}
          transactions={purchaseTransactions}
          lang={lang}
          formatDateTime={formatDateTime}
          formatMoneyUsd={formatMoneyUsd}
          translateTransactionType={translateTransactionType}
          getStatusLabel={getStatusLabel}
        />

        <div className="mt-8 text-center text-sm text-gray-500">
          {t.quotasActivationHint}
        </div>
      </div>
      <NowpaymentsPaymentModal
        isOpen={paymentModal.open}
        payment={paymentModal.payment}
        t={t}
        onClose={() => setPaymentModal({ open: false, payment: null })}
      />
    </>
  );
}
