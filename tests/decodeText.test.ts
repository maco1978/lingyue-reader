import { describe, it, expect } from 'vitest';
import { decodeText, DecodeError } from '../src/core/decodeText';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('识别 UTF-8 BOM 并去掉 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const input = new Uint8Array([...bom, ...utf8('第一章 起风')]);
    expect(decodeText(input)).toEqual({ text: '第一章 起风', encoding: 'utf-8' });
  });

  it('无 BOM 时按 UTF-8 解码', () => {
    expect(decodeText(utf8('你好世界'))).toEqual({ text: '你好世界', encoding: 'utf-8' });
  });

  it('严格模式下非法字节抛 DecodeError，不静默产出乱码', () => {
    // 0xff 0xfe 是 UTF-16LE BOM 前缀，不能用作非法样本；这里用无 BOM 且 UTF-8 / GB18030 严格解码均失败的字节
    expect(() => decodeText(new Uint8Array([0x80, 0x81]))).toThrow(DecodeError);
  });
});
