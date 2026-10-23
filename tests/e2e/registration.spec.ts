import {test, expect, type APIRequestContext, type Page} from '@playwright/test';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../../src/lib/security';
import {consentVersion} from '../../src/lib/privacy';

// Never silently fall back to the user's normal DATABASE_URL or the app on port 3100.
const mode = process.env.REGISTRATION_TEST_MODE;
const configured = (mode === 'open' || mode === 'closed') && Boolean(process.env.REGISTRATION_TEST_DATABASE_URL);
const password = 'Registration-fixture-9482!';
let db: PrismaClient;

function fixtureDatabase() {
  let url: URL;
  try {url = new URL(process.env.REGISTRATION_TEST_DATABASE_URL || '');} catch {throw new Error('Invalid disposable registration database URL.');}
  const disposable = /^\/qarzhy_test_registration_[a-z0-9_]+$/.test(url.pathname)
    || (process.env.CI === 'true' && url.pathname === '/qarzhy_ci');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.searchParams.has('host') || !disposable) {
    throw new Error('Registration fixtures may only use an explicitly named disposable loopback database.');
  }
  return url.toString();
}
function fixtureEmail() {return `registration-${randomUUID()}@example.invalid`;}
function originForMode() {return `http://127.0.0.1:${mode === 'open' ? 3114 : 3115}`;}
function submit(client: APIRequestContext, data: unknown) {
  return client.post('/api/auth/register', {headers: {Origin: originForMode()}, data});
}
async function fillRegistration(page: Page, email: string, name: string) {
  await page.getByLabel('Как к вам обращаться').fill(name);
  await page.getByLabel('Email', {exact: true}).fill(email);
  await page.getByLabel('Пароль', {exact: true}).fill(password);
}
async function databaseCounts() {
  const [users, sessions, transactions, goals, accounts, transfers, budgets, recurring, rateLimits] = await Promise.all([
    db.user.count(), db.session.count(), db.transaction.count(), db.goal.count(), db.account.count(),
    db.transfer.count(), db.budget.count(), db.recurringPayment.count(), db.rateLimit.count(),
  ]);
  return {users, sessions, transactions, goals, accounts, transfers, budgets, recurring, rateLimits};
}

