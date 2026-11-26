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
  /** 章节正文（XHTML 片段或纯文本，由呈现方式决定） */
  html: string;
}

/**
 * 全系统唯一的书模型。格式层产出它，阅读/听书/搭子消费它。
 * spine 是有序章节列表；toc 是 标题→章节序号 的索引。
 */
export interface Book {
  meta: BookMeta;
  spine: Chapter[];
  toc: { title: string; index: number }[];
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
}
