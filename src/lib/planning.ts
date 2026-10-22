import {monthBounds, type Summary} from './finance';
export type BudgetView = {id:string; month:string; category:string; limitMinor:string; spent:string};
export type RecurringView = {id:string; name:string; category:string; amountMinor:string; frequency:'weekly'|'monthly'|'yearly'; nextDate:string; anchorDay?:number; active:boolean};
export type PlanningData = {budgets:BudgetView[]; recurring:RecurringView[]; favorites:string[]};
export function nextOccurrence(date:string, frequency:string, anchorDay:number):string {
  const d = new Date(`${date.slice(0,10)}T00:00:00Z`);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate()+7);
  else {
    const month = d.getUTCMonth() + (frequency === 'yearly' ? 12 : 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(month); d.setUTCDate(Math.min(anchorDay,last));
  }
  return d.toISOString().slice(0,10);
}
export function previousMonth(month:string) {
  const {start} = monthBounds(month); start.setUTCMonth(start.getUTCMonth()-1);
  return start.toISOString().slice(0,7);
}
export function compareMonths(current:Summary, previous:Summary) {
  const saved = (s:Summary) => BigInt(s.income)-BigInt(s.expense);
  const names = new Set([...current.byCategory,...previous.byCategory].map(x=>x.name));
  return {currentSaved:saved(current).toString(), previousSaved:saved(previous).toString(),
    categories:[...names].map(name=>{const now=current.byCategory.find(x=>x.name===name)?.value || '0'; const before=previous.byCategory.find(x=>x.name===name)?.value || '0'; return {name,now,before,change:(BigInt(now)-BigInt(before)).toString()};}).sort((a,b)=>Number(BigInt(b.change)-BigInt(a.change)))};
}
