import { Copy } from 'lucide-react';

import InfoRow from '../components/ui/InfoRow.jsx';
import { copyText } from './nowpaymentsPresentation.js';

export default function NowpaymentsPaymentRows({ rows, warnings }) {
  return (
    <div className="space-y-4">
      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm text-yellow-800">
          O checkout oficial não ficou disponível nesta cobrança. Os dados manuais continuam válidos para pagamento.
        </div>
      ) : null}

      {rows.map((row) => (
        <InfoRow
          key={row.label}
          label={row.label}
          value={row.value}
          hint={row.hint}
          action={
            row.copy ? (
              <button
                type="button"
                onClick={() => void copyText(row.copy)}
                className="w-full sm:w-auto rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-black text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-2"
              >
                <Copy size={16} />
                Copiar
              </button>
            ) : null
          }
        />
      ))}
    </div>
  );
}
