import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAYER_SETTINGS, normalizePlayerSettings } from '../src/core/playerSettings';

describe('playerSettings', () => {
  it('脏数据逐字段收敛到合法范围', () => {
    expect(normalizePlayerSettings({ rate: 99, voiceId: 5 })).toEqual({ rate: 3, voiceId: '' });
    expect(normalizePlayerSettings({ rate: 0.1, voiceId: 'v1' })).toEqual({ rate: 0.5, voiceId: 'v1' });
    expect(normalizePlayerSettings({ rate: 1.26 })).toEqual({ rate: 1.3, voiceId: '' });
  });

  it('缺省或非对象输入回落到默认值', () => {
    expect(normalizePlayerSettings(null)).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(normalizePlayerSettings('随便什么')).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(normalizePlayerSettings({})).toEqual(DEFAULT_PLAYER_SETTINGS);
  });
});
