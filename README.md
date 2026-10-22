# Qarzhy

Рабочая MVP личного финансового учёта в тенге, созданная с нуля в отдельной папке. Next.js 16 / React 19 / TypeScript / Tailwind CSS / PostgreSQL / Prisma / Recharts / Motion / Vitest / Playwright.

## Что реализовано
- Регистрация с согласием, вход, выход; пароли scrypt, отзываемые серверные сессии в HttpOnly cookie.
- Добавление, редактирование, удаление доходов и расходов; категории, дата, заметка, история по месяцам и пагинация.
- Точные суммы в целых тиынах, общий баланс, месячные итоги, график по дням и структура расходов.
- Финансовые цели, срок и ручное обновление накоплений.
- ИИ-помощник с отдельным согласием и серверным ключом. Текущий Gemini работает в учебном режиме без автоматической передачи финансовых данных аккаунта; голос для него не подключён.
- Экспорт JSON, отзыв разрешений и удаление аккаунта с каскадным удалением финансовых данных.
- Проверка владельца каждой записи, Zod, ограничение запросов в PostgreSQL, Origin/CSRF-защита, ограничения размера тела и заголовки безопасности.
- Адаптивный русский интерфейс с пустыми состояниями, доступными формами и reduced motion.

## Запуск

Для уже собранного проекта на этом компьютере дважды нажмите `START-QARZHY.cmd`. Он запускает PostgreSQL и готовую сборку в фоне, проверяет подключение и открывает браузер. После изменения исходников сначала выполните `npm run build`. Это экономнее по памяти, чем режим разработки.

```powershell
cd C:\Users\Admin\Documents\ChatGPT\finance
npm ci
npm run setup:local
npm run db:generate
npm run db:local
```

В другом терминале из этой же папки:

```powershell
npm run db:migrate
npm run dev
```

Открыть [127.0.0.1:3100](http://127.0.0.1:3100) и зарегистрироваться. PostgreSQL и приложение должны работать одновременно. Данные не демонстрационные; приложение начинается с пустого аккаунта.

Подробности: [архитектура](docs/ARCHITECTURE.md), [запуск и развёртывание](docs/DEPLOYMENT.md), [персональные данные](docs/PRIVACY-KZ.md).

## GitHub и публикация

Результаты проверки: [docs/PUBLICATION.md](docs/PUBLICATION.md). Порядок загрузки кода: [docs/GITHUB.md](docs/GITHUB.md). GitHub Pages не запускает серверные API этого проекта. Для GitHub + Vercel с внешней PostgreSQL подготовлены [настройки и инструкция](docs/VERCEL.md); серверные функции сохраняются.

На сервере создайте приватный `.env.production` по `.env.production.example`. Настоящие ключи, локальная база, дампы, отчёты и скриншоты исключены через `.gitignore` и `.dockerignore`. `git push` не переносит существующий аккаунт или финансовые записи: данные переносятся отдельно в согласованную серверную БД. Развёртывание на внешнем сервере ещё не выполнено.

Перед коммитом: `npm run check:publish`. На Vercel добавьте приватные переменные по `.env.vercel.example`; `npm run build:vercel` проверяет их перед сборкой. GitHub Actions выполняет тесты и сборку с временной БД без публикации и production-секретов.

MVP предназначена для закрытого личного пилота. Банковской интеграции, платежей, восстановления пароля и подтверждения email нет. Публичный запуск требует доработок, указанных в инструкции. Не заявляется готовность к национальному масштабу без нагрузочных и эксплуатационных проверок.

## New finance tools
- **Бюджет и платежи**: monthly category limits and recurring weekly/monthly/yearly expenses with in-app reminders and confirmation before recording.
- **Обзор / Операции**: quick expense, saved favorite categories, review-and-repeat of the last operation.
- **Аналитика**: full calendar-month comparison and category deltas.
- **Импорт CSV**: download template, map columns, preview and validate, then import. The template contains a clearly marked example; replace it before import. UTF-8 KZT only, 500 rows / 500 KB; no bank API required.
- **Настройки**: PWA installation. Actual phone installation requires a reachable HTTPS address; 127.0.0.1 refers to the device itself. Financial data requires online access. No background push delivery is configured.

Run `npm run db:migrate` before starting the updated app. Docker and the local launcher include public PWA assets. No additional paid API or secret keys are required for these six features.

Low-memory verification: set `LOW_MEMORY_BUILD=true`, `NODE_OPTIONS=--max-old-space-size=640 --max-semi-space-size=2`, `RAYON_NUM_THREADS=1`, `UV_THREADPOOL_SIZE=1` and run `npm run build`. The package command checks TypeScript in a separate required process before Next; only Next's duplicate in-process check is disabled in this mode. Set `LOW_MEMORY_TESTS=true` for the reduced-GPU Playwright launch when needed. Never run a production release without the preceding typecheck.
