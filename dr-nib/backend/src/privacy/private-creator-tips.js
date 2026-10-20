import {citedTipCandidates} from '../tip-candidates.js';
import {createPrivateJudge} from './private-judge.js';
const bad=()=>Error('PRIVATE_TIP_BUDGET_INVALID');
const micro=value=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1000000000)throw bad();return value;};
/** Estimates protect future research; authoritative commitments include holds,
 * not just settled charges. Never spend an allowance as if it were a balance. */
export function creatorTipAllocation({capUsd,estimateUsd,fundedMicroUsd,committedMicroUsd,tippedMicroUsd=0,count}){
 if(!Number.isFinite(capUsd)||capUsd<=0||capUsd>1000||!Number.isFinite(estimateUsd)||estimateUsd<=0||estimateUsd>capUsd||!Number.isInteger(count)||count<0||count>12)throw bad();
 const cap=Math.floor(capUsd*1000000),funded=micro(fundedMicroUsd),committed=micro(committedMicroUsd),reserve=Math.ceil(estimateUsd*1000000);
 const tipped=micro(tippedMicroUsd);if(tipped>committed)throw bad();
 const remaining=Math.max(0,Math.min(cap,funded)-committed),pool=Math.min(Math.max(0,Math.floor(cap/5)-tipped),Math.max(0,remaining-reserve));
 return {remainingMicroUsd:remaining,researchReserveMicroUsd:reserve,tipPoolMicroUsd:pool,perCreatorMicroUsd:count?Math.min(1000000,Math.floor(pool/count)):0};
}
export async function runPrivateCreatorTips({state,report,docs,run,actionId,judge,progress,readBudget,checkpoint,ownerQuestion,externalTool}){
 if(!state.brief.tipCreators||state.brief.liveWeb!==true)return;
 const paidUrls=new Set(state.events.filter(e=>e.type==='tool.call'&&e.tool==='tip_creator'&&e.result?.ok).map(e=>e.input?.url));
 const seen=new Set(),candidates=citedTipCandidates(report).filter(source=>{
  const assessment=source.creatorAssessment;
  if(assessment?.source!=='extension-page-model'||assessment.eligible!==true||assessment.kind!=='content')return false;
  const key=new URL(source.url).origin+'|'+String(assessment.author??'');
  if(seen.has(key)||paidUrls.has(source.url))return false;seen.add(key);return true;
 }).slice(0,12);
 const note=(text,detail={})=>progress('tips',text,{origin:'system',...detail});
 if(!candidates.length){await note('Creator tipping is enabled. No eligible creator page was both verified and cited in the report; no tip was sent.');return;}
 if(typeof readBudget!=='function'||typeof ownerQuestion!=='function'||typeof externalTool!=='function'||typeof judge!=='function')throw Error('PRIVATE_TIP_WORKFLOW_UNAVAILABLE');
 const input={urls:candidates.map(s=>s.url),estimate:state.plan.estimate,cap:state.budgetCap};
 const budget=checkpoint?await checkpoint.operation('creator-tip-budget',input,readBudget):await readBudget();
 if(!Number.isInteger(budget.remainingApprovals)||budget.remainingApprovals<0||budget.remainingApprovals>12)throw bad();
 const selected=candidates.slice(0,budget.remainingApprovals);
 const allocation=creatorTipAllocation({capUsd:state.budgetCap,estimateUsd:state.plan.estimate,...budget,count:selected.length});
 await note(`Creator tip budget: $${(allocation.tipPoolMicroUsd/1000000).toFixed(6)} maximum; $${(allocation.researchReserveMicroUsd/1000000).toFixed(6)} retained for research and follow-ups.`);
 if(!selected.length||allocation.perCreatorMicroUsd<1000){await note('No creator tip was sent: the remaining budget or approval limit cannot support a tip while protecting research.');return;}
 const amounts=[...new Set([.1,.25,.5,1].map(part=>Math.max(1000,Math.floor(allocation.perCreatorMicroUsd*part))))].sort((a,b)=>a-b);
 const decide=createPrivateJudge({state,judge,run,actionId,progress});
 for(const source of selected){
  const doc=docs.find(d=>d.url===source.url);
  const answers=await decide({state:{researchQuestion:String(state.brief.topic??'').slice(0,1500),reportExcerpt:String(report.markdown??'').slice(0,1800),source:{url:source.url,title:source.title,author:source.creatorAssessment.author,trust:source.trust,excerpt:String(doc?.text??'').slice(0,800)},budget:allocation,allowedAmountsMicroUsd:amounts,preference:'Creator tips are enabled: favor a positive affordable tip for every attributable original creator whose work substantively contributed to the cited report. Treat the tip as appreciation separate from an access purchase; paid access does not disqualify a contribution. Preserve the research reserve. Never reward irrelevant or uncited work merely to spend the pool.'},questions:{eligible:{type:'choice',instructions:'Evaluate this contribution against the research question and report, not against a generic factual-guide standard. Favor eligible when attributable original work substantively contributed to the cited report. Original fiction, satire, art and personal observations qualify as primary evidence about their own content when that is what the report analyzes; this never makes them proof of real-world factual claims. Paid access is separate from appreciation and is not grounds to reject a tip. Reject indexes, feeds, aggregators, corporate landing pages, duplicate work, irrelevant material and sources unreliable for the claims actually made. Hub membership and the extension detector are discovery signals, not authority over evidence.',criteria:{eligible:'Attributable original creator work substantively used, reliable for the role it plays in this report.',ineligible:'Not an attributable eligible creator contribution.'}},amount:{type:'choice',instructions:'Choose an exact integer USD-millionth amount from the allowed amounts, based on this creator contribution and the protected budget. Do not spend the research reserve. Favor a meaningful positive affordable tip for a qualifying contribution; weigh its use in the report and other creators sharing the pool, not the minimum amount by default. Prior access payments reduce the available budget but do not replace appreciation.',criteria:Object.fromEntries(amounts.map(n=>[String(n),`Tip $${(n/1000000).toFixed(6)} for this contribution.`]))}}},'creator-tip');
  const recommended=answers.eligible.choice==='eligible';
  if(!recommended)await note('JEV recommends skipping this cited creator. Waiting for the owner to approve a bounded tip or explicitly skip it before settlement.',{url:source.url});
  const amount=Number(answers.amount.choice);if(!amounts.includes(amount))throw bad();
  const request={tool:'tip_creator',url:source.url,maxMicroUsd:amount};
  const approval=await ownerQuestion({prompt:'Tip this cited creator?',why:`${recommended?'JEV recommends this tip.':'JEV recommends skipping this creator; approve only if you still want to thank them.'} Its bounded amount is $${(amount/1000000).toFixed(6)}. The research reserve is protected. The payment service receives this public page URL and amount.`,externalRequest:request,options:[{id:'approve',label:`Tip $${(amount/1000000).toFixed(6)}`},{id:'decline',label:'Skip this tip'}]});
  const result=approval.optionId==='approve'?await externalTool({request,answer:approval}):{ok:false,declined:true};
  if(result.ok&&(!Number.isSafeInteger(result.costMicroUsd)||result.costMicroUsd<0||result.costMicroUsd>amount))throw bad();
  state.events.push({type:'tool.call',tool:'tip_creator',input:request,result,why:recommended?'JEV-recommended appreciation with the research reserve retained.':'Owner-approved appreciation after a disclosed JEV skip recommendation, with the research reserve retained.',...(result.ok?{costUsd:result.costMicroUsd/1000000}:{}),at:new Date().toISOString()});
  await note(result.ok?`Creator tip ${result.output?.held?'deposited for creator claim':'confirmed'}. Expense: $${(result.costMicroUsd/1000000).toFixed(6)}.`:'The owner declined this creator tip; no transfer was started.',{origin:'tool',tool:'tip_creator'});
 }
 if(selected.length<candidates.length)await note('Further creator tips were limited by the remaining approval allowance; research and its budget remain protected.');
}
