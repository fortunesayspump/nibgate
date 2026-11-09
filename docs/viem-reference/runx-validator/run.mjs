import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const commit=process.env.RUNX_INPUT_COMMIT;
if(commit!=='e6e0c1bef949fbdc837662fbd41ebe739ccae030') throw Error('Unrecognized upstream source commit');
const run=(cmd,args)=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
run('npm',['run','build']);
run('npm',['test']);
const validation=JSON.parse(readFileSync(resolve(root,'evidence/validation.json'),'utf8'));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const hash=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
process.stdout.write(JSON.stringify({
  ...validation,
  runxVersion:run(resolve(root,'node_modules/.bin/runx'),['--version']).trim(),
  sourceyVersion:pkg.devDependencies.sourcey,
  inventorySha256:hash('inventory.json'),
  buildHashesSha256:hash('evidence/build-hashes.json'),
  generatorSha256:hash('scripts/generate.mjs'),
  sourceyConfigSha256:hash('sourcey.config.ts'),
  upstreamLicenseSha256:hash('LICENSE.viem'),
})+'\n');
