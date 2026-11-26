import type { TTSEngine, SynthRequest } from './types';
import { withTimeout } from '../net';

const DEFAULT_BASE = 'https://api.mosi.cn';
const DEFAULT_MODEL = 'moss-tts-2.0-flash-preview';
/** 一次合成/上传的总超时：800 字的中文段落正常在 1 分钟内能返回 */
const DEFAULT_TIMEOUT_MS = 60_000;

/** 官方要求英文全称，常见代码归一化；其它原样透传。 */
const LANGUAGE_MAP: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
};

/** 估算朗读秒数：中文按每字 0.25s，英文按每词 0.4s。 */
function estimateSeconds(text: string): number {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const words = text.replace(/[一-鿿㐀-䶿]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, cjk * 0.25 + words * 0.4);
}

/** MOSS 托管 API 适配器。fetch 通过构造器注入，测试可 mock。 */
export class MossApiEngine implements TTSEngine {
  constructor(
    private apiKey: string,
    private fetchFn: typeof fetch = fetch,
    private baseUrl: string = DEFAULT_BASE,
    private model: string = DEFAULT_MODEL,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private auth() { return { Authorization: 'Bearer ' + this.apiKey }; }

  async createVoice(file: Blob, name: string): Promise<string> {
    const form = new FormData();
    // 官方字段名 audio_sample（仅支持 multipart 文件，不接受 JSON body / 文件 ID / URL）
    form.append('audio_sample', file, 'reference.' + (file.type.split('/')[1] ?? 'wav'));
    form.append('name', name);

    return withTimeout('音色创建', this.timeoutMs, undefined, async signal => {
      const res = await this.fetchFn(this.baseUrl + '/v1/audio/voices', {
        method: 'POST', headers: this.auth(), body: form, signal,
      });
      if (!res.ok) throw new Error('音色创建失败（HTTP ' + res.status + '）：' + await res.text());
      const data = await res.json() as { id?: string };
      if (!data.id) throw new Error('音色创建失败：响应缺少 voice_id');
      return data.id;
    });
  }

  async synthesize(req: SynthRequest): Promise<Blob> {
    const body: Record<string, unknown> = {
      model: this.model,
      input: req.text,
      voice_id: req.voiceId,
      response_format: 'mp3',
    };
    if (req.language) body.language = LANGUAGE_MAP[req.language] ?? req.language;
    // 官方无 speed 参数；rate 用 expected_duration_sec（估算时长 / rate）表达
    if (req.rate && req.rate !== 1) {
      body.expected_duration_sec = Math.max(1, Math.round(estimateSeconds(req.text) / req.rate));
    }

    return withTimeout('语音合成', this.timeoutMs, req.signal, async signal => {
      const res = await this.fetchFn(this.baseUrl + '/v1/audio/speech', {
        method: 'POST',
        headers: { ...this.auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new Error('语音合成失败（HTTP ' + res.status + '）：' + await res.text());
      return res.blob();
    });
  }
}
