import Image from 'next/image';

interface MasaratLogoProps {
  size?: number;
  variant?: 'icon' | 'full';
  className?: string;
}

export function MasaratLogo({ size = 40, variant = 'icon', className }: MasaratLogoProps) {
  if (variant === 'icon') {
    // Collapsed sidebar: circular crop showing the top (graphic) portion of the logo.
    return (
      <div
        className={className}
        style={{
          width:        size,
          height:       size,
          position:     'relative',
          overflow:     'hidden',
          flexShrink:   0,
          borderRadius: '50%',
          border:       '2px solid #e2e8f0',
        }}
      >
        <Image
          src="/masarat-logo.png"
          alt="مسارات"
          fill
          sizes={`${size}px`}
          // The logo graphic sits in the top ~65% of the square PNG.
          // Scale up so that portion fills the circle.
          style={{ objectFit: 'cover', objectPosition: '50% 20%', transform: 'scale(1.6)', transformOrigin: '50% 25%' }}
          priority
        />
      </div>
    );
  }

  // Expanded sidebar: full logo, fills the h-28 container with padding.
  return (
    <div className={className} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        src="/masarat-logo.png"
        alt="مسارات — نظام إدارة وكالات السفر"
        width={200}
        height={200}
        style={{ objectFit: 'contain', width: 'auto', height: 100 }}
        priority
      />
    </div>
  );
}
