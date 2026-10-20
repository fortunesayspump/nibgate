import {runPrivateTerminal} from './private-terminal.js';
/** Owner-review readiness only: fixed synthetic commands, no caller inputs,
 * research data, AI calls, wallet operations or arbitrary debug execution. */
export function createPrivateTerminalCheck({run=runPrivateTerminal}={}){
 let success,pending,attempts=0,last=0;
 const check=async()=>{
  const packages=await run({command:"set -eu\npython3 -c 'import numpy,pandas; from pathlib import Path; Path(\"answer.txt\").write_text(str(126-98)); print(\"packages-ready\")'\nnode -e 'console.log(\"node-ready\")'",persist:['answer.txt']});
  if(packages.exitCode!==0||packages.timedOut||packages.artifacts?.['answer.txt']!=='28'||!packages.stdout.includes('packages-ready')||!packages.stdout.includes('node-ready'))throw Error('PRIVATE_TERMINAL_NOT_READY');
  const isolation=await run({command:'set -eu\ntest "$(cat answer.txt)" = 28\nfor p in /app /home /root /var/run/docker.sock /var/run/dstack.sock /run/drnib-terminal/service.sock; do test ! -e "$p"; done\n! touch /usr/drnib-write-check 2>/dev/null\npython3 -c \'import os,socket; assert not any(n in os.environ for n in ["PRIVATE_AI_API_KEY","DRNIB_DATABASE_URL","DRNIB_AGENT_PRIVATE_KEY"]); s=socket.socket(); s.settimeout(1); assert s.connect_ex(("1.1.1.1",443)) != 0\'\nprintf isolated',files:packages.artifacts});
  if(isolation.exitCode!==0||isolation.timedOut||isolation.stdout!=='isolated')throw Error('PRIVATE_TERMINAL_NOT_READY');
  const tls=await run({command:'set -eu\ncurl --fail --silent --show-error https://example.com/approved > response.txt\npython3 -c \'import requests; assert requests.get("https://example.com/approved",timeout=5).text == "approved-response-fixture"\'\ntest "$(cat response.txt)" = approved-response-fixture\ntest "$(curl --silent -o /dev/null -w "%{http_code}" https://example.com/denied)" = 403\nprintf cache-verified',publicResponses:[{url:'https://example.com/approved',method:'GET',body:'',text:'approved-response-fixture',status:200}]});
  if(tls.exitCode!==0||tls.timedOut||tls.stdout!=='cache-verified')throw Error('PRIVATE_TERMINAL_NOT_READY');
  return {ready:true,engine:'gvisor',checks:['python-numpy-pandas-node','persisted-text-artifact','filesystem-environment-network-isolation','curl-python-https-cache-and-denied-path'],modelCalls:0,paymentCalls:0};
 };
 return async()=>{
  if(success)return success;if(pending)return pending;
  if(attempts>=3||Date.now()-last<60000)return {ready:false};attempts++;last=Date.now();
  pending=check().then(result=>(success=result)).catch(()=>({ready:false})).finally(()=>{pending=null});return pending;
 };
}
