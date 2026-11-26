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
  it('createVoice 用 multipart audio_sample 上传参考音频并解析 voice_id', async () => {
    const { fn, calls } = mockFetch([{ ok: true, body: '{"id":"voice-123","object":"audio.voice"}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    const id = await engine.createVoice(new Blob(['audio']), '旁白');
    expect(id).toBe('voice-123');
    expect(calls[0].url).toContain('/v1/audio/voices');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    const form = calls[0].init.body as FormData;
    expect(form.get('name')).toBe('旁白');
    expect(form.get('audio_sample')).toBeInstanceOf(Blob);
    expect(form.get('file')).toBeNull();
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

  it('synthesize 不传 speed；rate 映射为 expected_duration_sec', async () => {
    const audioBlob = new Blob(['RIFF'], { type: 'audio/wav' });
    const { fn, calls } = mockFetch([
      { ok: true, body: audioBlob, contentType: 'audio/wav' },
      { ok: true, body: audioBlob, contentType: 'audio/wav' },
    ]);
    const engine = new MossApiEngine('sk-test', fn as any);
    // 4 个中文字 * 0.25s = 1s，rate=2 -> 0.5s，clamp 到至少 1
    await engine.synthesize({ text: '一二三四', voiceId: 'v1', rate: 2 });
    const body = JSON.parse(calls[0].init.body);
    expect(body.speed).toBeUndefined();
    expect(body.expected_duration_sec).toBeGreaterThanOrEqual(1);
    expect(body.expected_duration_sec).toBeLessThanOrEqual(2);
    // 不带 rate 时不传时长字段
    await engine.synthesize({ text: '一二三四', voiceId: 'v1' });
    const body2 = JSON.parse(calls[1].init.body);
    expect(body2.expected_duration_sec).toBeUndefined();
  });

  it('language 代码归一化为官方英文全称', async () => {
    const audioBlob = new Blob(['RIFF'], { type: 'audio/wav' });
    const { fn, calls } = mockFetch([
      { ok: true, body: audioBlob, contentType: 'audio/wav' },
      { ok: true, body: audioBlob, contentType: 'audio/wav' },
      { ok: true, body: audioBlob, contentType: 'audio/wav' },
    ]);
    const engine = new MossApiEngine('sk-test', fn as any);
    await engine.synthesize({ text: 'hi', voiceId: 'v1', language: 'zh' });
    await engine.synthesize({ text: 'hi', voiceId: 'v1', language: 'en' });
    await engine.synthesize({ text: 'hi', voiceId: 'v1', language: 'Japanese' });
    expect(JSON.parse(calls[0].init.body).language).toBe('Chinese');
    expect(JSON.parse(calls[1].init.body).language).toBe('English');
    expect(JSON.parse(calls[2].init.body).language).toBe('Japanese');
  });

  it('API 报错时抛出人话错误', async () => {
    const { fn } = mockFetch([{ ok: false, body: '{"error":{"message":"invalid voice"}}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    await expect(engine.createVoice(new Blob(['x']), 'x')).rejects.toThrow();
  });
});
