import { useEffect, useMemo, useState } from 'react';
import InlineFeedbackCard from '../components/ui/InlineFeedbackCard.jsx';
import { getQuotaPlanPresentation } from '../quota/quotaPresentation.js';
import {
  adminCancelDailyPayoutOverride,
  adminListDailyPayoutOverrideEvents,
  adminListDailyPayoutOverrides,
  adminUpsertDailyPayoutOverride,
} from '../supabase/adminRepo.js';

const formatPct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`;
const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
};
const formatDateInput = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AdminDailyPayoutOverridePanel({ banks = [] }) {
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [drafts, setDrafts] = useState(() => ({}));

  const loadData = async () => {
    const [rowsRes, eventsRes] = await Promise.all([
      adminListDailyPayoutOverrides({ maxRows: 120 }),
      adminListDailyPayoutOverrideEvents({ maxRows: 120 }),
    ]);
    if (rowsRes.ok) setRows(rowsRes.rows);
    if (eventsRes.ok) setEvents(eventsRes.rows);
    if (!rowsRes.ok || !eventsRes.ok) {
      setFeedback({
        tone: 'error',
        title: 'Falha ao carregar exceções diárias',
        message: rowsRes.error || eventsRes.error || 'Não foi possível buscar os dados do Supabase.',
      });
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!banks.length) return;
    setDrafts((current) => {
      const next = { ...current };
      banks.forEach((bank) => {
        if (!next[bank.id]) {
          const plan = getQuotaPlanPresentation({ planKey: bank.quotaKey });
          next[bank.id] = {
            targetYmd: formatDateInput(new Date()),
            overrideDailyPct: String(plan.dailyPct || ''),
            note: '',
          };
        }
      });
      return next;
    });
  }, [banks]);

  const scheduledMap = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const key = `${row.bank_id}::${row.target_ymd}`;
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    return map;
  }, [rows]);

  const handleDraftChange = (bankId, patch) => {
    setDrafts((current) => ({
      ...current,
      [bankId]: {
        ...(current[bankId] || {}),
        ...patch,
      },
    }));
  };

  const submitOverride = async (bank) => {
    const draft = drafts[bank.id] || {};
    const overrideDailyPct = Number(draft.overrideDailyPct || 0);
    if (!draft.targetYmd || !Number.isFinite(overrideDailyPct) || overrideDailyPct <= 0) {
      setFeedback({
        tone: 'error',
        title: 'Preencha os dados da rodada',
        message: 'Informe a data da rodada e a taxa diária excepcional em percentual.',
      });
      return;
    }

    try {
      setBusyKey(`save:${bank.id}`);
      setFeedback(null);
      const res = await adminUpsertDailyPayoutOverride({
        bankId: bank.id,
        targetYmd: draft.targetYmd,
        overrideDailyPct,
        note: draft.note,
      });
      if (!res.ok) {
        setFeedback({
          tone: 'error',
          title: 'Não foi possível agendar a exceção',
          message: res.error || 'Erro ao salvar no Supabase.',
        });
        return;
      }
      setFeedback({
        tone: 'success',
        title: 'Exceção diária salva',
        message: `${bank.name} terá ${overrideDailyPct}% na rodada das 18h de ${draft.targetYmd}. Depois disso, volta automaticamente à taxa fixa.`,
      });
      await loadData();
    } finally {
      setBusyKey('');
    }
  };

  const cancelOverride = async (row) => {
    try {
      setBusyKey(`cancel:${row.id}`);
      setFeedback(null);
      const res = await adminCancelDailyPayoutOverride({
        overrideId: row.id,
        reason: `Cancelado pelo Admin em ${new Date().toISOString()}`,
      });
      if (!res.ok) {
        setFeedback({
          tone: 'error',
          title: 'Não foi possível cancelar a exceção',
          message: res.error || 'Erro ao cancelar no Supabase.',
        });
        return;
      }
      setFeedback({
        tone: 'info',
        title: 'Exceção cancelada',
        message: `${row.bank_name} voltou a aguardar a taxa fixa para ${row.target_ymd}.`,
      });
      await loadData();
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-gray-800">Exceção diária das 18h</h3>
          <p className="text-sm text-gray-500 mt-1">
            Permite alterar somente a rodada do dia por banca/cota. Após o processamento, a regra volta automaticamente para a taxa fixa.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Regra operacional</p>
          <p className="mt-1 text-sm text-amber-800">Cadastre ou ajuste a exceção antes da divulgação das 18h para que a rotina server-side use a taxa excepcional na rodada certa.</p>
        </div>
      </div>

      {feedback && (
        <div className="mt-5">
          <InlineFeedbackCard tone={feedback.tone} title={feedback.title} message={feedback.message} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {banks.map((bank) => {
          const plan = getQuotaPlanPresentation({ planKey: bank.quotaKey });
          const draft = drafts[bank.id] || {};
          const key = `${bank.id}::${draft.targetYmd || ''}`;
          const scheduled = (scheduledMap[key] || []).find((row) => row.status === 'SCHEDULED') || null;
          const saveBusy = busyKey === `save:${bank.id}`;
          const cancelBusy = scheduled && busyKey === `cancel:${scheduled.id}`;

          return (
            <div key={bank.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-gray-900">{bank.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{String(bank.quotaKey || '').toUpperCase()} • taxa fixa {formatPct(plan.dailyPct)}</p>
                </div>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                  Rodada 18h
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Data da rodada</label>
                  <input
                    type="date"
                    value={draft.targetYmd || ''}
                    onChange={(e) => handleDraftChange(bank.id, { targetYmd: e.target.value })}
                    className="w-full p-3 bg-white border rounded-lg focus:ring-[#00FF00] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Taxa excepcional (%)</label>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={draft.overrideDailyPct || ''}
                    onChange={(e) => handleDraftChange(bank.id, { overrideDailyPct: e.target.value })}
                    className="w-full p-3 bg-white border rounded-lg focus:ring-[#00FF00] outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Exemplo: para trocar `1%` por `1,5%`, informe `1.5`.</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Observação</label>
                  <input
                    type="text"
                    value={draft.note || ''}
                    onChange={(e) => handleDraftChange(bank.id, { note: e.target.value })}
                    placeholder="Motivo interno da exceção"
                    className="w-full p-3 bg-white border rounded-lg focus:ring-[#00FF00] outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => submitOverride(bank)}
                  disabled={saveBusy}
                  className={`w-full px-4 py-3 rounded-xl font-black ${saveBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
                >
                  {saveBusy ? 'Salvando...' : 'Salvar exceção da rodada'}
                </button>
                {scheduled && (
                  <button
                    type="button"
                    onClick={() => cancelOverride(scheduled)}
                    disabled={cancelBusy}
                    className={`w-full px-4 py-3 rounded-xl font-black ${cancelBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'border border-red-200 bg-white text-red-600 hover:bg-red-50'}`}
                  >
                    {cancelBusy ? 'Cancelando...' : 'Cancelar exceção agendada'}
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Taxa fixa</p>
                  <p className="mt-1 text-sm font-black text-gray-900">{formatPct(plan.dailyPct)}</p>
                </div>
                {scheduled ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Agendada</p>
                    <p className="mt-1 text-sm font-black text-emerald-900">
                      {formatPct(scheduled.override_daily_pct)} em {scheduled.target_ymd}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800">{scheduled.note || 'Sem observação.'}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Status atual</p>
                    <p className="mt-1 text-sm font-black text-gray-900">Sem exceção agendada para a data selecionada</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-black text-gray-900">Trilha das exceções</p>
            <p className="text-xs text-gray-500 mt-1">Agendações, usos automáticos, cancelamentos e expirações.</p>
          </div>
          <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma exceção registrada ainda.</p>
            ) : (
              rows.slice(0, 20).map((row) => (
                <div key={row.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900">{row.bank_name} • {String(row.quota_key || '').toUpperCase()}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {row.target_ymd} • {formatPct(row.base_daily_pct)} → {formatPct(row.override_daily_pct)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black whitespace-nowrap ${row.status === 'APPLIED' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : row.status === 'SCHEDULED' ? 'bg-blue-50 border border-blue-200 text-blue-700' : row.status === 'CANCELLED' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{row.note || 'Sem observação.'}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Criado em {formatDateTime(row.created_at)}
                    {row.applied_at ? ` • Aplicado em ${formatDateTime(row.applied_at)}` : ''}
                    {row.applied_override_amount_usd ? ` • Total extra ${formatMoney(row.applied_override_amount_usd)}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-black text-gray-900">Eventos auditáveis</p>
            <p className="text-xs text-gray-500 mt-1">Cada ação administrativa e aplicação automática da rodada fica registrada.</p>
          </div>
          <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum evento encontrado.</p>
            ) : (
              events.slice(0, 24).map((event) => (
                <div key={event.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900">{event.bank_name} • {String(event.quota_key || '').toUpperCase()}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {event.actor_username || event.actor_email || 'Sistema'} • {formatDateTime(event.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                      {event.event_kind}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Taxa base {formatPct(event.payload?.baseDailyPct)} • taxa usada {formatPct(event.payload?.overrideDailyPct)} • dia {event.payload?.targetYmd || '—'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
