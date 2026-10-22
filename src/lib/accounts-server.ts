import {Prisma} from '@prisma/client';
import {db} from './db';
import {calculateAccountBalances} from './accounts';
import {localToday, monthBounds} from './finance';
import {ApiError, json, readJson} from './server';
import {accountEditSchema, accountSchema, parseTransactionFilters, transactionEditSchema, transactionSchema, transferSchema} from './validation';

// Wallet writes share the owner's row lock. Checks and mutations are atomic with
// archive/baseline edits, duplicate requests, and whole-user cascade deletion.
async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{id: string}[]>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
  if (!rows.length) throw new ApiError(404, 'Аккаунт не найден.');
}
export async function requireWritableAccount(tx: Prisma.TransactionClient, userId: string, accountId: string, retainedAccountId?: string | null) {
  const account = await tx.account.findFirst({where: {id: accountId, userId}});
  if (!account) throw new ApiError(404, 'Счёт не найден.');
  if (account.archived && account.id !== retainedAccountId) throw new ApiError(400, 'Счёт в архиве. Восстановите его для новых операций.');
  return account;
}
export function withAccountName<T extends {account: {name: string} | null}>(row: T) {
  const {account, ...rest} = row;
  return {...rest, accountName: account?.name ?? null};
}
function withTransferNames<T extends {fromAccount: {name: string}; toAccount: {name: string}}>(row: T) {
  const {fromAccount, toAccount, ...rest} = row;
  return {...rest, fromAccountName: fromAccount.name, toAccountName: toAccount.name};
}
const accountName = {account: {select: {name: true}}} as const;
const transferNames = {fromAccount: {select: {name: true}}, toAccount: {select: {name: true}}} as const;

