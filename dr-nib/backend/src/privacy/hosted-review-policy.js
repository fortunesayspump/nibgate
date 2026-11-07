export function hostedJevReviewPolicy(env){
  const reviewedAt=Date.parse(env.PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT);
  if(env.PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE!=='openrouter-and-typesafe'||env.PRIVATE_HOSTED_JEV_ZDR_VERIFIED!=='true'||
    !Number.isFinite(reviewedAt)||reviewedAt>Date.now())throw new Error('Hosted JEV privacy review unavailable');
  return {contextDisclosure:'openrouter-and-typesafe',decisionsZdrRoutingVerified:true,loggingReviewExpiresAtMs:null};
}
