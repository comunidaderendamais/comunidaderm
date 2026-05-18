import { useMemo, useState } from 'react';
import { loadAdminConfig, saveAdminConfig } from './adminStorage';
import { DESIST_ANALYSIS_HOURS, settleCyclesIfNeeded } from '../quota/quotaEngine';
import { addNotification, loadNotificationsState, saveNotificationsState } from '../notifications/notificationsStorage';

const normalizeUser = (u) => {
  const wallets = u?.wallets ?? { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' };
  const balances = u?.balances ?? { available: 0, invested: 0, teamEarnings: 0 };
  const holdings = u?.holdings ?? { cota10: 0, cota50: 0, cota100: 0 };
  const transactions = Array.isArray(u?.transactions) ? u.transactions : [];
  const quotaLots = Array.isArray(u?.quotaLots) ? u.quotaLots : [];
  return { ...u, wallets, balances, holdings, transactions, quotaLots };
};

const addHoursUtc = (iso, hours) => {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
};

export default function AdminCycleTools() {
  const [busy, setBusy] = useState(false);
  const cfg = useMemo(() => loadAdminConfig(), []);
  const cycle = cfg?.cycle || { months: 6, renewWindowHours: 72, entryFeePct: 0.1 };

  const simulateCycleEnd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem('rm_user');
      if (!raw) {
        alert('Nenhum usuário encontrado no localStorage (rm_user).');
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const email = (JSON.parse(raw)?.email || '').toLowerCase();

      const user = normalizeUser(JSON.parse(raw));
      const lots = Array.isArray(user.quotaLots) ? user.quotaLots : [];
      const renewUntil = addHoursUtc(nowIso, Number(cycle.renewWindowHours || 72));

      const forced = {
        ...user,
        quotaLots: lots.map((l) =>
          l.status === 'ACTIVE'
            ? { ...l, endAt: new Date(now.getTime() - 1000).toISOString(), renewUntil }
            : l
        ),
      };

      const adminCfg = loadAdminConfig();
      const settled = settleCyclesIfNeeded({ user: forced, adminConfig: adminCfg, now });

      localStorage.setItem('rm_user', JSON.stringify(settled.user));
      saveAdminConfig(settled.adminConfig);

      if (email && Array.isArray(settled.notifications) && settled.notifications.length) {
        let notifState = loadNotificationsState();
        settled.notifications.forEach((n) => {
          notifState = addNotification(notifState, email, n);
        });
        saveNotificationsState(notifState);
      }

      alert('Simulação executada: ciclos ativos foram concluídos e créditos aplicados.');
    } finally {
      setBusy(false);
    }
  };

  const simulateRenewExpiry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem('rm_user');
      if (!raw) {
        alert('Nenhum usuário encontrado no localStorage (rm_user).');
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const email = (JSON.parse(raw)?.email || '').toLowerCase();

      const user = normalizeUser(JSON.parse(raw));
      const lots = Array.isArray(user.quotaLots) ? user.quotaLots : [];
      const matured = lots.filter((l) => l.status === 'MATURED');

      if (matured.length === 0) {
        alert('Nenhum lote maturado encontrado. Use "Simular ciclo (6 meses)" primeiro.');
        return;
      }

      const forced = {
        ...user,
        quotaLots: lots.map((l) =>
          l.status === 'MATURED'
            ? { ...l, renewUntil: new Date(now.getTime() - 1000).toISOString() }
            : l
        ),
      };

      const adminCfg = loadAdminConfig();
      const settled = settleCyclesIfNeeded({ user: forced, adminConfig: adminCfg, now });

      localStorage.setItem('rm_user', JSON.stringify(settled.user));
      saveAdminConfig(settled.adminConfig);

      if (email && Array.isArray(settled.notifications) && settled.notifications.length) {
        let notifState = loadNotificationsState();
        settled.notifications.forEach((n) => {
          notifState = addNotification(notifState, email, n);
        });
        saveNotificationsState(notifState);
      }

      alert('Simulação executada: janela de renovação expirou e as cotas foram devolvidas ao limite global.');
    } finally {
      setBusy(false);
    }
  };

  const simulateDesistanceExpiry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem('rm_user');
      if (!raw) {
        alert('Nenhum usuário encontrado no localStorage (rm_user).');
        return;
      }

      const now = new Date();
      const email = (JSON.parse(raw)?.email || '').toLowerCase();
      const user = normalizeUser(JSON.parse(raw));
      const lots = Array.isArray(user.quotaLots) ? user.quotaLots : [];
      const pending = lots.filter((l) => l.status === 'CANCEL_PENDING');

      if (pending.length === 0) {
        alert('Nenhuma desistência em análise (CANCEL_PENDING) encontrada.');
        return;
      }

      const forced = {
        ...user,
        quotaLots: lots.map((l) =>
          l.status === 'CANCEL_PENDING'
            ? { ...l, cancelPayAt: new Date(now.getTime() - 1000).toISOString() }
            : l
        ),
      };

      const adminCfg = loadAdminConfig();
      const settled = settleCyclesIfNeeded({ user: forced, adminConfig: adminCfg, now });

      localStorage.setItem('rm_user', JSON.stringify(settled.user));
      saveAdminConfig(settled.adminConfig);

      if (email && Array.isArray(settled.notifications) && settled.notifications.length) {
        let notifState = loadNotificationsState();
        settled.notifications.forEach((n) => {
          notifState = addNotification(notifState, email, n);
        });
        saveNotificationsState(notifState);
      }

      alert(`Simulação executada: análise de desistência expirou (${DESIST_ANALYSIS_HOURS}h) e o ressarcimento foi aplicado.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-black text-gray-800">Ferramentas (Teste)</h3>
      <p className="text-sm text-gray-500 mt-1">
        Força vencimentos para testar conclusão de ciclo, janela de renovação e desistência sem esperar prazos reais.
      </p>

      <div className="mt-4 flex flex-col min-[540px]:flex-row gap-3 min-[540px]:items-center min-[540px]:justify-between">
        <div className="text-xs text-gray-600">
          <p>
            Ciclo atual: <span className="font-black">{Number(cycle.months || 0)} meses</span>
          </p>
          <p>
            Janela atual: <span className="font-black">{Number(cycle.renewWindowHours || 0)}h</span>
          </p>
          <p>
            Taxa entrada: <span className="font-black">{Math.round(Number(cycle.entryFeePct || 0) * 100)}%</span>
          </p>
        </div>

        <div className="flex flex-col min-[540px]:flex-row gap-2 min-[540px]:items-center">
          <button
            type="button"
            onClick={simulateCycleEnd}
            disabled={busy}
            className={`px-5 py-3 rounded-xl font-black ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
          >
            Simular ciclo (6 meses)
          </button>
          <button
            type="button"
            onClick={simulateRenewExpiry}
            disabled={busy}
            className={`px-5 py-3 rounded-xl font-black ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#8A2BE2] text-white hover:bg-purple-600'}`}
          >
            Simular expirar 72h
          </button>
          <button
            type="button"
            onClick={simulateDesistanceExpiry}
            disabled={busy}
            className={`px-5 py-3 rounded-xl font-black ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
          >
            Simular desistência 72h
          </button>
        </div>
      </div>
    </div>
  );
}
