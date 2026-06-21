'use client';

import { useState } from 'react';
import type { User } from '@/lib/schema';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { PermissionsPicker } from '@/components/settings/PermissionsPicker';
import { parsePermissions, presetFeatures, ASSIGNABLE_FEATURES, type FeatureKey } from '@/lib/user-permissions';
import { X, Shield, UserCog } from 'lucide-react';

type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

const ROLES: { value: UserRole; ar: string; en: string }[] = [
  { value: 'admin',      ar: 'مدير',        en: 'Admin' },
  { value: 'agent',      ar: 'موظف حجوزات', en: 'Agent' },
  { value: 'accountant', ar: 'محاسب',       en: 'Accountant' },
  { value: 'viewer',     ar: 'مشاهد',       en: 'Viewer' },
];

interface EditUserModalProps {
  isAr:    boolean;
  user:    User;
  isSelf:  boolean;
  onClose: () => void;
  onSaved: (updated: Partial<User> & { id: string }) => void;
}

export function EditUserModal({ isAr, user, isSelf, onClose, onSaved }: EditUserModalProps) {
  const initialRole: UserRole = user.role === 'admin' ? 'admin' : 'agent';
  const [role, setRole] = useState<UserRole>(initialRole);
  const [permissions, setPermissions] = useState<FeatureKey[]>(
    // NULL permissions = the user currently has full access (legacy/unset); start
    // the picker fully checked so saving without changes preserves that access.
    () => parsePermissions(user.permissions) ?? [...ASSIGNABLE_FEATURES],
  );
  const [isActive, setIsActive] = useState<boolean>(user.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function onRoleChange(next: UserRole) {
    setRole(next);
    setPermissions(presetFeatures(next));   // re-fill from preset; admin = full
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const body = {
        role,
        isActive,
        permissions: role === 'admin' ? undefined : permissions,
      };
      const data = await apiFetch<{ user: Partial<User> & { id: string } }>(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved(data.user);
    } catch (err: unknown) {
      setError((err as { message?: string }).message || (isAr ? 'تعذّر الحفظ' : 'Could not save'));
      setSaving(false);
    }
  }

  const displayName = isAr ? (user.nameAr || user.nameEn) : (user.nameEn || user.nameAr);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 rounded-xl">
              <UserCog size={18} className="text-brand-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {isAr ? 'تعديل صلاحيات المستخدم' : 'Edit User Permissions'}
              </h3>
              <p className="text-xs text-slate-400">{displayName || user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <div className="flex items-center gap-1.5">
                <Shield size={14} className="text-slate-400" />
                {isAr ? 'الدور' : 'Role'}
              </div>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => {
                const disabled = isSelf && r.value !== 'admin' && initialRole === 'admin';
                return (
                  <button
                    key={r.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onRoleChange(r.value)}
                    className={cn(
                      'p-2.5 rounded-xl border-2 text-sm font-semibold transition-colors',
                      role === r.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                      disabled && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {isAr ? r.ar : r.en}
                  </button>
                );
              })}
            </div>
            {isSelf && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                {isAr ? 'لا يمكنك تخفيض صلاحية حسابك أو تعطيله.' : 'You cannot downgrade or deactivate your own account.'}
              </p>
            )}
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {isAr ? 'الأقسام المتاحة' : 'Accessible sections'}
            </label>
            {role === 'admin' ? (
              <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 text-sm text-brand-700">
                {isAr ? 'المدير لديه صلاحية كاملة على كل الأقسام.' : 'An admin has full access to every section.'}
              </div>
            ) : (
              <PermissionsPicker isAr={isAr} selected={permissions} onChange={setPermissions} />
            )}
          </div>

          {/* Active toggle */}
          <label className={cn('flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200', isSelf && 'opacity-50')}>
            <span className="text-sm font-medium text-slate-700">
              {isAr ? 'الحساب مفعّل' : 'Account active'}
            </span>
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={e => setIsActive(e.target.checked)}
              className="w-5 h-5 accent-brand-600"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" type="button" fullWidth onClick={onClose}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="button" fullWidth loading={saving} onClick={save}>
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
