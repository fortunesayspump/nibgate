import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {createHash}from'node:crypto';
import {privateTerminalPreLaunchScript,TERMINAL_SECCOMP_SHA256}from'./private-terminal-release.mjs';
test('terminal host profile stays default-deny and adds only a capability-scoped pivot_root rule',()=>{
 const raw=readFileSync(new URL('../private-terminal/seccomp.json',import.meta.url));assert.equal(createHash('sha256').update(raw).digest('hex'),TERMINAL_SECCOMP_SHA256);const profile=JSON.parse(raw);assert.equal(profile.defaultAction,'SCMP_ACT_ERRNO');assert.deepEqual(profile.syscalls.at(-1),{names:['pivot_root'],action:'SCMP_ACT_ALLOW',includes:{caps:['CAP_SYS_ADMIN']}});
 const runner=readFileSync(new URL('../private-terminal/runner.mjs',import.meta.url),'utf8');assert.ok(runner.includes("'--directfs=false'"));assert.ok(!runner.includes('TESTONLY'));
 assert.throws(()=>privateTerminalPreLaunchScript('#!/bin/bash\ntrue\n'),/Unreviewed base/);
});
