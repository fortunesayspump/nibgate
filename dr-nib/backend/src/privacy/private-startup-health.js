import {createServer} from 'node:http';
const STAGES=new Set(['CONFIGURATION','DATABASE','DATABASE_PRIVATE_NETWORK','DATABASE_CURRENT_PROXY','DATABASE_OTHER_TARGET','DATABASE_URL_INVALID','SCHEMA','JEV','PHALA_ATTESTATION','WORKFLOW']);
// Fixed operational categories only: never accept or serialize an exception.
export function createStartupHealth(){
 let stage='CONFIGURATION',state='starting',reason=null;
 const server=createServer((req,res)=>{
  res.setHeader('cache-control','no-store');
  res.setHeader('content-type','application/json');
  if(req.method!=='GET'||req.url!=='/health'){
   res.writeHead(503);res.end('{"code":"PRIVATE_GUEST_UNAVAILABLE"}');return;
  }
  res.end(JSON.stringify({ok:true,privateReady:false,startup:{state,stage,...(reason?{reason}:{})}}));
 });
 return {server,
  stage(value){if(!STAGES.has(value))throw Error('INVALID_STARTUP_STAGE');stage=value;},
  fail(code){state='failed';reason=({P1000:'DATABASE_AUTHENTICATION',P1001:'DATABASE_UNREACHABLE',P1002:'DATABASE_TIMEOUT',P1003:'DATABASE_MISSING',P1010:'DATABASE_PERMISSION',P1011:'DATABASE_TLS',P1017:'DATABASE_CONNECTION_CLOSED'})[code]??null;},
  listen(port){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});},
  close(){return new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 };
}
