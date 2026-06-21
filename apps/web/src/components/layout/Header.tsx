'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Search, Menu, LogOut, User, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  onMenuToggle?: () => void;
  /** Collapses/expands the desktop sidebar. */
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
  className?: string;
}

export function Header({ onMenuToggle, onSidebarToggle, sidebarCollapsed, className }: HeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? '';
  const router      = useRouter();

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/${locale}/bookings?q=${encodeURIComponent(q)}`);
      closeSearch();
    }
  }

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && searchOpen) closeSearch();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchOpen && wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [searchOpen]);

  return (
    <header
      className={cn(
        'h-16 bg-white border-b border-surface-border',
        'flex items-center gap-2 sm:gap-4 px-3 sm:px-5',
        'flex-shrink-0',
        className
      )}
    >
      {/* Mobile menu toggle — opens the navigation drawer */}
      <button
        onClick={onMenuToggle}
        aria-label={locale === 'ar' ? 'القائمة' : 'Menu'}
        className="lg:hidden p-2 rounded-lg text-content-secondary hover:bg-surface-elevated hover:text-content-primary transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Desktop sidebar collapse toggle */}
      {onSidebarToggle && (
        <button
          onClick={onSidebarToggle}
          aria-label={locale === 'ar' ? (sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة') : (sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          title={locale === 'ar' ? (sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة') : (sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          className="hidden lg:inline-flex p-2 rounded-lg text-content-secondary hover:bg-surface-elevated hover:text-content-primary transition-colors"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      )}

      {/* Search — icon button that expands to input */}
      <div ref={wrapRef} className="relative flex items-center">
        {/* Collapsed: circle icon */}
        {!searchOpen && (
          <button
            onClick={openSearch}
            aria-label={locale === 'ar' ? 'بحث' : 'Search'}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Search size={17} />
          </button>
        )}

        {/* Expanded: animated input */}
        {searchOpen && (
          <form
            onSubmit={handleSearch}
            className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-150"
          >
            <div className="relative">
              <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={locale === 'ar' ? 'ابحث في الحجوزات...' : 'Search bookings...'}
                className={cn(
                  'w-52 sm:w-64 rounded-lg border border-slate-200 bg-slate-50',
                  'ps-9 pe-3 py-2 text-sm text-slate-700',
                  'placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:bg-white',
                  'transition-colors duration-150'
                )}
              />
            </div>
            <button
              type="button"
              onClick={closeSearch}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={15} />
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ms-auto flex-shrink-0">
        <LanguageSwitcher />

        {/* Notifications */}
        <NotificationBell locale={locale} />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors min-w-0"
          >
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <User size={14} className="text-brand-600" />
            </div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[120px] truncate">
              {displayName}
            </span>
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute end-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-500">{locale === 'ar' ? 'مسجل الدخول بـ' : 'Signed in as'}</p>
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { signOut(); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  {t('auth.logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
