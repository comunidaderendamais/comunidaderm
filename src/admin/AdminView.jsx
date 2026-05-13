import { useMemo, useState } from 'react';
import { BANK_STATUS } from './adminStorage';

const statusOptions = [
  { value: BANK_STATUS.active, label: 'Ativa' },
  { value: BANK_STATUS.upcoming, label: 'Em breve' },
  { value: BANK_STATUS.closed, label: 'Fechada' },
];

const formatMoney = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function AdminView({ config, onSave }) {
  const [draft, setDraft] = useState(config);

  const banks = useMemo(() => Object.values(draft?.banks || {}), [draft]);

  const updateBank = (id, patch) => {
    setDraft((s) => ({
      ...s,
      banks: {
        ...s.banks,
        [id]: { ...s.banks[id], ...patch },
      },
    }));
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#8A2BE2] text-white">
        <p className="text-xs font-bold tracking-widest text-[#00FF00]">PAINEL ADMIN</p>
        <h2 className="text-2xl font-black mt-2">Controle de Bancas</h2>
        <p className="text-sm text-gray-300 mt-2">Defina quais bancas estão ativas e o limite (USD) de cada uma.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {banks.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-gray-800 truncate">{b.name}</h3>
                <p className="text-xs text-gray-500">Vinculada: {b.quotaKey.toUpperCase()}</p>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-600">
                {statusOptions.find((s) => s.value === b.status)?.label || b.status}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select
                  value={b.status}
                  onChange={(e) => updateBank(b.id, { status: e.target.value })}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Limite (USD)</label>
                <input
                  type="number"
                  min="0"
                  value={b.limit}
                  onChange={(e) => updateBank(b.id, { limit: Number(e.target.value || 0) })}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Atual: <span className="font-bold">{formatMoney(b.limit)}</span></p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
        <button
          onClick={() => setDraft(config)}
          className="px-5 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50"
        >
          Reverter
        </button>
        <button
          onClick={() => onSave(draft)}
          className="px-6 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400"
        >
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

