import {test, expect, type Locator, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const origin = 'http://127.0.0.1:3100';
const password = 'Motion-test-only-password-874!';
const month = '2026-10';
const day = '2026-10-16';
const displayMoney = (minor: number) => new Intl.NumberFormat('ru-KZ', {
  style: 'currency', currency: 'KZT', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(minor / 100);

async function navigate(page: Page, name: string) {
  const button = page.getByRole('navigation', {name: 'Основная навигация'}).getByRole('button', {name, exact: true});
  const menu = page.getByRole('button', {name: 'Открыть меню', exact: true});
  if (await menu.isVisible()) await menu.click();
  await button.click();
}

async function fullyVisible(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  await expect.poll(() => target.evaluate(element => {
    let opacity = 1;
    for (let current: Element | null = element; current; current = current.parentElement) {
      opacity *= Number(getComputedStyle(current).opacity);
    }
    return opacity;
  }), {message: 'Revealed content must settle at full opacity instead of remaining blank'}).toBeGreaterThan(0.98);
}

async function visibleReveals(page: Page) {
  const targets = page.locator('[data-reveal]');
  expect(await targets.count()).toBeGreaterThan(0);
  for (const target of await targets.all()) await fullyVisible(target);
}

async function stableParallax(page: Page) {
  const decorations = page.locator('[data-parallax]');
  const before = await decorations.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  await page.locator('.balance-number').scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Existing decorative rotations are allowed; scrolling must not move them.
  expect(await decorations.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform))).toEqual(before);
}

async function drawnCashflow(page: Page) {
  const incomeCurve = page.locator('.chart-panel .recharts-area-curve').first();
  await expect(incomeCurve).toHaveAttribute('d', /\S/);
  await expect.poll(() => incomeCurve.evaluate(element => (element as SVGGraphicsElement).getBBox().height), {
    message: 'The seeded income curve must be drawn with nonzero financial variation',
  }).toBeGreaterThan(1);
}

for (const mobile of [false, true]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`motion preserves finance and navigation: ${mobile ? 'mobile' : 'desktop'}, ${reducedMotion}`, async ({page}, testInfo) => {
      await page.setViewportSize(mobile ? {width: 390, height: 844} : {width: 1440, height: 1000});
      await page.emulateMedia({reducedMotion});
      const runtimeErrors: string[] = [];
      const assistantRequests: string[] = [];
      page.on('pageerror', error => runtimeErrors.push(error.message));
      page.on('console', message => {if (message.type() === 'error') runtimeErrors.push(message.text());});
      page.on('request', request => {
        if (/\/api\/(assistant|voice)(?:\?|$)/.test(request.url())) assistantRequests.push(request.url());
      });
      const registered = await page.request.post('/api/auth/register', {
        headers: {Origin: origin},
        data: {name: 'Проверка анимаций', email: `${randomUUID()}@example.invalid`, password, consent: true},
      });
      expect(registered.status()).toBe(201);
      try {
        for (const item of [
          {type: 'income', amount: '250000.50', category: 'Зарплата', note: 'Точный доход'},
          {type: 'expense', amount: '1234.56', category: 'Продукты', note: 'Точный расход'},
        ]) {
          const created = await page.request.post('/api/transactions', {
            headers: {Origin: origin}, data: {...item, date: day, requestId: randomUUID()},
          });
          expect(created.status()).toBe(201);
        }
        const profile = await (await page.request.get('/api/me')).json();
        // A configured provider still requires consent; this suite never enables it.
        expect(profile.aiConsent).toBe(false);
        await page.goto('/', {waitUntil: 'domcontentloaded'});
        await expect(page.getByRole('heading', {name: 'Сәлем, Проверка анимаций.'})).toBeVisible();
        await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-ready', 'true');
        await page.getByLabel('Месяц', {exact: true}).fill(month);
        await expect(page.locator('.balance-number')).toHaveText(displayMoney(24876594));
        // Diagnostic only: headless scheduling and host load vary, so this is
        // attached as observed frame cadence, never asserted as an FPS promise.
        const frameCadence = page.evaluate(async () => {
          const intervalsMs: number[] = [];
          let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve));
          for (let index = 0; index < 30; index++) {
            const current = await new Promise<number>(resolve => requestAnimationFrame(resolve));
            intervalsMs.push(Number((current - previous).toFixed(2)));
            previous = current;
          }
          return {environment: 'headless browser; diagnostic only', intervalsMs};
        });
        await visibleReveals(page);
        await testInfo.attach('reveal-frame-cadence.json', {body: JSON.stringify(await frameCadence, null, 2), contentType: 'application/json'});
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        const add = page.getByRole('button', {name: 'Добавить операцию', exact: true}).first();
        await add.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Tab');
        await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(add).toBeFocused();

        await page.locator('.balance-number').evaluate(element => {
          const state = window as Window & {motionAmounts?: string[]; motionAmountObserver?: MutationObserver};
          state.motionAmounts = [element.textContent || ''];
          state.motionAmountObserver = new MutationObserver(() => state.motionAmounts!.push(element.textContent || ''));
          state.motionAmountObserver.observe(element, {subtree: true, characterData: true, childList: true});
        });
        await add.click();
        await page.getByLabel('Сумма, ₸', {exact: true}).fill('0.01');
        await page.getByLabel('Дата', {exact: true}).fill(day);
        await page.getByLabel('Заметка', {exact: false}).fill('Одна тиын для проверки');
        await dialog.getByRole('button', {name: 'Добавить операцию', exact: true}).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('.balance-number')).toHaveText(displayMoney(24876593));
        const amounts = await page.evaluate(async () => {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const state = window as Window & {motionAmounts?: string[]; motionAmountObserver?: MutationObserver};
          state.motionAmountObserver?.disconnect();
          return state.motionAmounts || [];
        });
        expect(amounts.length).toBeGreaterThan(1);
        expect(amounts.every(amount => [displayMoney(24876594), displayMoney(24876593)].includes(amount))).toBe(true);
        const summary = await (await page.request.get(`/api/summary?month=${month}`)).json();
        expect(summary.balance).toBe('24876593');
        expect(summary.expense).toBe('123457');

        await navigate(page, 'Аналитика');
        await expect(page.getByRole('heading', {name: 'Движение денег'})).toBeVisible();
        await visibleReveals(page);
        await drawnCashflow(page);
        await page.getByText('Показать данные по дням', {exact: true}).click();
        const dailyData = page.locator('.chart-data');
        await expect(dailyData.getByRole('cell', {name: displayMoney(25000050), exact: true})).toBeVisible();
        await expect(dailyData.getByRole('cell', {name: displayMoney(123457), exact: true})).toBeVisible();
        await navigate(page, 'ИИ-помощник');
        await expect(page.getByRole('heading', {name: profile.provider.contextMode === 'general' ? 'Разберёмся в финансовых привычках' : 'Разберёмся в вашем бюджете'})).toBeVisible();
        await expect(page.getByText(profile.provider.configured ? 'Нужно ваше разрешение' : 'ИИ ещё не подключён', {exact: true})).toBeVisible();
        await expect(page.getByLabel('Вопрос помощнику')).toBeDisabled();
        await expect(page.getByRole('button', {name: 'Отправить', exact: true})).toBeDisabled();
        // The assistant has its own Motion owner, not GSAP reveal targets.
        await fullyVisible(page.locator('.assistant-main'));
        if (mobile) await expect(page.locator('.assistant-aside')).toBeHidden();
        else await fullyVisible(page.locator('.assistant-aside'));
        await navigate(page, 'Обзор');
        await expect(page.locator('.balance-number')).toHaveText(displayMoney(24876593));
        await visibleReveals(page);
        await drawnCashflow(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (reducedMotion === 'reduce') await stableParallax(page);
        await page.screenshot({path: `test-results/motion-${mobile ? 'mobile' : 'desktop'}-${reducedMotion}.png`, fullPage: true});
        if (!mobile && reducedMotion === 'no-preference') {
          // Changing the system preference while the app is open must clean up
          // active JS motion and must not leave already-revealed content hidden.
          await page.emulateMedia({reducedMotion: 'reduce'});
          await visibleReveals(page);
          await stableParallax(page);
          await expect(page.locator('.balance-number')).toHaveText(displayMoney(24876593));
        }
        expect(assistantRequests).toEqual([]);
        expect(runtimeErrors).toEqual([]);
      } finally {
        const removed = await page.request.delete('/api/account', {headers: {Origin: origin}, data: {password, confirmation: 'УДАЛИТЬ'}});
        expect(removed.status()).toBe(200);
      }
    });
  }
}

