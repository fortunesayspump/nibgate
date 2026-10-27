import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Structural accessibility regressions supplement browser keyboard tests.
const page=readFileSync(new URL('../frontend/src/app/dr-nib/research/page.tsx',import.meta.url),'utf8');
const options=page.slice(page.indexOf('function renderOptions('),page.indexOf('if (phase === "composer" && availability === "preview")'));
const length=page.slice(page.indexOf('<legend className="text-sm font-medium">Report length'),page.indexOf('{length === "custom" ?'));
test('free and other answers have accessible names and visible focus',()=>{
 assert.match(options, /<textarea\s+aria-label=\{q.prompt\}/);
 assert.match(options, /aria-label=\{`Another answer: \$\{q.prompt\}`\}/);
 assert.doesNotMatch(options,/outline-none|autoFocus/);
 assert.match(options,/focus-visible:outline-2/);
});
test('answer choices use labeled native controls and checked semantics',()=>{
 assert.match(options, /<fieldset[^>]+aria-label=\{q.prompt\}/);
 assert.equal((options.match(/type=\{q.type === "pick_one" \? "radio" : "checkbox"\}/g)||[]).length,2);
 assert.match(options,/name=\{`drnib-answer-\$\{seq\}`\}/);
 assert.match(options,/checked=\{on\}/);
 assert.match(options,/checked=\{other\}/);
 assert.doesNotMatch(options,/<button/);
 assert.match(options,/focus-within:outline-2/);
});
test('multi-select Other does not visually uncheck selected standard choices',()=>{
 assert.match(options,/q.type !== "pick_one" \|\| !other/);
});
test('report length uses one native radio group, not pressed pseudo-radios',()=>{
 assert.match(length,/<label/);
 assert.match(length,/type="radio" name="drnib-report-length"/);
 assert.match(length,/checked=\{length === o.id\}/);
 assert.doesNotMatch(length,/aria-pressed|<button/);
});
test('output format toggles expose pressed state',()=>{
 assert.match(page,/<button key=\{f\} aria-pressed=\{formats.includes\(f\)\}/);
});
