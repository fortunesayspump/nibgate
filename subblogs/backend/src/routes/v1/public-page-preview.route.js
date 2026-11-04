const express = require('express');
const {publicPageDTO} = require('../../controllers/public-page-dto');

// Read-only router factory, mounted after existing production tenant middleware.
// Mount only after trusted tenant middleware has populated req.site. Storage
// decryption must be supplied by the backend, never by caller headers/URLs.
function createPublicPagePreviewRouter({prisma, decryptBody, renderBody, renderPage} = {}) {
  if (!prisma?.blogPost?.findFirst) throw new Error('Public page repository required');
  const router = express.Router();
  router.get(['/public-page/:slug','/public-html/:type/:slug'], async (req,res) => {
    res.set('Cache-Control','private, no-store');
    const site=req.site;const slug=req.params.slug;
    const htmlRequest=!!req.params.type;
    if(htmlRequest && (req.headers.cookie || req.headers.authorization || req.headers.rsc))return res.status(400).send('Anonymous HTML only');
    const sendPage=async (dto,prepared)=>{
      if(!htmlRequest)return res.json(dto);
      if(typeof renderPage!=='function')return res.status(503).send('Public rendering unavailable');
      const rendered=prepared===undefined ? await renderPage(dto,req.params.type) : prepared;
      if(!rendered)return res.status(404).send('Not found');
      res.set('X-Nibgate-Renderer','backend-html-v1');res.set('X-Robots-Tag','noindex, nofollow');
      res.set('Link',`<${rendered.manifest}>; rel="alternate"; type="application/json"`);
      return res.type('html').send(rendered.html);
    };
    if (!site?.id || !site.subdomain) return res.status(404).json({error:'Site not found'});
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) return res.status(400).json({error:'Invalid article path'});
    try {
      const metadata=await prisma.blogPost.findFirst({
        where:{siteId:site.id,slug,status:'published'},
        select:{id:true,siteId:true,status:true,slug:true,type:true,title:true,excerpt:true,price:true,publicAccess:true,publishedAt:true,updatedAt:true,coverUrl:true,author:{select:{name:true}}},
      });
      if (!metadata) return res.status(404).json({error:'Post not found'});
      const dto=publicPageDTO(site,metadata);
      if (!dto) return res.status(404).json({error:'Post not found'});
      if(htmlRequest && ({writing:'article',photos:'photo',video:'video',music:'music',docs:'document'})[req.params.type]!==metadata.type)return res.status(404).send('Not found');
      if (dto.post.isLocked || metadata.type!=='article') return await sendPage(dto);
      if (!metadata.updatedAt) throw new Error('Publication revision missing');
      const currentPublic={id:metadata.id,siteId:site.id,slug,type:'article',status:'published',publicAccess:true,OR:[{price:null},{price:'0'}],updatedAt:metadata.updatedAt};
      // The database policy and revision predicate must match BEFORE selecting
      // body/storage fields. A concurrent edit or restriction returns no row.
      const content=await prisma.blogPost.findFirst({where:currentPublic,select:{bodyMarkdown:true,bodyStorageRef:true,contentKey:true}});
      if (!content) return res.status(409).json({error:'Publication changed; retry'});
      let body=content.bodyMarkdown;
      if (content.bodyStorageRef) {
        if (typeof decryptBody!=='function' || !content.contentKey) throw new Error('Public body storage unavailable');
        body=await decryptBody(content.bodyStorageRef,content.contentKey);
        if (Buffer.isBuffer(body)) body=body.toString('utf8');
      }
      if (typeof body!=='string' || body.length>100000) throw new Error('Public body unavailable');
      const rendered=renderBody ? renderBody(body,metadata) : null;
      dto.post.bodyMarkdown=body;
      if(rendered){dto.post.publicBodyHTML=rendered.html;dto.post.publicBodyFormat=rendered.format;}
      const prepared=htmlRequest && typeof renderPage==='function' ? await renderPage(dto,req.params.type) : undefined;
      // Fetching, decrypting and rendering can outlast a policy edit. Recheck
      // only after all asynchronous rendering, before emitting any body bytes.
      const stillCurrent=await prisma.blogPost.findFirst({where:currentPublic,select:{id:true}});
      if (!stillCurrent) return res.status(409).json({error:'Publication changed; retry'});
      return await sendPage(dto,prepared);
    } catch {
      return res.status(503).json({error:'Public page temporarily unavailable'});
    }
  });
  return router;
}
module.exports={createPublicPagePreviewRouter};
