'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { cn } from '@/lib/utils';
import { MasaratLogo } from '@/components/ui/MasaratLogo';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { type FeatureKey } from '@/lib/plan-features';
import {
  LayoutDashboard, ClipboardList, Users, Plane, Building2, Package,
  Moon, Shield, Stamp, FileText, Receipt, BarChart3, Truck, UserCog,
  Settings, HelpCircle, ChevronLeft, ChevronRight, Calculator,
  Anchor, Car, Train, Camera, Mountain, Plus, Layers, Landmark, Send, Wallet,
  TrendingDown, TrendingUp, Lock, FileSearch, Ticket, ClipboardCheck,
} from 'lucide-react';

// ─── Icon map for custom service types ────────────────────────────────────────

export const SERVICE_ICON_MAP: Record<string, React.ReactNode> = {
  plane:     <Plane size={18} />,
  building2: <Building2 size={18} />,
  package:   <Package size={18} />,
  moon:      <Moon size={18} />,
  shield:    <Shield size={18} />,
  stamp:     <Stamp size={18} />,
  anchor:    <Anchor size={18} />,
  car:       <Car size={18} />,
  train:     <Train size={18} />,
  camera:    <Camera size={18} />,
  mountain:  <Mountain size={18} />,
  layers:    <Layers size={18} />,
};

interface CustomServiceType {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  isActive: boolean;
}

interface NavItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  labelAr: string;
  labelEn: string;
  feature?: FeatureKey;
}

interface NavGroup {
  key: string;
  labelAr: string;
  labelEn: string;
  items: NavItem[];
}

const SERVICES_GROUP: NavGroup = {
  key: 'services',
  labelAr: 'الخدمات',
  labelEn: 'Services',
  items: [
    { key: 'all_orders', href: '/bookings',  icon: <ClipboardList size={18} />, labelAr: 'كل الطلبات',    labelEn: 'All Orders',    feature: 'bookings' },
    { key: 'quotes',     href: '/quotes',    icon: <Send size={18} />,          labelAr: 'عروض الأسعار',  labelEn: 'Quotations',    feature: 'quotes' },
    { key: 'flights',    href: '/flights',   icon: <Plane size={18} />,         labelAr: 'طيران',         labelEn: 'Flights',       feature: 'tickets' },
    { key: 'pnr',        href: '/pnr',       icon: <FileSearch size={18} />,    labelAr: 'سجلات PNR',     labelEn: 'PNR Records',   feature: 'pnr' },
    { key: 'tickets',    href: '/tickets',   icon: <Ticket size={18} />,        labelAr: 'التذاكر',       labelEn: 'Tickets',       feature: 'tickets' },
    { key: 'hotels',     href: '/hotels',    icon: <Building2 size={18} />,     labelAr: 'فنادق',         labelEn: 'Hotels',        feature: 'bookings' },
    { key: 'packages',   href: '/packages',  icon: <Package size={18} />,       labelAr: 'باقات سياحية',  labelEn: 'Packages',      feature: 'bookings' },
    { key: 'umrah',      href: '/umrah',     icon: <Moon size={18} />,          labelAr: 'عمرة وحج',      labelEn: 'Umrah & Hajj',  feature: 'bookings' },
    { key: 'insurance',  href: '/insurance', icon: <Shield size={18} />,        labelAr: 'تأمين',         labelEn: 'Insurance',     feature: 'bookings' },
    { key: 'visas',      href: '/visas',     icon: <Stamp size={18} />,         labelAr: 'تأشيرات',       labelEn: 'Visas',         feature: 'bookings' },
  ],
};

