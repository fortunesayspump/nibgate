// Local owner test only. Both origins are independently checked domains of
// Railway service a1f57441-1b36-4ea7-b87e-acd1ae7c6bf8; no new auth recipient.
const HUB='https://testnet-api.nibgate.xyz';
const SERVICE='https://nibgatebackend-production.up.railway.app';
const PATHS=new Set(['/api/auth/me','/auth/me','/auth/nonce','/auth/verify','/auth/logout']);
export function localAuthTransport(url,origin=HUB){
 if(![HUB,SERVICE].includes(origin))throw Error('Unexpected local auth transport');
 if(typeof url!=='string'&&!(url instanceof URL))return url;
 let parsed;try{parsed=new URL(String(url));}catch{return url;}
 if(parsed.origin!==HUB||!PATHS.has(parsed.pathname)||parsed.username||parsed.password||parsed.search||parsed.hash)return url;
 return origin+parsed.pathname;
}
