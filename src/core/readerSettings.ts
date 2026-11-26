export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans';

/** 阅读设置是全局偏好（不跟书走），换书不重置 */
export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: ReaderFont;
  theme: ReaderTheme;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: 'sans',
  theme: 'light',
};

export const FONT_SIZE_RANGE = { min: 14, max: 32, step: 1 } as const;
export const LINE_HEIGHT_RANGE = { min: 1.2, max: 2.4, step: 0.1 } as const;

const KEY = 'lingyue:reader-settings';

export const THEMES: Record<ReaderTheme, { label: string; background: string; color: string }> = {
  light: { label: '浅色', background: '#ffffff', color: '#1a1a1a' },
  sepia: { label: '米黄', background: '#f6ecd9', color: '#3a2f1f' },
  dark: { label: '深色', background: '#1b1b1d', color: '#d6d6d6' },
};

export const FONT_STACK: Record<ReaderFont, string> = {
  serif: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
  sans: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  // 保留一位小数：行高是 1.2–2.4 的小数步进
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}

/** 存储里的设置可能是旧版本或脏数据：逐字段收敛到合法范围 */
export function normalizeSettings(value: unknown): ReaderSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ReaderSettings>;
  return {
    fontSize: clampNumber(raw.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, DEFAULT_SETTINGS.fontSize),
    lineHeight: clampNumber(raw.lineHeight, LINE_HEIGHT_RANGE.min, LINE_HEIGHT_RANGE.max, DEFAULT_SETTINGS.lineHeight),
    fontFamily: raw.fontFamily === 'serif' ? 'serif' : 'sans',
    theme: raw.theme === 'sepia' || raw.theme === 'dark' ? raw.theme : 'light',
  };
}

export function loadSettings(): ReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 写不进去只影响下次启动的默认值，不打断阅读
  }
}

/**
 * 注入原版章节 iframe 的样式。书内 CSS 会设 body 样式，
 * 用户设置必须用 !important 且后注入才能稳定生效。
 */
export function speakingBackground(theme: ReaderTheme): string {
  return theme === 'dark' ? 'rgba(224, 138, 117, .22)' : 'rgba(163, 61, 43, .14)';
}

export function speakingAccent(theme: ReaderTheme): string {
  return theme === 'dark' ? '#e08a75' : '#a33d2b';
}

export function readerCss(settings: ReaderSettings): string {
  const theme = THEMES[settings.theme];
  return [
    `html { background: ${theme.background} !important; }`,
    [
      'body {',
      `  background: ${theme.background} !important;`,
      `  color: ${theme.color} !important;`,
      `  font-size: ${settings.fontSize}px !important;`,
      `  line-height: ${settings.lineHeight} !important;`,
      `  font-family: ${FONT_STACK[settings.fontFamily]} !important;`,
      '}',
    ].join('\n'),
    // 高亮底是浅黄，文字固定用深色，深色主题下才不会出现浅底浅字
    'mark.lingyue-highlight { background: #ffe066; color: #1a1a1a; }',
    // 边听边看：当前朗读段用朱色底衬 + 下边线，和划线区分开
    `mark.lingyue-speaking { background: ${speakingBackground(settings.theme)}; box-shadow: inset 0 -2px 0 ${speakingAccent(settings.theme)}; color: inherit; }`,
    ':focus-visible { outline: 2px solid #4a90d9; outline-offset: 2px; }',
    // 书内的动效也遵守系统的「减少动态效果」
    '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }',
  ].join('\n');
}
