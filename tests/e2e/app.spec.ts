import {test,expect, type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const origin = 'http://127.0.0.1:3100';
const password = 'Test-only-long-password-923!';
const day = '2026-10-16';
async function register(client: APIRequestContext, name: string) {
  const email = `${randomUUID()}@example.invalid`;
  const response = await client.post('/api/auth/register',{data:{name,email,password,consent:true}});
  expect(response.status()).toBe(201); return email;
}
async function cleanup(client: APIRequestContext) {await client.delete('/api/account',{data:{password,confirmation:'УДАЛИТЬ'}}); await client.dispose();}
test('API: ownership, CSRF, exact totals, idempotency, export and cascading deletion',async ({playwright}) => {
  const a = await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  const b = await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  const anonymous = await playwright.request.newContext({baseURL:origin});
  try {
    await register(a,'Isolation A'); await register(b,'Isolation B');
    const profile = await (await a.get('/api/me')).json();
    expect(await (await anonymous.get('/api/transactions')).status()).toBe(401);
    const data = {type:'expense',amount:'1234.56',category:'Продукты',note:'Isolation expense',date:day,requestId:randomUUID()};
    const first = await a.post('/api/transactions',{data}); expect(first.status()).toBe(201); const record = await first.json();
    expect((await a.post('/api/transactions',{data})).status()).toBe(201);
    expect((await a.post('/api/transactions',{data:{...data,userId:profile.id}})).status()).toBe(400);
    expect((await a.post('/api/transactions',{headers:{Origin:'https://evil.invalid'},data})).status()).toBe(403);
    expect((await a.post('/api/transactions',{data:{...data,amount:'-1'}})).status()).toBe(400);
    const edits = {type:'expense',amount:'999',category:'Продукты',note:'changed',date:day};
    expect((await b.patch(`/api/transactions/${record.id}`,{data:edits})).status()).toBe(404);
    expect((await b.delete(`/api/transactions/${record.id}`)).status()).toBe(404);
    expect((await (await b.get('/api/transactions?month=2026-10')).json()).items).toHaveLength(0);
    const summary = await (await a.get('/api/summary?month=2026-10')).json(); expect(summary.expense).toBe('123456'); expect(summary.balance).toBe('-123456'); expect(summary.count).toBe(1);
    const goal = await (await a.post('/api/goals',{data:{name:'Only A',target:'50000',saved:'10000',deadline:'2027-01-01'}})).json();
    expect((await b.patch(`/api/goals/${goal.id}`,{data:{name:'Only B',target:'50000',saved:'20000',deadline:''}})).status()).toBe(404);
    expect((await b.delete(`/api/goals/${goal.id}`)).status()).toBe(404); expect(await (await b.get('/api/goals')).json()).toEqual([]);
    const exported = await (await a.get('/api/export')).json(); expect(exported.transactions).toHaveLength(1); expect(exported.goals).toHaveLength(1); expect(exported.profile.passwordHash).toBeUndefined();
    const provider = (await (await a.get('/api/me')).json()).provider;
    expect((await a.post('/api/assistant',{data:{message:'test question',month:'2026-10'}})).status()).toBe(provider.configured ? 403 : 503);
    expect((await a.patch('/api/me',{data:{aiConsent:true,voiceConsent:false}})).status()).toBe(provider.configured ? 200 : 503);
    if (provider.configured) expect((await a.patch('/api/me',{data:{aiConsent:false,voiceConsent:false}})).status()).toBe(200);
    const cookies = await a.storageState(); expect(cookies.cookies[0].httpOnly).toBe(true); expect(cookies.cookies[0].sameSite).toBe('Lax');
    const oldSession = await playwright.request.newContext({baseURL:origin,storageState:cookies});
    expect((await a.delete('/api/account',{data:{password:'incorrect',confirmation:'УДАЛИТЬ'}})).status()).toBe(400);
    expect((await a.delete('/api/account',{data:{password,confirmation:'УДАЛИТЬ'}})).status()).toBe(200);
    expect((await oldSession.get('/api/me')).status()).toBe(401); await oldSession.dispose();
    const bExport = await (await b.get('/api/export')).json(); expect(bExport.transactions).toEqual([]); expect(bExport.goals).toEqual([]);
  } finally {await cleanup(a); await cleanup(b); await anonymous.dispose();}
});
test('browser: registration, CRUD, analytics, goals, session persistence and deletion',async ({page}) => {
  const email = `${randomUUID()}@example.invalid`; const errors:string[] = []; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await page.getByLabel('Как к вам обращаться').fill('Тестовый пользователь'); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Пароль',{exact:true}).fill(password); await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Сәлем, Тестовый пользователь.'})).toBeVisible();
  await page.getByLabel('Месяц',{exact:true}).fill('2026-10');
  await page.getByRole('button',{name:'Добавить операцию',exact:true}).first().click();
  await page.getByLabel('Сумма, ₸').fill('250000.50'); await page.getByRole('button',{name:'+ Доход'}).click(); await page.getByRole('combobox',{name:'Категория',exact:true}).selectOption('Зарплата'); await page.getByLabel('Дата',{exact:true}).fill(day); await page.getByLabel('Заметка', {exact:false}).fill('Тестовая зарплата'); await page.getByRole('dialog').getByRole('button',{name:'Добавить операцию',exact:true}).click();
  await expect(page.getByText('Тестовая зарплата',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Редактировать Тестовая зарплата'}).click(); await page.getByLabel('Сумма, ₸').fill('250001.25'); await page.getByRole('button',{name:'Сохранить изменения'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await expect(page.getByText('Тестовая зарплата',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Аналитика',exact:true}).click(); await expect(page.getByRole('heading',{name:'Движение денег'})).toBeVisible();
  await page.getByRole('button',{name:'Мои цели',exact:true}).click(); await page.getByRole('button',{name:'Новая цель',exact:true}).click(); await page.getByLabel('Название цели').fill('Тестовая подушка'); await page.getByLabel('Нужно накопить, ₸').fill('1000000'); await page.getByLabel('Уже накоплено, ₸').fill('25000'); await page.getByRole('dialog').getByRole('button',{name:'Создать цель',exact:true}).click(); await expect(page.getByText('Тестовая подушка',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Обновить прогресс'}).click(); await page.getByLabel('Уже накоплено, ₸').fill('50000'); await page.getByRole('button',{name:'Обновить цель',exact:true}).click(); await expect(page.getByText('5% пути')).toBeVisible();
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Обзор',exact:true}).click(); await page.screenshot({path:'test-results/overview-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'test-results/overview-mobile.png',fullPage:true}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Открыть меню'}).click(); await page.getByRole('button',{name:'Настройки',exact:true}).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button',{name:'Скачать данные'}).click(); expect((await downloadPromise).suggestedFilename()).toBe('qarzhy-export.json');
  await page.getByRole('button',{name:'Удалить аккаунт и данные'}).click(); await page.getByLabel('Текущий пароль').fill(password); await page.getByLabel('Введите УДАЛИТЬ').fill('УДАЛИТЬ'); await page.getByRole('button',{name:'Навсегда удалить мои данные'}).click(); await expect(page.getByRole('button',{name:'Создать аккаунт',exact:true})).toBeVisible(); expect(errors).toEqual([]);
});
test('entry is usable at 320px and incorrect credentials show an error',async ({page}) => {
  await page.setViewportSize({width:320,height:740}); await page.goto('/', {waitUntil:'domcontentloaded'}); await expect(page.getByLabel('Email',{exact:true})).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:'test-results/auth-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000}); await page.screenshot({path:'test-results/auth-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Вход',exact:true}).click(); await page.getByLabel('Email',{exact:true}).fill('unknown@example.invalid'); await page.getByLabel('Пароль',{exact:true}).fill(password); await page.getByRole('button',{name:'Войти',exact:true}).click(); await expect(page.locator('.error-message')).toContainText('Неверный email или пароль');
});


