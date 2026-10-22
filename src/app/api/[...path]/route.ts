import {Prisma} from '@prisma/client';
import {ZodError} from 'zod';
import {db} from '@/lib/db';
import {hashPassword, verifyPassword} from '@/lib/security';
import {ApiError, checkOrigin, consentVersion, createSession, getSummary, json, limitedBody, logout, providerInfo, rateLimit, readJson, requireUser} from '@/lib/server';
import {assistantSchema, credentialsSchema, goalSchema, registerSchema, settingsSchema} from '@/lib/validation';
import {localToday} from '@/lib/finance';
import {planningRoute} from '@/lib/planning-server';
import {accountsRoute, createTransaction, editTransaction, getTransactions} from '@/lib/accounts-server';
import {createAssistantRequest, sendAssistantRequest} from '@/lib/ai-provider';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leaves room for the provider's existing shared 45-second deadline and database work.
export const maxDuration = 60;
type Context = {params: Promise<{path: string[]}>};
async function handle(req: Request, context: Context) {
  try {
    const parts = (await context.params).path;
    const route = parts.join('/'); const method = req.method;
    const url = new URL(req.url);
    if (method !== 'GET') checkOrigin(req);
    if (route === 'health' && method === 'GET') {await db.$queryRaw`SELECT 1`; return json({status: 'ok'});}
    if (route === 'auth/register' && method === 'POST') {
      if (process.env.ALLOW_REGISTRATION !== 'true') throw new ApiError(403, 'Регистрация закрыта для новых участников.');
      await rateLimit('register-global', 30, 3600);
      const input = registerSchema.parse(await readJson(req));
      await rateLimit(`register:${input.email}`, 5, 3600);
      const user = await db.user.create({data: {name: input.name, email: input.email, passwordHash: await hashPassword(input.password), consentVersion}});
      await createSession(user.id);
      return json({ok: true}, 201);
    }
    if (route === 'auth/login' && method === 'POST') {
      await rateLimit('login-global', 200, 60);
      const input = credentialsSchema.parse(await readJson(req));
      await rateLimit(`login:${input.email}`, 10, 900);
      const user = await db.user.findUnique({where: {email: input.email}});
      // Perform password work even for unknown accounts to reduce timing differences.
      const valid = user ? await verifyPassword(input.password, user.passwordHash) : (await hashPassword(input.password), false);
      if (!user || !valid) throw new ApiError(401, 'Неверный email или пароль.');
      await createSession(user.id); return json({ok: true});
    }
    if (route === 'auth/logout' && method === 'POST') {await logout(); return json({ok: true});}
    const user = await requireUser();
    await rateLimit(`api:${user.id}`, 180, 60);
    const accounts = await accountsRoute(req, user.id, parts);
    if (accounts) return accounts;
    const planning = await planningRoute(req, user.id, parts);
    if (planning) return planning;
    const provider = providerInfo();
    if (route === 'me' && method === 'GET') return json({id: user.id, name: user.name, email: user.email, aiConsent: user.aiConsent && user.providerConsent === provider.identity, voiceConsent: user.voiceConsent && user.providerConsent === provider.identity, provider: {configured: provider.configured, voiceConfigured: provider.voiceConfigured, name: provider.name, country: provider.country, contextMode: provider.contextMode, dataPolicy: provider.dataPolicy}});
    if (route === 'me' && method === 'PATCH') {
      const input = settingsSchema.parse(await readJson(req));
      if ((input.aiConsent && !provider.configured) || (input.voiceConsent && !provider.voiceConfigured)) throw new ApiError(503, 'Внешний сервис ещё не настроен.');
      await db.user.update({where: {id: user.id}, data: {...input, providerConsent: provider.identity, aiConsentAt: input.aiConsent ? new Date() : null, voiceConsentAt: input.voiceConsent ? new Date() : null}});
      return json({ok: true});
    }
    if (route === 'summary' && method === 'GET') return json(await getSummary(user.id, url.searchParams.get('month') || localToday().slice(0, 7)));
    if (route === 'transactions' && method === 'GET') {
      return json(await getTransactions(user.id, url.searchParams));
    }
    if (route === 'transactions' && method === 'POST') {
      return json(await createTransaction(user.id, await readJson(req)), 201);
    }
    if (parts[0] === 'transactions' && parts.length === 2 && method === 'PATCH') {
      await editTransaction(user.id, parts[1], await readJson(req));
      return json({ok: true});
    }
    if (parts[0] === 'transactions' && parts.length === 2 && method === 'DELETE') {
      const result = await db.transaction.deleteMany({where: {id: parts[1], userId: user.id}});
      if (!result.count) throw new ApiError(404, 'Операция не найдена.');
      return json({ok: true});
    }
    if (route === 'goals' && method === 'GET') return json(await db.goal.findMany({where: {userId: user.id}, orderBy: {createdAt: 'desc'}}));
    if (route === 'goals' && method === 'POST') {
      const input = goalSchema.parse(await readJson(req));
      return json(await db.goal.create({data: {userId: user.id, name: input.name, targetMinor: input.target, savedMinor: input.saved, deadline: input.deadline ? new Date(input.deadline) : null}}), 201);
    }
    if (parts[0] === 'goals' && parts.length === 2 && method === 'PATCH') {
      const input = goalSchema.parse(await readJson(req));
      const result = await db.goal.updateMany({where: {id: parts[1], userId: user.id}, data: {name: input.name, targetMinor: input.target, savedMinor: input.saved, deadline: input.deadline ? new Date(input.deadline) : null}});
      if (!result.count) throw new ApiError(404, 'Цель не найдена.');
      return json({ok: true});
    }
    if (parts[0] === 'goals' && parts.length === 2 && method === 'DELETE') {
      const result = await db.goal.deleteMany({where: {id: parts[1], userId: user.id}});
      if (!result.count) throw new ApiError(404, 'Цель не найдена.');
      return json({ok: true});
    }
    if (route === 'export' && method === 'GET') {
      await rateLimit(`export:${user.id}`, 5, 3600);
      const [transactions, goals, budgets, recurring, accounts, transfers] = await db.$transaction([
        db.transaction.findMany({where: {userId: user.id}, omit: {userId: true, requestId: true}}),
        db.goal.findMany({where: {userId: user.id}, omit: {userId: true}}),
        db.budget.findMany({where: {userId: user.id}, omit: {userId: true}}),
        db.recurringPayment.findMany({where: {userId: user.id}, omit: {userId: true}}),
        db.account.findMany({where: {userId: user.id}, omit: {userId: true, requestId: true}}),
        db.transfer.findMany({where: {userId: user.id}, omit: {userId: true, requestId: true}}),
      ], {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
      const response = json({exportedAt: new Date(), currency: 'KZT', amountUnit: 'tiyn', profile: {name: user.name, email: user.email, createdAt: user.createdAt, consentAt: user.consentAt, consentVersion: user.consentVersion, favoriteCategories:user.favoriteCategories}, transactions, goals, budgets, recurring, accounts, transfers});
      response.headers.set('Content-Disposition', 'attachment; filename="qarzhy-export.json"'); return response;
    }
    if (route === 'account' && method === 'DELETE') {
      await rateLimit(`delete:${user.id}`, 5, 900);
      const body = await readJson(req);
      if (typeof body.password !== 'string' || body.password.length > 128 || body.confirmation !== 'УДАЛИТЬ' || !await verifyPassword(body.password, user.passwordHash)) throw new ApiError(400, 'Проверьте пароль и введите УДАЛИТЬ.');
      await db.user.delete({where: {id: user.id}});
      await logout(); return json({ok: true});
    }
    if (route === 'assistant' && method === 'POST') {
      if (!provider.configured) throw new ApiError(503, 'ИИ не подключён. Администратор должен настроить серверные параметры провайдера.');
      if (!user.aiConsent || user.providerConsent !== provider.identity) throw new ApiError(403, provider.contextMode === 'general' ? 'Разрешите передачу вопроса ИИ-провайдеру в настройках.' : 'Разрешите передачу сводки и вопроса ИИ-провайдеру в настройках.');
      await rateLimit(`ai:${user.id}`, 15, 3600);
      const input = assistantSchema.parse(await readJson(req));
      const body = await createAssistantRequest({baseUrl: process.env.AI_BASE_URL!, model: process.env.AI_MODEL!.trim(), contextMode: provider.contextMode}, input, () => getSummary(user.id, input.month));
      const response = await sendAssistantRequest(providerUrl('chat/completions'), process.env.AI_API_KEY!, body, provider.dataPolicy === 'google-unpaid');
      if (!response.ok) console.warn('AI provider HTTP status:', response.status);
      if (response.status === 429) throw new ApiError(429, 'Лимит запросов ИИ-провайдера исчерпан. Подождите и попробуйте позже.');
      if (!response.ok) throw new ApiError(502, 'Провайдер ИИ временно недоступен. Попробуйте позже.');
      const result = await response.json(); const answer = result.choices?.[0]?.message?.content;
      if (result.choices?.[0]?.finish_reason === 'length') throw new ApiError(502, 'Провайдер остановил ответ по лимиту. Попробуйте задать более короткий вопрос.');
      if (typeof answer !== 'string' || !answer.trim()) throw new ApiError(502, 'Провайдер не вернул текстовый ответ.');
      return json({answer: answer.slice(0, 12000)});
    }
    if (route === 'voice' && method === 'POST') {
      if (!provider.voiceConfigured) throw new ApiError(503, 'Распознавание речи не подключено. Нужен VOICE_MODEL и настроенный ИИ-провайдер.');
      if (!user.voiceConsent || user.providerConsent !== provider.identity) throw new ApiError(403, 'Разрешите передачу аудио провайдеру в настройках.');
      await rateLimit(`voice:${user.id}`, 10, 3600);
      const type = req.headers.get('content-type') || '';
      if (!['audio/webm', 'audio/mp4', 'audio/ogg'].some(t => type.startsWith(t))) throw new ApiError(415, 'Формат аудио не поддерживается.');
      const bytes = await limitedBody(req, 5 * 1024 * 1024);
      if (bytes.length < 100) throw new ApiError(400, 'Аудиозапись слишком короткая.');
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)], {type}), type.startsWith('audio/mp4') ? 'voice.mp4' : type.startsWith('audio/ogg') ? 'voice.ogg' : 'voice.webm');
      form.set('model', process.env.VOICE_MODEL!); form.set('language', 'ru');
      const response = await fetch(providerUrl('audio/transcriptions'), {method: 'POST', headers: {'Authorization': `Bearer ${process.env.AI_API_KEY}`}, body: form, signal: AbortSignal.timeout(45000), redirect: 'error'});
      if (!response.ok) throw new ApiError(502, 'Не удалось распознать речь. Попробуйте текстовый ввод.');
      const result = await response.json();
      if (typeof result.text !== 'string') throw new ApiError(502, 'Провайдер не вернул расшифровку.');
      return json({text: result.text.slice(0, 2000)});
    }
    throw new ApiError(404, 'Маршрут не найден.');
  } catch(error) {
    if (error instanceof ApiError) return json({error: error.message}, error.status);
    if (error instanceof ZodError) return json({error: error.issues.map(x => x.message).join(' ')}, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return json({error: 'Не удалось создать аккаунт с этим email. Попробуйте войти.'}, 409);
    // Never return database details, request bodies, or upstream credentials to clients/logs.
    console.error('API operation failed:', error instanceof Error ? error.name : 'UnknownError');
    return json({error: 'Сервис временно недоступен. Проверьте соединение и повторите попытку.'}, 503);
  }
}
function providerUrl(endpoint: string) {
  const url = new URL(`${process.env.AI_BASE_URL!.replace(/\/$/, '')}/${endpoint}`);
  if (url.protocol !== 'https:') throw new ApiError(503, 'Провайдер должен использовать HTTPS.');
  return url;
}
export {handle as GET, handle as POST, handle as PATCH, handle as DELETE};
