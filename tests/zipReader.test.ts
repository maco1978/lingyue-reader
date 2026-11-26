import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { makeZipSource } from '../src/core/zipReader';

describe('makeZipSource', () => {
  const bytes = zipSync({
    'META-INF/container.xml': strToU8('<container/>'),
    'OEBPS/ch1.xhtml': strToU8('<html><body>第一章</body></html>'),
  });

  it('loadText 按路径取回文本', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('OEBPS/ch1.xhtml')).toContain('第一章');
  });

  it('loadBlob 返回 Blob，getSize 返回字节数', async () => {
    const src = makeZipSource(bytes);
    const blob = await src.loadBlob('OEBPS/ch1.xhtml');
    expect(blob).toBeInstanceOf(Blob);
    expect(await src.getSize('OEBPS/ch1.xhtml')).toBeGreaterThan(0);
  });

  it('不存在的路径：loadText 返回 null，getSize 返回 0', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('nope.xhtml')).toBeNull();
    expect(await src.getSize('nope.xhtml')).toBe(0);
  });

  it('路径带 ./ 前缀时可归一化命中', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('./OEBPS/ch1.xhtml')).toContain('第一章');
  });
});
