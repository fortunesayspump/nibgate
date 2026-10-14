import {describe,it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import {Document,Packer,Paragraph} from 'docx';
import {parseSource,MAX_SOURCE_BYTES} from './parse.js';

describe('private research source extraction',()=>{
  it('extracts actual PDF pages, Word paragraphs and workbook rows',async()=>{
    const pdf=new PDFDocument();const chunks=[];
    const bytes=new Promise((resolve,reject)=>{pdf.on('data',c=>chunks.push(c));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject)});
    pdf.text('Synthetic expense evidence: travel cost USD 125.50 for a research demonstration.');pdf.end();
    const out=await parseSource('evidence.pdf',await bytes);
    expect(out.pages).toBe(1);expect(out.text).toContain('[Page 1]');expect(out.text).toContain('125.50');
    const word=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Synthetic invoice: consulting USD 42.')]}]}));
    expect((await parseSource('invoice.docx',word)).text).toContain('consulting USD 42');
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Amount','Currency'],[42,'USD']]),'Costs');
    expect((await parseSource('costs.xlsx',XLSX.write(book,{type:'buffer',bookType:'xlsx'}))).text).toContain('[Costs, row 2]');
  });
  it('keeps currency totals separate, uses exact decimals, and flags duplicate rows without removing evidence',async()=>{
    const out=await parseSource('expenses.csv',Buffer.from('Date,Amount,Currency,Category\n2026-01-01,0.10,USD,Tools\n2026-01-01,0.20,USD,Tools\n2026-01-01,0.20,USD,Tools\n2026-01-02,4,EUR,Travel'));
    expect(out.text).toContain('Amount · USD: 0.5');
    expect(out.text).toContain('Amount · EUR: 4');
    expect(out.text).toContain('Amount · USD · Tools: 0.5');
    expect(out.text).toContain('Amount · EUR · Travel: 4');
    expect(out.text).toContain('1 repeated full rows');
    expect(out.text).toContain('row 5]');
    expect(out.text).toContain('"2026-01-01"');
    expect(out.text).not.toContain('46023');
    expect(out.text).toContain('not reconciled balances or an audit');
  });
  it('rejects oversized worksheet ranges before expanding rows',async()=>{
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Amount']]),'Huge');
    const zip=await JSZip.loadAsync(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
    const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
    zip.file('xl/worksheets/sheet1.xml',xml.replace(/<dimension ref="[^"]*"\/>/,'<dimension ref="A1:XFD1048576"/>'));
    const bytes=await zip.generateAsync({type:'nodebuffer'});
    await expect(parseSource('huge.xlsx',bytes)).rejects.toThrow(/5,000/);
  });
  it('rejects unsupported, empty, binary, over-limit and counterfeit PDF input',async()=>{
    await expect(parseSource('secret.exe',Buffer.from('x'))).rejects.toThrow(/Supported/);
    await expect(parseSource('empty.txt',Buffer.alloc(0))).rejects.toThrow(/nonempty/);
    await expect(parseSource('huge.txt',Buffer.alloc(MAX_SOURCE_BYTES+1))).rejects.toThrow(/2 MB/);
    await expect(parseSource('binary.txt',Buffer.from([0,1,2]))).rejects.toThrow(/UTF-8/);
    await expect(parseSource('fake.pdf',Buffer.from('not a PDF'))).rejects.toThrow(/valid PDF/);
  });
  it('warns explicitly when text exceeds the extraction window',async()=>{
    const out=await parseSource('long.md',Buffer.from('a'.repeat(100010)));
    expect(out.characters).toBe(100000);
    expect(out.truncated).toBe(true);
    expect(out.warnings[0]).toContain('100,000');
  });
});
