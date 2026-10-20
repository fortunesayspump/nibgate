/** Adapt the isolated money service to the existing escrow UI contract. */
export function privateFundingShape(value:any){
    if(!value?.job)return value;
    const job=value.job;
    if(!/^\d{1,78}$/.test(job.jobId??'')||typeof job.status!=='string'||
       typeof job.budget!=='number'||!Number.isFinite(job.budget)||job.budget<0||
       !['client','provider','evaluator'].every(k=>/^0x[0-9a-f]{40}$/i.test(job[k]??'')))
        throw Error('Invalid private escrow status. No funding approval was inferred.');
    return {...value,job:{...job,chain:{client:job.client,provider:job.provider,
        evaluator:job.evaluator,status:job.status,budget:job.budget}}};
}

/** Readiness is checked before planning and before any wallet prompt. */
export function requirePrivateResearchInputs(brief:any,sources:any[]){
    const uploaded=Array.isArray(sources)&&sources.some(s=>typeof s?.id==='string'&&/^[0-9a-f-]{36}$/i.test(s.id)&&typeof s.name==='string'&&s.name.length>0&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=2*1024*1024);
    const direct=brief?.liveWeb===true&&brief.searchEnabled===false;
    const web=brief?.liveWeb===true&&brief.publicResearch?.approved===true&&Object.keys(brief.publicResearch).sort().join(',')==='approved,brief'&&typeof brief.publicResearch.brief==='string'&&brief.publicResearch.brief.trim().length>=3&&brief.publicResearch.brief.length<=400;
    if(!uploaded&&!web&&!direct)throw Error('Add an uploaded source or enable public URL reads or approve web search before planning or funding. The upload must finish successfully.');
}
