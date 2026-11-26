import { detectFormat } from './detectFormat';
import { buildTxtBook } from './reflowTxt';
import { buildEpubBook } from './epubAdapter';
import { buildMobiBook } from './mobiAdapter';
import { buildFb2Book } from './fb2Adapter';
import type { Book } from './types';

/** 判断一条错误是否已经是我们给用户的人话，避免二次包装 */
function isFriendlyError(e: unknown): boolean {
  return e instanceof Error && /无法识别这本书的格式|无法打开|不支持/.test(e.message);
}

/**
 * 格式分诊门面：上层只调用它，不关心书是什么格式。
 * 适配器抛出的任何原始错误（含 unzipSync 对损坏 zip 的同步 throw）
 * 都在这里收敛为人话，绝不向上层泄漏英文堆栈。
 */
export async function openBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  try {
    const format = detectFormat(fileName, bytes);
    switch (format) {
      case 'txt':
        return await buildTxtBook(fileName, bytes);
      case 'epub':
      case 'pdf':
        return await buildEpubBook(fileName, bytes);
      case 'mobi':
      case 'azw3':
        return await buildMobiBook(fileName, bytes);
      case 'fb2':
        return await buildFb2Book(fileName, bytes);
      case 'cbz':
        throw new Error('漫画格式将在绘本模式支持，当前版本暂不开放');
      default:
        throw new Error('无法识别这本书的格式，请导入 EPUB / MOBI / AZW3 / TXT / FB2');
    }
  } catch (e) {
    if (isFriendlyError(e)) throw e;
    throw new Error('无法打开《' + fileName + '》：文件可能已损坏或受加密保护');
  }
}
