import {cleanPrivateReportCitations} from '@nibgate/internal/private-report-citations.js';
import {privateNarrationMessages} from './private-narration.js';
import {runPrivateTerminal} from './private-terminal.js';
import {runPrivateCreatorTips} from './private-creator-tips.js';
import {PRIVATE_USAGE,PRIVATE_METERED_COST,PRIVATE_CALL_CHARGE} from './phala-ai-port.js';
import { randomUUID } from 'node:crypto';
import { RESEARCH_SYSTEM } from '../llm/prompts.js';
import {generateIntakeBatch,generatePlan,generateReport,generateReportLong,generateThinking,generateRoundReview} from '../llm/generate.js';
import {createPrivateGeneration} from './private-generation.js';
import { resolveLength, countWords, FLOOR_RATIO } from '../length.js';
import { parseSource } from '../sources/parse.js';
import { renderExport, RENDERABLE } from '../exports/render.js';
import { createPrivateToolPolicy } from './private-tool-policy.js';
import {verifyPrivateReportPassages,verifyPrivateReportClaims,privateVerificationCanRecover,verifyAndRepairPrivateReport} from './private-verification.js';
import {runPrivateResearchAgent} from './private-research-agent.js';
import {createPrivateJudge} from './private-judge.js';
import {privateBudgetMicroUsd} from './private-run-budget.js';
import {runPrivateCode} from './private-code.js';
const json = v => { const text = v?.choices?.[0]?.message?.content;
    if (v?.choices?.[0]?.finish_reason === 'length') throw Error('PRIVATE_MODEL_OUTPUT_TRUNCATED');
    if (typeof text !== 'string' || text.length > 100000) throw Error('PRIVATE_MODEL_OUTPUT_INVALID');
    try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); }
    catch { throw Error('PRIVATE_MODEL_JSON_INVALID'); } };
const text = v => { const s = v?.choices?.[0]?.message?.content; if (typeof s !== 'string' || !s.trim() || s.length > 100000 || v.choices[0].finish_reason === 'length')
    throw Error('PRIVATE_MODEL_OUTPUT_INVALID'); return s; };
const bounded = (value, max = 8000) => { if (typeof value !== 'string' || value.length > max)
    throw Error('PRIVATE_WORKFLOW_INPUT_INVALID'); return value; };
function questions(value) {
    if (!Array.isArray(value) || value.length > 5)
        throw Error('PRIVATE_INTAKE_INVALID');
    return value.map((q, i) => {
        if (!q || typeof q.key !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(q.key) || !['pick_one', 'pick_any'].includes(q.type) || typeof q.prompt !== 'string' || q.prompt.length > 500 || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some(o => typeof o?.id !== 'string' || o.id.length > 50 || typeof o.label !== 'string' || o.label.length > 160))
            throw Error('PRIVATE_INTAKE_INVALID');
        return { ...q, seq: i, allowOther: q.allowOther === true, source: 'confidential-model' };
    });
}
/** Protected orchestration uses the existing research prompts, parser, length
 * and export renderers. All external ports are explicit; no ordinary provider,
 * JEV, event logger, wallet, sandbox, queue or global lessons are imported. */
