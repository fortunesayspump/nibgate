// Reviewed HTTPS termination must front this gateway. It only
// forwards hardware evidence to a fixed verifier; it never sees project keys.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const MAX_EVIDENCE=4*1024*1024,MAX_VERDICT=1024*1024;
export function verifierGatewayConfig(env=process.env){
  const upstream=new URL(env.DRNIB_VERIFIER_UPSTREAM_URL??'');
  if(upstream.username||upstream.password||upstream.search||upstream.hash||upstream.pathname!=='/verify'||
    !(upstream.protocol==='https:'||upstream.protocol==='http:'&&(['127.0.0.1','localhost','[::1]'].includes(upstream.hostname)||upstream.hostname.endsWith('.railway.internal'))))throw Error('VERIFIER_UPSTREAM_INVALID');
  const origins=(env.DRNIB_VERIFIER_BROWSER_ORIGINS??'').split(',').filter(Boolean);
  if(!origins.length||origins.length>8||new Set(origins).size!==origins.length)throw Error('VERIFIER_ORIGINS_INVALID');
  for(const value of origins){const url=new URL(value);if(url.origin!==value||url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.endsWith('.example'))throw Error('VERIFIER_ORIGINS_INVALID');}
  const port=env.PORT??'8080';if(!/^[1-9][0-9]{0,4}$/.test(port)||Number(port)>65535)throw Error('VERIFIER_PORT_INVALID');
  return {upstream,origins:new Set(origins),port:Number(port)};
}
async function boundedBody(stream,max){
  const chunks=[];let length=0;
  for await(const chunk of stream){length+=chunk.length;if(length>max)throw Error('SIZE');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function boundedVerdict(response){
  if(!response.body)throw Error('EMPTY');const reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_VERDICT){await reader.cancel();throw Error('SIZE');}chunks.push(value);}}finally{reader.releaseLock();}
  const body=Buffer.concat(chunks);const value=JSON.parse(body.toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.is_valid!=='boolean')throw Error('VERDICT');
  return body;
}
export function createVerifierGateway({config=verifierGatewayConfig(),fetchImpl=fetch}={}){
  let active=0;
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
    const send=(status,code)=>{res.writeHead(status);res.end(JSON.stringify({code}));};
    const origin=req.headers.origin;
    if(origin&&!config.origins.has(origin))return send(403,'VERIFIER_ORIGIN_REJECTED');
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    if(req.url==='/health'&&req.method==='GET')return send(200,'VERIFIER_GATEWAY_CONFIGURED');
    if(req.url!=='/verify')return send(404,'VERIFIER_ROUTE_NOT_FOUND');
    if(req.method==='OPTIONS'){
      if(!origin||req.headers['access-control-request-method']!=='POST'||String(req.headers['access-control-request-headers']??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).some(x=>!['accept','content-type'].includes(x)))return send(403,'VERIFIER_PREFLIGHT_REJECTED');
      res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','content-type, accept');res.writeHead(204);return res.end();
    }
    if(req.method!=='POST')return send(405,'VERIFIER_METHOD_REJECTED');
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))return send(415,'VERIFIER_CONTENT_TYPE_REJECTED');
    if(Number(req.headers['content-length'])>MAX_EVIDENCE)return send(413,'VERIFIER_EVIDENCE_TOO_LARGE');
    if(active>=4)return send(429,'VERIFIER_BUSY');
    active++;
    try{
      const body=await boundedBody(req,MAX_EVIDENCE);let value;try{value=JSON.parse(body.toString('utf8'));}catch{return send(400,'VERIFIER_EVIDENCE_INVALID');}
      const keys=value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().join(','):'';
      if(keys!=='attestation'&&keys!=='event_log,quote,vm_config')return send(400,'VERIFIER_EVIDENCE_INVALID');
      const response=await fetchImpl(config.upstream,{method:'POST',redirect:'error',credentials:'omit',headers:{'content-type':'application/json',accept:'application/json'},body,signal:AbortSignal.timeout(10000)});
      if(response.status!==200||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))return send(503,'VERIFIER_UPSTREAM_UNAVAILABLE');
      const verdict=await boundedVerdict(response);res.writeHead(200);res.end(verdict);
    }catch(error){if(!res.headersSent)send(error.message==='SIZE'?413:503,'VERIFIER_UNAVAILABLE');else res.destroy();}
    finally{active--;}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const config=verifierGatewayConfig();const server=createVerifierGateway({config});server.requestTimeout=15000;server.headersTimeout=10000;server.listen(config.port,'0.0.0.0',()=>console.log('Attestation verifier gateway ready'));}
  catch{console.error('Attestation verifier gateway configuration unavailable');process.exitCode=1;}
}
