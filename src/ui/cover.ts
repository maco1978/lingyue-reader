/** 布面书脊配色：书架与听书封面共用，按书 id 稳定取色 */
export const CLOTH = [
  'var(--cloth-1)', 'var(--cloth-2)', 'var(--cloth-3)',
  'var(--cloth-4)', 'var(--cloth-5)', 'var(--cloth-6)',
  'var(--cloth-7)', 'var(--cloth-8)', 'var(--cloth-9)',
];

export function clothOf(id: string): string {
  // djb2：比 h*31 在短 id 上分布更散，减少相邻书目撞色
  let hash = 5381;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0;
  return CLOTH[hash % CLOTH.length];
}
