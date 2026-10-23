import ts from 'typescript';
import {readFileSync as read, writeFileSync as write, mkdirSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('../..');
const commit='345fc04b984f01366cbe2a9f4064f22268d5d3f6';
const base=`https://github.com/fortunesayspump/nibgate/blob/${commit}/`;
const typesPath='packages/nibgate/src/index.d.ts';
const types=read(resolve(root,typesPath),'utf8');
const ast=ts.createSourceFile(typesPath,types,ts.ScriptTarget.Latest,true);
const client=ast.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='NibgateClient');
const methods=client.type.members.filter(ts.isMethodSignature);
const notes=JSON.parse(read('api-notes.json','utf8'));
const pinnedHashes=JSON.parse(read('pinned-source-hashes.json','utf8'));
if(methods.length!==28 || notes.length!==28) throw Error('Review changed API coverage');
const clientPath='packages/nibgate/src/browser/client.js';
const clientText=read(resolve(root,clientPath),'utf8');
const ca=ts.createSourceFile(clientPath,clientText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const impl=new Map();
function visit(n){if(ts.isObjectLiteralExpression(n))for(const p of n.properties){const name=p.name?.getText(ca);if(name&&methods.some(m=>m.name.getText(ast)===name))impl.set(name,p);}ts.forEachChild(n,visit);}visit(ca);
if(impl.size!==27 || impl.has('validateResourceMetadata')) throw Error('Review runtime surface drift');
const hashes={};
function source(path){const text=read(resolve(root,path),'utf8');const digest=createHash('sha256').update(text).digest('hex');if(pinnedHashes[path]!==digest)throw Error(`Source differs from pinned SHA-256 manifest: ${path}`);hashes[path]=digest;return text;}
source(typesPath);source(clientPath);source('packages/nibgate/package.json');
mkdirSync('pages',{recursive:true});mkdirSync('pages/api',{recursive:true});
const inventory=[];
let examples=`// Generated documentation examples. Payment/provider callbacks are supplied by the integrating app.\nimport { createNibgate, validateResourceMetadata } from '../../packages/nibgate/src/index.js';\nimport type { NibgateCheckoutHandler, NibgateEvmTypedDataSigner, NibgateEvmGatewayProvider } from '../../packages/nibgate/src/index.js';\nconst client = createNibgate();\nconst resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };\ndeclare const verifiedPaymentSignature: string;\ndeclare const walletCheckout: NibgateCheckoutHandler;\ndeclare const signer: NibgateEvmTypedDataSigner;\ndeclare const provider: NibgateEvmGatewayProvider;\ndeclare const sendTransfer: (input: unknown) => Promise<{ txHash: string }>;\ndeclare const signOwnership: (input: unknown) => Promise<string>;\n`;
for(const m of methods){const name=m.name.getText(ast);const note=notes.find(n=>n.name===name);if(!note)throw Error(name);const standalone=name==='validateResourceMetadata';const implementationPath=relative(root,resolve(root,'packages/nibgate/src/browser',note.file));const body=source(implementationPath);const declarationLine=ast.getLineAndCharacterOfPosition(m.getStart(ast)).line+1;const runtime=impl.get(name);const runtimeLine=runtime?ca.getLineAndCharacterOfPosition(runtime.getStart(ca)).line+1:null;const match=body.match(new RegExp(`export (?:async )?function ${name}\\(`));const implLine=match?body.slice(0,match.index).split('\n').length:1;
const params=m.parameters.map(x=>`| \`${x.name.getText(ast)}${x.questionToken?'?':''}\` | \`${x.type?.getText(ast).replaceAll('|','\\|')}\` |`).join('\n');
const related=[...new Set(m.getText(ast).match(/Nibgate\w+/g)||[])].map(type=>{const node=ast.statements.find(n=>n.name?.text===type);return node?`### ${type}\n\n\`\`\`typescript\n${node.getText(ast)}\n\`\`\``:`### ${type}\n\nThis type is referenced but missing from the v0.4.40 declarations. Consult the linked implementation and the coverage notes.`;}).join('\n\n');
const example=`import { ${standalone?'validateResourceMetadata':'createNibgate'} } from '@nibgate/sdk';\n${standalone?'':'const client = createNibgate();\n'}const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };\n\n${note.example}`;
write(`pages/api/${name}.md`,`---\ntitle: ${name}\ndescription: ${JSON.stringify(note.description.split('. ')[0])}\n---\n\n# ${standalone?name:'client.'+name}\n\n${note.description}\n\n## Signature\n\n\`\`\`typescript\n${m.getText(ast)}\n\`\`\`\n\n${standalone?'The signature above is declared on NibgateClient but only the standalone export exists at runtime.':''}\n\n## Parameters\n\n${params?'| Parameter | Type |\n| --- | --- |\n'+params:'No parameters.'}\n\n## Returns\n\n\`${m.type.getText(ast)}\`\n\n## Example\n\nApp-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.\n\n\`\`\`typescript\n${example}\n\`\`\`\n\n## Source\n\n[Declaration, line ${declarationLine}](${base}${typesPath}#L${declarationLine}) · [Implementation, line ${implLine}](${base}${implementationPath}#L${implLine})${runtimeLine?` · [Client binding, line ${runtimeLine}](${base}${clientPath}#L${runtimeLine})`:''}\n\nPinned SDK 0.4.40 at \`${commit}\`.\n\n## Related types\n\n${related}\n`);
examples+=`\nasync function example_${name}() {\n${note.example}\n}\n`;
inventory.push({name,kind:standalone?'standalone-function':'client-method',page:`pages/api/${name.toLowerCase()}.html`,declaration:{path:typesPath,line:declarationLine},implementation:{path:implementationPath,line:implLine},clientLine:runtimeLine});}
for (const note of notes) {
  const pagePath = `pages/api/${note.name}.md`;
  const standalone = note.name === 'validateResourceMetadata';
  const generated = read(pagePath, 'utf8')
    .replace(`title: ${note.name}`, `title: ${standalone ? note.name : `client.${note.name}`}`)
    .replace(/\n# (?:client\.)?[^\n]+\n/, '\n');
  write(pagePath, `${generated.trimEnd()}\n`);
}
if (Object.keys(hashes).length !== Object.keys(pinnedHashes).length) throw Error('Pinned source manifest coverage drifted');
write('examples.ts',examples);
write('inventory.json',JSON.stringify({commit,package:'@nibgate/sdk',version:'0.4.40',license:'MIT (package.json declaration)',adapter:'Sourcey markdown, generated by TypeScript AST extraction plus source-reviewed annotations',clientMethods:27,standaloneFunctions:1,total:28,sourceHashes:hashes,pages:inventory},null,2)+'\n');
write('pages/introduction.md',`---\ntitle: SDK reference\ndescription: Source-mapped Nibgate SDK 0.4.40 reference.\n---\n\n# Nibgate SDK reference\n\nA source-generated companion to the [Nibgate guides](https://docs.nibgate.xyz). Covers **27 implemented client methods and one standalone metadata validator**, extracted from SDK 0.4.40 at [${commit.slice(0,7)}](${base.replace('/blob/','/tree/')}).\n\nBuilt with Sourcey 3.9.0 using its Markdown adapter. Exact signatures come from the TypeScript declarations; behavior notes and examples are checked against the JavaScript implementation. This is a selected browser SDK reference, not full coverage of server, tracking, testing, wallet or tip APIs.\n\n## Start\n\n\`\`\`sh\nnpm install @nibgate/sdk@0.4.40\n\`\`\`\n\n\`\`\`typescript\nimport { createNibgate, validateResourceMetadata } from '@nibgate/sdk';\nconst client = createNibgate();\nconst resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1' };\nconst validation = validateResourceMetadata(resource);\nclient.content(validation.resource);\n\`\`\`\n\nEvents are telemetry. Keep protected content behind server verification; emitting unlockCompleted is not proof of payment. Browser event methods return false when queued or when no browser exists. Payment examples require app-provided wallet callbacks and must run only on intentional user action.\n\n## Coverage and known issues\n\nThe declaration contains 28 client methods but validateResourceMetadata is not wired into the client at runtime; import it separately. Transfer types are referenced but undeclared. The rating UI click handler has a boolean/Promise mismatch. Read each method's notes before use.\n\n${inventory.map(x=>`- [${x.name}](api/${x.name.toLowerCase()}.html) — ${x.kind}`).join('\n')}\n`);
write('sourcey.config.ts',`import { defineConfig, markdown } from 'sourcey';\nexport default defineConfig({\n name: 'Nibgate SDK',\n siteUrl: 'https://docs.nibgate.xyz',\n baseUrl: '/sdk-reference',\n navigation: { tabs: [{ tab: 'SDK Reference', slug: '', source: markdown({ groups: [\n { group: 'Overview', pages: ['pages/introduction'] },\n { group: 'Client API', pages: ${JSON.stringify(inventory.map(x=>'pages/api/'+x.name))} }\n ] }) }] },\n});\n`);
write('pages/introduction.md', read('pages/introduction.md', 'utf8').replace('\n# Nibgate SDK reference\n\n', '\n'));
write('sourcey.config.ts', read('sourcey.config.ts', 'utf8').replace(
  " baseUrl: '/sdk-reference',\n",
  ` baseUrl: '/sdk-reference',\n theme: {\n   name: 'default',\n   appearance: { default: 'light' },\n   colors: { primary: '#7c9a6d', light: '#9ab68c', dark: '#607954' },\n   fonts: { sans: '\"Kumbh Sans\", \"ABC Favorit\", Arial, sans-serif', mono: 'system', google: false },\n   layout: { sidebar: '17.5rem', toc: '17rem', content: '53.75rem' },\n   css: ['./brand.css'],\n },\n navbar: { links: [\n   { type: 'github', label: 'GitHub', href: 'https://github.com/fortunesayspump/nibgate' },\n ] },\n footer: {\n   text: 'Nibgate docs. Built for creator-owned paid routes.',\n   links: [\n     { type: 'link', label: 'Main site', href: 'https://nibgate.xyz' },\n     { type: 'link', label: 'Explore', href: 'https://nibgate.xyz/explore' },\n     { type: 'link', label: 'Get started', href: 'https://nibgate.xyz/get-started' },\n   ],\n },\n`,
));
console.log(JSON.stringify({documented:inventory.length,clientMethods:impl.size,sourceFiles:Object.keys(hashes).length}));
