import {test, expect, type Locator, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const origin = 'http://127.0.0.1:3100';
const password = 'Accounts-ui-test-only-password-923!';
const month = '2026-10';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', {name: 'Открыть меню', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', {name: 'Основная навигация'}).getByRole('button', {name, exact: true}).click();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

function accountCard(page: Page, name: string): Locator {
  return page.locator('.account-card').filter({has: page.getByRole('heading', {name, exact: true})});
}

async function resultsAfter(page: Page, action: () => Promise<unknown>, count: number) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/transactions' && value.request().method() === 'GET');
  await action();
  expect((await response).ok()).toBe(true);
  await expect(page.locator('.search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.search-results .count-label')).toHaveText(`Найдено: ${count}`);
}

async function applyFilters(page: Page, count: number) {
  await resultsAfter(page, () => page.getByRole('button', {name: 'Применить фильтры', exact: true}).click(), count);
}

test('accounts, assigned operations, neutral transfers, search and calendar remain usable at 320px', async ({page, playwright}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && /^\/api\/(accounts|transfers|transactions|recurring)(\/|$)/.test(path)) writes.push(`${request.method()} ${path}`);
  });
  const headers = {Origin: origin};
  const client = await playwright.request.newContext({baseURL: origin, extraHTTPHeaders: headers, timeout: 15_000});
  let registered = false;
  let failure: unknown;
  const cardName = 'Карта для проверки';
  const initialCashName = 'Наличные для проверки';
  const cashName = 'Наличные после изменения';
  let scheduleYear = new Date().getUTCFullYear() + 1;
  while (new Date(Date.UTC(scheduleYear, 1, 29)).getUTCMonth() === 1) scheduleYear += 1;
  try {
    const registration = await client.post('/api/auth/register', {data: {email: `${randomUUID()}@example.invalid`, name: 'Проверка счетов', password, consent: true}});
    registered = registration.ok();
    expect(registration.status()).toBe(201);
    const cardResponse = await client.post('/api/accounts', {data: {name: cardName, kind: 'card', opening: '1000', requestId: randomUUID()}});
    expect(cardResponse.status()).toBe(201);
    const card = await cardResponse.json();
    for (const fixture of [
      {amount: '100', category: 'Продукты', note: 'Покупка по карте', date: `${month}-02`, accountId: card.id},
      {amount: '25.50', category: 'Дом', note: 'Историческая аренда', date: '2026-09-05', accountId: null},
    ]) expect((await client.post('/api/transactions', {data: {...fixture, type: 'expense', requestId: randomUUID()}})).status()).toBe(201);
    const scheduleResponse = await client.post('/api/recurring', {data: {name: 'Платёж в последний день', category: 'Дом', amount: '300', nextDate: `${scheduleYear}-01-31`, frequency: 'monthly', active: true}});
    expect(scheduleResponse.status()).toBe(201);

    const session = await client.storageState();
    await page.context().addCookies(session.cookies);
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка счетов.'})).toBeVisible();
    await page.getByLabel('Месяц', {exact: true}).fill(month);
    await navigate(page, 'Счета');
    await expect(accountCard(page, cardName)).toBeVisible();

    await page.getByRole('button', {name: 'Добавить счёт', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Новый счёт'})).toBeVisible();
    await expect(page.getByRole('dialog', {name: 'Новый счёт'})).toContainText('Название счёта');
    expect(await page.getByRole('dialog', {name: 'Новый счёт'}).evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Добавить счёт', exact: true})).toBeFocused();
    await page.getByRole('button', {name: 'Добавить счёт', exact: true}).click();
    await page.getByLabel('Название счёта', {exact: true}).fill(initialCashName);
    await page.getByRole('combobox', {name: 'Тип счёта', exact: true}).selectOption('cash');
    await page.getByLabel('Начальный остаток, ₸', {exact: true}).fill('500');
    await page.getByRole('dialog').getByRole('button', {name: 'Создать счёт', exact: true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(accountCard(page, initialCashName).locator('[data-amount]')).toHaveAttribute('data-amount', '50000');

    await page.getByRole('button', {name: `Изменить счёт ${initialCashName}`, exact: true}).click();
    await page.getByLabel('Название счёта', {exact: true}).fill(cashName);
    await page.getByLabel('Начальный остаток, ₸', {exact: true}).fill('600');
    await page.getByRole('dialog').getByRole('button', {name: 'Сохранить счёт', exact: true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(accountCard(page, cashName).locator('[data-amount]')).toHaveAttribute('data-amount', '60000');
    const accountState = await (await client.get('/api/accounts')).json();
    expect(accountState.items).toHaveLength(2);
    const cash = accountState.items.find((item: {name: string}) => item.name === cashName);
    expect(cash).toBeTruthy();

    await navigate(page, 'Операции');
    for (const operation of [
      {type: 'income', amount: '1000', category: 'Зарплата', accountId: card.id, note: 'Доход на карту', date: `${month}-15`},
      {type: 'expense', amount: '125.50', category: 'Продукты', accountId: cash.id, note: 'Кошелёк расход', date: `${month}-16`},
    ]) {
      await page.getByRole('button', {name: 'Добавить операцию', exact: true}).first().click();
      const dialog = page.getByRole('dialog', {name: 'Новая операция'});
      await dialog.getByLabel('Сумма, ₸', {exact: true}).fill(operation.amount);
      await dialog.getByRole('button', {name: operation.type === 'income' ? '+ Доход' : '− Расход', exact: true}).click();
      await dialog.getByRole('combobox', {name: 'Категория', exact: true}).selectOption(operation.category);
      await dialog.getByLabel('Дата', {exact: true}).fill(operation.date);
      await dialog.getByRole('combobox', {name: 'Счёт операции', exact: true}).selectOption(operation.accountId);
      await dialog.getByLabel('Заметка', {exact: false}).fill(operation.note);
      await dialog.getByRole('button', {name: 'Добавить операцию', exact: true}).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.search-results').getByText(operation.note, {exact: true})).toBeVisible();
    }
    const beforeTransfer = await (await client.get(`/api/summary?month=${month}`)).json();
    expect(beforeTransfer).toMatchObject({income: '100000', expense: '22550', balance: '74900', count: 3});

    await navigate(page, 'Счета');
    await expect(accountCard(page, cardName).locator('[data-amount]')).toHaveAttribute('data-amount', '190000');
    await expect(accountCard(page, cashName).locator('[data-amount]')).toHaveAttribute('data-amount', '47450');
    await expect(page.locator('.accounts-total [data-amount]')).toHaveAttribute('data-amount', '234900');
    await page.getByRole('button', {name: 'Перевод между счетами', exact: true}).click();
    const transferDialog = page.getByRole('dialog', {name: 'Перевод между счетами'});
    await transferDialog.getByRole('combobox', {name: 'Со счёта', exact: true}).selectOption(card.id);
    await transferDialog.getByRole('combobox', {name: 'На счёт', exact: true}).selectOption(cash.id);
    await transferDialog.getByLabel('Сумма перевода, ₸', {exact: true}).fill('200');
    await transferDialog.getByLabel('Дата перевода', {exact: true}).fill(`${month}-17`);
    await transferDialog.getByLabel('Заметка к переводу', {exact: false}).fill('Перемещение для проверки');
    await transferDialog.getByRole('button', {name: 'Записать перевод', exact: true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.transfer-list > li')).toHaveCount(1);
    await expect(accountCard(page, cardName).locator('[data-amount]')).toHaveAttribute('data-amount', '170000');
    await expect(accountCard(page, cashName).locator('[data-amount]')).toHaveAttribute('data-amount', '67450');
    await expect(page.locator('.accounts-total [data-amount]')).toHaveAttribute('data-amount', '234900');
    const afterTransfer = await (await client.get(`/api/summary?month=${month}`)).json();
    expect(afterTransfer).toMatchObject({income: beforeTransfer.income, expense: beforeTransfer.expense, balance: beforeTransfer.balance, count: beforeTransfer.count});

    await page.setViewportSize({width: 320, height: 740});
    await noOverflow(page);
    await page.screenshot({path: 'test-results/accounts-320.png', fullPage: true});
    await navigate(page, 'Операции');
    await expect(page.locator('.search-results .count-label')).toHaveText('Найдено: 3');
    await page.getByLabel('Поиск операций', {exact: true}).fill('Продукты');
    await applyFilters(page, 2);
    await page.getByLabel('Поиск операций', {exact: true}).fill('Кошелёк расход');
    await applyFilters(page, 1);
    await expect(page.locator('.search-results').getByText('Кошелёк расход', {exact: true})).toBeVisible();
    await page.getByLabel('Поиск операций', {exact: true}).fill(`Не существует ${randomUUID()}`);
    await applyFilters(page, 0);
    await expect(page.getByRole('heading', {name: 'Ничего не найдено', exact: true})).toBeVisible();
    await resultsAfter(page, () => page.getByRole('button', {name: 'Очистить поиск', exact: true}).click(), 3);
    await expect(page.getByLabel('Поиск операций', {exact: true})).toHaveValue('');
    await expect(page.getByLabel('Поиск операций', {exact: true})).toBeFocused();

    await page.getByLabel('Период поиска', {exact: true}).selectOption('all');
    await applyFilters(page, 4);
    await expect(page.locator('.search-results').getByText('Историческая аренда', {exact: true})).toBeVisible();
    await page.getByLabel('Счёт фильтра', {exact: true}).selectOption('unassigned');
    await applyFilters(page, 1);
    await expect(page.locator('.search-results').getByText('Историческая аренда', {exact: true})).toBeVisible();
    await resultsAfter(page, () => page.getByRole('button', {name: 'Сбросить фильтры', exact: true}).click(), 3);
    await expect(page.getByLabel('Период поиска', {exact: true})).toHaveValue('month');
    await expect(page.locator('.search-results').getByText('Историческая аренда', {exact: true})).toHaveCount(0);

    await page.getByLabel('Тип операции', {exact: true}).selectOption('expense');
    await page.getByLabel('Категория фильтра', {exact: true}).selectOption('Продукты');
    await page.getByLabel('Счёт фильтра', {exact: true}).selectOption(cash.id);
    await page.getByLabel('Сумма от, ₸', {exact: true}).fill('120');
    await page.getByLabel('Сумма до, ₸', {exact: true}).fill('130');
    await applyFilters(page, 1);
    await expect(page.locator('.search-results').getByText('Кошелёк расход', {exact: true})).toBeVisible();
    await page.getByLabel('Счёт фильтра', {exact: true}).selectOption(card.id);
    await applyFilters(page, 0);
    await page.getByLabel('Сумма от, ₸', {exact: true}).fill('90');
    await applyFilters(page, 1);
    await expect(page.locator('.search-results').getByText('Покупка по карте', {exact: true})).toBeVisible();
    await page.getByLabel('Тип операции', {exact: true}).selectOption('income');
    await applyFilters(page, 0);
    await page.getByLabel('Категория фильтра', {exact: true}).selectOption('');
    await page.getByLabel('Сумма от, ₸', {exact: true}).fill('1000');
    await page.getByLabel('Сумма до, ₸', {exact: true}).fill('1000');
    await page.getByLabel('Дата от', {exact: true}).fill(`${month}-15`);
    await page.getByLabel('Дата до', {exact: true}).fill(`${month}-15`);
    await applyFilters(page, 1);
    await expect(page.locator('.search-results').getByText('Доход на карту', {exact: true})).toBeVisible();
    await noOverflow(page);
    await page.screenshot({path: 'test-results/search-320.png', fullPage: true});

    expect(writes.filter(value => value === 'POST /api/accounts')).toHaveLength(1);
    expect(writes.filter(value => value === `PATCH /api/accounts/${cash.id}`)).toHaveLength(1);
    expect(writes.filter(value => value === 'POST /api/transactions')).toHaveLength(2);
    expect(writes.filter(value => value === 'POST /api/transfers')).toHaveLength(1);
    const writesBeforeCalendar = writes.length;
    await navigate(page, 'Календарь');
    for (const [number, day, localizedMonth] of [['01', '31', 'января'], ['02', '28', 'февраля'], ['03', '31', 'марта']]) {
      await page.getByLabel('Месяц', {exact: true}).fill(`${scheduleYear}-${number}`);
      const dayButton = page.locator('.payment-calendar-grid').getByRole('button', {name: new RegExp(`${day} ${localizedMonth}.*Платежей: 1`)});
      await expect(dayButton).toBeVisible();
      await dayButton.focus();
      await page.keyboard.press('Enter');
      await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.payment-calendar-selected').getByText('Платёж в последний день', {exact: true})).toBeVisible();
      await expect(page.locator('.payment-calendar-selected .payment-calendar-status')).toHaveText(number === '01' ? 'План' : 'План · расчётная дата');
      await noOverflow(page);
    }
    await page.screenshot({path: 'test-results/calendar-320.png', fullPage: true});
    expect(writes).toHaveLength(writesBeforeCalendar);
    const finalTransactions = await (await client.get('/api/transactions?all=1')).json();
    expect(finalTransactions.total).toBe(4);
    const finalPlanning = await (await client.get(`/api/planning?month=${scheduleYear}-03`)).json();
    expect(finalPlanning.recurring[0].nextDate.slice(0, 10)).toBe(`${scheduleYear}-01-31`);
    expect(finalPlanning.recurring[0].anchorDay).toBe(31);
    await expect(page.getByRole('button', {name: 'Открыть план', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Открыть план', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Повторяющиеся платежи', exact: true})).toBeVisible();
    expect(errors).toEqual([]);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      if (registered) expect((await client.delete('/api/account', {data: {password, confirmation: 'УДАЛИТЬ'}})).status()).toBe(200);
    } catch (error) {cleanupError = error;}
    try {await client.dispose();} catch (error) {cleanupError ??= error;}
    if (cleanupError) {
      if (failure) await testInfo.attach('account-cleanup-error', {body: String(cleanupError), contentType: 'text/plain'});
      else throw cleanupError;
    }
  }
});
