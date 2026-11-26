/** 只备份应用数据键，不备份 API Key（密钥不进备份文件） */
export function collectBookData(store: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith('lingyue:') && !k.includes('api-key') && !k.includes('llm-config')) out[k] = v;
  }
  return out;
}

export function applyBookData(data: Record<string, string>, set: (k: string, v: string) => void): void {
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('lingyue:')) set(k, v);
  }
}
