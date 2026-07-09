import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'iife',
  globalName: 'Nibgate',
  target: 'es2020',
  sourcemap: true,
  define: {
    'globalThis.process.env.NIBGATE_REPUTATION_CONTRACT': JSON.stringify('0x9f27fd62e75f86a3c7addfdba443aab1f930e281'),
    'globalThis.process.env.NIBGATE_REPUTATION_RPC_URL': JSON.stringify('https://rpc.testnet.arc.network'),
    'globalThis.process.env.NIBGATE_REPUTATION_CHAIN_ID': JSON.stringify('5042002'),
    'globalThis.process.env.NIBGATE_REPUTATION_CHAIN_NAME': JSON.stringify('Arc Testnet'),
  },
};

async function main() {
  await build({
    ...shared,
    entryPoints: ['./src/browser/index.js'],
    outfile: 'dist/nibgate.js',
  });

  await build({
    ...shared,
    entryPoints: ['./src/browser/index.js'],
    outfile: 'dist/nibgate.min.js',
    minify: true,
  });

  console.log('Built dist/nibgate.js and dist/nibgate.min.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
