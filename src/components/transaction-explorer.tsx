'use client';
import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {ChevronLeft, ChevronRight, Search, X} from 'lucide-react';
import {categories, type TransactionView} from '@/lib/finance';
import type {AccountView} from '@/lib/accounts';
import {api, Empty, ErrorMessage, validatedSubmit} from './ui';

export type OperationsFilters = {q:string;type:string;category:string;accountId:string;from:string;to:string;min:string;max:string;period:'month'|'all'};
export const emptyOperationsFilters:OperationsFilters={q:'',type:'',category:'',accountId:'',from:'',to:'',min:'',max:'',period:'month'};
export function TransactionExplorer({month,accounts,filters,onFilters,revision,renderRows}: {
  month:string;accounts:AccountView[];filters:OperationsFilters;onFilters:(value:OperationsFilters)=>void;
  revision:unknown;renderRows:(rows:TransactionView[])=>ReactNode;
}) {
  const [draft,setDraft]=useState(filters);const [page,setPage]=useState(1);
  const [data,setData]=useState<{items:TransactionView[];total:number}|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const searchRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{setDraft(filters);setPage(1);},[filters,month]);
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('');
    const query=new URLSearchParams({month,page:String(page)});
    for(const key of ['q','type','category','accountId','from','to','min','max'] as const)if(filters[key])query.set(key,filters[key]);
    if(filters.period==='all')query.set('all','1');
    api<{items:TransactionView[];total:number}>(`transactions?${query}`,{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted)return;
      const last=Math.max(1,Math.ceil(value.total/50));
      if(page>last){setPage(last);return;}
      setData(value);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[month,filters,page,revision,retry]);
  function field(key:keyof OperationsFilters,value:string){setDraft(old=>({...old,[key]:value}));}
  function apply(event:FormEvent<HTMLFormElement>){event.preventDefault();setData(null);setPage(1);onFilters({...draft,q:draft.q.trim()});}
  const filtered=Object.entries(filters).some(([key,value])=>key==='period'?value==='all':!!value);
  return <section className="panel transaction-explorer">
    <div className="section-heading"><div><h2>Поиск операций</h2><p className="muted">Доходы и расходы. Переводы между счетами — в разделе «Счета».</p></div></div>
    <form noValidate className="form-stack transaction-filters" onSubmit={validatedSubmit(apply)}>
      <label className="transaction-search">Поиск по заметке или категории<div className="search-control"><Search size={17} aria-hidden="true"/><input ref={searchRef} aria-label="Поиск операций" value={draft.q} maxLength={100} placeholder="Например, продукты или аренда" onChange={e=>field('q',e.target.value)}/>{draft.q&&<button type="button" className="icon-button" aria-label="Очистить поиск" onClick={()=>{field('q','');setData(null);setPage(1);onFilters({...filters,q:''});searchRef.current?.focus();}}><X size={17}/></button>}</div></label>
      <div className="filter-grid">
        <label>Период<select aria-label="Период поиска" value={draft.period} onChange={e=>field('period',e.target.value)}><option value="month">Выбранный месяц</option><option value="all">За всё время</option></select></label>
        <label>Тип<select aria-label="Тип операции" value={draft.type} onChange={e=>field('type',e.target.value)}><option value="">Доходы и расходы</option><option value="income">Доходы</option><option value="expense">Расходы</option></select></label>
        <label>Категория<select aria-label="Категория фильтра" value={draft.category} onChange={e=>field('category',e.target.value)}><option value="">Все категории</option>{categories.map(category=><option key={category}>{category}</option>)}</select></label>
        <label>Счёт<select aria-label="Счёт фильтра" value={draft.accountId} onChange={e=>field('accountId',e.target.value)}><option value="">Все счета</option><option value="unassigned">Без счёта</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name}{account.archived?' · архив':''}</option>)}</select></label>
        <label>Дата от<input type="date" aria-label="Дата от" min="2000-01-01" max="2100-12-31" value={draft.from} onChange={e=>field('from',e.target.value)}/></label>
        <label>Дата до<input type="date" aria-label="Дата до" min="2000-01-01" max="2100-12-31" value={draft.to} onChange={e=>field('to',e.target.value)}/></label>
        <label>Сумма от, ₸<input aria-label="Сумма от, ₸" inputMode="decimal" placeholder="0,00" maxLength={20} value={draft.min} onChange={e=>field('min',e.target.value)}/></label>
        <label>Сумма до, ₸<input aria-label="Сумма до, ₸" inputMode="decimal" placeholder="Без ограничения" maxLength={20} value={draft.max} onChange={e=>field('max',e.target.value)}/></label>
      </div>
      <div className="feature-actions"><button className="button primary" disabled={busy}>Применить фильтры</button><button type="button" className="button secondary" onClick={()=>{setDraft({...emptyOperationsFilters});setData(null);setPage(1);onFilters({...emptyOperationsFilters});}}>Сбросить фильтры</button></div>
      <p className="form-footnote">Даты сужают выбранный период. Для поиска за другие месяцы выберите «За всё время».</p>
    </form>
    <div className="search-results" aria-busy={busy}>
      <div className="section-heading"><h3>Операции {filters.period==='month'?'за месяц':'за всё время'}</h3><span className="count-label">Найдено: {data?.total??'—'}</span></div>
      <div className="search-loading" role="status">{busy?'Ищем операции…':data?`Найдено операций: ${data.total}`:''}</div>
      <ErrorMessage message={error}/>{error&&<button className="text-button" onClick={()=>setRetry(value=>value+1)}>Повторить поиск</button>}
      {data&&!error&&(data.items.length?renderRows(data.items):filtered?<Empty title="Ничего не найдено" text="Измените условия поиска или сбросьте фильтры."/>:renderRows([]))}
      {data&&data.total>50&&<div className="pagination"><button className="button secondary" disabled={page===1||busy} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={17}/> Назад</button><span>{page} / {Math.ceil(data.total/50)}</span><button className="button secondary" disabled={page*50>=data.total||busy} onClick={()=>setPage(value=>value+1)}>Далее <ChevronRight size={17}/></button></div>}
    </div>
  </section>;
}