test.describe('registration follows the actual server setting', () => {
  test.skip(!configured, 'Run with playwright.registration.config.ts and a disposable database.');
  test.beforeAll(async () => {db = new PrismaClient({datasources: {db: {url: fixtureDatabase()}}, log: []}); await db.$connect();});
  test.afterAll(async () => {await db?.$disconnect();});

  test('open: browser consent, new-account isolation, persisted session and later login', async ({page, playwright}, testInfo) => {
    test.skip(mode !== 'open');
    const ownEmail = fixtureEmail(); const otherEmail = fixtureEmail();
    const ownName = 'Проверка регистрации';
    const otherNote = `Other-owner-only-${randomUUID()}`;
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const other = await playwright.request.newContext({baseURL: originForMode(), extraHTTPHeaders: {Origin: originForMode()}});
    try {
      expect((await submit(other, {name: 'Другой тест', email: otherEmail, password, consent: true})).status()).toBe(201);
      expect((await other.post('/api/transactions', {data: {type: 'expense', amount: '100', category: 'Продукты', note: otherNote, date: '2026-10-23', requestId: randomUUID()}})).status()).toBe(201);
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      await expect(page.getByRole('button', {name: 'Регистрация', exact: true})).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', {name: 'Вход', exact: true})).toBeVisible();
      await fillRegistration(page, ownEmail, ownName);
      const consent = page.getByRole('checkbox', {name: /Согласен на обработку данных/});
      await expect(consent).not.toBeChecked();
      await expect(page.getByRole('link', {name: 'политике конфиденциальности', exact: true})).toHaveAttribute('href', '/privacy');
      const displayedPolicy = await page.request.get('/privacy');
      expect(displayedPolicy.status()).toBe(200); expect(await displayedPolicy.text()).toContain(consentVersion);
      let attemptedRegistrations = 0;
      page.on('request', request => {if (request.url().endsWith('/api/auth/register') && request.method() === 'POST') attemptedRegistrations++;});
      await page.getByRole('button', {name: 'Создать аккаунт', exact: true}).click();
      expect(attemptedRegistrations).toBe(0);
      expect(await db.user.count({where: {email: ownEmail}})).toBe(0);
      await page.screenshot({path: testInfo.outputPath('open-registration-desktop.png'), fullPage: true});
      await page.setViewportSize({width: 390, height: 844});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path: testInfo.outputPath('open-registration-mobile.png'), fullPage: true});
      await page.setViewportSize({width: 1440, height: 1000});
      await consent.check();
      const registered = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
      await page.getByRole('button', {name: 'Создать аккаунт', exact: true}).click();
      expect((await registered).status()).toBe(201);
      await expect(page.getByRole('heading', {name: `Сәлем, ${ownName}.`, exact: true})).toBeVisible();
      const stored = await db.user.findUniqueOrThrow({where: {email: ownEmail}});
      expect(stored.consentVersion).toBe(consentVersion); expect(stored.consentAt.getTime()).toBeGreaterThan(Date.now() - 60000);
      expect(stored.aiConsent).toBe(false); expect(stored.voiceConsent).toBe(false); expect(stored.providerConsent).toBeNull();
      expect(stored.passwordHash).not.toBe(password);
      const exported = await (await page.request.get('/api/export')).json();
      expect(exported.profile.email).toBe(ownEmail); expect(exported.profile.passwordHash).toBeUndefined();
      for (const collection of ['transactions', 'goals', 'budgets', 'recurring', 'accounts', 'transfers']) expect(exported[collection]).toEqual([]);
      await expect(page.getByText(otherNote, {exact: true})).toHaveCount(0);
      const cookies = await page.context().cookies();
      const session = cookies.find(cookie => cookie.name === 'qarzhy_session');
      expect(session).toMatchObject({httpOnly: true, sameSite: 'Lax', path: '/', secure: false});
      await page.reload({waitUntil: 'domcontentloaded'});
      await expect(page.getByRole('heading', {name: `Сәлем, ${ownName}.`, exact: true})).toBeVisible();
      await page.getByRole('button', {name: 'Выйти', exact: true}).click();
      await expect(page.getByRole('button', {name: 'Создать аккаунт', exact: true})).toBeVisible();
      expect((await page.request.get('/api/me')).status()).toBe(401);
      await fillRegistration(page, ownEmail, ownName);
      await consent.check();
      await page.getByRole('button', {name: 'Создать аккаунт', exact: true}).click();
      await expect(page.locator('.error-message[role="alert"]')).toContainText('Попробуйте войти');
      expect(await db.user.count({where: {email: ownEmail}})).toBe(1);
      await page.getByRole('button', {name: 'Вход', exact: true}).click();
      await page.getByLabel('Email', {exact: true}).fill(ownEmail);
      await page.getByLabel('Пароль', {exact: true}).fill('Incorrect-but-long-9381!');
      await page.getByRole('button', {name: 'Войти', exact: true}).click();
      await expect(page.locator('.error-message[role="alert"]')).toContainText('Неверный email или пароль');
      await page.getByLabel('Пароль', {exact: true}).fill(password);
      await page.getByRole('button', {name: 'Войти', exact: true}).click();
      await expect(page.getByRole('heading', {name: `Сәлем, ${ownName}.`, exact: true})).toBeVisible();
      const nextSession = (await page.context().cookies()).find(cookie => cookie.name === 'qarzhy_session');
      expect(nextSession?.value === session?.value).toBe(false);
      expect(await db.session.count({where: {userId: stored.id}})).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await other.dispose();
      await db.user.deleteMany({where: {email: {in: [ownEmail, otherEmail]}}});
    }
  });

  test('open: API rejects invalid input, missing consent, wrong origin and duplicate email', async ({request}) => {
    test.skip(mode !== 'open');
    const email = fixtureEmail(); const valid = {name: 'Тест валидации', email, password, consent: true};
    try {
      for (const invalid of [{...valid, consent: false}, {...valid, consent: undefined}, {...valid, password: 'short'}, {...valid, email: 'invalid-email'}, {...valid, name: 'A'}]) {
        expect((await submit(request, invalid)).status()).toBe(400);
        expect(await db.user.count({where: {email}})).toBe(0);
      }
      expect((await request.post('/api/auth/register', {headers: {Origin: 'https://different-origin.example.invalid'}, data: valid})).status()).toBe(403);
      expect(await db.user.count({where: {email}})).toBe(0);
      expect((await submit(request, valid)).status()).toBe(201);
      const duplicate = await submit(request, valid);
      expect(duplicate.status()).toBe(409);
      expect((await duplicate.json()).error).toContain('Попробуйте войти');
      expect(await db.user.count({where: {email}})).toBe(1);
    } finally {await db.user.deleteMany({where: {email}});}
  });

  test('closed: login-only UI and direct registration cannot write rows; existing login works', async ({page}, testInfo) => {
    test.skip(mode !== 'closed');
    const email = fixtureEmail(); const rejectedEmail = fixtureEmail();
    const name = 'Существующий тест';
    await db.user.create({data: {name, email, passwordHash: await hashPassword(password), consentVersion: 'registration-test-fixture'}});
    try {
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      await expect(page.getByRole('heading', {name: 'С возвращением', exact: true})).toBeVisible();
      await expect(page.getByRole('button', {name: 'Регистрация', exact: true})).toHaveCount(0);
      await expect(page.getByRole('button', {name: 'Создать аккаунт', exact: true})).toHaveCount(0);
      await expect(page.getByLabel('Как к вам обращаться')).toHaveCount(0);
      await expect(page.getByRole('checkbox', {name: /Согласен на обработку данных/})).toHaveCount(0);
      await expect(page.getByText(/Регистрация.*закрыта/).first()).toBeVisible();
      await expect(page.getByRole('button', {name: 'Войти', exact: true})).toBeVisible();
      await page.screenshot({path: testInfo.outputPath('closed-login-desktop.png'), fullPage: true});
      await page.setViewportSize({width: 320, height: 740});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path: testInfo.outputPath('closed-login-mobile.png'), fullPage: true});
      const before = await databaseCounts();
      const denied = await submit(page.request, {name: 'Rejected fixture', email: rejectedEmail, password, consent: true});
      expect(denied.status()).toBe(403);
      expect((await denied.json()).error).toContain('Регистрация закрыта');
      expect(await databaseCounts()).toEqual(before);
      expect(await db.user.count({where: {email: rejectedEmail}})).toBe(0);
      await page.getByLabel('Email', {exact: true}).fill(email);
      await page.getByLabel('Пароль', {exact: true}).fill(password);
      await page.getByRole('button', {name: 'Войти', exact: true}).click();
      await expect(page.getByRole('heading', {name: `Сәлем, ${name}.`, exact: true})).toBeVisible();
      await page.reload({waitUntil: 'domcontentloaded'});
      await expect(page.getByRole('heading', {name: `Сәлем, ${name}.`, exact: true})).toBeVisible();
    } finally {await db.user.deleteMany({where: {email: {in: [email, rejectedEmail]}}});}
  });
});
