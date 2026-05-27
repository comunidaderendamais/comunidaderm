export const isSettledTransactionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['concluído', 'concluido', 'confirmado', 'creditado'].includes(normalized);
};

