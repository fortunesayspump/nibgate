const { GatewayClient } = require('@circle-fin/x402-batching/client');
const { erc20Abi } = require('viem');

const BUYER_PK = process.env.BUYER_PK || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const RPC = process.env.RPC || 'https://rpc.testnet.arc.network';
const AMOUNT = process.env.AMOUNT || '6';

(async () => {
  const client = new GatewayClient({ chain: 'arcTestnet', privateKey: BUYER_PK, rpcUrl: RPC });
  console.log('buyer:', client.account.address, 'amount:', AMOUNT);
  const bal = await client.getUsdcBalance();
  console.log('eoabalance:', bal.formattedBalance, 'raw:', bal.balance.toString());

  const gw = client.chainConfig.gatewayWallet;
  console.log('gatewayWallet:', gw, 'usdc:', client.chainConfig.usdc);

  const allowance = await client.publicClient.readContract({
    address: client.chainConfig.usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [client.account.address, gw]
  });
  console.log('allowance to gateway:', allowance.toString());

  const result = await client.deposit(AMOUNT, {});
  console.log('deposit result:', result);
})();