import NowpaymentsPaymentFooterAction from './NowpaymentsPaymentFooterAction.jsx';
import NowpaymentsPaymentModalHeader from './NowpaymentsPaymentModalHeader.jsx';
import NowpaymentsPaymentRows from './NowpaymentsPaymentRows.jsx';
import NowpaymentsQrPanel from './NowpaymentsQrPanel.jsx';
import { getPaymentRows, normalizeNowpaymentsPayment } from './nowpaymentsPresentation.js';

export default function NowpaymentsPaymentModal({ isOpen, payment, onClose }) {
  if (!isOpen || !payment) return null;

  const currentPayment = normalizeNowpaymentsPayment(payment);
  const hasHostedCheckout = Boolean(String(currentPayment?.checkoutUrl || '').trim());
  const warnings = Array.isArray(currentPayment?.warnings) ? currentPayment.warnings : [];
  const rows = getPaymentRows(currentPayment);

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/70 p-3 sm:p-4">
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="my-3 sm:my-6 w-full max-w-5xl rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col">
          <NowpaymentsPaymentModalHeader hasHostedCheckout={hasHostedCheckout} onClose={onClose} />

          <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 sm:gap-6">
              <NowpaymentsQrPanel payment={currentPayment} hasHostedCheckout={hasHostedCheckout} />
              <NowpaymentsPaymentRows rows={rows} warnings={warnings} />
              <NowpaymentsPaymentFooterAction checkoutUrl={currentPayment.checkoutUrl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
