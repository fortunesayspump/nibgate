// Reuse the extension's exact page model, including its deterministic JEV
// decisions. Native hosted JEV remains a separate research/payment judgment.
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const require=createRequire(new URL('../extension/package.json',import.meta.url));
const {build}=require('esbuild');
const built=await build({metafile:true,absWorkingDir:fileURLToPath(new URL('..',import.meta.url)),entryPoints:['extension/src/content/page-model.ts'],outfile:'dr-nib/backend/src/privacy/creator-page-model.generated.js',bundle:true,platform:'node',format:'esm',target:'node22',external:['@mozilla/readability'],legalComments:'eof'});

const sources={};for(const file of Object.keys(built.metafile.inputs).sort())sources[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const generatedSha256=createHash('sha256').update(await readFile('dr-nib/backend/src/privacy/creator-page-model.generated.js')).digest('hex');
await writeFile('dr-nib/backend/src/privacy/creator-page-model.sources.json',JSON.stringify({sources,generatedSha256},null,2)+'\n');
