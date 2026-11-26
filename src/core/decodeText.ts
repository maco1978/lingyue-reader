export class DecodeError extends Error {
  constructor(message = 'E_TXT_DECODE_FAILED') {
    super(message);
    this.name = 'DecodeError';
  }
}

export interface DecodedText {
  text: string;
  encoding: string;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function hasBom(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * 解码顺序：BOM 优先，其次严格 UTF-8，最后严格 GB18030。
 * 严格（fatal: true）是关键：猜错直接抛错，而不是产出一屏 U+FFFD 却看起来成功。
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (hasBom(bytes, UTF8_BOM)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (hasBom(bytes, UTF16LE_BOM)) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (hasBom(bytes, UTF16BE_BOM)) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }
  for (const enc of ['utf-8', 'gb18030']) {
    try {
      return { text: new TextDecoder(enc, { fatal: true }).decode(bytes), encoding: enc };
    } catch {
      // 试下一个编码
    }
  }
  throw new DecodeError();
}
