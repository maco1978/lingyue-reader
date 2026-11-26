/** foliate-js 是无类型声明的纯 JS 模块（pinned 1.0.1），接口以FoliateBook 为准 */
declare module 'foliate-js/epub.js' {
  export class EPUB {
    constructor(options: Record<string, unknown>);
    init(): Promise<void>;
    sections: unknown[];
    toc: unknown;
    metadata: Record<string, unknown>;
    resources: unknown;
  }
}
declare module 'foliate-js/mobi.js' {
  export class MOBI {
    constructor(options: Record<string, unknown>);
    open(file: Blob): Promise<void>;
    init(): Promise<void>;
    sections: unknown[];
    toc: unknown;
    metadata: Record<string, unknown>;
  }
}

declare module 'foliate-js/fb2.js' {
  export const makeFB2: (blob: Blob) => Promise<unknown>;
}

declare module 'jsdom';
