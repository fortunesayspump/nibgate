// Disposable, loopback-Postgres contract test for the actual 0008 migration,
// two independent Prisma clients, and the global advisory-lock admission.
// Synthetic records only. No provider or paid AI call is made.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {expect,it} from 'vitest';
import {db as admin} from '../src/db.js';
import {createPostgresPrivateAiBudgetLedger,createPrivateAiBudgetGate,estimatePrivateAiReservation} from '../src/privacy/private-ai-budget.js';

const MODEL='synthetic/pinned-model-v1';
const OWNER='synthetic-budget-owner';
const PRICE={inputMicroUsdPerMillion:1_000_000,outputMicroUsdPerMillion:2_000_000};
const ENVELOPE={maxCalls:1,maxPromptBytesPerCall:1000,maxOutputTokensPerCall:100};
const PER_RUN=estimatePrivateAiReservation({...ENVELOPE,price:{
  inputMicroUsdPerMillion:BigInt(PRICE.inputMicroUsdPerMillion),
  outputMicroUsdPerMillion:BigInt(PRICE.outputMicroUsdPerMillion),
}});

function localDisposableUrl(){
  const url=new URL(process.env.DRNIB_DATABASE_URL||'');
  if(url.protocol!=='postgresql:'&&url.protocol!=='postgres:')throw new Error('Budget Postgres test requires a disposable local PostgreSQL URL');
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)||url.searchParams.get('schema')!=='drnib_test')
    throw new Error('Budget Postgres test refuses non-loopback or non-test database');
  return url;
}

