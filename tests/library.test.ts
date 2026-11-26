import { describe, it, expect } from 'vitest';
import { library, memoryDriver } from '../src/core/library';
import type { BookMeta } from '../src/core/types';

const meta = (id: string, title = '测试书'): BookMeta => ({
  id, title, author: '作者甲', format: 'epub', presentation: 'original',
});
const bytes = new Uint8Array([1, 2, 3]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('library', () => {
  it('保存后可列出条目，且不把文件内容暴露给 UI', async () => {
    const lib = library(memoryDriver());
    const entry = await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 12 });
    expect(entry).toMatchObject({ id: 'a', fileName: 'a.epub', chapterCount: 12, size: 3 });
    expect('file' in entry).toBe(false);
    expect((await lib.list()).map(e => e.id)).toEqual(['a']);
  });

  it('重复导入同一本书不产生重复条目，保留首次加入时间', async () => {
    const lib = library(memoryDriver());
    const first = await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 12 });
    await sleep(5);
    const second = await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 12 });
    expect(await lib.list()).toHaveLength(1);
    expect(second.addedAt).toBe(first.addedAt);
    expect(second.lastOpenedAt).toBeGreaterThanOrEqual(first.lastOpenedAt);
  });

  it('按最近打开排序，touch 会把它提到最前', async () => {
    const lib = library(memoryDriver());
    await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 1 });
    await sleep(5);
    await lib.save({ fileName: 'b.epub', bytes, meta: meta('b'), chapterCount: 1 });
    expect((await lib.list()).map(e => e.id)).toEqual(['b', 'a']);

    await sleep(5);
    await lib.touch('a');
    expect((await lib.list()).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('open 返回原始文件名与字节；书不在时返回 null', async () => {
    const lib = library(memoryDriver());
    await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 1 });
    const opened = await lib.open('a');
    expect(opened?.fileName).toBe('a.epub');
    expect(Array.from(opened!.bytes)).toEqual([1, 2, 3]);
    expect(await lib.open('missing')).toBeNull();
  });

  it('remove 删除条目', async () => {
    const lib = library(memoryDriver());
    await lib.save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 1 });
    await lib.remove('a');
    expect(await lib.list()).toEqual([]);
    expect(await lib.open('a')).toBeNull();
  });

  it('写入失败给出人话错误并保留 cause', async () => {
    const failing = {
      ...memoryDriver(),
      put: async () => { throw new Error('QuotaExceededError'); },
    };
    let err: (Error & { cause?: unknown }) | undefined;
    try {
      await library(failing).save({ fileName: 'a.epub', bytes, meta: meta('a'), chapterCount: 1 });
    } catch (e) {
      err = e as Error & { cause?: unknown };
    }
    expect(err?.message).toContain('本地书库空间不足');
    expect(err?.cause).toBeInstanceOf(Error);
  });
});
