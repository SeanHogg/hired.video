/**
 * CreatorPromoArt — a self-contained, themeable SVG illustration for the
 * "Generate & Get Paid" creator promo. Draws the eye with a video/play
 * tile, rising coins, and sparkles over a brand-gradient backdrop. No
 * raster asset to ship or cache-bust; scales crisply at any banner size.
 */
interface Props {
  className?: string;
}

export default function CreatorPromoArt({ className }: Props) {
  return (
    <svg
      viewBox="0 0 240 160"
      role="img"
      aria-label="Creators earning from videos, templates, and voices"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cpa-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="cpa-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* backdrop */}
      <rect x="0" y="0" width="240" height="160" rx="16" fill="url(#cpa-bg)" />
      <circle cx="200" cy="36" r="54" fill="#ffffff" opacity="0.08" />
      <circle cx="36" cy="138" r="40" fill="#ffffff" opacity="0.07" />

      {/* video tile with play button */}
      <g transform="translate(40 44)">
        <rect width="96" height="64" rx="10" fill="#ffffff" opacity="0.95" />
        <rect width="96" height="16" rx="10" fill="#dbeafe" />
        <circle cx="48" cy="38" r="17" fill="#2563eb" />
        <path d="M44 30 L58 38 L44 46 Z" fill="#ffffff" />
      </g>

      {/* rising coins */}
      <g>
        <ellipse cx="158" cy="118" rx="20" ry="20" fill="url(#cpa-coin)" stroke="#d97706" strokeWidth="2" />
        <text x="158" y="124" textAnchor="middle" fontSize="18" fontWeight="700" fill="#92400e">$</text>
        <ellipse cx="182" cy="96" rx="14" ry="14" fill="url(#cpa-coin)" stroke="#d97706" strokeWidth="2" />
        <text x="182" y="101" textAnchor="middle" fontSize="13" fontWeight="700" fill="#92400e">$</text>
        <ellipse cx="200" cy="74" rx="10" ry="10" fill="url(#cpa-coin)" stroke="#d97706" strokeWidth="2" />
        <text x="200" y="78" textAnchor="middle" fontSize="10" fontWeight="700" fill="#92400e">$</text>
      </g>

      {/* sparkles */}
      <g fill="#ffffff">
        <path d="M150 40 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4 Z" opacity="0.95" />
        <path d="M30 50 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" opacity="0.85" />
        <path d="M120 120 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 Z" opacity="0.8" />
      </g>
    </svg>
  );
}
