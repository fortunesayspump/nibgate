// Authentication is performed by the HTTP session or signed capability layer.
// This policy only controls rollout admission; it never replaces run ownership.
export function privateTenantAllowed(tenantId,{allowedTenantId,accessMode='owner'}={}){
  if(typeof tenantId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(tenantId))return false;
  return accessMode==='authenticated'||accessMode==='owner'&&tenantId===allowedTenantId;
}

export function privateAccessMode(env=process.env){
  const mode=env.DRNIB_PRIVATE_ACCESS_MODE??'owner';
  if(!['owner','authenticated'].includes(mode))throw Error('PRIVATE_ACCESS_POLICY_INVALID');
  return mode;
}
