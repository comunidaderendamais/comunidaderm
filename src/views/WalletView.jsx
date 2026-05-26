import { useState } from 'react';
import { FileText, PieChart, Wallet, X } from 'lucide-react';
import InfoRow from '../components/ui/InfoRow.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';
import QuotaLotProgressCard from '../wallet/QuotaLotProgressCard.jsx';
import QuotaLotEarningsModal from '../wallet/QuotaLotEarningsModal.jsx';
import WalletOverviewSection from '../wallet/WalletOverviewSection.jsx';
import { calcDesistPenaltyPct, DESIST_ANALYSIS_HOURS } from '../quota/quotaEngine.js';
import {
  buildCheckoutUrlFromInvoiceId,
  copyText,
  getPaymentSnapshotSummary,
  hasHostedCheckoutAvailable,
  normalizeNowpaymentsPayment,
  getTransactionStatusLabel,
  translateNowpaymentsOperationalMessage,
  translateNowpaymentsReason,
  translateNowpaymentsStatus,
} from '../payments/nowpaymentsPresentation.js';
import { createNowpaymentPayment, fetchNowpaymentStatus } from '../payments/nowpaymentsClient.js';
import NowpaymentsPaymentModal from '../payments/NowpaymentsPaymentModal.jsx';
import { buildNowpaymentsOrderId, buildNowpaymentsSnapshot } from '../payments/nowpaymentsHelpers.js';
import { isNowpaymentsConflictError, lotSourceMatchesDeposit } from '../payments/nowpaymentsReconcile.js';
import { isSettledTransactionStatus } from '../shared/transactionStatus.js';
import { attachNowpaymentsSnapshot, confirmMyNowpaymentsPayment, fetchMyState, persistMyState, renewMyLot, requestMyDesistance, requestMyWithdraw } from '../supabase/stateSync.js';
import { sendTelegramAlert } from '../supabase/telegramAlerts.js';
import { fillTemplate, formatDateShort, formatDateTime, formatMoneyUsd, getStatusLabel, getT, translateFinancialReason, translateTransactionType } from '../i18n/i18n.js';
import { calcWithdrawNet, settleNowpaymentsDeposit, WITHDRAW_FEE_USD } from '../payments/walletEngine.js';
import { normalizeUser } from '../shared/normalizeUser.js';

