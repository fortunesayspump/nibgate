"use client";

import { useEffect, useState } from "react";
import { NibgateTipCard, NibgateTipInline } from "@nibgate/wallet/react";
import { apiFetch } from "@/lib/api";

type TipResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

// Hub API for tip recording. Override per deployment:
// NEXT_PUBLIC_HUB_API_URL=https://api.nibgate.xyz (mainnet).
const HUB_API_BASE =
  (process.env.NEXT_PUBLIC_HUB_API_URL || 'https://testnet-api.nibgate.xyz').replace(/\/+$/, '');

// Full tip card wired to the site's recipient wallet (from /site).
export default function NibgateTip({ resource }: { resource: TipResource }) {
  const [recipient, setRecipient] = useState("");
  useEffect(() => {
    apiFetch<{ success: boolean; site: { recipientWallet?: string } }>("/site")
      .then((d) => {
        if (d?.site?.recipientWallet) setRecipient(d.site.recipientWallet);
      })
      .catch(() => {});
  }, []);
  return (
    <div>
      <NibgateTipCard resource={resource} recipient={recipient || undefined} apiBase={HUB_API_BASE} />
      {!recipient ? (
        <p className="small muted" style={{ marginTop: "0.5em", textAlign: "center" }}>
          The creator hasn&apos;t set a payout wallet yet — tipping unlocks in admin settings.
        </p>
      ) : null}
    </div>
  );
}

// Compact inline variant for lists and embeds.
export function NibgateTipRow({ resource }: { resource: TipResource }) {
  const [recipient, setRecipient] = useState("");
  useEffect(() => {
    apiFetch<{ success: boolean; site: { recipientWallet?: string } }>("/site")
      .then((d) => {
        if (d?.site?.recipientWallet) setRecipient(d.site.recipientWallet);
      })
      .catch(() => {});
  }, []);
  if (!recipient) return null;
  return <NibgateTipInline resource={resource} recipient={recipient} apiBase={HUB_API_BASE} />;
}
