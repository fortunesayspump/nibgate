#!/usr/bin/env node
import { depositToGateway, emitEvent, initConfig, printManifest, printRoutes, printStatus, showBalance, syncSite, verifySite, connectSite } from '../src/core/commands.js';
import { printHelp } from '../src/core/output.js';

const command = process.argv[2] || 'help';

const handlers = {
  init: initConfig,
  dev: async () => {
    const { spawn } = await import('node:child_process');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(cliDir, '../../..');
    const backendEntry = path.resolve(repoRoot, 'backend/src/server/start.js');
    const child = spawn(process.execPath, [backendEntry], {
      cwd: path.dirname(backendEntry),
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', (error) => {
      console.error(`Failed to start the Nibgate backend: ${error.message}`);
      process.exit(1);
    });
    child.on('exit', (code) => process.exit(code ?? 0));
  },
  routes: printRoutes,
  manifest: printManifest,
  status: printStatus,
  connect: connectSite,
  sync: syncSite,
  verify: verifySite,
  event: () => emitEvent(process.argv[3], process.argv[4], process.argv[5]),
  balance: showBalance,
  deposit: () => depositToGateway(process.argv[3]),
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp
};

const handler = handlers[command];
if (!handler) {
  printHelp();
  process.exit(1);
}

await handler();
if (command === 'help' || command === '--help' || command === '-h') {
  process.exit(0);
}
