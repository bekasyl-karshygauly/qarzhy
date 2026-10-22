import {test, expect, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const origin = 'http://127.0.0.1:3100';
const password = 'WebGL-test-only-password-623!';
const month = '2026-10';
const date = '2026-10-21';
const money = (minor: number) => new Intl.NumberFormat('ru-KZ', {
  style: 'currency', currency: 'KZT', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(minor / 100);

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', {name: 'Открыть меню', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', {name: 'Основная навигация'})
    .getByRole('button', {name, exact: true}).click();
}

async function frames(page: Page, count = 12) {
  await page.evaluate(async total => {
    for (let index = 0; index < total; index++) {
      await new Promise<number>(resolve => requestAnimationFrame(resolve));
    }
  }, count);
}

async function sampleCadence(page: Page, mode: 'full' | 'minimal') {
  return page.evaluate(async label => {
    const host = document.querySelector<HTMLElement>('[data-webgl-host]');
    const intervalsMs: number[] = [];
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve));
    const started = previous;
    const firstShaderFrame = Number(host?.dataset.webglFrame || 0);
    for (let index = 0; index < 60; index++) {
      const current = await new Promise<number>(resolve => requestAnimationFrame(resolve));
      intervalsMs.push(current - previous);
      previous = current;
    }
    const ordered = [...intervalsMs].sort((a, b) => a - b);
    const elapsedMs = previous - started;
    const shaderFrames = Number(host?.dataset.webglFrame || 0) - firstShaderFrame;
    const rounded = (value: number) => Number(value.toFixed(2));
    const canvas = host?.querySelector('canvas');
    const bounds = canvas?.getBoundingClientRect();
    return {mode: label, state: host?.dataset.webglState, quality: host?.dataset.webglQuality || null,
      device: {userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGiB: (navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? null,
        devicePixelRatio, viewport: {width: innerWidth, height: innerHeight}},
      canvas: canvas ? {pixelWidth: canvas.width, pixelHeight: canvas.height,
        cssWidth: rounded(bounds!.width), cssHeight: rounded(bounds!.height),
        effectivePixelRatio: bounds!.width ? rounded(canvas.width / bounds!.width) : null} : null,
      samples: intervalsMs.length, elapsedMs: rounded(elapsedMs),
      rafMedianMs: rounded((ordered[29] + ordered[30]) / 2), rafP95Ms: rounded(ordered[56]),
      rafFramesPerSecond: rounded(intervalsMs.length * 1000 / elapsedMs),
      shaderFrames, shaderFramesPerSecond: rounded(shaderFrames * 1000 / elapsedMs),
      framesOver50Ms: intervalsMs.filter(interval => interval > 50).length,
      intervalsMs: intervalsMs.map(rounded)};
  }, mode);
}

