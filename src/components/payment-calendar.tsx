'use client';

import {useId, useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {localToday} from '@/lib/finance';
import type {PlanningData} from '@/lib/planning';
import {calendarMoney, projectPaymentCalendar, type CalendarOccurrence} from '@/lib/payment-calendar';
import {Empty} from './ui';

type Props = {data: PlanningData; month: string; onPlanning: () => void};
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const dateLabel = (date: string) => new Intl.DateTimeFormat('ru-KZ', {day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC'}).format(new Date(`${date}T00:00:00Z`));
const monthLabel = (month: string) => new Intl.DateTimeFormat('ru-KZ', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
const statusLabel = (item: CalendarOccurrence) => item.status === 'overdue' ? 'Просрочен' : item.status === 'today' ? 'Сегодня · ожидает записи' : item.isProjection ? 'План · расчётная дата' : 'План';

function PaymentList({items, showDate = false}: {items: CalendarOccurrence[]; showDate?: boolean}) {
  return <ul className="payment-calendar-list">{items.map(item => <li key={item.id}>
    <div className="payment-calendar-item-copy"><strong>{item.name}</strong><span className="muted">{item.category}{showDate && <> · <time dateTime={item.date}>{new Intl.DateTimeFormat('ru-KZ', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${item.date}T00:00:00Z`))}</time></>}</span><span className={`payment-calendar-status${item.status === 'overdue' ? ' danger-text' : ''}`}>{statusLabel(item)}</span></div>
    <strong className="payment-calendar-item-amount">{calendarMoney(item.amountMinor)}</strong>
  </li>)}</ul>;
}

export function PaymentCalendar({data, month, onPlanning}: Props) {
  const today = localToday();
  const calendar = projectPaymentCalendar(data.recurring, month, today);
  const [selection, setSelection] = useState<{month: string; date: string} | null>(null);
  const defaultDate = today.startsWith(month) ? today : calendar.occurrences[0]?.date ?? `${month}-01`;
  const selectedDate = selection?.month === month ? selection.date : defaultDate;
  const selected = calendar.days.find(day => day.date === selectedDate)!;
  const leadingDays = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const trailingDays = (7 - (leadingDays + calendar.days.length) % 7) % 7;
  const outsideOverdue = calendar.overdue.filter(item => !item.date.startsWith(month));
  const activeCount = data.recurring.filter(item => item.active).length;
  const id = useId();

  return <div className="payment-calendar-stack">
    <section className="panel payment-calendar" data-reveal aria-labelledby={`${id}-heading`}>
      <div className="section-heading payment-calendar-heading"><div><h2 id={`${id}-heading`}><CalendarDays size={18} aria-hidden="true"/>Платежи по дням</h2><p className="muted">Расписание платежей. Расход появляется в учёте после подтверждения в плане.</p></div><button type="button" className="button secondary" onClick={onPlanning}>Открыть план</button></div>
      <div className="payment-calendar-summary"><div><p className="payment-calendar-month">{monthLabel(month)}</p><span className="muted">План за месяц · платежей: {calendar.occurrences.length}</span></div><strong>{calendarMoney(calendar.plannedTotalMinor)}</strong></div>
      <p className="payment-calendar-explanation muted" id={`${id}-help`}>Будущие повторы — расчётный план. Просроченные даты остаются ожидающими записи.</p>
      <div className="payment-calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
      <div className="payment-calendar-grid" role="group" aria-label={`Календарь платежей: ${monthLabel(month)}`} aria-describedby={`${id}-help`}>
        {Array.from({length: leadingDays}, (_, index) => <span key={`before-${index}`} className="payment-calendar-blank" aria-hidden="true"/>)}
        {calendar.days.map(day => {
          const overdueCount = day.occurrences.filter(item => item.status === 'overdue').length;
          const isToday = day.date === today;
          return <button type="button" key={day.date} className={`payment-calendar-day${day.occurrences.length ? ' has-payments' : ''}${overdueCount ? ' has-overdue' : ''}`} onClick={() => setSelection({month, date: day.date})} aria-pressed={selectedDate === day.date} aria-current={isToday ? 'date' : undefined} aria-controls={`${id}-payments`} aria-label={`${dateLabel(day.date)}${isToday ? ', сегодня' : ''}. ${day.occurrences.length ? `Платежей: ${day.occurrences.length}, сумма ${calendarMoney(day.totalMinor)}${overdueCount ? `, просрочено: ${overdueCount}` : ''}` : 'Нет платежей'}`}>
            <span className="payment-calendar-day-number">{Number(day.date.slice(8))}</span>
            <span className="payment-calendar-day-count" aria-hidden="true">{day.occurrences.length > 0 && <><i/>{day.occurrences.length}</>}</span>
          </button>;
        })}
        {Array.from({length: trailingDays}, (_, index) => <span key={`after-${index}`} className="payment-calendar-blank" aria-hidden="true"/>)}
      </div>
      <div className="payment-calendar-key"><span><i/>План</span><span><i className="overdue"/>Просрочен</span><span>Выберите день, чтобы увидеть платежи</span></div>
      <div className="payment-calendar-selected" id={`${id}-payments`}>
        <div className="payment-calendar-selected-heading" aria-live="polite" aria-atomic="true"><h3>{dateLabel(selectedDate)}</h3><span className="muted">{selected.occurrences.length ? `Платежей: ${selected.occurrences.length} · ${calendarMoney(selected.totalMinor)}` : 'Платежей нет'}</span></div>
        {selected.occurrences.length ? <PaymentList items={selected.occurrences}/> : <p className="payment-calendar-empty-day muted">На этот день платежи не запланированы.</p>}
      </div>
      {!activeCount && <Empty title="Добавьте расписание платежа" text={data.recurring.length ? 'Все расписания на паузе. Откройте план, чтобы включить нужное.' : 'Аренда, подписки и другие регулярные расходы появятся в календаре после добавления в план.'}><button type="button" className="button primary" onClick={onPlanning}>Открыть план</button></Empty>}
      {activeCount > 0 && !calendar.occurrences.length && <p className="payment-calendar-month-empty muted">В выбранном месяце нет ожидающих платежей. Прошедшие повторы не восстанавливаются автоматически.</p>}
    </section>
    {outsideOverdue.length > 0 && <section className="panel payment-calendar-overdue" data-reveal aria-labelledby={`${id}-overdue-heading`}><div className="section-heading payment-calendar-heading"><div><h2 id={`${id}-overdue-heading`}>Просрочены вне выбранного месяца</h2><p className="muted">Ожидают записи: {outsideOverdue.length}. Эти суммы не входят в план выбранного месяца.</p></div><button type="button" className="button secondary" onClick={onPlanning}>Открыть план</button></div><PaymentList items={outsideOverdue} showDate/></section>}
  </div>;
}