const FINANCE_GROUP: NavGroup = {
  key: 'finance',
  labelAr: 'المالية',
  labelEn: 'Finance',
  items: [
    { key: 'invoices',          href: '/invoices',          icon: <FileText size={18} />,     labelAr: 'الفواتير',           labelEn: 'Invoices',          feature: 'invoices' },
    { key: 'payments',          href: '/payments',          icon: <Receipt size={18} />,      labelAr: 'المدفوعات',          labelEn: 'Payments',          feature: 'payments' },
    { key: 'receipt_vouchers',  href: '/receipt-vouchers',  icon: <TrendingUp size={18} />,   labelAr: 'سندات القبض',        labelEn: 'Receipt Vouchers',  feature: 'receipt_vouchers' },
    { key: 'supplier_payments', href: '/supplier-payments', icon: <TrendingDown size={18} />, labelAr: 'سندات الصرف',        labelEn: 'Payment Vouchers',  feature: 'supplier_payments' },
    { key: 'cheques',           href: '/cheques',           icon: <Landmark size={18} />,     labelAr: 'الشيكات',            labelEn: 'Cheques',           feature: 'cheques' },
    { key: 'banking',           href: '/banking',           icon: <Wallet size={18} />,       labelAr: 'البنوك والصناديق',   labelEn: 'Banks & Cash',      feature: 'banking' },
    { key: 'accounting',        href: '/accounting',        icon: <Calculator size={18} />,   labelAr: 'المحاسبة',           labelEn: 'Accounting',        feature: 'accounting' },
  ],
};

const MANAGEMENT_GROUP: NavGroup = {
  key: 'management',
  labelAr: 'الإدارة',
  labelEn: 'Management',
  items: [
    { key: 'customers',  href: '/customers',  icon: <Users size={18} />,          labelAr: 'العملاء',          labelEn: 'Customers',   feature: 'customers' },
    { key: 'suppliers',  href: '/suppliers',  icon: <Truck size={18} />,          labelAr: 'الموردين',         labelEn: 'Suppliers',   feature: 'suppliers' },
    { key: 'employees',  href: '/employees',  icon: <UserCog size={18} />,        labelAr: 'إدارة الموظفين',   labelEn: 'Employees',   feature: 'employees' },
    { key: 'reports',    href: '/reports',    icon: <BarChart3 size={18} />,      labelAr: 'التقارير',         labelEn: 'Reports',     feature: 'reports' },
    { key: 'audit_log',  href: '/audit-log',  icon: <ClipboardCheck size={18} />, labelAr: 'سجل المراجعة',     labelEn: 'Audit Log',   feature: 'audit_logs' },
  ],
};

