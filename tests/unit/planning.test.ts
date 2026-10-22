import {describe,it,expect} from 'vitest';
import {nextOccurrence,previousMonth,compareMonths} from '../../src/lib/planning';
import {parseCsv,mapCsv} from '../../src/lib/csv';
import {summarize} from '../../src/lib/finance';
describe('payment calendar',()=>{
 it('retains day 31 after a short month',()=>{expect(nextOccurrence('2026-01-31','monthly',31)).toBe('2026-02-28');expect(nextOccurrence('2026-02-28','monthly',31)).toBe('2026-03-31');});
 it('handles leap years, weekly year rollover and previous year',()=>{expect(nextOccurrence('2024-02-29','yearly',29)).toBe('2025-02-28');expect(nextOccurrence('2026-12-28','weekly',28)).toBe('2027-01-04');expect(previousMonth('2026-01')).toBe('2025-12');});
});
describe('CSV import',()=>{
 const mapping={date:'date',amount:'amount',type:'type',category:'category',note:'note'};
 it('handles BOM, CRLF, quoted delimiters, escaped quotes and decimal comma',()=>{const table=parseCsv('\uFEFFdate;amount;type;category;note\r\n19.10.2026;1234,56;расход;Продукты;"Магазин; ""рядом"""');const result=mapCsv(table,mapping);expect(result.errors).toEqual([]);expect(result.rows[0]).toMatchObject({date:'2026-10-19',amount:'1234,56',type:'expense',note:'Магазин; "рядом"'});});
 it('infers signed amounts only when type is absent',()=>{const result=mapCsv(parseCsv('date,amount\n2026-10-19,-25.50\n2026-10-20,+100'),{...mapping,type:''});expect(result.rows.map(r=>r.type)).toEqual(['expense','income']);});
 it('rejects invalid dates, precision, types, categories and malformed structures',()=>{const r=mapCsv(parseCsv('date;amount;type;category\n2026-02-30;25;expense;Дом\n2026-10-19;0.001;expense;Дом\n2026-10-19;20;transfer;Дом\n2026-10-19;20;expense;unknown'),mapping);expect(r.errors).toHaveLength(4);expect(r.rows).toHaveLength(0);expect(()=>parseCsv('date,date\na,b')).toThrow();expect(()=>parseCsv('date,amount\na,"b')).toThrow();});
 it('limits upload size',()=>expect(()=>parseCsv('x'.repeat(500001))).toThrow());
});
it('compares savings and categories without floating point rounding',()=>{
 const make=(amount:bigint,category:string,month:string)=>({...summarize([{type:'expense',amountMinor:amount,category,date:new Date(month+'-01')}],month),balance:'0'});
 const comparison=compareMonths(make(1051n,'Дом','2026-10'),make(1000n,'Дом','2026-09'));
 expect(comparison.currentSaved).toBe('-1051');expect(comparison.categories[0].change).toBe('51');
});