// A single account is reused in isolated browser contexts. No user's data or
// production provider is touched; unsupported/disabled GPUs are tested as well.
test('WebGL decoration preserves exact finance, lifecycle, reduced motion and fallback', async ({page, browser}, testInfo) => {
  test.setTimeout(180000);
  await page.setViewportSize({width: 1440, height: 1000});
  await page.emulateMedia({reducedMotion: 'no-preference'});
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') consoleErrors.push(message.text());});
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const state = window as Window & {webglContexts?: {isContextLost(): boolean}[]};
    state.webglContexts = [];
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      const result = Reflect.apply(original, this, [type, ...options]);
      if (/^(webgl2?|experimental-webgl)$/.test(type) && result && !state.webglContexts!.includes(result)) {
        state.webglContexts!.push(result);
      }
      return result;
    } as typeof original;
  });
  const registration = await page.request.post('/api/auth/register', {
    headers: {Origin: origin},
    data: {name: 'Проверка WebGL', email: `${randomUUID()}@example.invalid`, password, consent: true},
  });
  expect(registration.status()).toBe(201);
  try {
    for (const transaction of [
      {type: 'income', amount: '100000.01', category: 'Зарплата', note: 'Точный доход WebGL'},
      {type: 'expense', amount: '1234.56', category: 'Продукты', note: 'Точный расход WebGL'},
    ]) {
      const response = await page.request.post('/api/transactions', {
        headers: {Origin: origin}, data: {...transaction, date, requestId: randomUUID()},
      });
      expect(response.status()).toBe(201);
    }
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('heading', {name: 'Сәлем, Проверка WebGL.'})).toBeVisible();
    await page.getByLabel('Месяц', {exact: true}).fill(month);
    await expect(page.locator('.balance-number')).toHaveText(money(9876545));
    const host = page.locator('[data-webgl-host]');
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute('data-webgl-state', /^(active|fallback)$/);
    const initialState = await host.getAttribute('data-webgl-state');
    await expect(host).not.toHaveAttribute('data-webgl-failure', /^(renderer|shader|render|setup)$/);
    if (initialState === 'fallback') await expect(host).toHaveAttribute('data-webgl-failure', 'unsupported');
    await testInfo.attach('webgl-runtime.json', {
      body: JSON.stringify({initialState, lowMemoryTests: process.env.LOW_MEMORY_TESTS === 'true',
        note: 'Actual GPU availability depends on the runner. A fallback is valid; active rendering is explicitly verified when available.'}, null, 2),
      contentType: 'application/json',
    });
    await expect.poll(() => host.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
    if (initialState === 'active') {
      await expect(host.locator('canvas')).toHaveCount(1);
      const firstFrame = Number(await host.getAttribute('data-webgl-frame'));
      await expect.poll(async () => Number(await host.getAttribute('data-webgl-frame'))).toBeGreaterThan(firstFrame);
      await page.mouse.move(550, 260);
      await page.mouse.move(790, 350);
      const pulses = Number(await host.getAttribute('data-webgl-pulse'));
      await page.locator('.balance-label').click();
      await expect.poll(async () => Number(await host.getAttribute('data-webgl-pulse'))).toBeGreaterThan(pulses);
      await expect(host).toHaveAttribute('data-webgl-scroll', /^\d\.\d{3}$/);
      const initialScroll = Number(await host.getAttribute('data-webgl-scroll'));

      // An offscreen background must stop scheduling draws. Use a natural scroll
      // range; no artificial spacer or implementation-level observer fixture.
      await page.setViewportSize({width: 1440, height: 500});
      await page.evaluate(() => scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
      await frames(page, 2);
      const fullyOffscreen = await host.evaluate(element => element.getBoundingClientRect().bottom <= 0);
      if (fullyOffscreen) {
        await expect(host).toHaveAttribute('data-webgl-state', 'paused');
        await expect.poll(async () => Number(await host.getAttribute('data-webgl-scroll'))).toBeGreaterThan(initialScroll);
        const pausedFrame = await host.getAttribute('data-webgl-frame');
        await frames(page);
        expect(await host.getAttribute('data-webgl-frame')).toBe(pausedFrame);
      }
      await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
      await page.setViewportSize({width: 1440, height: 1000});
      await expect(host).toHaveAttribute('data-webgl-state', 'active');

      // Existing GPU resources must adapt to a live breakpoint change instead
      // of constructing another canvas/context for a narrower viewport.
      const originalCanvas = await host.locator('canvas').elementHandle();
      expect(originalCanvas).not.toBeNull();
      await page.setViewportSize({width: 390, height: 844});
      await expect(host).toHaveAttribute('data-webgl-state', 'active');
      await expect(host).toHaveAttribute('data-webgl-quality', /^(mobile|low)$/);
      await expect(host.locator('canvas')).toHaveCount(1);
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.setViewportSize({width: 1440, height: 1000});
      await expect(host).toHaveAttribute('data-webgl-quality', /^(high|low)$/);
      await expect(host).toHaveAttribute('data-webgl-state', 'active');
      expect(await originalCanvas!.evaluate(element => element.isConnected)).toBe(true);
      await originalCanvas!.dispose();
    }

    // Repeated mounts must never stack canvases or disable existing navigation.
    for (let index = 0; index < 3; index++) {
      await navigate(page, 'Аналитика');
      await expect(page.getByRole('heading', {name: 'Движение денег'})).toBeVisible();
      await expect(page.locator('[data-webgl-host]')).toHaveCount(0);
      await navigate(page, 'Обзор');
      await expect(host).toHaveAttribute('data-webgl-state', /^(active|fallback)$/);
      await expect(host).not.toHaveAttribute('data-webgl-failure', /^(renderer|shader|render|setup)$/);
      expect(await host.locator('canvas').count()).toBeLessThanOrEqual(1);
      await expect.poll(() => page.evaluate(() => {
        const state = window as Window & {webglContexts?: {isContextLost(): boolean}[]};
        return state.webglContexts!.filter(context => !context.isContextLost()).length;
      }), {message: 'Unmounting the previous hero must release its GPU context'}).toBeLessThanOrEqual(1);
      await expect(page.locator('.balance-number')).toHaveText(money(9876545));
    }

    // Decorative pointer/click handlers must not duplicate a financial write.
    let transactionPosts = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transactions') transactionPosts++;
    });
    await page.getByRole('button', {name: 'Добавить операцию', exact: true}).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByLabel('Сумма, ₸', {exact: true}).fill('0.01');
    await page.getByLabel('Дата', {exact: true}).fill(date);
    await page.getByLabel('Заметка', {exact: false}).fill('Один расход поверх WebGL');
    await dialog.getByRole('button', {name: 'Добавить операцию', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.balance-number')).toHaveText(money(9876544));
    expect(transactionPosts).toBe(1);
    const summary = await (await page.request.get(`/api/summary?month=${month}`)).json();
    expect(summary.balance).toBe('9876544');
    expect(summary.expense).toBe('123457');
    expect(summary.count).toBe(3);

    // The explicit in-app preference is shared with existing GSAP/Motion owners.
    const preference = page.getByRole('combobox', {name: 'Анимации интерфейса', exact: true});
    // Let the renderer adapt its quality and finish section entrance work before
    // sampling steady-state scheduling; no hardware-independent FPS is asserted.
    await frames(page, 90);
    const fullCadence = await sampleCadence(page, 'full');
    await preference.selectOption('minimal');
    await expect(host).toHaveAttribute('data-webgl-state', 'reduced');
    await expect(host.locator('canvas')).toHaveCount(0);
    const staticFrame = await host.getAttribute('data-webgl-frame');
    await frames(page);
    expect(await host.getAttribute('data-webgl-frame')).toBe(staticFrame);
    const minimalCadence = await sampleCadence(page, 'minimal');
    await testInfo.attach('webgl-cadence-comparison.json', {
      body: JSON.stringify({environment: 'Headless Chromium on this runner; diagnostic only, not a hardware-independent FPS guarantee.',
        note: 'The full sample follows 90 rAF warmup frames. Decorative draws are capped at up to 30 desktop / 24 mobile and may adapt lower; rAF cadence describes browser scheduling.',
        samples: [fullCadence, minimalCadence]}, null, 2), contentType: 'application/json',
    });
    await preference.selectOption('full');
    await expect(host).toHaveAttribute('data-webgl-state', /^(active|fallback)$/);
    await expect(host).not.toHaveAttribute('data-webgl-failure', /^(renderer|shader|render|setup)$/);
    if (initialState === 'active') {
      await expect(host).toHaveAttribute('data-webgl-state', 'active');
      const restoredFrame = Number(await host.getAttribute('data-webgl-frame'));
      await expect.poll(async () => Number(await host.getAttribute('data-webgl-frame'))).toBeGreaterThan(restoredFrame);
    }
    expect(await host.locator('canvas').count()).toBeLessThanOrEqual(1);
    await expect(page.locator('.balance-number')).toHaveText(money(9876544));

    // A lost GPU must leave a readable CSS layer and a working application.
    if (await host.getAttribute('data-webgl-state') === 'active') {
      const extensionAvailable = await host.locator('canvas').evaluate(canvas => {
        const context = (canvas as HTMLCanvasElement).getContext('webgl2')
          || (canvas as HTMLCanvasElement).getContext('webgl');
        const extension = context?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext();
        return true;
      });
      if (extensionAvailable) {
        await expect(host).toHaveAttribute('data-webgl-state', 'fallback');
        await expect(host).toHaveAttribute('data-webgl-failure', 'context');
        await expect(page.locator('.balance-number')).toHaveText(money(9876544));
        await navigate(page, 'Аналитика');
        await expect(page.getByRole('heading', {name: 'Движение денег'})).toBeVisible();
        await navigate(page, 'Обзор');
        await expect(host).toHaveAttribute('data-webgl-state', /^(active|fallback)$/);
      }
    }
    await page.screenshot({path: 'test-results/webgl-overview-desktop.png', fullPage: true});

    // Fresh contexts reuse only the account session, never a saved full override.
    const session = await page.context().storageState();
    for (const mode of ['system-reduced', 'webgl-disabled'] as const) {
      const context = await browser.newContext({baseURL: origin, viewport: {width: 390, height: 844},
        storageState: {cookies: session.cookies, origins: []},
        reducedMotion: mode === 'system-reduced' ? 'reduce' : 'no-preference'});
      try {
        await context.addInitScript(({disabled}) => {
          const original = HTMLCanvasElement.prototype.getContext;
          const state = window as Window & {webglRequests?: number};
          state.webglRequests = 0;
          HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...options: unknown[]) {
            if (/^(webgl2?|experimental-webgl)$/.test(type)) {
              state.webglRequests!++;
              if (disabled) return null;
            }
            return Reflect.apply(original, this, [type, ...options]);
          } as typeof original;
        }, {disabled: mode === 'webgl-disabled'});
        const isolated = await context.newPage();
        isolated.on('pageerror', error => runtimeErrors.push(error.message));
        await isolated.goto('/', {waitUntil: 'domcontentloaded'});
        await expect(isolated.getByRole('heading', {name: 'Сәлем, Проверка WebGL.'})).toBeVisible();
        const layer = isolated.locator('[data-webgl-host]');
        await expect(layer).toHaveAttribute('data-webgl-state', mode === 'system-reduced' ? 'reduced' : 'fallback');
        await expect(layer.locator('.webgl-fallback')).toBeVisible();
        expect(await layer.locator('.webgl-fallback').evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe('none');
        if (mode === 'webgl-disabled') await expect(layer).toHaveAttribute('data-webgl-failure', 'unsupported');
        await expect(isolated.locator('.balance-number')).toHaveText(money(9876544));
        if (mode === 'system-reduced') {
          await expect(layer.locator('canvas')).toHaveCount(0);
          expect(await isolated.evaluate(() => (window as Window & {webglRequests?: number}).webglRequests)).toBe(0);
          const frame = await layer.getAttribute('data-webgl-frame');
          await frames(isolated);
          expect(await layer.getAttribute('data-webgl-frame')).toBe(frame);
          await isolated.getByRole('combobox', {name: 'Анимации интерфейса', exact: true}).selectOption('full');
          await expect(layer).toHaveAttribute('data-webgl-state', /^(active|fallback)$/);
          await expect(layer).not.toHaveAttribute('data-webgl-failure', /^(renderer|shader|render|setup)$/);
          if (await layer.getAttribute('data-webgl-state') === 'active') {
            await expect(layer).toHaveAttribute('data-webgl-quality', /^(mobile|low)$/);
          }
          expect(await isolated.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
        }
        expect(await isolated.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await isolated.screenshot({path: `test-results/webgl-${mode}-mobile.png`, fullPage: true});
      } finally {await context.close();}
    }
    expect(runtimeErrors).toEqual([]);
    // Expected context failure is observed separately from JS exceptions; real
    // shader compilation failures must never be silently classified as fallback.
    expect(consoleErrors.filter(message => /shader|glsl|VALIDATE_STATUS/i.test(message))).toEqual([]);
  } finally {
    const removed = await page.request.delete('/api/account', {
      headers: {Origin: origin}, data: {password, confirmation: 'УДАЛИТЬ'},
    });
    expect(removed.status()).toBe(200);
  }
});
