import {depthLimits} from '../depth.js';
// A forecast for the UI, separate from durable worst-case per-call admission.
// Input size/retries can change the actual charge; the run cap always wins.
export function privateResearchEstimate({words,sections,depth,inputPricePerMillion,outputPricePerMillion,hostedJev}){
 if(![words,sections,inputPricePerMillion,outputPricePerMillion].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('PRIVATE_BUDGET_TOO_SMALL');
 const rounds=Math.min(depthLimits(depth).rounds+1,3),calls=(words<=1200?3:sections+4)+rounds+2;
 const micro=Math.ceil((calls*8192*inputPricePerMillion+(words*2+calls*256+1536)*outputPricePerMillion)/1000000)+(hostedJev?2000:0);
 const minimumMicro=Math.ceil((410592*inputPricePerMillion+16384*outputPricePerMillion)/1000000);
 return {estimate:Math.ceil(micro/1000)/1000,minimumFunding:Math.ceil(minimumMicro/10000)/100,kind:'forecast'};
}
