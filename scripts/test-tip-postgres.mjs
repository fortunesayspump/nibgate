// Disposable localhost-only integration runner; never reads a configured production DB.
// Bootstrap dependencies outside this repository (no lockfile changes):
// npm install --prefix /tmp/nibgate-pg-harness embedded-postgres@17.9.0-beta.17 prisma@5.22.0 @prisma/client@5.22.0
// NIBGATE_POSTGRES_HARNESS=/tmp/nibgate-pg-harness node scripts/test-tip-postgres.mjs
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const harness=resolve(process.env.NIBGATE_POSTGRES_HARNESS||'/tmp/nibgate-pg-harness');
const require=createRequire(join(harness,'package.json'));
const {default:EmbeddedPostgres}=await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const dir=await mkdtemp(join(tmpdir(),'nibgate-tip-postgres-'));
const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const pg=new EmbeddedPostgres({databaseDir:join(dir,'data'),user:'fixture',password:'local-fixture-only',port,persistent:false,postgresFlags:['-c','listen_addresses=127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:console.error});
await writeFile(join(dir,'package.json'),JSON.stringify({name:'nibgate-isolated-db-test',private:true}));
await symlink(join(harness,'node_modules'),join(dir,'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const schema=join(dir,'schema.prisma');
await writeFile(schema,(await readFile(join(root,'packages/cli/prisma/schema.prisma'),'utf8')).replace('output    = "../generated/client"',`output    = "${join(dir,'client').replaceAll('\\','/')}"`));
const url=`postgresql://fixture:local-fixture-only@127.0.0.1:${port}/nibgate_fixture?schema=public`;
const env={...process.env,DATABASE_URL:url,NIBGATE_INTEGRATION_DATABASE_URL:url,NIBGATE_INTEGRATION_PRISMA_CLIENT:join(dir,'client/index.js'),NIBGATE_DISABLE_KEEPER:'true'};
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Integration subprocess exited ${code}`)));});}
try {
 await pg.initialise();await pg.start();
 const client=pg.getPgClient();await client.connect();try{console.log((await client.query('SELECT version()')).rows[0].version);await client.query('CREATE DATABASE nibgate_fixture');}finally{await client.end();}
 const prisma=require.resolve('prisma/build/index.js');
 await run([prisma,'generate','--schema',schema]);await run([prisma,'db','push','--schema',schema,'--skip-generate']);
 await run([join(root,'node_modules/vitest/vitest.mjs'),'run','backend/src/server/routes/hub-tips-postgres.test.js','--maxWorkers=1','--minWorkers=1']);
}finally{await pg.stop();if (!dir.startsWith(join(tmpdir(),'nibgate-tip-postgres-'))) throw Error('Unexpected fixture cleanup path'); await rm(dir,{recursive:true,force:true});}
