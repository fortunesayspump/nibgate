/** Exact public payment payload: no project id, report, source title or vault data. */
export function privatePublicTipResource(raw:string){
    try{
        const url=new URL(raw),host=url.hostname.toLowerCase();
        if(url.protocol!=='https:'||url.username||url.password||!host.includes('.')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||/(?:^|\.)(localhost|local|internal|invalid|test)$/.test(host))return null;
        url.hash='';
        return {url:url.href,domain:host,title:'',price:'0'};
    }catch{return null}
}
