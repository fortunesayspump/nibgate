import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'iife',
  globalName: 'Nibgate',
  target: 'es2020',
  sourcemap: true,
  // The CDN script must include Gateway dependencies: browsers have no require().
  platform: 'browser',
  metafile: true,
  plugins: [{
    name: 'tree-shake-unused-node-crypto',
    setup(build) {
      // Circle's client entry also exports a Node-only GatewayClient. Its unused
      // crypto import is side-effect free and must disappear with that class.
      build.onResolve({ filter: /^crypto$/ }, ({ importer }) => {
        if (!importer.replaceAll('\\', '/').includes('/@circle-fin/x402-batching/dist/client/')) return;
        return { path: 'crypto', external: true, sideEffects: false };
      });
      // Fail closed if this or a future dependency actually needs a Node import.
      build.onEnd((result) => {
        const imports = Object.values(result.metafile?.outputs || {})
          .flatMap((output) => output.imports)
          .filter((entry) => entry.external);
        if (imports.length) return {
          errors: [{ text: `Standalone browser bundle has external imports: ${imports.map((entry) => entry.path).join(', ')}` }],
        };
      });
    },
  }],
  define: {
    'globalThis.process.env.NIBGATE_REPUTATION_CONTRACT': JSON.stringify('0x9f27fd62e75f86a3c7addfdba443aab1f930e281'),
    'globalThis.process.env.NIBGATE_REPUTATION_RPC_URL': JSON.stringify('https://rpc.testnet.arc.io'),
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
