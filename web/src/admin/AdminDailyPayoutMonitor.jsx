import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import InlineFeedbackCard from '../components/ui/InlineFeedbackCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { adminDailyPayoutMonitor, adminRunDailyPayout } from '../supabase/adminRepo.js';

const AUTO_REFRESH_MS = 30000;

const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
};
const formatPct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`;
const formatDateInput = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const buildRunAtForTargetDay = (targetDay) => {
  const day = String(targetDay || '').trim();
  return day ? `${day}T21:00:00Z` : new Date().toISOString();
};
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch {
    return false;
  }
};

const SQL_SNIPPETS = {
  activeLots: `select
  coalesce(nullif(lot->>'bankId', ''), 'sem-bankId') as bank_id,
  lower(coalesce(lot->>'planKey', '')) as quota_key,
  count(*) as lots_count
from public.profiles p
cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
where lot->>'status' = 'ACTIVE'
  and now() >= nullif(lot->>'startAt', '')::timestamptz
  and now() < nullif(lot->>'endAt', '')::timestamptz
group by 1, 2
order by 2, 1;`,
  overrides: `select
  bank_id,
  quota_key,
  target_ymd,
  status,
  base_daily_pct,
  override_daily_pct,
  applied_lots_count,
  applied_override_amount_usd
from public.daily_payout_overrides
where target_ymd in (
  (now() at time zone 'America/Sao_Paulo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day')::date
)
order by target_ymd desc, bank_id asc, quota_key asc;`,
  daily: `select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  t.meta #>> '{meta,bankId}' as bank_id,
  t.meta #>> '{meta,quotaKey}' as quota_key,
  t.meta #>> '{meta,effectiveDailyPct}' as effective_daily_pct,
  t.meta #>> '{meta,overrideApplied}' as override_applied
