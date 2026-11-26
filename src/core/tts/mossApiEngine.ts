import type { TTSEngine, SynthRequest } from './types';

const DEFAULT_BASE = 'https://api.mosi.cn';
const DEFAULT_MODEL = 'moss-tts-1.5-flash';

/** MOSS 托管 API 适配器。fetch 通过构造器注入，测试可 mock。 */
export class MossApiEngine implements TTSEngine {
  constructor(
    private apiKey: string,
    private fetchFn: typeof fetch = fetch,
    private baseUrl: string = DEFAULT_BASE,
    private model: string = DEFAULT_MODEL,
  ) {}

  private auth() { return { Authorization: 'Bearer ' + this.apiKey }; }

  async createVoice(file: Blob, name: string): Promise<string> {
    const form = new FormData();
    form.append('file', file, 'reference.' + (file.type.split('/')[1] ?? 'wav'));
    form.append('name', name);
    const res = await this.fetchFn(this.baseUrl + '/v1/audio/voices', {
      method: 'POST', headers: this.auth(), body: form,
    });
    if (!res.ok) throw new Error('音色创建失败：' + await res.text());
    const data = await res.json() as { id?: string };
    if (!data.id) throw new Error('音色创建失败：响应缺少 voice_id');
    return data.id;
  }

  async synthesize(req: SynthRequest): Promise<Blob> {
    const body: Record<string, unknown> = {
      model: this.model,
      input: req.text,
      voice_id: req.voiceId,
      response_format: 'mp3',
    };
    if (req.language) body.language = req.language;
    if (req.rate && req.rate !== 1) body.speed = req.rate;
    const res = await this.fetchFn(this.baseUrl + '/v1/audio/speech', {
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) throw new Error('语音合成失败：' + await res.text());
    return res.blob();
  }
}
