import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { loadFaqState, saveFaqState } from '../support/faqStorage';

export default function AdminFaq() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(loadFaqState().items);
  }, []);

  const updateText = (idx, field, lang, value) => {
    setItems((s) =>
      s.map((it, i) =>
        i === idx ? { ...it, [field]: { ...(it?.[field] || {}), [lang]: value } } : it
      )
    );
  };

  const add = () => {
    setItems((s) => [{ q: { pt: '', en: '', es: '' }, a: { pt: '', en: '', es: '' } }, ...s]);
  };

  const remove = (idx) => {
    setItems((s) => s.filter((_, i) => i !== idx));
  };

  const save = () => {
    const normalized = saveFaqState({ items });
    setItems(normalized.items);
    alert('FAQ atualizado.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-gray-800">FAQ</h3>
            <p className="text-sm text-gray-500">Cadastre e edite perguntas e respostas exibidas aos usuários.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 font-black hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <Plus size={18} />
              Nova
            </button>
            <button
              type="button"
              onClick={save}
              className="px-5 py-3 rounded-xl bg-[#00FF00] text-black font-black hover:bg-green-400 inline-flex items-center gap-2"
            >
              <Save size={18} />
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {items.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <p className="font-black text-gray-800">Nenhum item de FAQ</p>
            <p className="text-sm text-gray-500 mt-2">Clique em “Nova” para criar.</p>
          </div>
        )}

        {items.map((it, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-bold text-gray-500">Item #{idx + 1}</p>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="h-10 w-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 flex items-center justify-center"
                title="Remover"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Pergunta (PT)</label>
                <input
                  value={it?.q?.pt || ''}
                  onChange={(e) => updateText(idx, 'q', 'pt', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                  placeholder="Ex.: Como funciona o saque?"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Resposta (PT)</label>
                <textarea
                  value={it?.a?.pt || ''}
                  onChange={(e) => updateText(idx, 'a', 'pt', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none min-h-28"
                  placeholder="Digite a resposta..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Pergunta (EN)</label>
                <input
                  value={it?.q?.en || ''}
                  onChange={(e) => updateText(idx, 'q', 'en', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                  placeholder="E.g.: How does withdrawal work?"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Resposta (EN)</label>
                <textarea
                  value={it?.a?.en || ''}
                  onChange={(e) => updateText(idx, 'a', 'en', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none min-h-28"
                  placeholder="Type the answer..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Pergunta (ES)</label>
                <input
                  value={it?.q?.es || ''}
                  onChange={(e) => updateText(idx, 'q', 'es', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                  placeholder="Ej.: ¿Cómo funciona el retiro?"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">Resposta (ES)</label>
                <textarea
                  value={it?.a?.es || ''}
                  onChange={(e) => updateText(idx, 'a', 'es', e.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none min-h-28"
                  placeholder="Escribe la respuesta..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
