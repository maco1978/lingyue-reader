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

  it('导出与导入都排除 API Key 与 LLM 配置（防注入）', () => {
    const data = {
      'lingyue:voices': '[]',
      'lingyue:moss-api-key': 'sk-secret',
      'lingyue:llm-config': '{"apiKey":"attacker"}',
    };
    const collected = collectBookData(data);
    expect(collected['lingyue:moss-api-key']).toBeUndefined();
    expect(collected['lingyue:llm-config']).toBeUndefined();

    const target: Record<string, string> = {};
    // 模拟被篡改的备份文件，尝试注入密钥与任意键
    applyBookData({ ...data, 'evil:key': 'x', 'lingyue:bad': 42 } as any, (k, v) => { target[k] = v; });
    expect(target['lingyue:voices']).toBe('[]');
    expect(target['lingyue:moss-api-key']).toBeUndefined();
    expect(target['lingyue:llm-config']).toBeUndefined();
    expect(target['evil:key']).toBeUndefined();
    expect(target['lingyue:bad']).toBeUndefined();
  });
});
