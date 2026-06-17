#!/usr/bin/env node
import { startAppServer } from '../../app/server/start.js';
import { depositToGateway, emitEvent, initConfig, printManifest, printRoutes, printStatus, showBalance, syncSite, verifySite, connectSite } from '../packages/core/commands.js';
import { printHelp } from '../packages/core/output.js';

const command = process.argv[2] || 'help';

const handlers = {
  init: initConfig,
  dev: startAppServer,
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
