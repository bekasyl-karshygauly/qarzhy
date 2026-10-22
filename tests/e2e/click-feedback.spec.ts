import {test, expect, type Locator, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const origin = 'http://127.0.0.1:3100';
const password = 'Click-feedback-only-password-925!';

type FeedbackObservation = {width: number; height: number; pointerEvents: string};
type FeedbackWindow = Window & {clickFeedbackObservations?: FeedbackObservation[]};

async function feedbackCount(page: Page) {
  return page.evaluate(() => (window as FeedbackWindow).clickFeedbackObservations?.length || 0);
}

async function activateWithFeedback(page: Page, button: Locator, keyboard = false) {
  // Each response must clean up, including buttons removed by navigation or a modal.
  await expect(page.locator('[data-click-feedback]')).toHaveCount(0);
  const before = await feedbackCount(page);
  if (keyboard) {
    await button.focus();
    await page.keyboard.press('Enter');
  } else await button.click();
  await expect.poll(() => feedbackCount(page), {
    message: 'Every enabled button activation must produce visible click feedback',
  }).toBe(before + 1);
  const observation = await page.evaluate(() => (window as FeedbackWindow).clickFeedbackObservations!.at(-1)!);
  expect(observation.width).toBeGreaterThan(0);
  expect(observation.height).toBeGreaterThan(0);
  expect(observation.pointerEvents).toBe('none');
}

test('click feedback: repeated buttons, keyboard, modal submit, mobile and reduced motion preserve behavior', async ({page}) => {
  const runtimeErrors: string[] = [];
  let transactionRequests = 0;
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') runtimeErrors.push(message.text());});
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transactions') transactionRequests++;
  });
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.addInitScript(() => {
    const state = window as FeedbackWindow;
    state.clickFeedbackObservations = [];
    // Keep evidence even when a short animation finishes before the next test step.
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const feedback = [
          ...(node.matches('[data-click-feedback]') ? [node] : []),
          ...node.querySelectorAll('[data-click-feedback]'),
        ];
        for (const element of feedback) {
          const rect = element.getBoundingClientRect();
          state.clickFeedbackObservations!.push({
            width: rect.width, height: rect.height,
            pointerEvents: getComputedStyle(element).pointerEvents,
          });
        }
      }
    }).observe(document, {childList: true, subtree: true});
  });

  const registered = await page.request.post('/api/auth/register', {
    headers: {Origin: origin},
    data: {name: 'Проверка отклика', email: `${randomUUID()}@example.invalid`, password, consent: true},
  });
  expect(registered.status()).toBe(201);
  try {
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка отклика.'})).toBeVisible();
    await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-ready', 'true');
    await page.getByLabel('Месяц', {exact: true}).fill('2026-10');
    const navigation = page.getByRole('navigation', {name: 'Основная навигация'});

    await activateWithFeedback(page, navigation.getByRole('button', {name: 'Аналитика', exact: true}));
    await expect(page.getByRole('heading', {name: 'Движение денег'})).toBeVisible();
    // Re-selecting the current destination still acknowledges the click.
    await activateWithFeedback(page, navigation.getByRole('button', {name: 'Аналитика', exact: true}));
    await expect(page.getByRole('heading', {name: 'Движение денег'})).toBeVisible();
    await activateWithFeedback(page, navigation.getByRole('button', {name: 'Обзор', exact: true}), true);
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка отклика.'})).toBeVisible();

    const add = page.getByRole('button', {name: 'Добавить операцию', exact: true}).first();
    await activateWithFeedback(page, add);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await activateWithFeedback(page, dialog.getByRole('button', {name: 'Закрыть', exact: true}));
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    await activateWithFeedback(page, add);
    await activateWithFeedback(page, dialog.getByRole('button', {name: '+ Доход', exact: true}));
    await page.getByLabel('Сумма, ₸', {exact: true}).fill('123.45');
    await page.getByRole('combobox', {name: 'Категория', exact: true}).selectOption('Зарплата');
    await page.getByLabel('Дата', {exact: true}).fill('2026-10-21');
    await page.getByLabel('Заметка', {exact: false}).fill('Один клик — одна операция');
    await activateWithFeedback(page, dialog.getByRole('button', {name: 'Добавить операцию', exact: true}));
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Один клик — одна операция', {exact: true})).toBeVisible();
    expect(transactionRequests).toBe(1);
    const summary = await (await page.request.get('/api/summary?month=2026-10')).json();
    expect(summary.income).toBe('12345');
    expect(summary.balance).toBe('12345');
    expect(summary.count).toBe(1);

    await page.setViewportSize({width: 390, height: 844});
    await activateWithFeedback(page, page.getByRole('button', {name: 'Открыть меню', exact: true}));
    await expect(navigation).toBeVisible();
    await activateWithFeedback(page, navigation.getByRole('button', {name: 'Операции', exact: true}));
    await expect(page.getByRole('heading', {name: 'Операции за месяц'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Открыть меню', exact: true})).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('[data-click-feedback]')).toHaveCount(0);

    await page.emulateMedia({reducedMotion: 'reduce'});
    await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-mode', 'reduced');
    const countBeforeReduced = await feedbackCount(page);
    await page.getByRole('button', {name: 'Открыть меню', exact: true}).click();
    await navigation.getByRole('button', {name: 'Обзор', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка отклика.'})).toBeVisible();
    await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-mode', 'reduced');
    await expect(page.locator('[data-click-feedback]')).toHaveCount(0);
    expect(await feedbackCount(page)).toBe(countBeforeReduced);

    // A deliberate in-app override can restore full effects while the operating
    // system preference stays reduced; choosing minimal must turn them off again.
    const motionPreference = page.getByRole('combobox', {name: 'Анимации интерфейса', exact: true});
    await motionPreference.selectOption('full');
    await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'full');
    await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-mode', 'mobile');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await activateWithFeedback(page, page.getByRole('button', {name: 'Открыть меню', exact: true}));
    await activateWithFeedback(page, navigation.getByRole('button', {name: 'Операции', exact: true}));
    await expect(page.getByRole('heading', {name: 'Операции за месяц'})).toBeVisible();
    await expect(page.locator('[data-click-feedback]')).toHaveCount(0);
    await motionPreference.selectOption('minimal');
    await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'minimal');
    await expect(page.locator('[data-motion-root]')).toHaveAttribute('data-motion-mode', 'reduced');
    const countBeforeMinimal = await feedbackCount(page);
    await page.getByRole('button', {name: 'Открыть меню', exact: true}).click();
    await navigation.getByRole('button', {name: 'Обзор', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка отклика.'})).toBeVisible();
    expect(await feedbackCount(page)).toBe(countBeforeMinimal);
    await expect(page.locator('[data-click-feedback]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(runtimeErrors).toEqual([]);
  } finally {
    const removed = await page.request.delete('/api/account', {
      headers: {Origin: origin}, data: {password, confirmation: 'УДАЛИТЬ'},
    });
    expect(removed.status()).toBe(200);
  }
});
