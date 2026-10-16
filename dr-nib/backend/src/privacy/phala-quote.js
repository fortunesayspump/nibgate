import http from 'node:http';
import {phalaSessionReportData} from './phala-verifier.js';

const PHALA_SOCKET='/var/run/dstack.sock';
const HEX=/^(?:[0-9a-f]{2})+$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Official guest API v1, deliberately not SDK 0.5.8's frozen v0 `/Attest`.
 * v1 returns MessagePack evidence with the exact TDX quote needed by the
 * independently pinned browser QVL verifier. No v0 or simulator fallback. */
export function attestV1(reportData,{socketPath=PHALA_SOCKET}={}){
  return new Promise((resolve,reject)=>{
    const payload=JSON.stringify({report_data:reportData.toString('hex'),include_boottime_gpu_evidence:false});
    const request=http.request({socketPath,path:'/v1/Attest',method:'POST',timeout:10000,
      headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}},response=>{
      if(response.statusCode!==200){response.resume();return reject(new Error('Phala v1 attestation unavailable'))}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){request.destroy(new Error('Phala v1 response too large'));return}chunks.push(chunk)});
      response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(new Error('Invalid Phala v1 response'))}});
      response.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(new Error('Phala v1 attestation timeout')));
    request.on('error',reject);
    request.end(payload);
  });
}

/** Guest quote creation only. Client must independently verify freshness,
 * pinned release, TCB, OS and live HPKE key possession before encrypting. */
export async function getPhalaSessionEvidence({clientNonce,sessionId,sessionPublicKey,client}){
  if(process.env.DSTACK_SIMULATOR_ENDPOINT)throw new Error('dstack simulator is forbidden for confidential processing');
  if(!Buffer.isBuffer(clientNonce)||clientNonce.length!==32||typeof sessionId!=='string'||!UUID.test(sessionId)||
     !Buffer.isBuffer(sessionPublicKey)||sessionPublicKey.length!==65)throw new Error('invalid Phala session binding');
  const binding=phalaSessionReportData({clientNonce,sessionId,recipientPublicKey:sessionPublicKey});
  if(client&&typeof client.attestV1!=='function')throw new Error('Phala v1 attestation unavailable');
  const response=await (client?client.attestV1(binding):attestV1(binding));
  if(!response||typeof response.attestation!=='string'||!HEX.test(response.attestation))throw new Error('invalid Phala v1 attestation response');
  return Object.freeze({attestation:response.attestation,reportData:binding.toString('hex')});
}
export const getPhalaSessionQuote=getPhalaSessionEvidence;
