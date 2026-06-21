'use client';

import { cn } from '@/lib/utils';
import { PERMISSION_GROUPS, type FeatureKey } from '@/lib/user-permissions';
import { FEATURE_LABEL } from '@/lib/plan-features';
import { Square, CheckSquare, MinusSquare } from 'lucide-react';

interface PermissionsPickerProps {
  isAr:     boolean;
  selected: FeatureKey[];
  onChange: (next: FeatureKey[]) => void;
  disabled?: boolean;
}

/**
 * Grouped section-permission selector. Each group (Operations / Finance / HR)
 * has a master tri-state toggle plus individual section checkboxes.
 */
export function PermissionsPicker({ isAr, selected, onChange, disabled }: PermissionsPickerProps) {
  const set = new Set(selected);

  function toggle(feature: FeatureKey) {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(feature)) next.delete(feature);
    else next.add(feature);
    onChange([...next]);
  }

  function toggleGroup(features: FeatureKey[], allOn: boolean) {
    if (disabled) return;
    const next = new Set(set);
    if (allOn) features.forEach(f => next.delete(f));
    else features.forEach(f => next.add(f));
    onChange([...next]);
  }

  return (
    <div className={cn('space-y-3', disabled && 'opacity-50 pointer-events-none')}>
      {PERMISSION_GROUPS.map(group => {
        const onCount = group.features.filter(f => set.has(f)).length;
        const allOn   = onCount === group.features.length;
        const someOn  = onCount > 0 && !allOn;

        return (
          <div key={group.key} className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Group header — master toggle */}
            <button
              type="button"
              onClick={() => toggleGroup(group.features, allOn)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-start"
            >
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? group.ar : group.en}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>{onCount}/{group.features.length}</span>
                {allOn  && <CheckSquare size={16} className="text-brand-600" />}
                {someOn && <MinusSquare size={16} className="text-brand-500" />}
                {!allOn && !someOn && <Square size={16} className="text-slate-300" />}
              </span>
            </button>

            {/* Individual sections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
              {group.features.map(feature => {
                const checked = set.has(feature);
                return (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggle(feature)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-start transition-colors bg-white hover:bg-brand-50/50',
                      checked && 'bg-brand-50/60',
                    )}
                  >
                    {checked
                      ? <CheckSquare size={16} className="text-brand-600 flex-shrink-0" />
                      : <Square size={16} className="text-slate-300 flex-shrink-0" />}
                    <span className={cn('text-sm', checked ? 'text-slate-800 font-medium' : 'text-slate-500')}>
                      {isAr ? FEATURE_LABEL[feature].ar : FEATURE_LABEL[feature].en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
