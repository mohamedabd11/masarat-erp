/**
 * Permission-gate coverage guard.
 *
 * The section-level authorization gate lives in ONE place (lib/api-auth.ts →
 * verifyAuth), which maps each request path to a feature via featureForPath().
 * That central design is only safe if EVERY api route resolves to a rule —
 * otherwise a new route could slip through unclassified. This static guard walks
 * every route.ts and asserts featureForPath() matches it (to a feature, or to
 * `null` for deliberately-common/admin/cron routes).
 *
 * When you add a new API route, add a rule to ROUTE_RULES in user-permissions.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { featureForPath } from '@/lib/user-permissions';

const API_ROOT = join(__dirname, '..', 'app', 'api');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

describe('route → feature coverage (central permission gate)', () => {
  it('every API route is classified by featureForPath', () => {
    const files = walk(API_ROOT);
    expect(files.length).toBeGreaterThan(50); // sanity: the scan actually ran

    const unmatched: string[] = [];
    for (const file of files) {
      const rel = file.slice(API_ROOT.length + 1).replace(/\/route\.ts$/, '');
      if (!featureForPath('/api/' + rel).matched) unmatched.push(rel);
    }

    if (unmatched.length > 0) {
      throw new Error(
        `Found ${unmatched.length} API route(s) with no permission-gate rule. Add a prefix to ` +
        `ROUTE_RULES in lib/user-permissions.ts (use null for common/admin/cron routes):\n` +
        unmatched.map(r => `  ${r}`).join('\n'),
      );
    }
    expect(unmatched).toEqual([]);
  });
});
