/** 听书引擎：第一版 MossApiEngine，后续可加 NanoEngine */
export interface TTSEngine {
  /** 上传参考音频创建音色，返回 voice_id */
  createVoice(file: Blob, name: string): Promise<string>;
  /** 合成语音，返回音频 Blob */
  synthesize(req: SynthRequest): Promise<Blob>;
}

export interface SynthRequest {
  text: string;
  voiceId: string;
  rate?: number;
  language?: string;
  signal?: AbortSignal;
}

/** 音色卡：听书与绘本共用资产 */
export interface VoiceCard {
  id: string;
  name: string;
  voiceId: string;
  rate: number;
  /** 来源标记：upload=上传参考音频 / designed=文字设计 */
  reference: 'upload' | 'designed';
}
