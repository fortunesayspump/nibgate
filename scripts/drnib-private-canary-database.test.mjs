// A disposable loopback-only PostgreSQL rehearsal. Never reads configured DB URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import net from 'node:net';
import {canaryDatabaseSql} from '../dr-nib/tools/private-canary-database.mjs';
// Keep the default aligned with test-tip-postgres.mjs and its README. On macOS
// tmpdir() resolves to /var/folders/..., which otherwise made this one broad
// test look in a different location from the documented shared harness.
const harnessRoot=resolve(process.env.NIBGATE_POSTGRES_HARNESS||'/tmp/nibgate-pg-harness');
const harness=createRequire(join(harnessRoot,'package.json'));
const app=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
test('fresh canary schema applies atomically and financial, ciphertext and lifecycle permissions stay separate',async()=>{
 const{default:EmbeddedPostgres}=await import(pathToFileURL(harness.resolve('embedded-postgres')).href);
 const dir=await mkdtemp(join(tmpdir(),'drnib-canary-permissions-'));
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const pg=new EmbeddedPostgres({databaseDir:join(dir,'data'),user:'fixture',password:'local-fixture-only',port,persistent:false,postgresFlags:['-c','listen_addresses=127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:()=>{}});
 let client;
 try{
  await pg.initialise();await pg.start();const bootstrap=pg.getPgClient();await bootstrap.connect();try{await bootstrap.query('CREATE DATABASE drnib_private_canary');}finally{await bootstrap.end();}
  const{Client}=harness('pg');client=new Client({host:'127.0.0.1',port,user:'fixture',password:'local-fixture-only',database:'drnib_private_canary'});await client.connect();
  const diff=spawnSync(process.execPath,[app.resolve('prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{cwd:new URL('../dr-nib/backend',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DRNIB_DATABASE_URL:'postgresql://fixture:unused@127.0.0.1:1/drnib_private_canary?schema=drnib'},encoding:'utf8',timeout:60000});
  assert.equal(diff.status,0,'Offline Prisma schema generation');
  const sql=canaryDatabaseSql({schemaSql:diff.stdout,billingView:await readFile(new URL('../dr-nib/backend/prisma/migrations/0015_private_tool_billing_metadata/migration.sql',import.meta.url),'utf8')});
  await client.query(sql);
  const asRole=async(role,query,allowed)=>{await client.query(`SET ROLE drnib_private_canary_${role}`);try{if(allowed)await client.query(query);else await assert.rejects(client.query(query),e=>e.code==='42501');}finally{await client.query('RESET ROLE');}};
  await asRole('broker','SELECT * FROM drnib."PrivateClientObject" LIMIT 0',true);
  await asRole('broker','UPDATE drnib."PrivateInferenceCall" SET status=status WHERE false',false);
  await asRole('guest','SELECT * FROM drnib."PrivateWorkerObject" LIMIT 0',true);
  await asRole('guest','SELECT * FROM drnib."PrivateToolBillingMetadata" LIMIT 0',true);
  await asRole('guest','UPDATE drnib."BudgetLedger" SET kind=kind WHERE false',false);
  await asRole('guest','SELECT * FROM drnib."PrivateToolCall" LIMIT 0',false);
  await asRole('funding','SELECT "id","runId","kind","revision","removed","digest" FROM drnib."PrivateClientObject" LIMIT 0',true);
  await asRole('funding','SELECT "envelope" FROM drnib."PrivateClientObject" LIMIT 0',false);
  await asRole('funding','SELECT * FROM drnib."PrivateWorkerObject" LIMIT 0',false);
  await asRole('watchdog','SELECT * FROM drnib."PrivateWorkerLifecycle" LIMIT 0',true);
  await asRole('watchdog','SELECT * FROM drnib."PrivateClientObject" LIMIT 0',false);
  await asRole('watchdog','SELECT "metadata" FROM drnib."ResearchRun" LIMIT 0',false);
  await assert.rejects(client.query(sql),/Fresh canary database required/);await client.query('ROLLBACK');
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE 'drnib_private_canary_%' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls`)).rows[0].n,4);
 }finally{await client?.end();await pg.stop();await rm(dir,{recursive:true,force:true});}
});
