export const PRIVATE_EXTERNAL_TOOLS=Object.freeze(['web_search','web_fetch','http_request','unlock_content','pay_x402','tip_creator','rate_content']);
export function canonicalToolJson(value){
 if(Array.isArray(value))return '['+value.map(canonicalToolJson).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalToolJson(value[k])).join(',')+'}';
 if(value===undefined||typeof value==='number'&&!Number.isFinite(value))throw Error('PRIVATE_TOOL_REQUEST_INVALID');
 return JSON.stringify(value);
}
/** Exact public bytes approved by the owner. No model-selected headers, keys,
 * recipient wallet overrides, local URLs or implicit private context. */
export function validatePrivateExternalRequest(value){
 const fail=()=>{throw Error('PRIVATE_TOOL_REQUEST_INVALID')};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['tool','url','query','method','body','maxMicroUsd','stars','unlockRef','contentId','preferCreators'].includes(k))||!PRIVATE_EXTERNAL_TOOLS.includes(value.tool)||!Number.isSafeInteger(value.maxMicroUsd)||value.maxMicroUsd<0||value.maxMicroUsd>2000000)fail();
 const allowed={web_search:['query','preferCreators'],web_fetch:['url'],http_request:['url','method','body'],unlock_content:['url'],pay_x402:['url','body'],tip_creator:['url'],rate_content:['url','stars','unlockRef','contentId']}[value.tool];
 if(Object.keys(value).some(k=>!['tool','maxMicroUsd',...allowed].includes(k)))fail();
 const request=JSON.parse(canonicalToolJson(value));
 if(request.tool==='web_search'){
  if(!['maxMicroUsd,query,tool','maxMicroUsd,preferCreators,query,tool'].includes(Object.keys(request).sort().join(','))||request.preferCreators!==undefined&&typeof request.preferCreators!=='boolean'||typeof request.query!=='string'||request.query.trim().length<3||request.query.length>400||request.maxMicroUsd!==0)fail();
 }else{
  if(typeof request.url!=='string'||request.url.length>2000)fail();let url;try{url=new URL(request.url)}catch{fail()}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!host.includes('.')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||/(?:^|\.)(localhost|local|internal|invalid|test)$/.test(host))fail();
  if(request.tool==='http_request'){
   if(!['GET','POST','HEAD'].includes(request.method??'GET')||request.maxMicroUsd!==0||request.body!==undefined&&(request.method!=='POST'||!request.body||typeof request.body!=='object'||canonicalToolJson(request.body).length>4000))fail();
  }else if(request.method!==undefined||request.body!==undefined&&request.tool!=='pay_x402')fail();
  if(request.tool==='pay_x402'&&request.body!==undefined&&(!request.body||typeof request.body!=='object'||Array.isArray(request.body)||canonicalToolJson(request.body).length>4000))fail();
  if(request.contentId!==undefined&&(typeof request.contentId!=='string'||request.contentId.length>200||!request.contentId.trim()))fail();
  if(request.tool==='web_fetch'&&request.maxMicroUsd!==0)fail();
  if(request.tool==='tip_creator'&&(request.maxMicroUsd<1||request.maxMicroUsd>1000000))fail();
  if(request.tool==='rate_content'&&(!Number.isInteger(request.stars)||request.stars<1||request.stars>5||!/^0x[0-9a-f]{64}$/i.test(request.unlockRef??'')||request.maxMicroUsd!==0))fail();
  if(request.tool!=='rate_content'&&['stars','unlockRef','contentId'].some(k=>k in request))fail();
 }
 if(canonicalToolJson(request).length>10000)fail();return request;
}
