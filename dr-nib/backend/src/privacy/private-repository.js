import {randomUUID} from 'node:crypto';
import {isConfidentialRun} from './guard.js';
import {sealPrivatePayload,openPrivatePayload} from './sealed-payload.js';
const STEP_KINDS=new Set(['data','decision','fetch','input','plan','question','review','round-review','score','search','thinking','write','verify','tips']);

function owner(run) {
  if (!isConfidentialRun(run) || typeof run.userId !== 'string' || !run.userId || typeof run.id !== 'string')
    throw new Error('PRIVATE_RUN_UNAVAILABLE');
  return {tenantId:run.userId,runId:run.id};
}
function context(run, objectId, revision, purpose) {return {...owner(run),objectId,revision,purpose};}

/** Existing Prisma models, encrypted fields only. Invoke solely inside the
 * measured worker after independently verified client-controlled key release.
 * It is intentionally not wired to the ordinary worker yet. */
export function createPrivateRepository({db,keyProvider}) {
  if (!db?.researchStep?.create || !db?.researchReport?.create || typeof keyProvider !== 'function')
    throw new Error('PRIVATE_REPOSITORY_UNAVAILABLE');
  async function keyFor(run,purpose) {
    const key=await keyProvider({...owner(run),purpose});
    if (!Buffer.isBuffer(key) || key.length!==32) throw new Error('PRIVATE_KEY_UNAVAILABLE');
    return key;
  }
  return {
    async saveStep(run,{kind,attempt,output}) {
      try {
      if (!STEP_KINDS.has(kind) || !Number.isSafeInteger(attempt) || attempt<1)
        throw new Error('INVALID_PRIVATE_STEP');
      const id=randomUUID();
      const envelope=sealPrivatePayload({key:await keyFor(run,'step'),context:context(run,id,attempt,'step'),plaintext:Buffer.from(JSON.stringify(output))});
      return await db.researchStep.create({data:{id,runId:run.id,kind,status:'done',attempt,input:null,output:{encrypted:true,format:'sealed-payload-v1',envelope},endedAt:new Date()}});
      } catch {throw new Error('PRIVATE_STEP_UNAVAILABLE')}
    },
    async readStep(run,row) {
      try {
      owner(run);
      if (row?.runId!==run.id || row?.output?.encrypted!==true || row.output.format!=='sealed-payload-v1')
        throw new Error('INVALID_PRIVATE_STEP');
      const bytes=openPrivatePayload({key:await keyFor(run,'step'),expectedContext:context(run,row.id,row.attempt,'step'),envelope:row.output.envelope});
      return JSON.parse(bytes.toString('utf8'));
      } catch {throw new Error('PRIVATE_STEP_UNAVAILABLE')}
    },
    async saveReport(run,{version,markdown,citations}) {
      try {
      if (!Number.isSafeInteger(version) || version<1 || typeof markdown!=='string' || !Array.isArray(citations))
        throw new Error('INVALID_PRIVATE_REPORT');
      const id=randomUUID();
      const envelope=sealPrivatePayload({key:await keyFor(run,'report'),context:context(run,id,version,'report'),plaintext:Buffer.from(JSON.stringify({markdown,citations}))});
      return await db.researchReport.create({data:{id,runId:run.id,version,markdown:JSON.stringify({encrypted:true,format:'sealed-payload-v1',envelope}),citations:[]}});
      } catch {throw new Error('PRIVATE_REPORT_UNAVAILABLE')}
    },
    async readReport(run,row) {
      try {
      owner(run);
      if (row?.runId!==run.id) throw new Error('INVALID_PRIVATE_REPORT');
      let stored;
      try {stored=JSON.parse(row.markdown);} catch {throw new Error('INVALID_PRIVATE_REPORT');}
      if (stored?.encrypted!==true || stored.format!=='sealed-payload-v1') throw new Error('INVALID_PRIVATE_REPORT');
      const bytes=openPrivatePayload({key:await keyFor(run,'report'),expectedContext:context(run,row.id,row.version,'report'),envelope:stored.envelope});
      return JSON.parse(bytes.toString('utf8'));
      } catch {throw new Error('PRIVATE_REPORT_UNAVAILABLE')}
    },
  };
}
