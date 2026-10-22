import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:3100';const password='Testing-planning-password-821!';
async function account(c:APIRequestContext){expect((await c.post('/api/auth/register',{data:{email:randomUUID()+'@example.invalid',name:'Проверка планов',password,consent:true}})).status()).toBe(201);}
test('planning ownership, idempotency, CSV validation and exports',async({playwright})=>{
 const a=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});const b=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 try{
 await account(a);await account(b);
 const budget=await(await a.post('/api/budgets',{data:{month:'2026-10',category:'Продукты',amount:'100'}})).json();
 expect((await b.delete('/api/budgets/'+budget.id)).status()).toBe(404);
 expect((await a.post('/api/budgets',{data:{month:'2026-10',category:'Продукты',amount:'-2'}})).status()).toBe(400);
 const recurring=await(await a.post('/api/recurring',{data:{name:'Аренда',category:'Дом',amount:'150',nextDate:'2026-01-31',frequency:'monthly',active:true}})).json();
 expect((await b.post(`/api/recurring/${recurring.id}/record`,{data:{dueDate:'2026-01-31'}})).status()).toBe(404);
 const payments=await Promise.all([a.post(`/api/recurring/${recurring.id}/record`,{data:{dueDate:'2026-01-31'}}),a.post(`/api/recurring/${recurring.id}/record`,{data:{dueDate:'2026-01-31'}})]);
 expect(payments.map(r=>r.status()).sort()).toEqual([200,409]);
 const rows=[{date:'2026-10-01',amount:'110.01',type:'expense',category:'Продукты',note:'Импорт'}];
 expect((await(await a.post('/api/import',{data:{rows}})).json()).imported).toBe(1);
 expect((await(await a.post('/api/import',{data:{rows}})).json()).skipped).toBe(1);
 expect((await a.post('/api/import',{data:{rows:[rows[0],{...rows[0],amount:'-1'}]}})).status()).toBe(400);
 expect((await a.post('/api/import',{headers:{Origin:'https://other.invalid'},data:{rows}})).status()).toBe(403);
 const state=await(await a.get('/api/planning?month=2026-10')).json();expect(state.budgets[0].spent).toBe('11001');expect(state.recurring[0].nextDate.slice(0,10)).toBe('2026-02-28');
 expect((await a.patch('/api/favorites',{data:{categories:['Продукты','Дом']}})).status()).toBe(200);
 const other=await(await b.get('/api/planning?month=2026-10')).json();expect(other).toEqual({budgets:[],recurring:[],favorites:[]});
 const comparison=await(await a.get('/api/comparison?month=2026-10')).json();expect(comparison.currentSaved).toBe('-11001');
 const exported=await(await a.get('/api/export')).json();expect(exported.budgets).toHaveLength(1);expect(exported.recurring).toHaveLength(1);expect(exported.profile.favoriteCategories).toEqual(['Продукты','Дом']);expect(exported.transactions).toHaveLength(2);
 }finally{for(const c of [a,b]){await c.delete('/api/account',{data:{password,confirmation:'УДАЛИТЬ'}});await c.dispose();}}
});

test('new tools work on desktop and mobile',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Как к вам обращаться').fill('Новые функции');await page.getByLabel('Email',{exact:true}).fill(randomUUID()+'@example.invalid');await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
 try{
 await expect(page.getByRole('heading',{name:'Быстрый расход'})).toBeVisible();
 await page.getByLabel('Месяц',{exact:true}).fill('2026-10');
 await page.getByRole('button',{name:'Бюджет и платежи',exact:true}).click();await page.getByRole('button',{name:'Добавить лимит'}).click();await page.getByLabel('Лимит, ₸').fill('1000');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Продукты',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Добавить платёж'}).click();await page.getByLabel('Название платежа').fill('Подписка');await page.getByLabel('Сумма платежа, ₸').fill('500');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:'test-results/planning-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Обзор',exact:true}).click();await page.getByLabel('Сумма быстрого расхода, ₸',{exact:true}).fill('1200');await page.getByRole('button',{name:'Записать сегодня'}).click();await expect(page.getByText('Расход записан за сегодня.')).toBeVisible();await expect(page.getByText(/Продукты: перерасход/)).toBeVisible();
 await page.getByRole('button',{name:'Повторить последнюю операцию'}).click();await expect(page.getByRole('heading',{name:'Повторить операцию'})).toBeVisible();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Импорт CSV',exact:true}).click();await page.getByLabel('Файл выписки').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from('date;amount;type;category;note\n2026-09-01;100;expense;Дом;Проверка CSV')});await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Импортировать 1 записей'}).click();await expect(page.getByText('Добавлено: 1. Повторов пропущено: 0.')).toBeVisible();
 await page.getByRole('button',{name:'Аналитика',exact:true}).click();await expect(page.getByRole('heading',{name:'Сравнение месяцев'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/comparison-mobile.png',fullPage:true});
 expect((await page.request.get('/manifest.webmanifest')).status()).toBe(200);expect((await page.request.get('/icon-192.png')).status()).toBe(200);expect((await page.request.get('/sw.js')).status()).toBe(200);
 }finally{await page.request.delete('/api/account',{headers:{Origin:origin},data:{password,confirmation:'УДАЛИТЬ'}});}
});


