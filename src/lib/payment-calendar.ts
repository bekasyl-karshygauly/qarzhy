import {monthBounds} from './finance';
import type {RecurringView} from './planning';

export type CalendarOccurrence = {
  id: string;
  recurringId: string;
  name: string;
  category: string;
  amountMinor: string;
  date: string;
  status: 'overdue' | 'today' | 'planned';
  isProjection: boolean;
};

export type CalendarDay = {
  date: string;
  occurrences: CalendarOccurrence[];
  totalMinor: string;
};

type CalendarRecurring = RecurringView & {anchorDay?: number};

function dateOnly(value: string): string | null {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function sumOccurrences(items: CalendarOccurrence[]): string {
  return items.reduce((total, item) => total + BigInt(item.amountMinor), 0n).toString();
}

/** Advance from the stored date, retaining the original day after short months. */
function occurrenceAt(item: CalendarRecurring, initial: string, periods: number): string {
  const start = new Date(`${initial}T00:00:00Z`);
  if (item.frequency === 'weekly') {
    start.setUTCDate(start.getUTCDate() + periods * 7);
    return start.toISOString().slice(0, 10);
  }
  const anchor = Number.isInteger(item.anchorDay) && item.anchorDay! >= 1 && item.anchorDay! <= 31
    ? item.anchorDay!
    : start.getUTCDate();
  const targetMonth = start.getUTCMonth() + periods * (item.frequency === 'yearly' ? 12 : 1);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(start.getUTCFullYear(), targetMonth, Math.min(anchor, lastDay))).toISOString().slice(0, 10);
}

function firstProjectionPeriod(item: CalendarRecurring, initial: string, floor: string): number {
  const start = new Date(`${initial}T00:00:00Z`);
  const target = new Date(`${floor}T00:00:00Z`);
  let period: number;
  if (item.frequency === 'weekly') {
    period = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / (7 * 86_400_000)));
  } else {
    const months = (target.getUTCFullYear() - start.getUTCFullYear()) * 12 + target.getUTCMonth() - start.getUTCMonth();
    period = Math.max(1, item.frequency === 'yearly' ? Math.floor(months / 12) : months);
    if (occurrenceAt(item, initial, period) < floor) period += 1;
  }
  return period;
}

/**
 * Read-only schedule projection. Only the stored nextDate is an actual pending
 * occurrence. Later dates are estimates, never evidence of a recorded expense.
 * Missing past periods are not fabricated; an overdue nextDate remains pending.
 */
export function projectPaymentCalendar(recurring: CalendarRecurring[], month: string, today: string) {
  const {start, end} = monthBounds(month);
  const first = start.toISOString().slice(0, 10);
  const afterMonth = end.toISOString().slice(0, 10);
  if (!dateOnly(today) || today.length !== 10) throw new Error('Некорректная текущая дата.');
  const floor = today > first ? today : first;
  const occurrences: CalendarOccurrence[] = [];
  const overdue: CalendarOccurrence[] = [];
  const inMonth = (date: string) => date >= first && date < afterMonth;

  for (const item of recurring) {
    if (!item.active) continue;
    const initial = dateOnly(item.nextDate);
    if (!initial) continue;
    const pending: CalendarOccurrence = {
      id: `${item.id}:${initial}`,
      recurringId: item.id,
      name: item.name,
      category: item.category,
      amountMinor: item.amountMinor,
      date: initial,
      status: initial < today ? 'overdue' : initial === today ? 'today' : 'planned',
      isProjection: false,
    };
    if (inMonth(initial)) occurrences.push(pending);
    if (pending.status === 'overdue') overdue.push(pending);
    if (floor >= afterMonth) continue;

    let period = firstProjectionPeriod(item, initial, floor);
    let date = occurrenceAt(item, initial, period);
    while (date < afterMonth) {
      if (date >= floor) occurrences.push({...pending, id: `${item.id}:${date}`, date, status: 'planned', isProjection: true});
      period += 1;
      date = occurrenceAt(item, initial, period);
    }
  }

  const byDateAndName = (a: CalendarOccurrence, b: CalendarOccurrence) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ru');
  occurrences.sort(byDateAndName);
  overdue.sort(byDateAndName);
  const days: CalendarDay[] = [];
  for (const day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const items = occurrences.filter(item => item.date === date);
    days.push({date, occurrences: items, totalMinor: sumOccurrences(items)});
  }
  return {days, occurrences, overdue, plannedTotalMinor: sumOccurrences(occurrences)};
}

/** Format minor units directly so even large monthly totals keep every tiyn. */
export function calendarMoney(minor: string | bigint): string {
  const value = BigInt(minor);
  const absolute = value < 0n ? -value : value;
  const whole = new Intl.NumberFormat('ru-KZ', {maximumFractionDigits: 0}).format(absolute / 100n);
  const fraction = absolute % 100n;
  return `${value < 0n ? '−' : ''}${whole}${fraction ? `,${fraction.toString().padStart(2, '0')}` : ''}\u00a0₸`;
}
