// Financial pages and API responses are never stored in Cache Storage.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Qarzhy — нет подключения</title><body style="font:18px system-ui;background:#08110f;color:#e5eee8;padding:32px"><h1>Нет подключения</h1><p>Ваши финансовые данные не сохраняются для офлайн-просмотра. Подключитесь к интернету и откройте приложение снова.</p><a style="color:#b5f36b" href="/">Повторить</a></body></html>', {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
