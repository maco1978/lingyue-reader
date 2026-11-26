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
declare module 'jsdom';
