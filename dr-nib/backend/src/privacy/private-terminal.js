import http from 'node:http';
import {validateTerminalInput} from '../../../private-terminal/policy.mjs';
/** The socket exists only between the measured worker and terminal service.
 * No remote sandbox, shell fallback, payment key or inherited environment. */
export async function runPrivateTerminal(value){
 const input=validateTerminalInput(value),socketPath=process.env.DRNIB_PRIVATE_TERMINAL_SOCKET;
 if(socketPath!=='/run/drnib-terminal/service.sock')throw Error('PRIVATE_TERMINAL_UNAVAILABLE');
 return new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('PRIVATE_TERMINAL_UNAVAILABLE'));
  const request=http.request({socketPath,path:'/execute',method:'POST',headers:{'content-type':'application/json'},timeout:90000},response=>{
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>650000){request.destroy();return}chunks.push(chunk)});response.on('error',fail);response.on('end',()=>{try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode!==200||result.engine!=='gvisor'||result.runtimeRelease!=='release-20261012.0'||result.costUsd!==0||!(result.exitCode===null||Number.isInteger(result.exitCode)&&result.exitCode>=0&&result.exitCode<=255)||typeof result.timedOut!=='boolean'||!Number.isFinite(result.seconds)||result.seconds<0||typeof result.stdout!=='string'||typeof result.stderr!=='string'||result.stdout.length>32768||result.stderr.length>8192||!result.artifacts||typeof result.artifacts!=='object')throw Error();validateTerminalInput({command:'true',files:result.artifacts});resolve(result);}catch{fail()}});
  });request.on('error',fail);request.on('timeout',()=>request.destroy());request.end(JSON.stringify(input));
 });
}
