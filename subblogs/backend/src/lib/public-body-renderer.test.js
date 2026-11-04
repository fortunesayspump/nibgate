const test=require('node:test');const assert=require('node:assert/strict');
const {renderPublicBody}=require('./public-body-renderer');
test('raw HTML is escaped, dangerous links are suppressed, and formatting survives',()=>{
 const r=renderPublicBody('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n**good**',{id:'p'});
 assert.ok(!r.html.includes('<script>'));assert.ok(!r.html.includes('href="javascript:'));assert.ok(r.html.includes('<strong>good</strong>'));
});
test('current source renders immediately and media stays on the creator origin',()=>{
 assert.equal(renderPublicBody('**Changed**',{id:'p'}).html,'<p><strong>Changed</strong></p>');
 assert.ok(renderPublicBody('![x](nibgate-embed://0)',{id:'p'}).html.includes('/api/nibgate/media/p/photo?index=0'));
 assert.throws(()=>renderPublicBody('x'.repeat(100001),{id:'p'}),/budget/);
});
