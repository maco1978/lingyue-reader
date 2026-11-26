export type BookFormat =
  | 'epub' | 'pdf' | 'mobi' | 'azw3'
  | 'txt' | 'fb2' | 'docx' | 'rtf' | 'html' | 'cbz' | 'unknown';

/** 书籍的呈现方式：原版保留版式，重排为纯文字，图版为固定布局 */
export type Presentation = 'original' | 'reflowed' | 'fixed';

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  presentation: Presentation;
  /** 诊断用：TXT 的实际编码 */
  encoding?: string;
}

export interface Chapter {
  index: number;
  title: string;
  /** 章节正文（XHTML 片段或纯文本，由呈现方式决定）。TTS/搜索等文本消费方只读它 */
  html: string;
  /** foliate 返回的真实 CFI 基址；重排/TXT 书没有此字段 */
  cfi?: string;
  /**
   * 原版呈现专用：按需取「整章文档」的 URL。格式层已把样式、图片等资源重写成 blob: URL，
   * 渲染时放进 iframe 才能既还原版式、又不让书内 CSS 污染应用界面。
   * 重排书没有此字段，阅读页回退到 html 片段。
   */
  loadDoc?: () => Promise<string | null>;
}

/**
 * 全系统唯一的书模型。格式层产出它，阅读/听书/搭子消费它。
 * spine 是有序章节列表；toc 是 标题→章节序号 的索引。
 */
export interface Book {
  meta: BookMeta;
  spine: Chapter[];
  toc: { title: string; index: number }[];
  /** 释放格式层持有的资源（如原版渲染用的 blob: URL）；换书时调用 */
  dispose?: () => void;
}

export interface BookProgress {
  bookId: string;
  chapterIndex: number;
  /** CFI 风格锚点，例如 epubcfi(/6/4!/4/2/1:5)；禁止用百分比 */
  anchor: string;
  updatedAt: number;
}

export interface Annotation {
  id: string;
  bookId: string;
  anchor: string;
  quote: string;
  note: string;
  createdAt: number;
}

/** 书级状态：进度 + 划线 + 听书位置 + 聊天史，都挂在同一本书下 */
export interface BookState {
  progress?: BookProgress;
  annotations: Annotation[];
  audioPosition?: { chapterIndex: number; anchor: string };
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
}

/** 持久化适配器：测试注入内存实现，生产注入 localStorage / 文件系统 */
export interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  /** 可选：删除一个键（从书库删除图书时清理它的阅读状态） */
  remove?(key: string): void;
}
