/** Model judgments are untrusted. Only numeric source references and literal
 * passages from the supplied evidence can support a sampled report claim. */
const failures=new WeakMap();
const completedOutputFailures=new WeakSet();
function invalidOutput(code){const error=Error(code);completedOutputFailures.add(error);return error;}
export function privateVerificationCanRecover(error){return completedOutputFailures.has(error);}
// These details may leave the worker only inside the encrypted action receipt.
export function privateClaimFailureDetails(error){return failures.get(error)??null;}
export function validatePrivateClaims(value,docs){
    const claims=value?.claims;
    if(!Array.isArray(claims)||claims.length<1||claims.length>8||claims.some(c=>!c||typeof c.text!=='string'||!c.text.trim()||c.text.length>2000||!['supported','unsupported','unknown'].includes(c.verdict)||!Array.isArray(c.sourceIds)||c.sourceIds.length>8))throw invalidOutput('PRIVATE_VERIFICATION_SCHEMA_INVALID');
    if(claims.some(c=>c.sourceIds.some(n=>!Number.isSafeInteger(n)||n<1||n>docs.length)))throw invalidOutput('PRIVATE_VERIFICATION_SOURCE_INVALID');
    if(claims.some(c=>c.verdict==='supported'&&(!c.sourceIds.length||typeof c.quote!=='string'||c.quote.length<3||c.quote.length>2000||!c.sourceIds.some(n=>docs[n-1].text.includes(c.quote)))))throw invalidOutput('PRIVATE_VERIFICATION_QUOTE_INVALID');
    if(claims.some(c=>c.verdict==='unsupported')){
        const error=invalidOutput('PRIVATE_UNSUPPORTED_REPORT');
        failures.set(error,{rejectedClaims:claims.filter(c=>c.verdict==='unsupported').slice(0,3).map(c=>({text:c.text,sourceIds:[...c.sourceIds]}))});
        throw error;
    }
    if(!claims.some(c=>c.verdict==='supported'))throw invalidOutput('PRIVATE_VERIFICATION_INSUFFICIENT');
    return claims.map(c=>({text:c.text,verdict:c.verdict,sourceIds:c.sourceIds,quote:typeof c.quote==='string'?c.quote:''}));
}

/** Retry one completed malformed judgment, never an unknown provider outcome.
 * Request/receipt/accounting failures occur outside the pure output catch. */
export async function verifyPrivateReportClaims({request,parse,docs,onRepair}){
    let previousFailure;
    for(let attempt=0;attempt<2;attempt++){
        const response=await request(previousFailure);
        try{
            const value=parse(response);
            return {...value,claims:validatePrivateClaims(value,docs)};
        }catch(error){
            const format=['PRIVATE_MODEL_JSON_INVALID','PRIVATE_MODEL_OUTPUT_TRUNCATED','PRIVATE_MODEL_OUTPUT_INVALID'].includes(error?.message);
            if(format)completedOutputFailures.add(error);
            const malformed=format||privateVerificationCanRecover(error)&&['PRIVATE_VERIFICATION_SCHEMA_INVALID','PRIVATE_VERIFICATION_SOURCE_INVALID','PRIVATE_VERIFICATION_QUOTE_INVALID'].includes(error.message);
            if(!malformed||attempt===1)throw error;
            previousFailure=error.message;
            await onRepair?.();
        }
    }
}

/** Model-selected passage identifiers bind to worker-owned literal evidence.
 * The model cannot manufacture a quote or assign another source to a passage. */
export async function verifyPrivateReportPassages({request,parse,docs,excerpts}){
    if(!Array.isArray(excerpts)||!excerpts.length||excerpts.length>100)throw invalidOutput('PRIVATE_VERIFICATION_SOURCE_INVALID');
    const passages=excerpts.filter(p=>typeof p?.excerpt==='string'&&p.excerpt.trim().length>=3).map((p,i)=>{
        if(!Number.isSafeInteger(p.citationIndex)||p.citationIndex<1||p.citationIndex>docs.length||typeof p.excerpt!=='string'||p.excerpt.length<3||p.excerpt.length>2000||!docs[p.citationIndex-1].text.includes(p.excerpt))throw invalidOutput('PRIVATE_VERIFICATION_SOURCE_INVALID');
        return {id:'p'+i,sourceId:p.citationIndex,title:p.title,text:p.excerpt};
    });
    if(!passages.length)throw invalidOutput('PRIVATE_VERIFICATION_SOURCE_INVALID');
    const response=await request(passages);
    let value;
    try{value=parse(response)}catch(error){if(['PRIVATE_MODEL_JSON_INVALID','PRIVATE_MODEL_OUTPUT_TRUNCATED','PRIVATE_MODEL_OUTPUT_INVALID'].includes(error?.message))completedOutputFailures.add(error);throw error;}
    if(!Array.isArray(value?.claims)||value.claims.length<1||value.claims.length>8)throw invalidOutput('PRIVATE_VERIFICATION_SCHEMA_INVALID');
    const byId=new Map(passages.map(p=>[p.id,p]));
    const claims=value.claims.map(claim=>{
        if(!claim||typeof claim!=='object')throw invalidOutput('PRIVATE_VERIFICATION_SCHEMA_INVALID');
        const passage=byId.get(claim.passageId);
        if(claim.verdict==='supported'&&!passage)throw invalidOutput('PRIVATE_VERIFICATION_SOURCE_INVALID');
        return {text:claim.text,verdict:claim.verdict,sourceIds:passage?[passage.sourceId]:[],quote:passage?passage.text:''};
    });
    return {...value,claims:validatePrivateClaims({claims},docs)};
}

/** One revision is permitted only after an authenticated completion has yielded
 * a known unsupported-claim judgment. Failed transport or accounting never retries. */
export async function verifyAndRepairPrivateReport({markdown,verify,repair,validateRevision}){
    try{return {markdown,verification:await verify(markdown)}}catch(error){
        const rejected=privateClaimFailureDetails(error);if(!rejected)throw error;
        const revised=await repair(markdown,rejected.rejectedClaims);
        validateRevision(revised);
        return {markdown:revised,verification:await verify(revised)};
    }
}
