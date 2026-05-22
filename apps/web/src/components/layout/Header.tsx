'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Bell, Search, Menu, LogOut, User } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  onMenuToggle?: () => void;
  className?: string;
}

export function Header({ onMenuToggle, className }: HeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? '';

  return (
    <header
      className={cn(
        'h-16 bg-white border-b border-surface-border',
        'flex items-center gap-4 px-5',
        'flex-shrink-0',
        className
      )}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder={locale === 'ar' ? 'بحث...' : 'Search...'}
            className={cn(
              'w-full rounded-lg border border-slate-200 bg-slate-50',
              'ps-9 pe-4 py-2 text-sm text-slate-700',
              'placeholder:text-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:bg-white',
              'transition-colors duration-150'
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ms-auto">
        <LanguageSwitcher />

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
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
