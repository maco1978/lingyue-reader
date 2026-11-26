import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub } from './fixtures/makeEpub';
import { openBook, FriendlyError, isFriendlyError, wrapOpenError } from '../src/core/openBook';

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

  it('cbz 的人话错误原样透传，不被二次包装', async () => {
    await expect(openBook('a.cbz', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).rejects.toThrow(
      '漫画格式将在绘本模式支持',
    );
    let msg = '';
    await openBook('a.cbz', new Uint8Array([0x50, 0x4b, 0x03, 0x04])).catch((e: Error) => (msg = e.message));
    expect(msg).not.toContain('已损坏');
  });

  it('pdf 给出暂不开放的友好提示，而不是损坏书报错', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake pdf bytes');
    let msg = '';
    await openBook('a.pdf', bytes).catch((e: Error) => (msg = e.message));
    expect(msg).toContain('PDF 格式暂不开放');
    expect(msg).not.toContain('已损坏');
  });

  it('FriendlyError 结构化透传：cbz 原样抛出且能被 instanceof 识别', async () => {
    let err: unknown;
    await openBook('a.cbz', new Uint8Array([0x50, 0x4b, 0x03, 0x04])).catch(e => (err = e));
    expect(err).toBeInstanceOf(FriendlyError);
    expect((err as Error).message).toBe('漫画格式将在绘本模式支持，当前版本暂不开放');
    expect(isFriendlyError(err)).toBe(true);
    // 普通 Error 即使消息含「不支持」也不是 FriendlyError
    expect(isFriendlyError(new Error('此格式不支持'))).toBe(false);
  });

  it('适配器普通 Error 消息含「不支持」仍被包装（消息字符串不能旁路）', async () => {
    const wrapped = wrapOpenError('某书.fb2', new Error('此编码暂不支持'));
    expect(wrapped.message).toContain('无法打开《某书.fb2》');
    expect(wrapped.message).not.toContain('暂不支持');
  });

  it('损坏的 zip 保留 cause，方便诊断', async () => {
    await expect(openBook('坏书.epub', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).rejects.toMatchObject({
      cause: expect.any(Error),
    });
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
