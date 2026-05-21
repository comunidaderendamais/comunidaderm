import { QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import { buildQrValue } from './nowpaymentsPresentation.js';

export default function NowpaymentsQrPanel({ payment, hasHostedCheckout }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const qrValue = useMemo(() => buildQrValue(payment), [payment]);

  useEffect(() => {
    let cancelled = false;
    const qrCodeUrl = String(payment?.qrCodeUrl || '').trim();

    if (qrCodeUrl) {
      setQrDataUrl(qrCodeUrl);
      return () => {
        cancelled = true;
      };
    }

    if (!qrValue) {
      setQrDataUrl('');
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(qrValue, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [payment, qrValue]);

  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-gray-800">
        <QrCode size={18} />
        <p className="text-sm font-black">QR Code</p>
      </div>
      <div className="mt-4 rounded-2xl bg-white border border-gray-200 p-3 sm:p-4 flex items-center justify-center min-h-[220px] sm:min-h-[252px]">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code do pagamento" className="w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] object-contain" />
        ) : (
          <p className="text-sm text-center text-gray-500">QR indisponível para esta cobrança.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {hasHostedCheckout
          ? 'Escaneie para abrir o checkout oficial da NOWPayments na carteira ou no navegador.'
          : 'Escaneie para copiar o endereço na carteira e confirme valor e rede antes de enviar.'}
      </p>
    </div>
  );
}
