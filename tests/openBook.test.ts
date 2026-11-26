import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub } from './fixtures/makeEpub';
import { openBook } from '../src/core/openBook';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as any).Blob = dom.window.Blob;
});

describe('openBook', () => {
  it('按格式分诊：epub 走原版适配器', async () => {
    const book = await openBook('测试书.epub', makeEpub());
    expect(book.meta.format).toBe('epub');
    expect(book.spine).toHaveLength(2);
  });

  it('未知格式给出人话错误', async () => {
    await expect(openBook('mystery.bin', new Uint8Array([0, 1]))).rejects.toThrow('无法识别这本书的格式');
  });

  it('损坏的加密书明确拒绝（不破解）', async () => {
    await expect(openBook('locked.azw3', new Uint8Array([0, 1, 2]))).rejects.toThrow();
  });

  it('损坏的 zip 不泄漏原始报错', async () => {
    await expect(openBook('坏书.epub', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).rejects.toThrow(
      '无法打开',
    );
    // 且错误信息是中文人话，不是英文原始堆栈
    let msg = '';
    await openBook('坏书.epub', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])).catch((e: Error) => (msg = e.message));
    expect(msg).not.toMatch(/invalid|unexpected|inflate/i);
  });
});
