import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const valid = () => ({
  NODE_ENV: 'production' as const,
  DATABASE_URL: 'postgresql://fixture:fixture-only-password@db.test.example/qarzhy',
  APP_URL: 'https://finance.example.kz',
  DATA_OPERATOR_NAME: 'Operator fixture',
  DATA_OPERATOR_CONTACT: 'operator@example.invalid',
  COOKIE_SECURE: 'true',
  ALLOW_REGISTRATION: 'false',
});

function check(overrides: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [resolve('scripts/check-production.mjs')], {
    encoding: 'utf8',
    env: {...valid(), ...overrides},
  });
}

describe('standalone production configuration check', () => {
  it.each(['false', 'true'])('accepts an explicit registration mode %s', ALLOW_REGISTRATION => {
    const result = check({ALLOW_REGISTRATION});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it.each([undefined, '', 'TRUE', 'False', '1', 'yes', ' true', 'true ', 'false '])('rejects a missing or malformed registration mode: %s', ALLOW_REGISTRATION => {
    const result = check({ALLOW_REGISTRATION});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ALLOW_REGISTRATION must be explicitly true or false');
  });

  it.each(['false', 'true'])('preserves required settings and secure cookies in mode %s', ALLOW_REGISTRATION => {
    const result = check({ALLOW_REGISTRATION, DATABASE_URL: undefined, APP_URL: 'http://finance.example.kz', COOKIE_SECURE: 'false', DATA_OPERATOR_NAME: undefined, DATA_OPERATOR_CONTACT: undefined});
    expect(result.status).toBe(1);
    for (const field of ['DATABASE_URL', 'APP_URL must use HTTPS', 'COOKIE_SECURE=true', 'DATA_OPERATOR_NAME', 'DATA_OPERATOR_CONTACT']) expect(result.stderr).toContain(field);
  });

  it('does not print configured credentials when rejecting another setting', () => {
    const result = check({ALLOW_REGISTRATION: 'unknown-fixture-setting'});
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain('fixture-only-password');
    expect(result.stdout + result.stderr).not.toContain(valid().DATABASE_URL);
    expect(result.stdout + result.stderr).not.toContain('unknown-fixture-setting');
  });
});
