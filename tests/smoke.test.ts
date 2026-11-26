import { describe, expect, it } from 'vitest';

describe('测试基线', () => {
  it('vitest 全局环境可用', () => {
    expect(1 + 1).toBe(2);
  });
});
