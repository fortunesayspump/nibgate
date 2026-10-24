// Run Dr. Nib tests on a disposable local PostgreSQL cluster, never a configured DB.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Keep the default aligned with test-tip-postgres.mjs and the documented
// disposable harness location. On macOS tmpdir() points into /var/folders,
// while the intentionally out-of-repo harness is installed under /tmp.
const harness = resolve(process.env.NIBGATE_POSTGRES_HARNESS || '/tmp/nibgate-pg-harness');
const require = createRequire(join(harness, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const dir = await mkdtemp(join(tmpdir(), 'nibgate-drnib-postgres-'));
const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), user: 'fixture', password: 'local-fixture-only', port, persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories='], onLog: () => {}, onError: console.error });
const url = `postgresql://fixture:local-fixture-only@127.0.0.1:${port}/drnib_fixture`;
const env = { ...process.env, DATABASE_URL: url, HUB_DATABASE_URL: url, DRNIB_DATABASE_URL: `${url}?schema=drnib_test`, OPENROUTER_API_KEY: '', DRNIB_AGENT_PRIVATE_KEY: '', SANDBOX_URL: '', SANDBOX_API_KEY: '', SANDBOX_TOKEN: '' };
function run(args, cwd = root) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, args, {cwd, env, stdio: 'inherit'}); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Fixture subprocess exited ${code}`))); }); }
try {
  await pg.initialise(); await pg.start();
  const client = pg.getPgClient(); await client.connect(); try { await client.query('CREATE DATABASE drnib_fixture'); } finally { await client.end(); }
  const prisma = require.resolve('prisma/build/index.js');
  await run([prisma, 'db', 'push', '--skip-generate', '--schema', join(root, 'packages/cli/prisma/schema.prisma')]);
  const app = join(root, 'dr-nib/backend');
  const appRequire = createRequire(join(app, 'package.json'));
  // Windows keeps the engine DLL locked while a local server uses it. Reuse
  // the existing generated client only when explicitly requested and no schema
  // change is under test; the disposable DB is still prepared by global setup.
  if (process.env.NIBGATE_SKIP_PRISMA_GENERATE !== '1') {
    await run([appRequire.resolve('prisma/build/index.js'), 'generate', '--schema', join(app, 'prisma/schema.prisma')], app);
  }
  await run([join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=1', '--minWorkers=1', '--reporter=dot', ...process.argv.slice(2)], app);
} finally {
  await pg.stop();
  if (!dir.startsWith(join(tmpdir(), 'nibgate-drnib-postgres-'))) throw Error('Unexpected fixture cleanup path');
  await rm(dir, {recursive: true, force: true});
}
