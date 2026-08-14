// Battery entry: node stress/run.js [--batch n] [--only id1,id2] [--skip id...] [--groups g1,g2]
const path = require('path');
const fs = require('fs');
const { runAll } = require('./runner.js');

const args = process.argv.slice(2);
const opt = (flag, def = '') => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const has = (flag) => args.includes(flag);

let batches = [];
const dir = __dirname;
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith('checks-batch'))) {
  batches.push(require(path.join(dir, f)));
}
batches = batches.sort((a, b) => a.name.localeCompare(b.name));

const opts = {
  only: opt('--only', '').split(',').filter(Boolean),
  skip: opt('--skip', '').split(',').filter(Boolean),
  groups: opt('--groups', '').split(',').filter(Boolean),
};

if (has('--list')) { for (const b of batches) { console.log(`\n## ${b.name}`); for (const c of b.checks) console.log(`  ${c.id}  ${c.name}`); } process.exit(0); }

runAll(batches, opts).then((s) => {
  console.log(`\nDONE. exit code: ${s.fail + s.error > 0 ? 1 : 0}`);
  process.exit(s.fail + s.error > 0 ? 1 : 0);
}).catch((e) => { console.error('BATTERY CRASH', e); process.exit(2); });