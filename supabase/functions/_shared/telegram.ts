const TELEGRAM_API_BASE = 'https://api.telegram.org';
const SAO_PAULO_TZ = 'America/Sao_Paulo';

type TelegramAlertPayload = {
  eventType: 'deposit_confirmed' | 'withdraw_requested';
  username: string;
  amountUsd: number;
  occurredAt?: string | null;
};

const asMoneyUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const asDateTime = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString('pt-BR', { timeZone: SAO_PAULO_TZ });
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: SAO_PAULO_TZ,
  }).format(date);
};

const cleanUsername = (value: string) => {
  const next = String(value || '').trim();
  return next || 'usuario-sem-login';
};

export const buildTelegramAlertText = ({ eventType, username, amountUsd, occurredAt }: TelegramAlertPayload) => {
  const title = eventType === 'withdraw_requested' ? 'Novo saque solicitado' : 'Novo deposito confirmado';
  return [
    `Renda Mais`,
    title,
    `Login: ${cleanUsername(username)}`,
    `Data: ${asDateTime(occurredAt)}`,
    `Valor: ${asMoneyUsd(Number(amountUsd || 0))}`,
  ].join('\n');
};

export const sendTelegramAlertMessage = async (payload: TelegramAlertPayload) => {
  const botToken = String(Deno.env.get('TELEGRAM_BOT_TOKEN') || '').trim();
  const chatId = String(Deno.env.get('TELEGRAM_CHAT_ID') || '').trim();

  if (!botToken) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN ausente' };
  if (!chatId) return { ok: false, reason: 'TELEGRAM_CHAT_ID ausente' };

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildTelegramAlertText(payload),
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      reason: data?.description || `HTTP ${response.status}`,
      data,
    };
  }

  return { ok: true, data };
};
