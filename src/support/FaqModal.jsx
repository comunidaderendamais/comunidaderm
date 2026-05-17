import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadFaqState } from './faqStorage';

export default function FaqModal({ isOpen, onClose }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setItems(loadFaqState().items);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,92vw)] h-[min(780px,88vh)] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]">
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">Central de ajuda</p>
            <h3 className="text-lg font-black truncate">FAQ / Dúvidas Frequentes</h3>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
            title="Fechar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="h-[calc(100%-56px)] overflow-y-auto p-4 bg-gray-50">
          <div className="space-y-3">
            {items.map((item, idx) => (
              <details key={idx} className="bg-white border border-gray-200 rounded-2xl p-4">
                <summary className="cursor-pointer font-black text-gray-800">{item.q}</summary>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
