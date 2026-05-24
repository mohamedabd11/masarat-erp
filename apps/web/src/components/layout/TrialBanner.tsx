'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TrialBanner() {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const { status, daysRemaining } = useSubscription();

  if (status !== 'trial' || daysRemaining === null || daysRemaining <= 0) return null;

  const urgent  = daysRemaining <= 3;
  const warning = daysRemaining <= 7;

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium',
      urgent  ? 'bg-red-600    text-white' :
      warning ? 'bg-amber-500  text-white' :
                'bg-brand-600  text-white',
    )}>
      <div className="flex items-center gap-2">
        <Clock size={15} className="flex-shrink-0" />
        <span>
          {isAr
            ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'} على انتهاء الفترة التجريبية`
            : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in your free trial`}
        </span>
      </div>
      <Link
        href={`/${locale}/settings?tab=billing`}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex-shrink-0',
          urgent  ? 'bg-white text-red-700   hover:bg-red-50' :
          warning ? 'bg-white text-amber-700 hover:bg-amber-50' :
                    'bg-white text-brand-700 hover:bg-brand-50',
        )}
      >
        <Zap size={12} />
        {isAr ? 'ترقية الآن' : 'Upgrade Now'}
      </Link>
    </div>
  );
}
