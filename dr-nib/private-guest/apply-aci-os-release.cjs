// Add only the production OS/event measurement independently verified for the
// provider's signed 2026-11-05-2 release. Fail if the pinned verifier changes.
// https://github.com/Dstack-TEE/private-ai-gateway/releases/tag/gateway-prod-2026-11-05-2
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const file = '/app/node_modules/.pnpm/@phala+aci-verifier@0.7.3_encoding@0.1.13/node_modules/@phala/aci-verifier/dist/transcript.js';
const source = fs.readFileSync(file, 'utf8');
const digest = createHash('sha256').update(source).digest('hex');
if (digest !== 'c047632d0af837732174dd7c8a19093bb5aa4bef6f81f4d7e442e590e3f4462d') throw Error('Unexpected ACI verifier source');
const anchor = 'const PRODUCTION_DSTACK_OS_IMAGES = new Map([\n';
if (source.split(anchor).length !== 2) throw Error('Unexpected ACI verifier format');
const entry = `    // dstack-0.5.12: independently verified production image, RedPill gateway release 2026-11-05-2.\n    // https://github.com/Dstack-TEE/private-ai-gateway/releases/tag/gateway-prod-2026-11-05-2\n    [\n        '8db40cb23008d6213668b5816702d100b37b859a8a5bfd18d938ae3a1b3715bd',\n        '9381eb17a317a6ebabc892bd4601743106b3f7415f2a82fe73c24b1b12d9fb982a26e7c49632fe2fae01ffbae6bf5ea2',\n    ],\n`;
fs.writeFileSync(file, source.replace(anchor, anchor + entry));
