'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Plane,
  Building2,
  Package,
  Moon,
  Shield,
  CreditCard,
  FileText,
  Receipt,
  BarChart3,
  Truck,
  UserCog,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  moduleId?: string;
}

const navItems: NavItem[] = [
  { key: 'dashboard',  href: '/dashboard',            icon: <LayoutDashboard size={18} /> },
  { key: 'bookings',   href: '/bookings',             icon: <BookOpen size={18} /> },
  { key: 'customers',  href: '/customers',            icon: <Users size={18} /> },
  { key: 'flights',    href: '/flights',              icon: <Plane size={18} />,    moduleId: 'flights' },
  { key: 'hotels',     href: '/hotels',               icon: <Building2 size={18} />, moduleId: 'hotels' },
  { key: 'packages',   href: '/packages',             icon: <Package size={18} />,  moduleId: 'packages' },
  { key: 'umrah',      href: '/umrah',                icon: <Moon size={18} />,     moduleId: 'umrah' },
  { key: 'insurance',  href: '/insurance',            icon: <Shield size={18} />,   moduleId: 'insurance' },
  { key: 'visas',      href: '/visas',                icon: <CreditCard size={18} />, moduleId: 'visas' },
  { key: 'invoices',   href: '/invoices',             icon: <FileText size={18} /> },
  { key: 'payments',   href: '/payments',             icon: <Receipt size={18} /> },
  { key: 'accounting', href: '/accounting',           icon: <BarChart3 size={18} /> },
  { key: 'reports',    href: '/reports',              icon: <BarChart3 size={18} /> },
  { key: 'suppliers',  href: '/suppliers',            icon: <Truck size={18} /> },
  { key: 'employees',  href: '/employees',            icon: <UserCog size={18} /> },
];

const bottomItems: NavItem[] = [
  { key: 'settings', href: '/settings', icon: <Settings size={18} /> },
  { key: 'help',     href: '/help',     icon: <HelpCircle size={18} /> },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('nav');
  const isRtl = locale === 'ar';

  function isActive(href: string): boolean {
    const fullHref = `/${locale}${href}`;
    return pathname === fullHref || (href !== '/dashboard' && pathname.startsWith(fullHref));
  }

  function buildHref(path: string): string {
    return `/${locale}${path}`;
  }

  const CollapseIcon = isRtl
    ? collapsed ? ChevronLeft : ChevronRight
    : collapsed ? ChevronRight : ChevronLeft;

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-white border-e border-surface-border',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-surface-border flex-shrink-0',
        collapsed ? 'h-16 justify-center px-2' : 'h-16 px-5 gap-3'
      )}>
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600 text-white font-bold text-lg flex-shrink-0">
          م
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-bold text-slate-900 text-base leading-tight">مسارات</div>
            <div className="text-xs text-slate-400 font-light">Masarat ERP</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <ul className="space-y-0.5 px-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.key}>
                <Link
                  href={buildHref(item.href)}
                  className={cn(
                    'flex items-center rounded-lg transition-colors duration-150',
                    'text-sm font-medium',
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                  title={collapsed ? t(item.key as keyof typeof t) : undefined}
                >
                  <span className={cn('flex-shrink-0', active ? 'text-brand-600' : '')}>
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span className="truncate">{t(item.key as keyof typeof t)}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom items + collapse */}
      <div className="border-t border-surface-border py-3 px-3 space-y-0.5">
        {bottomItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={buildHref(item.href)}
              className={cn(
                'flex items-center rounded-lg transition-colors duration-150 text-sm font-medium',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              {item.icon}
              {!collapsed && <span>{t(item.key as keyof typeof t)}</span>}
            </Link>
          );
        })}

        {/* Collapse toggle */}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              'w-full flex items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600',
              'transition-colors duration-150 text-sm',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <CollapseIcon size={16} />
            {!collapsed && <span className="text-xs">{isRtl ? 'طي القائمة' : 'Collapse'}</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
