export const categories = ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Дом', 'Покупки', 'Здоровье', 'Образование', 'Отдых', 'Зарплата', 'Подработка', 'Другое'] as const;
export const palette = ['#b5f36b', '#66d9c1', '#b09aef', '#efb97a', '#74a7ed', '#e7a2be', '#a8c989', '#c99ddc', '#87c4d9', '#d3c17d', '#a2b3aa'];
export function toMinor(value: string): bigint {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) throw new Error('Введите сумму с точностью до двух знаков.');
  const [whole, fraction = ''] = normalized.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > 999999999999n) throw new Error('Сумма слишком велика.');
  return result;
}
export function amountInput(minor: string): string {
  const amount = BigInt(minor);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export function money(minor: string | bigint | number, compact = false): string {
  return new Intl.NumberFormat('ru-KZ', {style: 'currency', currency: 'KZT', maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: 0, ...(compact ? {notation: 'compact' as const} : {})}).format(Number(minor) / 100);
}
export function localToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const p = (type: string) => parts.find(x => x.type === type)!.value;
  return `${p('year')}-${p('month')}-${p('day')}`;
}
export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2000-01' || month > '2100-12') throw new Error('Некорректный месяц.');
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return {start, end};
}
export type TransactionView = {id: string; type: 'income' | 'expense'; amountMinor: string; category: string; note: string; date: string; accountId?: string | null; accountName?: string | null};
export type GoalView = {id: string; name: string; targetMinor: string; savedMinor: string; deadline: string | null};
export type Summary = {income: string; expense: string; balance: string; count: number; byCategory: {name: string; value: string}[]; daily: {day: string; income: number; expense: number}[]};
export function summarize(rows: {type: string; amountMinor: bigint; category: string; date: Date}[], month: string): Omit<Summary, 'balance'> {
  const {start, end} = monthBounds(month);
  const daily: Summary['daily'] = [];
  for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) daily.push({day: String(d.getUTCDate()), income: 0, expense: 0});
  let income = 0n, expense = 0n;
  const grouped = new Map<string, bigint>();
  for (const row of rows) {
    if (row.date < start || row.date >= end) continue;
    if (row.type === 'income') income += row.amountMinor;
    else { expense += row.amountMinor; grouped.set(row.category, (grouped.get(row.category) || 0n) + row.amountMinor); }
    daily[row.date.getUTCDate() - 1][row.type === 'income' ? 'income' : 'expense'] += Number(row.amountMinor) / 100;
  }
  return {income: income.toString(), expense: expense.toString(), count: rows.filter(r => r.date >= start && r.date < end).length, byCategory: [...grouped].map(([name, value]) => ({name, value: value.toString()})).sort((a,b) => Number(b.value) - Number(a.value)), daily};
}
