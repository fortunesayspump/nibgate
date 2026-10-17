import {createPrivateCapabilitySigner} from './private-capability.js';
import {wakeAwareGuestHealth} from './private-broker-wake.js';
import {createConfiguredPhalaWake} from './phala-wake-bootstrap.js';
import {createPrivateBrokerMoney} from './private-broker-money.js';

/** No configuration or missing readiness leaves every private route closed.
 * Key provisioning and remote CVM start/stop are separate reviewed actions. */
export async function configuredPrivateBroker(env=process.env,{wakeController}={}){
  const disabled={ready:async()=>false,fullReady:async()=>false,guestBaseURL:undefined,signCapability:undefined,money:null};
  if(env.DRNIB_PRIVATE_ENABLED!=='true')return disabled;
  const wakeRequested=env.DRNIB_PRIVATE_WAKE_ENABLED==='true';
  const baseURL=env.DRNIB_PRIVATE_GUEST_BASE_URL;
  const privatePem=env.PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM;
  const allowedTenantId=env.DRNIB_PRIVATE_TEST_TENANT_ID;
  if(typeof baseURL!=='string'||typeof privatePem!=='string'||!baseURL||!privatePem||
     typeof allowedTenantId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(allowedTenantId))return disabled;
  let url,signCapability;
  try{
    url=new URL(baseURL);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return disabled;
    const {importPKCS8}=await import('jose');
    const privateKey=await importPKCS8(privatePem,'EdDSA');
    signCapability=createPrivateCapabilitySigner({privateKey});
  }catch{return disabled}
  let wake=wakeController;
  if(wakeRequested){
    try{
      wake??=await createConfiguredPhalaWake({env,guestBaseURL:url.toString(),tenantId:allowedTenantId,signCapability});
      if(typeof wake?.run!=='function'||typeof wake?.ensureReady!=='function')return disabled;
    }catch{return disabled}
  }
  const health=async()=>{
    try{
      const response=await fetch(new URL('/health',url),{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)return null;
      const value=await response.json();return value?.ok===true?value:null;
    }catch{return null}
  };
  const awakeHealth=wakeAwareGuestHealth(wakeRequested?wake:undefined,health);
  const ready=async()=>{try{const value=await awakeHealth();return value?.privateReady===true}catch{return false}};
  const fullAllowedTenantId=allowedTenantId;
  const fullReady=async()=>{
    if(env.DRNIB_PRIVATE_FULL_ENABLED!=='true'||typeof fullAllowedTenantId!=='string'||
       !/^[A-Za-z0-9:_-]{1,128}$/.test(fullAllowedTenantId))return false;
    try{const value=await awakeHealth();return value?.privateReady===true&&value?.fullReady===true}catch{return false}
  };
  return {guestBaseURL:url.toString(),signCapability,ready,fullReady,allowedTenantId,fullAllowedTenantId,
    wakeController:wakeRequested?wake:undefined,money:createPrivateBrokerMoney({env})};
}
