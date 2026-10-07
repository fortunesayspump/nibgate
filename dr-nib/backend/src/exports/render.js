// Export renderers — deliverables generated from finished work, never by
// re-running the research.
//
// Text formats are dependency-light: md (the raw report), json (the evidence
// packet: report + sources + claims + ledger state), bibtex (the cited
// sources as @misc entries). Binary formats are rendered here too:
//   - pdf    a dependency-free, text-only PDF (Helvetica, no compression)
//   - word   a minimal WordprocessingML package built with jszip
//   - excel  a real .xlsx workbook (SheetJS) with Report/Claims/Sources sheets
//   - powerpoint a minimal PresentationML deck (jszip), title + body slides
// Binary results are returned base64-encoded (`encoding: 'base64'`) so the
// JSON route can carry them without object storage; R2 streaming is a later
// optimization, not a correctness requirement.
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const TEXT_FORMATS = new Set(['md', 'json', 'bibtex']);
export const BINARY_FORMATS = new Set(['pdf', 'word', 'excel', 'powerpoint']);
export const RENDERABLE = new Set([...TEXT_FORMATS, ...BINARY_FORMATS]);
// Kept for compatibility with callers that special-cased not-yet-built
// formats. Empty now that every advertised format has a renderer.
export const PLANNED = new Set();

function bibKey(source, i) {
  const domain = String(source.domain || source.url || 'source').replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'source';
  const year = source.createdAt ? new Date(source.createdAt).getFullYear() : new Date().getFullYear();
  return `${domain}${year}_${i + 1}`;
}

function bibtex(sources) {
  const entries = (sources || []).map((s, i) => {
    const lines = [
      `@misc{${bibKey(s, i)},`,
      `  title = {${String(s.title || s.url || 'untitled').replace(/[{}]/g, '')}},`,
    ];
    if (s.url) lines.push(`  howpublished = {\\url{${s.url}}},`);
    lines.push(`  year = {${s.createdAt ? new Date(s.createdAt).getFullYear() : new Date().getFullYear()}},`);
    lines.push(`  note = {collected by Dr. Nib${s.trust != null ? `, trust ${s.trust}` : ''}}`);
    lines.push('}');
    return lines.join('\n');
  });
  return entries.join('\n\n') + (entries.length ? '\n' : '');
}

function packet({ report, sources, claims, ledger }) {
  return {
    version: report?.version ?? null,
    markdown: report?.markdown ?? null,
    citations: report?.citations ?? [],
    sources: (sources || []).map((s) => ({
      url: s.url, title: s.title, domain: s.domain,
      relevance: s.relevance ?? null, trust: s.trust ?? null,
    })),
    claims: (claims || []).map((c) => ({ text: c.text, status: c.status })),
    ledger: ledger || null,
    exportedAt: new Date().toISOString(),
  };
}

const xmlEscape = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const mdLines = (md) => String(md || '').replace(/\r\n?/g, '\n').split('\n');

