import { describe, it, expect } from 'vitest';
import { collectBookData, applyBookData } from '../src/ui/backup';

describe('书库备份', () => {
  it('收集与还原 lingyue:* 数据', () => {
    const data = { 'lingyue:voices': '[]', 'lingyue:moss-api-key': 'k' };
    const collected = collectBookData(data);
    expect(collected['lingyue:voices']).toBe('[]');
    const target: Record<string, string> = {};
    applyBookData(collected, (k, v) => { target[k] = v; });
    expect(target['lingyue:voices']).toBe('[]');
  });
});
