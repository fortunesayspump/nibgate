import ts from 'typescript';
import { readFileSync as read, writeFileSync as write, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const commit = 'e6e0c1bef949fbdc837662fbd41ebe739ccae030';
const root = resolve('vendor/viem');
const checkout = resolve('../upstream-viem');
const version = '2.54.1';
const url = path => `https://github.com/wevm/viem/blob/${commit}/${path}`;
const hash = data => createHash('sha256').update(data).digest('hex');
const catalog = [
  ['createPublicClient','clients/createPublicClient','clients/public','Clients and Transports'],
  ['createWalletClient','clients/createWalletClient','clients/wallet','Clients and Transports'],
  ['custom','clients/transports/custom','clients/transports/custom','Clients and Transports'],
  ['fallback','clients/transports/fallback','clients/transports/fallback','Clients and Transports'],
  ['http','clients/transports/http','clients/transports/http','Clients and Transports'],
  ['decodeAbiParameters','utils/abi/decodeAbiParameters','abi/decodeAbiParameters','ABI Encoding'],
  ['decodeEventLog','utils/abi/decodeEventLog','contract/decodeEventLog','ABI Encoding'],
  ['decodeFunctionData','utils/abi/decodeFunctionData','contract/decodeFunctionData','ABI Encoding'],
  ['encodeAbiParameters','utils/abi/encodeAbiParameters','abi/encodeAbiParameters','ABI Encoding'],
  ['encodeFunctionData','utils/abi/encodeFunctionData','contract/encodeFunctionData','ABI Encoding'],
  ['getAddress','utils/address/getAddress','utilities/getAddress','Addresses'],
  ['getContractAddress','utils/address/getContractAddress','utilities/getContractAddress','Addresses'],
  ['isAddress','utils/address/isAddress','utilities/isAddress','Addresses'],
  ['isAddressEqual','utils/address/isAddressEqual','utilities/isAddressEqual','Addresses'],
  ['stringToBytes','utils/encoding/toBytes','utilities/toBytes','Encoding and Hashing'],
  ['toHex','utils/encoding/toHex','utilities/toHex','Encoding and Hashing'],
  ['keccak256','utils/hash/keccak256','utilities/keccak256','Encoding and Hashing'],
  ['hashMessage','utils/signature/hashMessage','utilities/hashMessage','Signatures'],
  ['hashTypedData','utils/signature/hashTypedData','utilities/hashTypedData','Signatures'],
  ['recoverMessageAddress','utils/signature/recoverMessageAddress','utilities/recoverMessageAddress','Signatures'],
  ['formatEther','utils/unit/formatEther','utilities/formatEther','Units'],
  ['formatUnits','utils/unit/formatUnits','utilities/formatUnits','Units'],
  ['parseEther','utils/unit/parseEther','utilities/parseEther','Units'],
  ['parseUnits','utils/unit/parseUnits','utilities/parseUnits','Units'],
];
const needed = new Set(['src/LICENSE','src/package.json','src/index.ts']);
for(const [,source,docs] of catalog){needed.add(`src/${source}.ts`);needed.add(`site/pages/docs/${docs}.md`);}
if (existsSync(checkout)) for(const path of needed){mkdirSync(dirname(resolve(root,path)),{recursive:true});cpSync(resolve(checkout,path),resolve(root,path));}
for(const path of needed) if(!existsSync(resolve(root,path))) throw Error(`Missing pinned source ${path}. Restore vendor/viem from upstream commit ${commit}.`);
const pkg=JSON.parse(read(resolve(root,'src/package.json')));
if(pkg.version!==version) throw Error(`Unexpected upstream version ${pkg.version}`);
const index = read(resolve(root,'src/index.ts'),'utf8');
mkdirSync('pages/api',{recursive:true});mkdirSync('evidence',{recursive:true});
const pages=[];
const clean = s => s.replace(/[ \t]+$/gm,'').replace(/^\/\/ @twoslash-cache:.*\n/gm,'').replace(/\s*\/\/ \[!code[^\n]*/g,'').replace(/^\/\/ ---cut---\s*$/gm,'').trim();
const fenced = s => `\n\`\`\`ts\n${s.trim()}\n\`\`\`\n`;
for (const [name,source,docs,group] of catalog) {
  const path=`src/${source}.ts`, text=read(resolve(root,path),'utf8');
  const sf=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const nodes=sf.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  if(!nodes.length||!new RegExp(`\\b${name}\\b`).test(index))throw Error(`Not an upstream export: ${name}`);
  const node=nodes.find(n=>n.body)||nodes[0];
  const start=sf.getLineAndCharacterOfPosition(node.getStart()).line+1;
  const end=sf.getLineAndCharacterOfPosition(node.end).line+1;
  const signatures=nodes.map(n=>text.slice(n.getStart(),n.body?.pos??n.end).trim().replace(/\s*;$/,'')+';');
  const docFile=`site/pages/docs/${docs}.md`, doc=read(resolve(root,docFile),'utf8');
  const description=(doc.match(/^description:\s*(.+)$/m)?.[1]??doc.replace(/^---[\s\S]*?---/,'').split(/\n\s*\n/).find(p=>!p.startsWith('#')&&p.trim()&&!p.startsWith('import'))??'').trim().replace(/\]\(\/docs\//g, '](https://viem.sh/docs/');
  const blocks=[...doc.matchAll(/```(?:ts|typescript)[^\n]*\n([\s\S]*?)```/g)].map(m=>clean(m[1])).filter(b=>b.includes(name)&&!b.includes('[!include')&&!/^import[^\n]+$/.test(b));
  const jsdocs=node.jsDoc??[];
  const jsExample=jsdocs.flatMap(d=>[...(d.tags??[])]).find(t=>t.tagName.text==='example');
  const jsExampleText=typeof jsExample?.comment==='string'?jsExample.comment:null;
  const example=clean(jsExampleText??blocks[0]??`import { ${name} } from 'viem'`);
  const types=sf.statements.filter(n=>(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&n.name.text!=='').map(n=>({name:n.name.text,text:n.getText(sf)}));
  const sourceLink=`${url(path)}#L${start}-L${end}`;
  const parameters=node.parameters.map(p=>({name:p.name.getText(sf),type:p.type?.getText(sf)??'Inferred by TypeScript',optional:!!p.questionToken||!!p.initializer,default:p.initializer?.getText(sf)??null}));
  const usageNotes={
    parseUnits:'Payment amounts must be checked against the token’s decimal limit before parsing. This version rounds excess fractional digits. The local test records this behavior; it does not treat rounded amounts as a successful payment.',
    formatUnits:'Use the token’s actual decimals. A formatted string is a representation of an amount, not a verified balance or settlement receipt.',
    parseEther:'This helper assumes 18 decimals. It is not the correct parser for a six-decimal USDC amount; use parseUnits with the token’s verified decimals.',
    formatEther:'This helper uses 18 decimals. Use formatUnits with verified token decimals when presenting USDC.',
    encodeFunctionData:'Encoding creates calldata only. It does not send a transaction, authorize a payment or prove settlement. Nibgate uses this family of helpers when constructing its direct-transfer path.',
    decodeFunctionData:'Decoded calldata describes a proposed call, not proof that it executed. Check the network, destination contract and successful receipt separately.',
    decodeEventLog:'Decoding an event does not establish which contract emitted it. Match the receipt’s contract address and expected chain before accepting a payment.',
    recoverMessageAddress:'Message recovery proves the signer of the exact supplied message. It does not establish expiry, resource scope, replay protection or payment completion.',
    hashMessage:'A text message and a raw-byte message are different inputs. Keep the encoding identical between the signer and verifier.',
    hashTypedData:'Use the exact EIP-712 domain and types of the integration being verified. This helper computes a digest; it does not submit or settle a payment.',
    createWalletClient:'Creating a wallet client is local configuration. None of this reference’s checks request accounts, sign a message or send a transaction.',
    createPublicClient:'Client construction is local configuration. This reference’s tests do not make live RPC requests or claim a chain is available.',
    http:'Use the RPC endpoint for the intended chain. The upstream example is retained as an example; it is not evidence that Nibgate uses the example network.',
    fallback:'Transport failover helps with provider failures. It does not make an unsupported network, mismatched chain or reverted transaction successful.',
    custom:'Use an actual authorized EIP-1193 provider in an application. No provider request or wallet permission prompt is executed by this documentation build.',
  }[name]??'This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.';
  const body=`# ${name}\n\n${description}\n\nViem ${version}. [Source at the pinned commit](${sourceLink}) · [Official reference](https://viem.sh/docs/${docs})\n\n## Signature\n${signatures.map(fenced).join('\n')}\n## Parameters\n\n${parameters.map(p=>`- **${p.name}**${p.optional?' (optional)':''}: \`${p.type.replace(/\s+/g,' ')}\`${p.default!==null?` Default expression: ${p.default}.`:''}`).join('\n')}\n\n## Example from Upstream\n\nThe following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](${url(docFile)}).\n${fenced(example)}\n## Integration Notes\n\n${usageNotes}\n\n## Exported Types in This Source File\n\n${types.length?types.map(t=>`### ${t.name}\n${fenced(t.text)}`).join('\n'):'The function’s primitive or inferred types are visible in its signature and implementation.'}\n\nImported type definitions remain in the [pinned source file](${url(path)}); this focused reference does not expand the entire type graph.\n\n## Provenance\n\n- Repository: [wevm/viem](https://github.com/wevm/viem).\n- Commit: ${commit}.\n- Source: ${path}, lines ${start}–${end}.\n- License: [MIT](${url('src/LICENSE')}), copyright weth LLC.\n- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.\n- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.\n`;
  write(`pages/api/${name}.md`,body);
  pages.push({name,group,path,docFile,sourceURL:sourceLink,sourceStart:start,sourceEnd:end,page:`pages/api/${name.toLowerCase()}.html`,parameters,overloads:nodes.length,exportedTypes:types.map(t=>t.name),hasFunctionJsdoc:jsdocs.length>0,hasSourceExample:!!jsExampleText});
}
const sourceHashes=Object.fromEntries([...needed].sort().map(path=>[path,hash(read(resolve(root,path)))]));
write('inventory.json',JSON.stringify({repository:'https://github.com/wevm/viem',commit,version,license:'MIT',total:pages.length,sourceHashes,pages},null,2)+'\n');
const groups=[...new Set(pages.map(p=>p.group))].map(group=>({group,pages:pages.filter(p=>p.group===group).map(p=>`pages/api/${p.name}`)}));
const config={name:'Nibgate · Viem Reference',siteUrl:'https://docs.nibgate.xyz',baseUrl:'/viem-reference',theme:{name:'default',appearance:{default:'light'},colors:{primary:'#526a45',light:'#7c9a6d',dark:'#334d28'},fonts:{sans:'"Kumbh Sans", "ABC Favorit", Arial, sans-serif',mono:'system',google:false},layout:{sidebar:'17.5rem',toc:'17rem',content:'53.75rem'},css:['./brand.css']},navbar:{links:[{type:'link',label:'Nibgate docs',href:'https://docs.nibgate.xyz'},{type:'link',label:'Viem upstream',href:'https://github.com/wevm/viem'}]},footer:{text:'Independent Viem integration reference maintained by Nibgate. Upstream source: MIT, weth LLC.',links:[{type:'link',label:'Viem official docs',href:'https://viem.sh'},{type:'link',label:'Nibgate',href:'https://nibgate.xyz'}]}};
write('sourcey.config.ts',`import { defineConfig, markdown } from 'sourcey';\nexport default defineConfig({...${JSON.stringify(config,null,2)}, navigation: {tabs:[{tab:'Viem Reference',slug:'',source:markdown({groups:${JSON.stringify([{group:'Overview',pages:['pages/introduction','pages/integration','pages/verification']},...groups])}})}]}});\n`);
write('pages/introduction.md',`# Viem Integration Reference\n\nSource-linked reference for the Viem utilities and client configuration used around Nibgate’s payment and access flows. This is a focused companion to the [Nibgate integration guides](https://docs.nibgate.xyz/payments-receipts), not an official Viem documentation site.\n\n## Scope\n\nThis reference documents **24 public APIs** from **Viem ${version}**, the version declared by Nibgate at the start of this work. Signatures, parameter types, local exported types and source links are extracted from [upstream commit ${commit}](${url('src/index.ts')}). The library is maintained by wevm, independently of Nibgate, and is [MIT licensed](${url('src/LICENSE')}).\n\nViem has a much wider API. Client methods, chain definitions, account abstraction and Tempo-specific modules are outside this deliberately scoped reference. Related utilities are included to make the encoding, amount formatting and verification paths understandable; inclusion does not claim that every function is directly imported by Nibgate.\n\n## Find an API\n\n${groups.map(g=>`### ${g.group}\n\n${pages.filter(p=>p.group===g.group).map(p=>`- [${p.name}](/viem-reference/pages/api/${p.name}.html)`).join('\n')}`).join('\n\n')}\n\n## How This Reference Was Produced\n\nA TypeScript AST extractor reads the pinned source and joins the signatures with examples from the same upstream commit. Sourcey 3.9.0 builds the resulting Markdown into this searchable site. Source files and their hashes are preserved with the build configuration. See [integration context](/viem-reference/pages/integration.html) and [verification boundaries](/viem-reference/pages/verification.html).\n\n## Attribution\n\nViem source and upstream examples are MIT licensed, copyright weth LLC. The full license is retained in the reference source package. Nibgate’s hosting and integration notes do not imply endorsement by wevm or Circle.\n`);
console.log(JSON.stringify({status:'generated',commit,version,documentedApis:pages.length,sourceFiles:pages.length,inputs:needed.size}));
