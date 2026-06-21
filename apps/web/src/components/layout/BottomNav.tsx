'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ClipboardList, FileText, Menu, Plus } from 'lucide-react';

interface BottomNavProps {
  /** Opens the full navigation drawer (the "More" slot). */
  onMore: () => void;
}

interface Tab {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
  labelAr: string;
  labelEn: string;
}

// The four day-to-day destinations either side of the central action button.
const LEFT_TABS: Tab[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, labelAr: 'الرئيسية', labelEn: 'Home' },
  { key: 'bookings',  href: '/bookings',  icon: ClipboardList,   labelAr: 'الحجوزات', labelEn: 'Bookings' },
];
const RIGHT_TABS: Tab[] = [
  { key: 'invoices',  href: '/invoices',  icon: FileText,        labelAr: 'الفواتير', labelEn: 'Invoices' },
];

/**
 * Mobile-only bottom tab bar. Hidden on lg+ (the sidebar takes over) and when
 * printing. The central elevated "+" launches a new service — the system's
 * primary action — and the "More" slot opens the full navigation drawer.
 */
export function BottomNav({ onMore }: BottomNavProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const isAr = locale === 'ar';

  function isActive(href: string): boolean {
    const full = `/${locale}${href}`;
    if (href === '/dashboard' || href === '/bookings') {
      return pathname === full || (href !== '/bookings' && pathname.startsWith(full + '/'));
    }
    return pathname === full || pathname.startsWith(full + '/');
  }

  function TabLink({ tab }: { tab: Tab }) {
    const active = isActive(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        href={`/${locale}${tab.href}`}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] flex-1',
          'transition-colors',
          active ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600',
        )}
      >
        <Icon size={22} strokeWidth={active ? 2.4 : 2} />
        <span className="text-[11px] font-semibold leading-none">{isAr ? tab.labelAr : tab.labelEn}</span>
      </Link>
    );
  }

  return (
    <nav
      className={cn(
        'lg:hidden print:hidden',
        'fixed bottom-0 inset-x-0 z-30',
        'glass-surface backdrop-blur-md border-t border-surface-border',
        'pb-safe-bottom',
      )}
    >
      <div className="flex items-stretch h-16 px-1">
        {LEFT_TABS.map(tab => <TabLink key={tab.key} tab={tab} />)}

        {/* Central elevated primary action — New Service */}
        <div className="flex-1 flex items-start justify-center">
          <Link
            href={`/${locale}/bookings/new`}
            aria-label={isAr ? 'خدمة جديدة' : 'New service'}
            className={cn(
              'flex flex-col items-center justify-center -mt-5',
              'w-14 h-14 rounded-2xl bg-brand-600 text-white',
              'shadow-card-hover ring-4 ring-surface-card',
              'hover:bg-brand-700 active:scale-95 transition-all',
            )}
          >
            <Plus size={26} strokeWidth={2.6} />
          </Link>
        </div>

        {RIGHT_TABS.map(tab => <TabLink key={tab.key} tab={tab} />)}

        {/* More — opens the full navigation drawer */}
        <button
          type="button"
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] flex-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Menu size={22} strokeWidth={2} />
          <span className="text-[11px] font-semibold leading-none">{isAr ? 'المزيد' : 'More'}</span>
        </button>
      </div>
    </nav>
  );
}
