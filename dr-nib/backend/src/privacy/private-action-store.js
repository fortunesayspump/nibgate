import {privateSourceSetDigest} from './private-input-readiness.js';
import { ciphertextDigest } from './ciphertext-digest.js';
import { createHash, randomUUID } from 'node:crypto';
import { openClientObject, sealClientObject } from './client-object-crypto.js';
import { isConfidentialRun } from './guard.js';
import {Prisma} from '@prisma/client';
import {rejected429Recovery,interruptedInferenceRecovery} from './private-rejected-recovery.js';
const fail = () => Error('PRIVATE_WORKFLOW_UNAVAILABLE');
// Service/session failures need recovery, including verified pre-dispatch
// failures with zero usage. They must not finalize the customer's escrow.
const recoverableFailure = code => code?.startsWith('PHALA_PRIVATE_AI_') || code === 'HOSTED_JEV_UNAVAILABLE' ||
    ['PRIVATE_ACTION_UNAVAILABLE','PRIVATE_CHECKPOINT_UNCERTAIN','PRIVATE_CHECKPOINT_FENCED','PRIVATE_STORAGE_TRANSACTION_TIMEOUT','PRIVATE_REPORT_REPAIR_REQUIRED','PRIVATE_EVIDENCE_REPAIR_REQUIRED','PRIVATE_WEB_UNAVAILABLE','PRIVATE_RUN_BUDGET_EXHAUSTED','PRIVATE_WORKFLOW_CAP'].includes(code);
const context = (run, row) => ({ tenantId: run.userId, vaultId: row.vaultId, runId: run.id, objectId: row.objectId, revision: row.revision, purpose: row.kind });
/** Content access used solely inside the measured worker. The broker stores
 * the same envelopes without importing this module or holding the key. */
