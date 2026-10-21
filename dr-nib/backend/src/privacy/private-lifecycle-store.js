/** Short row-locked transactions only. Provider/network calls happen outside
 * the transaction, after a durable operation intent has committed. */
export function createPrivateLifecycleStore({db,cvmId,tenantId,accessMode='owner'}) {
  if(!['owner','authenticated'].includes(accessMode)||!db?.$transaction||!/^[A-Za-z0-9:_-]{1,128}$/.test(cvmId||'')||!/^[A-Za-z0-9:_-]{1,128}$/.test(tenantId||''))throw Error('PHALA_LIFECYCLE_STORE_INVALID');
  return Object.freeze({async mutate(initial,fn){
    return db.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "PrivateWorkerLifecycle" ("id","state") VALUES (${cvmId},${JSON.stringify({...initial,tenantId,accessMode})}::jsonb) ON CONFLICT ("id") DO NOTHING`;
      const [row]=await tx.$queryRaw`SELECT "state",floor(extract(epoch FROM clock_timestamp())*1000)::float8 AS "now" FROM "PrivateWorkerLifecycle" WHERE "id"=${cvmId} FOR UPDATE`;
      const [work]=await tx.$queryRaw`SELECT count(*)::integer AS "busy" FROM "PrivateActionReceipt" a JOIN "ResearchRun" r ON r."id"=a."runId" WHERE (r."userId"=${tenantId} OR (${accessMode==='authenticated'} AND r."metadata"->>'privacyMode'='confidential')) AND a."status" IN ('processing','uncertain') AND a."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`;
      if(row.state.tenantId!==tenantId||(row.state.accessMode??'owner')!==accessMode)throw Error('PHALA_LIFECYCLE_TENANT_MISMATCH');
      const out=fn(row.state,Number(row.now),Number(work.busy));
      await tx.$executeRaw`UPDATE "PrivateWorkerLifecycle" SET "state"=${JSON.stringify(row.state)}::jsonb,"updatedAt"=clock_timestamp() WHERE "id"=${cvmId}`;
      return out;
    },{timeout:10000,maxWait:10000});
  }});
}
