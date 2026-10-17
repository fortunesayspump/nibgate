import {isLegacyRun} from './guard.js';

/** Stable pagination past confidential rows in a mixed pre-migration table. */
export async function oldestLegacyRuns(findMany, where, select, limit=3) {
  const picked=[];
  let cursor;
  while (picked.length<limit) {
    const page=await findMany({where,orderBy:[{updatedAt:'asc'},{id:'asc'}],take:50,
      select:{...select,id:true,metadata:true},...(cursor?{cursor:{id:cursor},skip:1}:{})});
    if (!page.length) break;
    picked.push(...page.filter(isLegacyRun).slice(0,limit-picked.length));
    cursor=page.at(-1).id;
    if (page.length<50) break;
  }
  return picked;
}
