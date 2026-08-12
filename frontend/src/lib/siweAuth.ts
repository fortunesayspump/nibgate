import type { Address } from "viem";
import { signInWithSiwe as sharedSignInWithSiwe } from "@nibgate/wallet/react";

export type SiweSigner = (message: string) => Promise<`0x${string}`>;

export function signInWithSiwe(address: Address, signMessage: SiweSigner) {
  return sharedSignInWithSiwe(address, signMessage);
}
