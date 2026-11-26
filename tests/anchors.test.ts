import { describe, it, expect } from 'vitest';
import { makeAnchor, parseAnchor } from '../src/core/anchors';

describe('anchors', () => {
  it('构造 CFI 风格锚点并解析回章节序号', () => {
    const anchor = makeAnchor(4, 12);
    expect(anchor).toBe('epubcfi(/6/10!/4/2/1:12)');
    expect(parseAnchor(anchor)).toEqual({ chapter: 4, offset: 12 });
  });

  it('拒绝畸形锚点', () => {
    expect(parseAnchor('not-an-anchor')).toBeNull();
  });
});
