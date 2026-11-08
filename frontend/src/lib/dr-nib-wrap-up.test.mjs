import{test}from'node:test';import assert from'node:assert/strict';import{reportWrapUp,reportAtCompletion}from'./dr-nib-wrap-up.js';
test('closing message uses the actual conclusion, preserving citations and qualifications',()=>{
 const m='# Report\n## Summary\nInitial finding.\n## Findings\nEvidence.\n## Conclusion\nSupported result [1]. Vendor prices remain unknown.\n## References\n[1] source';
 assert.deepEqual(reportWrapUp(m),{title:'Conclusion',kind:'conclusion',markdown:'Supported result [1]. Vendor prices remain unknown.'});
});
test('summary is used only when no explicit conclusion exists',()=>{assert.equal(reportWrapUp('## Executive summary\nA sourced finding [2].\n## Methods\nMethod.').markdown,'A sourced finding [2].')});
test('no generated closing claim is fabricated for absent or empty sections',()=>{for(const m of [null,'# Report\nBody','## Conclusion\n## References\nSource'])assert.equal(reportWrapUp(m),null)});
test('fenced example headings do not become the research conclusion',()=>{assert.equal(reportWrapUp('```md\n## Conclusion\nFake example.\n```\n## Summary\nActual summary.' ).markdown,'Actual summary.')});
test('subsections are preserved and references stop the closing excerpt',()=>{assert.equal(reportWrapUp('## 5. Conclusions\nResult.\n### Limits\nA real limitation.\n## References\nSource').markdown,'Result.\n### Limits\nA real limitation.')});

test('reasoning prefixes cannot become the closing message',()=>{assert.equal(reportWrapUp('<think>## Conclusion\nInternal draft.</think>\n## Conclusion\nFinal sourced conclusion.').markdown,'Final sourced conclusion.');assert.equal(reportWrapUp('<think>## Conclusion\nUnfinished internal draft.'),null)});
test('older completion events never show a newer report conclusion',()=>{const a={version:1,createdAt:'2026-11-08T12:00:00Z',markdown:'v1'},b={version:2,createdAt:'2026-11-08T13:00:00Z',markdown:'v2'};assert.equal(reportAtCompletion([b,a],'2026-11-08T12:00:01Z'),a);assert.equal(reportAtCompletion([b,a],'2026-11-08T13:00:01Z'),b);assert.equal(reportAtCompletion([b],'2026-11-08T12:00:01Z'),null);assert.equal(reportAtCompletion([a],'invalid'),null)});
