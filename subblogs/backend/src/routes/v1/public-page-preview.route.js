const express = require('express');
const {publicPageDTO} = require('../../controllers/public-page-dto');

// Read-only router factory, mounted after existing production tenant middleware.
// Mount only after trusted tenant middleware has populated req.site. Storage
// decryption must be supplied by the backend, never by caller headers/URLs.
function createPublicPagePreviewRouter({prisma, decryptBody, renderBody} = {}) {
  if (!prisma?.blogPost?.findFirst) throw new Error('Public page repository required');
  const router = express.Router();
  router.get('/public-page/:slug', async (req,res) => {
    res.set('Cache-Control','private, no-store');
    const site=req.site;const slug=req.params.slug;
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
      if (dto.post.isLocked || metadata.type!=='article') return res.json(dto);
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
      // Storage fetch/decryption can outlast an access-policy update. Recheck
      // the same revision and policy before emitting any body bytes.
      const stillCurrent=await prisma.blogPost.findFirst({where:currentPublic,select:{id:true}});
      if (!stillCurrent) return res.status(409).json({error:'Publication changed; retry'});
      dto.post.bodyMarkdown=body;
      if(rendered){dto.post.publicBodyHTML=rendered.html;dto.post.publicBodyFormat=rendered.format;}
      return res.json(dto);
    } catch {
      return res.status(503).json({error:'Public page temporarily unavailable'});
    }
  });
  return router;
}
module.exports={createPublicPagePreviewRouter};
