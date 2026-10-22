export const accountKinds = ['cash', 'card', 'deposit'] as const;
export type AccountKind = typeof accountKinds[number];
export const accountKindLabels: Record<AccountKind, string> = {cash: 'Наличные', card: 'Карта', deposit: 'Вклад'};
export type AccountView = {id: string; name: string; kind: AccountKind; openingMinor: string; balanceMinor: string; archived: boolean};
export type AccountsData = {items: AccountView[]; unassignedBalanceMinor: string; totalBalanceMinor: string};
export type TransferView = {id: string; fromAccountId: string; toAccountId: string; fromAccountName: string; toAccountName: string; amountMinor: string; date: string; note: string};
type BalanceAccount = {id: string; name: string; kind: string; openingMinor: bigint; archived: boolean};
type BalanceOperation = {accountId: string | null; type: string; amountMinor: bigint};
type BalanceTransfer = {fromAccountId: string; toAccountId: string; amountMinor: bigint};

/** Exact, all-time tracked balances. Transfers cancel from the overall total. */
export function calculateAccountBalances(accounts: BalanceAccount[], operations: BalanceOperation[], transfers: BalanceTransfer[]): AccountsData {
  const balances = new Map(accounts.map(account => [account.id, account.openingMinor]));
  let unassigned = 0n;
  const add = (id: string, amount: bigint) => {
    const balance = balances.get(id);
    if (balance === undefined) throw new Error('Unknown account in balance data.');
    balances.set(id, balance + amount);
  };
  for (const operation of operations) {
    const amount = operation.type === 'income' ? operation.amountMinor : -operation.amountMinor;
    if (operation.accountId === null) unassigned += amount;
    else add(operation.accountId, amount);
  }
  for (const transfer of transfers) {
    add(transfer.fromAccountId, -transfer.amountMinor);
    add(transfer.toAccountId, transfer.amountMinor);
  }
  return {
    items: accounts.map(account => ({id: account.id, name: account.name, kind: account.kind as AccountKind, openingMinor: account.openingMinor.toString(), balanceMinor: balances.get(account.id)!.toString(), archived: account.archived})),
    unassignedBalanceMinor: unassigned.toString(),
    totalBalanceMinor: [...balances.values()].reduce((sum, amount) => sum + amount, unassigned).toString(),
  };
}
