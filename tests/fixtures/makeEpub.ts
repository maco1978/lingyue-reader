import { zipSync, strToU8 } from 'fflate';

const CONTAINER = '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';

const OPF = '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试书</dc:title><dc:creator>作者甲</dc:creator><dc:identifier id="uid">test-001</dc:identifier><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>';

const NAV = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">第一章 起风</a></li><li><a href="ch2.xhtml">第二章 下雨</a></li></ol></nav></body></html>';

const CH1 = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 起风</h1><p>他站在门口。</p></body></html>';
const CH2 = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章 下雨</h1><p>雨下了起来。</p></body></html>';

/** 用 fflate 现场合成 EPUB，避免把版权书塞进仓库 */
export function makeEpub(): Uint8Array {
  return zipSync({
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(OPF),
    'OEBPS/nav.xhtml': strToU8(NAV),
    'OEBPS/ch1.xhtml': strToU8(CH1),
    'OEBPS/ch2.xhtml': strToU8(CH2),
  });
}

const OBFUSCATED_OPF = '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>混淆书</dc:title><dc:creator>作者甲</dc:creator><dc:identifier id="uid">test-001</dc:identifier><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="font" href="fonts/book.ttf" media-type="application/x-font-ttf"/></manifest><spine><itemref idref="c1"/></spine></package>';

// idpf 2008 字体混淆（foliate epub.js:585 会用 sha1(unique-identifier 的文本) 算密钥）
const ENCRYPTION = '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/book.ttf"/></enc:CipherData></enc:EncryptedData></encryption>';

/** 带 encryption.xml 字体混淆的 EPUB：验证 sha1 契约（string 进、Uint8Array 出） */
export function makeObfuscatedEpub(): Uint8Array {
  return zipSync({
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'META-INF/encryption.xml': strToU8(ENCRYPTION),
    'OEBPS/content.opf': strToU8(OBFUSCATED_OPF),
    'OEBPS/nav.xhtml': strToU8(NAV),
    'OEBPS/ch1.xhtml': strToU8(CH1),
    'OEBPS/fonts/book.ttf': strToU8('FAKE-FONT-BYTES'),
  });
}

// ---- 带插图与外部样式的 EPUB（验证原版渲染的资源重写） ----

const ILLUSTRATED_OPF = '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>插图测试书</dc:title><dc:creator>作者乙</dc:creator><dc:identifier id="uid">test-002</dc:identifier><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles/main.css" media-type="text/css"/><item id="pic" href="images/pic.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/></spine></package>';

const ILLUSTRATED_NAV = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">第一章 插图</a></li></ol></nav></body></html>';

// 章节在 text/ 下，样式与图片在兄弟目录：相对路径需要正确解析
const ILLUSTRATED_CH1 = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>插图章</title><link rel="stylesheet" type="text/css" href="../styles/main.css"/></head><body><h1>第一章 插图</h1><p>他站在门口。</p><img src="../images/pic.png" alt="插图"/></body></html>';

const ILLUSTRATED_CSS = 'h1 { background: url("../images/pic.png"); }';

/** 带外部样式表与图片的 EPUB：用于验证原版渲染把资源重写成 blob: URL */
export function makeIllustratedEpub(): Uint8Array {
  return zipSync({
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(ILLUSTRATED_OPF),
    'OEBPS/nav.xhtml': strToU8(ILLUSTRATED_NAV),
    'OEBPS/text/ch1.xhtml': strToU8(ILLUSTRATED_CH1),
    'OEBPS/styles/main.css': strToU8(ILLUSTRATED_CSS),
    'OEBPS/images/pic.png': strToU8('FAKE-PNG-BYTES'),
  });
}
