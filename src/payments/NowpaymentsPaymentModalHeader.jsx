import { X } from 'lucide-react';

import StatusBadge from '../components/ui/StatusBadge.jsx';

export default function NowpaymentsPaymentModalHeader({ hasHostedCheckout, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 shrink-0">
      <div>
        <p className="text-xs font-black tracking-[0.18em] text-[#8A2BE2]">NOWPAYMENTS</p>
        <h3 className="text-lg sm:text-xl font-black text-gray-900 mt-1">Cobrança gerada</h3>
        <p className="text-sm text-gray-500 mt-1">Use os dados abaixo para concluir o pagamento e acompanhe o status na sua carteira.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge variant={hasHostedCheckout ? 'success' : 'warning'}>
            {hasHostedCheckout ? 'Checkout oficial disponível' : 'Modo manual de pagamento'}
          </StatusBadge>
        </div>
      </div>
      <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 shrink-0">
        <X size={20} />
      </button>
    </div>
  );
}
