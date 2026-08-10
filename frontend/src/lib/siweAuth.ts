import type { Address } from "viem";
import { createSignInMessage } from "@nibgate/wallet";
import { nibshareApi } from "@/features/nibshare/api";

export type SiweSigner = (message: string) => Promise<`0x${string}`>;

export async function signInWithSiwe(address: Address, signMessage: SiweSigner) {
  const { nonce } = await nibshareApi.authNonce();
  const message = createSignInMessage({
    address,
    nonce,
    domain: window.location.host,
    uri: window.location.origin,
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  });
  const signature = await signMessage(message);
  await nibshareApi.authVerify({ message, signature });
  return { message, signature };
}
