import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: number;
    label: string;
    direction: 'up' | 'down' | 'neutral';
  };
  className?: string;
  accentColor?: string; // left border color class e.g. 'border-brand-500'
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-brand-600',
  iconBg = 'bg-brand-50',
  trend,
  className,
  accentColor = 'border-brand-500',
}: StatsCardProps) {
  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 sm:p-5',
      'border-s-4', accentColor, className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 sm:mb-2 truncate">
            {title}
          </p>
          <p className="text-lg sm:text-2xl md:text-[28px] leading-tight font-extrabold text-slate-900 tabular-nums mb-1.5 sm:mb-2 break-words">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.direction === 'up'      ? 'bg-emerald-50 text-emerald-700' : '',
              trend.direction === 'down'    ? 'bg-red-50 text-red-600'         : '',
              trend.direction === 'neutral' ? 'bg-slate-100 text-slate-500'    : '',
            )}>
              {trend.direction === 'up'   && '↑'}
              {trend.direction === 'down' && '↓'}
              <span>{trend.value}%</span>
              <span className="opacity-70">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('p-2 sm:p-3 rounded-xl flex-shrink-0', iconBg)}>
          <Icon size={20} className={iconColor} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
