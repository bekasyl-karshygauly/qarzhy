import {describe, expect, it} from 'vitest';
import {amountInput, monthBounds, summarize, toMinor} from '../../src/lib/finance';
import {dateSchema, goalSchema, registerSchema, transactionSchema} from '../../src/lib/validation';
describe('money is exact', () => {
  it('parses fractional tenge without floating point rounding', () => {expect(toMinor('0,29')).toBe(29n); expect(toMinor('12 345.67')).toBe(1234567n); expect(toMinor('9999999999.99')).toBe(999999999999n); expect(amountInput('10001')).toBe('100.01');});
  it.each(['-5','NaN','Infinity','1e5','0.001','10000000000','', '1,2,3'])('rejects unsafe amount %s', value => expect(() => toMinor(value)).toThrow());
  it('preserves leap years and month boundaries', () => {expect(monthBounds('2024-02').end.toISOString()).toBe('2024-03-01T00:00:00.000Z'); expect(dateSchema.safeParse('2025-02-29').success).toBe(false); expect(dateSchema.safeParse('2024-02-29').success).toBe(true); expect(() => monthBounds('2026-13')).toThrow();});
  it('calculates totals and excludes other months', () => {const result = summarize([{type:'income',amountMinor:10000n,category:'Зарплата',date:new Date('2026-10-01')},{type:'expense',amountMinor:29n,category:'Продукты',date:new Date('2026-10-02')},{type:'expense',amountMinor:71n,category:'Продукты',date:new Date('2026-10-02')},{type:'expense',amountMinor:100000n,category:'Дом',date:new Date('2026-11-01')}], '2026-10'); expect(result.income).toBe('10000'); expect(result.expense).toBe('100'); expect(result.count).toBe(3); expect(result.byCategory).toEqual([{name:'Продукты',value:'100'}]); expect(result.daily).toHaveLength(31); expect(result.daily[1].expense).toBe(1);});
});
describe('validation boundaries', () => {
  const transaction = {type:'expense',amount:'20.50',category:'Продукты',date:'2026-10-01',requestId:crypto.randomUUID()};
  it('never accepts a client supplied owner', () => expect(transactionSchema.safeParse({...transaction,userId:'someone-else'}).success).toBe(false));
  it('rejects zero transactions, missing consent and invalid categories', () => {expect(transactionSchema.safeParse({...transaction,amount:'0'}).success).toBe(false); expect(transactionSchema.safeParse({...transaction,category:'invalid'}).success).toBe(false); expect(registerSchema.safeParse({name:'Test',email:'test@example.kz',password:'longpassword123',consent:false}).success).toBe(false);});
  it('rejects goals with savings beyond their target', () => {expect(goalSchema.safeParse({name:'Trip',target:'100',saved:'101'}).success).toBe(false);});
});
