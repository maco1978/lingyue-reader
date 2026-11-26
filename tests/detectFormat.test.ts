import { describe, it, expect } from 'vitest';
import { detectFormat } from '../src/core/detectFormat';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('detectFormat', () => {
  it('按扩展名识别 txt', () => {
    expect(detectFormat('book.txt', bytes(0))).toBe('txt');
  });

  it('按扩展名识别 epub / azw3 / cbz', () => {
    expect(detectFormat('a.epub', bytes(0))).toBe('epub');
    expect(detectFormat('a.azw3', bytes(0))).toBe('azw3');
    expect(detectFormat('a.cbz', bytes(0))).toBe('cbz');
  });

  it('魔数兜底：无扩展名但 PDF 魔数识别为 pdf', () => {
    expect(detectFormat('noext', bytes(0x25, 0x50, 0x44, 0x46))).toBe('pdf');
  });

  it('魔数兜底：无扩展名的 PK zip 类归 unknown', () => {
    expect(detectFormat('noext', bytes(0x50, 0x4b, 0x03, 0x04))).toBe('unknown');
  });

  it('未知扩展名但魔数是 PK 时按 epub 处理', () => {
    expect(detectFormat('mystery.bin', bytes(0x50, 0x4b, 0x03, 0x04))).toBe('epub');
  });

  it('完全无法识别返回 unknown', () => {
    expect(detectFormat('mystery.bin', bytes(0x00, 0x01))).toBe('unknown');
  });
});
