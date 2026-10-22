import {describe, expect, it, vi} from 'vitest';
import {assistantContextMode, createAssistantRequest, isGeminiEndpoint, sendAssistantRequest} from '../../src/lib/ai-provider';

const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
const input = {month: '2026-10', message: 'Как начать вести бюджет?'};
describe('assistant provider and privacy boundaries', () => {
  it.each([undefined, '', 'general', 'financial', 'typo'])('never attaches finance for unpaid/unknown Gemini (%s)', requested => {
    expect(assistantContextMode(baseUrl, requested)).toBe('general');
  });
  it('preserves an explicitly configured paid financial mode and existing providers', () => {
    expect(assistantContextMode(baseUrl, 'financial', true)).toBe('financial');
    expect(assistantContextMode('https://api.example.invalid/v1', undefined)).toBe('financial');
    expect(assistantContextMode('https://api.example.invalid/v1', 'typo')).toBe('general');
  });
  it('matches the actual Gemini endpoint rather than a lookalike hostname', () => {
    expect(isGeminiEndpoint(baseUrl + '/')).toBe(true);
    expect(isGeminiEndpoint('https://generativelanguage.googleapis.com.evil.invalid/v1beta/openai')).toBe(false);
    expect(isGeminiEndpoint('not a URL')).toBe(false);
  });
  it('does not even read the financial database in general mode', async () => {
    const readSummary = vi.fn().mockRejectedValue(new Error('Private financial query must never run'));
    const body = await createAssistantRequest({baseUrl, model: 'gemini-3.1-flash-lite', contextMode: 'general'}, input, readSummary);
    expect(readSummary).not.toHaveBeenCalled();
    expect(body.messages[1]).toEqual({role: 'user', content: input.message});
    expect(JSON.stringify(body)).not.toContain(input.month);
    expect(body.messages[0].content).toContain('нет доступа');
    expect(body.max_tokens).toBeGreaterThan(700);
    expect(body.reasoning_effort).toBe('minimal');
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'reasoning_effort']);
  });
  it('financial mode allowlists only exact monthly aggregates, never notes, balances or user identifiers', async () => {
    const readSummary = vi.fn().mockResolvedValue({income: '9007199254740993', expense: '12345', balance: 'private-balance', email: 'secret@example.invalid', note: 'private-note', transactions: ['private-transaction'], byCategory: [{name: 'Продукты', value: '12345', note: 'private-category-note'}]});
    const body = await createAssistantRequest({baseUrl: 'https://api.example.invalid/v1', model: 'compatible-model', contextMode: 'financial'}, input, readSummary);
    expect(readSummary).toHaveBeenCalledTimes(1);
    const context = JSON.parse(body.messages[1].content.split('\nВопрос: ')[0].slice('Сводка: '.length));
    expect(context).toEqual({month: input.month, currency: 'KZT', amountUnit: 'tiyn', income: '9007199254740993', expense: '12345', byCategory: [{name: 'Продукты', value: '12345'}]});
    expect(JSON.stringify(body)).not.toMatch(/private-|secret@example/);
    expect(body.max_tokens).toBe(700);
    expect(body.reasoning_effort).toBeUndefined();
  });
  it('retries a temporary unpaid-provider refusal only once, without changing the request or its deadline', async () => {
    const body = await createAssistantRequest({baseUrl, model: 'gemini-3.1-flash-lite', contextMode: 'general'}, input, vi.fn());
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('busy', {status: 503})).mockResolvedValueOnce(new Response('{}', {status: 200}));
    expect((await sendAssistantRequest(new URL(baseUrl + '/chat/completions'), 'fixture-key', body, true, send)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1]);
    expect(send.mock.calls[0][1]?.redirect).toBe('error');
  });
  it.each([401, 403, 429])('does not retry credentials or quota failures (%s)', async status => {
    const body = await createAssistantRequest({baseUrl, model: 'gemini-3.1-flash-lite', contextMode: 'general'}, input, vi.fn());
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', {status}));
    expect((await sendAssistantRequest(new URL(baseUrl + '/chat/completions'), 'fixture-key', body, true, send)).status).toBe(status);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('bounds retries and leaves existing paid/custom providers at one attempt', async () => {
    const body = await createAssistantRequest({baseUrl, model: 'gemini-3.1-flash-lite', contextMode: 'general'}, input, vi.fn());
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}', {status: 503}));
    expect((await sendAssistantRequest(new URL(baseUrl + '/chat/completions'), 'fixture-key', body, true, send)).status).toBe(503);
    expect(send).toHaveBeenCalledTimes(2);
    send.mockClear();
    expect((await sendAssistantRequest(new URL(baseUrl + '/chat/completions'), 'fixture-key', body, false, send)).status).toBe(503);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
