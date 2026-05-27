export default function InfoRow({ label, value, hint = '', action = null, className = '', valueClassName = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 ${className}`.trim()}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className={`mt-2 text-sm font-bold text-gray-900 break-all ${valueClassName}`.trim()}>{value}</p>
          {hint ? <p className="mt-1 text-xs text-gray-500 break-all">{hint}</p> : null}
        </div>
        {action ? <div className="w-full sm:w-auto shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
