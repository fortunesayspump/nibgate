#!/usr/bin/env node
// Fund the verified V2 direct-tip mandate with a small mainnet operating float.
// Dry-run by default. The deployer key remains inside the Railway backend.
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, getAddress, http } from '../backend/node_modules/viem/_esm/index.js';
import { privateKeyToAccount } from '../backend/node_modules/viem/_esm/accounts/index.js';

const key = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('NIBGATE_DEPLOYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
const deployer = getAddress('0xcFb002E077d76F89148C5416e3CFAdaBfa12E69c');
if (getAddress(account.address) !== deployer) throw new Error('Signer differs from recorded deployer');
const rpc = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const chain = { id: 5042, name: 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const pub = createPublicClient({ chain, transport: http(rpc) });
if (await pub.getChainId() !== chain.id) throw new Error('RPC is not Arc mainnet');
const usdc = getAddress('0x3600000000000000000000000000000000000000');
const spender = getAddress('0xae39444c91aE8F0b8cF0642A18A521b6D312061B');
const amount = 50_000n; // 0.05 USDC, six ERC-20 decimals
const [senderBalance, spenderBalance, gasPrice] = await Promise.all([
  pub.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [deployer] }),
  pub.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [spender] }),
  pub.getGasPrice(),
]);
const gas = await pub.estimateContractGas({ account: deployer, address: usdc, abi: erc20Abi, functionName: 'transfer', args: [spender, amount] });
const gasBuffer = gas * gasPrice * 3n / 2n;
const nativeBalance = await pub.getBalance({ address: deployer });
console.log(JSON.stringify({ chainId: chain.id, from: deployer, to: spender, amountUSDC: '0.05', spenderBalanceUSDC: formatUnits(spenderBalance, 6), senderBalanceUSDC: formatUnits(senderBalance, 6), gasWithBufferUSDC: formatUnits(gasBuffer, 18), broadcast: process.argv.includes('--broadcast') }, null, 2));
if (senderBalance < amount || nativeBalance < gasBuffer + amount * 10n ** 12n) throw new Error('Insufficient value or gas');
if (spenderBalance !== 0n) throw new Error('Spender is already funded; inspect before adding more');
if (!process.argv.includes('--broadcast')) process.exit(0);
const wallet = createWalletClient({ chain, transport: http(rpc), account });
const tx = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: 'transfer', args: [spender, amount] });
const receipt = await pub.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== 'success') throw new Error('Funding transaction failed');
const finalBalance = await pub.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [spender] });
if (finalBalance !== amount) throw new Error('Spender balance does not equal funded amount');
console.log(JSON.stringify({ tx, spender, finalBalanceUSDC: formatUnits(finalBalance, 6), verified: true }));
