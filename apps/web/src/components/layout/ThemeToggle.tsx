'use client';

import { useLocale } from 'next-intl';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type ThemePreference } from '@/providers/ThemeProvider';

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light:  Sun,
  dark:   Moon,
};

const LABELS: Record<ThemePreference, { ar: string; en: string }> = {
  system: { ar: 'تلقائي', en: 'System' },
  light:  { ar: 'فاتح',   en: 'Light' },
  dark:   { ar: 'داكن',   en: 'Dark' },
};

interface ThemeToggleProps {
  collapsed?: boolean;
}

/** Cycles system → light → dark. Lives in the sidebar footer. */
export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { preference, cycle } = useTheme();

  const Icon = ICONS[preference];
  const label = isAr ? LABELS[preference].ar : LABELS[preference].en;

  return (
    <button
      type="button"
      onClick={cycle}
      title={isAr ? `المظهر: ${label}` : `Theme: ${label}`}
      aria-label={isAr ? `المظهر: ${label}` : `Theme: ${label}`}
      className={cn(
        'w-full flex items-center rounded-lg transition-colors duration-150 text-sm font-medium',
        'text-content-secondary hover:bg-surface-elevated hover:text-content-primary',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
      )}
    >
      <Icon size={18} className="flex-shrink-0" />
      {!collapsed && (
        <span className="flex-1 text-start">{isAr ? 'المظهر' : 'Appearance'}</span>
      )}
      {!collapsed && (
        <span className="text-xs text-content-muted">{label}</span>
      )}
    </button>
  );
}
