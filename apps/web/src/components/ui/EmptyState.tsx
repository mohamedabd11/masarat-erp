import { cn } from '@/lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center animate-fade-in', className)}>
      {icon && (
        <div className="mb-4 flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-50 to-slate-50 border border-brand-100/60 text-brand-300">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-800 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mb-6 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
