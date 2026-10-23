'use client';
import {useCallback, useEffect, useState} from 'react';
import {MotionConfig} from 'motion/react';
import {MotionPreferenceControl,useAppReducedMotion} from './motion-preferences';
import {AnimatedAmount, MotionSurface, MotionStatus} from './fintech-motion';
import {ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, CreditCard, ChevronRight, CircleHelp, LayoutDashboard, LogOut, Menu, Pencil, Plus, Settings2, ShieldCheck, Sparkles, Target, Trash2, Wallet, X} from 'lucide-react';
import {localToday, money, type GoalView, type Summary, type TransactionView} from '@/lib/finance';
import {Auth} from './auth';
import {Brand, BrandMark} from './brand';
import {api, Empty, ErrorMessage, Modal} from './ui';
import {DeleteConfirmation, GoalForm, TransactionForm} from './forms';
import {Cashflow, CategoryBreakdown} from './charts';
import {Assistant, type Profile} from './assistant';
import {Settings} from './settings';
import {Overview} from './overview';
import {Planning, PlanningAlerts, QuickExpense, Comparison} from './planning';
import {CsvImport} from './csv-import';
import {InstallApp} from './install-app';
import type {PlanningData} from '@/lib/planning';
import type {AccountsData} from '@/lib/accounts';
import {Accounts} from './accounts';
import {PaymentCalendar} from './payment-calendar';
import {TransactionExplorer,emptyOperationsFilters,type OperationsFilters} from './transaction-explorer';
type Section = 'overview'|'transactions'|'analytics'|'goals'|'assistant'|'settings'|'planning'|'import'|'accounts'|'calendar';
const navigation = [{id:'overview', label:'Обзор', icon: LayoutDashboard}, {id:'transactions',label:'Операции',icon:Wallet}, {id:'accounts',label:'Счета',icon:CreditCard}, {id:'calendar',label:'Календарь',icon:CalendarDays}, {id:'analytics',label:'Аналитика',icon:BarChart3}, {id:'goals',label:'Мои цели',icon:Target}, {id:'planning',label:'Бюджет и платежи',icon:Wallet}, {id:'import',label:'Импорт CSV',icon:Plus}, {id:'assistant',label:'ИИ-помощник',icon:Sparkles}] as const;
type Dialog = {kind:'transaction'; copy?:boolean; item?:TransactionView}|{kind:'goal';item?:GoalView}|{kind:'delete';resource:'transactions'|'goals';id:string}|null;
export function App({registrationEnabled}: {registrationEnabled: boolean}) {
  const reducedMotion=useAppReducedMotion();
  const [profile, setProfile] = useState<Profile|null>(null); const [initial, setInitial] = useState(true); const [bootError, setBootError] = useState('');
  const [section, setSection] = useState<Section>('overview'); const [month, setMonth] = useState(localToday().slice(0,7));
  const [summary, setSummary] = useState<Summary|null>(null); const [transactions, setTransactions] = useState<TransactionView[]>([]); const [goals, setGoals] = useState<GoalView[]>([]);
  const [planning,setPlanning] = useState<PlanningData>({budgets:[],recurring:[],favorites:[]});
  const [accounts,setAccounts]=useState<AccountsData>({items:[],unassignedBalanceMinor:'0',totalBalanceMinor:'0'});
  const [filters,setFilters]=useState<OperationsFilters>({...emptyOperationsFilters});
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null); const [menu, setMenu] = useState(false);
  const loadProfile = useCallback(async () => {try {const response = await fetch('/api/me', {cache:'no-store'}); if (response.status === 401) {setProfile(null); return;} const value = await response.json(); if (!response.ok) throw new Error(value.error); setProfile(value); setBootError('');} catch(e) {setBootError((e as Error).message);} finally {setInitial(false);}}, []);
  useEffect(() => {void loadProfile();}, [loadProfile]);
  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!profile) return;
    setLoading(true); setError('');
    try {const [s,t,g,p,a] = await Promise.all([api<Summary>(`summary?month=${month}`, {signal}), api<{items:TransactionView[];total:number}>(`transactions?month=${month}&page=1`, {signal}), api<GoalView[]>('goals', {signal}), api<PlanningData>(`planning?month=${month}`, {signal}), api<AccountsData>("accounts",{signal})]); if (!signal?.aborted) {setSummary(s); setTransactions(t.items); setGoals(g); setPlanning(p); setAccounts(a);}}
    catch(e) {if (!signal?.aborted) setError((e as Error).message);} finally {if (!signal?.aborted) setLoading(false);}
  }, [profile, month]);
  useEffect(() => {const controller = new AbortController(); void loadData(controller.signal); return () => controller.abort();}, [loadData]);
  function navigate(next: Section) {setSection(next); setMenu(false); setStatus(''); if (window.scrollY > 80) window.scrollTo({top:0, behavior:(reducedMotion || window.matchMedia('(max-width: 700px)').matches) ? 'instant' : 'smooth'});}
  async function saved() {setDialog(null); setStatus('Изменения сохранены.'); await loadData();}
  async function signOut() {try {await api('auth/logout', {method:'POST'}); setProfile(null); setSummary(null); setTransactions([]); setGoals([]); setPlanning({budgets:[],recurring:[],favorites:[]}); setAccounts({items:[],unassignedBalanceMinor:'0',totalBalanceMinor:'0'});setFilters({...emptyOperationsFilters});setSection('overview');} catch(e) {setError((e as Error).message);}}
  if (initial) return <div className="boot"><BrandMark/><p>Открываем ваше пространство…</p></div>;
  if (bootError) return <div className="boot"><h1>Не удалось подключиться</h1><ErrorMessage message={bootError}/><button className="button primary" onClick={loadProfile}>Попробовать снова</button></div>;
  if (!profile) return <Auth registrationEnabled={registrationEnabled} onSuccess={() => {setSection('overview'); void loadProfile();}}/>;
  const title = section === 'settings' ? 'Настройки' : navigation.find(n => n.id === section)!.label;
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-KZ',{month:'long',year:'numeric'});
  return <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}><div className="app-shell"><a className="skip-link" href="#main">Перейти к содержимому</a>{menu && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMenu(false)}/>}<aside className={`sidebar ${menu ? 'open' : ''}`}><Brand/><button className="mobile-close icon-button" aria-label="Закрыть меню" onClick={() => setMenu(false)}><X/></button><p className="sidebar-caption">ВАШЕ ПРОСТРАНСТВО</p><nav aria-label="Основная навигация">{navigation.map(n => <button key={n.id} className={section === n.id ? 'active' : ''} aria-current={section === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}><n.icon size={20}/>{n.label}{n.id === 'assistant' && <span className="ai-label">AI</span>}</button>)}</nav><div className="sidebar-note"><span className="leaf-mark">↗</span><strong>Маленькие шаги.<br/>Большие возможности.</strong><p>Каждая записанная операция — больше ясности в ваших планах.</p></div><div className="sidebar-bottom"><button className={section === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings2 size={19}/> Настройки</button><a href="/privacy" target="_blank" rel="noreferrer"><ShieldCheck size={19}/> Конфиденциальность</a><div className="profile"><span className="avatar">{profile.name.slice(0,1).toUpperCase()}</span><div><strong>{profile.name}</strong><span>Личный аккаунт</span></div><button className="icon-button" aria-label="Выйти" onClick={signOut}><LogOut size={18}/></button></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Открыть меню" aria-expanded={menu} onClick={() => setMenu(true)}><Menu/></button><span>Ночной капитал</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="topbar-controls"><MotionPreferenceControl/><span className="private-label"><span/> Приватный аккаунт</span></div></header><main id="main" className="main-content"><div className={`page-heading ${section === 'overview' ? 'overview-toolbar' : ''}`}><div className="page-introduction"><p className="eyebrow">{section === 'overview' ? 'ВАША ФИНАНСОВАЯ КАРТИНА' : 'QARZHY · ЛИЧНЫЕ ФИНАНСЫ'}</p><h1>{section === 'overview' ? `Сәлем, ${profile.name}` : title}<span className="heading-dot">.</span></h1><p className="muted">{section === 'overview' ? 'Ваши деньги, привычки и планы — в одном месте.' : section === 'transactions' ? 'История ваших решений. Доходы и расходы в тенге.' : section === 'analytics' ? 'Посмотрите на цифры. Заметьте главное.' : section === 'goals' ? 'У каждого плана есть первый шаг.' : section === 'accounts' ? 'Наличные, карты и вклады. Остатки и перемещения в одном месте.' : section === 'calendar' ? 'Предстоящие платежи по дням. Всё под вашим контролем.' : section === 'assistant' ? 'Чуть больше понимания перед следующим решением.' : 'Управляйте своими данными и разрешениями.'}</p></div><div className="heading-actions">{['overview','transactions','analytics','assistant','planning','calendar'].includes(section) && <label className="month-picker"><span className="sr-only">Месяц</span><input type="month" aria-label="Месяц" min="2000-01" max="2099-12" value={month} onChange={e => {if (e.target.value) {setMonth(e.target.value);}}}/></label>}{section === 'goals' ? <button className="button primary" onClick={() => setDialog({kind:'goal'})}><Plus size={18}/> Новая цель</button> : ['overview','transactions'].includes(section) && <button className="button primary" onClick={() => setDialog({kind:'transaction'})}><Plus size={18}/> Добавить операцию</button>}</div></div>
    <ErrorMessage message={error}/><div className="status-line motion-status" role="status"><MotionStatus message={loading ? 'Обновляем данные…' : status}/></div>{error && <button className="text-button" onClick={() => loadData()}>Повторить загрузку</button>}
    {section === 'overview' && <PlanningAlerts data={planning} onOpen={() => navigate('planning')}/>}
    <MotionSurface key={section}>
    {section === 'analytics' && summary && <><section className="stats-grid" aria-label="Финансовая сводка"><article className="balance-card"><div className="stat-top"><span>Баланс по операциям</span><Wallet size={20}/></div><strong><AnimatedAmount value={summary.balance}/></strong><p>Доходы минус расходы · за всё время</p><div className="balance-art" data-parallax aria-hidden="true">₸</div></article><article className="stat-card"><div className="stat-top"><span>Доходы</span><span className="stat-icon income"><ArrowDownLeft size={20}/></span></div><strong><AnimatedAmount value={summary.income}/></strong><p>{monthLabel}</p></article><article className="stat-card"><div className="stat-top"><span>Расходы</span><span className="stat-icon expense"><ArrowUpRight size={20}/></span></div><strong><AnimatedAmount value={summary.expense}/></strong><p>{monthLabel}</p></article></section><div className="analytics-grid"><Cashflow summary={summary}/><CategoryBreakdown summary={summary}/></div></>}
    {section === 'overview' && summary && <Overview name={profile.name} summary={summary}
      onGoals={() => navigate('goals')} onTransactions={() => navigate('transactions')} onAssistant={() => navigate('assistant')}
      transactions={<TransactionList rows={transactions.slice(0,3)} edit={item => setDialog({kind:'transaction',item})} remove={id => setDialog({kind:'delete',resource:'transactions',id})} add={() => setDialog({kind:'transaction'})}/>}
      goal={goals.length ? <GoalCard goal={goals[0]} edit={() => setDialog({kind:'goal',item:goals[0]})}/> : <Empty title="Начните со своей мечты" text="Добавьте цель и отслеживайте накопления."><button className="button secondary" onClick={() => setDialog({kind:'goal'})}><Plus size={16}/> Создать цель</button></Empty>}/>
    }
    {['overview','transactions'].includes(section) && <QuickExpense key={profile.id} favorites={planning.favorites} onFavorites={loadData} onSaved={loadData} onRepeat={item=>setDialog({kind:'transaction',item:{...item,date:localToday()},copy:true})}/>}
    {section === 'analytics' && summary && <Comparison month={month} revision={summary}/>}
    {section === 'planning' && <Planning key={month} data={planning} month={month} onSaved={loadData}/>}
    {section === 'accounts' && <Accounts data={accounts} onSaved={loadData} onOperations={()=>{setFilters({...emptyOperationsFilters,accountId:'unassigned',period:'all'});navigate('transactions');}}/>}
    {section === 'calendar' && <PaymentCalendar data={planning} month={month} onPlanning={()=>navigate('planning')}/>} 
    {section === 'import' && <CsvImport onSaved={loadData}/>}
    {section === 'settings' && <InstallApp/>}
    {section === 'transactions' && <TransactionExplorer month={month} accounts={accounts.items} filters={filters} onFilters={setFilters} revision={summary} renderRows={rows=><TransactionList rows={rows} edit={item=>setDialog({kind:'transaction',item})} remove={id=>setDialog({kind:'delete',resource:'transactions',id})} add={()=>setDialog({kind:'transaction'})}/>}/>}
    {section === 'goals' && (goals.length ? <div className="goals-grid">{goals.map(goal => <section key={goal.id} className="panel"><GoalCard goal={goal} edit={() => setDialog({kind:'goal',item:goal})}/><button className="text-button danger-text" onClick={() => setDialog({kind:'delete',resource:'goals',id:goal.id})}><Trash2 size={15}/> Удалить цель</button></section>)}</div> : <section className="panel"><Empty title="Дайте своему плану имя" text="Задайте сумму, срок и отмечайте прогресс. Даже небольшие накопления приближают к цели."><button className="button primary" onClick={() => setDialog({kind:'goal'})}><Plus size={17}/> Создать первую цель</button></Empty></section>)}
    {section === 'assistant' && <Assistant profile={profile} month={month} openSettings={() => navigate('settings')}/>}
    {section === 'settings' && <Settings profile={profile} reload={loadProfile} onDeleted={() => {setProfile(null); setSummary(null); setTransactions([]); setGoals([]); setPlanning({budgets:[],recurring:[],favorites:[]}); setAccounts({items:[],unassignedBalanceMinor:'0',totalBalanceMinor:'0'});setFilters({...emptyOperationsFilters});setSection('overview');}}/>}
    </MotionSurface><footer className="workspace-footer"><span>Qarzhy · в вашем ритме</span><span><CircleHelp size={14}/> Ручной учёт · KZT</span></footer></main></div>
    {dialog && <Modal title={dialog.kind === 'transaction' ? dialog.copy ? 'Повторить операцию' : dialog.item ? 'Редактировать операцию' : 'Новая операция' : dialog.kind === 'goal' ? dialog.item ? 'Обновить цель' : 'Новая цель' : 'Удалить запись?'} onClose={() => setDialog(null)}>{dialog.kind === 'transaction' ? <TransactionForm item={dialog.item} copy={dialog.copy} accounts={accounts.items} onSaved={saved}/> : dialog.kind === 'goal' ? <GoalForm item={dialog.item} onSaved={saved}/> : <DeleteConfirmation kind={dialog.resource} id={dialog.id} onDeleted={saved}/>}</Modal>}
  </div></MotionConfig>;
}
function TransactionList({rows,edit,remove,add}: {rows:TransactionView[];edit:(item:TransactionView)=>void;remove:(id:string)=>void;add:()=>void}) {
  if (!rows.length) return <Empty title="Начните с первой записи" text="Запишите сегодняшний расход или доход. Здесь будет ваша настоящая история."><button className="text-button" onClick={add}>Добавить операцию <ArrowRight size={16}/></button></Empty>;
  return <ul className="transaction-list">{rows.map(t => <li key={t.id}><span className={`transaction-icon ${t.type}`}>{t.type === 'income' ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span><div className="transaction-description"><strong>{t.note || t.category}</strong><span>{t.category}{t.accountName ? ' · '+t.accountName : ''} <b>·</b> {new Date(t.date).toLocaleDateString('ru-KZ',{day:'numeric',month:'short',timeZone:'UTC'})}</span></div><strong className={`transaction-amount ${t.type}`}>{t.type === 'income' ? '+' : '−'}{money(t.amountMinor)}</strong><div className="row-actions"><button className="icon-button" aria-label={`Редактировать ${t.note || t.category}`} onClick={() => edit(t)}><Pencil size={15}/></button><button className="icon-button" aria-label={`Удалить ${t.note || t.category}`} onClick={() => remove(t.id)}><Trash2 size={15}/></button></div></li>)}</ul>;
}
function GoalCard({goal,edit}: {goal:GoalView;edit:()=>void}) {
  const progress = Math.min(100, Number(goal.savedMinor)/Number(goal.targetMinor)*100);
  return <div className="goal-card">
    <div className="goal-visual"><div className="goal-ring" role="img" aria-label={`Накоплено ${Math.round(progress)}%`}><svg viewBox="0 0 110 110" aria-hidden="true"><circle className="ring-track" cx="55" cy="55" r="46"/><circle className="ring-value" cx="55" cy="55" r="46" pathLength="100" strokeDasharray={`${progress} 100`}/></svg><strong>{Math.round(progress)}%</strong></div><div><h3>{goal.name}</h3><p className="muted">{goal.deadline ? `К ${new Date(goal.deadline).toLocaleDateString('ru-KZ',{timeZone:'UTC'})}` : 'Шаг за шагом к своей цели'}</p></div></div>
    <div className="goal-amount"><strong>{money(goal.savedMinor)}</strong><span>из {money(goal.targetMinor)}</span></div><progress max={100} value={progress} aria-label={`Накоплено ${Math.round(progress)}%`}/><div className="goal-caption"><span>{Math.round(progress)}% пути</span><span>{progress >= 100 ? 'Цель достигнута' : `Осталось ${money(BigInt(goal.targetMinor)-BigInt(goal.savedMinor))}`}</span></div><button className="button secondary full" onClick={edit}>Обновить прогресс <ArrowUpRight size={16}/></button>
  </div>;
}

