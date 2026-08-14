const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home);
  console.log('before import:', await mm.body(home));
  const ok = await mm.importAccountByPrivateKey(home, mm.TEST_PK);
  console.log('import ok:', ok);
  await home.waitForTimeout(1000);
  console.log('after import:', await mm.body(home));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
