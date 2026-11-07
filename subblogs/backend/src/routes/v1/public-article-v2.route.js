const express = require('express');
const { publicPageDTO } = require('../../controllers/public-page-dto');

// Local candidate: a single, tenant-scoped policy query supplies both metadata
// and body. No unrestricted post or /site request follows the eligibility test.
function createPublicArticleV2Router({ prisma, decryptBody } = {}) {
  if (!prisma?.blogPost?.findFirst) throw new Error('Post repository required');
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Host'); next(); });
  const tenant = req => req.site?.id && req.siteId === req.site.id && req.site.subdomain ? req.site : null;
  router.get('/public-site-v2', async (req,res) => {
    const site=tenant(req); if (!site) return res.status(404).json({error:'Not found'});
    try {
      // Fetch current settings for the verified tenant; never serialize settings
      // or tokens. Do not use the cached site for a payout destination.
      const current=await prisma.site.findUnique({where:{id:site.id},select:{subdomain:true,settings:true}});
      if (!current || current.subdomain!==site.subdomain) return res.status(404).json({error:'Not found'});
      let settings={}; try { settings=JSON.parse(current.settings || '{}'); } catch {}
      const wallet=typeof settings.recipientWallet==='string' && /^0x[0-9a-fA-F]{40}$/.test(settings.recipientWallet) ? settings.recipientWallet : '';
      return res.json({success:true,site:{name:site.name || '',description:site.description || '',subdomain:site.subdomain,recipientWallet:wallet}});
    } catch { return res.status(503).json({error:'Temporarily unavailable'}); }
  });
  const eligibleWhere = siteId => ({siteId,type:'article',status:'published',publicAccess:true,OR:[{price:null},{price:'0'}]});
  const eligible = (post,site) => Boolean(post && post.id && post.updatedAt && post.siteId===site.id && /^[a-zA-Z0-9_-]{1,200}$/.test(post.slug) && post.type==='article' && post.status==='published' && post.publicAccess===true && (post.price===null || post.price==='0'));
  async function loadArticle(site, slug) {
    if(!site || !/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) return null;
    const policy={...eligibleWhere(site.id),slug};
    try {
      const select={id:true,siteId:true,status:true,slug:true,type:true,title:true,excerpt:true,price:true,publicAccess:true,publishedAt:true,updatedAt:true,coverUrl:true,bodyMarkdown:true,bodyStorageRef:true,contentKey:true,author:{select:{name:true}}};
      const post=await prisma.blogPost.findFirst({where:policy,select});
      if(!eligible(post,site) || post.slug!==slug) return null;
      let body=post.bodyMarkdown;
      if(post.bodyStorageRef){if(typeof decryptBody!=='function'||!post.contentKey)throw Error('Unavailable');body=await decryptBody(post.bodyStorageRef,post.contentKey);if(Buffer.isBuffer(body))body=body.toString('utf8');}
      // Embedded protected media needs a separate reviewed transport.
      if(typeof body!=='string'||body.length>100000||body.includes('nibgate-embed://'))return null;
      const snapshot={...policy,id:post.id,updatedAt:post.updatedAt};
      const fresh=await prisma.blogPost.findFirst({where:snapshot,select});
      const fields=['id','siteId','status','slug','type','title','excerpt','price','publicAccess','coverUrl','bodyMarkdown','bodyStorageRef','contentKey'];
      if(!fresh || fields.some(k=>fresh[k]!==post[k]) || String(fresh.publishedAt)!==String(post.publishedAt) || fresh.author?.name!==post.author?.name)return {status:409};
      const dto=publicPageDTO(site,{...post,bodyMarkdown:body});
      if(!dto || dto.post.isLocked || typeof dto.post.bodyMarkdown!=='string') return null;
      return {dto};
    } catch { return {status:503}; }
  }
  // A paid public article may advertise its price and title, but its body and
  // encryption fields must never be read by this public metadata path.
  async function loadPaidArticle(site, slug) {
    if (!site || !/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) return null;
    const where = {siteId:site.id,slug,type:'article',status:'published',publicAccess:true};
    const select = {id:true,siteId:true,status:true,slug:true,type:true,title:true,excerpt:true,price:true,publicAccess:true,publishedAt:true,updatedAt:true,coverUrl:true,author:{select:{name:true}}};
    const allowed = post => Boolean(post && post.id && post.updatedAt && post.siteId===site.id && post.slug===slug && post.type==='article' && post.status==='published' && post.publicAccess===true && typeof post.price==='string' && Number.isFinite(Number(post.price)) && Number(post.price)>0);
    try {
      const post = await prisma.blogPost.findFirst({where,select});
      if (!allowed(post)) return null;
      const fresh = await prisma.blogPost.findFirst({where:{...where,id:post.id,updatedAt:post.updatedAt},select});
      const fields=['id','siteId','status','slug','type','title','excerpt','price','publicAccess','coverUrl'];
      if (!allowed(fresh) || fields.some(k=>fresh[k]!==post[k]) || String(fresh.publishedAt)!==String(post.publishedAt) || fresh.author?.name!==post.author?.name) return {status:409};
      const dto = publicPageDTO(site,post);
      return dto && dto.post.isLocked && !Object.hasOwn(dto.post,'bodyMarkdown') ? {dto} : null;
    } catch {return {status:503};}
  }
  router.get('/public-article-v2/:slug', async (req,res) => {
    const site=tenant(req);
    let result=await loadArticle(site, req.params.slug);
    if (!result) result=await loadPaidArticle(site, req.params.slug);
    if(result?.dto) return res.json(result.dto);
    const status=result?.status || 404;
    return res.status(status).json({error:status===409?'Publication changed':status===503?'Temporarily unavailable':'Not found'});
  });
  router.get('/public-home-v2', async (req,res) => {
    const site=tenant(req);
    if(!site) return res.status(404).json({error:'Not found'});
    try {
      // Metadata only: avoid fetching or decrypting article bodies on home.
      const select={id:true,siteId:true,slug:true,type:true,status:true,publicAccess:true,price:true,title:true,excerpt:true,publishedAt:true,updatedAt:true,coverUrl:true};
      const where={siteId:site.id,type:'article',status:'published',publicAccess:true};
      const homeEligible=post=>Boolean(post && post.id && post.updatedAt && post.siteId===site.id && /^[a-zA-Z0-9_-]{1,200}$/.test(post.slug) && post.type==='article' && post.status==='published' && post.publicAccess===true && (post.price===null || (typeof post.price==='string' && post.price.trim()!=='' && Number.isFinite(Number(post.price)) && Number(post.price)>=0)));
      const candidates=await prisma.blogPost.findMany({where,select,orderBy:[{publishedAt:'desc'},{id:'desc'}],take:20});
      if(!Array.isArray(candidates) || candidates.some(post=>!homeEligible(post))) return res.status(503).json({error:'Temporarily unavailable'});
      let checked=[];
      if(candidates.length) {
        const fresh=await prisma.blogPost.findMany({where:{...where,id:{in:candidates.map(post=>post.id)}},select});
        const byId=new Map(fresh.filter(homeEligible).map(post=>[post.id,post]));
        const fields=['id','siteId','slug','type','status','publicAccess','price','title','excerpt','coverUrl'];
        checked=candidates.filter(post=>{const latest=byId.get(post.id);return latest && fields.every(key=>latest[key]===post[key]) && String(latest.publishedAt)===String(post.publishedAt) && String(latest.updatedAt)===String(post.updatedAt)});
      }
      const posts=checked.map(post=>({id:post.id,slug:post.slug,type:post.type,title:post.title,excerpt:post.excerpt,price:post.price,publishedAt:post.publishedAt,updatedAt:post.updatedAt,coverUrl:post.coverUrl}));
      return res.json({success:true,site:{name:site.name || '',description:site.description || '',subdomain:site.subdomain},posts});
    } catch { return res.status(503).json({error:'Temporarily unavailable'}); }
  });
  return router;
}
module.exports={createPublicArticleV2Router};
