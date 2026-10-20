// Apply the additive owner-test migration only to the existing dedicated
// private test database. Never touch the hub, legacy research database or rows.
import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {privateCheckpointGrant} from '../dr-nib/tools/private-checkpoint-grant.mjs';
const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url)),dotenv=require('dotenv');
const owner=dotenv.parse(await readFile('/Users/fortune/Documents/Codex/2026-10-16/task-5/owner-only-phala.env','utf8'));
const admin=JSON.parse(await readFile('/tmp/drnib-private-db-admin-vars.json','utf8'));
const target=new URL(owner.DRNIB_DATABASE_URL),url=new URL(admin.DATABASE_PUBLIC_URL);
if(target.pathname!=='/drnib_private_synthetic'||target.hostname!==url.hostname||target.port!==url.port)throw Error('Dedicated private test database mismatch');
url.pathname=target.pathname;url.search=target.search;
const {PrismaClient}=await import(pathToFileURL(require.resolve('@prisma/client')).href),db=new PrismaClient({datasourceUrl:url.href});
try{
 const identity=await db.$queryRaw`SELECT current_database() AS name,current_schema() AS schema`;
 if(identity[0]?.name!=='drnib_private_synthetic'||identity[0]?.schema!=='drnib')throw Error('Wrong private target');
 const sql=await readFile(new URL('../dr-nib/backend/prisma/migrations/0009_private_client_vault/migration.sql',import.meta.url),'utf8');
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,9)::text AS locked`;
  const check=await tx.$queryRaw`SELECT to_regclass('drnib."PrivateVaultRecord"')::text AS name`;
  if(!check[0]?.name)for(const statement of sql.split(/;\s*\n/).map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement.replace(/;$/,''));
  const billing=await readFile(new URL('../dr-nib/backend/prisma/migrations/0010_private_inference_billing/migration.sql',import.meta.url),'utf8');
  for(const statement of billing.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  const actual=await readFile(new URL('../dr-nib/backend/prisma/migrations/0011_private_actual_usage/migration.sql',import.meta.url),'utf8');
  for(const statement of actual.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  const leaseColumns=await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='drnib' AND table_name='PrivateActionReceipt' AND column_name IN ('leaseOwner','leaseUntil')`;
  if(leaseColumns.length!==0&&leaseColumns.length!==2)throw Error('Partial checkpoint migration requires review');
  if(leaseColumns.length===0){
   const checkpoints=await readFile(new URL('../dr-nib/backend/prisma/migrations/0012_private_checkpoints/migration.sql',import.meta.url),'utf8');
   for(const statement of checkpoints.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  }
  const toolsTable=await tx.$queryRaw`SELECT to_regclass('drnib."PrivateToolCall"')::text AS name`;
  if(!toolsTable[0]?.name){
   const tools=await readFile(new URL('../dr-nib/backend/prisma/migrations/0013_private_tools/migration.sql',import.meta.url),'utf8');
   for(const statement of tools.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  }
  const settlement=await readFile(new URL('../dr-nib/backend/prisma/migrations/0014_private_tool_settlement/migration.sql',import.meta.url),'utf8');
  for(const statement of settlement.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  await tx.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE ON drnib."PrivateVaultRecord", drnib."PrivateClientObject" TO drnib_private_broker_testnet');
  await tx.$executeRawUnsafe('GRANT SELECT ON drnib."PrivateActionReceipt" TO drnib_private_broker_testnet');
  await tx.$executeRawUnsafe('GRANT UPDATE ("deletedAt", "updatedAt") ON drnib."ResearchRun" TO drnib_private_broker_testnet');
  await tx.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE ON drnib."PrivateActionReceipt", drnib."PrivateInferenceCall" TO drnib_private_guest_testnet');
  // Research actions create encrypted checkpoint objects before their first
  // paid operation; manifest-only intake never exercises this permission.
  await tx.$executeRawUnsafe(privateCheckpointGrant());
  await tx.$executeRawUnsafe('GRANT UPDATE ("budgetCap") ON drnib."ResearchRun" TO drnib_private_guest_testnet');
  await tx.$executeRawUnsafe('GRANT SELECT ("id","runId","kind","amount","txRef") ON drnib."BudgetLedger" TO drnib_private_guest_testnet');
  await tx.$executeRawUnsafe('GRANT SELECT ("id","runId","questionId","tool","requestDigest","status","committedMicroUsd","costBasis","resultDigest","txHash") ON drnib."PrivateToolCall" TO drnib_private_guest_testnet');
  const [permissions]=await tx.$queryRaw`SELECT
   has_table_privilege('drnib_private_guest_testnet','drnib."PrivateClientObject"','INSERT') AS "checkpointCreate",
   has_column_privilege('drnib_private_funding_testnet','drnib."PrivateClientObject"','envelope','SELECT') AS "moneyReadsCiphertext",
   has_column_privilege('drnib_private_guest_testnet','drnib."PrivateToolCall"','request','SELECT') AS "guestReadsPublicRequest",
   has_table_privilege('drnib_private_guest_testnet','drnib."BudgetLedger"','INSERT') AS "guestWritesCharges"`;
  if(!permissions.checkpointCreate||permissions.moneyReadsCiphertext||permissions.guestReadsPublicRequest||permissions.guestWritesCharges)throw Error('Private checkpoint/payment role separation invalid');
 },{timeout:20000});
 console.log('Dedicated private test database: additive 0009–0014 schema and scoped broker/guest grants prepared. Existing research rows unchanged.');
}finally{await db.$disconnect()}