export function createPrivateWorkflow({ infer, judge, publicRetrieval, runCode=runPrivateCode,runTerminal=runPrivateTerminal,parser = parseSource, renderer = renderExport, estimate } = {}) {
    if (typeof infer !== 'function')
        throw Error('PRIVATE_WORKFLOW_UNAVAILABLE');
    return async ({ state, action, args = {}, sources = [], run, actionId, signal, onProgress, financialReceipt,checkpoint,externalTool,readBudget }) => {
        const s = structuredClone(state), now = () => new Date().toISOString();
        s.decisions ??= [];
        s.steps ??= [];
        s.events ??= [];
        s.reports ??= [];
        const eventStart = s.events.length;
        const event = (type, detail = {}) => s.events.push({ id:randomUUID(),type, at: now(), ...detail });
        const progress = async (phase, note, detail = {}) => {
            event('thinking', { origin:'system',phase, text: note,...detail });
            const snapshot={ events:s.events.slice(eventStart),decisions:s.decisions.slice(-16).map(({question,...record})=>record) };
            if (snapshot.events.length > 512 || Buffer.byteLength(JSON.stringify(snapshot)) > 512*1024) throw Error('PRIVATE_PROGRESS_LIMIT');
            if (onProgress) await onProgress(snapshot);
        };
        const notes = { intake: 'Preparing intake questions.', thinking: 'Reviewing your answers.', plan: 'Preparing the research plan.', review:'Reviewing findings and remaining evidence gaps.',write: 'Writing the report from the collected evidence.', verify: 'Checking report claims against the evidence.', discuss: 'Reviewing the report for your follow-up question.' };
        const protectedInfer = async request => {
            if(signal?.aborted)throw Error('PRIVATE_WORKFLOW_CANCELLED');
            await progress(request.stage, notes[request.stage] ?? 'Processing the current research step.');
            const input={...request,messages:privateNarrationMessages(request.stage,request.messages),budgetMicroUsd:privateBudgetMicroUsd(s.budgetCap)};
            const result=await (checkpoint?checkpoint.operation('infer',input,infer):infer(input));
            const charge=result?.[PRIVATE_CALL_CHARGE],usage=result?.[PRIVATE_USAGE],cost=result?.[PRIVATE_METERED_COST];
            if(Number.isSafeInteger(cost)&&cost>=0)await progress(request.stage,usage?.privacy==='hosted-provider-visible'?'OpenRouter ZDR fallback response received. OpenRouter and Azure processed this research context; this inference was provider-visible.':'Model response received.',{origin:'usage',...(charge?.callId?{id:'usage:'+charge.callId}:{}),model:usage?.model??'confidential',...(usage?.privacy?{privacy:usage.privacy,source:usage.source}:{}),costUsd:cost/1000000,billingKind:charge?.billingKind??'unknown',inputTokens:usage?.inputTokens,outputTokens:usage?.outputTokens});
            return result;
        };
        const protectedJudge=typeof judge==='function'?async request=>{
            if(signal?.aborted)throw Error('PRIVATE_WORKFLOW_CANCELLED');
            const input={...request,messages:privateNarrationMessages(request.stage,request.messages),budgetMicroUsd:privateBudgetMicroUsd(s.budgetCap)};
            return checkpoint?checkpoint.operation('judge',input,judge):judge(input);
        }:undefined;
        const decide=protectedJudge?createPrivateJudge({state:s,judge:protectedJudge,run,actionId,progress}):null;
        const generate=createPrivateGeneration({infer:protectedInfer,run,actionId});
        const call = async (messages,stage,json=false) => { if (signal?.aborted)
            throw Error('PRIVATE_WORKFLOW_CANCELLED'); return protectedInfer({ run, actionId, messages,json,stage }); };
        const briefForModel=()=>({...s.brief,guidance:[s.brief?.guidance,(s.brief?.intake??[]).map(i=>i.question+': '+i.answer).join('\n')].filter(Boolean).join('\n')});
        if (action === 'intake') {
            if(!['intake','draft'].includes(s.status))throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            const generated=await generate('intake',()=>generateIntakeBatch({topic:s.brief.topic,answered:[],count:3,allowEmpty:true}));
            if(generated.source!=='llm')throw Error('PRIVATE_INTAKE_INVALID');
            const qs = questions(generated.questions);
            s.questions = qs;
            s.decisions = qs.map(q => ({ id: randomUUID(), kind: 'question', seq: q.seq, question: q, createdAt: now() }));
            if(decide&&qs.length){
                const answers=await decide({state:{question:s.brief.topic.slice(0,1500),candidates:qs.map(q=>({key:q.key,prompt:q.prompt.slice(0,300),options:q.options.map(o=>({id:o.id,label:o.label.slice(0,120)}))}))},questions:Object.fromEntries(qs.map((q,i)=>['question_'+i,{type:'choice',instructions:`Does candidate intake question ${i} materially clarify the user's research goal or available evidence? Skip redundant, already answered or irrelevant questions.`,criteria:{ask:'Ask this useful clarification.',skip:'Skip this question.'}}]))},'intake-gate');
                const kept=qs.filter((_q,i)=>answers['question_'+i].choice==='ask');
                s.questions=kept;
                s.decisions=s.decisions.filter(d=>d.kind!=='question'||kept.some(q=>q.key===d.question.key));
            }
            s.status = s.questions.length?'intake':'intake-done';
            if(!qs.length)await progress('intake','No clarification questions were proposed. Your brief is ready for planning.');
        }
        else if (action === 'answers') {
            if (s.status !== 'intake' || !Array.isArray(args.answers) || args.answers.length < 1 || args.answers.length > 10)
                throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            for (const a of args.answers) {
                const d = s.decisions.find(d => d.kind === 'question' && d.seq === a.seq);
                if (!d || d.answer || !a.answer || Object.keys(a.answer).some(k => !['text', 'optionIds'].includes(k)))
                    throw Error('PRIVATE_ANSWER_INVALID');
                const answer = { text: bounded(a.answer.text ?? '', 4000), optionIds: a.answer.optionIds ?? [] };
                if (!Array.isArray(answer.optionIds) || answer.optionIds.length > 6 || answer.optionIds.some(id => !d.question.options.some(o => o.id === id)))
                    throw Error('PRIVATE_ANSWER_INVALID');
                d.answer = answer;
                d.answeredAt = now();
            }
            if (s.decisions.filter(d => d.kind === 'question').every(d => d.answer)) {
                s.status = 'intake-done';
                s.questions = [];
            }
            const answered=s.decisions.filter(d=>d.kind==='question'&&d.answer);
            const thinking=await generate('thinking',()=>generateThinking({brief:briefForModel(),
                question:{prompt:answered.map(d=>d.question.prompt).join('\n')},
                answer:answered.map(d=>[...(d.answer.optionIds??[]).map(id=>d.question.options.find(o=>o.id===id)?.label??id),d.answer.text??''].filter(Boolean).join('; ')).join('\n')})).catch(()=>null);
            s.thinking=thinking?.source==='llm'?thinking.text:null;
            if(s.thinking)await progress('thinking',s.thinking,{origin:'model-summary'});
        }
        else if (action === 'finish-intake') {
            if (!['intake', 'intake-done'].includes(s.status))
                throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            s.status = 'intake-done';
        }
        else if (action === 'configure') {
            if (!['intake-done', 'planned'].includes(s.status))
                throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            if (!['quick', 'standard', 'deep'].includes(args.depth ?? 'standard') || typeof args.budgetCap !== 'number' || !Number.isFinite(args.budgetCap) || args.budgetCap < 0 || args.budgetCap > 1000 || args.tipCreators!==undefined&&typeof args.tipCreators!=='boolean' || args.searchEnabled!==undefined&&typeof args.searchEnabled!=='boolean')
                throw Error('PRIVATE_CONFIGURE_INVALID');
            if (args.liveWeb === true && args.searchEnabled!==false && !(args.publicResearch?.approved === true && Object.keys(args.publicResearch).sort().join(',')==='approved,brief' && typeof args.publicResearch.brief === 'string' && args.publicResearch.brief.trim().length>=3 && args.publicResearch.brief.length<=400 && (typeof publicRetrieval==='function'||typeof externalTool==='function')))
                throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
            if(args.liveWeb===true&&args.searchEnabled===false&&typeof externalTool!=='function')throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
            if(args.liveWeb!==true&&!sources.length)throw Error('PRIVATE_SOURCE_REQUIRED');
            s.brief = { ...s.brief, qualityPolicyVersion:2, searchEnabled:args.liveWeb===true&&args.searchEnabled!==false, depth: args.depth ?? 'standard', liveWeb: args.liveWeb === true, length: args.length ?? 'standard', lengthWords: args.lengthWords, formats: args.formats ?? ['pdf'], tipCreators: args.tipCreators===true,
                publicResearch: args.liveWeb === true && args.searchEnabled!==false ? args.publicResearch : null, intake: s.decisions.filter(d => d.kind === 'question' && d.answer).map(d => ({ question: d.question.prompt, answer:[...(d.answer.optionIds??[]).map(id=>d.question.options.find(o=>o.id===id)?.label??id),d.answer.text??''].filter(Boolean).join('; ') })) };
            s.budgetCap=args.budgetCap;
            const target = resolveLength(s.brief), plan = await generate('plan',()=>generatePlan({brief:briefForModel(),guidance:s.pendingGuidance??null}));
            if(plan.source!=='llm')throw Error('PRIVATE_PLAN_INVALID');
            if (!Array.isArray(plan.sub_questions) || !plan.sub_questions.length || plan.sub_questions.length > 12 || plan.sub_questions.some(q => typeof q !== 'string' || q.length > 600))
                throw Error('PRIVATE_PLAN_INVALID');
            if (plan.sub_questions.length < target.sections || typeof estimate !== 'function')
                throw Error('PRIVATE_PLAN_INVALID');
            const quote = estimate({ sections: target.sections, words:target.words, depth:s.brief.depth });
            const ceiling=typeof quote==='number'?quote:quote.estimate,minimumFunding=typeof quote==='number'?quote:quote.minimumFunding;
            if (!Number.isFinite(ceiling) || ceiling <= 0 || !Number.isFinite(minimumFunding)||minimumFunding<=0|| Math.max(ceiling,minimumFunding) > args.budgetCap)
                throw Error('PRIVATE_BUDGET_TOO_SMALL');
            s.plan = { sub_questions: plan.sub_questions, uncertainties: plan.uncertainties ?? [], estimate: ceiling, minimumFunding, estimateKind:typeof quote==='number'?'bound':quote.kind, why: plan.why ?? '', source: 'llm' };
            s.budgetCap = args.budgetCap;
            s.status = 'planned';
            event('step.finished', { kind: 'plan' });
            if(s.plan.why)await progress('plan',s.plan.why,{origin:'model-summary'});
        }
        else if (action === 'edit-plan') {
            if (s.status !== 'planned' || !Array.isArray(args.sub_questions) || !args.sub_questions.length || args.sub_questions.length > 12 || args.sub_questions.some(q => typeof q !== 'string' || q.length > 600))
                throw Error('PRIVATE_PLAN_INVALID');
            s.plan.sub_questions = args.sub_questions;
        }
        else if (action === 'guidance') {
            s.pendingGuidance = { text: bounded(args.text) };
            event('guidance.applied');
        }
        else if (action === 'pause') {
            if (!['running', 'planned'].includes(s.status))
                throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            s.status = 'paused';
            s.pauseReason = 'user';
        }
        else if (action === 'end') {
            s.status = 'ended';
            s.endedAt = now();
            event('ended');
        }
        else if (action === 'execute' || action === 'resume' || action === 'revise') {
            if(privateBudgetMicroUsd(s.budgetCap)===undefined||s.budgetCap<=0||!Array.isArray(s.plan?.sub_questions)||!s.plan.sub_questions.length)throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            if (action === 'revise') {
                if (s.reports.length >= 10)
                    throw Error('PRIVATE_VERSION_LIMIT');
                if (!['complete', 'ended'].includes(s.status))
                    throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
                s.pendingGuidance = { text: bounded(args.prompt) };
                s.version = (s.version ?? 1) + 1;
            }
            else if (!['planned', 'paused'].includes(s.status))
                throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            s.status = 'running';
            await progress('sources', 'Reading the uploaded sources inside the private worker.');
            let docs = [];
            for (const source of sources) {
                const bytes = Buffer.from(source.contentBase64 ?? '', 'base64');
                if (bytes.length !== source.bytes || bytes.length > 2 * 1024 * 1024 || typeof source.name !== 'string')
                    throw Error('PRIVATE_SOURCE_INVALID');
                try {
                    let parsed;
                    try{parsed=checkpoint?await checkpoint.operation('parse',{id:source.id,name:source.name,contentBase64:source.contentBase64},()=>parser(source.name,bytes)):await parser(source.name,bytes);}catch(error){if(['PRIVATE_ACTION_PAUSED','PRIVATE_CHECKPOINT_UNCERTAIN','PRIVATE_CHECKPOINT_FENCED','PRIVATE_CHECKPOINT_LIMIT'].includes(error?.message))throw error;throw Error('PRIVATE_SOURCE_INVALID');}
                    if (!parsed?.text || parsed.truncated)
                        throw Error('PRIVATE_SOURCE_LIMIT');
                    docs.push({ id: source.id, title: source.name, url: `user-upload://${source.id}`, text: parsed.text, provider: 'user-upload', trust: null });
                }
                finally {
                    bytes.fill(0);
                }
            }
            if (s.brief.liveWeb && s.brief.searchEnabled!==false && !judge) {
                await progress('search', 'Searching public sources with your approved public research query.');
                const tools = createPrivateToolPolicy({ publicRetrieval });
                const publicDocs = checkpoint?await checkpoint.operation('public-retrieval',s.brief.publicResearch,()=>tools.publicResearch(s.brief.publicResearch,{preferCreators:s.brief.tipCreators===true})):await tools.publicResearch(s.brief.publicResearch,{preferCreators:s.brief.tipCreators===true});
                if (!Array.isArray(publicDocs) || publicDocs.length > 30)
                    throw Error('PRIVATE_RETRIEVAL_INVALID');
                docs.push(...publicDocs);
            }
            const codePort=async input=>{try{return {ok:true,...await runCode(input)}}catch(error){if(/^PRIVATE_CODE_(?:INPUT_INVALID|FAILED|TIMEOUT|BUSY)$/.test(error?.message??''))return {ok:false,error:error.message};throw Error('PRIVATE_CODE_FAILED')}};
            const reviewRound=async({round,docs})=>{
                const review=await generate('review',()=>generateRoundReview({brief:briefForModel(),round,sources:docs.map(d=>({...(s.brief.qualityPolicyVersion>=2?{availableCharacters:d.text.length,evidenceKind:d.evidenceKind??'retrieved-text'}:{}),title:d.title+(d.evidenceKind==='search-excerpt'?' [search excerpt only; full text not retrieved]':''),url:d.url,excerpt:d.text.slice(0,3000),text:s.brief.qualityPolicyVersion>=2?d.text:d.text.slice(0,3000)}))}));
                if(review.source!=='llm')throw Error('PRIVATE_REVIEW_INVALID');return review;
            };
            if (protectedJudge) docs=await runPrivateResearchAgent({state:s,docs,directReadsFirst:checkpoint?.value?.toolPolicyVersion==='direct-urls-first-v1',infer:protectedInfer,judge:protectedJudge,run,actionId,publicRetrieval:checkpoint?input=>checkpoint.operation('public-retrieval',input,publicRetrieval):publicRetrieval,runCode:checkpoint?input=>checkpoint.operation('code',input,codePort):codePort,runTerminal:checkpoint?input=>checkpoint.operation('terminal',input,runTerminal):runTerminal,ownerQuestion:checkpoint?.ownerQuestion,externalTool,reviewRound,progress});
            if (!docs.length)
                throw Error('PRIVATE_EVIDENCE_REPAIR_REQUIRED');
            const excerpts = docs.flatMap((d, n) => (d.text.match(/[\s\S]{1,1700}/g) ?? []).map((excerpt, i) => ({ title: `${d.title}${d.evidenceKind==='search-excerpt'?' [search excerpt only; full page not retrieved]':''} (part ${i + 1})`, excerpt, citationIndex: n + 1, url: d.url })));
            if (excerpts.length > 100)
                throw Error('PRIVATE_SOURCE_LIMIT');
            s.sources = docs.map(({ text, ...d }) => d);
            const target = resolveLength(s.brief), sections = s.plan.sub_questions.slice(0, target.sections);
            const calculations=s.events.slice(eventStart).filter(e=>e.type==='tool.call'&&['compute','run_code','run_terminal'].includes(e.tool)).map(e=>({tool:e.tool,input:e.input,result:e.tool==='run_terminal'?{stdout:e.result?.stdout,exitCode:e.result?.exitCode,timedOut:e.result?.timedOut}:e.result?.result}));
            const reviews=s.events.slice(eventStart).filter(e=>e.type==='round.reviewed').map(e=>({round:e.round,learnings:e.learnings,followUps:e.followUps}));
            const researchGuidance=[s.pendingGuidance?.text,calculations.length?'Worker calculations and terminal observations (inputs are model-selected and must be checked against cited source evidence, never independent evidence or proof of causation): '+JSON.stringify(calculations):null,reviews.length?'Research reviews are hypotheses and open questions, not independent source evidence. Verify their findings against cited passages and disclose unresolved follow-ups: '+JSON.stringify(reviews):null].filter(Boolean).join('\n');
            const writingBrief=briefForModel(),guidance=researchGuidance?{text:researchGuidance}:null;
            writingBrief.guidance=[writingBrief.guidance,'Approved research questions: '+sections.join('; ')].filter(Boolean).join('\n');
            // Match the ordinary writer's short/long split. A 500-word report
            // need not pay for independent introductions, sections and ending.
            const generated=await generate('write',()=>target.words<=1200?
                // The shared generator reserves 175 words for its abstract.
                // Keep the requested body floor even if that optional pass fails.
                generateReport({brief:writingBrief,sources:excerpts,guidance,runId:run.id,version:s.version??1,targetWords:s.brief.qualityPolicyVersion>=2?target.words:target.words+175,includeAbstract:s.brief.qualityPolicyVersion>=2?target.words>1200:true}):
                generateReportLong({brief:writingBrief,sections,getEvidence:async()=>excerpts,
                    allSources:s.sources,guidance,runId:run.id,version:s.version??1,requireGeneratedSections:true}));
            if(generated.source!=='llm'||typeof generated.markdown!=='string')throw Error('PRIVATE_REPORT_GENERATION_FAILED');
            let markdown=generated.markdown;
            if(countWords(markdown)<target.words*FLOOR_RATIO)throw Error('PRIVATE_REPORT_LENGTH_UNMET');
            event('step.finished',{kind:'write'});
            // A protected content judgment; unknown is never promoted to supported.
            const qualityCheck=s.brief.qualityPolicyVersion>=2?' Cross-check the central conclusion and every broad guarantee against all relevant evidence, including authoritative specifications and their preconditions. A supporting quote from one tutorial does not establish truth when another supplied source contradicts it or narrows its scope. Mark an overbroad or contradicted guarantee unsupported; do not select only a convenient supporting passage. Prioritize these material claims within the eight-claim sample.':'';
            const verifyReport = async markdown => {try{return await verifyPrivateReportClaims({docs,parse:json,onRepair:()=>progress('recovery','The completed source check returned invalid citations or quote formatting. Correcting the check once; source matching remains strict.'),request:previousFailure=>call([{ role: 'system', content: RESEARCH_SYSTEM + ' Verify the report against the supplied evidence. Return JSON {"claims":[{"text":"claim","verdict":"supported|unsupported|unknown","sourceIds":[1],"quote":"exact supporting passage"}]}. Check at most eight representative claims, including core measurements and limitations. sourceIds must be integer citationIndex values from the supplied excerpts, never excerpt positions, UUIDs or strings. For each supported claim, quote a contiguous exact substring of one cited excerpt, preserving spelling, whitespace and punctuation. Never paraphrase, normalize whitespace or insert ellipses in a quote. If you cannot identify an exact supporting passage, use verdict unknown with quote "" and sourceIds []; do not invent support. Mark a contradicted claim unsupported. A verdict alone is insufficient.'+qualityCheck },
                { role: 'user', content: JSON.stringify({ report: markdown, sources: excerpts,...(previousFailure?{correction:'The previous completed check failed '+previousFailure+'. Copy a short contiguous exact passage from the supplied excerpt with its numeric citationIndex. Do not paraphrase or normalize quotes. Mark unknown when exact support is absent.'}:{}) }) }],'verify',true)});}catch(error){
                if(!privateVerificationCanRecover(error)||error.message==='PRIVATE_UNSUPPORTED_REPORT')throw error;
                await progress('recovery','The completed source check needs exact evidence references. Checking against numbered source passages; the worker supplies the original quote text.',{origin:'system'});
                return verifyPrivateReportPassages({docs,excerpts,parse:json,request:passages=>call([{role:'system',content:RESEARCH_SYSTEM+' Verify the report using only the supplied numbered source passages. Return JSON {"claims":[{"text":"a representative factual claim from the report","verdict":"supported|unsupported|unknown","passageId":"p0"}]}. Check at most eight representative claims, including core measurements and limitations. For supported claims, select the ID of a passage that actually supports the claim; the worker will attach its verbatim source text and citation. Never invent passage IDs or support. Use unknown with passageId null when evidence is absent. Mark contradicted report claims unsupported. Recommendations and hypothetical examples are not observations. Do not output quotes or sourceIds.'+qualityCheck},{role:'user',content:JSON.stringify({report:markdown,passages})}],'verify',true)});
            }};
            let checked;try{checked=await verifyAndRepairPrivateReport({markdown,verify:verifyReport,
                repair:async(draft,rejectedClaims)=>text(await call([{role:'system',content:RESEARCH_SYSTEM+' Revise the supplied draft using only the supplied evidence. Remove or correct every rejected claim. Preserve supported measurements and explicit limitations. Recommendations must be labeled as proposals, not observed outcomes. Do not invent costs, causal effects, significance or source support. Retain numeric citations. Return only the complete revised markdown report, at least '+target.words+' words.'},{role:'user',content:JSON.stringify({draft,rejectedClaims,sources:excerpts})}],'write')),
                validateRevision:revised=>{if(countWords(revised)<target.words*FLOOR_RATIO)throw Error('PRIVATE_REPORT_LENGTH_UNMET');}});}catch(error){if(privateVerificationCanRecover(error))throw Error('PRIVATE_REPORT_REPAIR_REQUIRED');throw error;}
            const cleaned=cleanPrivateReportCitations(checked.markdown,s.sources.length);
            if(cleaned.invalid.length)throw Error('PRIVATE_REPORT_REPAIR_REQUIRED');
            markdown=cleaned.markdown;const verification=checked.verification;
            await progress('verify',`${verification.claims.filter(c=>c.verdict==='supported').length}/${verification.claims.length} sampled claims have exact supporting source passages. These checks do not cover every sentence.`,{origin:'verification'});
            const report = { id: randomUUID(), version: s.version ?? 1, markdown, citations: s.sources, createdAt: now() };
            s.reports.push(report);
            s.claims = verification.claims.map(c => ({ ...c, status:c.verdict,passages:c.sourceIds.filter(n=>typeof c.quote==='string'&&docs[n-1].text.includes(c.quote)).map(n=>({sourceId:docs[n-1].id,url:docs[n-1].url,title:docs[n-1].title,text:c.quote})) }));
            await runPrivateCreatorTips({state:s,report,docs,run,actionId,judge:protectedJudge,progress,readBudget,checkpoint,ownerQuestion:checkpoint?.ownerQuestion,externalTool});
            s.status = 'complete';
            s.pendingGuidance = null;
            event('complete');
        }
        else if (action === 'discuss') {
            if ((s.metadata?.discuss?.length ?? 0) >= 100)
                throw Error('PRIVATE_DISCUSSION_LIMIT');
            const latest = s.reports.at(-1);
            if (!latest)
                throw Error('PRIVATE_REPORT_REQUIRED');
            const question = bounded(args.question, 4000);
            const response=await call([{ role: 'system', content: RESEARCH_SYSTEM + ' Answer only from this report; identify unsupported conclusions.' }, { role: 'user', content: JSON.stringify({ report: latest.markdown, question }) }],'discuss');
            const answer=text(response),cost=response[PRIVATE_METERED_COST],model=response[PRIVATE_USAGE]?.model??'confidential';
            const usage=Number.isSafeInteger(cost)&&cost>=0?{costUsd:cost/1000000,billingKind:response[PRIVATE_CALL_CHARGE]?.billingKind??'unknown'}:undefined;
            s.metadata ??= {};
            s.metadata.discuss ??= [];
            s.metadata.discuss.push({ role: 'user', content: question, createdAt: now() }, { role: 'assistant', content: answer, createdAt: now(),model,...(usage?{usage}:{}) });
            return { state: s, value: { answer, model, source: 'llm',...(usage?{usage}:{}) } };
        }
        else if (action === 'export') {
            if (!RENDERABLE.has(args.format))
                throw Error('PRIVATE_EXPORT_INVALID');
            const report = s.reports.at(-1);
            if (!report)
                throw Error('PRIVATE_REPORT_REQUIRED');
            const clean=cleanPrivateReportCitations(report.markdown,(report.citations??s.sources??[]).length);
            if(clean.invalid.length)throw Error('PRIVATE_REPORT_CITATION_INVALID');
            const out = await renderer(args.format, { report:{...report,markdown:clean.markdown}, sources: report.citations ?? s.sources ?? [], claims: s.claims ?? [], ledger: financialReceipt?.ledger ?? null, escrow: financialReceipt?.escrow ?? null, expenseReceipt:financialReceipt?.expenseReceipt??null, slug: `report-v${report.version}` });
            return { state: s, value: out };
        }
        else
            throw Error('PRIVATE_ACTION_UNAVAILABLE');
        s.updatedAt = now();
        return { state: s, value: s };
    };
}
