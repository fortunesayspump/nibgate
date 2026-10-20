// Real local container acceptance. Uses synthetic data and no model/payment calls.
// The caller starts the owned drnib-terminal-local container with release limits.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const container='drnib-terminal-local';
const exec=promisify(execFile);
for(let n=0;;n++){try{await exec('docker',['exec',container,'node','-e',"if(!require('fs').existsSync('/run/drnib-terminal/service.sock'))process.exit(1)"]);break}catch{if(n>=10)throw Error('Terminal socket did not become ready');await new Promise(resolve=>setTimeout(resolve,500))}}
const client=`const http=require('http');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{const r=http.request({socketPath:'/run/drnib-terminal/service.sock',path:'/execute',method:'POST',timeout:85000,headers:{'content-type':'application/json'}},res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>{if(res.statusCode!==200){process.stderr.write(s);process.exitCode=1}else process.stdout.write(s)})});r.on('error',e=>{process.stderr.write(e.code||'transport-error');process.exitCode=1});r.on('timeout',()=>r.destroy());r.end(input)})`;
async function run(input){
 const {spawn}=await import('node:child_process');
 return new Promise((resolve,reject)=>{let stdout='',stderr='';const child=spawn('docker',['exec','-i',container,'node','-e',client],{stdio:['pipe','pipe','pipe']});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),95000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error('Terminal request failed: '+stderr.slice(0,1000)));else{try{resolve(JSON.parse(stdout))}catch{reject(Error('Invalid terminal response'))}}});child.stdin.end(JSON.stringify(input));});
}
function okay(result){assert.equal(result.engine,'gvisor');assert.equal(result.runtimeRelease,'release-20261012.0');assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.costUsd,0);assert.equal(result.timedOut,false);}
const passed=[],skipped=[];
const mark=name=>{passed.push(name);console.log('Passed: '+name)};
const first=await run({command:`set -eu
python3 -c 'from pathlib import Path; result=126-98; Path("answer.txt").write_text(str(result)); print(result)'
node -e 'console.log(JSON.stringify({node:process.version}))'
printf '{"value":28}' | jq .value`,persist:['answer.txt']});okay(first);assert.equal(first.artifacts['answer.txt'],'28');assert.match(first.stdout,/28/);mark('real-bash-python-node-jq-and-artifacts');
const second=await run({command:'test "$(cat answer.txt)" = 28; printf resumed',files:first.artifacts});okay(second);assert.equal(second.stdout,'resumed');mark('restored-workspace');
const isolation=await run({command:`set -eu
for p in /app /root /home /var/run/docker.sock /var/run/dstack.sock /run/drnib-terminal/service.sock /etc/passwd; do test ! -e "$p"; done
test -z "\${DRNIB_ACCEPTANCE_SECRET:-}"
! touch /usr/drnib-write-probe 2>/dev/null
python3 -c 'import socket; s=socket.socket(); s.settimeout(1); assert s.connect_ex(("1.1.1.1",443)) != 0; print("isolated")'`});okay(isolation);assert.match(isolation.stdout,/isolated/);mark('no-host-files-service-env-or-direct-network');
const cached=await run({command:`set -eu
curl --fail --silent --show-error https://example.com/approved > fetched.txt
python3 -c 'import requests; assert requests.get("https://example.com/approved",timeout=5).text == "real-transport-fixture"'
test "$(cat fetched.txt)" = real-transport-fixture
test "$(curl --silent -o /dev/null -w '%{http_code}' https://example.com/unapproved)" = 403`,publicResponses:[{url:'https://example.com/approved',method:'GET',body:'',status:200,text:'real-transport-fixture'}],persist:['fetched.txt']});okay(cached);assert.equal(cached.artifacts['fetched.txt'],'real-transport-fixture');mark('curl-python-https-approved-response-and-denied-new-path');
const links=await run({command:'ln -s /usr/bin/bash forbidden.txt; printf safe > safe.txt',persist:['forbidden.txt','safe.txt']});okay(links);assert.deepEqual(links.artifacts,{'safe.txt':'safe'});mark('symlink-artifact-rejected');
if(process.env.DRNIB_TERMINAL_ACCEPTANCE_SKIP_HEAVY==='emulation')skipped.push('numpy-pandas-native-check-pending');
else {const packages=await run({command:"python3 -c 'import numpy,pandas; print(126-98)'"});okay(packages);assert.equal(packages.stdout.trim(),'28');mark('numpy-pandas');}
console.log(JSON.stringify({ok:true,paidCalls:0,passed,skipped},null,2));
