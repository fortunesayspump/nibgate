// Optional explicit testnet transport correction; never changes credentials,
// schema, database, TLS query options or grants. Mainnet never enables it.
export function privateDatabaseRoute(value,mode){
 if(mode===undefined||mode==='')return value;
 if(mode!=='testnet-existing-proxy')throw Error('PRIVATE_DATABASE_ROUTE_UNAVAILABLE');
 const u=new URL(value);
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.hash)throw Error('PRIVATE_DATABASE_ROUTE_UNAVAILABLE');
 u.hostname='hayabusa.proxy.rlwy.net';u.port='23580';
 const tls=u.searchParams.get('sslmode');
 if(!tls||tls==='prefer')u.searchParams.set('sslmode','require');
 else if(!['require','verify-ca','verify-full'].includes(tls))throw Error('PRIVATE_DATABASE_TLS_REQUIRED');
 return u.toString();
}
