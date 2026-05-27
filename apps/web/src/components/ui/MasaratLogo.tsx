interface MasaratLogoProps {
  /** Icon diameter in px (default 36) */
  size?: number;
  /** 'icon' = badge only | 'full' = badge + text (default 'icon') */
  variant?: 'icon' | 'full';
  className?: string;
}

/**
 * Masarat system logo — a stylized Arabic م rendered as a travel route.
 *
 * The م stroke traces:
 *   origin (right arm tip) ─── horizontal arm ─── 330° clockwise arc (the م bowl) ─── tail ─── destination pin
 *
 * Colors: navy #1B3A6B | gold #C8962A
 */
export function MasaratLogo({ size = 36, variant = 'icon', className }: MasaratLogoProps) {
  const badge = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="مسارات"
      className={variant === 'icon' ? className : undefined}
      style={{ flexShrink: 0 }}
    >
      {/* Navy background */}
      <circle cx="50" cy="50" r="50" fill="#1B3A6B" />
      {/* Gold accent ring */}
      <circle cx="50" cy="50" r="46" fill="none" stroke="#C8962A" strokeWidth="1.5" opacity={0.55} />

      {/* Stylized م as route path: arm → 330° arc loop → tail */}
      <path
        d="M72,43 L60,43 A18,18 0 1 1 53,50 L53,70"
        fill="none"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Origin waypoint (hollow gold ring) */}
      <circle cx="72" cy="43" r="6.5" fill="#C8962A" />
      <circle cx="72" cy="43" r="3"   fill="#1B3A6B" />

      {/* Destination pin */}
      <path
        d="M53,68 C48,68 44,72 44,76 C44,81 48,85 53,88 C58,85 62,81 62,76 C62,72 58,68 53,68 Z"
        fill="#C8962A"
      />
      <circle cx="53" cy="76" r="3" fill="#1B3A6B" />
    </svg>
  );

  if (variant === 'icon') return badge;

  return (
    <div
      className={`flex items-center gap-3 ${className ?? ''}`}
      dir="rtl"
    >
      {badge}
      <div className="flex flex-col min-w-0">
        <span
          style={{
            fontSize:   Math.round(size * 0.47),
            fontWeight: 700,
            color:      '#1e293b',
            lineHeight: 1.2,
            fontFamily: 'var(--font-arabic, Tajawal, sans-serif)',
            letterSpacing: '0.01em',
          }}
        >
          مسارات
        </span>
        <span
          style={{
            fontSize:   Math.round(size * 0.25),
            color:      '#64748b',
            lineHeight: 1.2,
            fontFamily: 'var(--font-arabic, Tajawal, sans-serif)',
          }}
        >
          نظام إدارة وكالات السفر
        </span>
      </div>
    </div>
  );
}
