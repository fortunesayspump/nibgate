import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const packs = join(tmpdir(), 'nibgate-release-packs');
for (const [name, version, companion, companionVersion] of [['sdk','0.4.37','wallet','0.4.27'], ['wallet','0.4.27','sdk','0.4.37']]) {
  const unpack = spawnSync('tar', ['-xOf', join(packs, `nibgate-${name}-${version}.tgz`), 'package/package.json'], { encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.stderr);
  const packed = JSON.parse(unpack.stdout);
  assert.equal(packed.version, version);
  assert.equal(packed.dependencies[`@nibgate/${companion}`], companionVersion, 'Archive must contain exact published companion dependency');
  assert.ok(!JSON.stringify(packed).includes('workspace:'), 'Use pnpm pack to transform workspace protocols before publication');
}
if (process.argv.includes('--archives-only')) {
  console.log('Both release archive manifests contain exact matching dependencies and no workspace protocols PASS.');
  process.exit(0);
}
const fixture = mkdtempSync(join(tmpdir(), 'nibgate-release-consumer-'));
const registryConsumer = process.argv.includes('--registry');
const dependencies = {
  '@nibgate/sdk': registryConsumer ? '0.4.37' : `file:${join(packs,'nibgate-sdk-0.4.37.tgz').replaceAll('\\','/')}`,
  '@nibgate/wallet': registryConsumer ? '0.4.27' : `file:${join(packs,'nibgate-wallet-0.4.27.tgz').replaceAll('\\','/')}`,
  '@reown/appkit': '1.8.21', '@reown/appkit-adapter-wagmi': '1.8.21',
  '@tanstack/react-query': '5.101.2', react: '19.2.4', 'react-dom': '19.2.4',
  wagmi: '3.6.21', viem: '2.54.1', typescript: '5.9.3',
};
const packageOverrides = registryConsumer ? {} : {'@nibgate/sdk':dependencies['@nibgate/sdk'],'@nibgate/wallet':dependencies['@nibgate/wallet']};
writeFileSync(join(fixture,'package.json'), JSON.stringify({name:'nibgate-release-consumer',private:true,type:'module',dependencies,pnpm:{overrides:{'@wagmi/connectors':'8.0.20',viem:'2.54.1','@coinbase/cdp-sdk':'1.51.2',...packageOverrides}}},null,2));
const install = spawnSync(process.execPath, [(process.env.NIBGATE_TEST_PNPM_PATH || process.env.npm_execpath), 'install', '--ignore-scripts'], {cwd:fixture,stdio:'inherit'});
if(install.status!==0) throw Error(`Consumer install failed: ${install.status}`);
const require = createRequire(join(fixture,'package.json'));
const sdkFile = require.resolve('@nibgate/sdk/package.json');
const walletFile = join(require.resolve('@nibgate/wallet'), '..', '..', 'package.json');
const sdk = JSON.parse(readFileSync(sdkFile,'utf8'));
const wallet = JSON.parse(readFileSync(walletFile,'utf8'));
assert.equal(sdk.version,'0.4.37'); assert.equal(wallet.version,'0.4.27');
assert.equal(sdk.dependencies['@nibgate/wallet'],'0.4.27');
assert.equal(wallet.dependencies['@nibgate/sdk'],'0.4.37');
assert.ok(!JSON.stringify({sdk,wallet}).includes('workspace:'));
assert.equal(realpathSync(require.resolve('react')), realpathSync(createRequire(walletFile).resolve('react')));
const browser = await import(pathToFileURL(require.resolve('@nibgate/sdk/browser')));
const core = await import(pathToFileURL(require.resolve('@nibgate/wallet')));
assert.equal(typeof browser.createCircleGatewayBrowserAdapter,'function');
assert.equal(typeof core.runGatewayTransfer,'function');
assert.equal(typeof core.checkArcConnection,'function');
console.log('Clean packed-package install: exact matching versions, shared React, runtime exports, no workspace protocols PASS.');
console.log(`Consumer fixture: ${fixture}`);