from public.transactions t
where t.kind = 'DAILY'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by t.at desc, t.profile_id asc;`,
};

const getIndicator = ({ ok, warn, dangerTitle, warnTitle, okTitle, detail }) => {
  if (!ok) return { variant: 'danger', title: dangerTitle, detail };
  if (warn) return { variant: 'warning', title: warnTitle, detail };
  return { variant: 'success', title: okTitle, detail };
};

function MonitorStatCard({ label, value, helper, indicator }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-gray-900">{value}</p>
          {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
        </div>
        <StatusBadge variant={indicator.variant}>{indicator.title}</StatusBadge>
      </div>
      {indicator.detail ? <p className="mt-3 text-xs text-gray-600">{indicator.detail}</p> : null}
    </div>
  );
}

export default function AdminDailyPayoutMonitor() {
  const [targetDay, setTargetDay] = useState(() => formatDateInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  const loadMonitor = async () => {
    try {
      setBusy(true);
      const res = await adminDailyPayoutMonitor({ targetDay });
      if (!res.ok) {
        setFeedback({
          variant: 'danger',
          title: 'Falha ao carregar o monitor',
          message: res.error || 'Não foi possível obter o resumo da rodada.',
        });
        return;
      }
      setSnapshot(res.data || null);
      setFeedback(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadMonitor();
  }, [targetDay]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void loadMonitor();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, targetDay]);

  const activeItems = Array.isArray(snapshot?.activeLots?.items) ? snapshot.activeLots.items : [];
  const dailyItems = Array.isArray(snapshot?.daily?.items) ? snapshot.daily.items : [];
  const overrideItems = Array.isArray(snapshot?.overrides?.items) ? snapshot.overrides.items : [];
  const runAudits = Array.isArray(snapshot?.runAudits) ? snapshot.runAudits : [];
  const latestEvent = snapshot?.latestEvent || {};
  const latestRun = snapshot?.latestRun || {};
  const dayAudit = runAudits.find((item) => String(item?.run_day || '') === String(targetDay || '')) || null;
  const successfulRunForDay =
    runAudits.find((item) => String(item?.run_day || '') === String(targetDay || '') && String(item?.status || '').toUpperCase() === 'SUCCESS') || null;
  const runLocked = Boolean(successfulRunForDay);
  const dayStatusBadge = successfulRunForDay
    ? {
        variant: 'success',
        label: 'Fechado com sucesso',
      }
    : String(dayAudit?.status || '').toUpperCase() === 'ERROR'
      ? {
          variant: 'danger',
          label: 'Falha na rodada',
        }
      : String(dayAudit?.status || '').toUpperCase() === 'RUNNING'
        ? {
            variant: 'warning',
            label: 'Rodada em execução',
          }
        : {
            variant: 'warning',
            label: 'Aguardando rodada',
          };

  const cards = useMemo(() => {
    const activeLots = Number(snapshot?.activeLots?.totalLots || 0);
    const activeUnits = Number(snapshot?.activeLots?.totalUnits || 0);
    const dailyCount = Number(snapshot?.daily?.count || 0);
    const dailyTotal = Number(snapshot?.daily?.totalUsd || 0);
    const residualCount = Number(snapshot?.residual?.count || 0);
    const residualTotal = Number(snapshot?.residual?.totalUsd || 0);
    const todayScheduled = Number(snapshot?.overrides?.todayScheduled || 0);
    const todayApplied = Number(snapshot?.overrides?.todayApplied || 0);
    const previousExpired = Number(snapshot?.overrides?.previousExpired || 0);

    return [
      {
        label: 'Lotes ativos',
        value: String(activeLots),
        helper: `${activeUnits} unidades ativas no momento`,
        indicator: getIndicator({
          ok: activeLots > 0,
          warn: false,
          dangerTitle: 'Vermelho',
          warnTitle: 'Amarelo',
          okTitle: 'Verde',
          detail: activeLots > 0 ? 'Existe base real para a rodada do dia.' : 'Nenhum lote ativo encontrado agora. Se isso não for esperado, revisar antes das 18h.',
        }),
      },
      {
        label: 'Overrides do dia',
        value: String(todayScheduled + todayApplied),
        helper: `${todayScheduled} agendados • ${todayApplied} aplicados`,
        indicator: getIndicator({
          ok: true,
          warn: todayScheduled > 0 && todayApplied === 0,
          dangerTitle: 'Vermelho',
          warnTitle: 'Amarelo',
          okTitle: 'Verde',
          detail: todayScheduled > 0
            ? 'Existe exceção do dia em aberto ou aguardando uso. Confirmar banca, cota e percentual.'
            : 'Nenhuma exceção do dia cadastrada. A rodada tende a seguir somente com taxa fixa.',
        }),
      },
      {
        label: 'Ganhos DAILY',
        value: formatMoney(dailyTotal),
        helper: `${dailyCount} transações no dia`,
        indicator: getIndicator({
          ok: activeLots === 0 || dailyCount > 0,
          warn: activeLots > 0 && dailyCount === 0,
          dangerTitle: 'Vermelho',
          warnTitle: 'Amarelo',
          okTitle: 'Verde',
          detail: dailyCount > 0
            ? `Último crédito em ${snapshot?.daily?.lastAt ? formatDateTime(snapshot.daily.lastAt) : '—'}.`
            : 'Sem DAILY no dia ainda. Isso é esperado antes da rodada; depois das 18h deve ser revisado.',
        }),
      },
      {
        label: 'Residual',
        value: formatMoney(residualTotal),
        helper: `${residualCount} transações no dia`,
        indicator: getIndicator({
          ok: dailyCount === 0 || residualCount >= 0,
          warn: dailyCount > 0 && residualCount === 0,
          dangerTitle: 'Vermelho',
          warnTitle: 'Amarelo',
          okTitle: 'Verde',
          detail: residualCount > 0
            ? `Último residual em ${snapshot?.residual?.lastAt ? formatDateTime(snapshot.residual.lastAt) : '—'}.`
            : 'Residual zerado. Pode ser normal se não houver uplines válidas, mas merece conferência após a primeira rodada real.',
        }),
      },
      {
        label: 'Expiração anterior',
        value: String(previousExpired),
        helper: 'Overrides vencidos do dia anterior',
        indicator: getIndicator({
          ok: true,
          warn: previousExpired > 0,
          dangerTitle: 'Vermelho',
          warnTitle: 'Amarelo',
          okTitle: 'Verde',
          detail: previousExpired > 0
            ? 'Há overrides anteriores expirados sem uso. Conferir se isso era esperado.'
            : 'Nenhuma exceção do dia anterior ficou pendente sem uso.',
        }),
      },
    ];
  }, [snapshot]);

  const handleCopy = async (label, sql) => {
    const ok = await copyToClipboard(sql);
    setCopyFeedback(ok ? `SQL copiado: ${label}` : `Falha ao copiar: ${label}`);
    window.setTimeout(() => setCopyFeedback(''), 2000);
  };

  const executeRun = async ({ replay = false } = {}) => {
    const triggerSource = replay ? 'MANUAL_REPLAY' : 'ADMIN_BUTTON';
    const confirmed = window.confirm(
      replay
        ? `Confirma o replay da rotina DAILY da data ${targetDay}?\n\nUse isso apenas para conferência operacional. Se o dia já foi processado, a rotina não duplica créditos.`
        : `Confirma rodar a rotina DAILY da data ${targetDay}?\n\nA execução manual não duplica créditos do mesmo dia. O cron continua ativo para a rodada automática.`
    );
    if (!confirmed) return;

    try {
      setRunBusy(true);
      const runAt = buildRunAtForTargetDay(targetDay);
      const res = await adminRunDailyPayout({ runAt, targetDay, triggerSource });
      if (!res.ok) {
        setFeedback({
          variant: 'danger',
          title: replay ? 'Falha ao rodar o replay' : 'Falha ao rodar a rotina manual',
          message: res.error || 'Não foi possível executar a rodada agora.',
        });
        return;
      }

      const result = res.data?.result || {};
      const audit = res.data?.audit || {};
      setFeedback({
        variant: 'success',
        title: replay ? 'Replay executado para conferência' : 'Rodada manual executada',
        message: `Auditoria ${audit?.auditId || 'gerada'} • DAILY ${Number(result?.dailyCount || 0)} • Residual ${Number(result?.residualCount || 0)} para ${targetDay}.`,
      });
      await loadMonitor();
    } finally {
      setRunBusy(false);
    }
  };

  const handleRunNow = async () => {
    if (runLocked) return;
    await executeRun({ replay: false });
  };

  const handleReplay = async () => {
    await executeRun({ replay: true });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-800">Monitor da rodada das 18h</h3>
            <p className="text-sm text-gray-500 mt-1">
              Painel de plantão para acompanhar lotes ativos, overrides, DAILY e residual com leitura rápida em verde, amarelo e vermelho.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              type="date"
              value={targetDay}
              onChange={(e) => setTargetDay(e.target.value)}
              className="px-3 py-2 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
            />
            <button
              type="button"
              onClick={() => void loadMonitor()}
              disabled={busy}
              className={`px-4 py-2 rounded-xl font-black inline-flex items-center justify-center gap-2 ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              {busy ? 'Atualizando...' : 'Atualizar agora'}
            </button>
            <button
              type="button"
              onClick={() => void handleRunNow()}
              disabled={busy || runBusy || runLocked}
              className={`px-4 py-2 rounded-xl font-black inline-flex items-center justify-center gap-2 ${
                busy || runBusy || runLocked ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#111827] text-white hover:bg-black'
              }`}
            >
              <RefreshCw size={16} className={runBusy ? 'animate-spin' : ''} />
              {runBusy ? 'Rodando...' : runLocked ? 'Dia já processado' : 'Rodar agora (admin)'}
            </button>
            {runLocked ? (
              <button
                type="button"
                onClick={() => void handleReplay()}
                disabled={busy || runBusy}
                className={`px-4 py-2 rounded-xl font-black inline-flex items-center justify-center gap-2 ${
                  busy || runBusy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <RefreshCw size={16} className={runBusy ? 'animate-spin' : ''} />
                {runBusy ? 'Rodando...' : 'Replay para conferência'}
              </button>
            ) : null}
            <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              Auto 30s
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <StatusBadge variant="neutral">Dia monitorado: {snapshot?.day || targetDay}</StatusBadge>
          <StatusBadge variant={dayStatusBadge.variant}>{dayStatusBadge.label}</StatusBadge>
          <StatusBadge variant={autoRefresh ? 'success' : 'warning'}>{autoRefresh ? 'Auto-refresh ligado' : 'Atualização manual'}</StatusBadge>
          {snapshot?.generatedAt ? <StatusBadge>Gerado em {formatDateTime(snapshot.generatedAt)}</StatusBadge> : null}
          {latestRun?.created_at ? <StatusBadge>Última auditoria em {formatDateTime(latestRun.created_at)}</StatusBadge> : null}
        </div>

        {feedback ? (
          <div className="mt-5">
            <InlineFeedbackCard variant={feedback.variant} title={feedback.title} message={feedback.message} />
          </div>
        ) : null}

        {copyFeedback ? (
          <div className="mt-5">
            <InlineFeedbackCard variant="info" title="SQL pronta" message={copyFeedback} />
          </div>
        ) : null}

        {runLocked ? (
          <div className="mt-5">
            <InlineFeedbackCard
              variant="info"
              title="Dia já processado"
              message={`Ja existe uma execução SUCCESS para ${targetDay}${successfulRunForDay?.created_at ? ` em ${formatDateTime(successfulRunForDay.created_at)}` : ''}. O botão principal fica travado; use o replay somente para conferência operacional.`}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <InlineFeedbackCard
            variant="info"
            title="Execução manual x cron"
            message="O botão principal roda a rotina normal apenas quando o dia ainda nao foi processado. Depois de SUCCESS, ele trava visualmente e libera somente o replay explicito para auditoria e conferencia. O cron diario continua ativo e nao duplica DAILY nem residual do mesmo dia."
          />
        </div>

        <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 xl:grid-cols-5 gap-4">
          {cards.map((card) => (
            <MonitorStatCard key={card.label} label={card.label} value={card.value} helper={card.helper} indicator={card.indicator} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-base font-black text-gray-800">Lotes ativos por banca/cota</h4>
                <p className="text-sm text-gray-500 mt-1">Base operacional da rodada atual.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('Lotes ativos', SQL_SNIPPETS.activeLots)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                Copiar SQL
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {activeItems.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum lote ativo encontrado no momento.</p>
              ) : (
                activeItems.map((item) => (
                  <div key={`${item.bank_id}-${item.quota_key}`} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-900">{item.bank_name} • {String(item.quota_key || '').toUpperCase()}</p>
                      <p className="mt-1 text-xs text-gray-500">{Number(item.lots_count || 0)} lotes • {Number(item.units_count || 0)} unidades</p>
                    </div>
                    <StatusBadge variant={Number(item.lots_count || 0) > 0 ? 'success' : 'warning'}>{Number(item.lots_count || 0) > 0 ? 'Ativo' : 'Sem lote'}</StatusBadge>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-base font-black text-gray-800">Ganhos do dia</h4>
                <p className="text-sm text-gray-500 mt-1">Resumo das transações DAILY da data monitorada.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('Ganhos DAILY', SQL_SNIPPETS.daily)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                Copiar SQL
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {dailyItems.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum DAILY encontrado para a data selecionada.</p>
              ) : (
                dailyItems.map((item) => (
                  <div key={`${item.bank_id}-${item.quota_key}-${item.tx_count}`} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-900">{item.bank_name || item.bank_id || 'Sem banca'} • {String(item.quota_key || '').toUpperCase()}</p>
                        <p className="mt-1 text-xs text-gray-500">{Number(item.tx_count || 0)} créditos • total {formatMoney(item.total_usd || 0)}</p>
                      </div>
                      <StatusBadge variant={item.has_override ? 'warning' : 'success'}>
                        {item.has_override ? 'Com override' : 'Taxa fixa'}
                      </StatusBadge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-base font-black text-gray-800">Overrides monitorados</h4>
                <p className="text-sm text-gray-500 mt-1">Dia atual e dia anterior para detectar aplicação e expiração.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('Overrides do dia', SQL_SNIPPETS.overrides)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                Copiar SQL
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {overrideItems.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum override encontrado para o dia monitorado e o anterior.</p>
              ) : (
                overrideItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-900">{item.bank_name} • {String(item.quota_key || '').toUpperCase()}</p>
                        <p className="mt-1 text-xs text-gray-500">{item.target_ymd} • {formatPct(item.base_daily_pct)} → {formatPct(item.override_daily_pct)}</p>
                      </div>
                      <StatusBadge
                        variant={item.status === 'APPLIED' ? 'success' : item.status === 'SCHEDULED' ? 'warning' : item.status === 'EXPIRED' ? 'danger' : 'neutral'}
                      >
                        {item.status}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {item.applied_lots_count ? `${item.applied_lots_count} lotes • ${formatMoney(item.applied_override_amount_usd || 0)}` : item.note || 'Sem observação.'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h4 className="text-base font-black text-gray-800">Leitura rápida do plantão</h4>
            <div className="mt-4 space-y-3">
              <InlineFeedbackCard
                variant={Number(snapshot?.activeLots?.totalLots || 0) > 0 ? 'success' : 'danger'}
                title={Number(snapshot?.activeLots?.totalLots || 0) > 0 ? 'Base operacional presente' : 'Sem lote ativo agora'}
                message={
                  Number(snapshot?.activeLots?.totalLots || 0) > 0
                    ? 'Existe pelo menos um lote ativo real para a rodada monitorada.'
                    : 'Se a rodada real deveria processar cotas hoje, revise imediatamente antes das 18h.'
                }
              />
              <InlineFeedbackCard
                variant={Number(snapshot?.daily?.count || 0) > 0 ? 'success' : 'info'}
                title={Number(snapshot?.daily?.count || 0) > 0 ? 'DAILY já visível' : 'DAILY ainda não apareceu'}
                message={
                  Number(snapshot?.daily?.count || 0) > 0
                    ? 'Os ganhos diários do dia já estão sendo refletidos no banco.'
                    : 'Antes da rodada isso é normal. Depois das 18h, se continuar assim com lote ativo, investigar.'
                }
              />
              <InlineFeedbackCard
                variant={latestEvent?.event_kind === 'APPLIED' ? 'success' : latestEvent?.event_kind === 'EXPIRED' ? 'danger' : 'info'}
                title={`Último evento: ${latestEvent?.event_kind || 'sem evento recente'}`}
                message={
                  latestEvent?.event_kind
                    ? `${latestEvent.bank_name || latestEvent.bank_id || 'Sistema'} • ${String(latestEvent.quota_key || '').toUpperCase()} • ${formatDateTime(latestEvent.created_at)}`
                    : 'Ainda não há evento recente de override para destacar.'
                }
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h4 className="text-base font-black text-gray-800">Auditoria das execuções</h4>
            <p className="text-sm text-gray-500 mt-1">Histórico recente da rotina manual e automática para o dia monitorado.</p>
            <div className="mt-4 space-y-3">
              {runAudits.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma execução auditada encontrada para o dia monitorado e o anterior.</p>
              ) : (
                runAudits.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-900">{item.trigger_source} • {item.run_day}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Solicitado em {formatDateTime(item.requested_run_at)}{item.actor_email ? ` • ${item.actor_email}` : ''}
                        </p>
                      </div>
                      <StatusBadge
                        variant={item.status === 'SUCCESS' ? 'success' : item.status === 'ERROR' ? 'danger' : item.status === 'RUNNING' ? 'warning' : 'neutral'}
                      >
                        {item.status}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {item.status === 'SUCCESS'
                        ? `DAILY ${Number(item.result_payload?.dailyCount || 0)} • Residual ${Number(item.result_payload?.residualCount || 0)}`
                        : item.error_message || 'Execução registrada sem detalhe adicional.'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
