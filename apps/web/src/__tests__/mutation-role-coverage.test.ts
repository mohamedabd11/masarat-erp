/**
 * Every authenticated mutation must enforce a role in addition to its section
 * permission. This is what keeps the viewer role read-only even when it may see
 * the corresponding section.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '..', 'app', 'api');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name === 'route.ts') out.push(path);
  }
  return out;
}

interface Violation { route: string; method: string }

function scan(file: string): Violation[] {
  const source = readFileSync(file, 'utf8');
  const route = file.slice(API_ROOT.length + 1).replaceAll('\\', '/').replace(/\/route\.ts$/, '');
  const handlers = source.matchAll(
    /export async function (POST|PUT|PATCH|DELETE)[\s\S]*?(?=export async function|$)/g,
  );
  const violations: Violation[] = [];

  for (const match of handlers) {
    const method = match[1]!;
    const body = match[0];
    if (!body.includes('verifyAuth(')) continue;
    if (route === 'users/me' && method === 'PATCH') continue; // self-service profile names only
    if (!body.includes('assertRole(')) violations.push({ route, method });
  }
  return violations;
}

describe('authenticated mutation role coverage', () => {
  it('keeps viewer accounts read-only on every protected mutation', () => {
    const violations = walk(API_ROOT).flatMap(scan);
    if (violations.length > 0) {
      throw new Error(
        'Authenticated mutations missing assertRole():\n' +
        violations.map(v => `  ${v.method} /api/${v.route}`).join('\n'),
      );
    }
    expect(violations).toEqual([]);
  });
});