const BOTTOM_ITEMS: NavItem[] = [
  { key: 'settings', href: '/settings', icon: <Settings size={18} />,   labelAr: 'الإعدادات', labelEn: 'Settings' },
  { key: 'help',     href: '/help',     icon: <HelpCircle size={18} />, labelAr: 'المساعدة',  labelEn: 'Help' },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export function Sidebar({ collapsed = false, onToggle, onClose }: SidebarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;
  const { canAccess } = useSubscription();
  const [customTypes, setCustomTypes] = useState<CustomServiceType[]>([]);

  useEffect(() => {
    if (!agencyId) return;

    let cancelled = false;
    async function load() {
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const data = await apiFetch<{ serviceTypes: CustomServiceType[] }>('/api/service-types');
        if (!cancelled) setCustomTypes(data.serviceTypes);
      } catch { /* silently ignore */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [agencyId]);

  function isActive(href: string): boolean {
    const fullHref = `/${locale}${href}`;
    if (href === '/bookings') return pathname === fullHref;
    return pathname === fullHref || pathname.startsWith(fullHref + '/');
  }

  function buildHref(path: string): string {
    return `/${locale}${path}`;
  }

  const CollapseIcon = isAr
    ? collapsed ? ChevronLeft : ChevronRight
    : collapsed ? ChevronRight : ChevronLeft;

  function NavLink({ item, active }: { item: NavItem; active: boolean }) {
    const locked = item.feature ? !canAccess(item.feature) : false;

    function handleClick(e: React.MouseEvent) {
      if (locked) {
        e.preventDefault();
        router.push(buildHref('/settings?tab=billing'));
        return;
      }
      onClose?.();
    }

    return (
      <Link
        href={buildHref(item.href)}
        title={collapsed ? (isAr ? item.labelAr : item.labelEn) : undefined}
        onClick={handleClick}
        className={cn(
          'flex items-center rounded-xl transition-all duration-150 text-sm font-medium',
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
          locked
            ? 'text-slate-400 hover:bg-slate-50 cursor-pointer'
            : active
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <span className={cn('flex-shrink-0', locked ? 'opacity-40' : active ? 'text-white' : '')}>{item.icon}</span>
        {!collapsed && (
          <>
            <span className="truncate flex-1">{isAr ? item.labelAr : item.labelEn}</span>
            {locked && <Lock size={12} className="flex-shrink-0 text-slate-300" />}
          </>
        )}
        {/* In collapsed mode, locked items appear at reduced opacity */}
      </Link>
    );
  }

  const groups = [SERVICES_GROUP, FINANCE_GROUP, MANAGEMENT_GROUP];

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-e border-surface-border',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
      style={{ background: 'linear-gradient(180deg, #f8faff 0%, #ffffff 120px)' }}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center justify-center flex-shrink-0',
        collapsed
          ? 'h-16 px-2 border-b border-slate-100'
          : 'h-32 px-6 border-b border-slate-100',
      )}>
        {collapsed
          ? <MasaratLogo size={42} variant="icon" />
          : <MasaratLogo size={110} variant="full" />
        }
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        {/* Dashboard — no group header */}
        <div className="px-3 mb-2">
          <NavLink
            item={{ key: 'dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} />, labelAr: 'لوحة التحكم', labelEn: 'Dashboard' }}
            active={isActive('/dashboard')}
          />
        </div>

        {groups.map((group, gi) => (
          <div key={group.key} className={cn('px-3', gi < groups.length - 1 ? 'mb-3' : '')}>
            {/* Group label */}
            {!collapsed ? (
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 select-none">
                  {isAr ? group.labelAr : group.labelEn}
                </span>
                {group.key === 'services' && (
                  <Link
                    href={buildHref('/settings?tab=service_types')}
                    title={isAr ? 'إضافة خدمة مخصصة' : 'Add service type'}
                    className="p-0.5 rounded text-slate-300 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                  >
                    <Plus size={12} />
                  </Link>
                )}
              </div>
            ) : (
              gi > 0 && <div className="my-2 border-t border-slate-100 mx-2" />
            )}

            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.key}>
                  <NavLink item={item} active={isActive(item.href)} />
                </li>
              ))}

              {/* Custom service types appended to Services group */}
              {group.key === 'services' && customTypes.map(ct => {
                const ctHref = `/services/${ct.id}`;
                const active = pathname.startsWith(`/${locale}${ctHref}`);
                return (
                  <li key={ct.id}>
                    <Link
                      href={buildHref(ctHref)}
                      title={collapsed ? (isAr ? ct.nameAr : ct.nameEn) : undefined}
                      onClick={onClose}
                      className={cn(
                        'flex items-center rounded-lg transition-colors duration-150 text-sm font-medium',
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                        active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )}
                    >
                      <span className={cn('flex-shrink-0', active ? 'text-brand-600' : '')}>
                        {SERVICE_ICON_MAP[ct.icon] ?? <Layers size={18} />}
                      </span>
                      {!collapsed && (
                        <span className="truncate">{isAr ? ct.nameAr : ct.nameEn}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Bottom items inside nav — eliminates mobile gap */}
        <div className="px-3 mt-3 pt-3 border-t border-surface-border space-y-0.5">
          {BOTTOM_ITEMS.map(item => (
            <Link
              key={item.key}
              href={buildHref(item.href)}
              onClick={onClose}
              className={cn(
                'flex items-center rounded-lg transition-colors duration-150 text-sm font-medium',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive(item.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
              )}
            >
              {item.icon}
              {!collapsed && <span>{isAr ? item.labelAr : item.labelEn}</span>}
            </Link>
          ))}

          {onToggle && (
            <button
              onClick={onToggle}
              className={cn(
                'w-full flex items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600',
                'transition-colors duration-150 text-sm',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
              )}
            >
              <CollapseIcon size={16} />
              {!collapsed && (
                <span className="text-xs">{isAr ? 'طي القائمة' : 'Collapse'}</span>
              )}
            </button>
          )}
        </div>
      </nav>
    </aside>
  );
}
