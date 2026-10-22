import {describe, expect, it} from 'vitest';
import {calculateAccountBalances} from '../../src/lib/accounts';
import {accountEditSchema, accountSchema, parseTransactionFilters, transactionFiltersSchema, transferSchema} from '../../src/lib/validation';

describe('account balances', () => {
  const accounts = [
    {id: 'cash', name: 'Наличные', kind: 'cash', openingMinor: 100000n, archived: false},
    {id: 'card', name: 'Карта', kind: 'card', openingMinor: 250000n, archived: false},
    {id: 'deposit', name: 'Депозит', kind: 'deposit', openingMinor: 500000n, archived: true},
  ];
  const operations = [
    {accountId: 'cash', type: 'income', amountMinor: 75029n},
    {accountId: 'cash', type: 'expense', amountMinor: 12345n},
    {accountId: 'card', type: 'expense', amountMinor: 20000n},
    {accountId: null, type: 'income', amountMinor: 20011n},
    {accountId: null, type: 'expense', amountMinor: 10001n},
  ];

  it('combines opening balances and signed operations without losing fractional tenge', () => {
    const result = calculateAccountBalances(accounts, operations, []);
    expect(result.items.map(account => [account.id, account.openingMinor, account.balanceMinor])).toEqual([
      ['cash', '100000', '162684'], ['card', '250000', '230000'], ['deposit', '500000', '500000'],
    ]);
    expect(result.items[2].archived).toBe(true);
    expect(result.unassignedBalanceMinor).toBe('10010');
    expect(result.totalBalanceMinor).toBe('902694');
  });

  it('moves money between accounts while preserving the total and legacy balance', () => {
    const before = calculateAccountBalances(accounts, operations, []);
    const after = calculateAccountBalances(accounts, operations, [
      {fromAccountId: 'cash', toAccountId: 'card', amountMinor: 15050n},
      {fromAccountId: 'card', toAccountId: 'deposit', amountMinor: 29n},
    ]);
    expect(after.items.map(account => account.balanceMinor)).toEqual(['147634', '245021', '500029']);
    expect(after.totalBalanceMinor).toBe(before.totalBalanceMinor);
    expect(after.unassignedBalanceMinor).toBe(before.unassignedBalanceMinor);
  });

  it('keeps historical operations usable when no account has been created', () => {
    const result = calculateAccountBalances([], [
      {accountId: null, type: 'income', amountMinor: 10000n},
      {accountId: null, type: 'expense', amountMinor: 10029n},
    ], []);
    expect(result).toEqual({items: [], unassignedBalanceMinor: '-29', totalBalanceMinor: '-29'});
    expect(calculateAccountBalances([], [], []).totalBalanceMinor).toBe('0');
  });

  it('allows a negative account balance when expenses exceed the opening balance', () => {
    const result = calculateAccountBalances([accounts[0]], [{accountId: 'cash', type: 'expense', amountMinor: 100029n}], []);
    expect(result.items[0].balanceMinor).toBe('-29');
    expect(result.totalBalanceMinor).toBe('-29');
  });

  it('preserves exact grouped totals above the safe integer range', () => {
    const result = calculateAccountBalances([accounts[0]], [
      {accountId: 'cash', type: 'income', amountMinor: 9007199254740993n},
      {accountId: 'cash', type: 'expense', amountMinor: 2n},
    ], []);
    expect(result.totalBalanceMinor).toBe('9007199254840991');
  });
});

