const { recoverTypedDataAddress, getAddress } = require('viem');
const { GatewayClient } = require('@circle-fin/x402-batching/client');

const BUYER_PK = process.env.BUYER_PK || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const RPC = process.env.RPC || 'https://rpc.testnet.arc.network';
const GATEWAY = process.env.GATEWAY || 'https://gateway-api-testnet.circle.com';

const REQUIREMENTS = {
  scheme: 'exact',
  network: 'eip155:5042002',
  asset: '0x3600000000000000000000000000000000000000',
  amount: '5000000',
  payTo: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  maxTimeoutSeconds: 604900,
  extra: {
    name: 'GatewayWalletBatched',
    version: '1',
    verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
  }
};

(async () => {
  const client = new GatewayClient({ chain: 'arcTestnet', privateKey: BUYER_PK, rpcUrl: RPC });
  console.log('buyer:', client.account.address);

  const payload = await client.batchScheme.createPaymentPayload(2, REQUIREMENTS);
  const fullPayload = {
    x402Version: 2,
    resource: { url: '/', description: 'Unlock E2E Paid Playbook', mimeType: 'application/json' },
    accepted: REQUIREMENTS,
    payload: payload.payload
  };
  const auth = fullPayload.payload.authorization;
  console.log('authorization:', {
    from: auth.from,
    to: auth.to,
    value: auth.value,
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce
  });
  console.log('signature len:', fullPayload.payload.signature.length, 'prefix:', fullPayload.payload.signature.slice(0, 10));

  const recovered = await recoverTypedDataAddress({
    address: client.batchScheme.signer.address,
    domain: {
      name: 'GatewayWalletBatched',
      version: '1',
      chainId: 5042002,
      verifyingContract: getAddress(REQUIREMENTS.extra.verifyingContract)
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: getAddress(fullPayload.payload.authorization.from),
      to: getAddress(fullPayload.payload.authorization.to),
      value: BigInt(fullPayload.payload.authorization.value),
      validAfter: BigInt(fullPayload.payload.authorization.validAfter),
      validBefore: BigInt(fullPayload.payload.authorization.validBefore),
      nonce: fullPayload.payload.authorization.nonce
    },
    signature: fullPayload.payload.signature
  });
  console.log('recovered signer:', recovered, 'from:', client.account.address, 'MATCH:', recovered.toLowerCase() === client.account.address.toLowerCase());

  process.stdout.write('POST /v1/x402/verify ... ');
  const res = await fetch(`${GATEWAY}/v1/x402/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentPayload: fullPayload,
      paymentRequirements: REQUIREMENTS
    })
  });
  const text = await res.text();
  console.log(res.status);
  console.log(text.slice(0, 2000));
})();