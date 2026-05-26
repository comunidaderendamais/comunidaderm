import { useMemo, useState } from 'react';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
};

const PLAN_OPTIONS = [
  { value: 'cota10', label: 'COTA 10', unitPrice: 10 },
  { value: 'cota50', label: 'COTA 50', unitPrice: 50 },
  { value: 'cota100', label: 'COTA 100', unitPrice: 100 },
];

const buildFallbackSummary = (items) => {
  const safeItems = Array.isArray(items) ? items : [];
  return safeItems.reduce(
    (acc, item) => {
      const totalUsd = safeNum(item?.totalUsd || 0);
      const pendingUsd = safeNum(item?.pendingUsd || 0);
      const collectedUsd = safeNum(item?.collectedUsd || 0);
      const settled = String(item?.status || '').toUpperCase() === 'SETTLED';
      return {
        totalCount: acc.totalCount + 1,
        openCount: acc.openCount + (settled ? 0 : 1),
        settledCount: acc.settledCount + (settled ? 1 : 0),
        totalUsd: acc.totalUsd + totalUsd,
        pendingUsd: acc.pendingUsd + pendingUsd,
        collectedUsd: acc.collectedUsd + collectedUsd,
      };
    },
    { totalCount: 0, openCount: 0, settledCount: 0, totalUsd: 0, pendingUsd: 0, collectedUsd: 0 }
  );
};

