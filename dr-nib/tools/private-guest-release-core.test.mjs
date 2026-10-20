import test from 'node:test';import assert from 'node:assert/strict';
import {privateGuestCompose,MEASURED_POLICY_NAMES,ENCRYPTED_SECRET_NAMES,HOSTED_JEV_POLICY_NAMES} from './private-guest-release-core.mjs';
const input=()=>({image:'docker.io/fortunesayspump/nibgate-private-guest@sha256:'+'a'.repeat(64),policy:Object.fromEntries(MEASURED_POLICY_NAMES.map(k=>[k,'reviewed-'+k])),secrets:Object.fromEntries(ENCRYPTED_SECRET_NAMES.map(k=>[k,'credential-canary-'+k]))});
test('model rotation policy is a literal measured choice, never an encrypted fallback override',()=>{
 assert.match(privateGuestCompose(input()),/PRIVATE_AI_MODEL_POOL=single/);
 assert.match(privateGuestCompose({...input(),modelPool:'gemma-qwen-canary-v1'}),/PRIVATE_AI_MODEL_POOL=gemma-qwen-canary-v1/);
 assert.throws(()=>privateGuestCompose({...input(),modelPool:'openrouter'}));
});
test('hosted research fallback requires the reviewed workspace policy and only interpolates its credential',()=>{
 const i=input();i.modelPool='phala-openrouter-zdr-canary-v1';assert.throws(()=>privateGuestCompose(i));
 i.hostedJev={policy:Object.fromEntries(HOSTED_JEV_POLICY_NAMES.map(k=>[k,'reviewed-'+k])),apiKey:'synthetic-secret'};
 const compose=privateGuestCompose(i);assert.match(compose,/PRIVATE_AI_MODEL_POOL=phala-openrouter-zdr-canary-v1/);assert.ok(compose.includes('PRIVATE_OPENROUTER_RESEARCH_API_KEY=${PRIVATE_OPENROUTER_RESEARCH_API_KEY}'));assert.ok(!compose.includes('synthetic-secret'));
});
test('hosted JEV disclosure/privacy pins are measured and its credential stays in sealed environment',()=>{
 const i=input();i.hostedJev={policy:Object.fromEntries(HOSTED_JEV_POLICY_NAMES.map(k=>[k,'reviewed-'+k])),apiKey:'synthetic-secret'};const compose=privateGuestCompose(i);
 for(const k of HOSTED_JEV_POLICY_NAMES)assert.ok(compose.includes(k+'=reviewed-'+k));assert.ok(!compose.includes('synthetic-secret'));assert.ok(compose.includes('PRIVATE_HOSTED_JEV_API_KEY=${PRIVATE_HOSTED_JEV_API_KEY}'));
 delete i.hostedJev.policy.PRIVATE_HOSTED_JEV_ZDR_VERIFIED;assert.throws(()=>privateGuestCompose(i));
});
test('only credential and ciphertext-storage fields can resolve outside measured compose',()=>{const i=input(),c=privateGuestCompose(i);for(const k of MEASURED_POLICY_NAMES){assert.ok(c.includes(k+'='+i.policy[k]));assert.ok(!c.includes('${'+k+'}'));}for(const k of ENCRYPTED_SECRET_NAMES){assert.ok(c.includes('${'+k+'}'));assert.ok(!c.includes(i.secrets[k]));}assert.match(c,/driver: "none"/);});
test('omitting a measured trust pin fails closed',()=>{const i=input();delete i.policy.PRIVATE_ACI_COMPOSE_HASH;assert.throws(()=>privateGuestCompose(i));});
test('moving a trust pin into the encrypted environment is rejected',()=>{const i=input();i.secrets.PRIVATE_ACI_COMPOSE_HASH=i.policy.PRIVATE_ACI_COMPOSE_HASH;delete i.policy.PRIVATE_ACI_COMPOSE_HASH;assert.throws(()=>privateGuestCompose(i));});
test('credential material cannot be added to measured policy',()=>{const i=input();i.policy.PRIVATE_AI_API_KEY=i.secrets.PRIVATE_AI_API_KEY;assert.throws(()=>privateGuestCompose(i));});
test('policy cannot interpolate another unmeasured environment field',()=>{const i=input();i.policy.PRIVATE_ACI_COMPOSE_HASH='${UNREVIEWED_HASH}';assert.throws(()=>privateGuestCompose(i));});
test('mutable container tags and YAML injection are rejected',()=>{const i=input();i.image='docker.io/fortunesayspump/nibgate-private-guest:latest';assert.throws(()=>privateGuestCompose(i));const j=input();j.policy.PRIVATE_AI_APPROVED_MODEL='model\n    privileged: true';assert.throws(()=>privateGuestCompose(j));});
test('terminal companion is measured and receives no service credentials or outbound network',()=>{
 const i=input();i.terminal={image:'docker.io/fortunesayspump/nibgate-private-guest@sha256:'+'b'.repeat(64)};const c=privateGuestCompose(i),terminal=c.split('  drnib-private-terminal:')[1];
 assert.match(c,/DRNIB_PRIVATE_TERMINAL_SOCKET=\/run\/drnib-terminal\/service.sock/);assert.match(terminal,/network_mode: none/);assert.match(terminal,/read_only: true/);assert.match(terminal,/seccomp=\/etc\/drnib-terminal-seccomp.json/);
 assert.ok(!terminal.includes('dstack.sock'));assert.ok(!terminal.includes('ports:'));for(const name of ENCRYPTED_SECRET_NAMES)assert.ok(!terminal.includes(name));assert.ok(!terminal.includes('privileged:'));assert.ok(!c.includes('drnib-private-search'));
 i.terminal.image='docker.io/fortunesayspump/nibgate-private-guest:latest';assert.throws(()=>privateGuestCompose(i));
});
