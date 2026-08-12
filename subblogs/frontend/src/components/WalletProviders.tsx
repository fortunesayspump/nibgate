"use client";

import { NibgateWalletProvider } from "@nibgate/wallet/react";

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  return <NibgateWalletProvider>{children}</NibgateWalletProvider>;
}
