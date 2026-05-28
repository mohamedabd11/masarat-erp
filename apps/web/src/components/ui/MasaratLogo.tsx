import Image from 'next/image';

interface MasaratLogoProps {
  /** Controls rendered height in px */
  size?: number;
  /** 'icon' = circular crop of icon only | 'full' = full logo with text */
  variant?: 'icon' | 'full';
  className?: string;
}

export function MasaratLogo({ size = 40, variant = 'icon', className }: MasaratLogoProps) {
  if (variant === 'icon') {
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
          style={{ objectFit: 'cover', objectPosition: '50% 20%', transform: 'scale(1.6)', transformOrigin: '50% 25%' }}
          priority
        />
      </div>
    );
  }

  // Full variant: square logo PNG, size controls the height
  return (
    <div className={className} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        src="/masarat-logo.png"
        alt="مسارات — نظام إدارة وكالات السفر"
        width={size}
        height={size}
        style={{ objectFit: 'contain', width: 'auto', height: size }}
        priority
      />
    </div>
  );
}
