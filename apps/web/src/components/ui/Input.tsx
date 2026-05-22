'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, startIcon, endIcon, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ms-1">*</span>}
          </label>
        )}
        <div className="relative">
          {startIcon && (
            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
              {startIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'block w-full rounded-lg border bg-white text-slate-900 text-sm',
              'placeholder:text-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
              'transition-colors duration-150',
              error
                ? 'border-red-400 focus:ring-red-400'
                : 'border-slate-300',
              startIcon ? 'ps-10' : 'ps-3.5',
              endIcon ? 'pe-10' : 'pe-3.5',
              'py-2.5',
              className
            )}
            {...props}
          />
          {endIcon && (
            <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-slate-400">
              {endIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
