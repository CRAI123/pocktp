/**
 * 读取 .docx 纯文本（无需第三方库）
 * docx 本质是 ZIP：解析中央目录找到 word/document.xml，deflate 解压后提取 <w:t> 文本
 */
export async function readDocxText(file) {
  const buf = await file.arrayBuffer();
  const dv = new DataView(buf);

  /* 找 ZIP 中央目录结束记录 EOCD */
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是标准 Word 文件');

  const cdCount = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(cdOff, true) !== 0x02014b50) break;
    const comp = dv.getUint16(cdOff + 10, true);
    const csize = dv.getUint32(cdOff + 20, true);
    const fnLen = dv.getUint16(cdOff + 28, true);
    const exLen = dv.getUint16(cdOff + 30, true);
    const cmLen = dv.getUint16(cdOff + 32, true);
    const pos = cdOff + 46;
    const name = new TextDecoder().decode(new Uint8Array(buf, pos, fnLen));
    entries.push({ name, comp, csize, lho: dv.getUint32(cdOff + 42, true) });
    cdOff += 46 + fnLen + exLen + cmLen;
  }

  const docEntry = entries.find(e => e.name === 'word/document.xml') || entries.find(e => e.name.endsWith('document.xml'));
  if (!docEntry) throw new Error('未找到正文内容');

  const lh = docEntry.lho;
  const fnLen = dv.getUint16(lh + 26, true);
  const exLen = dv.getUint16(lh + 28, true);
  const dataStart = lh + 30 + fnLen + exLen;
  const compBytes = new Uint8Array(buf, dataStart, docEntry.csize);

  let xml;
  if (docEntry.comp === 0) {
    xml = new TextDecoder().decode(compBytes);
  } else {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compBytes]).stream().pipeThrough(ds);
    xml = new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }

  const paras = xml.split('</w:p>');
  const lines = paras.map(p => {
    const ts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
    return decodeXml(ts);
  });
  return lines.join('\n');
}

/** 文本拆分：支持 | ｜ :: 分隔，只有一项时整行作为第一列 */
export function splitFields(line) {
  if (line.includes('|')) return line.split('|').map(s => s.trim());
  if (line.includes('｜')) return line.split('｜').map(s => s.trim());
  if (line.includes('::')) return line.split('::').map(s => s.trim());
  return [line.trim()];
}

/** 文本 → 非空行数组 */
export function textToLines(text) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
