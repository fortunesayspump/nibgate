function configuredUrl(env){
  const raw=env.PRIVATE_BROKER_AUTH_URL;
  if(typeof raw!=='string'||!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/auth/me')return null;
    return url;
  }catch{return null}
}

/** Validate the existing Nibgate SIWE cookie at the canonical hub API without
 * granting this broker access to the hub database or its session-token table. */
export function createPrivateBrokerAuth({env=process.env,fetchImpl=fetch}={}){
  const endpoint=configuredUrl(env);
  const cookieName=typeof env.NIBGATE_SESSION_COOKIE==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(env.NIBGATE_SESSION_COOKIE)
    ?env.NIBGATE_SESSION_COOKIE:null;
  return async(req,res,next)=>{
    try{
      const token=req.cookies?.[cookieName];
      if(!endpoint||!cookieName||typeof token!=='string'||!token)return res.status(401).json({code:'unauthenticated'});
      const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',cache:'no-store',
        headers:{cookie:`${cookieName}=${encodeURIComponent(token)}`},signal:AbortSignal.timeout(5000)});
      if(response.status===401)return res.status(401).json({code:'unauthenticated'});
      if(!response.ok||response.redirected===true||new URL(response.url).origin!==endpoint.origin)
        return res.status(503).json({code:'account_unavailable'});
      const value=await response.json();
      const user=value?.authenticated===true&&value.user&&typeof value.user==='object'?value.user:null;
      if(!user||typeof user.id!=='string'||!user.id||
         user.walletAddress!=null&&typeof user.walletAddress!=='string')return res.status(503).json({code:'account_unavailable'});
      req.user={id:user.id,walletAddress:user.walletAddress||null};
      return next();
    }catch{return res.status(503).json({code:'account_unavailable'})}
  };
}