export default function AdminUserSponsorshipPanel({ user, transactions, onGrantSponsorship, busy = false }) {
  const [planKey, setPlanKey] = useState('cota10');
  const [units, setUnits] = useState(1);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState(null);

  const sponsorshipRoot = user?.teamState?.sponsorship || {};
  const items = useMemo(() => {
    const raw = Array.isArray(sponsorshipRoot?.items) ? sponsorshipRoot.items : [];
    return raw
      .slice()
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
  }, [sponsorshipRoot]);

  const summary = useMemo(() => {
    const raw = sponsorshipRoot?.summary || null;
    if (raw && typeof raw === 'object') return raw;
    return buildFallbackSummary(items);
  }, [sponsorshipRoot, items]);

  const abatementRows = useMemo(() => {
    return (Array.isArray(transactions) ? transactions : [])
      .filter((tx) => ['PATROCINIO_ABATE', 'PATROCINIO_QUITADO', 'PATROCINIO_CREATE'].includes(String(tx?.kind || '').toUpperCase()))
      .slice()
      .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')));
  }, [transactions]);

  const selectedPlan = PLAN_OPTIONS.find((plan) => plan.value === planKey) || PLAN_OPTIONS[0];
  const estimatedTotal = safeNum(units || 0) * safeNum(selectedPlan?.unitPrice || 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    const nextUnits = Math.max(1, Math.min(100, Math.floor(safeNum(units || 1))));
    const res = await onGrantSponsorship?.({
      planKey,
      units: nextUnits,
      note: String(note || '').trim(),
    });
    if (res?.ok) {
      setUnits(1);
      setNote('');
      setFeedback({ type: 'success', message: 'Patrocínio lançado com sucesso.' });
      return;
    }
    setFeedback({ type: 'error', message: res?.error || 'Não foi possível criar o patrocínio.' });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <p className="text-sm font-black text-gray-900">Patrocínio de cotas</p>
        <p className="text-xs text-gray-500 mt-1">Ativa a cota imediatamente e quita apenas com ganhos de rede (`TE` + `RESIDUAL`).</p>
      </div>

      <div className="p-5 space-y-5">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3">
              <label className="block text-xs font-black text-gray-600">Plano</label>
              <select
                value={planKey}
                onChange={(e) => setPlanKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
              >
                {PLAN_OPTIONS.map((plan) => (
                  <option key={plan.value} value={plan.value}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-black text-gray-600">Unidades</label>
              <input
                type="number"
                min="1"
                max="100"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
              />
            </div>

            <div className="lg:col-span-5">
              <label className="block text-xs font-black text-gray-600">Observação</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: ação promocional, suporte, campanha..."
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-black text-gray-600">Valor</label>
              <div className="mt-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900">
                {formatMoney(estimatedTotal)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-3">
            <p className="text-xs text-gray-500">Abatimento automático em FIFO, usando somente `TE` e `RESIDUAL` do próprio usuário.</p>
            <button
              type="submit"
              disabled={busy}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                busy ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:brightness-95'
              }`}
            >
              {busy ? 'Lançando...' : 'Criar patrocínio'}
            </button>
          </div>

          {feedback && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </form>

        <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-500">Total patrocinado</p>
            <p className="mt-1 text-xl font-black text-gray-900">{formatMoney(summary?.totalUsd || 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-500">Pendente</p>
            <p className="mt-1 text-xl font-black text-amber-600">{formatMoney(summary?.pendingUsd || 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-500">Quitado</p>
            <p className="mt-1 text-xl font-black text-emerald-700">{formatMoney(summary?.collectedUsd || 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-500">Em aberto</p>
            <p className="mt-1 text-xl font-black text-gray-900">{safeNum(summary?.openCount || 0)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum patrocínio registrado para este usuário.</p>
          ) : (
            items.map((item) => {
              const itemAbatements = abatementRows.filter((tx) => String(tx?.meta?.meta?.sponsorshipId || tx?.meta?.sponsorshipId || '') === String(item?.id || ''));
              const settled = String(item?.status || '').toUpperCase() === 'SETTLED';
              return (
                <div key={String(item?.id || item?.lotId || item?.createdAt || item?.planKey || 'sponsorship-item')} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-900">
                        {item?.planTitle || item?.planKey || 'Patrocínio'} • {safeNum(item?.units || 0)} unidade(s)
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Criado em {item?.createdAt ? formatDate(item.createdAt) : '—'} • lote {item?.lotId || '—'}
                      </p>
                      {item?.note && <p className="mt-1 text-xs text-gray-500">Obs.: {item.note}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black whitespace-nowrap ${
                        settled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {settled ? 'QUITADO' : 'EM ABERTO'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Total</p>
                      <p className="mt-1 text-sm font-black text-gray-900">{formatMoney(item?.totalUsd || 0)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Pendente</p>
                      <p className="mt-1 text-sm font-black text-amber-600">{formatMoney(item?.pendingUsd || 0)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Abatido</p>
                      <p className="mt-1 text-sm font-black text-emerald-700">{formatMoney(item?.collectedUsd || 0)}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    Fontes elegíveis: {(Array.isArray(item?.eligibleKinds) ? item.eligibleKinds : ['TE', 'RESIDUAL']).join(' + ')}
                    {item?.settledAt ? ` • Quitado em ${formatDate(item.settledAt)}` : ''}
                  </p>

                  <div className="mt-3 space-y-2">
                    {itemAbatements.length === 0 ? (
                      <p className="text-xs text-gray-500">Sem abatimentos registrados ainda.</p>
                    ) : (
                      itemAbatements.slice(0, 5).map((tx) => {
                        const meta = tx?.meta?.meta || tx?.meta || {};
                        const sourceKind = meta?.sourceKind || meta?.settledBySourceKind || tx?.payment || '—';
                        const sourceExternalId = meta?.sourceExternalId || meta?.settledBySourceExternalId || '—';
                        return (
                          <div key={tx?.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-black text-gray-800">{tx?.type || tx?.kind}</p>
                              <span className="text-xs font-black text-gray-600">{tx?.at ? formatDate(tx.at) : '—'}</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              Origem: <span className="font-black text-gray-800">{sourceKind}</span> • Ref: <span className="font-black text-gray-800">{sourceExternalId}</span>
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Valor: <span className="font-black text-gray-800">{formatMoney(Math.abs(safeNum(tx?.amount || 0)))}</span>
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
