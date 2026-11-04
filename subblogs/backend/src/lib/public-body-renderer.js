const MarkdownIt=require('markdown-it');
const FORMAT='commonmark-html-disabled-v1';
let parser;
function renderPublicBody(markdown,post){
 if(typeof markdown!=='string'||markdown.length>100000)throw new Error('Public body exceeds render budget');
 if(!parser){
  parser=new MarkdownIt('commonmark',{html:false,xhtmlOut:false});
  parser.validateLink=url=>!/^[a-z][a-z0-9+.-]*:/i.test(url)||/^(https?|ircs?|mailto|xmpp):/i.test(url);
 }
 const source=markdown.replace(/nibgate-embed:\/\/(\d+)/g,(_match,index)=>`/api/nibgate/media/${encodeURIComponent(post.id)}/photo?index=${index}`);
 const html=parser.render(source).trimEnd();
 if(html.length>400000)throw new Error('Public HTML exceeds render budget');
 return {html,format:FORMAT};
}
module.exports={renderPublicBody,FORMAT};
