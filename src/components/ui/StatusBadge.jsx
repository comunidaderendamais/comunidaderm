const VARIANTS = {
  neutral: 'border border-gray-200 bg-gray-50 text-gray-700',
  success: 'border border-green-200 bg-green-50 text-green-700',
  warning: 'border border-yellow-200 bg-yellow-50 text-yellow-800',
  danger: 'border border-red-200 bg-red-50 text-red-700',
};

export default function StatusBadge({ children, variant = 'neutral', className = '' }) {
  const variantClassName = VARIANTS[variant] || VARIANTS.neutral;

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black whitespace-nowrap ${variantClassName} ${className}`.trim()}>
      {children}
    </span>
  );
}
