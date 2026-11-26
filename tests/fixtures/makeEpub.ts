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
