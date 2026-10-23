import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const {Client}=createRequire('/tmp/nibgate-pg-harness/package.json')('pg');
const root=new URL('./local/', import.meta.url);
const legacy=JSON.parse(await readFile(new URL('backups/legacy-mainnet-variables.json',root),'utf8'));
const replacements=JSON.parse(await readFile(new URL('credential-recovery-20261022/replacements.private.json',root),'utf8'));
const database='drnib_private_mainnet';
const roles=replacements.networks?.mainnet?.databaseRoles;
if(!roles) throw new Error('MAINNET_DATABASE_ROLE_CREDENTIALS_MISSING');
const expected={broker:`${database}_broker`,guest:`${database}_guest`,funding:`${database}_funding`,watchdog:`${database}_watchdog`};
for(const [kind,name] of Object.entries(expected)) if(roles[kind]?.roleName!==name||!roles[kind]?.password) throw new Error(`INVALID_${kind.toUpperCase()}_ROLE_CREDENTIAL`);

const options=connectionString=>({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000,statement_timeout:30000});
const source=new URL(legacy.HUB_DATABASE_URL);
source.search='';
const bootstrap=new Client(options(source.href));
let target;
let created=false;
try {
  await bootstrap.connect();
  const exists=(await bootstrap.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===1;
  if(!exists){ await bootstrap.query(`CREATE DATABASE ${database}`); created=true; }
  const targetUrl=new URL(source); targetUrl.pathname=`/${database}`;
  target=new Client(options(targetUrl.href)); await target.connect();
  if(!exists){
    let schema=await readFile(new URL('../prepared/database/fresh-canary.sql',root),'utf8');
    schema=schema.replaceAll('drnib_private_canary',database);
    if(schema.includes('drnib_private_canary')) throw new Error('SCHEMA_TRANSFORM_INCOMPLETE');
    await target.query(schema);
  }
  await target.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  const credentials={};
  for(const [kind,name] of Object.entries(expected)){
    const password=roles[kind].password;
    if(!/^[A-Za-z0-9_-]{32,}$/.test(password)) throw new Error(`UNSAFE_${kind.toUpperCase()}_PASSWORD_FORMAT`);
    await target.query(`ALTER ROLE "${name}" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 5 PASSWORD '${password}'`);
    await target.query(`GRANT CONNECT ON DATABASE ${database} TO "${name}"`);
    const publicUrl=new URL(legacy.HUB_DATABASE_URL);
    publicUrl.username=name; publicUrl.password=password; publicUrl.pathname=`/${database}`;
    publicUrl.search='schema=drnib&sslmode=require&connection_limit=3';
    credentials[kind]={publicUrl:publicUrl.href};
  }
  const check=await target.query(`SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolconnlimit FROM pg_roles WHERE rolname LIKE '${database}_%' ORDER BY rolname`);
  if(check.rows.length!==4||check.rows.some(r=>!r.rolcanlogin||r.rolsuper||r.rolbypassrls||r.rolcreatedb||r.rolcreaterole||r.rolinherit||r.rolconnlimit!==5)) throw new Error('ROLE_ISOLATION_INVALID');
  await writeFile(new URL('credential-recovery-20261022/mainnet-database-credentials.json',root),JSON.stringify(credentials,null,2)+'\n',{mode:0o600});
  await writeFile(new URL('mainnet-private-database-20261023.json',root),JSON.stringify({checkedAt:new Date().toISOString(),database,created,existingPostgresReused:true,roles:Object.keys(expected),restricted:true,publicConnectRevoked:true,sourceDatabaseModified:false,credentialsFile:'credential-recovery-20261022/mainnet-database-credentials.json'},null,2)+'\n');
  console.log(JSON.stringify({database,created,roles:4,restricted:true}));
} finally {
  await target?.end().catch(()=>{});
  await bootstrap.end().catch(()=>{});
}
