import { useEffect, useState } from 'react';
import { X, Maximize2, Minimize2, CalendarDays, Clock } from 'lucide-react';
import { getT } from '../i18n/i18n.js';
import { fetchBankDayHistory, getTodayYmd, getYesterdayYmd, normalizeYmd } from '../supabase/bankHistoryRepo.js';

const chipBase = 'px-3 py-2 rounded-xl text-sm font-bold border transition';

const getLocale = (lang) => {
  const key = String(lang || '').trim().toLowerCase();
  if (key === 'en') return 'en-US';
  if (key === 'es') return 'es-ES';
  return 'pt-BR';
};

function VideoCard({ url }) {
  const [meta, setMeta] = useState(null);
  const isPortrait = meta ? meta.h > meta.w : false;

  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-gray-200">
      <div className={`mx-auto w-full ${isPortrait ? 'max-w-[420px]' : ''}`}>
        <video
          src={url}
          controls
          playsInline
          onLoadedMetadata={(e) => {
            const w = e.currentTarget.videoWidth;
            const h = e.currentTarget.videoHeight;
            if (w && h) setMeta({ w, h });
          }}
          className="w-full max-h-[65vh] bg-black object-contain"
        />
      </div>
    </div>
  );
}

export default function BankHistoryModal({ isOpen, bankName, bankId, onClose, t, lang }) {
  const tr = t || getT(lang);
  const locale = getLocale(lang);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayYmd());
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [tab, setTab] = useState('video');
  const [day, setDay] = useState({ videos: [], images: [], note: '' });
  const hasVideo = (day?.videos || []).length > 0;
  const hasImages = (day?.images || []).length > 0;

  useEffect(() => {
    if (!isOpen || !bankId || !selectedDate) return;
    let cancelled = false;
    const run = async () => {
      const res = await fetchBankDayHistory({ bankId, ymd: selectedDate });
      if (cancelled || !res.ok) return;
      setDay(res.entry || { videos: [], images: [], note: '' });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, bankId, selectedDate]);

  useEffect(() => {
    if (!isOpen) return;
    setIsFullscreen(false);
    setLightboxUrl(null);
    setSelectedDate(getTodayYmd());
    setTab('video');
    setDay({ videos: [], images: [], note: '' });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'video' && !hasVideo && hasImages) setTab('images');
    if (tab === 'images' && !hasImages && hasVideo) setTab('video');
  }, [hasVideo, hasImages, isOpen, tab]);

  if (!isOpen) return null;

  const today = getTodayYmd();
  const yesterday = getYesterdayYmd();

  const overlayClose = () => {
    setIsFullscreen(false);
    setLightboxUrl(null);
    onClose?.();
  };

  const canCloseLightbox = !!lightboxUrl;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60" onClick={overlayClose}></div>

      <div className={`absolute ${isFullscreen ? 'inset-0' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1100px,92vw)] h-[min(720px,88vh)]'} bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]`}>
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">{tr.historyTitle}</p>
            <h3 className="text-lg font-black truncate">{bankName || 'Banca'}</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen((s) => !s)}
              className="h-10 w-10 rounded-xl border border-gray-700 hover:border-[#00FF00] flex items-center justify-center text-gray-200 hover:text-white"
              title={isFullscreen ? tr.back : tr.expand}
              type="button"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <button
              onClick={overlayClose}
              className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
              title={tr.close}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className={`${chipBase} ${selectedDate === today ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#00FF00]'}`}
            >
              <span className="inline-flex items-center gap-2">
                <Clock size={16} /> {tr.historyToday}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterday)}
              className={`${chipBase} ${selectedDate === yesterday ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#00FF00]'}`}
            >
              {tr.historyYesterday}
            </button>

            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <CalendarDays size={16} className="text-gray-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(normalizeYmd(e.target.value))}
                className="text-sm outline-none bg-transparent"
              />
            </div>

            <div className="ml-auto text-xs text-gray-500">
              {tr.historyDate}:{' '}
              <span className="font-bold text-gray-800">
                {selectedDate ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(locale) : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('video')}
              className={`${chipBase} ${tab === 'video' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#8A2BE2]'}`}
              disabled={!hasVideo}
              title={!hasVideo ? tr.historyNoVideo : tr.historyVideo}
            >
              {tr.historyVideo}
            </button>
            <button
              type="button"
              onClick={() => setTab('images')}
              className={`${chipBase} ${tab === 'images' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#8A2BE2]'}`}
              disabled={!hasImages}
              title={!hasImages ? tr.historyNoImages : tr.historyImages}
            >
              {tr.historyImages}
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-132px)] bg-white overflow-y-auto">
          <div className="p-4">
            {!hasVideo && !hasImages && (
              <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center bg-gray-50">
                <p className="text-lg font-black text-gray-800">{tr.historyNoData}</p>
                <p className="text-sm text-gray-500 mt-2">{tr.historyAddHint}</p>
              </div>
            )}

            {tab === 'video' && hasVideo && (
              <div className="space-y-4">
                {day.videos.map((url, idx) => (
                  <VideoCard key={`${url}-${idx}`} url={url} />
                ))}
              </div>
            )}

            {tab === 'images' && hasImages && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {day.images.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="group rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 hover:border-[#00FF00] transition"
                    title={tr.historyClickZoom}
                  >
                    <img src={url} alt={`Histórico ${idx + 1}`} className="w-full h-56 object-cover group-hover:scale-[1.02] transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {canCloseLightbox && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
            <div className="relative w-[min(1200px,95vw)] h-[min(820px,92vh)]">
              <button
                type="button"
                className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-white text-black shadow flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxUrl(null);
                }}
                title={tr.close}
              >
                <X size={18} />
              </button>
              <img
                src={lightboxUrl}
                alt={tr.historyImageZoomed}
                className="w-full h-full object-contain rounded-2xl bg-black"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
