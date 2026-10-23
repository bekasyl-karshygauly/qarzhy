import {cookies} from 'next/headers';
import {Prisma} from '@prisma/client';
import {db} from './db';
import {hash, newToken, validOrigin} from './security';
import {monthBounds, summarize} from './finance';
import {assistantContextMode, isGeminiEndpoint} from './ai-provider';
import {appUrl} from './hosting';
export class ApiError extends Error { constructor(public status: number, message: string) {super(message);} }
export {consentVersion} from './privacy';
const secure = process.env.COOKIE_SECURE === 'true' || appUrl(process.env).startsWith('https://') || process.env.VERCEL === '1';
const cookieName = secure ? '__Host-qarzhy_session' : 'qarzhy_session';
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({where: {tokenHash: hash(token)}, include: {user: true}});
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, 'Войдите в аккаунт.');
  return user;
}
export async function createSession(userId: string) {
  const jar = await cookies();
  const prior = jar.get(cookieName)?.value;
  if (prior) await db.session.deleteMany({where: {tokenHash: hash(prior)}});
  const token = newToken();
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({data: {tokenHash: hash(token), userId, expiresAt}});
  jar.set(cookieName, token, {httpOnly: true, secure: Boolean(secure), sameSite: 'lax', path: '/', expires: expiresAt});
}
export async function logout() {
  const jar = await cookies(); const token = jar.get(cookieName)?.value;
  if (token) await db.session.deleteMany({where: {tokenHash: hash(token)}});
  jar.set(cookieName, '', {httpOnly: true, secure: Boolean(secure), sameSite: 'lax', path: '/', maxAge: 0});
}
export function checkOrigin(request: Request) {
  if (!validOrigin(request.headers.get('origin'), appUrl(process.env))) throw new ApiError(403, 'Источник запроса не разрешён. Обновите страницу.');
}
export async function limitedBody(request: Request, limit = 16384) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new ApiError(413, 'Запрос слишком большой.');
  if (!request.body) throw new ApiError(400, 'Нет данных запроса.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) {await reader.cancel(); throw new ApiError(413, 'Запрос слишком большой.');} chunks.push(value); }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Ожидается JSON.');
  try {return JSON.parse((await limitedBody(request)).toString('utf8'));} catch(e) {if (e instanceof ApiError) throw e; throw new ApiError(400, 'Некорректный JSON.');}
}
export async function rateLimit(scope: string, max: number, seconds: number) {
  const key = hash(scope);
  const now = new Date(); const expires = new Date(now.getTime() + seconds * 1000);
  const rows = await db.$queryRaw<{count: number}[]>(Prisma.sql`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expires})
    ON CONFLICT ("key") DO UPDATE SET
    "count" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
    "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN ${expires} ELSE "RateLimit"."expiresAt" END
    RETURNING "count"`);
  if (rows[0].count > max) throw new ApiError(429, 'Слишком много запросов. Попробуйте позже.');
}
export function providerInfo() {
  const baseUrl = process.env.AI_BASE_URL || '';
  const googlePaidServices = process.env.AI_GOOGLE_PAID_SERVICES === 'true';
  const contextMode = assistantContextMode(baseUrl, process.env.AI_CONTEXT_MODE, googlePaidServices);
  const dataPolicy = isGeminiEndpoint(baseUrl) && !googlePaidServices ? 'google-unpaid' as const : 'standard' as const;
  const configured = Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL && process.env.AI_PROVIDER_NAME && process.env.AI_PROCESSING_COUNTRY);
  const identity = hash([process.env.AI_BASE_URL, process.env.AI_MODEL, process.env.VOICE_MODEL, process.env.AI_PROVIDER_NAME, process.env.AI_PROCESSING_COUNTRY, contextMode, dataPolicy].join('|'));
  return {configured, voiceConfigured: configured && Boolean(process.env.VOICE_MODEL) && !isGeminiEndpoint(baseUrl), name: process.env.AI_PROVIDER_NAME || '', country: process.env.AI_PROCESSING_COUNTRY || '', identity, contextMode, dataPolicy};
}
export async function getSummary(userId: string, month: string) {
  let bounds; try {bounds = monthBounds(month);} catch {throw new ApiError(400, 'Некорректный месяц.');}
  const [rows, sums] = await Promise.all([
    db.transaction.findMany({where: {userId, date: {gte: bounds.start, lt: bounds.end}}}),
    db.transaction.groupBy({by: ['type'], where: {userId}, _sum: {amountMinor: true}}),
  ]);
  const balance = sums.reduce((total, s) => total + (s.type === 'income' ? 1n : -1n) * (s._sum.amountMinor || 0n), 0n);
  return {...summarize(rows, month), balance: balance.toString()};
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_, value) => typeof value === 'bigint' ? value.toString() : value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private'}});
}
