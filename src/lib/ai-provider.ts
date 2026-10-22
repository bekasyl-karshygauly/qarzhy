import type {Summary} from './finance';

export type AIContextMode = 'general' | 'financial';
export function isGeminiEndpoint(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'generativelanguage.googleapis.com' && /^\/v1(?:beta)?\/openai\/?$/.test(url.pathname);
  } catch {return false;}
}

export function assistantContextMode(baseUrl: string, requested?: string, googlePaidServices = false): AIContextMode {
  // A key or a model listing cannot establish paid-service data terms.
  if (isGeminiEndpoint(baseUrl) && !googlePaidServices) return 'general';
  if (requested === 'general') return 'general';
  if (requested === 'financial' || requested === undefined || requested === '') return 'financial';
  return 'general';
}

type ContextSummary = Pick<Summary, 'income' | 'expense' | 'byCategory'>;
type AssistantConfig = {baseUrl: string; model: string; contextMode: AIContextMode};
export async function createAssistantRequest(config: AssistantConfig, input: {message: string; month: string}, readSummary: () => Promise<ContextSummary>) {
  const common = 'Отвечай по-русски, кратко и конкретно. Не обещай доходность, не давай инвестиционные или юридические рекомендации. Не запрашивай пароли, ИИН или банковские реквизиты. Ты не можешь изменять данные.';
  const system = config.contextMode === 'general'
    ? `Ты образовательный помощник по финансовой грамотности. ${common} У тебя нет доступа к операциям, балансу, доходам, расходам или целям пользователя. Не утверждай, что проанализировал его счёт. Объясняй общие принципы и явно условные примеры. Не проси реальные суммы и персональные или конфиденциальные сведения. Если пользователь просит анализ своих данных, объясни, что они тебе не переданы.`
    : `Ты помощник по личному бюджету. ${common} Данные контекста выражены в тиынах: 100 тиын = 1 тенге. Не выдумывай операции. Если данных недостаточно, скажи об этом.`;
  let content = input.message;
  if (config.contextMode === 'financial') {
    const summary = await readSummary();
    const context = {month: input.month, currency: 'KZT', amountUnit: 'tiyn', income: summary.income, expense: summary.expense, byCategory: summary.byCategory.map(({name, value}) => ({name, value}))};
    content = `Сводка: ${JSON.stringify(context)}\nВопрос: ${input.message}`;
  }
  const gemini = isGeminiEndpoint(config.baseUrl);
  return {
    model: config.model,
    // Gemini's output cap also includes thinking. Keep space for a short answer.
    max_tokens: gemini ? 2048 : 700,
    ...(gemini ? {reasoning_effort: /^gemini-3(?:[.-]).*flash/.test(config.model) ? 'minimal' : 'low'} : {}),
    messages: [{role: 'system', content: system}, {role: 'user', content}],
  };
}

export async function sendAssistantRequest(url: URL, key: string, body: Awaited<ReturnType<typeof createAssistantRequest>>, retryTransient = false, send: typeof fetch = fetch) {
  // One shared deadline covers both attempts; never retry quotas, bad credentials
  // or an uncertain network timeout. Existing paid/custom providers keep one call.
  const signal = AbortSignal.timeout(45000);
  const options: RequestInit = {method: 'POST', headers: {Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal, redirect: 'error'};
  let response = await send(url, options);
  if (retryTransient && [500, 502, 503, 504].includes(response.status)) {
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 400));
    signal.throwIfAborted();
    response = await send(url, options);
  }
  return response;
}
