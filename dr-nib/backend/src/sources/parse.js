import path from 'node:path';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Prisma } from '@prisma/client';

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 100000;
export const SOURCE_EXTENSIONS = ['.pdf','.docx','.xlsx','.csv','.txt','.md'];

async function checkArchive(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 2000 || entries.reduce((n,f)=>n+(f._data?.uncompressedSize || 0),0)>20*1024*1024) throw new Error('Document expands beyond the 20 MB processing limit.');
}

export function tableEvidence(rows, sheet) {
  if (rows.length > 5001 || rows.some(r=>r.length>100)) throw new Error('Use at most 5,000 data rows and 100 columns per sheet.');
  const headers=(rows[0] || []).map(String);
  const currencyIndex=headers.findIndex(h=>/^currency$/i.test(h.trim()));
  const categoryIndex=headers.findIndex(h=>/^category$/i.test(h.trim()));
  const sums={},categorySums={};
  let duplicates=0;
  const seen=new Set();
  for (const row of rows.slice(1)) {
    const fingerprint=JSON.stringify(row);
    if(seen.has(fingerprint)) duplicates++; else seen.add(fingerprint);
    headers.forEach((h,i)=>{
      if(!/\b(amount|debit|credit|expense|cost|paid|revenue|income)\b/i.test(h)) return;
      const raw=String(row[i] ?? '').trim().replace(/,/g,'');
      if(!/^-?\d+(\.\d+)?$/.test(raw)) return;
      const key=`${h} · ${currencyIndex>=0 ? String(row[currencyIndex] || 'currency unspecified') : 'currency unspecified'}`;
      sums[key]=(sums[key] || new Prisma.Decimal(0)).plus(raw);
      if(categoryIndex>=0) {
        const category=String(row[categoryIndex] || 'category unspecified').trim().slice(0,80);
        const groupedKey=`${key} · ${category}`;
        categorySums[groupedKey]=(categorySums[groupedKey] || new Prisma.Decimal(0)).plus(raw);
      }
    });
  }
  const summary=`Sheet: ${sheet}; ${Math.max(0,rows.length-1)} data rows; ${duplicates} repeated full rows (not automatically removed).\nComputed column sums, grouped by the stated currency; these are not reconciled balances or an audit:\n${Object.entries(sums).map(([k,v])=>`${k}: ${v.toFixed()}`).join('\n') || '(no explicit numeric amount columns)'}${categoryIndex>=0?`\nComputed category sums (flagged duplicates still included):\n${Object.entries(categorySums).map(([k,v])=>`${k}: ${v.toFixed()}`).join('\n') || '(no numeric category amounts)'}`:''}`;
  return `${summary}\n\n${rows.map((r,i)=>`[${sheet}, row ${i+1}] ${JSON.stringify(r)}`).join('\n')}`;
}

export async function parseSource(name, buffer) {
  const ext=path.extname(String(name)).toLowerCase();
  if(!SOURCE_EXTENSIONS.includes(ext)) throw new Error('Supported files: PDF, DOCX, XLSX, CSV, TXT and Markdown.');
  if(!buffer.length || buffer.length>MAX_SOURCE_BYTES) throw new Error('Choose a nonempty file no larger than 2 MB.');
  let text='', pages=null;
  if(ext==='.pdf') {
    if(!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
    const {getDocumentProxy,extractText}=await import('unpdf');
    const pdf=await getDocumentProxy(new Uint8Array(buffer));
    try {
      if(pdf.numPages>100) throw new Error('PDFs are limited to 100 pages per file.');
      const out=await extractText(pdf,{mergePages:false});
      pages=out.totalPages;
      text=out.text.map((t,i)=>`[Page ${i+1}]\n${t}`).join('\n\n');
      if(out.text.join('').trim().length<30) throw new Error('No readable PDF text found. Scanned PDFs need OCR before uploading.');
    } finally {await pdf.loadingTask.destroy()}
  } else if(ext==='.docx') {
    await checkArchive(buffer);
    const {default:mammoth}=await import('mammoth');
    text=(await mammoth.extractRawText({buffer})).value;
  } else if(ext==='.csv' || ext==='.xlsx') {
    if(ext==='.xlsx') await checkArchive(buffer);
    // CSV has no cell types. SheetJS otherwise guesses ISO dates and exposes
    // Excel serials (for example 2026-10-02 -> 46297) to the research model.
    // Keep the user's literal values; numeric amount columns are parsed by
    // tableEvidence using Decimal after the rows are read.
    const book=XLSX.read(buffer,{type:'buffer',cellFormula:false,cellHTML:false,...(ext==='.csv'?{raw:true}:{})});
    if(book.SheetNames.length>10) throw new Error('Workbooks are limited to 10 sheets.');
    text=book.SheetNames.map(sheet=>{
      const worksheet=book.Sheets[sheet];
      if(worksheet['!ref']) {
        const range=XLSX.utils.decode_range(worksheet['!ref']);
        if(range.e.r>5000 || range.e.c>99) throw new Error('Use at most 5,000 data rows and 100 columns per sheet.');
      }
      return tableEvidence(XLSX.utils.sheet_to_json(worksheet,{header:1,defval:'',raw:true}),sheet);
    }).join('\n\n');
  } else {
    text=buffer.toString('utf8');
    if(text.includes('\u0000')) throw new Error('This file is not plain UTF-8 text.');
  }
  if(!text.trim()) throw new Error('No readable content was found.');
  const truncated=text.length>MAX_SOURCE_CHARS;
  return {text:text.slice(0,MAX_SOURCE_CHARS),pages,truncated,characters:Math.min(text.length,MAX_SOURCE_CHARS),warnings:truncated?['Only the first 100,000 extracted characters are included. Split the document for complete coverage.']:[]};
}
