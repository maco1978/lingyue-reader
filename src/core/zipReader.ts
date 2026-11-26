import { unzipSync } from 'fflate';

export interface ZipSource {
  loadText(path: string): Promise<string | null>;
  loadBlob(path: string): Promise<Blob | null>;
  getSize(path: string): Promise<number>;
}

function normalize(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

/** 把整本 zip 解到内存，向 foliate-js 提供它所需的回调 */
export function makeZipSource(bytes: Uint8Array): ZipSource {
  const files = unzipSync(bytes);
  const decoder = new TextDecoder();
  const get = (path: string) => files[normalize(path)] ?? null;
  return {
    async loadText(path) {
      const f = get(path);
      return f ? decoder.decode(f) : null;
    },
    async loadBlob(path) {
      const f = get(path);
      return f ? new Blob([f as BlobPart]) : null;
    },
    async getSize(path) {
      return get(path)?.length ?? 0;
    },
  };
}
