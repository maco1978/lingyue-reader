import { describe, it, expect } from 'vitest';
import { voiceCards } from '../src/core/tts/voiceCards';
import { memoryStorage } from '../src/core/bookStore';

describe('voiceCards', () => {
  it('新库为空', () => {
    expect(voiceCards(memoryStorage()).list()).toEqual([]);
  });

  it('保存音色卡后可读回，字段完整', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    expect(cards.list()[0]).toEqual({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
  });

  it('存储损坏时自愈：list 返回空数组且 save 可恢复', () => {
    const storage = memoryStorage();
    storage.set('lingyue:voices', '{bad json');
    const cards = voiceCards(storage);
    expect(cards.list()).toEqual([]);
    cards.save({ id: 'v2', name: '角色', voiceId: 'voice-xyz', rate: 1.2, reference: 'designed' });
    expect(cards.list()).toEqual([{ id: 'v2', name: '角色', voiceId: 'voice-xyz', rate: 1.2, reference: 'designed' }]);
  });

  it('删除音色卡', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    cards.remove('v1');
    expect(cards.list()).toEqual([]);
  });
});
