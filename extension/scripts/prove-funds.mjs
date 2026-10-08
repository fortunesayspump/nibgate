// Offline proof (no network, no funds): the Gateway derivation matches viem
// exactly, and the Circle SDK client constructs for both Arc networks.
import { mnemonicToAccount } from 'viem/accounts';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { toHex } from 'viem';
import { GatewayClient } from '@circle-fin/x402-batching/client';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const viaViem = mnemonicToAccount(MNEMONIC).address;
const seed = mnemonicToSeedSync(MNEMONIC);
const key = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/0`).privateKey;
const { privateKeyToAccount } = await import('viem/accounts');
const viaScure = privateKeyToAccount(toHex(key)).address;

console.log('viem :', viaViem);
console.log('scure:', viaScure);
// The property gateway-funds.ts relies on (plus its runtime guard):
// scure derivation === viem account for the same mnemonic.
if (viaViem.toLowerCase() !== viaScure.toLowerCase()) throw new Error('DERIVATION MISMATCH');
const EXPECTED = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'; // both agree; locked as regression vector
if (viaViem.toLowerCase() !== EXPECTED.toLowerCase()) throw new Error('VECTOR CHANGED');

const testnet = new GatewayClient({ chain: 'arcTestnet', privateKey: toHex(key), rpcUrl: 'https://rpc.testnet.arc.io' });
const mainnet = new GatewayClient({ chain: 'arc', privateKey: toHex(key), rpcUrl: 'https://rpc.mainnet.arc.io' });
console.log('testnet client:', testnet.address, '| chain:', testnet.chainName, '| domain:', testnet.domain);
console.log('mainnet client:', mainnet.address, '| chain:', mainnet.chainName, '| domain:', mainnet.domain);
if (testnet.address.toLowerCase() !== EXPECTED.toLowerCase()) throw new Error('CLIENT ADDRESS MISMATCH');
console.log('PROVEN: derivation matches viem; SDK constructs on both Arc networks.');
