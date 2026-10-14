import assert from 'node:assert/strict';
import { readFileSync } from './test-source.mjs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const manifest = (file) => JSON.parse(read(file));
const hubStart = read('backend/src/server/start.js');
const generateFunction = hubStart.match(/function runPrismaCommand\(\) \{[\s\S]*?\n\}/)?.[0];

function inspectHubGeneration(fail = false) {
  assert.ok(generateFunction, 'Hub generation function exists');
  const commands = [];
  const warnings = [];
  vm.runInNewContext(`${generateFunction}\nrunPrismaCommand();`, {
    path,
    __dirname: path.join(root, 'backend/src/server'),
    execSync(command) {
      commands.push(command);
      if (fail) throw new Error('Synthetic generation failure');
    },
    console: { log() {}, warn(message) { warnings.push(message); } },
  });
  return { commands, warnings };
}

test('Hub startup generates its client without schema mutation', () => {
  const { commands } = inspectHubGeneration();
  assert.equal(commands.length, 1);
  assert.match(commands[0], / generate --schema=/);
  assert.match(commands[0].replaceAll('\\', '/'), /packages\/cli\/prisma\/schema\.prisma/);
  assert.doesNotMatch(hubStart, /db push|migrate deploy|accept-data-loss/);
});

test('Hub client-generation failure never falls back to a schema command', () => {
  const { commands, warnings } = inspectHubGeneration(true);
  assert.equal(commands.length, 1);
  assert.match(commands[0], / generate --schema=/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Prisma generate skipped/);
});

test('Hub keeps legacy network backfill independent of schema management', () => {
  assert.match(hubStart, /await backfillNetworkColumns\(\)/);
  const helpers = read('backend/src/server/hub/helpers.js');
  assert.match(helpers, /updateMany\(\{ where: \{ network: null \}, data: \{ network \} \}\)/);
});

test('Dr. Nib production API and worker generate clients without migrations', () => {
  const { scripts } = manifest('dr-nib/backend/package.json');
  assert.equal(scripts['start:prod'], 'prisma generate --schema=./prisma/schema.prisma && node src/server.js');
  assert.equal(scripts['worker:prod'], 'prisma generate --schema=./prisma/schema.prisma && node src/worker.js');
  assert.equal(scripts['prestart:prod'], undefined);
  assert.equal(scripts['preworker:prod'], undefined);
});

test('Subblogs starts production from the build-generated client', () => {
  const { scripts } = manifest('subblogs/backend/package.json');
  assert.equal(scripts.start, 'cross-env NODE_ENV=production node src/index.js');
  assert.equal(scripts.postinstall, 'prisma generate');
  assert.equal(scripts.prestart, undefined);
  assert.match(read('subblogs/backend/src/lib/prisma.js'), /require\('\.\.\/\.\.\/prisma\/generated\/client'\)/);
  assert.match(read('subblogs/backend/prisma/schema.prisma'), /output\s*=\s*"\.\/generated\/client"/);
});
