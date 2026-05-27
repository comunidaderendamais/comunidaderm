import { ChevronDown, ChevronUp, Copy, ExternalLink, QrCode, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import InfoRow from '../components/ui/InfoRow.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { buildQrValue, copyText, getPaymentRows, getPaymentWarningMessages, normalizeNowpaymentsPayment } from './nowpaymentsPresentation.js';

function NowpaymentsPaymentModalHeader({ hasHostedCheckout, onClose, t }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 shrink-0">
      <div>
        <p className="text-xs font-black tracking-[0.18em] text-[#8A2BE2]">NOWPAYMENTS</p>
        <h3 className="text-lg sm:text-xl font-black text-gray-900 mt-1">{t.nowpaymentsModalTitle}</h3>
        <p className="text-sm text-gray-500 mt-1">{t.nowpaymentsModalSubtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge variant={hasHostedCheckout ? 'success' : 'warning'}>
            {hasHostedCheckout ? t.nowpaymentsHostedBadge : t.nowpaymentsManualBadge}
          </StatusBadge>
        </div>
      </div>
      <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 shrink-0">
        <X size={20} />
      </button>
    </div>
  );
}

function NowpaymentsQrPanel({ payment, hasHostedCheckout, t }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const qrValue = useMemo(() => buildQrValue(payment), [payment]);

  useEffect(() => {
    let cancelled = false;
    const qrCodeUrl = String(payment?.qrCodeUrl || '').trim();

    if (qrCodeUrl) {
      setQrDataUrl(qrCodeUrl);
      return () => {
        cancelled = true;
      };
    }

    if (!qrValue) {
      setQrDataUrl('');
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(qrValue, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [payment, qrValue]);

  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-gray-800">
        <QrCode size={18} />
        <p className="text-sm font-black">{t.nowpaymentsQrTitle}</p>
      </div>
      <div className="mt-4 rounded-2xl bg-white border border-gray-200 p-3 sm:p-4 flex items-center justify-center min-h-[220px] sm:min-h-[252px]">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={t.nowpaymentsQrAlt} className="w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] object-contain" />
        ) : (
          <p className="text-sm text-center text-gray-500">{t.nowpaymentsQrUnavailable}</p>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {hasHostedCheckout ? t.nowpaymentsQrHostedHint : t.nowpaymentsQrManualHint}
      </p>
    </div>
  );
}

function NowpaymentsPaymentRows({ rows, warnings, t }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const primaryRows = useMemo(() => rows.filter((row) => row.section !== 'technical'), [rows]);
  const technicalRows = useMemo(() => rows.filter((row) => row.section === 'technical'), [rows]);
  const warningMessages = useMemo(() => getPaymentWarningMessages(warnings, t), [warnings, t]);

  useEffect(() => {
    if (!copiedKey) return undefined;
    const timer = window.setTimeout(() => setCopiedKey(''), 1000);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const handleCopy = async (row) => {
    const ok = await copyText(row.copy);
    if (!ok) return;
    setCopiedKey(String(row.key || row.label || 'copied'));
  };

  const renderRow = (row) => (
    <InfoRow
      key={row.key || row.label}
      label={
        row.key === 'address' ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{row.label}</span>
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
              {t.nowpaymentsPaymentDataBadge}
            </span>
          </span>
        ) : (
          row.label
        )
      }
      value={row.value}
      hint={row.hint}
      className={row.className || ''}
      valueClassName={row.valueClassName || ''}
      action={
        row.copy ? (
          (() => {
            const rowKey = String(row.key || row.label || '');
            const isCopied = copiedKey === rowKey;
            const isPaymentAddress = row.copyKind === 'paymentAddress';
            const label = isCopied
              ? (isPaymentAddress ? t.paymentCopiedAddressBtn : t.paymentCopiedBtn)
              : (isPaymentAddress ? t.paymentCopyAddressBtn : t.paymentCopyBtn);
            const buttonClassName = isPaymentAddress
              ? isCopied
                ? 'border border-violet-300 bg-[#8A2BE2] text-white hover:bg-[#7a1fd1]'
                : 'border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
              : isCopied
                ? 'border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50';

            return (
              <button
                type="button"
                onClick={() => void handleCopy(row)}
                className={`w-full sm:w-auto rounded-xl px-3 py-2 text-sm font-black inline-flex items-center justify-center gap-2 transition-colors ${buttonClassName}`}
              >
                <Copy size={16} />
                {label}
              </button>
            );
          })()
        ) : null
      }
    />
  );

  return (
    <div className="space-y-4">
      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm text-yellow-800">
          <p>{t.nowpaymentsWarningsBanner}</p>
          {warningMessages.length > 0 ? (
            <div className="mt-2 space-y-1 text-xs text-yellow-900">
              {warningMessages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
        {t.nowpaymentsConfirmBanner}
      </div>

      {primaryRows.map(renderRow)}

      {technicalRows.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setShowTechnical((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div>
              <p className="text-sm font-black text-gray-900">{t.nowpaymentsTechnicalTitle}</p>
              <p className="mt-1 text-xs text-gray-500">{t.nowpaymentsTechnicalSubtitle}</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-black text-gray-700">
              {showTechnical ? t.nowpaymentsHideTechnicalBtn : t.nowpaymentsShowTechnicalBtn}
              {showTechnical ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {showTechnical ? <div className="space-y-4 border-t border-gray-100 p-4">{technicalRows.map(renderRow)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function NowpaymentsPaymentFooterAction({ checkoutUrl, t }) {
  if (!checkoutUrl) return null;

  return (
    <a
      href={checkoutUrl}
      target="_blank"
      rel="noreferrer"
      className="xl:col-span-2 sticky bottom-0 w-full rounded-2xl bg-[#00FF00] px-4 sm:px-5 py-4 text-center text-black font-black inline-flex items-center justify-center gap-2 shadow-[0_-6px_18px_rgba(255,255,255,0.85)]"
    >
      <ExternalLink size={18} />
      {t.nowpaymentsOpenCheckoutBtn}
    </a>
  );
}

export default function NowpaymentsPaymentModal({ isOpen, payment, onClose, t }) {
  if (!isOpen || !payment) return null;

  const currentPayment = normalizeNowpaymentsPayment(payment);
  const hasHostedCheckout = Boolean(String(currentPayment?.checkoutUrl || '').trim());
  const warnings = Array.isArray(currentPayment?.warnings) ? currentPayment.warnings : [];
  const rows = getPaymentRows(currentPayment, t);

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/70 p-3 sm:p-4">
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="my-3 sm:my-6 w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col">
          <NowpaymentsPaymentModalHeader hasHostedCheckout={hasHostedCheckout} onClose={onClose} t={t} />

          <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 sm:gap-6">
              <NowpaymentsQrPanel payment={currentPayment} hasHostedCheckout={hasHostedCheckout} t={t} />
              <NowpaymentsPaymentRows rows={rows} warnings={warnings} t={t} />
              <NowpaymentsPaymentFooterAction checkoutUrl={currentPayment.checkoutUrl} t={t} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
