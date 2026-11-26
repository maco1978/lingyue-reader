import { describe, it, expect } from 'vitest';
import { voiceCards, memoryStorage } from '../src/core/tts/voiceCards';

describe('voiceCards', () => {
  it('新库为空', () => {
    expect(voiceCards(memoryStorage()).list()).toEqual([]);
  });

  it('保存音色卡后可读回，字段完整', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    expect(cards.list()[0]).toEqual({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
  });

  it('删除音色卡', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    cards.remove('v1');
    expect(cards.list()).toEqual([]);
  });
});
