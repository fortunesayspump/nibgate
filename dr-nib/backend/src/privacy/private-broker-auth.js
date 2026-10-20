import {createHash} from 'node:crypto';
function configuredUrl(env){
  const raw=env.PRIVATE_BROKER_AUTH_URL;
  if(typeof raw!=='string'||!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['/auth/me','/api/auth/me'].includes(url.pathname))return null;
    return url;
  }catch{return null}
}

/** Validate the existing Nibgate SIWE cookie at the canonical hub API without
 * granting this broker access to the hub database or its session-token table. */
export function createPrivateBrokerAuth({env=process.env,fetchImpl=fetch}={}){
  const endpoint=configuredUrl(env);
  const timeoutMs=Number(env.PRIVATE_BROKER_AUTH_TIMEOUT_MS??5000);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>20000)throw Error('Invalid private account-check timeout');
  const cookieName=typeof env.NIBGATE_SESSION_COOKIE==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(env.NIBGATE_SESSION_COOKIE)
    ?env.NIBGATE_SESSION_COOKIE:null;
  // Coalesce simultaneous checks for one session, without caching a completed
  // authorization or sharing results across sessions. Ciphertext list views
  // otherwise fan out many identical Hub/database requests at once.
  const pending=new Map();
  async function check(token){
    const key=createHash('sha256').update(token).digest('hex');
    if(pending.has(key))return pending.get(key);
    if(pending.size>=256)throw Error('Account check unavailable');
    const flight=(async()=>{
      const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',cache:'no-store',
        headers:{cookie:`${cookieName}=${encodeURIComponent(token)}`},signal:AbortSignal.timeout(timeoutMs)});
      if(response.status===401)return null;
      if(!response.ok||response.redirected===true||new URL(response.url).origin!==endpoint.origin)throw Error('Account check unavailable');
      const value=await response.json();
      const user=value?.authenticated===true&&value.user&&typeof value.user==='object'?value.user:null;
      if(!user||typeof user.id!=='string'||!user.id||user.walletAddress!=null&&typeof user.walletAddress!=='string')throw Error('Account check unavailable');
      return {id:user.id,walletAddress:user.walletAddress||null};
    })();
    pending.set(key,flight);
    void flight.finally(()=>pending.delete(key)).catch(()=>{});
    return flight;
  }
  return async(req,res,next)=>{
    try{
      const token=req.cookies?.[cookieName];
      if(!endpoint||!cookieName||typeof token!=='string'||!token)return res.status(401).json({code:'unauthenticated'});
      const user=await check(token);
      if(!user)return res.status(401).json({code:'unauthenticated'});
      req.user={...user};
      return next();
    }catch{return res.status(503).json({code:'account_unavailable'})}
  };
}
