import { describe, it, expect } from 'vitest';
import {
  userHasFeature,
  parsePermissions,
  sanitizePermissions,
  presetFeatures,
  featureForPath,
  ASSIGNABLE_FEATURES,
  moduleEnabled,
  parseEnabledModules,
  sanitizeEnabledModules,
} from '@/lib/user-permissions';

describe('userHasFeature', () => {
  it('owner/admin always have access regardless of permissions', () => {
    expect(userHasFeature('admin', [], 'accounting')).toBe(true);
    expect(userHasFeature('owner', [], 'invoices')).toBe(true);
  });

  it('common features (app shell) are always allowed', () => {
    expect(userHasFeature('agent', [], 'dashboard')).toBe(true);
    expect(userHasFeature('agent', [], 'settings')).toBe(true);
  });

  it('null permissions = full access (legacy users)', () => {
    expect(userHasFeature('agent', null, 'accounting')).toBe(true);
  });

  it('restricted user can reach only granted sections', () => {
    expect(userHasFeature('agent', ['bookings'], 'bookings')).toBe(true);
    expect(userHasFeature('agent', ['bookings'], 'accounting')).toBe(false);
  });

  it('empty permission list blocks every non-common section', () => {
    expect(userHasFeature('agent', [], 'bookings')).toBe(false);
    expect(userHasFeature('agent', [], 'invoices')).toBe(false);
  });
});

describe('presetFeatures', () => {
  it('admin preset = every assignable feature', () => {
    expect(presetFeatures('admin').sort()).toEqual([...ASSIGNABLE_FEATURES].sort());
  });
  it('accountant preset includes finance, excludes bookings', () => {
    const p = presetFeatures('accountant');
    expect(p).toContain('invoices');
    expect(p).toContain('accounting');
    expect(p).not.toContain('bookings');
  });
  it('agent preset includes operations, excludes accounting', () => {
    const p = presetFeatures('agent');
    expect(p).toContain('bookings');
    expect(p).not.toContain('accounting');
  });
});

describe('parsePermissions / sanitizePermissions', () => {
  it('null/garbage → null (full access)', () => {
    expect(parsePermissions(null)).toBeNull();
    expect(parsePermissions('not json')).toBeNull();
    expect(parsePermissions('{}')).toBeNull();
  });
  it('keeps only known assignable keys', () => {
    expect(parsePermissions('["bookings","__bogus__","invoices"]')).toEqual(['bookings', 'invoices']);
  });
  it('sanitize drops unknown keys and de-dupes', () => {
    expect(sanitizePermissions(['bookings', 'bookings', 'nope']).sort()).toEqual(['bookings']);
    expect(sanitizePermissions('x')).toEqual([]);
  });
});

describe('featureForPath', () => {
  const cases: [string, string | null][] = [
    ['/api/bookings/abc',          'bookings'],
    ['/api/bookings/abc/lines',    'bookings'],
    ['/api/invoices/create',       'invoices'],
    ['/api/invoices/credit-note',  'invoices'],
    ['/api/accounting/journal',    'accounting'],
    ['/api/reports/pl',            'reports'],
    ['/api/reports/dashboard',     null],
    ['/api/employees/payslips',    'payroll'],
    ['/api/employees/123',         'employees'],
    ['/api/settings/providers',    'providers'],
    ['/api/settings',              null],
    ['/api/users/me',              null],
    ['/api/agencies/my-features',  null],
    ['/api/agencies/zatca/status', 'vat'],
    ['/api/notifications',         null],
  ];
  for (const [path, feature] of cases) {
    it(`${path} → ${feature ?? 'common'}`, () => {
      const r = featureForPath(path);
      expect(r.matched).toBe(true);
      expect(r.feature).toBe(feature);
    });
  }

  it('unknown path is reported as unmatched', () => {
    expect(featureForPath('/api/totally-unknown').matched).toBe(false);
  });
});

describe('agency modules', () => {
  it('core modules are always enabled', () => {
    expect(moduleEnabled([], 'bookings')).toBe(true);
    expect(moduleEnabled([], 'customers')).toBe(true);
  });
  it('null list = all enabled', () => {
    expect(moduleEnabled(null, 'flights')).toBe(true);
  });
  it('respects the enabled list for non-core modules', () => {
    expect(moduleEnabled(['flights'], 'flights')).toBe(true);
    expect(moduleEnabled(['flights'], 'hotels')).toBe(false);
  });
  it('sanitize always keeps core modules', () => {
    const s = sanitizeEnabledModules(['flights']);
    expect(s).toContain('bookings');
    expect(s).toContain('customers');
    expect(s).toContain('flights');
  });
  it('parse drops unknown module ids', () => {
    expect(parseEnabledModules('["flights","__x__"]')).toEqual(['flights']);
    expect(parseEnabledModules(null)).toBeNull();
  });
});
