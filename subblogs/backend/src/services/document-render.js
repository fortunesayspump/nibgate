const ExcelJS = require('exceljs');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const WordExtractor = require('word-extractor');
const wordExtractor = new WordExtractor();
const { DOMParser } = require('@xmldom/xmldom');
const { Readable } = require('stream');
const { getBlob, decryptBytes, unpackCipherBlob } = require('@nibgate/sdk/server');

const PREVIEW_ROWS = 12;
const PREVIEW_COLS = 12;
const FULL_ROW_CAP = 500;
const PREVIEW_CHARS = 1600;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function docKindFor(post) {
  const name = String(post.documentName || '').toLowerCase();
  const mime = String(post.documentContentType || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'xlsx' || mime.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'xls' || mime === 'application/vnd.ms-excel') return 'legacy-excel';
  if (ext === 'ods' || mime.includes('opendocument.spreadsheet')) return 'ods';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === 'doc' || mime === 'application/msword') return 'legacy-word';
  if (ext === 'md' || mime === 'text/markdown') return 'markdown';
  if (ext === 'txt' || mime.startsWith('text/')) return 'text';
  return null;
}

async function documentBytesFor(post) {
  if (post.documentStorageRef && post.documentEncryptedKey) {
    const blob = await getBlob({ storageRef: post.documentStorageRef });
    const { iv, tag, ciphertext } = unpackCipherBlob(blob);
    return decryptBytes(Buffer.from(post.documentEncryptedKey, 'base64'), iv, tag, ciphertext);
  }
  if (post.documentUrl) {
    const res = await fetch(post.documentUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

function cellHtml(value) {
  return `<td>${escapeHtml(value)}</td>`;
}

function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function looksNumeric(value) {
  const v = String(value ?? '').trim();
  if (!v) return false;
  return /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?%?$/.test(v);
}

function sheetHtml(rows, { preview, totalRows, limit }) {
  const shown = rows.slice(0, limit);
  const maxCols = Math.min(PREVIEW_COLS, shown.reduce((m, r) => Math.max(m, r.length), 0));

  let html = '<div class="doc-sheet">';
  html += '<table>';
  html += '<thead><tr><th class="row-num corner"></th>';
  for (let c = 0; c < maxCols; c += 1) html += `<th>${colLetter(c)}</th>`;
  html += '</tr></thead>';
  html += '<tbody>';
  shown.forEach((row, r) => {
    html += `<tr${r === 0 ? ' class="head-row"' : ''}><th class="row-num">${r + 1}</th>`;
    for (let c = 0; c < maxCols; c += 1) {
      const value = row[c];
      const text = value && typeof value === 'object' && 'text' in value ? value.text : value;
      html += `<td${looksNumeric(text) ? ' class="num"' : ''}>${escapeHtml(text ?? '')}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  if (preview && totalRows > limit) {
    html += `<p class="doc-note">Previewing first ${limit} of ${totalRows} rows. Unlock to view the full file.</p>`;
  } else if (!preview && totalRows > FULL_ROW_CAP) {
    html += `<p class="doc-note">Showing first ${FULL_ROW_CAP} of ${totalRows} rows.</p>`;
  }
  html += '</div>';
  return html;
}

async function renderSpreadsheet(buffer, kind, preview) {
  const workbook = new ExcelJS.Workbook();
  if (kind === 'csv') {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { html: `<p>Empty spreadsheet.</p>` };

  const totalRows = worksheet.rowCount;
  const limit = preview ? PREVIEW_ROWS : Math.min(FULL_ROW_CAP, totalRows);
  const rows = (worksheet.getRows(1, Math.min(limit, totalRows)) || []).map((row) => {
    const values = row.values || [];
    return values.slice(1).map((cell) => (cell && typeof cell === 'object' && 'text' in cell ? cell.text : cell));
  });

  return { html: sheetHtml(rows, { preview, totalRows, limit }) };
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(node, localName) {
  const attrs = node.attributes || [];
  for (let i = 0; i < attrs.length; i += 1) {
    if (attrs[i].localName === localName) return attrs[i].value;
  }
  return null;
}

function collectByLocalName(root, localName) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node && node.nodeType === 1 && node.localName === localName) out.push(node);
    if (node && node.childNodes) {
      for (let i = node.childNodes.length - 1; i >= 0; i -= 1) stack.push(node.childNodes[i]);
    }
  }
  return out;
}

async function renderOds(buffer, preview) {
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.file('content.xml');
  if (!contentFile) return { html: '<p>Empty spreadsheet.</p>' };
  const xml = await contentFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  const rows = [];
  for (const row of collectByLocalName(doc, 'table-row')) {
    const rowCells = [];
    const cellNodes = [];
    for (let i = 0; i < (row.childNodes || []).length; i += 1) {
      const n = row.childNodes[i];
      if (n.nodeType === 1 && n.localName === 'table-cell') cellNodes.push(n);
    }
    for (const cell of cellNodes) {
      const repeat = parseInt(attr(cell, 'number-columns-repeated') || '1', 10) || 1;
      const value = (cell.textContent || '').replace(/\s+/g, ' ').trim() || attr(cell, 'value') || '';
      for (let i = 0; i < repeat; i += 1) rowCells.push(value);
    }
    const rowRepeat = parseInt(attr(row, 'number-rows-repeated') || '1', 10) || 1;
    for (let i = 0; i < rowRepeat; i += 1) rows.push(rowCells);
  }

  const totalRows = rows.length;
  const limit = preview ? PREVIEW_ROWS : Math.min(FULL_ROW_CAP, totalRows);

  return { html: sheetHtml(rows, { preview, totalRows, limit }) };
}

async function renderDocx(buffer, preview) {
  const result = await mammoth.convertToHtml({ buffer });
  if (preview) {
    const text = stripHtml(result.value).slice(0, PREVIEW_CHARS);
    return { html: `<div class="doc-preview"><p>${escapeHtml(text)}</p><p class="doc-note">Preview excerpt. Unlock to view the full document.</p></div>` };
  }
  return { html: `<div class="doc-docx">${result.value}</div>` };
}

async function renderLegacyWord(buffer, preview) {
  const doc = await wordExtractor.extract(buffer);
  const paragraphs = String(doc.getBody() || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  const text = paragraphs.join('\n');
  if (preview) {
    return { html: `<div class="doc-preview"><p>${escapeHtml(text.slice(0, PREVIEW_CHARS))}</p><p class="doc-note">Preview excerpt. Unlock to view the full document.</p></div>` };
  }
  return { html: `<div class="doc-docx">${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>` };
}

async function renderLegacyExcel(buffer, preview) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { html: '<p>Empty spreadsheet.</p>' };
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const totalRows = rows.length;
  const limit = preview ? PREVIEW_ROWS : Math.min(FULL_ROW_CAP, totalRows);
  return { html: sheetHtml(rows.slice(0, limit), { preview, totalRows, limit }) };
}

async function renderText(buffer, preview) {
  const text = buffer.toString('utf8');
  if (preview) {
    return { html: `<pre class="doc-text">${escapeHtml(text.slice(0, PREVIEW_CHARS))}</pre><p class="doc-note">Preview excerpt. Unlock to view the full document.</p>` };
  }
  return { html: `<pre class="doc-text">${escapeHtml(text)}</pre>` };
}

async function renderDocument(post, { preview }) {
  const kind = docKindFor(post);
  if (!kind) return { kind, html: null };
  if (kind === 'pdf') return { kind, html: null };
  const buffer = await documentBytesFor(post);
  if (!buffer) return { kind, html: null };

  if (kind === 'xlsx' || kind === 'csv') {
    return { kind, html: (await renderSpreadsheet(buffer, kind, preview)).html };
  }
  if (kind === 'ods') {
    return { kind, html: (await renderOds(buffer, preview)).html };
  }
  if (kind === 'docx') {
    return { kind, html: (await renderDocx(buffer, preview)).html };
  }
  if (kind === 'legacy-word') {
    return { kind, html: (await renderLegacyWord(buffer, preview)).html };
  }
  if (kind === 'legacy-excel') {
    return { kind, html: (await renderLegacyExcel(buffer, preview)).html };
  }
  if (kind === 'text' || kind === 'markdown') {
    return { kind, html: (await renderText(buffer, preview)).html };
  }
  return { kind, html: null };
}

module.exports = { docKindFor, documentBytesFor, renderDocument, renderSpreadsheet, renderOds, renderDocx, renderLegacyWord, renderLegacyExcel, renderText, escapeHtml };
