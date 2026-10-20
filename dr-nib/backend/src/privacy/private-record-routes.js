import { canonicalCiphertext, ciphertextDigest } from './ciphertext-digest.js';
import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { isConfidentialRun } from './guard.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['project-keys', 'manifest', 'source', 'intent', 'discussion', 'export']);
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys;
const digest = ciphertextDigest;
function b64(v, min, max) { if (typeof v !== 'string' || v.length > Math.ceil(max * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    return false; const b = Buffer.from(v, 'base64'); return b.length >= min && b.length <= max && b.toString('base64') === v; }
function validEnvelope(e, { tenantId, vaultId, runId, objectId, kind, revision }) {
    if (!exact(e, 'algorithm,ciphertext,context,iv,version') || e.version !== 1 || e.algorithm !== 'AES-256-GCM' || !b64(e.iv, 12, 12))
        return false;
    const c = e.context;
    if (kind === 'project-keys' || kind === 'vault-recovery')
        return exact(c, 'purpose,revision,runId,tenantId,vaultId') &&
            c.tenantId === tenantId && c.vaultId === vaultId && c.runId === runId && c.revision === 1 && revision === 1 && c.purpose === kind && b64(e.ciphertext, kind === 'project-keys' ? 80 : 48, kind === 'project-keys' ? 80 : 48);
    return exact(c, 'objectId,purpose,revision,runId,tenantId,vaultId') && c.tenantId === tenantId && c.vaultId === vaultId &&
        c.runId === runId && c.objectId === objectId && c.purpose === kind && c.revision === revision &&
        b64(e.ciphertext, 17, kind === 'source' ? 3 * 1024 * 1024 : kind==='intent'?16*1024:512 * 1024);
}
const unavailable = (_req, res) => res.status(503).json({ code: 'PRIVATE_RECORDS_UNAVAILABLE' });
const fail = (res, status = 503, code = 'PRIVATE_RECORDS_UNAVAILABLE') => res.status(status).json({ code });
/** Ciphertext-only owner API; storage and transactions are injected. Vault
 * enrollment and reports work without waking or trusting a running guest. */
export function createPrivateRecordsRouter({ store, storage, authenticate = unavailable, enabled = () => false, workflowEnabled=()=>false, publicRetrievalEnabled=()=>false, allowedTenantId } = {}) {
    const router = Router();
    // This router is mounted beside the existing session/report broker. Its
    // default-off gate must not shadow unrelated established private routes.
    router.use((req,_res,next)=>{
        if(!/^\/(?:identity|vault|capabilities)(?:\/|$)/.test(req.path)&&!/^\/projects(?:\/|$)/.test(req.path)&&!/^\/runs\/[^/]+\/(?:objects|actions)(?:\/|$)/.test(req.path))return next('router');
        next();
    });
    router.get('/capabilities', (_req, res) => {res.set('Cache-Control','no-store');res.json({records:enabled(),actions:enabled()&&workflowEnabled()===true,workflowRehearsal:true,payments:false,publicRetrieval:enabled()&&workflowEnabled()===true&&publicRetrievalEnabled()===true})});
    router.use((req, res, next) => authenticate(req, res, next));
    router.use((req, res, next) => {
        res.set('Cache-Control', 'private, no-store');
        if (!enabled())
            return fail(res);
        if (!req.user?.id || req.user.id !== allowedTenantId)
            return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json'))
            return fail(res, 415, 'PRIVATE_REQUEST_REJECTED');
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('sec-fetch-site') === 'cross-site')
            return fail(res, 403, 'PRIVATE_REQUEST_REJECTED');
        next();
    });
    router.get('/identity', (req, res) => res.json({ tenantId: req.user.id }));
    router.get('/vault', async (req, res) => {
        try {
            const row = await store.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
            if (!row)
                return fail(res, 404, 'PRIVATE_VAULT_NOT_ENROLLED');
            res.json({ vaultId: row.vaultId, revision: row.revision, recoveryEnvelope: row.recoveryEnvelope, passkey: row.passkey ?? null });
        }
        catch {
            return fail(res);
        }
    });
    router.put('/vault', async (req, res) => {
        try {
            const b = req.body;
            if (!exact(b, 'expectedRevision,passkey,recoveryEnvelope,vaultId') || !UUID.test(b.vaultId) || !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision < 0 ||
                !validEnvelope(b.recoveryEnvelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: null, kind: 'vault-recovery', revision: 1 }) ||
                !(b.passkey === null || exact(b.passkey, 'credentialId,envelope,salt') && b64(b.passkey.credentialId, 16, 2048) && b64(b.passkey.salt, 32, 32) &&
                    exact(b.passkey.envelope, 'ciphertext,iv') && b64(b.passkey.envelope.iv, 12, 12) && b64(b.passkey.envelope.ciphertext, 48, 48)))
                return fail(res, 400, 'PRIVATE_REQUEST_INVALID');
            let revision;
            if (b.expectedRevision === 0) {
                await store.privateVaultRecord.create({ data: { userId: req.user.id, vaultId: b.vaultId, recoveryEnvelope: b.recoveryEnvelope, passkey: b.passkey } });
                revision = 1;
            }
            else {
                const previous = await store.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
                if (!previous || digest(previous.recoveryEnvelope) !== digest(b.recoveryEnvelope)) return fail(res, 409, 'PRIVATE_RECOVERY_REPLACEMENT_REQUIRED');
                const out = await store.privateVaultRecord.updateMany({ where: { userId: req.user.id, vaultId: b.vaultId, revision: b.expectedRevision },
                    data: { revision: { increment: 1 }, recoveryEnvelope: b.recoveryEnvelope, passkey: b.passkey } });
                if (out.count !== 1)
                    return fail(res, 409, 'PRIVATE_REVISION_CONFLICT');
                revision = b.expectedRevision + 1;
            }
            return res.status(b.expectedRevision === 0 ? 201 : 200).json({ vaultId: b.vaultId, revision });
        }
        catch (e) {
            return fail(res, e?.code === 'P2002' ? 409 : 503, e?.code === 'P2002' ? 'PRIVATE_REVISION_CONFLICT' : undefined);
        }
    });
    // Replacement affects wrapped project keys only. Include trash as well as
    // active projects; all mutations share the owner lock with creation.
    router.get('/vault/recovery-snapshot', async (req, res) => {
        try {
            const vault = await store.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
            if (!vault) return fail(res, 404, 'PRIVATE_VAULT_NOT_ENROLLED');
            const projects = await store.privateClientObject.findMany({ where: { vaultId: vault.vaultId, kind: 'project-keys', removed: false,
                run: { userId: req.user.id, metadata: { path: ['privacyMode'], equals: 'confidential' } } }, take: 1001, orderBy: { runId: 'asc' } });
            if (projects.length > 1000 || projects.some(p => p.objectId !== p.runId || p.revision !== 1 || p.objectKey || digest(p.envelope) !== p.digest))
                return fail(res);
            return res.json({ vaultId: vault.vaultId, revision: vault.revision, recoveryEnvelope: vault.recoveryEnvelope,
                projects: projects.map(p => ({ runId: p.runId, expectedDigest: p.digest, envelope: p.envelope })) });
        } catch { return fail(res); }
    });
    router.post('/vault/replace-recovery', async (req, res) => {
        try {
            const b = req.body;
            if (!exact(b, 'expectedRevision,projects,recoveryEnvelope,vaultId') || !UUID.test(b.vaultId) ||
                !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision < 1 || b.expectedRevision >= 1000000 ||
                !validEnvelope(b.recoveryEnvelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: null, kind: 'vault-recovery', revision: 1 }) ||
                !Array.isArray(b.projects) || b.projects.length > 1000 || new Set(b.projects.map(p => p?.runId)).size !== b.projects.length ||
                b.projects.some(p => !exact(p, 'envelope,expectedDigest,runId') || !UUID.test(p.runId) || !/^[a-f0-9]{64}$/.test(p.expectedDigest) ||
                    !validEnvelope(p.envelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: p.runId, kind: 'project-keys', revision: 1 })))
                return fail(res, 400, 'PRIVATE_REQUEST_INVALID');
            await store.$transaction(async tx => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))::text AS locked`;
                const vault = await tx.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
                if (!vault || vault.vaultId !== b.vaultId || vault.revision !== b.expectedRevision || digest(vault.recoveryEnvelope) === digest(b.recoveryEnvelope)) throw Object.assign(Error(), { code: 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT' });
                const rows = await tx.privateClientObject.findMany({ where: { vaultId: b.vaultId, kind: 'project-keys', removed: false,
                    run: { userId: req.user.id, metadata: { path: ['privacyMode'], equals: 'confidential' } } } });
                const proposed = new Map(b.projects.map(p => [p.runId, p]));
                if (rows.length !== proposed.size || rows.some(row => row.objectId !== row.runId || row.revision !== 1 || row.objectKey ||
                    !proposed.has(row.runId) || proposed.get(row.runId).expectedDigest !== row.digest || digest(row.envelope) !== row.digest)) throw Object.assign(Error(), { code: 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT' });
                // One bound batch avoids one remote database round trip per
                // project. The owner lock and old digest predicate still fence
                // concurrent changes; a partial count rolls back the whole set.
                if (rows.length) {
                    const replacements = rows.map(row => ({ id: row.id, expectedDigest: row.digest,
                        envelope: proposed.get(row.runId).envelope, digest: digest(proposed.get(row.runId).envelope) }));
                    const changed = await tx.$executeRaw `UPDATE "PrivateClientObject" AS target
                        SET "envelope" = replacement.envelope, "digest" = replacement.digest, "updatedAt" = CURRENT_TIMESTAMP
                        FROM jsonb_to_recordset(${JSON.stringify(replacements)}::jsonb)
                            AS replacement(id text, "expectedDigest" text, envelope jsonb, digest text)
                        WHERE target.id = replacement.id AND target.digest = replacement."expectedDigest"
                            AND target.kind = 'project-keys' AND target.revision = 1`;
                    if (changed !== rows.length) throw Object.assign(Error(), { code: 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT' });
                }
                const updated = await tx.privateVaultRecord.updateMany({ where: { userId: req.user.id, vaultId: b.vaultId, revision: b.expectedRevision },
                    data: { recoveryEnvelope: b.recoveryEnvelope, passkey: null, revision: { increment: 1 } } });
                if (updated.count !== 1) throw Object.assign(Error(), { code: 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT' });
            }, { timeout: 20000, maxWait: 5000 });
            return res.json({ vaultId: b.vaultId, revision: b.expectedRevision + 1 });
        } catch (error) {
            // A database/transport failure is not a rejected generation. Clients
            // must retain the staged key until the outcome is reconciled.
            return error?.code === 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT'
                ? fail(res, 409, 'PRIVATE_RECOVERY_REPLACEMENT_CONFLICT') : fail(res);
        }
    });
    router.post('/projects', async (req, res) => {
        try {
            const b = req.body;
            if (!exact(b, 'expectedVaultRevision,id,manifestEnvelope,manifestId,projectKeysEnvelope,vaultId') || ![b.id, b.manifestId, b.vaultId].every(v => UUID.test(v)) || b.id === b.manifestId || !Number.isSafeInteger(b.expectedVaultRevision) || b.expectedVaultRevision < 1 ||
                !validEnvelope(b.projectKeysEnvelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: b.id, kind: 'project-keys', revision: 1 }) ||
                !validEnvelope(b.manifestEnvelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: b.id, objectId: b.manifestId, kind: 'manifest', revision: 1 }))
                return fail(res, 400, 'PRIVATE_REQUEST_INVALID');
            const vault = await store.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
            if (vault?.vaultId !== b.vaultId)
                return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
            await store.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))::text AS locked`;
                const currentVault = await tx.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
                if (currentVault?.vaultId !== b.vaultId || currentVault.revision !== b.expectedVaultRevision) throw Object.assign(Error(), { code: 'P2002' });
                if (await tx.researchRun.count({ where: { userId: req.user.id, deletedAt: null, metadata: { path: ['privacyMode'], equals: 'confidential' } } }) >= 100)
                    throw Object.assign(Error(), { code: 'PRIVATE_LIMIT' });
                await tx.researchRun.create({ data: { id: b.id, userId: req.user.id, walletAddress: req.user.walletAddress ?? null, title: null, description: null, brief: { encrypted: true }, metadata: { privacyMode: 'confidential', schemaVersion: 1 }, status: 'draft' } });
                for (const [kind, objectId, envelope] of [['project-keys', b.id, b.projectKeysEnvelope], ['manifest', b.manifestId, b.manifestEnvelope]])
                    await tx.privateClientObject.create({ data: { runId: b.id, vaultId: b.vaultId, objectId, kind, revision: 1, envelope, digest: digest(envelope) } });
            }, { timeout:20000, maxWait:5000 });
            return res.status(201).json({ id: b.id, tenantId: req.user.id });
        }
        catch (e) {
            if(process.env.DRNIB_LOCAL_STORAGE_DIAGNOSTICS==='true')console.warn('[private-storage]',{operation:'create-project',code:/^P[0-9]{4}$/.test(e?.code??'')?e.code:'UNCLASSIFIED'});
            return fail(res, e?.code === 'P2002' ? 409 : e?.code === 'PRIVATE_LIMIT' ? 429 : 503);
        }
    });
    router.get('/projects', async (req, res) => {
        try {
            const runs = await store.researchRun.findMany({ where: { userId: req.user.id, metadata: { path: ['privacyMode'], equals: 'confidential' }, deletedAt: req.query.deleted === '1' ? { not: null } : null }, orderBy: { updatedAt: 'desc' }, take: 100 });
            return res.json({ runs: runs.map(r => ({ id: r.id, status: r.metadata?.privateCancellation?'ended':r.status, cancelled: Boolean(r.metadata?.privateCancellation), createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt })) });
        }
        catch {
            return fail(res);
        }
    });
    async function owned(tx, req) {
        if (!UUID.test(req.params.runId))
            return null;
        const run = await tx.researchRun.findUnique({ where: { id: req.params.runId } });
        return run && run.userId === req.user.id && run.deletedAt == null && isConfidentialRun(run) ? run : null;
    }
    router.get('/runs/:runId/actions', async (req, res) => {
        try {
            const run=await owned(store,req);if(!run)return fail(res,404,'PRIVATE_RECORD_NOT_FOUND');
            if(run.metadata?.privateCancellation)return res.json({state:'cancelled'});
            const row = await store.privateActionReceipt.findFirst({ where: { runId: req.params.runId, status: { in: ['processing', 'uncertain'] } }, orderBy: { createdAt: 'desc' } });
            return res.json(row ? { requestId: row.requestId, state: row.status,
                ...(['processing','uncertain'].includes(row.status)&&row.leaseUntil instanceof Date&&row.leaseUntil.getTime()<=Date.now()?{recoveryAvailable:true}:{}),
                ...(row.status === 'processing' && row.reply ? { progress: row.reply } : {}) } : { state: 'idle' });
        } catch { return fail(res); }
    });
    router.get('/runs/:runId/actions/:requestId', async (req, res) => {
        try {
            const run=await owned(store,req);
            if(!UUID.test(req.params.requestId)||!run)return fail(res,404,'PRIVATE_RECORD_NOT_FOUND');
            const row = await store.privateActionReceipt.findUnique({ where: { runId_requestId: { runId: req.params.runId, requestId: req.params.requestId } } });
            // Completed ciphertext receipts, including read-only exports, remain
            // retrievable after cancellation. Other work stays fenced.
            if(run.metadata?.privateCancellation&&row?.status!=='complete')return res.json({requestId:req.params.requestId,state:'cancelled'});
            if (!row)
                return res.json({ requestId: req.params.requestId, state: 'not_started' });
            return res.json({ requestId: row.requestId, state: row.status, ...(['complete','uncertain','failed'].includes(row.status) && row.reply ? { envelope: row.reply } : {}),
                ...(['processing','uncertain'].includes(row.status)&&row.leaseUntil instanceof Date&&row.leaseUntil.getTime()<=Date.now()?{recoveryAvailable:true}:{}),
                ...(row.status === 'processing' && row.reply ? { progress: row.reply } : {}) });
        }
        catch {
            return fail(res);
        }
    });
    for (const [method, path, deleted] of [['delete', '/projects/:runId', true], ['post', '/projects/:runId/restore', false]])
        router[method](path, async (req, res) => {
            try {
                if (!UUID.test(req.params.runId))
                    return fail(res, 404);
                await store.$transaction(async (tx) => {
                    await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${req.params.runId}))::text AS locked`;
                    const run = await tx.researchRun.findUnique({ where: { id: req.params.runId } });
                    if (!run || run.userId !== req.user.id || !isConfidentialRun(run) || await tx.privateActionReceipt.count({ where: { runId: run.id, status: { in: ['processing', 'uncertain'] } } }))
                        throw Error();
                    await tx.researchRun.update({ where: { id: run.id }, data: { deletedAt: deleted ? new Date() : null } });
                });
                return res.json({ id: req.params.runId, deleted });
            }
            catch {
                return fail(res, 409);
            }
        });
    router.get('/runs/:runId/objects', async (req, res) => {
        try {
            if (!await owned(store, req))
                return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
            const rows = await store.privateClientObject.findMany({ where: { runId: req.params.runId, removed: false }, orderBy: { createdAt: 'asc' }, take: 128 });
            return res.json({ objects: rows.map(r => ({ objectId: r.objectId, kind: r.kind, revision: r.revision, vaultId: r.vaultId })) });
        }
        catch {
            return fail(res);
        }
    });
    router.get('/runs/:runId/objects/:objectId', async (req, res) => {
        try {
            if (!UUID.test(req.params.objectId) || !await owned(store, req))
                return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
            const row = await store.privateClientObject.findUnique({ where: { runId_objectId: { runId: req.params.runId, objectId: req.params.objectId } } });
            if (!row || row.removed)
                return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
            let envelope = row.envelope;
            if (row.objectKey) {
                const bytes = await storage.get(row.objectKey);
                if (createHash('sha256').update(bytes).digest('hex') !== row.digest)
                    return fail(res);
                envelope = JSON.parse(bytes.toString('utf8'));
            }
            else if (digest(envelope) !== row.digest)
                return fail(res);
            return res.json({ objectId: row.objectId, kind: row.kind, vaultId: row.vaultId, revision: row.revision, envelope });
        }
        catch {
            return fail(res);
        }
    });
    router.put('/runs/:runId/objects/:objectId', async (req, res) => {
        let writtenKey = null, committed = false;
        try {
            const b = req.body;
            if (!UUID.test(req.params.objectId) || !exact(b, 'envelope,expectedRevision,kind,vaultId') || !UUID.test(b.vaultId) || !KINDS.has(b.kind) ||
                !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision < 0 || b.expectedRevision > 1000000 ||
                ['project-keys','intent'].includes(b.kind) && b.expectedRevision !== 0 ||
                !validEnvelope(b.envelope, { tenantId: req.user.id, vaultId: b.vaultId, runId: req.params.runId, objectId: req.params.objectId, kind: b.kind, revision: b.expectedRevision + 1 }))
                return fail(res, 400, 'PRIVATE_REQUEST_INVALID');
            const vault = await store.privateVaultRecord.findUnique({ where: { userId: req.user.id } });
            if (!vault || vault.vaultId !== b.vaultId || !await owned(store, req))
                return fail(res, 404, 'PRIVATE_RECORD_NOT_FOUND');
            if (b.kind === 'source') {
                if (!storage?.put)
                    return fail(res);
                writtenKey = `client-sealed/${req.params.runId}/${req.params.objectId}/${randomUUID()}`;
                await storage.put(writtenKey, Buffer.from(canonicalCiphertext(b.envelope)));
            }
            const result = await store.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${req.params.runId}))::text AS locked`;
                const run = await owned(tx, req);
                if (!run)
                    throw Object.assign(Error(), { code: 'PRIVATE_NOT_FOUND' });
                if (b.kind!=='intent'&&await tx.privateActionReceipt.count({ where: { runId: run.id, status: { in: ['processing', 'uncertain'] } } }))
                    throw Object.assign(Error(), { code: 'PRIVATE_LOCKED' });
                if(b.kind==='intent'&&(run.metadata?.privateCancellation||run.settledAt||!['planned','running','paused','awaiting'].includes(run.status)))throw Object.assign(Error(),{code:'PRIVATE_LOCKED'});
                if (b.kind === 'source' && (run.metadata?.privateEscrow?.jobId||!['draft', 'intake', 'intake-done', 'planned'].includes(run.status)))
                    throw Object.assign(Error(), { code: 'PRIVATE_LOCKED' });
                if (b.kind === 'source' && b.expectedRevision === 0 && await tx.privateClientObject.count({ where: { runId: run.id, kind: 'source', removed: false } }) >= 5)
                    throw Object.assign(Error(), { code: 'PRIVATE_LIMIT' });
                if (b.expectedRevision === 0 && await tx.privateClientObject.count({ where: { runId: run.id } }) >= 128)
                    throw Object.assign(Error(), { code: 'PRIVATE_LIMIT' });
                const data = { vaultId: b.vaultId, kind: b.kind, revision: b.expectedRevision + 1, envelope: writtenKey ? undefined : b.envelope, objectKey: writtenKey, digest: digest(b.envelope) };
                if (b.expectedRevision === 0 && ['project-keys', 'manifest'].includes(b.kind) && await tx.privateClientObject.count({ where: { runId: run.id, kind: b.kind } }) > 0)
                    throw Object.assign(Error(), { code: 'P2002' });
                if (b.expectedRevision === 0)
                    await tx.privateClientObject.create({ data: { ...data, runId: run.id, objectId: req.params.objectId } });
                else {
                    const out = await tx.privateClientObject.updateMany({ where: { runId: run.id, objectId: req.params.objectId, vaultId: b.vaultId, kind: b.kind, revision: b.expectedRevision, removed: false }, data });
                    if (out.count !== 1)
                        throw Object.assign(Error(), { code: 'P2002' });
                }
                return { objectId: req.params.objectId, revision: data.revision };
            });
            committed = true;
            return res.status(b.expectedRevision === 0 ? 201 : 200).json(result);
        }
        catch (e) {
            return fail(res, e?.code === 'P2002' ? 409 : e?.code === 'PRIVATE_NOT_FOUND' ? 404 : ['PRIVATE_LOCKED', 'PRIVATE_LIMIT'].includes(e?.code) ? 409 : 503, e?.code === 'P2002' ? 'PRIVATE_REVISION_CONFLICT' : e?.code === 'PRIVATE_LOCKED' ? 'PRIVATE_SOURCE_LOCKED' : e?.code === 'PRIVATE_LIMIT' ? 'PRIVATE_OBJECT_LIMIT' : undefined);
        }
        finally {
            if (writtenKey && !committed)
                await storage.remove(writtenKey).catch(() => { });
        }
    });
    router.delete('/runs/:runId/objects/:objectId', async (req, res) => {
        try {
            await store.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${req.params.runId}))::text AS locked`;
                const run = await owned(tx, req);
                if (!run || !UUID.test(req.params.objectId))
                    throw Error();
                if (await tx.privateActionReceipt.count({ where: { runId: run.id, status: { in: ['processing', 'uncertain'] } } }))
                    throw Error();
                const row = await tx.privateClientObject.findUnique({ where: { runId_objectId: { runId: run.id, objectId: req.params.objectId } } });
                if (!row || row.kind !== 'source' || run.metadata?.privateEscrow?.jobId || !['draft', 'intake', 'intake-done', 'planned'].includes(run.status))
                    throw Error();
                await tx.privateClientObject.update({ where: { id: row.id }, data: { removed: true } });
            });
            return res.json({ removed: true });
        }
        catch {
            return fail(res, 409, 'PRIVATE_SOURCE_LOCKED');
        }
    });
    return router;
}
