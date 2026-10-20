const DENIED = new Set(['http_request', 'web_search', 'web_fetch', 'run_code', 'tip_creator', 'unlock_content', 'pay_x402', 'rate_content', 'write_file', 'mcp']);
/** Private content cannot select an arbitrary network destination. Public
 * retrieval is a distinct input-only port with no reference to private state. */
export function createPrivateToolPolicy({ sources = [], publicRetrieval,runCode } = {}) {
    return Object.freeze({
        async run(name, input) {
            if(name==='run_code'&&typeof runCode==='function')return runCode(input);
            if (DENIED.has(name))
                throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
            if (name === 'search_evidence') {
                if (typeof input?.query !== 'string' || input.query.length > 500)
                    throw Error('PRIVATE_TOOL_INPUT_INVALID');
                const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
                return sources.flatMap(s => String(s.text ?? '').match(/[\s\S]{1,1700}/g)?.map((text, index) => ({ sourceId: s.id, text, index, score: terms.filter(t => text.toLowerCase().includes(t)).length })) ?? []).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
            }
            if (name === 'compute') {
                if (!input || Object.keys(input).sort().join(',') !== 'operation,values' || !Array.isArray(input.values) || input.values.length < 1 || input.values.length > 10000 || input.values.some(v => typeof v !== 'number' || !Number.isFinite(v)))
                    throw Error('PRIVATE_TOOL_INPUT_INVALID');
                const v = input.values, sum = v.reduce((a, b) => a + b, 0);
                let result;
                if (input.operation === 'sum')
                    result = sum;
                else if (input.operation === 'subtract' && v.length === 2)
                    result = v[0] - v[1];
                else if (input.operation === 'mean')
                    result = sum / v.length;
                else if (input.operation === 'min')
                    result = Math.min(...v);
                else if (input.operation === 'max')
                    result = Math.max(...v);
                else
                    throw Error('PRIVATE_TOOL_INPUT_INVALID');
                if (!Number.isFinite(result))
                    throw Error('PRIVATE_TOOL_INPUT_INVALID');
                return { result };
            }
            throw Error('PRIVATE_TOOL_UNAVAILABLE');
        },
        async publicResearch(approval,{preferCreators=false}={}) {
            if (!approval || Object.keys(approval).sort().join(',') !== 'approved,brief' || approval.approved !== true || typeof approval.brief !== 'string' || approval.brief.length < 3 || approval.brief.length > 400 || typeof publicRetrieval !== 'function')
                throw Error('PRIVATE_TOOL_DISCLOSURE_REQUIRED');
            return publicRetrieval(Object.freeze({ brief: approval.brief,...(preferCreators?{preferCreators:true}:{}) }));
        },
    });
}