export default function WalletView({ setCurrentView, user, setUser, adminConfig, lang }) {
  const currentUser = normalizeUser(user);
  const t = getT(lang);
  const hasWallet = currentUser?.wallets?.usdtBep20 || currentUser?.wallets?.usdtTrc20 || currentUser?.wallets?.usdcArbitrum;
  const [renewModal, setRenewModal] = useState({ open: false, lotId: null });
  const [desistModal, setDesistModal] = useState({ open: false, lotId: null });
  const [lotDetailsModal, setLotDetailsModal] = useState({ open: false, lotId: null });
  const [renewPayment, setRenewPayment] = useState('SALDO');
  const [renewNetwork, setRenewNetwork] = useState('BEP20');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('USDT');
  const [withdrawNetwork, setWithdrawNetwork] = useState('BEP20');
  const [withdrawCopyFeedback, setWithdrawCopyFeedback] = useState('');
  const [paymentModal, setPaymentModal] = useState({ open: false, payment: null });
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [reopenBusyId, setReopenBusyId] = useState(null);
  const translatePaymentFlowMessage = (message) => {
    const financial = translateFinancialReason(message, t);
    if (financial !== String(message || '').trim()) return financial;
    return translateNowpaymentsOperationalMessage(message, t);
  };

  const persistUser = (u) => {
    setUser?.(u);
  };

  const refreshUserFromServer = async () => {
    const fetched = await fetchMyState({ maxTransactions: 200 });
    if (fetched.ok && fetched.state?.userPatch) {
      const enriched = normalizeUser({ ...currentUser, ...fetched.state.userPatch, transactions: fetched.state.transactions });
      persistUser(enriched);
    }
  };

  const getWithdrawAddress = () => {
    if (withdrawAsset === 'USDC') return String(currentUser?.wallets?.usdcArbitrum || '').trim();
    if (withdrawNetwork === 'TRC20') return String(currentUser?.wallets?.usdtTrc20 || '').trim();
    return String(currentUser?.wallets?.usdtBep20 || '').trim();
  };
  const activeWithdrawAddress = getWithdrawAddress();

  const copyWithdrawAddress = async () => {
    if (!activeWithdrawAddress) {
      setWithdrawCopyFeedback(t.walletActiveWalletMissing);
      return;
    }
    const ok = await copyText(activeWithdrawAddress);
    setWithdrawCopyFeedback(ok ? t.walletCopyAddressSuccess : t.walletCopyAddressError);
  };

  const pendingDeposits = (Array.isArray(currentUser?.transactions) ? currentUser.transactions : []).filter(
    (t) => String(t?.kind || '') === 'DEPOSITO' && String(t?.status || '').toLowerCase() === 'pendente'
  );

  const getDepositReference = (tx) => ({
    paymentId: String(tx?.meta?.paymentId || tx?.meta?.meta?.paymentId || '').trim(),
    invoiceId: String(tx?.meta?.invoiceId || tx?.meta?.meta?.invoiceId || '').trim(),
    orderId: String(tx?.meta?.orderId || tx?.meta?.meta?.orderId || '').trim(),
  });

  const getDepositSnapshot = (tx) => {
    const snapshot = tx?.meta?.nowpaymentsSnapshot || tx?.meta?.meta?.nowpaymentsSnapshot || null;
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  };

  const getDepositSummary = (tx) => {
    const refs = getDepositReference(tx);
    const snapshot = getDepositSnapshot(tx);
    return getPaymentSnapshotSummary({
      ...(snapshot || {}),
      paymentId: refs.paymentId || snapshot?.paymentId || '',
      invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
      orderId: refs.orderId || snapshot?.orderId || '',
    });
  };

  const getDepositDisplayReference = (tx) => {
    const refs = getDepositReference(tx);
    if (refs.paymentId) return refs.paymentId;
    if (refs.invoiceId) return `Invoice: ${refs.invoiceId}`;
    if (refs.orderId) return `Order: ${refs.orderId}`;
    return 'Referencia indisponivel';
  };

  const buildPendingPaymentModalData = async (tx) => {
    const refs = getDepositReference(tx);
    const snapshot = getDepositSnapshot(tx);
    let payment = normalizeNowpaymentsPayment({
      ...(snapshot || {}),
      paymentId: refs.paymentId || snapshot?.paymentId || '',
      invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
      orderId: refs.orderId || snapshot?.orderId || '',
      checkoutUrl: snapshot?.checkoutUrl || buildCheckoutUrlFromInvoiceId(refs.invoiceId || snapshot?.invoiceId || ''),
    });

    const needsRemoteHydration =
      Boolean(refs.paymentId) &&
      (!payment.payAddress || !payment.payAmount || !payment.payCurrency || !payment.paymentStatus);

    if (needsRemoteHydration) {
      const statusRes = await fetchNowpaymentStatus({ paymentId: refs.paymentId });
      if (statusRes.ok && statusRes.data) {
        payment = normalizeNowpaymentsPayment({
          ...payment,
          ...statusRes.data,
          paymentId: refs.paymentId || statusRes.data?.payment_id,
          invoiceId: refs.invoiceId || statusRes.data?.invoice_id,
          orderId: refs.orderId || statusRes.data?.order_id,
        });
      }
    }

    return normalizeNowpaymentsPayment(payment);
  };

  const reopenDepositPayment = async (txId) => {
    try {
      if (reopenBusyId) return;
      setReopenBusyId(String(txId || ''));
      const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
      const tx = txs.find((item) => String(item?.id || '') === String(txId));
      if (!tx) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      const refs = getDepositReference(tx);
      const snapshot = getDepositSnapshot(tx);
      if (!snapshot && !refs.paymentId && !refs.invoiceId && !refs.orderId) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      const payment = await buildPendingPaymentModalData(tx);
      if (!payment.checkoutUrl && !payment.payAddress && !payment.paymentId && !payment.invoiceId && !payment.orderId) {
        alert(t.walletReopenChargeUnavailable);
        return;
      }

      setPaymentModal({ open: true, payment });
    } catch (err) {
      alert(`${t.walletReopenChargeError} ${translatePaymentFlowMessage(err?.message || err)}`);
    } finally {
      setReopenBusyId(null);
    }
  };

  const verifyDeposit = async (txId) => {
    try {
      if (verifyBusy) return;
      setVerifyBusy(true);
      const txs = Array.isArray(currentUser?.transactions) ? currentUser.transactions : [];
      const tx = txs.find((t) => String(t?.id || '') === String(txId));
      if (isSettledTransactionStatus(tx?.status)) {
        alert(t.statusCompleted);
        return;
      }
      const refs = getDepositReference(tx);
      if (!refs.paymentId && !refs.invoiceId && !refs.orderId) {
        alert(t.depositCodeRequired);
        return;
      }
      const existingLots = Array.isArray(currentUser?.quotaLots) ? currentUser.quotaLots : [];
      const alreadyApplied = existingLots.some((lot) => lotSourceMatchesDeposit(lot, refs, txId));
      if (alreadyApplied) {
        await refreshUserFromServer();
        alert(t.statusCompleted);
        return;
      }
      let paymentStatus = null;
      let rawEvent = {};
      if (refs.paymentId) {
        const res = await fetchNowpaymentStatus({ paymentId: refs.paymentId });
        if (!res.ok) {
          alert(`${t.depositCheckFailed} ${translateNowpaymentsReason(res.reason, t)}`);
          return;
        }
        paymentStatus = res.status;
        rawEvent = res.data || {};
      }
      const confirmRes = await confirmMyNowpaymentsPayment({
        paymentId: refs.paymentId,
        invoiceId: refs.invoiceId,
        orderId: refs.orderId,
        paymentStatus,
        rawEvent,
      });
      if (!confirmRes.ok) {
        if (isNowpaymentsConflictError(confirmRes.error)) {
          const localSettle = settleNowpaymentsDeposit({
            user: currentUser,
            depositTxId: txId,
            nowpayStatus: paymentStatus,
            cycleMonths: adminConfig?.cycle?.months,
            renewWindowHours: adminConfig?.cycle?.renewWindowHours,
          });
          if (!localSettle.ok || !localSettle.updated || !localSettle.user) {
            alert(`${t.depositCheckFailed} ${translatePaymentFlowMessage(confirmRes.error)}`);
            return;
          }
          const persistRes = await persistMyState(localSettle.user);
          if (!persistRes.ok) {
            alert(`${t.depositCheckFailed} ${translatePaymentFlowMessage(persistRes.error || confirmRes.error)}`);
            return;
          }
          await refreshUserFromServer();
          alert(`${t.checkComplete} (${translateNowpaymentsStatus(paymentStatus, t)})`);
          return;
        }
        alert(`${t.depositCheckFailed} ${translatePaymentFlowMessage(confirmRes.error)}`);
        return;
      }
      await refreshUserFromServer();
      alert(`${t.checkComplete} (${translateNowpaymentsStatus(paymentStatus, t)})`);
    } finally {
      setVerifyBusy(false);
    }
  };

  const submitWithdraw = async () => {
    const addr = getWithdrawAddress();
    const amount = Number(withdrawAmount || 0);
    const net = calcWithdrawNet({ amountUsd: amount });
    if (currentUser?.blocked) {
      alert(t.blockedAccountSupport);
      return;
    }
    if (amount < 10) {
      alert(translateFinancialReason('Valor mínimo para saque é $10.', t));
      return;
    }
    if (!addr) {
      alert(t.walletNoWalletConfigured);
      return;
    }
    const reqRes = await requestMyWithdraw({
      amountUsd: amount,
      asset: withdrawAsset,
      network: withdrawAsset === 'USDC' ? 'ARBITRUM' : withdrawNetwork,
      address: addr,
    });
    if (!reqRes.ok || !reqRes.data?.ok) {
      alert(translateFinancialReason(reqRes.error || 'Falha ao solicitar saque.', t));
      return;
    }
    void sendTelegramAlert({
      eventType: 'withdraw_requested',
      username: currentUser?.username || currentUser?.email || currentUser?.id || 'usuario-sem-login',
      amountUsd: amount,
      occurredAt: new Date().toISOString(),
    }).catch(() => null);
    await refreshUserFromServer();
    setWithdrawAmount('');
    alert(`${t.withdrawRequestedAlert} ${formatMoneyUsd(net.netUsd, lang)}`);
  };

  const reports = currentUser.transactions.map((tx, i) => ({
    id: tx.id || i,
    date: formatDateShort(tx.at, lang),
    type: translateTransactionType(tx.type, t),
    value: formatMoneyUsd(Math.abs(tx.amount), lang),
    displayValue: `${tx.amount >= 0 ? '+' : '-'}${formatMoneyUsd(Math.abs(tx.amount), lang)}`,
    status: getTransactionStatusLabel(tx, t, getStatusLabel),
    color: tx.amount > 0 ? 'text-green-600' : 'text-red-500',
  }));

  const nowTs = Date.now();
  const lots = Array.isArray(currentUser.quotaLots) ? currentUser.quotaLots : [];
  const maturedLots = lots
    .filter((l) => l.status === 'MATURED')
    .map((l) => ({ ...l, renewLeftMs: Math.max(0, Date.parse(l.renewUntil) - nowTs) }))
    .sort((a, b) => (a.renewLeftMs < b.renewLeftMs ? -1 : 1));
  const activeLots = lots
    .filter((l) => l.status === 'ACTIVE')
    .map((l) => ({
      ...l,
      endsInMs: Math.max(0, Date.parse(l.endAt) - nowTs),
      durationMs: Math.max(1, Date.parse(l.endAt) - Date.parse(l.startAt)),
    }))
    .sort((a, b) => (a.endsInMs < b.endsInMs ? -1 : 1));
  const cancelLots = lots
    .filter((l) => l.status === 'CANCEL_PENDING')
    .map((l) => ({ ...l, cancelLeftMs: Math.max(0, Date.parse(l.cancelPayAt) - nowTs) }))
    .sort((a, b) => (a.cancelLeftMs < b.cancelLeftMs ? -1 : 1));

  const selectedLot = renewModal.open ? lots.find((l) => l.id === renewModal.lotId) : null;
  const desistLot = desistModal.open ? lots.find((l) => l.id === desistModal.lotId) : null;
  const lotDetails = lotDetailsModal.open ? lots.find((l) => l.id === lotDetailsModal.lotId) : null;
  const renewNetworkFinal = renewPayment === 'USDT' ? renewNetwork : renewPayment === 'USDC' ? 'ARBITRUM' : null;
  const hasWalletMovement =
    Boolean(hasWallet) ||
    Number(currentUser?.balances?.available || 0) > 0 ||
    Number(currentUser?.balances?.invested || 0) > 0 ||
    activeLots.length > 0 ||
    pendingDeposits.length > 0;

  const confirmRenew = () => {
    if (!selectedLot) return;
    (async () => {
      const paymentCurrency = renewPayment;
      let paymentId = null;
      let invoiceId = null;
      let orderId = null;
      let nowpaymentData = null;
      if (paymentCurrency !== 'SALDO') {
        orderId = buildNowpaymentsOrderId('renew', currentUser?.id || currentUser?.userId, selectedLot.id);
        const paymentRes = await createNowpaymentPayment({
          amountUsd: Number(selectedLot.planPrice || 0) * Number(selectedLot.units || 0),
          asset: paymentCurrency,
          network: renewNetworkFinal,
          orderId,
          orderDescription: `Renovacao ${selectedLot.planTitle} x${selectedLot.units}`,
        });
        if (!paymentRes.ok) {
          alert(translatePaymentFlowMessage(paymentRes.reason || 'Falha ao criar cobrança.'));
          return;
        }
        paymentId = String(paymentRes.data?.paymentId || '').trim();
        invoiceId = String(paymentRes.data?.invoiceId || '').trim();
        orderId = String(paymentRes.data?.orderId || orderId || '').trim();
        if (!paymentId && !invoiceId && !orderId) {
          alert(translatePaymentFlowMessage('Referência de cobrança ausente.'));
          return;
        }
        nowpaymentData = paymentRes.data || null;
      }

      const res = await renewMyLot({
        lotId: selectedLot.id,
        paymentCurrency,
        paymentNetwork: renewNetworkFinal,
        paymentId,
        invoiceId,
        orderId,
      });
      if (!res.ok || !res.data?.ok) {
        alert(translateFinancialReason(res.error || 'Falha ao renovar.', t));
        return;
      }

      await refreshUserFromServer();
      setRenewModal({ open: false, lotId: null });
      const mode = String(res.data?.mode || '').toUpperCase();
      if (mode === 'NOWPAYMENTS') {
        if (res.data?.depositId && nowpaymentData) {
          await attachNowpaymentsSnapshot({
            depositId: res.data.depositId,
            paymentSnapshot: buildNowpaymentsSnapshot(nowpaymentData),
          }).catch(() => null);
          await refreshUserFromServer();
        }
        setPaymentModal({ open: true, payment: nowpaymentData });
        return;
      }
      alert(t.renewRegisteredAlert);
    })();
  };

  const confirmDesistance = () => {
    if (!desistLot) return;
    (async () => {
      const res = await requestMyDesistance({ lotId: desistLot.id });
      if (!res.ok || !res.data?.ok) {
        alert(translateFinancialReason(res.error || 'Falha ao solicitar desistência.', t));
        return;
      }

      await refreshUserFromServer();
      setDesistModal({ open: false, lotId: null });
      alert(`${t.desistanceRequestedAlert} ${DESIST_ANALYSIS_HOURS}h.`);
    })();
  };

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <WalletOverviewSection
        t={t}
        hasMovement={hasWalletMovement}
        availableBalance={formatMoneyUsd(currentUser.balances.available, lang)}
        activeCyclesCount={activeLots.length}
        pendingDepositsCount={pendingDeposits.length}
        hasWallet={Boolean(hasWallet)}
        onOpenQuotas={() => setCurrentView('quotas')}
        onOpenSettings={() => setCurrentView('settings')}
      />

      <div className="bg-white p-8 rounded-[28px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)] border border-gray-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-900">{t.walletWithdrawTitle}</h3>
            <p className="mt-1 text-sm text-gray-500">{t.walletWithdrawPanelDesc}</p>
          </div>
          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-violet-700">{t.walletWithdrawReleased}</p>
              <p className="mt-2 text-2xl font-black text-[#8A2BE2]">{formatMoneyUsd(currentUser.balances.available, lang)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletWithdrawTotalInvested}</p>
              <p className="mt-2 text-2xl font-black text-gray-900">{formatMoneyUsd(currentUser.balances.invested, lang)}</p>
            </div>
          </div>
        </div>

        {!hasWallet ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-amber-200 bg-amber-50/80 px-5 py-5">
            <p className="text-sm font-black text-amber-900">{t.walletNoWalletConfiguredTitle}</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">{t.walletNoWalletConfiguredDesc}</p>
            <button
              type="button"
              onClick={() => setCurrentView('settings')}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              {t.walletConfigureNow}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
             <div>
                <label className="text-sm text-gray-600 block mb-1">{t.walletWithdrawAmountLabel}</label>
                <input
                  type="number"
                  min="10"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                />
                <div className="mt-2 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">{t.walletCurrencyLabel}</label>
                    <select
                      value={withdrawAsset}
                      onChange={(e) => {
                        setWithdrawAsset(e.target.value);
                        setWithdrawCopyFeedback('');
                      }}
                      className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                    >
                      <option value="USDT">USDT</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">{t.walletNetworkLabel}</label>
                    {withdrawAsset === 'USDT' ? (
                      <select
                        value={withdrawNetwork}
                        onChange={(e) => {
                          setWithdrawNetwork(e.target.value);
                          setWithdrawCopyFeedback('');
                        }}
                        className="w-full p-3 border rounded-lg focus:ring-[#8A2BE2] outline-none"
                      >
                        <option value="BEP20">BEP-20</option>
                        <option value="TRC20">TRC-20</option>
                      </select>
                    ) : (
                      <select disabled value="ARBITRUM" className="w-full p-3 border rounded-lg opacity-70 cursor-not-allowed">
                        <option value="ARBITRUM">Arbitrum</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-col gap-3 min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletActiveWalletLabel}</p>
                      <p className="mt-2 break-all text-sm font-black text-gray-900">
                        {activeWithdrawAddress || t.walletActiveWalletMissing}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{t.walletActiveWalletHint}</p>
                    </div>
                    <button
                      type="button"
                      onClick={copyWithdrawAddress}
                      disabled={!activeWithdrawAddress}
                      className={`inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2 text-xs font-black transition-colors ${
                        activeWithdrawAddress
                          ? 'bg-slate-950 text-white hover:bg-slate-800'
                          : 'cursor-not-allowed bg-gray-200 text-gray-400'
                      }`}
                    >
                      {t.walletCopyAddressBtn}
                    </button>
                  </div>
                  {withdrawCopyFeedback ? (
                    <p className="mt-2 text-xs font-medium text-violet-700">{withdrawCopyFeedback}</p>
                  ) : null}
                </div>
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {(() => {
                    const calc = calcWithdrawNet({ amountUsd: Number(withdrawAmount || 0) });
                    return (
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <p className="text-gray-600">
                          {t.walletFeeFixedLabel} <span className="font-black text-gray-800">${WITHDRAW_FEE_USD}</span>
                        </p>
                        <p className="text-gray-600">
                          {t.walletYouReceiveLabel} <span className="font-black text-gray-900">{formatMoneyUsd(calc.netUsd, lang)}</span>
                        </p>
                      </div>
                    );
                  })()}
                </div>
             </div>
             <button
               type="button"
               onClick={submitWithdraw}
               className="w-full py-3 bg-[#8A2BE2] hover:bg-purple-600 text-white font-bold rounded-xl transition-colors"
             >
               {t.walletRequestWithdrawBtn}
             </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.pendingDeposits}</h3>
          <p className="text-sm text-gray-500 mt-1">{t.pendingDepositsHint}</p>
        </div>
        <div className="p-6 space-y-3">
          {pendingDeposits.length === 0 ? (
            <EmptyStateCard
              icon={Wallet}
              title={t.walletPendingEmptyTitle}
              description={t.walletPendingEmptyDesc}
            />
          ) : (
            pendingDeposits.slice(0, 10).map((tx) => (
              (() => {
                const snapshot = getDepositSnapshot(tx);
                const refs = getDepositReference(tx);
                const summary = getDepositSummary(tx);
                const canReopen = Boolean(snapshot || refs.paymentId || refs.invoiceId || refs.orderId);
                const checkoutReady = hasHostedCheckoutAvailable({
                  ...(snapshot || {}),
                  invoiceId: refs.invoiceId || snapshot?.invoiceId || '',
                });
                const reopenBusy = String(reopenBusyId || '') === String(tx.id || '');

                return (
                  <div key={tx.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 truncate">{translateTransactionType(tx.type, t)}</p>
                        <p className="text-xs text-gray-500 mt-1">{t.walletValueLabel}: <span className="font-black text-gray-800">{formatMoneyUsd(tx.amount, lang)}</span></p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge variant={checkoutReady ? 'success' : 'warning'}>
                            {checkoutReady ? t.walletHostedCheckoutAvailable : t.walletHostedCheckoutManualOnly}
                          </StatusBadge>
                        </div>
                      </div>
                      <StatusBadge>{getTransactionStatusLabel(tx, t, getStatusLabel)}</StatusBadge>
                    </div>

                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                      <div className="lg:col-span-8">
                        <InfoRow
                          label={t.depositCode}
                          value={getDepositDisplayReference(tx)}
                          className="mt-0 rounded-xl px-4 py-3"
                        />
                        {summary.hasSummary ? (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <InfoRow
                              label={t.walletPaymentAssetLabel}
                              value={summary.asset}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                            <InfoRow
                              label={t.walletPaymentNetworkLabel}
                              value={summary.network}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                            <InfoRow
                              label={t.walletPaymentValueShortLabel}
                              value={summary.value}
                              className="mt-0 rounded-xl px-4 py-3"
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="lg:col-span-4 grid grid-cols-1 gap-3">
                        <button
                          type="button"
                          disabled={!canReopen || reopenBusy || verifyBusy}
                          onClick={() => reopenDepositPayment(tx.id)}
                          className={`w-full px-4 py-3 rounded-xl font-black ${!canReopen || reopenBusy || verifyBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
                        >
                          {reopenBusy ? t.processing : checkoutReady ? t.walletOpenCheckoutBtn : t.walletViewPaymentDataBtn}
                        </button>
                        <button
                          type="button"
                          disabled={verifyBusy || reopenBusy || isSettledTransactionStatus(tx?.status)}
                          onClick={() => verifyDeposit(tx.id)}
                          className={`w-full px-4 py-3 rounded-xl font-black ${verifyBusy || reopenBusy || isSettledTransactionStatus(tx?.status) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
                        >
                          {t.refresh}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{t.walletMovementHistoryTitle}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">{t.walletTableDate}</th>
                <th className="p-4">{t.walletTableType}</th>
                <th className="p-4">{t.walletTableStatus}</th>
                <th className="p-4 text-right">{t.walletTableValue}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan="4">
                    <div className="mx-auto max-w-xl">
                      <EmptyStateCard
                        icon={FileText}
                        title={t.walletHistoryEmptyTitle}
                        description={t.walletHistoryEmptyDesc}
                        className="text-left"
                      />
                    </div>
                  </td>
                </tr>
              ) : reports.map((rep) => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><StatusBadge className="rounded text-xs px-2 py-1 font-normal">{rep.status}</StatusBadge></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>{rep.displayValue || rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.walletCyclesRenewalTitle}</h3>
            <p className="text-sm text-gray-500">{t.walletCyclesRenewalDesc}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletCancellationsInReview}</p>
            {cancelLots.length === 0 ? (
              <EmptyStateCard
                icon={FileText}
                title={t.walletReviewEmptyTitle}
                description={t.walletReviewEmptyDesc}
              />
            ) : (
              <div className="space-y-3">
                {cancelLots.map((l) => (
                  <div key={l.id} className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-800">{l.planTitle} x{l.units}</p>
                      <p className="text-xs text-gray-600">
                        {t.walletRefundExpected} {formatDateTime(l.cancelPayAt, lang)}
                      </p>
                      <p className="text-xs text-gray-600">{t.walletRemainingLabel} {Math.ceil(l.cancelLeftMs / (1000 * 60 * 60))}h</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600">{t.walletEstimatedValue}</p>
                      <p className="text-lg font-black text-gray-900">{formatMoneyUsd(l.cancelAmount, lang)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletRenewalAvailable}</p>
            {maturedLots.length === 0 ? (
              <EmptyStateCard
                icon={Wallet}
                title={t.walletRenewalEmptyTitle}
                description={t.walletRenewalEmptyDesc}
              />
            ) : (
              <div className="space-y-3">
                {maturedLots.map((l) => (
                  <div key={l.id} className="border border-yellow-200 bg-yellow-50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-800">{l.planTitle} x{l.units}</p>
                      <p className="text-xs text-gray-600">{t.walletDeadlineLabel} {formatDateTime(l.renewUntil, lang)}</p>
                      <p className="text-xs text-gray-600">{t.walletRemainingLabel} {Math.ceil(l.renewLeftMs / (1000 * 60 * 60))}h</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRenewModal({ open: true, lotId: l.id })}
                      className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
                    >
                      {t.walletRenewBtn}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-black text-gray-800 mb-3">{t.walletActiveCycles}</p>
            {activeLots.length === 0 ? (
              <EmptyStateCard
                icon={PieChart}
                title={t.walletCyclesEmptyTitle}
                description={t.walletCyclesEmptyDesc}
                ctaLabel={t.walletIncreaseEarningsCta}
                onCtaClick={() => setCurrentView('quotas')}
              />
            ) : (
              <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
                {activeLots.map((l) => (
                  <QuotaLotProgressCard
                    key={l.id}
                    lot={l}
                    lang={lang}
                    t={t}
                    onOpenDetails={(lot) => setLotDetailsModal({ open: true, lotId: lot.id })}
                    onRequestCancellation={(lot) => setDesistModal({ open: true, lotId: lot.id })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <QuotaLotEarningsModal
        open={lotDetailsModal.open}
        lot={lotDetails}
        lang={lang}
        t={t}
        onClose={() => setLotDetailsModal({ open: false, lotId: null })}
      />

      {renewModal.open && selectedLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRenewModal({ open: false, lotId: null })} />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#8A2BE2] overflow-hidden">
            <div className="p-5 bg-[#1A1A1A] text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-300">{t.walletRenewModalTitle}</p>
                <p className="text-lg font-black">{selectedLot.planTitle} x{selectedLot.units}</p>
              </div>
              <button type="button" onClick={() => setRenewModal({ open: false, lotId: null })} className="text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletValueLabel}</p>
                  <p className="text-sm font-black text-gray-800">{formatMoneyUsd(Number(selectedLot.planPrice || 0) * Number(selectedLot.units || 0), lang)}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {fillTemplate(t.walletRenewUntilLabel, { date: formatDateTime(selectedLot.renewUntil, lang) })}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
                  <label className="block text-xs font-black text-gray-700 mb-1">{t.walletPayMethodLabel}</label>
                  <select
                    value={renewPayment}
                    onChange={(e) => setRenewPayment(e.target.value)}
                    className="w-full p-2 border rounded-lg outline-none focus:ring-[#00FF00]"
                  >
                    <option value="SALDO">{t.quotasBalanceOption}</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                  </select>
                  {renewPayment === 'SALDO' && (
                    <p className="text-xs text-gray-500 mt-1">{t.quotasBalanceAvailable} <span className="font-black">{formatMoneyUsd(currentUser?.balances?.available, lang)}</span></p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{t.quotasBalanceAlwaysHint}</p>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1">{t.walletNetworkLabelShort}</label>
                  {renewPayment === 'USDT' ? (
                    <select
                      value={renewNetwork}
                      onChange={(e) => setRenewNetwork(e.target.value)}
                      className="w-full p-2 border rounded-lg outline-none focus:ring-[#00FF00]"
                    >
                      <option value="BEP20">BEP-20</option>
                      <option value="TRC20">TRC-20</option>
                    </select>
                  ) : (
                    <select
                      value={renewPayment === 'USDC' ? 'ARBITRUM' : ''}
                      disabled={renewPayment !== 'USDT'}
                      className="w-full p-2 border rounded-lg outline-none opacity-70 cursor-not-allowed"
                    >
                      <option value="">{renewPayment === 'SALDO' ? '—' : 'Arbitrum'}</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenewModal({ open: false, lotId: null })}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-black text-gray-700 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmRenew}
                  className="px-4 py-2 rounded-xl bg-[#00FF00] text-black font-black"
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {desistModal.open && desistLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDesistModal({ open: false, lotId: null })} />
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#8A2BE2] overflow-hidden">
            <div className="p-5 bg-[#1A1A1A] text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-300">{t.walletCancellationModalTitle}</p>
                <p className="text-lg font-black">{desistLot.planTitle} x{desistLot.units}</p>
              </div>
              <button type="button" onClick={() => setDesistModal({ open: false, lotId: null })} className="text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletQuotaValueLabel}</p>
                  <p className="text-sm font-black text-gray-800">{formatMoneyUsd(Number(desistLot.planPrice || 0) * Number(desistLot.units || 0), lang)}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletCancellationFeeLabel}</p>
                  <p className="text-sm font-black text-gray-800">
                    {Math.round(calcDesistPenaltyPct({ startAt: desistLot.startAt, now: new Date(), cycleMonths: adminConfig?.cycle?.months }) * 1000) / 10}%
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-gray-800">{t.walletAnalysisPeriodLabel}</p>
                  <p className="text-sm font-black text-gray-800">{DESIST_ANALYSIS_HOURS}h</p>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {t.walletCancellationConfirmHint}
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDesistModal({ open: false, lotId: null })}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-black text-gray-700 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
                <button type="button" onClick={confirmDesistance} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black">
                  {t.walletConfirmCancellationBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <NowpaymentsPaymentModal
        isOpen={paymentModal.open}
        payment={paymentModal.payment}
        t={t}
        onClose={() => setPaymentModal({ open: false, payment: null })}
      />
    </div>
  );
}
