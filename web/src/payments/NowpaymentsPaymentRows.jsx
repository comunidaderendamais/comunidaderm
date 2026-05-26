import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import InfoRow from '../components/ui/InfoRow.jsx';
import { copyText, getPaymentWarningMessages } from './nowpaymentsPresentation.js';

export default function NowpaymentsPaymentRows({ rows, warnings, t }) {
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
