import {validatePrivateExternalRequest}from'@nibgate/internal/private-tools.js';
/** Only this already approved PUBLIC query leaves the guest. Discovery,
 * extraction and extension assessment run once in the normal public tools. */
export async function requestPreapprovedPublicResearch({approval,preferCreators=false,ownerQuestion,externalTool}){
 if(approval?.approved!==true||typeof approval.brief!=='string'||typeof ownerQuestion!=='function'||typeof externalTool!=='function')throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
 const request=validatePrivateExternalRequest({tool:'web_search',query:approval.brief,maxMicroUsd:0,...(preferCreators?{preferCreators:true}:{})});
 const answer=await ownerQuestion({prompt:'Fetch the approved public research sources.',why:'This exact public query and creator preference were approved during setup. The existing public-tools process searches, extracts and assesses public pages; private uploads and research state stay in Phala.',externalRequest:request,options:[{id:'approve',label:'Use the approved public query'},{id:'decline',label:'Skip public research'}]});
 if(answer.optionId!=='approve')return [];
 const result=await externalTool({request,answer});if(!result.ok||result.costMicroUsd!==0||!Array.isArray(result.output?.sources)||result.output.sources.length>30)throw Error('PRIVATE_RETRIEVAL_INVALID');
 return result.output.sources;
}