export async function getAccounts(userId: string) {
  // A single snapshot keeps all totals consistent if another tab saves a write.
  return db.$transaction(async tx => {
    const accounts = await tx.account.findMany({where: {userId}, orderBy: [{archived: 'asc'}, {createdAt: 'asc'}, {id: 'asc'}]});
    const operations = await tx.transaction.groupBy({by: ['accountId', 'type'], where: {userId}, _sum: {amountMinor: true}});
    const transfers = await tx.transfer.groupBy({by: ['fromAccountId', 'toAccountId'], where: {userId}, _sum: {amountMinor: true}});
    return calculateAccountBalances(accounts, operations.map(row => ({accountId: row.accountId, type: row.type, amountMinor: row._sum.amountMinor ?? 0n})), transfers.map(row => ({fromAccountId: row.fromAccountId, toAccountId: row.toAccountId, amountMinor: row._sum.amountMinor ?? 0n})));
  }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
}

export async function getTransactions(userId: string, params: URLSearchParams) {
  const filters = parseTransactionFilters(params, localToday().slice(0, 7));
  if (filters.accountId && filters.accountId !== 'unassigned' && !await db.account.findFirst({where: {id: filters.accountId, userId}, select: {id: true}})) throw new ApiError(404, 'Счёт не найден.');
  const conditions: Prisma.Sql[] = [Prisma.sql`t."userId" = ${userId}`];
  if (!filters.all) {
    const bounds = monthBounds(filters.month!);
    conditions.push(Prisma.sql`t."date" >= ${bounds.start} AND t."date" < ${bounds.end}`);
  }
  if (filters.from) conditions.push(Prisma.sql`t."date" >= ${new Date(filters.from)}`);
  if (filters.to) conditions.push(Prisma.sql`t."date" <= ${new Date(filters.to)}`);
  if (filters.q) {
    // The local database uses locale C; explicit Unicode collation also folds
    // Cyrillic case. Escape LIKE metacharacters so q stays a literal substring.
    const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(Prisma.sql`(t."note" COLLATE "und-x-icu" ILIKE ${pattern} OR t."category" COLLATE "und-x-icu" ILIKE ${pattern})`);
  }
  if (filters.type) conditions.push(Prisma.sql`t."type" = ${filters.type}`);
  if (filters.category) conditions.push(Prisma.sql`t."category" = ${filters.category}`);
  if (filters.accountId === 'unassigned') conditions.push(Prisma.sql`t."accountId" IS NULL`);
  else if (filters.accountId) conditions.push(Prisma.sql`t."accountId" = ${filters.accountId}`);
  if (filters.min !== undefined) conditions.push(Prisma.sql`t."amountMinor" >= ${filters.min}`);
  if (filters.max !== undefined) conditions.push(Prisma.sql`t."amountMinor" <= ${filters.max}`);
  const where = Prisma.join(conditions, ' AND ');
  type SearchRow = Prisma.TransactionGetPayload<{}> & {accountName: string | null};
  const [items, total] = await db.$transaction([
    db.$queryRaw<SearchRow[]>(Prisma.sql`SELECT t.*, a."name" AS "accountName" FROM "Transaction" AS t LEFT JOIN "Account" AS a ON a."id" = t."accountId" AND a."userId" = t."userId" WHERE ${where} ORDER BY t."date" DESC, t."createdAt" DESC, t."id" DESC LIMIT 50 OFFSET ${(filters.page - 1) * 50}`),
    db.$queryRaw<{total: bigint}[]>(Prisma.sql`SELECT count(*) AS "total" FROM "Transaction" AS t WHERE ${where}`),
  ], {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  return {items, total: Number(total[0].total), page: filters.page, pageSize: 50};
}
export async function createTransaction(userId: string, body: unknown) {
  const {amount, date, accountId, ...rest} = transactionSchema.parse(body);
  return db.$transaction(async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.transaction.findUnique({where: {userId_requestId: {userId, requestId: rest.requestId}}, include: accountName});
    if (existing) {
      if (accountId) await requireWritableAccount(tx, userId, accountId, existing.accountId);
      return withAccountName(existing);
    }
    if (accountId) await requireWritableAccount(tx, userId, accountId);
    const record = await tx.transaction.create({data: {...rest, userId, amountMinor: amount, date: new Date(date), accountId: accountId ?? null}, include: accountName});
    return withAccountName(record);
  });
}
export async function editTransaction(userId: string, id: string, body: unknown) {
  const {amount, date, accountId, ...rest} = transactionEditSchema.parse(body);
  await db.$transaction(async tx => {
    await lockOwner(tx, userId);
    const existing = await tx.transaction.findFirst({where: {id, userId}, select: {accountId: true}});
    if (!existing) throw new ApiError(404, 'Операция не найдена.');
    // Omitted fields preserve legacy clients' existing wallet assignment.
    const nextAccountId = accountId === undefined ? existing.accountId : accountId;
    if (nextAccountId) await requireWritableAccount(tx, userId, nextAccountId, existing.accountId);
    const result = await tx.transaction.updateMany({where: {id, userId}, data: {...rest, amountMinor: amount, date: new Date(date), accountId: nextAccountId}});
    if (!result.count) throw new ApiError(404, 'Операция не найдена.');
  });
}

export async function accountsRoute(req: Request, userId: string, parts: string[]): Promise<Response | null> {
  const route = parts.join('/');
  if (route === 'accounts' && req.method === 'GET') return json(await getAccounts(userId));
  if (route === 'accounts' && req.method === 'POST') {
    const {opening, requestId, ...rest} = accountSchema.parse(await readJson(req));
    const account = await db.$transaction(async tx => {
      await lockOwner(tx, userId);
      if (requestId) {
        const prior = await tx.account.findUnique({where: {userId_requestId: {userId, requestId}}});
        if (prior) {
          if (prior.name !== rest.name || prior.kind !== rest.kind || prior.openingMinor !== opening) throw new ApiError(409, 'Этот запрос уже создал другой счёт. Обновите список.');
          return prior;
        }
      }
      if (await tx.account.count({where: {userId}}) >= 100) throw new ApiError(400, 'Максимум 100 счетов, включая архивные.');
      return tx.account.create({data: {...rest, userId, openingMinor: opening, requestId: requestId ?? null}});
    });
    return json(account, 201);
  }
  if (parts[0] === 'accounts' && parts.length === 2 && req.method === 'PATCH') {
    const {opening, ...rest} = accountEditSchema.parse(await readJson(req));
    await db.$transaction(async tx => {
      await lockOwner(tx, userId);
      const result = await tx.account.updateMany({where: {id: parts[1], userId}, data: {...rest, ...(opening === undefined ? {} : {openingMinor: opening})}});
      if (!result.count) throw new ApiError(404, 'Счёт не найден.');
    });
    return json({ok: true});
  }
  if (route === 'transfers' && req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    const pageValue = params.get('page') ?? '1';
    const page = Number(pageValue);
    if (!/^\d+$/.test(pageValue) || !Number.isInteger(page) || page < 1 || page > 10000 || [...params.keys()].some(key => key !== 'page') || params.getAll('page').length > 1) throw new ApiError(400, 'Некорректная страница.');
    const [items, total] = await db.$transaction([
      db.transfer.findMany({where: {userId}, orderBy: [{date: 'desc'}, {createdAt: 'desc'}, {id: 'desc'}], take: 50, skip: (page - 1) * 50, include: transferNames}),
      db.transfer.count({where: {userId}}),
    ], {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
    return json({items: items.map(withTransferNames), total, page, pageSize: 50});
  }
  if (route === 'transfers' && req.method === 'POST') {
    const {amount, date, ...rest} = transferSchema.parse(await readJson(req));
    const transfer = await db.$transaction(async tx => {
      await lockOwner(tx, userId);
      const prior = await tx.transfer.findUnique({where: {userId_requestId: {userId, requestId: rest.requestId}}, include: transferNames});
      if (prior) {
        if (prior.fromAccountId !== rest.fromAccountId || prior.toAccountId !== rest.toAccountId || prior.amountMinor !== amount || prior.date.toISOString().slice(0, 10) !== date || prior.note !== rest.note) throw new ApiError(409, 'Этот запрос уже записал другой перевод. Обновите список.');
        return prior;
      }
      await requireWritableAccount(tx, userId, rest.fromAccountId);
      await requireWritableAccount(tx, userId, rest.toAccountId);
      return tx.transfer.create({data: {...rest, userId, amountMinor: amount, date: new Date(date)}, include: transferNames});
    });
    return json(withTransferNames(transfer), 201);
  }
  if (parts[0] === 'transfers' && parts.length === 2 && req.method === 'DELETE') {
    const result = await db.transfer.deleteMany({where: {id: parts[1], userId}});
    if (!result.count) throw new ApiError(404, 'Перевод не найден.');
    return json({ok: true});
  }
  return null;
}
