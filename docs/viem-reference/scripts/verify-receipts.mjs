import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const key=JSON.parse(readFileSync('evidence/receipt-public-key.json','utf8'));
const receipt=JSON.parse(readFileSync('evidence/receipt.json','utf8'));
const result=execFileSync('node_modules/.bin/runx',[
  'verify',receipt.id,'--receipt-dir',resolve('evidence/runx-receipts'),'--json',
],{encoding:'utf8',env:{...process.env,
  RUNX_RECEIPT_VERIFY_ISSUER_TYPE:key.type,
  RUNX_RECEIPT_VERIFY_KID:key.kid,
  RUNX_RECEIPT_VERIFY_ED25519_PUBLIC_KEY_BASE64:key.public_key_base64,
}});
process.stdout.write(result);
if(!JSON.parse(result).valid) throw Error('The receipt tree did not verify');
