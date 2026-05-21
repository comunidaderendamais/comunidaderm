import { ExternalLink } from 'lucide-react';

export default function NowpaymentsPaymentFooterAction({ checkoutUrl }) {
  if (!checkoutUrl) return null;

  return (
    <a
      href={checkoutUrl}
      target="_blank"
      rel="noreferrer"
      className="xl:col-span-2 sticky bottom-0 w-full rounded-2xl bg-[#00FF00] px-4 sm:px-5 py-4 text-center text-black font-black inline-flex items-center justify-center gap-2 shadow-[0_-6px_18px_rgba(255,255,255,0.85)]"
    >
      <ExternalLink size={18} />
      Abrir checkout NOWPayments
    </a>
  );
}