test('assistant motion: intercepted test-only provider fixture never calls a real provider', async ({page}) => {
  const runtimeErrors: string[] = [];
  const externalRequests: string[] = [];
  const fixtureQuestion = 'Тестовый вопрос для проверки анимации';
  const fixtureAnswer = 'Тестовая фикстура ответа: реальный ИИ в этом тесте не вызывается.';
  let providerRequests = 0;
  let releaseReply: () => void = () => {};
  const replyReady = new Promise<void>(resolve => {releaseReply = resolve;});
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') runtimeErrors.push(message.text());});
  const registered = await page.request.post('/api/auth/register', {
    headers: {Origin: origin},
    data: {name: 'Тест анимации чата', email: `${randomUUID()}@example.invalid`, password, consent: true},
  });
  expect(registered.status()).toBe(201);
  try {
    const profile = await (await page.request.get('/api/me')).json();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
        externalRequests.push(url.href);
        await route.abort();
      } else await route.continue();
    });
    // Browser-only fixtures do not change consent or provider configuration in DB.
    await page.route('**/api/me', route => route.fulfill({json: {
      ...profile, aiConsent: true,
      provider: {...profile.provider, configured: true, name: 'Тестовая фикстура'},
    }}));
    await page.route('**/api/assistant', async route => {
      providerRequests++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON().message).toBe(fixtureQuestion);
      await replyReady;
      await route.fulfill({json: {answer: fixtureAnswer}});
    });
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('heading', {name: 'Сәлем, Тест анимации чата.'})).toBeVisible();
    await navigate(page, 'ИИ-помощник');
    await fullyVisible(page.locator('.assistant-main'));
    await page.getByLabel('Вопрос помощнику').fill(fixtureQuestion);
    await page.getByRole('button', {name: 'Отправить', exact: true}).click();
    await expect(page.getByText('Обработка запроса…', {exact: true})).toBeVisible();
    await expect(page.locator('.assistant-busy')).toHaveAttribute('role', 'status');
    await expect(page.getByLabel('Вопрос помощнику')).toBeDisabled();
    await expect(page.getByRole('button', {name: 'Обработка…', exact: true})).toBeDisabled();
    releaseReply();
    await expect(page.locator('.message.user p')).toHaveText(fixtureQuestion);
    await expect(page.locator('.message.assistant p')).toHaveText(fixtureAnswer);
    await fullyVisible(page.locator('.message.user'));
    await fullyVisible(page.locator('.message.assistant'));
    await expect(page.locator('.assistant-busy')).toHaveCount(0);
    await expect(page.getByLabel('Вопрос помощнику')).toHaveValue('');
    await expect(page.getByLabel('Вопрос помощнику')).toBeEnabled();
    await page.screenshot({path: 'test-results/motion-assistant-test-fixture.png', fullPage: true});
    await navigate(page, 'Обзор');
    await expect(page.getByRole('heading', {name: 'Сәлем, Тест анимации чата.'})).toBeVisible();
    await navigate(page, 'ИИ-помощник');
    await fullyVisible(page.locator('.assistant-main'));
    await expect(page.locator('.message')).toHaveCount(0);
    expect(providerRequests).toBe(1);
    expect(externalRequests).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  } finally {
    releaseReply();
    const removed = await page.request.delete('/api/account', {headers: {Origin: origin}, data: {password, confirmation: 'УДАЛИТЬ'}});
    expect(removed.status()).toBe(200);
  }
});
