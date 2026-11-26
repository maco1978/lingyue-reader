import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../src/core/agent/llmProvider';

function mockChat(reply: any) {
  return vi.fn(async (_url: string, _init: any) => ({
    ok: true, status: 200,
    json: async () => reply,
  })) as any;
}

describe('OpenAIProvider', () => {
  it('按 OpenAI Chat Completions 协议发请求并解析回答', async () => {
    const fn = mockChat({ choices: [{ message: { role: 'assistant', content: '这是第一章的总结。' }, finish_reason: 'stop' }] });
    const p = new OpenAIProvider('sk-test', 'https://api.hunyuan.cloud.tencent.com/v1', 'hy4-flash', fn);
    const out = await p.chat([{ role: 'user', content: '总结第一章' }]);
    expect(out.content).toBe('这是第一章的总结。');
    expect(fn.mock.calls[0][0]).toContain('/chat/completions');
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.model).toBe('hy4-flash');
    expect(body.messages[0].content).toBe('总结第一章');
    expect(fn.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test');
  });

  it('解析 tool_calls（定位原文工具）', async () => {
    const fn = mockChat({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'findInBook', arguments: '{"query":"起风"}' } }] }, finish_reason: 'tool_calls' }] });
    const p = new OpenAIProvider('sk', 'https://api.deepseek.com', 'deepseek-chat', fn);
    const out = await p.chat([{ role: 'user', content: '起风在哪' }], [{ name: 'findInBook', description: '在书中定位原文', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }]);
    expect(out.toolCalls?.[0].name).toBe('findInBook');
    expect(out.toolCalls?.[0].args).toEqual({ query: '起风' });
    const body2 = JSON.parse(fn.mock.calls[0][1].body);
    expect(body2.tools).toEqual([{ type: 'function', function: { name: 'findInBook', description: '在书中定位原文', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }]);
  });

  it('tool arguments 非法 JSON 时容错：args 为 {} 且不抛错', async () => {
    const fn = mockChat({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'findInBook', arguments: 'not-json' } }] }, finish_reason: 'tool_calls' }] });
    const p = new OpenAIProvider('sk', 'https://api.deepseek.com', 'deepseek-chat', fn);
    const out = await p.chat([{ role: 'user', content: '起风在哪' }]);
    expect(out.toolCalls?.[0].id).toBe('call_1');
    expect(out.toolCalls?.[0].name).toBe('findInBook');
    expect(out.toolCalls?.[0].args).toEqual({});
  });

  it('API 报错时抛出人话错误（含状态码）', async () => {
    const fn = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid key' })) as any;
    const p = new OpenAIProvider('bad', 'https://api.deepseek.com', 'deepseek-chat', fn);
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/401/);
  });
});
