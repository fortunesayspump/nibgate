const {activeNetworkName}=require('./network');
const types={writing:'article',photos:'photo',video:'video',music:'music',docs:'document'};
let renderer;
async function renderPublicHTMLPage(dto,pathType){
 const {site,post}=dto;
 if(types[pathType]!==post.type) return null;
 if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(site.subdomain))throw new Error('Invalid tenant');
 renderer ||= import('./public-article-html.mjs');
 const {articleHTML}=await renderer;
 const network=activeNetworkName();
 const canonical=`https://${site.subdomain}${network==='testnet'?'.testnet':''}.nibgate.xyz`;
 const cfg={tenant:site.subdomain,network,canonical,app:canonical};
 return articleHTML(cfg,site,post,()=>{
  if(post.publicBodyFormat!=='commonmark-html-disabled-v1'||typeof post.publicBodyHTML!=='string')throw new Error('Current rendering unavailable');
  return {html:post.publicBodyHTML,mode:'current-backend'};
 });
}
module.exports={renderPublicHTMLPage};
