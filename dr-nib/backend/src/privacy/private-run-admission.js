/** Apply the owner and quota checks before any wake/health operation that may
 * start a billable CVM. This function handles only public, opaque metadata. */
export async function privateRunCreateAdmission({user,body,allowedTenantId,createLimit,ready}){
  if(typeof allowedTenantId!=='string'||!allowedTenantId)
    return {status:503,code:'PRIVATE_MODE_UNAVAILABLE'};
  if(!user||typeof user.id!=='string'||!user.id||!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).length!==0)return {status:400,code:'PRIVATE_REQUEST_INVALID'};
  if(user.id!==allowedTenantId)return {status:404,code:'PRIVATE_MODE_UNAVAILABLE'};
  const limit=await createLimit(user.id);
  if(limit?.ok!==true)return {status:429,code:'PRIVATE_RUN_LIMIT'};
  if(await ready()!==true)return {status:503,code:'PRIVATE_MODE_UNAVAILABLE'};
  return {status:200,code:'PRIVATE_RUN_ALLOWED'};
}
