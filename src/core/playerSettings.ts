/** 听书偏好：全局记忆，换书不重置。与阅读设置分开，听书和看书的偏好互不影响 */
export interface PlayerSettings {
  rate: number;
  voiceId: string;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = { rate: 1, voiceId: '' };

export const RATE_RANGE = { min: 0.5, max: 3, step: 0.1 } as const;

const KEY = 'lingyue:player-settings';

export function normalizePlayerSettings(value: unknown): PlayerSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<PlayerSettings>;
  const rate = typeof raw.rate === 'number' && Number.isFinite(raw.rate)
    ? Math.min(RATE_RANGE.max, Math.max(RATE_RANGE.min, Math.round(raw.rate * 10) / 10))
    : DEFAULT_PLAYER_SETTINGS.rate;
  return {
    rate,
    voiceId: typeof raw.voiceId === 'string' ? raw.voiceId : '',
  };
}

export function loadPlayerSettings(): PlayerSettings {
  if (typeof window === 'undefined') return DEFAULT_PLAYER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizePlayerSettings(JSON.parse(raw)) : DEFAULT_PLAYER_SETTINGS;
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function savePlayerSettings(settings: PlayerSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 写不进去只影响下次启动的默认值
  }
}
