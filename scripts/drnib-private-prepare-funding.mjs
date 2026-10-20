// Existing dedicated private test database only. No schema reset, credential
// rotation, Hub DB access, chain write or deployment.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
const dotenv=require('dotenv'),{PrismaClient}=require('@prisma/client');
const owner=dotenv.parse(await readFile('/Users/fortune/Documents/Codex/2026-10-16/task-5/owner-only-phala.env','utf8'));
const admin=JSON.parse(await readFile('/tmp/drnib-private-db-admin-vars.json','utf8'));
const target=new URL(owner.DRNIB_DATABASE_URL),url=new URL(admin.DATABASE_PUBLIC_URL);
if(target.pathname!=='/drnib_private_synthetic'||target.hostname!==url.hostname||target.port!==url.port)throw Error('Dedicated private funding target mismatch');
url.pathname=target.pathname;url.search=target.search;
const role='drnib_private_funding_testnet',file='/tmp/drnib-private-funding-db.json';
let credential;
try{credential=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;const database=new URL(url);database.username=role;database.password=randomBytes(32).toString('base64url');credential={DRNIB_DATABASE_URL:database.href};await writeFile(file,JSON.stringify(credential),{mode:0o600,flag:'wx'});}
const fundingUrl=new URL(credential.DRNIB_DATABASE_URL);
if(fundingUrl.username!==role||fundingUrl.hostname!==url.hostname||fundingUrl.port!==url.port||fundingUrl.pathname!==target.pathname||! /^[A-Za-z0-9_-]{40,50}$/.test(fundingUrl.password))throw Error('Funding credential target mismatch');
const db=new PrismaClient({datasourceUrl:url.href});
let phase='database-identity';
try{
 const identity=await db.$queryRaw`SELECT current_database() AS name,current_schema() AS schema`;
 if(identity[0]?.name!=='drnib_private_synthetic'||identity[0]?.schema!=='drnib')throw Error('Wrong private funding database');
 phase='scoped-role-grants';
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,9)::text AS locked`;
  const billing=await readFile(new URL('../dr-nib/backend/prisma/migrations/0010_private_inference_billing/migration.sql',import.meta.url),'utf8');
  for(const statement of billing.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  const actual=await readFile(new URL('../dr-nib/backend/prisma/migrations/0011_private_actual_usage/migration.sql',import.meta.url),'utf8');
  for(const statement of actual.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  const exists=await tx.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname=${role}`;
  if(!exists.length)await tx.$executeRawUnsafe("CREATE ROLE drnib_private_funding_testnet LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+fundingUrl.password+"'");
  const grants=await readFile(new URL('../dr-nib/backend/prisma/private-funding-grants.sql',import.meta.url),'utf8');
  for(const statement of grants.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
 },{timeout:20000});
 phase='scoped-credential-check';
 const scoped=new PrismaClient({datasourceUrl:fundingUrl.href});try{await scoped.$connect();await scoped.$queryRaw`SELECT 1`;}finally{await scoped.$disconnect();}
 console.log('Dedicated funding role and scoped public-money grants prepared. No key values emitted; no chain writes.');
}catch(error){console.error(JSON.stringify({fundingSetupFailed:true,phase,code:/^P[0-9]{4}$/.test(error.code??'')?error.code:null,postgresCode:/^[0-9A-Z]{5}$/.test(error.meta?.code??'')?error.meta.code:null}));process.exitCode=1;}finally{await db.$disconnect();}
