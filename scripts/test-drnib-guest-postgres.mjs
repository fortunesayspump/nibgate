/** Real PostgreSQL regression on a brand-new disposable loopback cluster only.
 * Set NIBGATE_POSTGRES_BIN to an existing reviewed PostgreSQL bin directory.
 * Optional NIBGATE_POSTGRES_SHARE / NIBGATE_POSTGRES_LIB support extracted official
 * distro packages. No configured DATABASE_URL is used, reset, migrated or read.
 * Every record/model result is synthetic; no model/wallet/network API is called.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import net from 'node:net';
const root=path.resolve(import.meta.dirname,'..'),app=path.join(root,'dr-nib/backend');
const bin=process.env.NIBGATE_POSTGRES_BIN;
if(!bin||!path.isAbsolute(bin))throw Error('Set NIBGATE_POSTGRES_BIN to reviewed local PostgreSQL binaries.');
const dir=await mkdtemp(path.join(tmpdir(),'nibgate-guest-postgres-')),data=path.join(dir,'data');
const password='disposable-fixture-only',schema='drnib_guest_fixture';
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const base=`postgresql://fixture:${password}@127.0.0.1:${port}/postgres`,url=`${base}?schema=${schema}&connection_limit=12`;
const inherited={...process.env};
// libpq's inherited service/hostaddr can override an otherwise local host.
// Clear all PG connection/service settings before passing explicit fixture args.
for(const key of Object.keys(inherited))if(key.startsWith('PG'))delete inherited[key];
const env={...inherited,PGPASSWORD:password,DATABASE_URL:base,HUB_DATABASE_URL:base,DRNIB_DATABASE_URL:url,DRNIB_PRIVATE_BROKER_ONLY:'true',OPENROUTER_API_KEY:'',DRNIB_AGENT_PRIVATE_KEY:'',SANDBOX_URL:'',SANDBOX_API_KEY:'',SANDBOX_TOKEN:''};
function run(command,args,{quiet=false,cwd=root}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',v=>{out+=v;if(!quiet)process.stdout.write(v)});child.stderr.on('data',v=>{out+=v;if(!quiet)process.stderr.write(v)});child.once('error',reject);child.once('exit',code=>code===0?resolve(out):reject(Error(`${path.basename(command)} exited ${code}: ${out.slice(-3000)}`)));});}
const psql=args=>run(path.join(bin,'psql'),['-X','-h','127.0.0.1','-p',String(port),'-U','fixture','-d','postgres','-v','ON_ERROR_STOP=1',...args],{quiet:true});
let started=false,db,other;
try{
 await writeFile(path.join(dir,'password'),password,{mode:0o600});
 const init=['-D',data,'-U','fixture','-A','scram-sha-256',`--pwfile=${path.join(dir,'password')}`,'--no-locale','--encoding=UTF8','--no-instructions'];
 if(process.env.NIBGATE_POSTGRES_SHARE)init.push('-L',process.env.NIBGATE_POSTGRES_SHARE);
 if(process.env.NIBGATE_POSTGRES_LIB)init.push('-c',`dynamic_library_path=${process.env.NIBGATE_POSTGRES_LIB}`);
 await run(path.join(bin,'initdb'),init,{quiet:true});
 await run(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -k ''`,'-w','start'],{quiet:true});started=true;
 const actual=(await psql(['-Atc','SHOW data_directory'])).trim();assert.equal(await realpath(actual),await realpath(data));
 assert.equal(new URL(url).hostname,'127.0.0.1');
 const migrationRoot=path.join(app,'prisma/migrations'),guest='20261027162000_guest_planning';
 const names=(await readdir(migrationRoot,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();assert.ok(names.includes(guest));
 const before=names.filter(n=>n!==guest);let baseSql=`BEGIN; CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}";\n`;
 for(const name of before)baseSql+=`\n-- ${name}\n`+await readFile(path.join(migrationRoot,name,'migration.sql'),'utf8');
 baseSql+='\nCOMMIT;\n';await writeFile(path.join(dir,'base.sql'),baseSql);await psql(['-f',path.join(dir,'base.sql')]);
 const legacyId=randomUUID();
 await psql(['-c',`INSERT INTO "${schema}"."ResearchRun" ("id","userId","brief","metadata","updatedAt") VALUES ('${legacyId}','fixture-existing-account','{"synthetic":"existing row"}','{"privacyMode":"confidential"}',CURRENT_TIMESTAMP)`]);
 const beforeExisting=(await psql(['-Atc',`SELECT row_to_json(r)::text FROM "${schema}"."ResearchRun" r WHERE id='${legacyId}'`])).trim();
 const migration=await readFile(path.join(migrationRoot,guest,'migration.sql'),'utf8');await writeFile(path.join(dir,'guest.sql'),`BEGIN; SET LOCAL search_path TO "${schema}";\n${migration}\nCOMMIT;\n`);await psql(['-f',path.join(dir,'guest.sql')]);
 const afterExisting=(await psql(['-Atc',`SELECT row_to_json(r)::text FROM "${schema}"."ResearchRun" r WHERE id='${legacyId}'`])).trim();assert.equal(afterExisting,beforeExisting);
 console.log('PASS additive migration preserves existing synthetic account run byte-for-byte');
 console.log(`PASS actual SQL migration: ${before.length} historical migrations + ${guest}; SHA256 ${createHash('sha256').update(migration).digest('hex')}`);
 for(const key of Object.keys(process.env))if(key.startsWith('PG'))delete process.env[key];
 Object.assign(process.env,env);
 const require=createRequire(path.join(app,'package.json'));
 await run(process.execPath,[require.resolve('prisma/build/index.js'),'generate','--schema',path.join(app,'prisma/schema.prisma')],{quiet:true,cwd:app});
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasources:{db:{url}}});other=new PrismaClient({datasources:{db:{url}}});
 const {createGuestPlanningService,guestPlanningSettings}=await import('../dr-nib/backend/src/privacy/guest-planning.js');
 const settings={...guestPlanningSettings({DRNIB_PRIVATE_RECORDS_ENABLED:'true',DRNIB_GUEST_PLANNING_ENABLED:'true',DRNIB_GUEST_WORKER_REVIEWED:'true'}),maxSessionsPerDay:50,maxSessionsPerIpHour:3};
 const a=createGuestPlanningService({store:db,settings}),b=createGuestPlanningService({store:other,settings});
 const issuance=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?a:b).issue('fixture-concurrent-ip')));
 assert.equal(issuance.filter(x=>x.status==='fulfilled').length,3);assert.ok(issuance.filter(x=>x.status==='rejected').every(x=>x.reason.code==='GUEST_RATE_LIMIT'));
 assert.equal(await db.guestPlanningSession.count(),3);const rate=await db.guestPlanningRateWindow.findFirst({where:{id:{startsWith:'guest:day:'}}});assert.equal(rate.count,3);
 console.log('PASS concurrent PostgreSQL issuance: exactly3/10 accepted; rejected transactions rolled back global quota');
 const g=issuance.find(x=>x.status==='fulfilled').value;
 const envelope=(kind,id,tenant=g.tenantId,vault=g.vaultId,run=g.runId)=>({version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(kind==='project-keys'?80:kind==='vault-recovery'?48:40).toString('base64'),context:kind==='vault-recovery'?{tenantId:tenant,vaultId:vault,runId:null,revision:1,purpose:kind}:kind==='project-keys'?{tenantId:tenant,vaultId:vault,runId:run,revision:1,purpose:kind}:{tenantId:tenant,vaultId:vault,runId:run,objectId:id,revision:1,purpose:kind}});
 const manifestId=randomUUID(),bootstrap={manifestId,vaultRecoveryEnvelope:envelope('vault-recovery'),projectKeysEnvelope:envelope('project-keys'),manifestEnvelope:envelope('manifest',manifestId)};
 await Promise.all([a.bootstrap(g.token,bootstrap),b.bootstrap(g.token,bootstrap)]);assert.equal(await db.researchRun.count({where:{id:g.runId}}),1);assert.equal(await db.privateClientObject.count({where:{runId:g.runId}}),2);
 const adoptionId=randomUUID(),user={id:'fixture-account'},claims=await Promise.allSettled([a.prepare(g.token,user,adoptionId),b.prepare(g.token,{id:'fixture-other-account'},randomUUID())]);
 assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);assert.equal(claims.filter(x=>x.status==='rejected')[0].reason.code,'GUEST_ADOPTION_CLAIMED');
 const claimed=claims.find(x=>x.status==='fulfilled').value,owner={id:claimed.userId};
 const vaultId=randomUUID();await db.privateVaultRecord.create({data:{userId:owner.id,vaultId,recoveryEnvelope:{fixture:true}}});
 const id=claimed.targetRunId,newManifest=randomUUID(),commit={adoptionId:claimed.adoptionId,id,vaultId,expectedVaultRevision:1,manifestId:newManifest,manifestEnvelope:envelope('manifest',newManifest,owner.id,vaultId,id),projectKeysEnvelope:envelope('project-keys',null,owner.id,vaultId,id)};
 const committed=await Promise.all([a.commit(g.token,owner,commit),b.commit(g.token,owner,commit)]);assert.deepEqual(committed[0],committed[1]);assert.equal(await db.researchRun.count({where:{id}}),1);assert.equal(await db.privateClientObject.count({where:{runId:id}}),2);assert.equal((await db.researchRun.findUnique({where:{id:g.runId}})).userId,g.tenantId);
 console.log('PASS concurrent PostgreSQL bootstrap/claim/commit: one claim, one target, exact replay, guest ciphertext ownership unchanged');
 const second=await a.issue('fixture-vault-race'),secondManifest=randomUUID(),en=(kind,oid)=>({...envelope(kind,oid,second.tenantId,second.vaultId,second.runId)});
 await a.bootstrap(second.token,{manifestId:secondManifest,vaultRecoveryEnvelope:en('vault-recovery'),projectKeysEnvelope:en('project-keys'),manifestEnvelope:en('manifest',secondManifest)});
 const frozen=await a.prepare(second.token,owner,randomUUID()),bad={...commit,adoptionId:frozen.adoptionId,id:frozen.targetRunId,manifestId:randomUUID()};bad.manifestEnvelope=envelope('manifest',bad.manifestId,owner.id,vaultId,bad.id);bad.projectKeysEnvelope=envelope('project-keys',null,owner.id,vaultId,bad.id);
 await db.privateVaultRecord.update({where:{userId:owner.id},data:{revision:{increment:1}}});await assert.rejects(a.commit(second.token,owner,bad),{code:'GUEST_ADOPTION_CONFLICT'});assert.equal(await db.researchRun.count({where:{id:bad.id}}),0);
 console.log('PASS PostgreSQL vault-generation CAS rejects stale adoption without partial target');
 console.log('PASS real PostgreSQL guest migration and concurrency suite; loopback-only disposable fixture');
}finally{
 await db?.$disconnect();await other?.$disconnect();
 const shared=globalThis.__drnibPrisma;if(shared)for(const value of Object.values(shared))if(value&&typeof value.$disconnect==='function')await value.$disconnect();
 if(started)await run(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{quiet:true});
 if(!dir.startsWith(path.join(tmpdir(),'nibgate-guest-postgres-')))throw Error('Refusing unexpected fixture cleanup path');
 await rm(dir,{recursive:true,force:true});
}
