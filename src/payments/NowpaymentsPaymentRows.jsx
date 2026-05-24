import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';

import InfoRow from '../components/ui/InfoRow.jsx';
import { copyText } from './nowpaymentsPresentation.js';

export default function NowpaymentsPaymentRows({ rows, warnings }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const primaryRows = useMemo(() => rows.filter((row) => row.section !== 'technical'), [rows]);
  const technicalRows = useMemo(() => rows.filter((row) => row.section === 'technical'), [rows]);

  const renderRow = (row) => (
    <InfoRow
      key={row.label}
      label={
        row.label === 'Endereço' ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Endereço</span>
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
              Dado para pagamento
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
          <button
            type="button"
            onClick={() => void copyText(row.copy)}
            className={`w-full sm:w-auto rounded-xl px-3 py-2 text-sm font-black inline-flex items-center justify-center gap-2 ${
              row.label === 'Endereço'
                ? 'border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Copy size={16} />
            {row.actionLabel || 'Copiar'}
          </button>
        ) : null
      }
    />
  );

  return (
    <div className="space-y-4">
      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm text-yellow-800">
          O checkout oficial não ficou disponível nesta cobrança. Os dados manuais continuam válidos para pagamento.
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
        Confirme primeiro a rede, o valor e o endereco. Os identificadores tecnicos da cobranca ficam abaixo apenas para suporte e conferencia.
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
              <p className="text-sm font-black text-gray-900">Detalhes tecnicos da cobranca</p>
              <p className="mt-1 text-xs text-gray-500">Invoice ID, Order ID e Payment ID para auditoria ou suporte.</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-black text-gray-700">
              {showTechnical ? 'Ocultar' : 'Revelar'}
              {showTechnical ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {showTechnical ? <div className="space-y-4 border-t border-gray-100 p-4">{technicalRows.map(renderRow)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
