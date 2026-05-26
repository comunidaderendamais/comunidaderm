const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const normalizeUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
};

const safeUrl = (value) => {
  try {
    const normalized = normalizeUrl(value);
    return normalized ? new URL(normalized) : null;
  } catch {
    return null;
  }
};

const sanitizeVideoId = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

export const getYoutubeVideoId = (value) => {
  const parsed = safeUrl(value);
  if (!parsed || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return '';

  const pathname = parsed.pathname.replace(/\/+$/, '');
  const host = parsed.hostname.toLowerCase();

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return sanitizeVideoId(pathname.split('/').filter(Boolean)[0]);
  }

  if (pathname.startsWith('/shorts/')) {
    return sanitizeVideoId(pathname.split('/')[2]);
  }

  if (pathname.startsWith('/embed/')) {
    return sanitizeVideoId(pathname.split('/')[2]);
  }

  return sanitizeVideoId(parsed.searchParams.get('v'));
};

export const isYoutubeUrl = (value) => Boolean(getYoutubeVideoId(value));

export const getYoutubeEmbedUrl = (value) => {
  const videoId = getYoutubeVideoId(value);
  if (!videoId) return '';
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

export const getVideoOrientation = ({ width, height } = {}) => {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (!w || !h) return 'landscape';
  return h > w ? 'portrait' : 'landscape';
};

export const getYoutubeOrientation = (value) => {
  const parsed = safeUrl(value);
  if (!parsed) return 'landscape';
  return parsed.pathname.includes('/shorts/') ? 'portrait' : 'landscape';
};
