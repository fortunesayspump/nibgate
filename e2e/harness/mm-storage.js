const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js'));
  // Use CDP to evaluate in the service worker's extension context
  const cdp = await context.newCDPSession(worker);
  const targets = await cdp.send('Target.getTargets').catch(()=>null);
  console.log('targets:', targets ? targets.targetInfos.length : 'tdp-only');
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
