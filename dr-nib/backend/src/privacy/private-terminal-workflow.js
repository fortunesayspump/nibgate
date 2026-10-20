import {validatePrivateExternalRequest}from'@nibgate/internal/private-tools.js';
import {validateTerminalInput}from'../../../private-terminal/policy.mjs';
/** Fetches are real exact owner-approved public HTTP calls. Their encrypted
 * durable results seed a networkless terminal response cache. Commands cannot
 * exfiltrate new URLs/bodies or obtain a payment key through curl. */
export async function preparePrivateTerminal({input,state,ownerQuestion,externalTool}){
 if(!input||Object.keys(input).some(k=>!['command','files','persist','requests'].includes(k)))throw Error('PRIVATE_TERMINAL_INPUT_INVALID');
 const requests=input.requests??[];if(!Array.isArray(requests)||requests.length>8)throw Error('PRIVATE_TERMINAL_INPUT_INVALID');
 const publicSources=[];
 const proposed=validateTerminalInput({command:input.command,files:input.files??{},persist:input.persist??[],publicResponses:[]});
 const terminal=validateTerminalInput({...proposed,files:{...(state.terminalFiles??{}),...proposed.files}});
 for(const value of requests){
  const request=validatePrivateExternalRequest(value);
  if(request.tool!=='http_request'||state.brief.liveWeb!==true||typeof ownerQuestion!=='function'||typeof externalTool!=='function')throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
  const approval=await ownerQuestion({prompt:'Allow this public terminal data request?',why:'The payment service receives only this exact URL, method and body. Its real response is supplied to the isolated terminal; new network destinations remain blocked.',externalRequest:request,options:[{id:'approve',label:'Approve this public request'},{id:'decline',label:'Skip terminal networking'}]});
  if(approval.optionId!=='approve')return {declined:true};
  const result=await externalTool({request,answer:approval}),out=result.output;
  if(!result.ok||result.costMicroUsd!==0||typeof out?.text!=='string'||out.text.length>24000||out.truncated===true||!Number.isInteger(out.status)||out.status<200||out.status>=300)throw Error('PRIVATE_TERMINAL_RESPONSE_INVALID');
  terminal.publicResponses.push({url:request.url,method:request.method??'GET',body:request.body?JSON.stringify(request.body):'',text:out.text,status:out.status});
  publicSources.push({id:result.callId,url:request.url,title:request.url,text:out.text.slice(0,12000),provider:'public-web',evidenceKind:'owner-approved-terminal-input',...(out.creatorAssessment?{creatorAssessment:out.creatorAssessment}:{}),trust:null});
  state.events.push({type:'tool.call',tool:'http_request',input:request,result,costUsd:0,why:'Owner-approved public input for the private terminal.',at:new Date().toISOString()});
 }
 return {input:validateTerminalInput(terminal),publicSources};
}
export function savePrivateTerminalArtifacts(state,result){
 const files={...(state.terminalFiles??{}),...result.artifacts};validateTerminalInput({command:'true',files});state.terminalFiles=files;
 return {...result,artifacts:Object.entries(result.artifacts).map(([path,text])=>({path,bytes:Buffer.byteLength(text)})),stdout:result.stdout.slice(0,6000),stderr:result.stderr.slice(0,2000),outputTruncated:result.stdout.length>6000||result.stderr.length>2000};
}
