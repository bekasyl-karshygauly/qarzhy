import {describe, expect, it} from 'vitest';
import {appUrl, vercelConfigurationErrors} from '../../src/lib/hosting';
import {validOrigin} from '../../src/lib/security';

const valid = () => ({VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'qarzhy.vercel.app',
  DATABASE_URL: 'postgresql://fixture:fixture-only-password@db.test.example/qarzhy?sslmode=require&sslaccept=strict',
  COOKIE_SECURE: 'true', ALLOW_REGISTRATION: 'false', DATA_OPERATOR_NAME: 'Operator fixture', DATA_OPERATOR_CONTACT: 'operator@example.invalid'});

describe('deployment origins keep the existing CSRF boundary', () => {
  it('preserves local and explicitly configured URLs', () => {
    expect(appUrl({})).toBe('http://127.0.0.1:3100');
    expect(appUrl({...valid(), APP_URL: 'https://finance.example.kz'})).toBe('https://finance.example.kz');
  });
  it('uses the canonical production URL, including a custom domain', () => {
    expect(appUrl(valid())).toBe('https://qarzhy.vercel.app');
    expect(appUrl({...valid(), VERCEL_PROJECT_PRODUCTION_URL: 'finance.example.kz'})).toBe('https://finance.example.kz');
  });
  it('selects the preview deployment, never an unrelated production origin', () => {
    const allowed = appUrl({...valid(), VERCEL_ENV: 'preview', VERCEL_URL: 'qarzhy-123-team.vercel.app'});
    expect(validOrigin('https://qarzhy-123-team.vercel.app', allowed)).toBe(true);
    for (const origin of [null, 'https://qarzhy.vercel.app', 'https://evil.vercel.app', 'https://qarzhy-123-team.vercel.app.evil.example', 'http://qarzhy-123-team.vercel.app']) expect(validOrigin(origin, allowed)).toBe(false);
  });
  it.each(['https://evil.example', 'safe.vercel.app@evil.example', 'safe.vercel.app/path', 'safe.vercel.app?x=1', '*.vercel.app', 'safe.vercel.app:443', 'safe.vercel.app\\evil'])('rejects malformed platform hosts: %s', VERCEL_URL => {
    expect(appUrl({VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL})).toBe('');
  });
  it('fails closed when Vercel system URLs are missing', () => {
    expect(appUrl({VERCEL: '1', VERCEL_ENV: 'production'})).toBe('');
    expect(validOrigin('https://anything.vercel.app', appUrl({VERCEL: '1'}))).toBe(false);
  });
});

describe('Vercel configuration preflight', () => {
  it('accepts a closed pilot without requiring an optional AI provider', () => expect(vercelConfigurationErrors(valid())).toEqual([]));
  it.each([
    'postgresql://fixture:fixture-password@localhost/qarzhy?sslmode=require&sslaccept=strict',
    'postgresql://fixture:fixture-password@127.0.0.1/qarzhy?sslmode=require&sslaccept=strict',
    'postgresql://fixture:fixture-password@postgres/qarzhy?sslmode=require&sslaccept=strict',
    'postgresql://fixture:fixture-password@db.test.example/qarzhy',
    'postgresql://fixture:fixture-password@db.test.example/qarzhy?sslmode=require&sslaccept=accept_invalid_certs',
    'postgresql://fixture:fixture-password@db.test.example/qarzhy?sslmode=require&sslmode=disable&sslaccept=strict',
    'postgresql://fixture:fixture-password@db.test.example/qarzhy?sslmode=require&sslaccept=strict&host=/tmp',
  ])('rejects inaccessible or insecure database settings without leaking them', DATABASE_URL => {
    const errors = vercelConfigurationErrors({...valid(), DATABASE_URL});
    expect(errors.some(error => error.startsWith('DATABASE_URL:'))).toBe(true);
    expect(errors.join()).not.toContain('fixture-password');
    expect(errors.join()).not.toContain(DATABASE_URL);
  });
  it('requires secure cookies, closed registration and operator details', () => {
    const errors = vercelConfigurationErrors({...valid(), COOKIE_SECURE:'false', ALLOW_REGISTRATION:'true', DATA_OPERATOR_NAME:'', DATA_OPERATOR_CONTACT:''});
    expect(errors).toHaveLength(4);
  });
  it('does not let malformed explicit URLs fall through to a valid platform URL', () => {
    expect(vercelConfigurationErrors({...valid(), APP_URL:'https://user:secret@finance.example.kz/'}).some(error => error.startsWith('APP_URL:'))).toBe(true);
    expect(vercelConfigurationErrors({...valid(), APP_URL:'http://finance.example.kz'}).some(error => error.startsWith('APP_URL:'))).toBe(true);
  });
  it('rejects public and incomplete AI secrets, printing field names only', () => {
    const secret = 'fixture-only-hidden-value';
    const errors = vercelConfigurationErrors({...valid(), AI_API_KEY:secret, AI_BASE_URL:'http://ai.test.example', NEXT_PUBLIC_AI_API_KEY:secret});
    expect(errors.some(error => error.startsWith('NEXT_PUBLIC_AI_API_KEY:'))).toBe(true);
    expect(errors.some(error => error.startsWith('AI_MODEL:'))).toBe(true);
    expect(errors.join()).not.toContain(secret);
  });
});
