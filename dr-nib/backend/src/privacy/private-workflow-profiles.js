// Temperatures follow llm/generate.js. High effort on the reviewed route
// exceeded a tiny total-output request by 8,192 tokens; low effort passed a
// receipt-verified bounded probe. Keep total-output accounting strict. Research
// quality still needs actual report verification; this is not model parity.
const profiles=Object.freeze({
    intake:Object.freeze({effort:'none',temperature:0.4,maxTokens:4096}),
    plan:Object.freeze({effort:'low',temperature:0.3,maxTokens:8192}),
    write:Object.freeze({effort:'low',temperature:0.4,maxTokens:16384}),
    verify:Object.freeze({effort:'low',temperature:0.2,maxTokens:8192}),
    discuss:Object.freeze({effort:'low',temperature:0.2,maxTokens:4096}),
    thinking:Object.freeze({effort:'none',temperature:0.5,maxTokens:1024}),
    agent:Object.freeze({effort:'low',temperature:0.2,maxTokens:2048}),
    review:Object.freeze({effort:'low',temperature:0.3,maxTokens:4096}),
});
export function privateWorkflowProfile(stage,model){
    if(!Object.hasOwn(profiles,stage))throw Error('PRIVATE_WORKFLOW_INPUT_LIMIT');
    // This reviewed instruct route advertises no reasoning_effort parameter.
    // Keep the same stage limits and temperature; omit only that wire field.
    if(['phala/gemma-4-26b-a4b-uncensored','z-ai/glm-5.3-flash'].includes(model)){
        const {effort,...profile}=profiles[stage];
        return Object.freeze(profile);
    }
    return profiles[stage];
}
