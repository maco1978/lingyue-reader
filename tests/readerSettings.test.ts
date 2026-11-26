import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, THEMES, normalizeSettings, readerCss } from '../src/core/readerSettings';

describe('readerSettings', () => {
  it('脏数据逐字段收敛到合法范围', () => {
    expect(normalizeSettings({ fontSize: 999, lineHeight: -1, fontFamily: 'comic', theme: 'neon' })).toEqual({
      fontSize: 32, lineHeight: 1.2, fontFamily: 'sans', theme: 'light',
    });
    expect(normalizeSettings({ fontSize: 16, lineHeight: 2, fontFamily: 'serif', theme: 'dark' })).toEqual({
      fontSize: 16, lineHeight: 2, fontFamily: 'serif', theme: 'dark',
    });
  });

  it('缺省或非对象输入回落到默认值', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('随便什么')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('注入 iframe 的样式包含主题色、字号、行高与划线样式', () => {
    const css = readerCss({ fontSize: 20, lineHeight: 1.6, fontFamily: 'serif', theme: 'sepia' });
    expect(css).toContain(THEMES.sepia.background);
    expect(css).toContain(THEMES.sepia.color);
    expect(css).toContain('font-size: 20px !important');
    expect(css).toContain('line-height: 1.6 !important');
    expect(css).toContain('mark.lingyue-highlight');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain(':focus-visible');
  });
});
