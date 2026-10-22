import {describe, expect, it} from 'vitest';
import {calendarMoney, projectPaymentCalendar} from '../../src/lib/payment-calendar';
import type {RecurringView} from '../../src/lib/planning';

const recurring = (overrides: Partial<RecurringView & {anchorDay?: number}> = {}): RecurringView & {anchorDay?: number} => ({
  id: 'rent', name: 'Аренда', category: 'Дом', amountMinor: '12500000', frequency: 'monthly', nextDate: '2026-01-31', active: true, anchorDay: 31, ...overrides,
});

describe('read-only payment calendar projection', () => {
  it('retains day 31 through February and March, including an already clamped stored date', () => {
    const item = recurring();
    expect(projectPaymentCalendar([item], '2026-01', '2026-01-01').occurrences.map(x => x.date)).toEqual(['2026-01-31']);
    expect(projectPaymentCalendar([item], '2026-02', '2026-01-01').occurrences.map(x => x.date)).toEqual(['2026-02-28']);
    expect(projectPaymentCalendar([item], '2026-03', '2026-01-01').occurrences.map(x => x.date)).toEqual(['2026-03-31']);
    expect(projectPaymentCalendar([recurring({nextDate: '2026-02-28'})], '2026-03', '2026-02-01').occurrences.map(x => x.date)).toEqual(['2026-03-31']);
  });

  it('projects February 29 in leap years and restores the annual leap-day anchor', () => {
    expect(projectPaymentCalendar([recurring({nextDate: '2024-01-31'})], '2024-02', '2024-01-01').occurrences[0].date).toBe('2024-02-29');
    const annual = recurring({frequency: 'yearly', nextDate: '2025-02-28', anchorDay: 29});
    expect(projectPaymentCalendar([annual], '2026-02', '2025-01-01').occurrences[0].date).toBe('2026-02-28');
    expect(projectPaymentCalendar([annual], '2028-02', '2025-01-01').occurrences[0].date).toBe('2028-02-29');
  });

  it('keeps weekly dates within month bounds across a year rollover', () => {
    const item = recurring({frequency: 'weekly', nextDate: '2026-12-28'});
    const result = projectPaymentCalendar([item], '2027-01', '2026-12-01');
    expect(result.occurrences.map(x => x.date)).toEqual(['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
    expect(result.days).toHaveLength(31);
    expect(projectPaymentCalendar([recurring({frequency: 'weekly', nextDate: '2026-12-31'})], '2026-12', '2026-12-01').occurrences.map(x => x.date)).toEqual(['2026-12-31']);
  });

  it('keeps the actual overdue occurrence and labels future repeats as estimates', () => {
    const item = recurring({nextDate: '2026-01-31T00:00:00.000Z'});
    const snapshot = JSON.stringify(item);
    const result = projectPaymentCalendar([item], '2026-03', '2026-03-15');
    expect(result.overdue).toEqual([expect.objectContaining({date: '2026-01-31', status: 'overdue', isProjection: false})]);
    expect(result.occurrences).toEqual([expect.objectContaining({date: '2026-03-31', status: 'planned', isProjection: true})]);
    expect(JSON.stringify(item)).toBe(snapshot);
  });

  it('does not infer missed past payments or treat a past month as paid', () => {
    const item = recurring({frequency: 'weekly', nextDate: '2026-01-02'});
    const january = projectPaymentCalendar([item], '2026-01', '2026-03-15');
    expect(january.occurrences).toEqual([expect.objectContaining({date: '2026-01-02', status: 'overdue', isProjection: false})]);
    expect(january.plannedTotalMinor).toBe(item.amountMinor);
    expect(projectPaymentCalendar([item], '2026-02', '2026-03-15').occurrences).toEqual([]);
    expect(projectPaymentCalendar([item], '2026-03', '2026-03-15').occurrences.map(x => x.date)).toEqual(['2026-03-20', '2026-03-27']);
  });

  it('includes a due-today stored occurrence once and excludes inactive schedules', () => {
    const result = projectPaymentCalendar([recurring({nextDate: '2026-03-15', anchorDay: 15}), recurring({id: 'paused', active: false, nextDate: '2026-01-01'})], '2026-03', '2026-03-15');
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({date: '2026-03-15', status: 'today', isProjection: false});
    expect(result.overdue).toEqual([]);
  });

  it('falls back to the stored day when an old response has no anchor', () => {
    expect(projectPaymentCalendar([recurring({nextDate: '2026-02-28', anchorDay: undefined})], '2026-03', '2026-02-01').occurrences[0].date).toBe('2026-03-28');
  });

  it('sums minor units precisely for each day and month without Number coercion', () => {
    const result = projectPaymentCalendar([
      recurring({amountMinor: '9007199254740993', nextDate: '2026-03-01', anchorDay: 1}),
      recurring({id: 'insurance', amountMinor: '11', nextDate: '2026-03-01', anchorDay: 1}),
      recurring({id: 'subscription', amountMinor: '7', nextDate: '2026-03-02', anchorDay: 2}),
    ], '2026-03', '2026-03-01');
    expect(result.days[0].totalMinor).toBe('9007199254741004');
    expect(result.plannedTotalMinor).toBe('9007199254741011');
    expect(calendarMoney(result.plannedTotalMinor).replace(/\s/g, '')).toBe('90071992547410,11₸');
  });

  it('skips directly to a distant month and includes no dates before a future start', () => {
    expect(projectPaymentCalendar([recurring({frequency: 'weekly', nextDate: '2000-01-03'})], '2100-12', '2100-12-01').occurrences.map(x => x.date)).toEqual(['2100-12-06', '2100-12-13', '2100-12-20', '2100-12-27']);
    expect(projectPaymentCalendar([recurring({nextDate: '2026-04-30'})], '2026-03', '2026-03-01').occurrences).toEqual([]);
  });
});
