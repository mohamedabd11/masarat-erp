'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { Clock, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WA_NUMBER    = '249969837823';
const DISMISS_KEY  = 'masarat_trial_banner_dismissed_v2';

export function TrialBanner() {
  const locale   = useLocale();
  const isAr     = locale === 'ar';
  const { status, daysRemaining, agencyName } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    }
  }, []);

  if (dismissed || status !== 'trial' || daysRemaining === null || daysRemaining <= 0) return null;

  const urgent  = daysRemaining <= 3;
  const warning = daysRemaining <= 7;

  const waMsg = agencyName
    ? `مرحباً فريق مسارات، أرغب في تفعيل اشتراك وكالتي (${agencyName}).`
    : 'مرحباً فريق مسارات، أرغب في تفعيل اشتراكي.';

  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium',
      urgent  ? 'bg-red-600   text-white' :
      warning ? 'bg-amber-500 text-white' :
                'bg-brand-600 text-white',
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <Clock size={15} className="flex-shrink-0" />
        <span className="truncate">
          {isAr
            ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'} على انتهاء الفترة التجريبية`
            : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in your free trial`}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap',
            urgent  ? 'bg-white text-red-700   hover:bg-red-50' :
            warning ? 'bg-white text-amber-700 hover:bg-amber-50' :
                      'bg-white text-brand-700 hover:bg-brand-50',
          )}
        >
          <MessageCircle size={12} />
          {isAr ? 'تواصل لتفعيل اشتراكك' : 'Activate Subscription'}
        </a>

        <button
          onClick={handleDismiss}
          aria-label={isAr ? 'إخفاء' : 'Dismiss'}
          className="p-1 rounded opacity-70 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

