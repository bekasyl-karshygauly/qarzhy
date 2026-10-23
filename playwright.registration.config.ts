import {defineConfig, devices} from '@playwright/test';
import {resolve} from 'node:path';

// This suite is deliberately separate from the usual local app on port 3100.
const mode = process.env.REGISTRATION_TEST_MODE;
if (mode !== 'open' && mode !== 'closed') throw new Error('Set REGISTRATION_TEST_MODE=open or closed.');
const databaseUrl = process.env.REGISTRATION_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('An explicit disposable registration database is required.');
let database: URL;
try {database = new URL(databaseUrl);} catch {throw new Error('Invalid disposable registration database URL.');}
const disposableName = /^\/qarzhy_test_registration_[a-z0-9_]+$/.test(database.pathname)
  || (process.env.CI === 'true' && database.pathname === '/qarzhy_ci');
if (!['postgres:', 'postgresql:'].includes(database.protocol)
  || !['127.0.0.1', 'localhost'].includes(database.hostname)
  || database.searchParams.has('host') || !disposableName) {
  throw new Error('Registration tests require a named, disposable loopback PostgreSQL database.');
}
const port = mode === 'open' ? 3114 : 3115;
const origin = `http://127.0.0.1:${port}`;
const serverEntry = resolve(process.env.REGISTRATION_TEST_SERVER_ENTRY || '.next/standalone/server.js');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'registration.spec.ts',
  grep: mode === 'open' ? /open:/ : /closed:/,
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: {timeout: 10000},
  reporter: 'list',
  outputDir: `test-results/registration-${mode}`,
  use: {
    baseURL: origin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {args: ['--disable-gpu', '--renderer-process-limit=1']},
  },
  projects: [{name: `registration-${mode}`, use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: 'node -e "require(process.env.REGISTRATION_TEST_SERVER_ENTRY)"',
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      REGISTRATION_TEST_SERVER_ENTRY: serverEntry,
      DATABASE_URL: databaseUrl,
      HOSTNAME: '127.0.0.1', PORT: String(port), APP_URL: origin,
      ALLOW_REGISTRATION: mode === 'open' ? 'true' : 'false', COOKIE_SECURE: 'false',
      VERCEL: '', VERCEL_ENV: '', VERCEL_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '',
      AI_API_KEY: '', AI_BASE_URL: '', AI_MODEL: '', AI_PROVIDER_NAME: '',
      AI_PROCESSING_COUNTRY: '', AI_CONTEXT_MODE: 'general', AI_GOOGLE_PAID_SERVICES: 'false', VOICE_MODEL: '',
      DATA_OPERATOR_NAME: 'Registration test fixture', DATA_OPERATOR_CONTACT: 'fixture@example.invalid',
      NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--max-old-space-size=384 --max-semi-space-size=2',
      RAYON_NUM_THREADS: '1', UV_THREADPOOL_SIZE: '2',
    },
  },
});
