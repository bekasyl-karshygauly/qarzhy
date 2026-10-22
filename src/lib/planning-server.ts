import {z} from 'zod';
import {createHash} from 'node:crypto';
import {db} from './db';
import {ApiError, getSummary, json, limitedBody, readJson} from './server';
import {categories, localToday, monthBounds} from './finance';
import {dateSchema, importTransactionSchema, transactionEditSchema} from './validation';
import {withAccountName} from './accounts-server';
import {nextOccurrence, previousMonth, compareMonths} from './planning';
const monthSchema=z.string().refine(v=>{try{monthBounds(v);return true;}catch{return false;}},'Некорректный месяц.');
const positive=transactionEditSchema.shape.amount;
const budgetSchema=z.object({month:monthSchema,category:z.enum(categories),amount:positive}).strict();
const recurringSchema=z.object({name:z.string().trim().min(2).max(80),category:z.enum(categories),amount:positive,frequency:z.enum(['weekly','monthly','yearly']),nextDate:dateSchema,active:z.boolean()}).strict();
export async function planningRoute(req:Request, userId:string, parts:string[]):Promise<Response|null> {
  const route=parts.join('/'); const method=req.method; const url=new URL(req.url);
  if(route==='planning'&&method==='GET') {
    const month=monthSchema.parse(url.searchParams.get('month')||localToday().slice(0,7));
    const [budgets,recurring,user,summary]=await Promise.all([db.budget.findMany({where:{userId,month},orderBy:{category:'asc'}}),db.recurringPayment.findMany({where:{userId},orderBy:{nextDate:'asc'}}),db.user.findUniqueOrThrow({where:{id:userId},select:{favoriteCategories:true}}),getSummary(userId,month)]);
    return json({budgets:budgets.map(b=>({...b,spent:summary.byCategory.find(c=>c.name===b.category)?.value||'0'})),recurring,favorites:user.favoriteCategories});
  }
  if(route==='comparison'&&method==='GET') {
    const month=monthSchema.parse(url.searchParams.get('month')||localToday().slice(0,7));const before=previousMonth(month);
    const [current,previous]=await Promise.all([getSummary(userId,month),getSummary(userId,before)]);
    return json({month,previousMonth:before,current,previous,...compareMonths(current,previous)});
  }
  if(route==='favorites'&&method==='PATCH') {
    const input=z.object({categories:z.array(z.enum(categories)).max(6).refine(v=>new Set(v).size===v.length)}).strict().parse(await readJson(req));
    await db.user.update({where:{id:userId},data:{favoriteCategories:input.categories}});return json({ok:true});
  }
  if(route==='transactions/latest'&&method==='GET') {
    const latest=await db.transaction.findFirst({where:{userId},orderBy:[{createdAt:'desc'},{id:'desc'}],include:{account:{select:{name:true}}}});
    return json(latest?withAccountName(latest):null);
  }
  if(route==='budgets'&&method==='POST') {
    const {month,category,amount}=budgetSchema.parse(await readJson(req));
    return json(await db.budget.upsert({where:{userId_month_category:{userId,month,category}},create:{userId,month,category,limitMinor:amount},update:{limitMinor:amount}}));
  }
  if(parts[0]==='budgets'&&parts.length===2&&method==='DELETE') {
    const result=await db.budget.deleteMany({where:{id:parts[1],userId}});if(!result.count)throw new ApiError(404,'Бюджет не найден.');return json({ok:true});
  }
  if(route==='recurring'&&method==='POST') {
    if(await db.recurringPayment.count({where:{userId}})>=100)throw new ApiError(400,'Максимум 100 расписаний.');
    const {amount,nextDate,...rest}=recurringSchema.parse(await readJson(req));
    return json(await db.recurringPayment.create({data:{...rest,userId,amountMinor:amount,nextDate:new Date(nextDate),anchorDay:Number(nextDate.slice(8))}}),201);
  }
  if(parts[0]==='recurring'&&parts.length===2&&method==='PATCH') {
    const {amount,nextDate,...rest}=recurringSchema.parse(await readJson(req));
    const existing=await db.recurringPayment.findFirst({where:{id:parts[1],userId}});if(!existing)throw new ApiError(404,'Платёж не найден.');
    const result=await db.recurringPayment.updateMany({where:{id:parts[1],userId,nextDate:existing.nextDate},data:{...rest,amountMinor:amount,nextDate:new Date(nextDate),anchorDay:nextDate===existing.nextDate.toISOString().slice(0,10)?existing.anchorDay:Number(nextDate.slice(8))}});
    if(!result.count)throw new ApiError(409,'Расписание изменилось. Обновите страницу.');return json({ok:true});
  }
  if(parts[0]==='recurring'&&parts.length===2&&method==='DELETE') {
    const result=await db.recurringPayment.deleteMany({where:{id:parts[1],userId}});if(!result.count)throw new ApiError(404,'Платёж не найден.');return json({ok:true});
  }
  if(parts[0]==='recurring'&&parts.length===3&&parts[2]==='record'&&method==='POST') {
    const {dueDate}=z.object({dueDate:dateSchema}).strict().parse(await readJson(req));
    await db.$transaction(async tx=>{
      const item=await tx.recurringPayment.findFirst({where:{id:parts[1],userId,active:true}});
      if(!item)throw new ApiError(404,'Активное расписание не найдено.');
      if(item.nextDate.toISOString().slice(0,10)!==dueDate)throw new ApiError(409,'Этот платёж уже записан или расписание изменилось. Обновите список.');
      if(dueDate>localToday())throw new ApiError(400,'Дата платежа ещё не наступила.');
      const nextDate=nextOccurrence(dueDate,item.frequency,item.anchorDay);
      if(nextDate>'2100-12-31')throw new ApiError(400,'Достигнут предел дат расписания.');
      const claim=await tx.recurringPayment.updateMany({where:{id:item.id,userId,nextDate:item.nextDate,active:true},data:{nextDate:new Date(nextDate)}});
      if(!claim.count)throw new ApiError(409,'Платёж уже обработан. Обновите список.');
      await tx.transaction.create({data:{userId,requestId:`recurring:${item.id}:${dueDate}`,type:'expense',amountMinor:item.amountMinor,category:item.category,note:item.name,date:new Date(dueDate),accountId:null}});
    });return json({ok:true});
  }
  if(route==='import'&&method==='POST') {
    if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Ожидается JSON.');
    let raw;try{raw=JSON.parse((await limitedBody(req,500000)).toString('utf8'));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'Некорректный JSON.');}
    const {rows}=z.object({rows:z.array(importTransactionSchema).min(1).max(500)}).strict().parse(raw);
    const seen=new Map<string,number>();
    const data=rows.map(({amount,date,...rest})=>{
      const canonical=JSON.stringify({...rest,amount:amount.toString(),date});
      const occurrence=(seen.get(canonical)||0)+1;seen.set(canonical,occurrence);
      return {...rest,userId,amountMinor:amount,date:new Date(date),accountId:null,requestId:`csv:${createHash('sha256').update(canonical+':'+occurrence).digest('hex')}`};
    });
    const result=await db.transaction.createMany({data,skipDuplicates:true});
    return json({imported:result.count,skipped:rows.length-result.count});
  }
  return null;
}
