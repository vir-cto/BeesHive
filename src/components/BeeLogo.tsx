/**
 * Bee's Hive brand mark — a refined bee above a honeycomb hive.
 * Pure inline SVG so it scales crisply everywhere (header, login, print).
 */
export default function BeeLogo({ className = 'h-12 w-12', id = 'beeGrad' }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Bee's Hive logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#172554" />
          <stop offset="65%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id})`} />
      <path d="M18 43h28l-3 8H21l-3-8Z" fill="#fbbf24" />
      <path d="M22 37h20l-2 6H24l-2-6Z" fill="#fde68a" />
      <path d="M27 33h10l-1 4h-8l-1-4Z" fill="#fef3c7" />
      <g transform="translate(32 23)">
        <ellipse cx="0" cy="1" rx="7" ry="5.5" fill="#fbbf24" />
        <path d="M-3-3.5v9M2-3.8v9" stroke="#172554" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="-5.5" cy="-3" rx="5" ry="3.5" fill="#dbeafe" opacity=".9" transform="rotate(-28 -5.5 -3)" />
        <ellipse cx="5.5" cy="-3" rx="5" ry="3.5" fill="#dbeafe" opacity=".9" transform="rotate(28 5.5 -3)" />
        <circle cx="6.5" cy="1" r="1" fill="#172554" />
        <path d="M-3-4.5Q-5-9-2-10M2-4.5Q4-9 2-10" fill="none" stroke="#fbbf24" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  )
}
