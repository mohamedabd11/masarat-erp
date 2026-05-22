import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
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
}: StatsCardProps) {
  return (
    <Card className={cn('hover:shadow-md transition-shadow duration-200', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mb-1 truncate">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          {trend && (
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 text-xs font-medium',
              trend.direction === 'up' ? 'text-emerald-600' : '',
              trend.direction === 'down' ? 'text-red-600' : '',
              trend.direction === 'neutral' ? 'text-slate-500' : '',
            )}>
              {trend.direction === 'up' && '↑'}
              {trend.direction === 'down' && '↓'}
              {trend.value}% {trend.label}
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}>
          <Icon size={22} className={iconColor} />
        </div>
      </div>
    </Card>
  );
}
