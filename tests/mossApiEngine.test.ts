import { describe, it, expect, vi } from 'vitest';
import { MossApiEngine } from '../src/core/tts/mossApiEngine';

function mockFetch(responses: { ok: boolean; body: string | Blob; contentType?: string }[]) {
  const calls: { url: string; init: any }[] = [];
  const fn = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return {
      ok: r.ok, status: r.ok ? 200 : 400,
      headers: { get: () => r.contentType ?? 'application/json' },
      blob: async () => r.body as Blob,
      text: async () => r.body as string,
      json: async () => JSON.parse(r.body as string),
    } as any;
  });
  return { fn, calls };
}

describe('MossApiEngine', () => {
  it('createVoice 用 multipart 上传参考音频并解析 voice_id', async () => {
    const { fn, calls } = mockFetch([{ ok: true, body: '{"id":"voice-123","object":"audio.voice"}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    const id = await engine.createVoice(new Blob(['audio']), '旁白');
    expect(id).toBe('voice-123');
    expect(calls[0].url).toContain('/v1/audio/voices');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    expect((calls[0].init.body as FormData).get('name')).toBe('旁白');
  });

  it('synthesize 用 voice_id 合成并返回音频 Blob', async () => {
    const audioBlob = new Blob(['RIFFfake'], { type: 'audio/wav' });
    const { fn, calls } = mockFetch([{ ok: true, body: audioBlob, contentType: 'audio/wav' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    const out = await engine.synthesize({ text: '第一章', voiceId: 'voice-123' });
    expect(out).toBe(audioBlob);
    const body = JSON.parse(calls[0].init.body);
    expect(body.voice_id).toBe('voice-123');
    expect(body.input).toBe('第一章');
    expect(body.model).toBeTruthy();
  });

  it('API 报错时抛出人话错误', async () => {
    const { fn } = mockFetch([{ ok: false, body: '{"error":{"message":"invalid voice"}}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    await expect(engine.createVoice(new Blob(['x']), 'x')).rejects.toThrow();
  });
});
