import type { BookFormat } from './types';

const EXT_MAP: Record<string, BookFormat> = {
  epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw: 'azw3', azw3: 'azw3',
  txt: 'txt', fb2: 'fb2', docx: 'docx', rtf: 'rtf', html: 'html', htm: 'html',
  cbz: 'cbz', cbr: 'cbz',
};

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

export function detectFormat(fileName: string, bytes: Uint8Array): BookFormat {
  const dot = fileName.lastIndexOf('.');
  const hasExt = dot > -1 && dot < fileName.length - 1;
  const ext = hasExt ? fileName.slice(dot + 1).toLowerCase() : '';
  if (EXT_MAP[ext]) return EXT_MAP[ext];
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && hasExt) return 'epub'; // PK zip 类
  return 'unknown';
}
