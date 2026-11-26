/** 锚点格式：epubcfi(/6/{2*chapter+2}!/4/2/1:{offset}) —— 结构化位置，改字号/换设备不漂 */
export function makeAnchor(chapter: number, offset: number): string {
  return 'epubcfi(/6/' + (2 * chapter + 2) + '!/4/2/1:' + offset + ')';
}

export interface ParsedAnchor {
  chapter: number;
  offset: number;
}

export function parseAnchor(anchor: string): ParsedAnchor | null {
  const match = anchor.match(/^epubcfi\(\/6\/(\d+)!\/4\/2\/1:(\d+)\)$/);
  if (!match) return null;
  return { chapter: (Number(match[1]) - 2) / 2, offset: Number(match[2]) };
}