// ── PDF ──────────────────────────────────────────────────────────────────
// A tiny, valid, uncompressed PDF: one Helvetica font, one content stream per
// page, a correct cross-reference table. Text-only (no images, no reflow);
// non-ASCII characters fall back to '?' rather than corrupting the stream.
function pdfEscape(s) {
  return String(s)
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(lines) {
  const perPage = 45;
  const chunks = [];
  const src = lines.length ? lines : [''];
  for (let i = 0; i < src.length; i += perPage) chunks.push(src.slice(i, i + perPage));

  const objects = [];
  const pageNums = [];
  let next = 4;
  const pages = chunks.map((chunk) => {
    const pageNum = next++;
    const contentNum = next++;
    pageNums.push(pageNum);
    const text = chunk.map((l) => `(${pdfEscape(l)}) Tj T*`).join('\n');
    const stream = `BT\n/F1 11 Tf\n54 738 Td\n15 TL\n${text}\nET`;
    return { pageNum, contentNum, stream };
  });

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const p of pages) {
    objects[p.pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${p.contentNum} 0 R >>`;
    objects[p.contentNum] = `<< /Length ${Buffer.byteLength(p.stream, 'latin1')} >>\nstream\n${p.stream}\nendstream`;
  }

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out, 'latin1');
  const count = objects.length;
  out += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

// ── Word (.docx) ─────────────────────────────────────────────────────────
async function buildDocx(lines) {
  const paragraphs = lines
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`)
    .join('');
  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rels);
  zip.folder('word').file('document.xml', document);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Excel (.xlsx) ────────────────────────────────────────────────────────
function buildXlsx({ report, sources, claims, ledger }) {
  const wb = XLSX.utils.book_new();
  const reportSheet = XLSX.utils.aoa_to_sheet([
    ['Dr. Nib report', `v${report?.version ?? ''}`],
    ['Exported', new Date().toISOString()],
    [],
    ...mdLines(report?.markdown).map((l) => [l]),
  ]);
  XLSX.utils.book_append_sheet(wb, reportSheet, 'Report');
  const claimSheet = XLSX.utils.json_to_sheet(
    (claims || []).map((c) => ({ claim: c.text, status: c.status })),
  );
  XLSX.utils.book_append_sheet(wb, claimSheet, 'Claims');
  const sourceSheet = XLSX.utils.json_to_sheet(
    (sources || []).map((s) => ({ title: s.title, url: s.url, domain: s.domain, relevance: s.relevance ?? '', trust: s.trust ?? '' })),
  );
  XLSX.utils.book_append_sheet(wb, sourceSheet, 'Sources');
  const ledgerSheet = XLSX.utils.json_to_sheet([ledger || {}]);
  XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── PowerPoint (.pptx) ───────────────────────────────────────────────────
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function pptShapeTree(children) {
  return '<p:spTree>'
    + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + children
    + '</p:spTree>';
}

function titleShape(text) {
  return '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>'
    + '<p:txBody><a:bodyPr/><a:lstStyle/>'
    + `<a:p><a:r><a:rPr lang="en-US"/><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`
    + '</p:txBody></p:sp>';
}

function bodyShape(lines) {
  const paras = [''].concat(lines).map((l) => (
    l === ''
      ? '<a:p/>'
      : `<a:p><a:r><a:rPr lang="en-US"/><a:t>${xmlEscape(l)}</a:t></a:r></a:p>`
  )).join('');
  return '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>'
    + `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

function slideXml(title, lines) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">`
    + `<p:cSld>${pptShapeTree(titleShape(title) + bodyShape(lines))}</p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}

function themeXml() {
  const accent = (n, hex) => `<a:accent${n}><a:srgbClr val="${hex}"/></a:accent${n}>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<a:theme xmlns:a="${A_NS}" name="Office Theme"><a:themeElements>`
    + '<a:clrScheme name="Office">'
    + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
    + '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
    + '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
    + accent(1, '4472C4') + accent(2, 'ED7D31') + accent(3, 'A5A5A5')
    + accent(4, 'FFC000') + accent(5, '5B9BD5') + accent(6, '70AD47')
    + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>'
    + '</a:clrScheme>'
    + '<a:fontScheme name="Office">'
    + '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>'
    + '</a:fontScheme>'
    + '<a:fmtScheme name="Office">'
    + '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    + '<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>'
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
    + '</a:fmtScheme></a:themeElements></a:theme>';
}

async function buildPptx(title, lines) {
  const perSlide = 12;
  const chunks = [];
  const src = lines.length ? lines : [''];
  for (let i = 0; i < src.length; i += perSlide) chunks.push(src.slice(i, i + perSlide));
  const slideCount = chunks.length;

  // rId1 = slide master (presentation rels); slides start at rId2.
  const slideRelIds = chunks.map((_, i) => `rId${i + 2}`);
  const presentation = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + '<p:sldIdLst>'
    + chunks.map((_, i) => `<p:sldId id="${256 + i}" r:id="${slideRelIds[i]}"/>`).join('')
    + '</p:sldIdLst>'
    + '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
    + '</p:presentation>';

  const presentationRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    + chunks.map((_, i) => `<Relationship Id="${slideRelIds[i]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')
    + '</Relationships>';

  const clrMap = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
  const master = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">`
    + `<p:cSld>${pptShapeTree(titleShape('Title') + bodyShape(['Body']))}</p:cSld>`
    + `<p:clrMap ${clrMap}/>`
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    + '</p:sldMaster>';

  const masterRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
    + '</Relationships>';

  const layout = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="titleAndContent" preserve="1">`
    + `<p:cSld name="Title and Content">${pptShapeTree(titleShape('Title') + bodyShape(['Body']))}</p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

  const layoutRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
    + '</Relationships>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
    + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
    + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    + chunks.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
    + '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
    + '</Relationships>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rootRels);
  zip.folder('ppt').file('presentation.xml', presentation);
  zip.folder('ppt').folder('_rels').file('presentation.xml.rels', presentationRels);
  zip.folder('ppt').folder('slideMasters').file('slideMaster1.xml', master);
  zip.folder('ppt').folder('slideMasters').folder('_rels').file('slideMaster1.xml.rels', masterRels);
  zip.folder('ppt').folder('slideLayouts').file('slideLayout1.xml', layout);
  zip.folder('ppt').folder('slideLayouts').folder('_rels').file('slideLayout1.xml.rels', layoutRels);
  zip.folder('ppt').folder('theme').file('theme1.xml', themeXml());
  chunks.forEach((chunk, i) => {
    const heading = i === 0 ? title : `${title} (cont.)`;
    zip.folder('ppt').folder('slides').file(`slide${i + 1}.xml`, slideXml(heading, chunk));
    zip.folder('ppt').folder('slides').folder('_rels').file(`slide${i + 1}.xml.rels`,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
      + '</Relationships>');
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Render a finished report. Async because the OOXML packages are zipped.
 * Text formats return a string; binary formats return a base64 string with
 * `encoding: 'base64'` and a `bytes` size.
 * @returns {{contentType:string, filename:string, content:string, encoding?:string, bytes:number}}
 */
export async function renderExport(format, ctx) {
  const { report, sources, claims, ledger, slug = 'report' } = ctx;
  if (format === 'md') {
    const content = report?.markdown || '';
    return { contentType: 'text/markdown', filename: `${slug}.md`, content, bytes: Buffer.byteLength(content) };
  }
  if (format === 'json') {
    const content = JSON.stringify(packet(ctx), null, 2);
    return { contentType: 'application/json', filename: `${slug}.json`, content, bytes: Buffer.byteLength(content) };
  }
  if (format === 'bibtex') {
    const content = bibtex(sources);
    return { contentType: 'application/x-bibtex', filename: `${slug}.bib`, content, bytes: Buffer.byteLength(content) };
  }
  const lines = mdLines(report?.markdown);
  if (format === 'pdf') {
    const buf = buildPdf(lines);
    return { contentType: 'application/pdf', filename: `${slug}.pdf`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'excel') {
    const buf = buildXlsx({ report, sources, claims, ledger });
    return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${slug}.xlsx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'word') {
    const buf = await buildDocx(lines);
    return { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${slug}.docx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'powerpoint') {
    const title = (lines.find((l) => l.trim()) || 'Dr. Nib report').replace(/^#+\s*/, '').slice(0, 80);
    const buf = await buildPptx(title, lines);
    return { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', filename: `${slug}.pptx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  throw new Error(`no renderer for format: ${format}`);
}