it('public admission shares one persisted cap across users and still rejects another user run',async()=>{
  const url=localDisposableUrl(),schema=`drnib_public_budget_${randomUUID().replaceAll('-','')}`;
  url.searchParams.set('schema',schema);await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const clients=[new PrismaClient({datasourceUrl:url.toString()}),new PrismaClient({datasourceUrl:url.toString()})];
  try{
    await clients[0].$executeRawUnsafe('CREATE TABLE "ResearchRun" ("id" TEXT PRIMARY KEY, "userId" TEXT, "deletedAt" TIMESTAMP(3), "metadata" JSONB NOT NULL)');
    await migrate0008(clients[0]);
    const owners=['alice','bob','alice','bob'],runs=owners.map(()=>randomUUID());
    for(const[i,id]of runs.entries())await clients[0].$executeRaw`INSERT INTO "ResearchRun" ("id","userId","metadata") VALUES (${id},${owners[i]},${JSON.stringify({privacyMode:'confidential'})}::jsonb)`;
    const gate=client=>createPrivateAiBudgetGate({db:client,ownerUserId:'operator',accessMode:'authenticated',monthlyAiCapMicroUsd:PER_RUN*2n,monthlyInfraCeilingMicroUsd:5_000_000n-PER_RUN*2n,modelPriceCeilings:{[MODEL]:PRICE},clock:()=>new Date('2026-10-21T12:00:00Z')});
    await expect(gate(clients[0]).run(request(runs[0],'bob'))).rejects.toMatchObject({code:'PRIVATE_AI_OWNER_ONLY'});
    const results=await Promise.allSettled(runs.map((id,i)=>gate(clients[i%2]).run(request(id,owners[i]))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    expect(results.filter(r=>r.reason?.code==='PRIVATE_AI_MONTHLY_CAP')).toHaveLength(2);
    const rows=await clients[0].privateAiBudgetReservation.findMany();
    expect(rows.reduce((sum,r)=>sum+r.committedMicroUsd,0n)).toBe(PER_RUN*2n);
  }finally{
    await Promise.all(clients.map(c=>c.$disconnect()));
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});
function budgetGate(client,month,cap){return createPrivateAiBudgetGate({db:client,ownerUserId:OWNER,
  monthlyAiCapMicroUsd:cap,monthlyInfraCeilingMicroUsd:5_000_000n-cap,
  modelPriceCeilings:{[MODEL]:PRICE},clock:()=>new Date(`${month}-16T12:00:00.000Z`)});}
function request(runId,tenantId=OWNER,execute=async({infer})=>infer({messages:[{role:'user',content:'synthetic prompt'}],
  dispatch:async()=>({value:'synthetic result'})})){return {runId,tenantId,model:MODEL,...ENVELOPE,execute}}

async function migrate0008(client){
  const path=fileURLToPath(new URL('../prisma/migrations/0008_private_ai_budget/migration.sql',import.meta.url));
  const sql=(await readFile(path,'utf8')).split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await client.$executeRawUnsafe(statement);
}

it('migration 0008 serializes global admission, retains crash charges, partitions months and enforces persisted owner',async()=>{
  const base=localDisposableUrl();
  const schema=`drnib_budget_test_${randomUUID().replaceAll('-','')}`;
  const schemaUrl=new URL(base);schemaUrl.searchParams.set('schema',schema);
  // The generated client must include 0008. Never install or generate from
  // within this test, and never change the production schema.
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  let first,second;
  try{
    first=new PrismaClient({datasourceUrl:schemaUrl.toString()});
    second=new PrismaClient({datasourceUrl:schemaUrl.toString()});
    await Promise.all([first.$connect(),second.$connect()]);
    expect(typeof first.privateAiBudgetReservation?.create).toBe('function');
    await first.$executeRawUnsafe('CREATE TABLE "ResearchRun" ("id" TEXT PRIMARY KEY, "userId" TEXT, "deletedAt" TIMESTAMP(3), "metadata" JSONB NOT NULL)');
    await migrate0008(first);
    const runs=Array.from({length:9},()=>randomUUID());
    for(const [index,id] of runs.entries())await first.$executeRaw`
      INSERT INTO "ResearchRun" ("id", "userId", "metadata")
      VALUES (${id}, ${index===4?'another-synthetic-owner':OWNER}, ${JSON.stringify({privacyMode:'confidential'})}::jsonb)`;

    const octoberCap=PER_RUN*2n;
    const gates=[budgetGate(first,'2026-10',octoberCap),budgetGate(second,'2026-10',octoberCap)];
    const outcomes=await Promise.allSettled(runs.slice(0,4).map((id,i)=>gates[i%2].run(request(id))));
    expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(2);
    expect(outcomes.filter(o=>o.reason?.code==='PRIVATE_AI_MONTHLY_CAP')).toHaveLength(2);
    expect(outcomes.filter(o=>o.status==='fulfilled').map(o=>o.value)).toEqual(['synthetic result','synthetic result']);
    const october=await first.privateAiBudgetReservation.findMany({where:{monthKey:'2026-10'}});
    expect(october).toHaveLength(2);
    expect(october.reduce((sum,row)=>sum+row.committedMicroUsd,0n)).toBe(octoberCap);
    expect(october.every(row=>row.committedMicroUsd===row.reservedMicroUsd&&row.status==='settled')).toBe(true);

    // A browser/capability claim cannot override the persisted owner.
    await expect(budgetGate(second,'2026-10',octoberCap).run(request(runs[4]))).rejects.toMatchObject({code:'PRIVATE_AI_OWNER_ONLY'});
    expect(await first.privateAiBudgetReservation.findUnique({where:{runId:runs[4]}})).toBeNull();

    // Reserve, then simulate a process crash before dispatch/finalization. It
    // must remain fully counted and a retry must not make a second AI call.
    const november='2026-11';
    await createPostgresPrivateAiBudgetLedger(first).reserve({runId:runs[5],tenantId:OWNER,ownerUserId:OWNER,
      month:november,model:MODEL,...ENVELOPE,amount:PER_RUN,monthlyAiCapMicroUsd:PER_RUN});
    const crashed=await second.privateAiBudgetReservation.findUnique({where:{runId:runs[5]}});
    expect(crashed.status).toBe('reserved');
    expect(crashed.committedMicroUsd).toBe(PER_RUN);
    let dispatched=false;
    await expect(budgetGate(second,november,PER_RUN).run(request(runs[5],OWNER,async()=>{dispatched=true})))
      .rejects.toMatchObject({code:'PRIVATE_AI_ALREADY_RESERVED'});
    await expect(budgetGate(second,november,PER_RUN).run(request(runs[6],OWNER,async()=>{dispatched=true})))
      .rejects.toMatchObject({code:'PRIVATE_AI_MONTHLY_CAP'});
    expect(dispatched).toBe(false);

    // A new UTC month is independently admissible; October/November ledgers
    // are untouched and no provider result.usage can reduce this reservation.
    expect(await budgetGate(second,'2026-12',PER_RUN).run(request(runs[7]))).toBe('synthetic result');
    const december=await first.privateAiBudgetReservation.findUnique({where:{runId:runs[7]}});
    expect(december.monthKey).toBe('2026-12');
    expect(december.committedMicroUsd).toBe(PER_RUN);
    expect(await first.privateAiBudgetReservation.count({where:{monthKey:november}})).toBe(1);
    expect(await first.privateAiBudgetReservation.count({where:{monthKey:'2026-10'}})).toBe(2);
  }finally{
    await Promise.allSettled([first?.$disconnect(),second?.$disconnect()].filter(Boolean));
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});
