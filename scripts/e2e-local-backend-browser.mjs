// Local-only HTTP + PostgreSQL fixture for browser/API smoke checks.
// It never reads repository .env files, configured databases, wallet keys, or
// production RPC credentials. Stop with Ctrl-C to remove the temporary cluster.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const harnessRoot = resolve(process.env.NIBGATE_POSTGRES_HARNESS || '/tmp/nibgate-pg-harness');
const harness = createRequire(join(harnessRoot, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(harness.resolve('embedded-postgres')).href);
const fixtureDir = await mkdtemp('/tmp/nibgate-browser-backend-');
const dbPort = await new Promise((resolvePort, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolvePort(port));
  });
});
const pg = new EmbeddedPostgres({
  databaseDir: join(fixtureDir, 'data'), user: 'fixture', password: 'local-fixture-only',
  port: dbPort, persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories='],
  onLog: () => {}, onError: console.error,
});
let server;
try {
  await pg.initialise();
  await pg.start();
  const bootstrap = pg.getPgClient();
  await bootstrap.connect();
  try { await bootstrap.query('CREATE DATABASE nibgate_browser_fixture'); } finally { await bootstrap.end(); }
  const databaseUrl = `postgresql://fixture:local-fixture-only@127.0.0.1:${dbPort}/nibgate_browser_fixture`;
  const prisma = harness.resolve('prisma/build/index.js');
  const schema = join(root, 'packages/cli/prisma/schema.prisma');
  const pushed = spawnSync(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--schema', schema], {
    cwd: root, encoding: 'utf8', timeout: 120000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: databaseUrl },
  });
  if (pushed.status !== 0) throw Error(`Fixture schema push failed: ${pushed.stderr || pushed.stdout}`);

  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'production',
    NIBGATE_NETWORK: 'testnet',
    NIBGATE_DISABLE_KEEPER: 'true',
    NIBGATE_PAYMENT_MODE: 'demo',
    NIBGATE_SITE_ORIGIN: 'http://127.0.0.1:3131',
    NIBGATE_HUB_PUBLIC_URL: 'http://127.0.0.1:3005',
    NIBGATE_MEMORY_DIAGNOSTICS: 'false',
  });
  for (const name of ['CIRCLE_API_KEY','ESCROW_KEEPER_KEY','NIBGATE_DEPLOYER_PRIVATE_KEY','E2E_BUYER_PRIVATE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']) delete process.env[name];

  const { PrismaClient } = await import(pathToFileURL(join(root, 'packages/cli/generated/client/index.js')).href);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const owner = await db.user.create({ data: { walletAddress: '0x1111111111111111111111111111111111111111', username: 'fixture' } });
  const website = await db.website.create({ data: {
    domain: 'creator.example', name: 'Local creator fixture', ownerId: owner.id,
    isVerified: true, verificationStatus: 'verified', verifyToken: 'fixture-verify', siteToken: 'fixture-site-token',
  } });
  await db.content.create({ data: {
    websiteId: website.id, externalId: 'fixture-article', title: 'Local creator article',
    description: 'Disposable browser/API fixture', contentType: 'article',
    url: 'https://creator.example/posts/local-fixture', path: '/posts/local-fixture',
    price: 1, recipientWallet: '0x2222222222222222222222222222222222222222', network: 'testnet',
  } });
  await db.$disconnect();

  const [{ createApp }, { loadServerConfig }] = await Promise.all([
    import('../backend/src/server/server.js'), import('../backend/src/server/runtime.js'),
  ]);
  const { config, statePath } = loadServerConfig();
  const app = await createApp(config, { statePath });
  server = await new Promise((resolveServer, reject) => {
    const candidate = app.listen(3005, '127.0.0.1', () => resolveServer(candidate));
    candidate.on('error', reject);
  });
  console.log('LOCAL_FIXTURE_READY http://127.0.0.1:3005 creator=https://creator.example/posts/local-fixture');
  await new Promise((resolveStop) => {
    const stop = () => resolveStop();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  });
} finally {
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  await pg.stop().catch(() => {});
  await rm(fixtureDir, { recursive: true, force: true });
}
