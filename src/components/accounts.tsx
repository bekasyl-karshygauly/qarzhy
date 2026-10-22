'use client';
import {useEffect, useState, type FormEvent} from 'react';
import {Archive, ArrowLeftRight, Banknote, ChevronLeft, ChevronRight, CreditCard, Plus, Vault} from 'lucide-react';
import {accountKindLabels, accountKinds, type AccountView, type AccountsData, type TransferView} from '@/lib/accounts';
import {amountInput, localToday, money} from '@/lib/finance';
import {AnimatedAmount} from './fintech-motion';
import {api, Empty, ErrorMessage, Modal, validatedSubmit} from './ui';

type Dialog={kind:'account';item?:AccountView;requestId:string}|{kind:'transfer';requestId:string}|{kind:'archive';item:AccountView}|{kind:'remove-transfer';item:TransferView}|null;
export function Accounts({data,onSaved,onOperations}:{data:AccountsData;onSaved:()=>Promise<void>;onOperations:()=>void}) {
  const [dialog,setDialog]=useState<Dialog>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [status,setStatus]=useState('');
  const [page,setPage]=useState(1);const [history,setHistory]=useState<{items:TransferView[];total:number}|null>(null);
  const [historyError,setHistoryError]=useState('');const [historyBusy,setHistoryBusy]=useState(false);const [retry,setRetry]=useState(0);
  const active=data.items.filter(item=>!item.archived);
  useEffect(()=>{
    const controller=new AbortController();setHistoryBusy(true);setHistoryError('');
    api<{items:TransferView[];total:number}>(`transfers?page=${page}`,{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted)return;const last=Math.max(1,Math.ceil(value.total/50));
      if(page>last){setPage(last);return;}setHistory(value);
    }).catch(e=>{if(!controller.signal.aborted)setHistoryError(e.message);}).finally(()=>{if(!controller.signal.aborted)setHistoryBusy(false);});
    return()=>controller.abort();
  },[data,page,retry]);
  function open(next:Dialog){setError('');setDialog(next);}
  async function action(path:string,method:string,body?:unknown){
    if(busy)return;setBusy(true);setError('');
    try{await api(path,{method,...(body?{body:JSON.stringify(body)}:{})});setDialog(null);setStatus('Изменения сохранены.');await onSaved();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    const values=Object.fromEntries(new FormData(event.currentTarget));
    if(dialog?.kind==='account')void action(dialog.item?`accounts/${dialog.item.id}`:'accounts',dialog.item?'PATCH':'POST',{...values,...(!dialog.item?{requestId:dialog.requestId}:{})});
    if(dialog?.kind==='transfer')void action('transfers','POST',{...values,requestId:dialog.requestId});
  }
  return <div className="accounts-stack">
    <section className="panel account-summary" aria-label="Остатки по счетам">
      <div><p className="eyebrow">ВАШИ ДЕНЬГИ · KZT</p><h2>Общий остаток</h2><strong className="accounts-total"><AnimatedAmount value={data.totalBalanceMinor}/></strong><p className="muted">Все счета, включая архивные, и операции без счёта. Начальные остатки учтены отдельно от доходов.</p></div>
      <div className="feature-actions"><button className="button primary" onClick={()=>open({kind:'account',requestId:crypto.randomUUID()})}><Plus size={17}/> Добавить счёт</button><button className="button secondary" disabled={active.length<2} onClick={()=>open({kind:'transfer',requestId:crypto.randomUUID()})}><ArrowLeftRight size={17}/> Перевод между счетами</button>{active.length<2&&<p className="form-footnote">Для перевода нужны два активных счёта.</p>}</div>
    </section>
    <p className="success" role="status">{status}</p>
    {!data.items.length&&<section className="panel"><Empty title="Разделите деньги по счетам" text="Добавьте наличные, карту или вклад. Старые операции сохранятся без привязки к счёту."/></section>}
    <div className="accounts-grid">{data.items.map(item=>{
      const Icon=item.kind==='cash'?Banknote:item.kind==='card'?CreditCard:Vault;
      return <article key={item.id} className={`panel account-card ${item.archived?'account-archived':''}`} data-reveal="up">
        <div className="section-heading"><span className="account-kind"><Icon size={19}/>{accountKindLabels[item.kind]}</span>{item.archived&&<span className="account-badge"><Archive size={13}/> Архив</span>}</div>
        <h3>{item.name}</h3><strong className="account-balance"><AnimatedAmount value={item.balanceMinor}/></strong><p className="muted">Начальный остаток {money(item.openingMinor)}</p>
        <div className="feature-actions"><button className="text-button" aria-label={`Изменить счёт ${item.name}`} onClick={()=>open({kind:'account',item,requestId:crypto.randomUUID()})}>Изменить</button><button className="text-button" aria-label={`${item.archived?'Восстановить':'Архивировать'} счёт ${item.name}`} onClick={()=>open({kind:'archive',item})}>{item.archived?'Восстановить':'В архив'}</button></div>
      </article>;
    })}
      <article className="panel account-card account-unassigned"><span className="account-kind">Операции без привязки</span><h3>Без счёта</h3><strong className="account-balance"><AnimatedAmount value={data.unassignedBalanceMinor}/></strong><p className="muted">Старые записи, быстрые расходы, CSV и расписания остаются здесь, пока вы не выберете им счёт.</p><button className="text-button" onClick={onOperations}>Посмотреть операции</button></article>
    </div>
    <section className="panel transfer-history" aria-busy={historyBusy}>
      <div className="section-heading"><div><h2>Переводы между счетами</h2><p className="muted">Ручные записи перемещений. Они не увеличивают доходы и расходы.</p></div><span className="count-label">Всего: {history?.total??'—'}</span></div>
      <div role="status" className="search-loading">{historyBusy?'Загружаем переводы…':''}</div><ErrorMessage message={historyError}/>{historyError&&<button className="text-button" onClick={()=>setRetry(value=>value+1)}>Повторить загрузку переводов</button>}
      {history&&!historyError&&(!history.items.length?<Empty title="Пока без переводов" text="Запишите перемещение между своими счетами — общий остаток останется прежним."/>:<ul className="transfer-list">{history.items.map(item=><li key={item.id}><ArrowLeftRight size={18} aria-hidden="true"/><div><strong>{item.fromAccountName} → {item.toAccountName}</strong><span className="muted">{new Date(item.date).toLocaleDateString('ru-KZ',{timeZone:'UTC'})}{item.note?` · ${item.note}`:''}</span></div><strong>{money(item.amountMinor)}</strong><button className="text-button danger-text" aria-label={`Удалить перевод ${item.note||`${item.fromAccountName} → ${item.toAccountName}`}`} onClick={()=>open({kind:'remove-transfer',item})}>Удалить</button></li>)}</ul>)}
      {history&&history.total>50&&<div className="pagination"><button className="button secondary" disabled={page===1||historyBusy} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={17}/> Назад</button><span>{page} / {Math.ceil(history.total/50)}</span><button className="button secondary" disabled={page*50>=history.total||historyBusy} onClick={()=>setPage(value=>value+1)}>Далее <ChevronRight size={17}/></button></div>}
    </section>
    {dialog&&<Modal title={dialog.kind==='account'?dialog.item?'Изменить счёт':'Новый счёт':dialog.kind==='transfer'?'Перевод между счетами':dialog.kind==='archive'?dialog.item.archived?'Восстановить счёт?':'Архивировать счёт?':'Удалить перевод?'} onClose={()=>{if(!busy)setDialog(null);}}>
      {dialog.kind==='account'?<form className="form-stack" noValidate onSubmit={validatedSubmit(submit)}>
        <label>Название счёта<input name="name" minLength={2} maxLength={60} required autoFocus placeholder="Например, наличные" defaultValue={dialog.item?.name}/></label>
        <label>Тип счёта<select name="kind" defaultValue={dialog.item?.kind||'cash'}>{accountKinds.map(kind=><option key={kind} value={kind}>{accountKindLabels[kind]}</option>)}</select></label>
        <label>Начальный остаток, ₸<input name="opening" inputMode="decimal" maxLength={20} required defaultValue={dialog.item?amountInput(dialog.item.openingMinor):'0'}/></label>
        <p className="notice">{dialog.item?'Изменение начального остатка пересчитает баланс счёта, но не создаст доход или расход.':'Укажите деньги, которые уже есть на счёте до начала учёта. Это не доход.'}</p>
        <ErrorMessage message={error}/><button className="button primary full" disabled={busy}>{busy?'Сохранение…':dialog.item?'Сохранить счёт':'Создать счёт'}</button>
      </form>:dialog.kind==='transfer'?<form className="form-stack" noValidate onSubmit={validatedSubmit(submit)}>
        <label>Со счёта<select name="fromAccountId" required defaultValue={active[0]?.id}>{active.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>На счёт<select name="toAccountId" required defaultValue={active[1]?.id}>{active.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Сумма перевода, ₸<input name="amount" inputMode="decimal" autoFocus maxLength={20} required placeholder="0,00"/></label>
        <label>Дата перевода<input type="date" name="date" min="2000-01-01" max="2100-12-31" defaultValue={localToday()} required/></label>
        <label>Заметка к переводу <span className="optional">необязательно</span><input name="note" maxLength={300}/></label>
        <p className="notice">Это запись перемещения денег между вашими счетами. Банковский перевод не выполняется.</p><ErrorMessage message={error}/><button className="button primary full" disabled={busy}>{busy?'Сохранение…':'Записать перевод'}</button>
      </form>:<div className="form-stack">
        <p>{dialog.kind==='archive'?dialog.item.archived?`Счёт «${dialog.item.name}» снова станет доступен для новых операций.`:`Счёт «${dialog.item.name}» скроется из выбора для новых операций. Остаток и история сохранятся и останутся в общем итоге.`:`Перевод ${money(dialog.item.amountMinor)} из «${dialog.item.fromAccountName}» в «${dialog.item.toAccountName}» будет удалён. Остатки обоих счетов пересчитаются, общий остаток не изменится.`}</p>
        <ErrorMessage message={error}/><button className={`button ${dialog.kind==='remove-transfer'?'danger':'primary'}`} disabled={busy} onClick={()=>dialog.kind==='archive'?void action(`accounts/${dialog.item.id}`,'PATCH',{archived:!dialog.item.archived}):void action(`transfers/${dialog.item.id}`,'DELETE')}>{busy?'Сохранение…':dialog.kind==='archive'?dialog.item.archived?'Восстановить счёт':'Архивировать счёт':'Удалить перевод'}</button>
      </div>}
    </Modal>}
  </div>;
}
