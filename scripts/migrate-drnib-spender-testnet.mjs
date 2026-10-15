#!/usr/bin/env node
// Reclaim the V1 testnet float and fund V2. Idempotent: V1 is drained once.
import { createPublicClient, createWalletClient, erc20Abi, http } from '../backend/node_modules/viem/_esm/index.js';
import { privateKeyToAccount } from '../backend/node_modules/viem/_esm/accounts/index.js';

const key = process.env.ESCROW_KEEPER_KEY;
if (!key) throw new Error('ESCROW_KEEPER_KEY required');
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
const keeper = '0x796a0388B9C049481e69358cc08f162D19a0CD68';
if (account.address.toLowerCase() !== keeper.toLowerCase()) throw new Error('Signer is not testnet keeper');
const chain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } } };
const publicClient = createPublicClient({ chain, transport: http() });
if (await publicClient.getChainId() !== chain.id) throw new Error('Wrong chain');
const wallet = createWalletClient({ chain, transport: http(), account });
const usdc = '0x3600000000000000000000000000000000000000';
const oldSpender = '0x903b0606da40d99d78da9d9be6c435acacba5cf0';
const newSpender = '0x8F636a1aCb99d96746b657645E1d8F2864bff7DA';
const oldBalance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [oldSpender] });
const newBalance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [newSpender] });
console.log(JSON.stringify({ oldBalance: String(oldBalance), newBalance: String(newBalance), keeper: account.address }));
if (!process.argv.includes('--broadcast')) process.exit(0);
if (oldBalance === 0n) throw new Error('V1 has no balance to migrate; inspect V2 before retrying');
const withdrawAbi = [{ type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }];
const withdrawTx = await wallet.writeContract({ address: oldSpender, abi: withdrawAbi, functionName: 'withdraw', args: [keeper, oldBalance] });
const withdrawn = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
if (withdrawn.status !== 'success') throw new Error('V1 withdrawal failed');
const fundTx = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: 'transfer', args: [newSpender, oldBalance] });
const funded = await publicClient.waitForTransactionReceipt({ hash: fundTx });
if (funded.status !== 'success') throw new Error('V2 funding failed');
const remaining = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [oldSpender] });
const finalBalance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [newSpender] });
if (remaining !== 0n || finalBalance !== newBalance + oldBalance) throw new Error('Post-transfer balance mismatch');
console.log(JSON.stringify({ withdrawTx, fundTx, oldBalance: String(remaining), newBalance: String(finalBalance), verified: true }));
