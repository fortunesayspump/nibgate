// Derive the CREATE2 init-code hash for TipHoldingWallet under the deployed
// factory, and verify it against the factory's onchain predict().
import fs from 'node:fs';
import { createPublicClient, http, encodeAbiParameters, keccak256, getContractAddress, toHex } from 'viem';

const FACTORY = process.argv[2];
const RPC = process.argv[3] || 'https://rpc.testnet.arc.io';
const TREASURY = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12';
const USDC = '0x3600000000000000000000000000000000000000';
const FEE_BPS = 500;
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
const DOMAIN = 26;

const artifact = JSON.parse(fs.readFileSync('contracts/out/TipHoldingWallet.sol/TipHoldingWallet.json', 'utf8'));
const creation = artifact.bytecode.object;
const args = encodeAbiParameters(
  [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint16' }, { type: 'address' }, { type: 'address' }, { type: 'uint32' }],
  [FACTORY, USDC, TREASURY, FEE_BPS, GATEWAY_WALLET, GATEWAY_MINTER, DOMAIN],
);
const initCode = creation + args.slice(2);
const initCodeHash = keccak256(initCode);

const domain = 'hold-e2e.example';
const salt = keccak256(toHex(domain));
const predicted = getContractAddress({ opcode: 'CREATE2', from: FACTORY, salt, bytecodeHash: initCodeHash });

const client = createPublicClient({ transport: http(RPC) });
const onchain = await client.readContract({
  address: FACTORY,
  abi: [{ name: 'predict', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] }],
  functionName: 'predict',
  args: [salt],
});

console.log(JSON.stringify({ factory: FACTORY, initCodeHash, domain, salt, predicted, onchain, match: predicted.toLowerCase() === onchain.toLowerCase() }, null, 2));
