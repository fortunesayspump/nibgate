// Synthetic, local-only database consolidation rehearsal. No cloud URLs or
// customer data are accepted. Live migration still requires its reviewed gates.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = process.env.PG_BIN_DIR || ['/opt/homebrew/opt/postgresql@18/bin', '/opt/homebrew/opt/postgresql@16/bin'].find(dir => fs.existsSync(path.join(dir, 'postgres')));
if (!bin) throw new Error('Set PG_BIN_DIR to installed local PostgreSQL binaries');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-db-'));
fs.chmodSync(work, 0o700);
const socket = path.join(work, 'socket');
const data = path.join(work, 'data');
fs.mkdirSync(socket, { mode: 0o700 });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
Object.assign(env, { PGHOST: socket, PGPORT: '55432', PGUSER: 'rehearsal_admin', PGDATABASE: 'postgres' });
const executable = name => path.join(bin, name);
function run(name, args, options = {}) {
  return execFileSync(executable(name), args, { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
}
function sql(database, statement, user = 'rehearsal_admin') {
  return run('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', database, '-U', user], { input: statement }).trim();
}
function denied(database, statement, user) {
  const result = spawnSync(executable('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-U', user], { env, input: statement, encoding: 'utf8' });
  assert.ok([2, 3].includes(result.status), 'Expected a connection or SQL permission denial');
  assert.match(result.stderr, /permission denied/);
}
let started = false;
let key;
try {
  const version = run('postgres', ['--version']).trim();
  run('initdb', ['-D', data, '-U', 'rehearsal_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', path.join(work, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories=${socket} -p 55432`, '-w', 'start']);
  started = true;
  sql('postgres', `
    CREATE ROLE hub_owner NOLOGIN;
    CREATE ROLE blog_owner NOLOGIN;
    CREATE ROLE hub_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    CREATE ROLE blog_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    CREATE DATABASE hub_fixture OWNER hub_owner;
    CREATE DATABASE blog_source;
    CREATE DATABASE blog_consolidated OWNER blog_owner;
    REVOKE CONNECT ON DATABASE hub_fixture, blog_consolidated FROM PUBLIC;
    GRANT CONNECT ON DATABASE hub_fixture TO hub_app;
    GRANT CONNECT ON DATABASE blog_consolidated TO blog_app;
  `);
  const require = createRequire(path.join(repo, 'subblogs/backend/package.json'));
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(repo, 'subblogs/backend/prisma/schema.prisma'), '--script'], {
    env: { ...env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', DATABASE_URL: 'postgresql://synthetic@localhost/synthetic' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  sql('blog_source', schema);
  sql('blog_source', `
    INSERT INTO "Site" (id,subdomain,name,"updatedAt") VALUES ('site-fixture','synthetic','Synthetic only',now());
    INSERT INTO "User" (id,"siteId",name,email,password,"updatedAt") VALUES ('user-fixture','site-fixture','Synthetic','synthetic@example.invalid','fixture-not-a-credential',now());
    INSERT INTO "BlogPost" (id,"siteId",slug,title,"bodyMarkdown","authorId","bodyStorageRef","contentKey","updatedAt") VALUES ('post-fixture','site-fixture','synthetic','Synthetic','ciphertext-fixture','user-fixture','fixture://encrypted-blob','wrapped-key-fixture',now());
    INSERT INTO "BlogPostReceipt" (id,"siteId","postId","payerWallet","paymentNonce",amount) VALUES ('receipt-fixture','site-fixture','post-fixture','fixture-wallet','fixture-nonce','0.01');
    INSERT INTO "BlogPostEntitlement" (id,"siteId","postId",wallet,source) VALUES ('grant-fixture','site-fixture','post-fixture','fixture-wallet','paid');
  `);
  const tables = ['Site', 'User', 'BlogPost', 'BlogPostReceipt', 'BlogPostEntitlement'];
  const digestSql = table => `SELECT md5(string_agg(row_to_json(t)::text, '' ORDER BY t.id)) FROM "${table}" t;`;
  const sourceDigests = Object.fromEntries(tables.map(table => [table, sql('blog_source', digestSql(table))]));
  const archive = path.join(work, 'fixture.dump');
  run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', archive, 'blog_source']);
  const plain = fs.readFileSync(archive);
  key = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(cipher.getAuthTag());
  const restored = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  assert.deepEqual(restored, plain, 'Encrypted archive round trip changed bytes');
  fs.writeFileSync(archive, restored, { mode: 0o600 });
  run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--role=blog_owner', '--dbname=blog_consolidated', archive]);
  for (const table of tables) assert.equal(sql('blog_consolidated', digestSql(table)), sourceDigests[table], `${table} changed during restore`);
  const constraintsSql = "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace;";
  assert.equal(sql('blog_consolidated', constraintsSql), sql('blog_source', constraintsSql));
  sql('blog_consolidated', `
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO blog_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO blog_app;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO blog_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE blog_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO blog_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE blog_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO blog_app;
  `);
  assert.equal(sql('blog_consolidated', 'SELECT count(*) FROM "BlogPostReceipt";', 'blog_app'), '1');
  assert.equal(sql('blog_consolidated', 'SELECT count(*) FROM "BlogPostEntitlement";', 'blog_app'), '1');
  sql('blog_consolidated', `INSERT INTO "Site" (id,subdomain,name,"updatedAt") VALUES ('write-fixture','write-fixture','Write permission',now());`, 'blog_app');
  denied('hub_fixture', 'SELECT 1;', 'blog_app');
  denied('blog_consolidated', 'SELECT 1;', 'hub_app');
  denied('blog_consolidated', 'CREATE TABLE forbidden_fixture(id integer);', 'blog_app');
  denied('blog_consolidated', 'CREATE ROLE forbidden_fixture;', 'blog_app');
  sql('blog_consolidated', 'SET ROLE blog_owner; CREATE TABLE future_fixture(id serial PRIMARY KEY);');
  sql('blog_consolidated', 'INSERT INTO future_fixture DEFAULT VALUES;', 'blog_app');
  const duplicateReceipt = spawnSync(executable('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', 'blog_consolidated', '-U', 'blog_app'], {
    env, encoding: 'utf8', input: `INSERT INTO "BlogPostReceipt" (id,"siteId","postId","payerWallet","paymentNonce") VALUES ('duplicate','site-fixture','post-fixture','fixture-wallet','fixture-nonce');`,
  });
  assert.equal(duplicateReceipt.status, 3);
  assert.match(duplicateReceipt.stderr, /duplicate key value violates unique constraint/);
  const report = {
    checkedAt: new Date().toISOString(), localPostgresVersion: version,
    syntheticOnly: true, cloudConnections: 0, realBackupTaken: false,
    realSourceAndTargetMajorVersionsVerified: false,
    schemaSource: 'subblogs/backend/prisma/schema.prisma',
    archiveEncryptedRoundTrip: true, opaqueContentAndKeyReferencesPreserved: true,
    receiptsAndEntitlementsPreserved: true, applicationReadWritePassed: true,
    crossDatabaseAccessDenied: true, applicationDdlAndRoleCreationDenied: true,
    futureMigrationGrantsPassed: true,
    receiptIdempotencyConstraintPreserved: true, restoredConstraintCountMatched: true,
    productionMigrationApplied: false,
    remaining: ['Verify live source/target major versions and tool compatibility', 'Scoped credential/security and accounting recovery', 'Encrypted live backup and restore rehearsal with exact row/constraint reconciliation', 'Write-quiescence, rollback and same-network private connectivity review'],
  };
  const reportPath = path.join(repo, 'ops/dr-nib-canary/local/blog-consolidation-rehearsal.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  key?.fill(0);
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(work, { recursive: true, force: true });
}
