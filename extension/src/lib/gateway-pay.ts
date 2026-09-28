// Circle Gateway (batched/EIP-3009) payment for the extension.
// Mirrors @nibgate/sdk's browser adapter so the extension and SDK sign the
// same payload shape. The signer is the embedded wallet's session account.
import { BatchEvmScheme } from '@circle-fin/x402-batching/client';

export type GatewaySigner = {
  address: string;
  signTypedData: (typedData: unknown) => Promise<string>;
};

function encodeBase64(value: unknown): string {
  const text = JSON.stringify(value);
  return btoa(unescape(encodeURIComponent(text)));
}

// Pick the Gateway batching acceptance from an x402 challenge.
export function selectGatewayRequirement(challenge: {
  accepts?: Array<{ extra?: { name?: string; version?: string; verifyingContract?: string }; network?: string }>;
}) {
  const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
  return (
    accepts.find((o) => {
      const extra = o.extra || {};
      return extra.name === 'GatewayWalletBatched' && extra.version === '1' && typeof extra.verifyingContract === 'string';
    }) || null
  );
}

export async function payGateway({
  challenge,
  signer,
}: {
  challenge: any;
  signer: GatewaySigner;
}): Promise<{ paymentSignature: string; accepted: any }> {
  if (!signer?.address || typeof signer.signTypedData !== 'function') {
    throw new Error('Gateway rail needs an unlocked embedded wallet.');
  }
  const accepted = selectGatewayRequirement(challenge);
  if (!accepted) throw new Error('Challenge has no Circle Gateway batching option.');
  const scheme = new BatchEvmScheme(signer as never);
  const x402Version = challenge.x402Version ?? 2;
  const paymentPayload = await scheme.createPaymentPayload(x402Version, accepted as never);
  const paymentSignature = encodeBase64({ ...(paymentPayload as object), resource: challenge.resource, accepted });
  return { paymentSignature, accepted };
}
