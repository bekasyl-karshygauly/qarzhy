import {test, expect, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const origin = 'http://127.0.0.1:3100';
const password = 'Gemini-disposable-test-only-375!';
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', {name: 'Открыть меню', exact: true});
  if (await menu.isVisible()) await menu.click();
  const target = name === 'Настройки'
    ? page.getByRole('button', {name, exact: true})
    : page.getByRole('navigation', {name: 'Основная навигация'}).getByRole('button', {name, exact: true});
  await target.click();
}

test('Gemini: explicit consent, real general answer, quota recovery, mobile and consent revocation', async ({page, playwright}) => {
  test.skip(process.env.LIVE_GEMINI_TEST !== 'true', 'Real Gemini request is opt-in and requires a configured server.');
  test.setTimeout(90000);
  const client = await playwright.request.newContext({baseURL: origin, extraHTTPHeaders: {Origin: origin}});
  const runtimeErrors: string[] = []; const externalRequests: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('request', request => {if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());});
  let registered = false;
  try {
    const registration = await client.post('/api/auth/register', {data: {name: 'Проверка Gemini', email: `${randomUUID()}@example.invalid`, password, consent: true}});
    expect(registration.status()).toBe(201); registered = true;
    const profile = await (await client.get('/api/me')).json();
    expect(profile.provider).toMatchObject({configured: true, contextMode: 'general', dataPolicy: 'google-unpaid', voiceConfigured: false});
    expect(profile.aiConsent).toBe(false);
    expect(profile).not.toHaveProperty('AI_API_KEY');
    expect((await client.post('/api/assistant', {data: {message: 'Как вести бюджет?', month: '2026-10'}})).status()).toBe(403);
    const before = await (await client.get('/api/summary?month=2026-10')).json();
    await page.context().addCookies((await client.storageState()).cookies);
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    await navigate(page, 'ИИ-помощник');
    await expect(page.getByRole('heading', {name: 'Разберёмся в финансовых привычках'})).toBeVisible();
    await expect(page.getByLabel('Вопрос помощнику')).toBeDisabled();
    await expect(page.getByText('Нужно ваше разрешение', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Открыть настройки →', exact: true}).click();
    const consent = page.getByRole('checkbox', {name: /Разрешаю передачу введённого мной вопроса/});
    await consent.check();
    await expect(page.getByRole('checkbox', {name: /Разрешаю передачу аудиозаписи/})).toBeDisabled();
    await page.getByRole('button', {name: 'Сохранить разрешения', exact: true}).click();
    await expect(page.getByText('Разрешения сохранены.', {exact: true})).toBeVisible();
    await navigate(page, 'ИИ-помощник');
    const question = 'Что такое финансовая подушка? Ответь двумя предложениями без личных сведений.';
    await page.getByLabel('Вопрос помощнику').fill(question);
    const responseReady = page.waitForResponse(response => response.url().endsWith('/api/assistant') && response.request().method() === 'POST', {timeout: 55000});
    await page.getByRole('button', {name: 'Отправить', exact: true}).click();
    await expect(page.getByText('Обработка запроса…', {exact: true})).toBeVisible();
    await expect(page.getByLabel('Вопрос помощнику')).toBeDisabled();
    const response = await responseReady;
    const result = await response.json();
    expect(response.status(), result.error || 'Expected a real Gemini answer').toBe(200);
    const answer = result.answer;
    expect(typeof answer).toBe('string'); expect(answer.trim().length).toBeGreaterThan(15);
    await expect(page.locator('.message.assistant p')).toHaveText(answer);
    await expect(page.getByLabel('Вопрос помощнику')).toBeEmpty();
    await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
    await page.screenshot({path: '.design/gemini-assistant.png', fullPage: true});
    await page.setViewportSize({width: 320, height: 800});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: '.design/gemini-assistant-mobile.png', fullPage: true});

    // This error fixture is isolated to the browser test; the success above is real.
    await page.route('**/api/assistant', route => route.fulfill({status: 429, json: {error: 'Тест лимита провайдера: повторите позже.'}}));
    await page.getByLabel('Вопрос помощнику').fill('Как планировать покупки?');
    await page.getByRole('button', {name: 'Отправить', exact: true}).click();
    await expect(page.locator('.assistant-main').getByRole('alert')).toContainText('Тест лимита провайдера');
    await expect(page.getByLabel('Вопрос помощнику')).toHaveValue('Как планировать покупки?');
    await expect(page.getByRole('button', {name: 'Отправить', exact: true})).toBeEnabled();
    await page.unroute('**/api/assistant');
    await navigate(page, 'Настройки');
    await page.getByRole('checkbox', {name: /Разрешаю передачу введённого мной вопроса/}).uncheck();
    await page.getByRole('button', {name: 'Сохранить разрешения', exact: true}).click();
    await expect(page.getByText('Разрешения сохранены.', {exact: true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await client.post('/api/assistant', {data: {message: 'Как вести бюджет?', month: '2026-10'}})).status()).toBe(403);
    expect(await (await client.get('/api/summary?month=2026-10')).json()).toEqual(before);
    expect(runtimeErrors).toEqual([]); expect(externalRequests).toEqual([]);
  } finally {
    if (registered) expect((await client.delete('/api/account', {data: {password, confirmation: 'УДАЛИТЬ'}})).status()).toBe(200);
    await client.dispose();
  }
});
