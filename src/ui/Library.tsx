import React from 'react';
import type { LibraryEntry } from '../core/library';
import { clothOf } from './cover';

interface Props {
  entries: LibraryEntry[];
  /** 已读章节序号（0 起）；没有阅读记录时返回 undefined */
  progressOf: (id: string) => number | undefined;
  currentId?: string;
  /** 正在打开的书的 id */
  busyId?: string;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onImport: (file: File) => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3', txt: 'TXT', fb2: 'FB2',
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

/** 书架：书脊由标题与作者生成，不依赖封面图 */
export function Library({
  entries, progressOf, currentId, busyId, onOpen, onRemove, onImport, onExportBackup, onImportBackup,
}: Props) {
  return (
    <section className="shelf" aria-labelledby="shelf-title">
      <header className="shelf-head">
        <h1 id="shelf-title">书架</h1>
        <span className="shelf-count">{entries.length} 本</span>
      </header>

      {entries.length === 0 ? (
        <div className="empty">
          <p className="empty-title">书架还空着</p>
          <p>导入一本电子书开始阅读（支持 EPUB / MOBI / AZW3 / TXT / FB2）</p>
          <label className="btn btn-primary lingyue-file">
            导入图书
            <input
              type="file"
              accept=".epub,.mobi,.azw3,.txt,.fb2"
              className="lingyue-sr-only"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <p><small>图书保存在本机浏览器里，刷新或离线也能继续读。</small></p>
        </div>
      ) : (
        <ul className="shelf-grid">
          {entries.map(entry => {
            const read = progressOf(entry.id);
            const busy = busyId === entry.id;
            const chapterCount = Math.max(1, entry.chapterCount);
            const ratio = read === undefined ? 0 : Math.min(1, (read + 1) / chapterCount);
            const current = entry.id === currentId;
            return (
              <li key={entry.id} className="book">
                <button
                  className="book-cover"
                  style={{ '--cloth': clothOf(entry.id) } as React.CSSProperties}
                  onClick={() => onOpen(entry.id)}
                  disabled={busy}
                  aria-label={'打开《' + entry.meta.title + '》'}
                >
                  <span className="book-cover-slip">
                    <span className="book-cover-title">{entry.meta.title}</span>
                  </span>
                  <span className="book-cover-author">{entry.meta.author || '未知作者'}</span>
                  {ratio > 0 && (
                    <span className="book-cover-progress" aria-hidden="true">
                      <i style={{ width: (ratio * 100).toFixed(1) + '%' }} />
                    </span>
                  )}
                </button>

                <div className="book-info">
                  <h2>{entry.meta.title}</h2>
                  <p className="book-meta">
                    {entry.meta.author || '未知作者'}
                    {' / '}{FORMAT_LABEL[entry.meta.format] ?? entry.meta.format.toUpperCase()}
                    {' / 共 '}{entry.chapterCount}{' 章'}
                    <span className="book-size">{' / '}{formatSize(entry.size)}</span>
                  </p>
                  <div className="book-foot">
                    <span>
                      {busy ? '打开中…' : (
                        <>
                          {read !== undefined
                            ? '读到第 ' + Math.min(read + 1, chapterCount) + ' 章'
                            : current ? '' : '未开始'}
                          {current && <em className="book-current">正在读</em>}
                        </>
                      )}
                    </span>
                    <button
                      className="link-danger"
                      onClick={() => onRemove(entry.id)}
                      aria-label={'从书架删除《' + entry.meta.title + '》'}
                    >删除</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {onExportBackup && (
        <footer className="shelf-tools">
          <button onClick={onExportBackup}>备份阅读记录</button>
          {onImportBackup && (
            <label className="lingyue-file">
              恢复备份
              <input
                type="file"
                accept="application/json"
                className="lingyue-sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onImportBackup(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <span>备份只含阅读进度、划线与设置，不含图书文件</span>
        </footer>
      )}
    </section>
  );
}
