import { faqItems } from './faqData';

const FAQ_KEY = 'rm_faq';

export const defaultFaqState = {
  version: 3,
  items: faqItems,
};

const normalizeI18nText = (value) => {
  if (typeof value === 'string') return { pt: value, en: '', es: '' };
  const v = value || {};
  return {
    pt: typeof v.pt === 'string' ? v.pt : '',
    en: typeof v.en === 'string' ? v.en : '',
    es: typeof v.es === 'string' ? v.es : '',
  };
};

export const normalizeFaqState = (state) => {
  const items = Array.isArray(state?.items) ? state.items : [];
  const incomingVersion = Number(state?.version || 0);
  return {
    version: defaultFaqState.version,
    items: items
      .map((it) => {
        const q = normalizeI18nText(it?.q);
        const a = normalizeI18nText(it?.a);

        if (incomingVersion < 3) {
          const ptAnswer = String(a.pt || '');
          const enAnswer = String(a.en || '');
          const esAnswer = String(a.es || '');

          const isCryptoQuestion = q.pt === 'Quais criptos e redes são aceitas?' || q.en === 'Which cryptos and networks are accepted?' || q.es === '¿Qué criptos y redes se aceptan?';
          if (isCryptoQuestion && (ptAnswer.includes('Fase 1') || enAnswer.toLowerCase().includes('phase 1') || esAnswer.toLowerCase().includes('fase 1'))) {
            return {
              q,
              a: {
                pt: 'USDT (BEP-20 ou TRC-20) e USDC (Arbitrum). Você também pode comprar novas cotas usando seu saldo disponível.',
                en: 'USDT (BEP-20 or TRC-20) and USDC (Arbitrum). You can also buy new quotas using your available balance.',
                es: 'USDT (BEP-20 o TRC-20) y USDC (Arbitrum). También puedes comprar nuevas cuotas usando tu saldo disponible.',
              },
            };
          }

          const isFirstEarningQuestion =
            q.pt === 'Quando recebo o primeiro rendimento?' ||
            q.en === 'When do I receive the first earning?' ||
            q.es === '¿Cuándo recibo el primer rendimiento?';
          if (isFirstEarningQuestion && (ptAnswer.toLowerCase().includes('protótipo') || enAnswer.toLowerCase().includes('prototype') || esAnswer.toLowerCase().includes('prototipo') || ptAnswer.includes('Fase 2') || enAnswer.toLowerCase().includes('phase 2') || esAnswer.toLowerCase().includes('fase 2'))) {
            return {
              q,
              a: {
                pt: 'O primeiro rendimento é creditado no próximo horário de pagamento: 17:00 (Washington) / 18:00 (Brasília). Os pagamentos diários são feitos junto com o residual.',
                en: 'Your first earning is credited at the next payout time: 5:00 PM (Washington) / 6:00 PM (Brasília). Daily payouts happen together with the residual.',
                es: 'Tu primer rendimiento se acredita en el próximo horario de pago: 17:00 (Washington) / 18:00 (Brasília). Los pagos diarios se realizan junto con el residual.',
              },
            };
          }

          const isWithdrawQuestion = q.pt === 'Como funciona o saque?' || q.en === 'How does withdrawal work?' || q.es === '¿Cómo funciona el retiro?';
          if (isWithdrawQuestion && (ptAnswer.toLowerCase().includes('protótipo') || enAnswer.toLowerCase().includes('prototype') || esAnswer.toLowerCase().includes('prototipo'))) {
            return {
              q,
              a: {
                pt: 'O saque depende de carteira cadastrada e das regras de liberação. Há taxa fixa de $2 e mínimo de $10.',
                en: 'Withdrawal depends on having a registered wallet and release rules. There is a fixed $2 fee and a $10 minimum.',
                es: 'El retiro depende de tener una billetera registrada y de las reglas de liberación. Hay una tarifa fija de $2 y un mínimo de $10.',
              },
            };
          }
        }

        return { q, a };
      })
      .filter((it) => it.q.pt || it.q.en || it.q.es || it.a.pt || it.a.en || it.a.es),
  };
};

export const loadFaqState = () => {
  try {
    const raw = localStorage.getItem(FAQ_KEY);
    if (!raw) {
      const seeded = normalizeFaqState(defaultFaqState);
      localStorage.setItem(FAQ_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeFaqState(parsed);
    if (parsed?.version !== normalized.version) {
      localStorage.setItem(FAQ_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    const seeded = normalizeFaqState(defaultFaqState);
    localStorage.setItem(FAQ_KEY, JSON.stringify(seeded));
    return seeded;
  }
};

export const saveFaqState = (state) => {
  const normalized = normalizeFaqState(state);
  localStorage.setItem(FAQ_KEY, JSON.stringify(normalized));
  return normalized;
};