describe('account and transfer validation', () => {
  const account = {name: '  Наличные  ', kind: 'cash', opening: '100.29'};
  const transfer = {fromAccountId: 'cash', toAccountId: 'card', amount: '15,29', date: '2026-10-22', requestId: crypto.randomUUID()};

  it('trims names and converts opening balances and transfer amounts to exact minor units', () => {
    expect(accountSchema.parse(account)).toMatchObject({name: 'Наличные', kind: 'cash', opening: 10029n});
    expect(accountSchema.parse({...account, opening: '0'}).opening).toBe(0n);
    expect(accountSchema.safeParse({...account, requestId: crypto.randomUUID()}).success).toBe(true);
    expect(transferSchema.parse(transfer)).toMatchObject({amount: 1529n, note: ''});
  });

  it('limits account kinds, names and money precision and rejects supplied owners', () => {
    for (const invalid of [
      {...account, kind: 'crypto'}, {...account, name: ' '}, {...account, name: 'a'.repeat(61)},
      {...account, opening: '0.001'}, {...account, requestId: 'not-a-uuid'}, {...account, userId: 'someone-else'},
    ]) expect(accountSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts metadata or baseline corrections and requires at least one editable field', () => {
    expect(accountEditSchema.parse({archived: true})).toEqual({archived: true});
    expect(accountEditSchema.parse({opening: '20.29'})).toEqual({opening: 2029n});
    expect(accountEditSchema.safeParse({}).success).toBe(false);
    expect(accountEditSchema.safeParse({opening: '-1'}).success).toBe(false);
    expect(accountEditSchema.safeParse({userId: 'someone-else', name: 'Карта'}).success).toBe(false);
  });

  it('rejects self-transfers, zero amounts, invalid dates and unsafe identifiers', () => {
    for (const invalid of [
      {...transfer, toAccountId: 'cash'}, {...transfer, amount: '0'}, {...transfer, amount: '-1'},
      {...transfer, amount: '0.001'}, {...transfer, date: '2026-02-30'}, {...transfer, fromAccountId: ''},
      {...transfer, toAccountId: 'a'.repeat(192)}, {...transfer, requestId: 'not-a-uuid'},
      {...transfer, userId: 'someone-else'},
    ]) expect(transferSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('transaction search validation', () => {
  it('parses a combined search and preserves zero as an amount boundary', () => {
    const filters = transactionFiltersSchema.parse({
      month: '2026-10', page: '2', q: '  магазин  ', type: 'expense', category: 'Продукты',
      accountId: 'unassigned', from: '2026-10-01', to: '2026-10-22', min: '0', max: '12,29',
    });
    expect(filters).toMatchObject({month: '2026-10', page: 2, q: 'магазин', accountId: 'unassigned', min: 0n, max: 1229n});
  });

  it('uses the default month unless all history is requested', () => {
    expect(parseTransactionFilters(new URLSearchParams(), '2026-10')).toMatchObject({month: '2026-10', page: 1});
    const allHistory = parseTransactionFilters(new URLSearchParams({all: '1', q: '   '}), '2026-10');
    expect(allHistory.month).toBeUndefined();
    expect(allHistory.q).toBe('');
    expect(allHistory.all).toBe('1');
  });

  it('rejects invalid ranges, dates, pagination and unsupported filter values', () => {
    for (const invalid of [
      {min: '20', max: '10'}, {from: '2026-10-22', to: '2026-10-01'}, {from: '2026-02-30'},
      {month: '2026-13'}, {page: '0'}, {page: '10001'}, {page: '1.5'}, {q: 'a'.repeat(101)},
      {type: 'transfer'}, {category: 'unknown'}, {accountId: ''}, {min: '0.001'}, {all: 'true'},
      {userId: 'someone-else'},
    ]) expect(transactionFiltersSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate or unknown URL parameters instead of silently ignoring them', () => {
    expect(() => parseTransactionFilters(new URLSearchParams('q=first&q=second'), '2026-10')).toThrow();
    expect(() => parseTransactionFilters(new URLSearchParams('userId=someone-else'), '2026-10')).toThrow();
    expect(() => parseTransactionFilters(new URLSearchParams('__proto__=ignored'), '2026-10')).toThrow();
    expect(() => parseTransactionFilters(new URLSearchParams('constructor=ignored'), '2026-10')).toThrow();
  });
});
