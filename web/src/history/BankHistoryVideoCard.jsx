import { useMemo, useState } from 'react';
import { getVideoOrientation, getYoutubeEmbedUrl, getYoutubeOrientation, isYoutubeUrl } from './bankHistoryMedia.js';

const wrapperBaseClass = 'mx-auto w-full';
const portraitWrapperClass = `${wrapperBaseClass} max-w-[420px]`;
const landscapeWrapperClass = `${wrapperBaseClass} max-w-[980px]`;

export default function BankHistoryVideoCard({ url, title }) {
  const [meta, setMeta] = useState(null);
  const youtube = useMemo(() => isYoutubeUrl(url), [url]);
  const youtubeEmbedUrl = useMemo(() => getYoutubeEmbedUrl(url), [url]);

  const orientation = youtube ? getYoutubeOrientation(url) : getVideoOrientation(meta);
  const isPortrait = orientation === 'portrait';
  const wrapperClass = isPortrait ? portraitWrapperClass : landscapeWrapperClass;

  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-gray-200">
      <div className={wrapperClass}>
        {youtube ? (
          <div className={`relative w-full bg-black ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
            <iframe
              src={youtubeEmbedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        ) : (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth && videoHeight) {
                setMeta({ width: videoWidth, height: videoHeight });
              }
            }}
            className="w-full max-h-[65vh] bg-black object-contain"
          />
        )}
      </div>
    </div>
  );
}
