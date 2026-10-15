import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const packs = join(tmpdir(), 'nibgate-release-packs');
const sdkVersion = JSON.parse(readFileSync(new URL('../packages/nibgate/package.json', import.meta.url))).version;
const walletVersion = JSON.parse(readFileSync(new URL('../packages/wallet/package.json', import.meta.url))).version;
const registryConsumer = process.argv.includes('--registry');
for (const [name, version, companion, companionVersion] of registryConsumer ? [] : [['sdk',sdkVersion,'wallet',walletVersion], ['wallet',walletVersion,'sdk',sdkVersion]]) {
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
const dependencies = {
  '@nibgate/sdk': registryConsumer ? sdkVersion : `file:${join(packs,`nibgate-sdk-${sdkVersion}.tgz`).replaceAll('\\','/')}`,
  '@nibgate/wallet': registryConsumer ? walletVersion : `file:${join(packs,`nibgate-wallet-${walletVersion}.tgz`).replaceAll('\\','/')}`,
  '@reown/appkit': '1.8.21', '@reown/appkit-adapter-wagmi': '1.8.21',
  '@tanstack/react-query': '5.101.2', react: '19.2.4', 'react-dom': '19.2.4',
  wagmi: '3.6.21', viem: '2.54.1', typescript: '5.9.3',
};
const packageOverrides = registryConsumer ? {} : {'@nibgate/sdk':dependencies['@nibgate/sdk'],'@nibgate/wallet':dependencies['@nibgate/wallet']};
writeFileSync(join(fixture,'package.json'), JSON.stringify({name:'nibgate-release-consumer',private:true,type:'module',packageManager:'pnpm@10.28.0',dependencies,pnpm:{overrides:{'@wagmi/connectors':'8.0.20',viem:'2.54.1','@coinbase/cdp-sdk':'1.51.2',...packageOverrides}}},null,2));
const pnpmCommand = process.env.NIBGATE_TEST_PNPM_PATH || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
const install = spawnSync(pnpmCommand, ['install', '--ignore-scripts'], {cwd:fixture,stdio:'inherit',shell:process.platform === 'win32'});
if(install.status!==0) throw Error(`Consumer install failed: ${install.status}`);
const require = createRequire(join(fixture,'package.json'));
const sdkFile = require.resolve('@nibgate/sdk/package.json');
const walletFile = join(require.resolve('@nibgate/wallet'), '..', '..', 'package.json');
const sdk = JSON.parse(readFileSync(sdkFile,'utf8'));
const wallet = JSON.parse(readFileSync(walletFile,'utf8'));
assert.equal(sdk.version,sdkVersion); assert.equal(wallet.version,walletVersion);
assert.equal(sdk.dependencies['@nibgate/wallet'],walletVersion);
assert.equal(wallet.dependencies['@nibgate/sdk'],sdkVersion);
assert.ok(!JSON.stringify({sdk,wallet}).includes('workspace:'));
assert.equal(realpathSync(require.resolve('react')), realpathSync(createRequire(walletFile).resolve('react')));
const browser = await import(pathToFileURL(require.resolve('@nibgate/sdk/browser')));
const core = await import(pathToFileURL(require.resolve('@nibgate/wallet')));
assert.equal(typeof browser.createCircleGatewayBrowserAdapter,'function');
assert.equal(typeof core.runGatewayTransfer,'function');
assert.equal(typeof core.checkArcConnection,'function');
console.log('Clean packed-package install: exact matching versions, shared React, runtime exports, no workspace protocols PASS.');
console.log(`Consumer fixture: ${fixture}`);
