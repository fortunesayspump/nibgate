// Run the actual local client with an explicitly reviewed fixed-boot manifest.
// No guest-provided pin, simulator, synthetic account or verification bypass.
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const path=process.env.DRNIB_REVIEWED_BOOT_MANIFEST,expected=process.env.DRNIB_REVIEWED_BOOT_SHA256;
for(const name of ['NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED','NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED'])
 if(!['true','false'].includes(process.env[name]))throw Error(`Set ${name} explicitly before starting the real local client`);
if(process.env.NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED==='true'&&!process.env.DRNIB_PRIVATE_FUNDING_API_URL)throw Error('Configure the real funding service before starting the funded client');
if(!path||!expected||!/^[0-9a-f]{64}$/.test(expected))throw Error('Supply the reviewed local manifest path and its independently checked SHA-256');
const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Reviewed manifest hash mismatch');
const manifest=JSON.parse(bytes.toString('utf8'));if(manifest.expiresAtMs<=Date.now())throw Error('Reviewed boot approval expired');
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL:'true',DRNIB_PRIVATE_API_URL:'http://127.0.0.1:3103',DRNIB_LOCAL_AUTH_PROXY_URL:'http://127.0.0.1:3104',DRNIB_API_URL:'http://127.0.0.1:9',NEXT_PUBLIC_API_URL:'https://testnet-api.nibgate.xyz',NEXT_PUBLIC_NIBGATE_NETWORK:'testnet',NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_JSON:bytes.toString('utf8'),NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_SHA256:expected};
delete env.NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL;
const cwd=fileURLToPath(new URL('../frontend',import.meta.url)),bin=fileURLToPath(new URL('../frontend/node_modules/next/dist/bin/next',import.meta.url));
const child=spawn(process.execPath,[bin,'dev','--webpack','--hostname','127.0.0.1','--port','3001'],{cwd,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??0));
