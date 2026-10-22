# Qarzhy: архитектура MVP

Отдельное приложение, не связанное с существующим сайтом в родительской папке.
Next.js App Router + React/TypeScript; Tailwind и собственные семантические CSS-токены; Recharts; Motion. PostgreSQL через Prisma. Модульный монолит: клиент → API → аутентификация и валидация → запросы с userId → PostgreSQL.

## Данные и границы
- User: email, отображаемое имя, хеш пароля scrypt, версия и время согласия, отдельные разрешения на ИИ/голос.
- Session: в базе только SHA-256 случайного 256-битного токена; HttpOnly/SameSite cookie, абсолютный срок 7 дней. Выход и удаление аккаунта отзывают сессии.
- Transaction: владелец, доход/расход, сумма в целых тиынах (BigInt), категория, дата и необязательная заметка. Ключ идемпотентности предотвращает повторное добавление.
- Goal: владелец, целевая сумма и вручную отмеченные накопления. Это план, а не отдельный банковский баланс; изменение цели не создаёт финансовую операцию.
- RateLimit: атомарные общие лимиты в PostgreSQL, без зависимости от процесса Next.js.

Идентификатор владельца никогда не принимается от клиента. Все чтения, изменения, удаления и экспорт фильтруются текущим userId. API не использует данные браузера как доказательство прав. PostgreSQL RLS не включён: граница доступа находится в серверном слое и проверяется интеграционными тестами с двумя пользователями. Перед подключением аналитических/административных сервисов добавить отдельные роли и RLS.

## API
`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`; `/api/me`; `/api/transactions[/id]`; `/api/goals[/id]`; `/api/summary?month=YYYY-MM`; `/api/export`; `/api/account`; `/api/assistant`; `/api/voice`; `/api/health`.

Изменяющие запросы требуют точного Origin, JSON (кроме ограниченной загрузки аудио) и сессии; сервер проверяет структуру и размер данных. Нет API с изменениями через GET. В общем режиме ИИ получает только введённый вопрос; функция чтения финансовой сводки не вызывается. В финансовом режиме передаются рассчитанные месячные итоги и вопрос пользователя, без email, имени, баланса, заметок и списка операций. Аудио обрабатывается транзитно, не сохраняется на диск. Согласие привязано к конфигурации, режиму и условиям обработки провайдера и требует обновления при их смене.

Gemini использует серверный OpenAI-совместимый endpoint. Для бесплатного или неподтверждённого тарифа сервер принудительно выбирает общий режим, даже если AI_CONTEXT_MODE ошибочно задан financial. Для финансового режима Google нужны явно подтверждённые условия Paid Services (AI_GOOGLE_PAID_SERVICES=true), явный financial и проверка оператором места/основания обработки; один API-ключ и список моделей этого не подтверждают. Голос через Gemini не интегрирован. Текущее локальное подключение: gemini-3.1-flash-lite, общий режим, минимальное reasoning, лимит2048 токенов вместе с reasoning. Ключ не попадает в клиент или ответы API. Google использует глобальную инфраструктуру; поле AI_PROCESSING_COUNTRY хранит правдивое описание места обработки, а не вымышленную фиксированную страну.

## Развитие
Статические клиентские ресурсы можно кешировать; приватные API — no-store. Несколько экземпляров приложения используют общие PostgreSQL и лимиты. Для роста: пул соединений, WAF, отдельная очередь задач, метрики без персональных данных, резервное копирование с проверкой восстановления. Миграции выполняются отдельным шагом релиза.

## Границы первой версии
Развёртывание: GitHub хранит код, Vercel исполняет Next.js и Node.js API, внешняя PostgreSQL хранит данные. Статический GitHub Pages не поддерживает полную архитектуру. `src/lib/hosting.ts` определяет один доверенный Origin для локального, production или preview окружения; клиентские финансовые контракты не меняются. Миграции выполняются отдельным шагом, не при Vercel-сборке. Подробности и ограничения: [PUBLICATION.md](PUBLICATION.md), [VERCEL.md](VERCEL.md).

Одна валюта KZT; ручной учёт без банковской интеграции; русский интерфейс. Нет платежей, перевода денег, инвестиционных рекомендаций, email-верификации или восстановления пароля. Публичный запуск требует добавления верификации email и безопасного восстановления; до этого регистрация предназначена для закрытого пилота. Никаких предзаполненных финансовых данных.

## Planning and import (2026-10-19)
- Budget: one owner/month/category limit, expense totals from actual transactions; warning at 80%, exhausted at 100%, overrun above 100%.
- Recurring payments: user-owned schedule, in-app reminders through the next three days. No bank charges or background push. Confirmation records one due expense and advances one period atomically. Duplicate/concurrent confirmations return 409. Short months preserve the original day-of-month.
- Favorites: up to six categories stored in User; quick expense uses today's Kazakhstan date. Repeat opens a new operation for review; it never edits the old operation.
- Comparison: full selected calendar month versus previous calendar month, exact integer totals. Savings means income minus expense, not a bank account balance.
- CSV: UTF-8, comma/semicolon, column mapping, preview, all-or-nothing validation, max 500 rows / 500 KB. Unknown categories require correction or explicit mapping to Other. Idempotency fingerprint includes normalized content and duplicate occurrence ordinal. Reimport of matching CSV records is skipped; manual transactions are not deduplicated. Overlapping extracts with genuinely identical transactions should be reviewed before import.
- PWA: manifest, generated icons, install instructions and service worker with generic offline fallback. No private responses or financial pages cached. Localhost works only on this computer; real phone installation needs a reachable HTTPS deployment.
- Export includes budgets, schedules and favorites; account deletion cascades to all new records.

## Accounts, transfers and search (2026-10-22)
- Account: owner, cash/card/deposit, display name, initial balance in tiyn, archived state and optional idempotency UUID. At most100 per owner. Initial balance corrections affect wallet totals only. No bank credentials or account numbers are requested.
- Transaction.accountId is nullable; additive migration leaves all historical rows unassigned. Composite(accountId,userId) foreign keys enforce ownership in PostgreSQL as well as in HTTP validation.
- Transfer is a separate owner-scoped table with two different wallet references, positive exact amount, date, note and request UUID. Composite keys protect both ends. Transfers never enter income/expense summaries or budgets. Wallet balances = baseline + income − expense + inbound − outbound; unassigned net operations remain visible. Archived wallet balances remain included. Overview's existing balance remains global income − expense.
- Account/assigned-transaction/transfer creation and baseline/archive edits serialize on the owner row. Same transfer UUID/body returns the original; different body returns409. List/balance/export snapshots use RepeatableRead. Native account deletion cascades to wallets/transfers/operations; ordinary wallet removal is archive only.
- `/api/accounts` GET/POST and `/:id` PATCH; `/api/transfers` GET/POST and `/:id` DELETE. Transfers and transaction search paginate50 rows. Export includes all new records.
- Transaction filters: q,type,category,accountId or unassigned,from/to inclusive,min/max exactKZT,all=1,page. Default dates stay within selected month; all=1 searches across history. All conditions retain owner filtering. Query SQL is parameterized and literal LIKE metacharacters are escaped. Unicode case-insensitive q uses PostgreSQL ICU collation `und-x-icu`, verified on the local database; deployment PostgreSQL must provide this collation. No locale/database reset is performed.
- Calendar is a pure projection of existing recurring records and original anchorDay. It never charges, sends external notifications or writes expenses. Past missing occurrences are not synthesized. Future inferred dates are labeled estimates.
