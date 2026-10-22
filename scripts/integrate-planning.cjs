const fs=require('fs');
const p='src/components/app.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import {Overview} from './overview';",`import {Overview} from './overview';
import {Planning, PlanningAlerts, QuickExpense, Comparison} from './planning';
import {CsvImport} from './csv-import';
import {InstallApp} from './install-app';
import type {PlanningData} from '@/lib/planning';`);
s=s.replace("|'settings';","|'settings'|'planning'|'import';");
s=s.replace("{id:'assistant',label:","{id:'planning',label:'Бюджет и платежи',icon:Wallet}, {id:'import',label:'Импорт CSV',icon:Plus}, {id:'assistant',label:");
s=s.replace("kind:'transaction'; item?:TransactionView", "kind:'transaction'; copy?:boolean; item?:TransactionView");
s=s.replace("const [page, setPage]", "const [planning,setPlanning] = useState<PlanningData>({budgets:[],recurring:[],favorites:[]});\n  const [page, setPage]");
s=s.replace('const [s,t,g] = await Promise.all','const [s,t,g,p] = await Promise.all');
s=s.replace("api<GoalView[]>('goals', {signal})]", "api<GoalView[]>('goals', {signal}), api<PlanningData>(`planning?month=${month}`, {signal})]");
s=s.replace('setGoals(g);','setGoals(g); setPlanning(p);');
s=s.replace("['overview','transactions','analytics','assistant'].includes(section)","['overview','transactions','analytics','assistant','planning'].includes(section)");
s=s.replace('<motion.div key={section}',`{section === 'overview' && <PlanningAlerts data={planning} onOpen={() => navigate('planning')}/>}
    <motion.div key={section}`);
s=s.replace("{section === 'transactions' && <section",`{['overview','transactions'].includes(section) && <QuickExpense key={profile.id} favorites={planning.favorites} onFavorites={loadData} onSaved={loadData} onRepeat={item=>setDialog({kind:'transaction',item:{...item,date:localToday()},copy:true})}/>}
    {section === 'analytics' && summary && <Comparison month={month} revision={summary}/>}
    {section === 'planning' && <Planning data={planning} month={month} onSaved={loadData}/>}
    {section === 'import' && <CsvImport onSaved={loadData}/>}
    {section === 'settings' && <InstallApp/>}
    {section === 'transactions' && <section`);
s=s.replace("dialog.item ? 'Редактировать операцию'", "dialog.copy ? 'Повторить операцию' : dialog.item ? 'Редактировать операцию'");
s=s.replace('<TransactionForm item={dialog.item} onSaved={saved}/>', '<TransactionForm item={dialog.item} copy={dialog.copy} onSaved={saved}/>');
fs.writeFileSync(p,s);
const f='src/components/forms.tsx';s=fs.readFileSync(f,'utf8').replace("item ? 'Сохранить изменения'", "item && !copy ? 'Сохранить изменения'");fs.writeFileSync(f,s);
const settings='src/components/settings.tsx';s=fs.readFileSync(settings,'utf8').replace('профиль, операции и цели в JSON','профиль, операции, цели, бюджеты и расписания в JSON').replace('Профиль, операции, цели и активные сессии','Профиль, операции, цели, бюджеты, расписания и активные сессии');fs.writeFileSync(settings,s);
