import { useEffect, useMemo, useState } from 'react';
import {
  adminUpsertBankDayHistory,
  fetchBankDayHistory,
  fetchBankHistoryDays,
  getTodayYmd,
  uploadBankHistoryAsset,
} from '../supabase/bankHistoryRepo.js';

const listToText = (value) => (Array.isArray(value) ? value.filter(Boolean).join('\n') : '');

export default function AdminBankHistoryView({ banks }) {
  const bankOptions = useMemo(() => (Array.isArray(banks) ? banks.filter(Boolean) : []), [banks]);
  const [selectedBankId, setSelectedBankId] = useState(bankOptions[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(getTodayYmd());
  const [note, setNote] = useState('');
  const [videoUrls, setVideoUrls] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!selectedBankId && bankOptions[0]?.id) setSelectedBankId(bankOptions[0].id);
  }, [bankOptions, selectedBankId]);

  const loadDay = async (bankId, ymd) => {
    if (!bankId || !ymd) return;
    const [dayRes, listRes] = await Promise.all([
      fetchBankDayHistory({ bankId, ymd }),
      fetchBankHistoryDays({ bankId, limit: 10 }),
    ]);
    if (dayRes.ok && dayRes.entry) {
      setNote(dayRes.entry.note || '');
      setVideoUrls(listToText(dayRes.entry.videos));
      setImageUrls(listToText(dayRes.entry.images));
    } else {
      setNote('');
      setVideoUrls('');
      setImageUrls('');
    }
    if (listRes.ok) setEntries(listRes.entries);
  };

  useEffect(() => {
    void loadDay(selectedBankId, selectedDate);
  }, [selectedBankId, selectedDate]);

  const selectedBank = bankOptions.find((bank) => String(bank?.id || '') === String(selectedBankId || '')) || null;

  const handleSave = async () => {
    if (!selectedBankId || !selectedDate || busy) return;
    try {
      setBusy(true);
      const res = await adminUpsertBankDayHistory({
        bankId: selectedBankId,
        ymd: selectedDate,
        note,
        videos: videoUrls,
        images: imageUrls,
      });
      if (!res.ok) {
        alert(`Falha ao salvar histórico: ${res.error || 'erro'}`);
        return;
      }
      await loadDay(selectedBankId, selectedDate);
      alert('Histórico salvo no Supabase.');
    } finally {
      setBusy(false);
    }
  };

  const appendUrls = (kind, urls) => {
    const next = urls.filter(Boolean).join('\n');
    if (!next) return;
    if (kind === 'image') {
      setImageUrls((prev) => [prev.trim(), next].filter(Boolean).join('\n'));
      return;
    }
    setVideoUrls((prev) => [prev.trim(), next].filter(Boolean).join('\n'));
  };

  const handleUpload = async (kind, files) => {
    if (!selectedBankId || !selectedDate || !files?.length || uploading) return;
    try {
      setUploading(true);
      const urls = [];
      for (const file of Array.from(files)) {
        const res = await uploadBankHistoryAsset({ bankId: selectedBankId, ymd: selectedDate, file, kind });
        if (!res.ok) {
          alert(`Falha no upload: ${res.error || 'erro'}`);
          continue;
        }
        if (res.url) urls.push(res.url);
      }
      appendUrls(kind, urls);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-gray-800">Histórico das bancas</h3>
          <p className="text-sm text-gray-500 mt-1">Cadastre vídeos, imagens e observações por banca e por dia usando o Supabase.</p>
        </div>
        <div className="text-xs text-gray-500">
          {selectedBank ? `Banca selecionada: ${selectedBank.name}` : 'Selecione uma banca'}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Banca</label>
              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
              >
                {bankOptions.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Observações do dia</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
              placeholder="Resumo operacional, observações, links extras..."
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">URLs de vídeo</label>
                <textarea
                  value={videoUrls}
                  onChange={(e) => setVideoUrls(e.target.value)}
                  rows={7}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                  placeholder="Uma URL por linha. Aceita arquivo direto e link do YouTube."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Upload de vídeos</label>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  multiple
                  onChange={(e) => {
                    void handleUpload('video', e.target.files);
                    e.target.value = '';
                  }}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">URLs de imagem</label>
                <textarea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  rows={7}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                  placeholder="Uma URL por linha"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Upload de imagens</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  onChange={(e) => {
                    void handleUpload('image', e.target.files);
                    e.target.value = '';
                  }}
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => void loadDay(selectedBankId, selectedDate)}
              className="px-5 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50"
            >
              Recarregar dia
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || uploading || !selectedBankId || !selectedDate}
              className={`px-6 py-3 rounded-xl font-black ${busy || uploading || !selectedBankId || !selectedDate ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
            >
              {uploading ? 'Enviando arquivos...' : busy ? 'Salvando...' : 'Salvar histórico'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <p className="text-sm font-black text-gray-900">Últimos registros</p>
          <p className="text-xs text-gray-500 mt-1">Exibe os dias já cadastrados para a banca selecionada.</p>

          <div className="mt-4 space-y-3">
            {entries.length === 0 && <p className="text-sm text-gray-500">Nenhum histórico cadastrado ainda.</p>}
            {entries.map((entry) => (
              <button
                key={entry.id || `${entry.bankId}-${entry.ymd}`}
                type="button"
                onClick={() => setSelectedDate(entry.ymd)}
                className={`w-full text-left rounded-xl border px-4 py-3 ${entry.ymd === selectedDate ? 'border-[#00FF00] bg-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <p className="text-sm font-black text-gray-900">{entry.ymd}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {entry.videos.length} vídeos • {entry.images.length} imagens
                </p>
                <p className="text-xs text-gray-400 mt-1 truncate">{entry.note || 'Sem observações.'}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
