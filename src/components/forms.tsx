'use client';
import {useState, type FormEvent} from 'react';
import {amountInput, categories, localToday, type GoalView, type TransactionView} from '@/lib/finance';
import {validatedSubmit, api, ErrorMessage} from './ui';
import type {AccountView} from '@/lib/accounts';
export function TransactionForm({item, copy = false, onSaved, accounts=[]}: {item?: TransactionView; copy?: boolean; onSaved: () => void; accounts?:AccountView[]}) {
  const [type, setType] = useState(item?.type || 'expense'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); const form = new FormData(e.currentTarget);
    try {await api(item && !copy ? `transactions/${item.id}` : 'transactions', {method: item && !copy ? 'PATCH' : 'POST', body: JSON.stringify({type, amount: form.get('amount'), category: form.get('category'), date: form.get('date'), note: form.get('note'), accountId:form.get('accountId')||null, ...(!item || copy ? {requestId} : {})})}); onSaved();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <form noValidate onSubmit={validatedSubmit(submit)} className="form-stack"><div className="segmented"><button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>− Расход</button><button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>+ Доход</button></div><label>Сумма, ₸<input autoFocus name="amount" inputMode="decimal" placeholder="0,00" defaultValue={item ? amountInput(item.amountMinor) : ''} required maxLength={20}/></label><div className="form-row"><label>Категория<select name="category" defaultValue={item?.category || 'Продукты'}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Дата<input name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={item?.date.slice(0,10) || localToday()} required/></label></div><label>Счёт операции<select name="accountId" defaultValue={item?.accountId && (!copy || accounts.some(account=>account.id===item.accountId&&!account.archived)) ? item.accountId : ""}><option value="">Без счёта</option>{accounts.filter(account=>!account.archived||(!copy&&account.id===item?.accountId)).map(account=><option key={account.id} value={account.id}>{account.name}{account.archived?" · архив":""}</option>)}</select></label><label>Заметка <span className="optional">необязательно</span><input name="note" placeholder="Например, продукты на неделю" maxLength={300} defaultValue={item?.note}/></label><ErrorMessage message={error}/><button className="button primary full" disabled={busy}>{busy ? 'Сохранение…' : item && !copy ? 'Сохранить изменения' : 'Добавить операцию'}</button><p className="form-footnote">Операция сохранится только в вашем аккаунте.</p></form>;
}
export function GoalForm({item, onSaved}: {item?: GoalView; onSaved: () => void}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget);
    try {await api(item ? `goals/${item.id}` : 'goals', {method: item ? 'PATCH' : 'POST', body: JSON.stringify(Object.fromEntries(f))}); onSaved();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <form className="form-stack" noValidate onSubmit={validatedSubmit(submit)}><label>Название цели<input autoFocus name="name" placeholder="Например, финансовая подушка" minLength={2} maxLength={80} defaultValue={item?.name} required/></label><label>Нужно накопить, ₸<input name="target" inputMode="decimal" defaultValue={item ? amountInput(item.targetMinor) : ''} placeholder="0,00" required/></label><label>Уже накоплено, ₸<input name="saved" inputMode="decimal" defaultValue={item ? amountInput(item.savedMinor) : '0'} required/></label><label>Желаемая дата <span className="optional">необязательно</span><input name="deadline" type="date" min="2000-01-01" max="2100-12-31" defaultValue={item?.deadline?.slice(0,10) || ''}/></label><p className="notice">Цель — ваш план накоплений. Изменение прогресса не списывает деньги и не меняет баланс операций.</p><ErrorMessage message={error}/><button className="button primary full" disabled={busy}>{busy ? 'Сохранение…' : item ? 'Обновить цель' : 'Создать цель'}</button></form>;
}
export function DeleteConfirmation({kind, id, onDeleted}: {kind: 'transactions'|'goals'; id: string; onDeleted: () => void}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="form-stack"><p>Эта запись будет удалена. Отменить удаление не получится.</p><ErrorMessage message={error}/><button className="button danger" disabled={busy} onClick={async () => {setBusy(true); try {await api(`${kind}/${id}`, {method: 'DELETE'}); onDeleted();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}}>{busy ? 'Удаление…' : 'Удалить запись'}</button></div>;
}

