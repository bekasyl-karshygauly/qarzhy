import {z} from 'zod';
import {categories, monthBounds, toMinor} from './finance';
import {accountKinds} from './accounts';
const amount = z.string().max(20).transform((value, ctx) => {
  try { return toMinor(value); } catch {ctx.addIssue({code: 'custom', message: 'Некорректная сумма (максимум 2 знака после запятой).'}); return z.NEVER;}
});
const positive = amount.refine(v => v > 0n, 'Сумма должна быть больше нуля.');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => v >= '2000-01-01' && v <= '2100-12-31' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Укажите существующую дату.');
export const credentialsSchema = z.object({email: z.email().max(254).transform(v => v.trim().toLowerCase()), password: z.string().min(12, 'Не менее 12 символов.').max(128)}).strict();
export const registerSchema = credentialsSchema.extend({name: z.string().trim().min(2).max(60), consent: z.literal(true, {error: 'Необходимо согласие на обработку данных.'})});
const accountIdSchema = z.string().min(1).max(191);
export const transactionSchema = z.object({type: z.enum(['income','expense']), amount: positive, category: z.enum(categories), note: z.string().trim().max(300).default(''), date: dateSchema, requestId: z.uuid(), accountId: accountIdSchema.nullable().optional()}).strict();
export const transactionEditSchema = transactionSchema.omit({requestId: true});
// Import remains deliberately unassigned; it cannot smuggle wallet references.
export const importTransactionSchema = transactionEditSchema.omit({accountId: true});
export const accountSchema = z.object({name: z.string().trim().min(2).max(60), kind: z.enum(accountKinds), opening: amount, requestId: z.uuid().optional()}).strict();
export const accountEditSchema = accountSchema.omit({requestId: true}).partial().extend({archived: z.boolean().optional()}).strict().refine(value => Object.keys(value).length > 0, 'Укажите изменения счёта.');
export const transferSchema = z.object({fromAccountId: accountIdSchema, toAccountId: accountIdSchema, amount: positive, date: dateSchema, note: z.string().trim().max(300).default(''), requestId: z.uuid()}).strict().refine(value => value.fromAccountId !== value.toAccountId, 'Выберите два разных счёта.');
const monthSchema = z.string().refine(value => {try {monthBounds(value); return true;} catch {return false;}}, 'Некорректный месяц.');
export const transactionFiltersSchema = z.object({
  month: monthSchema.optional(),
  page: z.string().regex(/^\d+$/).transform(Number).refine(value => Number.isInteger(value) && value >= 1 && value <= 10000, 'Некорректная страница.').default(1),
  q: z.string().max(100).trim().optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.enum(categories).optional(),
  accountId: accountIdSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  min: amount.optional(),
  max: amount.optional(),
  all: z.literal('1').optional(),
}).strict().superRefine((value, ctx) => {
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) ctx.addIssue({code: 'custom', message: 'Минимальная сумма больше максимальной.'});
  if (value.from && value.to && value.from > value.to) ctx.addIssue({code: 'custom', message: 'Начало периода позже окончания.'});
});
export function parseTransactionFilters(params: URLSearchParams, defaultMonth: string) {
  const raw: Record<string, string> = Object.create(null);
  for (const [key, value] of params.entries()) {
    if (Object.hasOwn(raw, key)) throw new z.ZodError([{code: 'custom', path: [key], message: 'Параметр фильтра повторяется.'}]);
    raw[key] = value;
  }
  const filters = transactionFiltersSchema.parse(raw);
  return filters.all ? filters : {...filters, month: filters.month ?? monthSchema.parse(defaultMonth)};
}
export const goalSchema = z.object({name: z.string().trim().min(2).max(80), target: positive, saved: amount, deadline: z.union([dateSchema, z.literal('')]).default('')}).strict().refine(v => v.saved <= v.target, 'Накопления не должны превышать цель.');
export const settingsSchema = z.object({aiConsent: z.boolean(), voiceConsent: z.boolean()}).strict();
export const assistantSchema = z.object({message: z.string().trim().min(3).max(2000), month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)}).strict();
