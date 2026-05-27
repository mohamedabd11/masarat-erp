'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, FileText, Stamp, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/hooks/useNotifications';

function NotifIcon({ type, severity }: { type: AppNotification['type']; severity: AppNotification['severity'] }) {
  if (type === 'overdue_invoice') {
    return <FileText size={15} className={severity === 'error' ? 'text-red-500' : 'text-amber-500'} />;
  }
  if (type === 'passport_expiry') {
    return <Stamp size={15} className={severity === 'error' ? 'text-red-500' : 'text-amber-500'} />;
  }
  return <AlertTriangle size={15} className="text-amber-500" />;
}

interface NotificationBellProps {
  locale: string;
}

export function NotificationBell({ locale }: NotificationBellProps) {
  const isAr = locale === 'ar';
  const { notifications, count } = useNotifications(locale);
  const [open, setOpen]           = useState(false);
  const ref                       = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label={isAr ? 'الإشعارات' : 'Notifications'}
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute top-1 end-1 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-white leading-none">
              {count > 99 ? '99+' : count}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'absolute top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden',
          isAr ? 'end-0' : 'end-0',
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-900">
              {isAr ? 'التنبيهات' : 'Notifications'}
              {count > 0 && (
                <span className="ms-2 text-xs font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center px-6">
                <CheckCircle2 size={32} className="text-emerald-400" />
                <p className="text-sm font-semibold text-slate-700">
                  {isAr ? 'لا توجد تنبيهات' : 'All clear!'}
                </p>
                <p className="text-xs text-slate-400">
                  {isAr ? 'كل شيء على ما يرام' : 'No pending alerts'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map(n => (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors',
                    )}
                  >
                    {/* Severity dot + icon */}
                    <div className={cn(
                      'mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      n.severity === 'error'   ? 'bg-red-50'    : 'bg-amber-50',
                    )}>
                      <NotifIcon type={n.type} severity={n.severity} />
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-xs font-bold leading-tight',
                        n.severity === 'error' ? 'text-red-700' : 'text-amber-700',
                      )}>
                        {isAr ? n.titleAr : n.titleEn}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug truncate">
                        {isAr ? n.descAr : n.descEn}
                      </p>
                    </div>

                    {/* Severity indicator */}
                    <div className={cn(
                      'mt-1 w-2 h-2 rounded-full flex-shrink-0',
                      n.severity === 'error' ? 'bg-red-500' : 'bg-amber-400',
                    )} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/60">
              <p className="text-[11px] text-slate-400 text-center">
                {isAr
                  ? `${count} تنبيه يستحق المتابعة`
                  : `${count} alert${count === 1 ? '' : 's'} need attention`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
