import {cleanPrivateModelOutput} from '@nibgate/internal/private-report-citations.js';
/** Reuse the report's actual model-written ending. Never invent a summary or
 * treat headings inside fenced examples as report prose. */
export function reportWrapUp(markdown){
 if(typeof markdown!=='string')return null;
 try{markdown=cleanPrivateModelOutput(markdown);}catch{return null;}
 const lines=markdown.split(/\r?\n/);let fence=null,section=null;const sections=[];
 const finish=()=>{if(section){const text=section.lines.join('\n').trim();if(text)sections.push({title:section.title,markdown:text,kind:section.kind});section=null;}};
 for(const line of lines){
  const delimiter=line.match(/^\s*(`{3,}|~{3,})/);
  if(delimiter){if(!fence)fence=delimiter[1][0];else if(delimiter[1][0]===fence)fence=null;if(section)section.lines.push(line);continue;}
  const heading=!fence&&line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if(heading){
   if(section&&heading[1].length<=section.level)finish();
   const title=heading[2].replace(/[*_]/g,'').replace(/^\d+[.)]\s*/, '').trim();
   const kind=/^conclusions?\b/i.test(title)?'conclusion':/^(?:executive\s+)?summary\b/i.test(title)?'summary':null;
   if(kind&&!section){section={title,kind,level:heading[1].length,lines:[]};continue;}
  }
  if(section)section.lines.push(line);
 }
 finish();return sections.find(s=>s.kind==='conclusion')??sections.find(s=>s.kind==='summary')??null;
}

/** Keep historical completion cards bound to the report available then. */
export function reportAtCompletion(reports,at){
 const time=Date.parse(at);if(!Array.isArray(reports)||!Number.isFinite(time))return null;
 return reports.filter(r=>typeof r?.markdown==='string'&&Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)<=time).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0]??null;
}