export function createPrivateActionStore({ db, storage, stateKey, tenantId, runId, vaultId, allowCancelledExport=false,allowHostedResearchFallback=false,now=Date.now }) {
    let leaseOwner,leaseRequestId;
    const leaseMs=90000;
    async function fence(tx=db){
        const fresh=await run(tx);if(fresh.metadata?.privateCancellation&&!allowCancelledExport)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
        if(leaseOwner){const active=await tx.privateActionReceipt.findUnique({where:{runId_requestId:{runId,requestId:leaseRequestId}}});if(active?.status!=='processing')throw fail();if(active.leaseOwner!==leaseOwner)throw Error('PRIVATE_CHECKPOINT_FENCED');}
        return fresh;
    }
    async function run(tx = db) { const r = await tx.researchRun.findUnique({ where: { id: runId } }); if (!r || r.userId !== tenantId || r.deletedAt || !isConfidentialRun(r))
        throw fail(); return r; }
    async function read(row, r=undefined) {
        r??=await run();
        if (!row || row.runId !== runId || row.vaultId !== vaultId || row.removed)
            throw fail();
        let envelope = row.envelope;
        if (row.objectKey) {
            const bytes = await storage.get(row.objectKey);
            if (createHash('sha256').update(bytes).digest('hex') !== row.digest)
                throw fail();
            envelope = JSON.parse(bytes.toString('utf8'));
        }
        if (!row.objectKey && ciphertextDigest(envelope) !== row.digest)
            throw fail();
        const plain = openClientObject(stateKey, context(r, row), envelope);
        try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
        }
        finally {
            plain.fill(0);
        }
    }
    return {
        run,
        fence,
        async heartbeat(){
            if(!leaseOwner)throw fail();
            await db.$transaction(async tx=>{
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                await fence(tx);
                await tx.privateActionReceipt.update({where:{runId_requestId:{runId,requestId:leaseRequestId}},data:{leaseUntil:new Date(now()+leaseMs)}});
            },{timeout:60000,maxWait:10000});
        },
        receipt:requestId=>db.privateActionReceipt.findUnique({where:{runId_requestId:{runId,requestId}}}),
        async checkpoint(rootRequestId){const r=await run(),row=await db.privateClientObject.findUnique({where:{runId_objectId:{runId,objectId:rootRequestId}}});if(row?.kind!=='checkpoint')throw fail();return read(row,r);},
        async saveCheckpoint(rootRequestId,value){
            const bytes=Buffer.from(JSON.stringify(value));
            try{if(bytes.length>2*1024*1024)throw fail();await db.$transaction(async tx=>{
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                await fence(tx);
                const row=await tx.privateClientObject.findUnique({where:{runId_objectId:{runId,objectId:rootRequestId}}});
                if(row?.kind!=='checkpoint'||row.vaultId!==vaultId||row.removed)throw fail();
                const revision=row.revision+1,envelope=sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:rootRequestId,revision,purpose:'checkpoint'},bytes);
                await tx.privateClientObject.update({where:{id:row.id},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                await tx.privateActionReceipt.update({where:{runId_requestId:{runId,requestId:leaseRequestId}},data:{leaseUntil:new Date(now()+leaseMs)}});
            },{timeout:60000,maxWait:10000});}finally{bytes.fill(0);}
        },
        async controls(rootRequestId){
            const r=await fence(),rows=await db.privateClientObject.findMany({where:{runId,kind:'intent',removed:false},orderBy:[{createdAt:'asc'},{id:'asc'}],take:128}),out=[];
            for(const row of rows){const value=await read(row,r);if(value?.format!=='drnib-control-v1'||![rootRequestId,leaseRequestId].includes(value.targetRequestId))continue;
                if(!['pause','guidance'].includes(value.command)||value.command==='guidance'&&(typeof value.text!=='string'||!value.text.trim()||value.text.length>8000))throw fail();
                out.push({id:row.objectId,command:value.command,...(value.command==='guidance'?{text:value.text}:{})});}
            return out;
        },
        async load() { const r = await run(), row = await db.privateClientObject.findFirst({ where: { runId, kind: 'manifest', removed: false } }); return { run: r, row, value: await read(row) }; },
        async sources() { const rows = await db.privateClientObject.findMany({ where: { runId, kind: 'source', removed: false }, orderBy: { createdAt: 'asc' } }); return Promise.all(rows.map(async (row) => ({ id: row.objectId, ...await read(row) }))); },
        async progress(id, snapshot) {
            const bytes = Buffer.from(JSON.stringify(snapshot));
            try {
                if (bytes.length > 512 * 1024) throw fail();
                return await db.$transaction(async tx => {
                    await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                    const fresh=await fence(tx);
                    const receipt = await tx.privateActionReceipt.findUnique({ where: { id } });
                    if (!receipt || receipt.runId !== runId || receipt.status !== 'processing') throw fail();
                    const revision = (receipt.reply?.context?.revision ?? 0) + 1;
                    if (!Number.isSafeInteger(revision) || revision > 256) throw fail();
                    const reply = sealClientObject(stateKey, { tenantId, runId, vaultId, objectId: receipt.requestId, revision, purpose: 'action-progress' }, bytes);
                    await tx.privateActionReceipt.update({ where: { id }, data: { reply } });
                },{timeout:60000,maxWait:10000});
            } finally { bytes.fill(0); }
        },
        async commit(before, value, { status, budgetCap, receiptId, reply, fundingInputs } = {}) {
            const revision = before.row.revision + 1, envelope = sealClientObject(stateKey, { ...context(before.run, before.row), revision }, Buffer.from(JSON.stringify(value)));
            return db.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                const fresh=leaseOwner?await fence(tx):await run(tx);
                if(fresh.metadata?.privateCancellation&&!allowCancelledExport)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
                if(typeof budgetCap==='number'&&Number(fresh.budgetCap)!==budgetCap&&fresh.metadata?.privateEscrow?.jobId)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
                const out = await tx.privateClientObject.updateMany({ where: { id: before.row.id, revision: before.row.revision, removed: false, vaultId }, data: { revision, envelope, digest: ciphertextDigest(envelope) } });
                if (out.count !== 1)
                    throw fail();
                let metadata;
                if(fundingInputs){
                    const sources=await tx.privateClientObject.findMany({where:{runId,kind:'source',removed:false},select:{id:true,digest:true}});
                    if(!fundingInputs.webApproved&&!sources.length)throw Error('PRIVATE_SOURCE_REQUIRED');
                    metadata={...fresh.metadata,privateFundingInputs:{version:1,manifestDigest:ciphertextDigest(envelope),sourceCount:sources.length,sourceSetDigest:privateSourceSetDigest(sources),webApproved:fundingInputs.webApproved===true}};
                }
                if (status)
                    await tx.researchRun.update({ where: { id: runId }, data: { status,...(metadata?{metadata}:{}),...(typeof budgetCap==='number'&&Number.isFinite(budgetCap)&&budgetCap>=0&&budgetCap<=1000?{budgetCap}:{}) } });
                if (receiptId)
                    await tx.privateActionReceipt.update({ where: { id: receiptId }, data: { status: 'complete', reply } });
                return { revision };
            },{timeout:20000,maxWait:5000});
        },
        async claim({ requestId, digest, manifestId, manifestRevision, checkpoint, recover=false,checkpointRoot }) {
            return db.$transaction(async (tx) => {
                if(recover||allowCancelledExport)await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,1)::text AS locked`;
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                const fresh=await run(tx);
                if(fresh.metadata?.privateCancellation&&!allowCancelledExport)throw Error('PRIVATE_RUN_BUDGET_CLOSED');
                const existing = await tx.privateActionReceipt.findUnique({ where: { runId_requestId: { runId, requestId } } });
                if (existing) {
                    if (existing.digest !== digest)
                        throw fail();
                    // The matching keyed digest proves both attempts were the
                    // same read-only export. Regeneration cannot replay money
                    // or inference; never take over a live owner lease.
                    if(allowCancelledExport&&existing.status==='uncertain'&&existing.leaseUntil?.getTime()<=now()&&['complete','failed','ended'].includes(fresh.status)&&
                       !await tx.privateInferenceCall.count({where:{runId,actionId:requestId}})){
                        const manifest=await tx.privateClientObject.findUnique({where:{id:manifestId}});
                        if(manifest?.runId!==runId||manifest.revision!==manifestRevision||manifest.removed)throw fail();
                        leaseOwner=randomUUID();leaseRequestId=requestId;
                        return tx.privateActionReceipt.update({where:{id:existing.id},data:{status:'processing',reply:Prisma.DbNull,leaseOwner,leaseUntil:new Date(now()+leaseMs)}});
                    }
                    if(recover&&['processing','uncertain'].includes(existing.status)&&existing.leaseUntil&&existing.leaseUntil.getTime()<=now()){
                        // Re-read the authenticated journal while holding the
                        // same lock as operation-start writes. A stale ready
                        // snapshot cannot take over an operation just started
                        // by the previous worker.
                        const row=await tx.privateClientObject.findUnique({where:{runId_objectId:{runId,objectId:checkpointRoot}}});
                        if(row?.kind!=='checkpoint')throw fail();
                        const live=await read(row,fresh);
                        const manifest=await tx.privateClientObject.findUnique({where:{id:manifestId}});
                        if(live.current?.requestId!==requestId||live.current.manifestRevision!==manifestRevision||manifest?.revision!==manifestRevision||live.current.manifestDigest!==manifest.digest)return {...existing,status:'uncertain',existing:true};
                        if(allowHostedResearchFallback&&existing.status==='uncertain'&&existing.reply&&live.entries.some(e=>e.state!=='complete')){
                            const bytes=openClientObject(stateKey,{tenantId,runId,vaultId,objectId:requestId,revision:1,purpose:'event'},existing.reply);
                            let failure;try{failure=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0)}
                            const calls=await tx.privateInferenceCall.findMany({where:{runId,actionId:requestId,status:'reserved'}});
                            const rejection=rejected429Recovery({checkpoint:live,failure,calls,requestId});
                            if(rejection){
                                await tx.privateInferenceCall.update({where:{id:rejection.callId},data:{status:'rejected-held',billingKind:'platform',costBasis:'operator-reservation'}});
                                live.entries.pop();live.reconciliations=[...(live.reconciliations??[]),{kind:'operator-covered-429',requestId,...rejection,at:new Date(now()).toISOString()}];
                                const revision=row.revision+1,envelope=sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:checkpointRoot,revision,purpose:'checkpoint'},Buffer.from(JSON.stringify(live)));
                                await tx.privateClientObject.update({where:{id:row.id},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                            }
                        }
                        if(allowHostedResearchFallback&&existing.status==='processing'&&live.entries.some(e=>e.state!=='complete')&&!await tx.privateToolCall.count({where:{runId,status:'reserved'}})){
                            const calls=await tx.privateInferenceCall.findMany({where:{runId,actionId:requestId,status:'reserved'}});
                            const interrupted=interruptedInferenceRecovery({checkpoint:live,calls,requestId,receiptStatus:existing.status});
                            if(interrupted){
                                await tx.privateInferenceCall.update({where:{id:interrupted.callId},data:{status:'uncertain-held',billingKind:'platform',costBasis:'operator-reservation'}});
                                live.entries.pop();live.reconciliations=[...(live.reconciliations??[]),{kind:'operator-covered-interrupted-inference',requestId,...interrupted,at:new Date(now()).toISOString()}];
                                const revision=row.revision+1,envelope=sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:checkpointRoot,revision,purpose:'checkpoint'},Buffer.from(JSON.stringify(live)));
                                await tx.privateClientObject.update({where:{id:row.id},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                            }
                        }
                        if(live.entries.some(e=>e.state!=='complete')){
                            // A finalized timeout plus an empty admission ledger
                            // proves the first inference never reached dispatch:
                            // both inference adapters commit a reservation before
                            // contacting a provider. Do not infer this from lease
                            // expiry, a missing response, or zero billed dollars.
                            if(existing.status!=='uncertain'||live.entries.length!==1||live.entries[0].kind!=='infer'||live.entries[0].state!=='started'||!existing.reply)return {...existing,status:'uncertain',existing:true};
                            const bytes=openClientObject(stateKey,{tenantId,runId,vaultId,objectId:requestId,revision:1,purpose:'event'},existing.reply);
                            let failure;try{failure=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
                            if(failure.error!=='PRIVATE_STORAGE_TRANSACTION_TIMEOUT'||await tx.privateInferenceCall.count({where:{runId,actionId:requestId}})||await tx.privateToolCall.count({where:{runId}}))return {...existing,status:'uncertain',existing:true};
                            live.entries=[];
                            live.reconciliations=[...(live.reconciliations??[]),{requestId,kind:'initial-inference-not-dispatched',at:new Date(now()).toISOString()}];
                            const revision=row.revision+1,envelope=sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:checkpointRoot,revision,purpose:'checkpoint'},Buffer.from(JSON.stringify(live)));
                            await tx.privateClientObject.update({where:{id:row.id},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                        }
                        if(await tx.privateInferenceCall.count({where:{runId,status:'reserved'}})||await tx.privateToolCall.count({where:{runId,status:'reserved'}}))return {...existing,status:'uncertain',existing:true};
                        leaseOwner=randomUUID();leaseRequestId=requestId;
                        const resumedProgress=existing.status==='uncertain'?sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:requestId,revision:1,purpose:'action-progress'},Buffer.from(JSON.stringify({events:[],decisions:[]}))):existing.reply;
                        return {...await tx.privateActionReceipt.update({where:{id:existing.id},data:{status:'processing',reply:resumedProgress,leaseOwner,leaseUntil:new Date(now()+leaseMs)}}),recovered:true,checkpoint:live};
                    }
                    return { ...existing, existing: true };
                }
                if (await tx.privateActionReceipt.count({ where: { runId } }) >= 256)
                    throw fail();
                const manifest = await tx.privateClientObject.findUnique({ where: { id: manifestId } });
                if (!manifest || manifest.runId !== runId || manifest.revision !== manifestRevision || manifest.removed)
                    throw fail();
                const active = await tx.privateActionReceipt.findFirst({ where: { runId, status: { in: ['processing', 'uncertain'] } } });
                if (active&&!(fresh.metadata?.privateCancellation&&allowCancelledExport))
                    throw fail();
                if(!(fresh.metadata?.privateCancellation&&allowCancelledExport)&&await tx.privateToolCall.count({where:{runId,status:'reserved'}}))throw Error('PRIVATE_TOOL_OUTCOME_UNKNOWN');
                leaseOwner=randomUUID();leaseRequestId=requestId;
                const created=await tx.privateActionReceipt.create({ data: { id: randomUUID(), runId, requestId, digest, status: 'processing',leaseOwner,leaseUntil:new Date(now()+leaseMs) } });
                if(checkpoint){
                    const root=checkpoint.rootRequestId,old=await tx.privateClientObject.findUnique({where:{runId_objectId:{runId,objectId:root}}});
                    if(old&&(old.kind!=='checkpoint'||old.vaultId!==vaultId||old.removed))throw fail();
                    const revision=(old?.revision??0)+1,envelope=sealClientObject(stateKey,{tenantId,runId,vaultId,objectId:root,revision,purpose:'checkpoint'},Buffer.from(JSON.stringify(checkpoint)));
                    if(old)await tx.privateClientObject.update({where:{id:old.id},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                    else await tx.privateClientObject.create({data:{runId,vaultId,objectId:root,kind:'checkpoint',revision,envelope,digest:ciphertextDigest(envelope)}});
                }
                return created;
            },{timeout:60000,maxWait:10000});
        },
        async uncertain(id, failure, {terminalResearchFailure=false}={}) {
            await db.$transaction(async tx=>{
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,1)::text AS locked`;
                const receipt = await tx.privateActionReceipt.findUnique({where:{id}});
                if (!receipt || receipt.runId !== runId || receipt.status !== 'processing') return;
                if(leaseOwner&&receipt.leaseOwner!==leaseOwner)return;
                const unresolved=await tx.privateInferenceCall.count({where:{runId,actionId:receipt.requestId,status:'reserved'}});
                const readOnlyExport=allowCancelledExport&&!await tx.privateInferenceCall.count({where:{runId,actionId:receipt.requestId}});
                const status=(readOnlyExport||!recoverableFailure(failure.error))&&!unresolved?'failed':'uncertain';
                if(status==='failed'&&terminalResearchFailure){
                    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
                    const fresh=await run(tx);
                    if(!fresh.metadata?.privateCancellation){
                        const row=await tx.privateClientObject.findFirst({where:{runId,kind:'manifest',removed:false}});
                        const value=await read(row);
                        // Preserve the last authenticated activity without
                        // promoting partial work into a completed report.
                        if(receipt.reply?.context?.purpose==='action-progress'){
                            const bytes=openClientObject(stateKey,{tenantId,runId,vaultId,objectId:receipt.requestId,revision:receipt.reply.context.revision,purpose:'action-progress'},receipt.reply);
                            try{const snapshot=JSON.parse(bytes.toString('utf8'));value.events=[...(value.events??[]),...(snapshot.events??[])];const ids=new Set((value.decisions??[]).map(d=>d.id));value.decisions=[...(value.decisions??[]),...(snapshot.decisions??[]).filter(d=>!ids.has(d.id))];}finally{bytes.fill(0);}
                        }
                        if(failure.activeWork)value.activeWork={...failure.activeWork,running:false};
                        value.status='failed';value.updatedAt=new Date().toISOString();
                        value.events??=[];value.events.push({id:randomUUID(),type:'failed',at:value.updatedAt,code:failure.error});
                        const revision=row.revision+1,envelope=sealClientObject(stateKey,{...context(fresh,row),revision},Buffer.from(JSON.stringify(value)));
                        const changed=await tx.privateClientObject.updateMany({where:{id:row.id,revision:row.revision,removed:false},data:{revision,envelope,digest:ciphertextDigest(envelope)}});
                        if(changed.count!==1)throw fail();
                        await tx.researchRun.update({where:{id:runId},data:{status:'failed'}});
                    }
                }
                // Bind finality inside authenticated ciphertext: a broker cannot
                // relabel an uncertain receipt as failed to authorize a retry.
                const payload=status==='failed'?{...failure,outcome:'failed'}:failure;
                const reply = sealClientObject(stateKey, {tenantId,runId,vaultId,objectId:receipt.requestId,revision:1,purpose:'event'}, Buffer.from(JSON.stringify(payload)));
                await tx.privateActionReceipt.updateMany({ where: { id, status: 'processing' }, data: { status, reply } });
            },{timeout:60000,maxWait:10000});
        },
    };
}
