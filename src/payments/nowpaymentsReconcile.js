export const isNowpaymentsConflictError = (message) =>
  /no unique or exclusion constraint matching the on conflict specification/i.test(String(message || ''));

export const lotSourceMatchesDeposit = (lot, refs = {}, depositTxId = '') => {
  const source = lot?.source || {};
  const sourceDepositTxId = String(source?.depositTxId || '').trim();
  const sourcePaymentId = String(source?.paymentId || '').trim();
  const sourceInvoiceId = String(source?.invoiceId || '').trim();
  const sourceOrderId = String(source?.orderId || '').trim();

  return (
    (depositTxId && sourceDepositTxId === String(depositTxId || '').trim()) ||
    (refs.paymentId && sourcePaymentId === String(refs.paymentId || '').trim()) ||
    (refs.invoiceId && sourceInvoiceId === String(refs.invoiceId || '').trim()) ||
    (refs.orderId && sourceOrderId === String(refs.orderId || '').trim())
  );
};

